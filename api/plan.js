const { GoogleGenAI } = require("@google/genai");
const { validatePlanSpec } = require("../lib/validatePlan");
const { renderPlanSvg } = require("../lib/renderPlanSvg");
const { svgToPngBase64 } = require("../lib/svgToPng");
const planSchema = require("../lib/planSchema.json");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });

    const { surveyData } = req.body ?? {};
    const ai = new GoogleGenAI({ apiKey });

    const stories = String(surveyData?.stories || "1 Story").includes("2") ? 2 : 1;
    const beds = String(surveyData?.bedrooms || "3 Bed");
    const baths = String(surveyData?.bathrooms || "2 Bath");
    const totalArea = surveyData?.totalArea ? Number(surveyData.totalArea) : null;

    const prompt = `
You are an architect producing a strict JSON floor plan specification.

Hard constraints:
- stories: ${stories}
- bedrooms: ${beds}
- bathrooms: ${baths}
- totalAreaSqFt: ${totalArea ?? "unspecified"}
- features to include if requested: ${surveyData?.features || "none"}

Output must follow this JSON schema exactly (no markdown, JSON only).
Rooms are rectangles only. No overlaps. Rooms must fit within each level width/height.

Guidance:
- Use a simple rectangular overall footprint.
- Ensure bedrooms and bathrooms count exactly.
- Include common rooms: living, kitchen, dining, entry, hall.
- If 2 stories: place most bedrooms on level 2; living/kitchen/dining on level 1.
- If features mention "garage": add a garage room on level 1.

Return JSON only.
    `.trim();

    // If your @google/genai version supports schema/responseMimeType, use it.
    // Otherwise, we still parse/repair.
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
      // responseMimeType: "application/json",
      // responseSchema: planSchema,
    });

    let raw = (textResp?.text || "").trim().replace(/```json/g, "").replace(/```/g, "").trim();
    let planSpec = JSON.parse(raw);

    // Validate + one repair attempt
    let errors = validatePlanSpec(planSpec, surveyData);
    if (errors.length) {
      const repairPrompt = `
Your JSON failed validation:
${errors.map(e => `- ${e}`).join("\n")}

Fix the JSON to satisfy constraints. Keep rooms rectangular and non-overlapping.
Return JSON ONLY.

Schema:
${JSON.stringify(planSchema)}

Bad JSON:
${JSON.stringify(planSpec)}
      `.trim();

      const repairResp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: repairPrompt
      });

      let fixed = (repairResp?.text || "").trim().replace(/```json/g, "").replace(/```/g, "").trim();
      planSpec = JSON.parse(fixed);

      errors = validatePlanSpec(planSpec, surveyData);
      if (errors.length) {
        return res.status(422).json({ success: false, message: "Plan validation failed", errors });
      }
    }

    // Render SVG (fixed scale) -> PNG
    const svg = renderPlanSvg(planSpec, { pxPerUnit: 18, padding: 24, gap: 48 });

    // optional: normalize output width for consistent UI
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
