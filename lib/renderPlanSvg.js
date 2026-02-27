function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPlanSvg(planSpec, opts = {}) {
  const PX_PER_UNIT = opts.pxPerUnit ?? 18; // fixed scale
  const PAD = opts.padding ?? 24;
  const GAP = opts.gap ?? 48;

  // Stack levels vertically in one SVG
  let yOffset = 0;
  let svgWidth = 0;
  const groups = [];

  for (const lvl of planSpec.levels) {
    const levelW = PAD * 2 + lvl.width * PX_PER_UNIT;
    const levelH = PAD * 2 + lvl.height * PX_PER_UNIT + 28; // header space
    svgWidth = Math.max(svgWidth, levelW);

    const header = `
      <text x="${PAD}" y="${yOffset + 20}" font-family="Arial" font-size="16" fill="#111">
        Level ${lvl.level}
      </text>
    `;

    const border = `
      <rect x="${PAD}" y="${yOffset + PAD + 16}" width="${lvl.width * PX_PER_UNIT}" height="${lvl.height * PX_PER_UNIT}"
        fill="white" stroke="black" stroke-width="3"/>
    `;

    const rooms = (lvl.rooms || []).map(r => {
      const x = PAD + r.x * PX_PER_UNIT;
      const y = yOffset + PAD + 16 + r.y * PX_PER_UNIT;
      const w = r.w * PX_PER_UNIT;
      const h = r.h * PX_PER_UNIT;

      const label = escapeXml(r.label || r.type);
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="2"/>
        <text x="${x + w / 2}" y="${y + h / 2}" font-family="Arial" font-size="14"
          text-anchor="middle" dominant-baseline="middle" fill="#111">
          ${label}
        </text>
      `;
    }).join("\n");

    groups.push(`<g>${header}${border}${rooms}</g>`);
    yOffset += levelH + GAP;
  }

  const svgHeight = yOffset;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>
  ${groups.join("\n")}
</svg>`.trim();
}

module.exports = { renderPlanSvg };
