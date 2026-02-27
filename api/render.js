const { GoogleGenAI } = require("@google/genai");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });

    const { surveyData, planImageBase64 } = req.body ?? {};
    if (!planImageBase64) return res.status(400).json({ success: false, message: "Missing plan image" });

    const ai = new GoogleGenAI({ apiKey });

    const renderPrompt = `
Create a photorealistic 3D exterior render of a residential home.

The attached image is the ground-truth FLOOR PLAN footprint/layout.
Hard rules:
- Do not add extra wings/footprint beyond the plan.
- Keep garage placement consistent if a garage exists.
- The number of stories must match: ${surveyData?.stories || "1 Story"}.

Style/materials: ${surveyData?.materials || "Modern"}.
Location/context: ${surveyData?.location || "Unspecified"}.
Include realistic landscaping, driveway if garage, and windows aligned logically to rooms.

Camera: eye-level 3/4 view, high detail, realistic lighting.
    `.trim();

    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: renderPrompt },
            {
              inlineData: {
                data: planImageBase64,
                mimeType: "image/png"
              }
            }
          ]
        }
      ]
    });

    let imageBase64 = null;
    let mimeType = null;
    const parts = imgResp?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
        break;
      }
    }

    if (!imageBase64) return res.status(500).json({ success: false, message: "No image returned." });

    return res.status(200).json({
      success: true,
      image: imageBase64,
      mimeType
    });
  } catch (err) {
    console.error("RENDER error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};
