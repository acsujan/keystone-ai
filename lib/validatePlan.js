function parseCount(str) {
  const m = String(str || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function overlaps(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

function normalizeFeatures(features) {
  return String(features || "").toLowerCase();
}

function validatePlanSpec(planSpec, surveyData) {
  const errors = [];
  const wantStories = String(surveyData?.stories || "1 Story").includes("2") ? 2 : 1;
  const wantBeds = parseCount(surveyData?.bedrooms);
  const wantBaths = parseCount(surveyData?.bathrooms);
  const feats = normalizeFeatures(surveyData?.features);

  if (!planSpec || typeof planSpec !== "object") return ["PlanSpec missing/invalid"];
  if (planSpec.stories !== wantStories) errors.push(`Stories mismatch: wanted ${wantStories}, got ${planSpec.stories}`);

  if (!Array.isArray(planSpec.levels) || planSpec.levels.length < 1) {
    errors.push("levels[] missing");
    return errors;
  }

  let beds = 0;
  let baths = 0;

  for (const lvl of planSpec.levels) {
    if (!lvl || !Array.isArray(lvl.rooms)) {
      errors.push(`Level ${lvl?.level ?? "?"} rooms missing`);
      continue;
    }

    // bounds check
    for (const r of lvl.rooms) {
      if (r.level !== lvl.level) errors.push(`Room ${r.id} level mismatch`);
      if (r.x + r.w > lvl.width || r.y + r.h > lvl.height) errors.push(`Room ${r.id} out of bounds on level ${lvl.level}`);
      if (r.w <= 0 || r.h <= 0) errors.push(`Room ${r.id} has invalid size`);
      if (r.type === "bedroom") beds += 1;
      if (r.type === "bathroom") baths += 1;
    }

    // overlap check (naive)
    const rooms = lvl.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (overlaps(rooms[i], rooms[j])) {
          errors.push(`Rooms overlap on level ${lvl.level}: ${rooms[i].id} & ${rooms[j].id}`);
        }
      }
    }
  }

  if (wantBeds && beds !== wantBeds) errors.push(`Bedrooms mismatch: wanted ${wantBeds}, got ${beds}`);
  if (wantBaths && baths !== wantBaths) errors.push(`Bathrooms mismatch: wanted ${wantBaths}, got ${baths}`);

  // Feature checks (simple MVP string rules)
  if (feats.includes("garage")) {
    const hasGarage = planSpec.levels.some(l => l.rooms.some(r => r.type === "garage"));
    if (!hasGarage) errors.push("Feature requested: garage (missing)");
  }
  if (feats.includes("office")) {
    const hasOffice = planSpec.levels.some(l => l.rooms.some(r => r.type === "office"));
    if (!hasOffice) errors.push("Feature requested: office (missing)");
  }

  return errors;
}

module.exports = { validatePlanSpec };
