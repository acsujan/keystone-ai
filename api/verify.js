// api/verify.js (CommonJS)

module.exports.config = { runtime: "nodejs" };

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { passkey } = req.body || {};

    if (!passkey) {
      return res.status(400).json({ success: false, message: "Missing passkey" });
    }

    // Safe-fail if env vars are missing
    const basicKeys = (process.env.VALID_PASSKEYS || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    const premiumKeys = (process.env.VALID_PASSKEYS_PREMIUM || "")
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    if (premiumKeys.includes(passkey)) {
      return res.status(200).json({ success: true, tier: "premium" });
    }

    if (basicKeys.includes(passkey)) {
      return res.status(200).json({ success: true, tier: "basic" });
    }

    return res.status(401).json({ success: false, message: "Invalid Passkey" });

  } catch (err) {
    console.error("VERIFY error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
