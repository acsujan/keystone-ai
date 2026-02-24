export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { passkey } = req.body || {};
  
  // We will check against an environment variable. 
  // If it's not set, we default to "KEYSTONE-BETA" for safety.
  const validKeysString = process.env.VALID_PASSKEYS || "KEYSTONE-BETA";
  const validKeys = validKeysString.split(",").map(k => k.trim());

  if (validKeys.includes(passkey)) {
    return res.status(200).json({ success: true, message: "Access Granted" });
  } else {
    return res.status(401).json({ success: false, message: "Invalid Passkey" });
  }
}
