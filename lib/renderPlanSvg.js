// lib/renderPlanSvg.js (CommonJS)
const { getEmbeddedFontCss } = require("./getEmbeddedFontCss");

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPlanSvg(planSpec, opts = {}) {
  if (!planSpec || !Array.isArray(planSpec.levels)) {
    throw new Error("Invalid planSpec: missing levels");
  }

  const PX_PER_UNIT = opts.pxPerUnit ?? 18; // fixed deterministic scale
  const PAD = opts.padding ?? 24;
  const GAP = opts.gap ?? 48;

  const fontCss = getEmbeddedFontCss();

  let yOffset = 0;
  let svgWidth = 0;
  const groups = [];

  for (const lvl of planSpec.levels) {
    const levelWidthUnits = Number(lvl.width) || 0;
    const levelHeightUnits = Number(lvl.height) || 0;

    const levelPixelW = levelWidthUnits * PX_PER_UNIT;
    const levelPixelH = levelHeightUnits * PX_PER_UNIT;

    const levelW = PAD * 2 + levelPixelW;
    const levelH = PAD * 2 + levelPixelH + 36; // header room

    svgWidth = Math.max(svgWidth, levelW);

    const headerY = yOffset + 24;
    const levelTopY = yOffset + PAD + 20;

    const header = `
      <text x="${PAD}" y="${headerY}" class="kp-text kp-header">
        Level ${escapeXml(lvl.level)}
      </text>
    `;

    const border = `
      <rect x="${PAD}" y="${levelTopY}"
        width="${levelPixelW}"
        height="${levelPixelH}"
        fill="white"
        stroke="black"
        stroke-width="4"/>
    `;

    const rooms = (lvl.rooms || []).map((r) => {
      const x = PAD + (Number(r.x) || 0) * PX_PER_UNIT;
      const y = levelTopY + (Number(r.y) || 0) * PX_PER_UNIT;
      const w = (Number(r.w) || 0) * PX_PER_UNIT;
      const h = (Number(r.h) || 0) * PX_PER_UNIT;

      const label = escapeXml(r.label || r.type || "Room");

      // Auto-scale text for small rooms
      const minDim = Math.min(w, h);
      const fontSize = Math.max(10, Math.min(16, minDim * 0.18));

      return `
        <rect x="${x}" y="${y}"
          width="${w}"
          height="${h}"
          fill="white"
          stroke="black"
          stroke-width="2"/>
        <text x="${x + w / 2}"
          y="${y + h / 2}"
          class="kp-text"
          font-size="${fontSize}"
          text-anchor="middle"
          dominant-baseline="middle">
          ${label}
        </text>
      `;
    }).join("\n");

    groups.push(`<g>${header}${border}${rooms}</g>`);

    yOffset += levelH + GAP;
  }

  const svgHeight = yOffset;

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${svgWidth}"
     height="${svgHeight}"
     viewBox="0 0 ${svgWidth} ${svgHeight}">
  <style>
    ${fontCss}
    .kp-text {
      font-family: "KeystoneSans", sans-serif;
      fill: #111;
    }
    .kp-header {
      font-size: 18px;
      font-weight: 700;
    }
  </style>

  <rect x="0" y="0"
        width="${svgWidth}"
        height="${svgHeight}"
        fill="white"/>
  ${groups.join("\n")}
</svg>`.trim();
}

module.exports = { renderPlanSvg };
