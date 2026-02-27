const sharp = require("sharp");

async function svgToPngBase64(svg, pngWidth = null) {
  let img = sharp(Buffer.from(svg));
  if (pngWidth) img = img.resize({ width: pngWidth }); // optional normalize output width
  const buf = await img.png().toBuffer();
  return buf.toString("base64");
}

module.exports = { svgToPngBase64 };
