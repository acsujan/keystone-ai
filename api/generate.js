import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { surveyData } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) throw new Error("Missing Google API Key");

    // Initialize correct client
    const ai = new GoogleGenerativeAI(apiKey);

    // --- TEXT GENERATION ---
    const textModel = ai.getGenerativeModel({
      model: "gemini-3-flash-preview"
    });

    const textPrompt = `
      Act as an architectural prompt engineer.
      Convert these user requirements into a single, detailed image generation prompt.
      User Input: ${JSON.stringify(surveyData)}
      Output ONLY the prompt text.
    `;

    const textResult = await textModel.generateContent(textPrompt);
    const optimizedPrompt = textResult.response.text().trim();

    console.log("Generated Prompt:", optimizedPrompt);

    // --- IMAGE GENERATION ---
    const imageModel = ai.getGenerativeModel({
      model: "gemini-3-pro-image-preview"
    });

    const imageResult = await imageModel.generateContent(optimizedPrompt, {
      responseMimeType: "image/jpeg"
    });

    const imageBase64 =
      imageResult.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;

    return res.status(200).json({
      success: true,
      prompt: optimizedPrompt,
      image: imageBase64
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
