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
    const apiKey = process.env.GOOGLE_API_KEY;
    const body = req.body ?? {};
    const { surveyData, passkey, refinementInput } = body;

    // Passkey Validation
    const validKeysString = process.env.VALID_PASSKEYS || "KEYSTONE-BETA";
    const validKeys = validKeysString.split(",").map(k => k.trim());
    if (!validKeys.includes(passkey)) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid Passkey" });
    }

    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });

    const ai = new GoogleGenAI({ apiKey });

    // 1. Intelligence Prompt
    let baseInstruction = `
Act as a Senior Architectural Project Manager.
You must output a strictly formatted JSON object containing two parts: an image generation prompt and a feasibility brief.

INPUT DATA:
${refinementInput ? `REFINEMENT REQUEST: "${refinementInput}"` : `USER REQUIREMENTS: ${JSON.stringify(surveyData)}`}

INSTRUCTIONS:
1. Analyze the location, size, and materials.
2. Estimate a construction cost range (High/Low) based on 2025 US market rates.
3. Estimate a construction timeline.
4. List 3 key material recommendations.
5. Create the image prompt for a side-by-side 3D Render (Left) and Floor Plan (Right).

OUTPUT FORMAT (JSON ONLY - NO MARKDOWN):
{
  "imagePrompt": "The detailed image generation prompt text...",
  "brief": {
    "costRange": "$X - $Y (Estimated)",
    "timeline": "X - Y Months",
    "materials": ["Material 1", "Material 2", "Material 3"],
    "notes": "Short feasibility note."
  }
}
`.trim();

    // 2. Generate
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: baseInstruction,
    });

    // --- JSON CLEANUP FIX ---
    let rawText = textResp?.text || "{}";
    // Remove markdown code blocks if Gemini adds them
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
        parsedData = JSON.parse(rawText);
    } catch (e) {
        console.error("JSON Parse Error:", e, "Raw Text:", rawText);
        // Fallback so the app doesn't crash, just missing the brief
        parsedData = { 
            imagePrompt: `Architectural house in ${surveyData?.location || "modern style"}, side by side 3D render and floor plan.`,
            brief: null 
        };
    }

    // 3. Generate Image
    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: parsedData.imagePrompt,
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
      prompt: parsedData.imagePrompt,
      brief: parsedData.brief, 
      image: imageBase64,
      mimeType,
      isRefined: !!refinementInput
    });

  } catch (err) {
    console.error("Generate API error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
}
