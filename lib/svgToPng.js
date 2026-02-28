// lib/svgToPng.js (CommonJS)
//aa
const sharp = require("sharp");

/**
 * Convert SVG string to PNG base64.
 * @param {string} svg - Raw SVG markup string
 * @param {number|null} pngWidth - Optional width normalization
 * @returns {Promise<string>} base64 PNG (no data URL prefix)
 */
async function svgToPngBase64(svg, pngWidth = null) {
  if (!svg || typeof svg !== "string") {
    throw new Error("svgToPngBase64: SVG must be a string");
  }

  try {
    let image = sharp(Buffer.from(svg), {
      density: 300 // higher density = sharper text rendering
    });

    if (pngWidth && Number.isFinite(pngWidth)) {
      image = image.resize({
        width: Math.max(400, Math.min(pngWidth, 4000)), // clamp width (avoid insane sizes)
        withoutEnlargement: false
      });
    }

    const buffer = await image
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toBuffer();

    return buffer.toString("base64");
  } catch (err) {
    console.error("svgToPngBase64 error:", err);
    throw new Error("Failed to convert SVG to PNG");
  }
}

module.exports = { svgToPngBase64 };
