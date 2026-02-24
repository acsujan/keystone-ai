export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { passkey } = req.body || {};
  
  // 1. Define Basic Keys (from Env or default)
  const basicString = process.env.VALID_PASSKEYS || "KEYSTONE-BETA";
  const basicKeys = basicString.split(",").map(k => k.trim());

  // 2. Define Premium Keys (from Env or default)
  const premiumString = process.env.VALID_PASSKEYS_PREMIUM || "KEYSTONE-PRO";
  const premiumKeys = premiumString.split(",").map(k => k.trim());

  if (premiumKeys.includes(passkey)) {
    return res.status(200).json({ success: true, tier: 'premium' });
  } 
  
  if (basicKeys.includes(passkey)) {
    return res.status(200).json({ success: true, tier: 'basic' });
  }

  return res.status(401).json({ success: false, message: "Invalid Passkey" });
}
