export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { passkey } = req.body || {};
  
  // SECURE: We default to an empty string "" if the Env Var is missing.
  // This means if you forget to set it in Vercel, access is denied (Safe Fail).
  const basicString = process.env.VALID_PASSKEYS || "";
  const basicKeys = basicString.split(",").map(k => k.trim()).filter(k => k);

  const premiumString = process.env.VALID_PASSKEYS_PREMIUM || "";
  const premiumKeys = premiumString.split(",").map(k => k.trim()).filter(k => k);

  if (premiumKeys.includes(passkey)) {
    return res.status(200).json({ success: true, tier: 'premium' });
  } 
  
  if (basicKeys.includes(passkey)) {
    return res.status(200).json({ success: true, tier: 'basic' });
  }

  return res.status(401).json({ success: false, message: "Invalid Passkey" });
}
