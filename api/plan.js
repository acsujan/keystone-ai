// api/plan.js (CommonJS)
//aa
module.exports.config = { runtime: "nodejs" };

const { GoogleGenAI } = require("@google/genai");
const { validatePlanSpec } = require("../lib/validatePlan");
const { renderPlanSvg } = require("../lib/renderPlanSvg");
const { svgToPngBase64 } = require("../lib/svgToPng");
const planSchema = require("../lib/planSchema.json");

function extractJson(text) {
  if (!text) return null;

  // Remove code fences if present
  let t = String(text).trim().replace(/```json/gi, "").replace(/```/g, "").trim();

  // If the model returns extra text around JSON, extract first {...} block
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }

  return t;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });

    const { surveyData } = req.body || {};
    if (!surveyData || typeof surveyData !== "object") {
      return res.status(400).json({ success: false, message: "Missing surveyData" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const stories = String(surveyData?.stories || "1 Story").includes("2") ? 2 : 1;
    const bedsStr = String(surveyData?.bedrooms || "3 Bed");
    const bathsStr = String(surveyData?.bathrooms || "2 Bath");
    const totalArea = surveyData?.totalArea ? Number(surveyData.totalArea) : null;

    const prompt = `
You are an architect producing a STRICT JSON floor plan specification.

Hard constraints:
- stories: ${stories}
- bedrooms: ${bedsStr}
- bathrooms: ${bathsStr}
- totalAreaSqFt: ${totalArea ?? "unspecified"}
- features to include if requested: ${surveyData?.features || "none"}

Output must follow this JSON schema exactly (no markdown, JSON only).
Rooms are rectangles only. No overlaps. Rooms must fit within each level width/height.

Guidance:
- Use a simple rectangular overall footprint for each level.
- Ensure bedroom and bathroom counts match exactly.
- Include common rooms: living, kitchen, dining, entry, hall.
- If 2 stories: place most bedrooms on level 2; living/kitchen/dining on level 1.
- If features mention "garage": add a garage room on level 1.

Return JSON only.
Schema:
${JSON.stringify(planSchema)}
    `.trim();

    // 1) Generate PlanSpec JSON
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });

    const raw = extractJson(textResp?.text);
    if (!raw) {
      return res.status(500).json({ success: false, message: "Model returned empty plan spec" });
    }

    let planSpec;
    try {
      planSpec = JSON.parse(raw);
    } catch (e) {
      return res.status(422).json({
        success: false,
        message: "Plan JSON parse failed",
        error: e?.message || String(e),
        raw: raw.slice(0, 2000)
      });
    }

    // 2) Validate + one repair attempt
    let errors = validatePlanSpec(planSpec, surveyData);

    if (errors.length) {
      const repairPrompt = `
Your JSON failed validation:
${errors.map((e) => `- ${e}`).join("\n")}

Fix the JSON to satisfy constraints. Keep rooms rectangular and non-overlapping.
Return JSON ONLY. No markdown.

Schema:
${JSON.stringify(planSchema)}

Bad JSON:
${JSON.stringify(planSpec)}
      `.trim();

      const repairResp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: repairPrompt
      });

      const fixedRaw = extractJson(repairResp?.text);
      if (!fixedRaw) {
        return res.status(422).json({ success: false, message: "Repair attempt returned empty JSON", errors });
      }

      try {
        planSpec = JSON.parse(fixedRaw);
      } catch (e) {
        return res.status(422).json({
          success: false,
          message: "Repair JSON parse failed",
          error: e?.message || String(e),
          raw: fixedRaw.slice(0, 2000)
        });
      }

      errors = validatePlanSpec(planSpec, surveyData);
      if (errors.length) {
        return res.status(422).json({ success: false, message: "Plan validation failed", errors });
      }
    }

    // 3) Render SVG (fixed scale) -> PNG base64
    // Fixed-scale params are your "always consistent" plan scale.
    const svg = renderPlanSvg(planSpec, { pxPerUnit: 18, padding: 24, gap: 48 });

    // Normalize output width for consistent UI
    const planPngBase64 = await svgToPngBase64(svg, 1600);

    return res.status(200).json({
      success: true,
      planSpec,
      planSvg: svg,
      planImage: planPngBase64,
      planMimeType: "image/png"
    });
  } catch (err) {
    console.error("PLAN error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};
