export default async function handler(req, res) {
  // 1. Enable CORS (Allows your GitHub Page to talk to this Vercel Server)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, replace '*' with your GitHub URL
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle the "pre-flight" check that browsers send
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { surveyData } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Server missing API Key' });
    }

    // --- STEP A: Refine the Prompt (Gemini 1.5 Pro) ---
    // We send the user's simple answers to Gemini to get a "Pro" prompt.
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
    
    const systemInstruction = `
      You are an expert architectural photographer and 3D artist. 
      Convert the following user requirements into a highly detailed, 
      photorealistic image generation prompt for Imagen 3. 
      Focus on lighting, material textures, and camera angle.
      Output ONLY the raw prompt text, no intro or outro.
    `;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemInstruction}\n\nUser Requirements: ${JSON.stringify(surveyData)}` }]
        }]
      })
    });

    const geminiData = await geminiResponse.json();
    
    // Safety check: Did Gemini fail?
    if (!geminiData.candidates || !geminiData.candidates[0]) {
      throw new Error("Failed to generate prompt from Gemini");
    }

    const optimizedPrompt = geminiData.candidates[0].content.parts[0].text;


    // --- STEP B: Generate the Image (Imagen 3) ---
    // Note: If your API key doesn't have Imagen access yet, this step might fail. 
    // We try to use the standard Imagen endpoint.
    
    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const imageResponse = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: optimizedPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "4:3" // Best for architectural shots
        }
      })
    });

    const imageData = await imageResponse.json();

    // Check if image generation worked
    let finalImage = null;
    if (imageData.predictions && imageData.predictions[0]) {
        // Imagen returns a base64 string. We'll send this back to the frontend.
        finalImage = imageData.predictions[0].bytesBase64Encoded;
    } else {
        console.error("Image Gen Failed:", JSON.stringify(imageData));
        // Fallback: If image fails, return the text prompt so you can at least see it works
        return res.status(200).json({ 
            success: false, 
            message: "Image generation failed (Check API access), but prompt was created.",
            debugPrompt: optimizedPrompt 
        });
    }

    // Success! Return the image data.
    return res.status(200).json({ 
        success: true, 
        image: finalImage,
        prompt: optimizedPrompt
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
