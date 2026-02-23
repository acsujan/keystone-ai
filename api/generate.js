import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // 1. CORS Headers (Keep this for Vercel/Frontend communication)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { surveyData } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) throw new Error("API Key missing");

    // Initialize the NEW Client
    const ai = new GoogleGenAI({ apiKey });

    // --- STEP A: Text Generation (Gemini 3 Flash) ---
    // We use the new 'generateContent' syntax
    const textPrompt = `
      Act as an architectural prompt engineer. 
      Convert these user requirements into a SINGLE, detailed image generation prompt 
      optimized for photorealistic rendering.
      
      User Input: ${JSON.stringify(surveyData)}
      
      Output ONLY the prompt text. No markdown, no explanations.
    `;

    const textResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: textPrompt,
      config: {
        temperature: 0.7,
      }
    });

    // Extract text from the new response structure
    const optimizedPrompt = textResponse.candidates[0].content.parts[0].text.trim();
    console.log("Generated Prompt:", optimizedPrompt);

    // --- STEP B: Image Generation (Nano Banana Pro / Gemini 3 Pro Image) ---
    // The model ID for Nano Banana Pro is 'gemini-3-pro-image-preview'
    
    let finalImageBase64 = null;

    try {
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: optimizedPrompt,
        config: {
          // Standard params for image models in the new SDK
          responseMimeType: 'image/jpeg' 
        }
      });

      // The new SDK returns the image data in the 'parts' array as 'inlineData'
      const imagePart = imageResponse.candidates[0].content.parts[0];
      
      if (imagePart.inlineData && imagePart.inlineData.data) {
        finalImageBase64 = imagePart.inlineData.data;
      } else {
        console.error("No inline data found in image response");
      }

    } catch (imgError) {
      console.error("Image Gen Failed:", imgError.message);
      // Fallback: If Pro is restricted, try the standard Nano Banana
      // console.log("Retrying with Standard Nano Banana...");
      // ... (Optional retry logic here)
    }

    if (!finalImageBase64) {
      return res.status(200).json({
        success: true,
        prompt: optimizedPrompt,
        image: null,
        warning: "Image generation failed or returned no data. Prompt was generated."
      });
    }

    return res.status(200).json({
      success: true,
      prompt: optimizedPrompt,
      image: finalImageBase64
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
