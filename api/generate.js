import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
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

    const body = req.body ?? {};
    const surveyData = body.surveyData;

    if (!surveyData) {
      console.log("STEP 1c: Missing surveyData");
      return res.status(400).json({ success: false, message: "Missing surveyData" });
    }

    console.log("STEP 2: Initializing GoogleGenAI client");
    const ai = new GoogleGenAI({ apiKey });

    // --- UPDATED PROMPT ENGINEER INSTRUCTIONS ---
    const promptEngineerInstruction = `
Act as a master architectural prompt engineer.
Convert the following user requirements into a single, highly detailed image generation prompt.

CRITICAL COMPOSITION INSTRUCTIONS:
You must explicitly command the image generator to create an ultra-wide, side-by-side composite image.
- LEFT SIDE: A photorealistic, high-end 3D exterior render of the house. It must accurately reflect the specific geographic location, terrain, and weather context provided.
- RIGHT SIDE: A clean, professional 2D architectural floor plan layout that corresponds logically to the 3D render.
- Ensure the materials, number of stories, and special features are visually represented.

User Requirements: ${JSON.stringify(surveyData)}

Output ONLY the final image generation prompt text. Do not include any conversational filler.
`.trim();

    console.log("STEP 3: Generating prompt text");
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Kept exactly as you had it
      contents: promptEngineerInstruction,
    });

    const optimizedPrompt = (textResp?.text || "").trim();
    if (!optimizedPrompt) {
      return res.status(500).json({ success: false, message: "Prompt generation returned empty text" });
    }

    // 2) Generate image
    console.log("STEP 4: Generating image");
    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview", // Kept exactly as you had it
      contents: optimizedPrompt,
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

    if (!imageBase64) {
      return res.status(500).json({ success: false, message: "No image returned." });
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
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
}
