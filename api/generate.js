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
    // 1. Security Check
    const apiKey = process.env.GOOGLE_API_KEY;
    const body = req.body ?? {};
    const { surveyData, passkey, refinementInput } = body; // Extract refinementInput
    
    // Passkey Validation
    const validKeysString = process.env.VALID_PASSKEYS || "KEYSTONE-BETA";
    const validKeys = validKeysString.split(",").map(k => k.trim());
    if (!validKeys.includes(passkey)) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid Passkey" });
    }

    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });
    if (!surveyData) return res.status(400).json({ success: false, message: "Missing surveyData" });

    // 2. Initialize AI
    const ai = new GoogleGenAI({ apiKey });

    // 3. Construct the Prompt Engineering Instruction
    let baseInstruction = `
Act as a master architectural prompt engineer.
Convert user requirements into a SINGLE, highly detailed image generation prompt.

CRITICAL COMPOSITION INSTRUCTIONS:
You must explicitly command the image generator to create an ultra-wide (16:6 aspect ratio), side-by-side composite image.
- LEFT SIDE: A photorealistic, high-end 3D exterior render of the house.
- RIGHT SIDE: A clean, professional 2D architectural floor plan layout that corresponds logically to the 3D render.
- Ensure the materials, number of stories, and special features are visually represented.
`.trim();

    // If this is a refinement, we add specific instructions to MODIFY the previous concept
    if (refinementInput) {
        baseInstruction += `\n\n
*** REFINEMENT MODE ACTIVE ***
The user wants to MODIFY their previous concept based on this feedback: "${refinementInput}".
- Keep the core structure (Location: ${surveyData.location}, Size: ${surveyData.lotSize}) mostly the same.
- APPLY the user's specific changes to the style, materials, or features.
- The output must still be a side-by-side 3D render and floor plan.
`.trim();
    } else {
        baseInstruction += `\n\nUser Requirements: ${JSON.stringify(surveyData)}`;
    }

    baseInstruction += `\n\nOutput ONLY the final image generation prompt text.`;

    // 4. Generate Prompt
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: baseInstruction,
    });
    const optimizedPrompt = (textResp?.text || "").trim();

    if (!optimizedPrompt) return res.status(500).json({ success: false, message: "Prompt generation failed" });

    // 5. Generate Image
    const imgResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
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

    if (!imageBase64) return res.status(500).json({ success: false, message: "No image returned." });

    return res.status(200).json({
      success: true,
      prompt: optimizedPrompt,
      image: imageBase64,
      mimeType,
      isRefined: !!refinementInput // Return flag so frontend knows it was a refinement
    });

  } catch (err) {
    console.error("Generate API error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
}
