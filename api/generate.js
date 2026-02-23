import { GoogleGenAI } from "@google/genai";

// (Optional but recommended) Force Node.js runtime on Vercel.
// If you also add vercel.json, you can remove this.
export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  // Basic CORS (safe even if you don't need it)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    console.log("STEP 1: /api/generate hit");

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.log("STEP 1b: Missing GOOGLE_API_KEY");
      return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });
    }

    // Vercel often provides parsed req.body when Content-Type is application/json
    // but we guard anyway.
    const body = req.body ?? {};
    const surveyData = body.surveyData;

    if (!surveyData) {
      console.log("STEP 1c: Missing surveyData");
      return res.status(400).json({ success: false, message: "Missing surveyData" });
    }

    console.log("STEP 2: Initializing GoogleGenAI client");
    const ai = new GoogleGenAI({ apiKey });

    // 1) Generate an optimized prompt
    const promptEngineerInstruction = `
Act as an architectural prompt engineer.
Convert these user requirements into a single, detailed image generation prompt.
User Input: ${JSON.stringify(surveyData)}
Output ONLY the prompt text.
`.trim();

    console.log("STEP 3: Generating prompt text");
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: promptEngineerInstruction,
    });

    const optimizedPrompt = (textResp?.text || "").trim();
    if (!optimizedPrompt) {
      console.log("STEP 3b: Empty optimized prompt");
      return res.status(500).json({
        success: false,
        message: "Prompt generation returned empty text",
        debug: { text: textResp?.text ?? null },
      });
    }

    // 2) Generate image
    console.log("STEP 4: Generating image");
    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: optimizedPrompt,
    });

    // Find the first inlineData part (image bytes)
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

    if (!imageBase64) {
      console.log("STEP 4b: No inlineData returned", { partsCount: parts.length });
      return res.status(500).json({
        success: false,
        message: "No image returned (no inlineData part).",
        debugText: imgResp?.text ?? null,
      });
    }

    console.log("STEP 5: Success - returning image");
    return res.status(200).json({
      success: true,
      prompt: optimizedPrompt,
      image: imageBase64,
      mimeType,
    });
  } catch (err) {
    console.error("Generate API error (full):", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
}
