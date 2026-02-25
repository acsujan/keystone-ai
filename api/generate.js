import { GoogleGenAI } from "@google/genai";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method Not Allowed" });

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const body = req.body ?? {};
    const { surveyData, passkey, refinementInput } = body;

    // --- SECURE AUTH LOGIC ---
    const basicKeys = (process.env.VALID_PASSKEYS || "").split(",").map(k => k.trim()).filter(k => k);
    const premiumKeys = (process.env.VALID_PASSKEYS_PREMIUM || "").split(",").map(k => k.trim()).filter(k => k);
    const allValidKeys = [...basicKeys, ...premiumKeys];

    if (!allValidKeys.includes(passkey)) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid Passkey" });
    }
    
    if (!apiKey) return res.status(500).json({ success: false, message: "Missing API Key" });

    const ai = new GoogleGenAI({ apiKey });

    // --- USA COST LOGIC (UPDATED FOR NARROW, SMART ESTIMATES) ---
    const locationStr = surveyData?.location || "";
    const isUSA = /usa|united states|america|us\b/i.test(locationStr);
    
    let pricingInstruction = "";
    if (isUSA && surveyData?.totalArea) {
        pricingInstruction = `
        - You are an expert US construction estimator.
        - The user specified a Total Floor Area of ${surveyData.totalArea} sq ft in the specific location of: ${surveyData.location}.
        - 1. Determine the accurate base cost-per-square-foot for THAT exact local market (e.g., suburban/rural areas are cheaper, major metros or coastal areas are premium).
        - 2. Adjust this base rate based on the structural materials: ${surveyData.materials} (Wood framing is standard/cheaper; Exposed Concrete, Glass, and Steel are highly expensive).
        - 3. Further adjust the rate based on the implied quality of finishes in the user's description (standard vs. luxury/custom).
        - 4. Calculate the total cost: (Area * Final Adjusted Rate).
        - 5. Provide a NARROW, highly realistic cost range (e.g., a 10% to 15% variance maximum, NOT a massive gap. Example: $425,000 - $475,000).
        - Output the "costRange" strictly as "$X - $Y".
        `;
    } else {
        pricingInstruction = `
        - The location is NOT clearly USA or Area is missing.
        - Do NOT attempt to guess a price in dollars.
        - Set "costRange" to "N/A - Location/Area Required".
        `;
    }

    // --- DYNAMIC FLOOR PLAN LOGIC ---
    const storiesStr = surveyData?.stories || "1 Story";
    const isTwoStory = storiesStr.includes("2");
    
    const visualLayoutInstruction = isTwoStory 
      ? "On the right half: EXACTLY TWO detailed architectural floor plans (First Floor and Second Floor) stacked vertically."
      : "On the right half: EXACTLY ONE detailed architectural floor plan.";

    // 1. Intelligence Prompt - CREATIVE LICENSE + STRICT ENFORCEMENT
    let baseInstruction = `
Act as a Master Architect and Expert AI Prompt Engineer.
You must output a strictly formatted JSON object.

USER'S EXPLICIT REQUIREMENTS:
- Location: ${surveyData?.location || "Unspecified"}
- Area: ${surveyData?.totalArea || "Unspecified"} sq ft
- Layout: ${surveyData?.stories || "1 Story"}, ${surveyData?.bedrooms || "3 Beds"}, ${surveyData?.bathrooms || "2 Baths"}
- Materials/Style: ${surveyData?.materials || "Modern"}
- Specific Features: ${surveyData?.features || "None specified"}
${refinementInput ? `\nUSER REFINEMENT (MUST APPLY): "${refinementInput}"` : ""}

CORE DIRECTIVES:
1. ABSOLUTE TRUTH: The user's explicit requirements are non-negotiable constraints. You MUST include their specific features, room counts, materials, and location context.
2. FILL IN THE GAPS: Users often provide very short descriptions. As the Master Architect, it is YOUR job to flesh out the design. Invent beautiful, cohesive architectural details, landscaping, lighting, facade textures, and layout configurations that perfectly complement the user's brief. Make the resulting image prompt highly detailed, professional, and photorealistic.

INSTRUCTIONS FOR THE IMAGE PROMPT:
Write a highly descriptive prompt for an AI image generator to create a single, wide presentation board.
1. The image MUST be split down the middle.
2. On the left half: A photorealistic, highly detailed 3D exterior render. Showcase the user's exact materials/location, plus the rich, cohesive details you invented to fill in the gaps.
3. ${visualLayoutInstruction} The floor plan(s) MUST be top-down blueprints with clean black lines on a white background, clearly showing rooms that match the requested Beds/Baths and accommodating any user-requested features.

INSTRUCTIONS FOR FEASIBILITY BRIEF:
1. ${pricingInstruction}
2. Estimate construction timeline.
3. List 3 key material recommendations based on the design.

OUTPUT FORMAT (JSON ONLY - NO MARKDOWN):
{
  "imagePrompt": "A single wide architectural presentation board. On the left half: a photorealistic 3D exterior render of a [materials] house in [location]. [Add highly detailed descriptions of the architecture, lighting, and landscaping you designed to fill the gaps, ensuring user features are included]. ${visualLayoutInstruction} The floor plans show [rooms/beds/baths]. Clean architectural style.",
  "brief": {
    "costRange": "$X - $Y", 
    "timeline": "X - Y Months",
    "materials": ["Material 1", "Material 2", "Material 3"]
  }
}
`.trim();

    // 2. Generate Text 
    const textResp = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: baseInstruction,
    });

    // --- JSON CLEANUP FIX ---
    let rawText = textResp?.text || "{}";
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
        parsedData = JSON.parse(rawText);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        parsedData = { 
            imagePrompt: `A single wide architectural presentation board. On the left half: a photorealistic 3D exterior render of a ${surveyData?.materials} house in ${surveyData?.location}. Features include ${surveyData?.features}. ${visualLayoutInstruction} The floor plans show ${surveyData?.bedrooms} and ${surveyData?.bathrooms}.`,
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
