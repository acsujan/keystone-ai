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

    // 1. Construct the Intelligence Prompt
    let baseInstruction = `
Act as a Senior Architectural Project Manager.
You must output a strictly formatted JSON object containing two parts: an image generation prompt and a feasibility brief.

INPUT DATA:
${refinementInput ? `REFINEMENT REQUEST: "${refinementInput}"` : `USER REQUIREMENTS: ${JSON.stringify(surveyData)}`}

INSTRUCTIONS:
1. Analyze the location, size, and materials.
2. Estimate a construction cost range (High/Low) based on 2025 US market rates for that specific location.
3. Estimate a construction timeline.
4. List 3 key material recommendations.
5. Create the image prompt for a side-by-side 3D Render (Left) and Floor Plan (Right).

OUTPUT FORMAT (JSON ONLY):
{
  "imagePrompt": "The detailed image generation prompt text...",
  "brief": {
    "costRange": "$X - $Y (Estimated)",
    "timeline": "X - Y Months",
    "materials": ["Material 1", "Material 2", "Material 3"],
    "notes": "A short, professional note about site feasibility or zoning based on the location."
  }
}
`.trim();

    // 2. Generate The Intelligence & Prompt
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: baseInstruction,
      generationConfig: { responseMimeType: "application/json" } // Force JSON
    });

    const rawText = textResp?.text || "{}";
    let parsedData;
    try {
        parsedData = JSON.parse(rawText);
    } catch (e) {
        // Fallback if model didn't output perfect JSON
        console.error("JSON Parse Error", e);
        return res.status(500).json({ success: false, message: "Failed to generate project brief." });
    }

    // 3. Generate The Image
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
      brief: parsedData.brief, // Return the intelligence data
      image: imageBase64,
      mimeType,
      isRefined: !!refinementInput
    });

  } catch (err) {
    console.error("Generate API error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
}
