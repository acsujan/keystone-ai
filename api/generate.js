// api/generate.js (CommonJS)
//aacode
module.exports.config = { runtime: "nodejs" };

const planHandler = require("./plan");
const renderHandler = require("./render");

// Helper to run a handler internally without HTTP.
// Supports handlers that are sync or async, and that call res.json/res.send/res.end.
function runHandler(handler, body) {
  return new Promise((resolve) => {
    const req = { method: "POST", body };

    const res = {
      headers: {},
      statusCode: 200,

      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode || 200, payload });
      },
      send(payload) {
        resolve({ status: this.statusCode || 200, payload });
      },
      end() {
        resolve({ status: this.statusCode || 200, payload: null });
      }
    };

    // Execute handler and catch thrown errors (sync or async)
    Promise.resolve(handler(req, res)).catch((err) => {
      resolve({
        status: 500,
        payload: { success: false, message: err?.message || "Internal handler error" }
      });
    });
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const { surveyData, passkey, refinementInput } = body;

    if (!surveyData || typeof surveyData !== "object") {
      return res.status(400).json({ success: false, message: "Missing surveyData" });
    }

    // --- AUTH ---
    const basicKeys = (process.env.VALID_PASSKEYS || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const premiumKeys = (process.env.VALID_PASSKEYS_PREMIUM || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const allValidKeys = [...basicKeys, ...premiumKeys];

    if (!allValidKeys.includes(passkey)) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid Passkey" });
    }

    // Ensure GOOGLE_API_KEY exists (plan/render will also likely need it)
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });
    }

    // 1) Generate Plan (deterministic SVG->PNG)
    const planRes = await runHandler(planHandler, { surveyData });

    if (!planRes.payload || planRes.payload.success !== true) {
      const message = planRes.payload?.message || "Plan failed";
      return res.status(planRes.status || 500).json({ success: false, message, details: planRes.payload });
    }

    // 2) Generate 3D Render conditioned on plan image
    const mergedSurveyData = {
      ...surveyData,
      features: refinementInput
        ? `${surveyData.features || ""}. Refinement: ${refinementInput}`
        : (surveyData.features || "")
    };

    const renderRes = await runHandler(renderHandler, {
      surveyData: mergedSurveyData,
      planImageBase64: planRes.payload.planImage
    });

    if (!renderRes.payload || renderRes.payload.success !== true) {
      const message = renderRes.payload?.message || "Render failed";
      return res.status(renderRes.status || 500).json({ success: false, message, details: renderRes.payload });
    }

    // Response contract for frontend
    return res.status(200).json({
      success: true,

      // 2D plan
      planImage: planRes.payload.planImage,
      planMimeType: planRes.payload.planMimeType || "image/png",
      planSpec: planRes.payload.planSpec || null,

      // 3D render
      image: renderRes.payload.image,
      mimeType: renderRes.payload.mimeType || "image/png",

      // UI flags
      isRefined: !!refinementInput,
      prompt: "2-step: PlanSpec->SVG->PNG + Render conditioned on plan image",
      brief: renderRes.payload.brief || null
    });
  } catch (err) {
    console.error("GENERATE error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }

};

