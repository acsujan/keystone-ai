import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // CORS (optional if same-origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY; // make sure this matches Vercel exactly
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });

    const { surveyData } = req.body ?? {};
    if (!surveyData) return res.status(400).json({ success: false, message: "Missing surveyData" });

    const ai = new GoogleGenAI({ apiKey });

    // 1) Generate an optimized prompt (text model)
    const textPrompt = `
Act as an architectural prompt engineer.
Convert these user requirements into a single, detailed image generation prompt.
User Input: ${JSON.stringify(surveyData)}
Output ONLY the prompt text.
`.trim();

    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: textPrompt,
    });

    const optimizedPrompt = (textResp.text || "").trim();
    if (!optimizedPrompt) {
      return res.status(500).json({ success: false, message: "Prompt generation returned empty text" });
    }

    // 2) Generate image (native image model)
    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: optimizedPrompt,
    });

    // Find the inline image part
    let imageBase64 = null;
    let mimeType = null;

    for (const part of imgResp?.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
        break;
      }
    }

    if (!imageBase64) {
      // Useful debug: sometimes the model returns only text if it can’t/doesn’t generate an image
      return res.status(500).json({
        success: false,
        message: "No image returned (no inlineData part).",
        debugText: imgResp?.text ?? null,
      });
    }

    return res.status(200).json({
      success: true,
      prompt: optimizedPrompt,
      image: imageBase64,
      mimeType,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
}
