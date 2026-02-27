const { GoogleGenAI } = require("@google/genai");

// We will call our own endpoints as functions directly by requiring them.
const planHandler = require("./plan");
const renderHandler = require("./render");

// helper to run a handler internally without HTTP
function runHandler(handler, body) {
  return new Promise((resolve) => {
    const req = { method: "POST", body };
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) { resolve({ status: this.statusCode || 200, payload }); },
      end() { resolve({ status: this.statusCode || 200, payload: null }); }
    };
    handler(req, res);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });

    const body = req.body ?? {};
    const { surveyData, passkey, refinementInput } = body;

    // --- AUTH (same pattern as your current code) ---
    const basicKeys = (process.env.VALID_PASSKEYS || "").split(",").map(k => k.trim()).filter(Boolean);
    const premiumKeys = (process.env.VALID_PASSKEYS_PREMIUM || "").split(",").map(k => k.trim()).filter(Boolean);
    const allValidKeys = [...basicKeys, ...premiumKeys];
    if (!allValidKeys.includes(passkey)) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid Passkey" });
    }

    // 1) Generate Plan (deterministic SVG->PNG)
    const planRes = await runHandler(planHandler, { surveyData });
    if (!planRes.payload?.success) {
      return res.status(planRes.status || 500).json(planRes.payload || { success: false, message: "Plan failed" });
    }

    // 2) Generate 3D Render conditioned on plan image
    const renderRes = await runHandler(renderHandler, {
      surveyData: {
        ...surveyData,
        // apply refinement text to style/materials/features (simple MVP)
        features: refinementInput ? `${surveyData?.features || ""}. Refinement: ${refinementInput}` : (surveyData?.features || "")
      },
      planImageBase64: planRes.payload.planImage
    });

    if (!renderRes.payload?.success) {
      return res.status(renderRes.status || 500).json(renderRes.payload || { success: false, message: "Render failed" });
    }

    // Return BOTH images separately for frontend display
    return res.status(200).json({
      success: true,
      // 2D plan
      planImage: planRes.payload.planImage,
      planMimeType: planRes.payload.planMimeType,
      planSpec: planRes.payload.planSpec,

      // 3D render
      image: renderRes.payload.image,
      mimeType: renderRes.payload.mimeType,

      // Keep compatibility fields for your UI logic
      isRefined: !!refinementInput,
      prompt: "2-step: PlanSpec->SVG->PNG + Render conditioned on plan image",
      brief: null
    });
  } catch (err) {
    console.error("GENERATE error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};
