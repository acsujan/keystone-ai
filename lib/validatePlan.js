// lib/validatePlan.js (CommonJS)
//aa
function parseCount(str) {
  const m = String(str || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function normalizeFeatures(features) {
  return String(features || "").toLowerCase();
}

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function validatePlanSpec(planSpec, surveyData) {
  const errors = [];

  const wantStories = String(surveyData?.stories || "1 Story").includes("2") ? 2 : 1;
  const wantBeds = parseCount(surveyData?.bedrooms);
  const wantBaths = parseCount(surveyData?.bathrooms);
  const feats = normalizeFeatures(surveyData?.features);

  if (!planSpec || typeof planSpec !== "object") {
    return ["PlanSpec missing or invalid"];
  }

  if (!Array.isArray(planSpec.levels) || planSpec.levels.length === 0) {
    return ["levels[] missing"];
  }

  if (planSpec.stories !== wantStories) {
    errors.push(`Stories mismatch: wanted ${wantStories}, got ${planSpec.stories}`);
  }

  if (planSpec.levels.length !== wantStories) {
    errors.push(`Level count mismatch: expected ${wantStories}, got ${planSpec.levels.length}`);
  }

  let beds = 0;
  let baths = 0;

  for (const lvl of planSpec.levels) {
    if (!lvl || !Array.isArray(lvl.rooms)) {
      errors.push(`Level ${lvl?.level ?? "?"} rooms missing`);
      continue;
    }

    if (!isFiniteNumber(lvl.width) || !isFiniteNumber(lvl.height)) {
      errors.push(`Level ${lvl.level} has invalid width/height`);
      continue;
    }

    if (lvl.width <= 0 || lvl.height <= 0) {
      errors.push(`Level ${lvl.level} has non-positive dimensions`);
    }

    for (const r of lvl.rooms) {
      if (!r || typeof r !== "object") {
        errors.push(`Invalid room object on level ${lvl.level}`);
        continue;
      }

      if (r.level !== lvl.level) {
        errors.push(`Room ${r.id} level mismatch`);
      }

      if (
        !isFiniteNumber(r.x) ||
        !isFiniteNumber(r.y) ||
        !isFiniteNumber(r.w) ||
        !isFiniteNumber(r.h)
      ) {
        errors.push(`Room ${r.id} has invalid numeric values`);
        continue;
      }

      if (r.w <= 0 || r.h <= 0) {
        errors.push(`Room ${r.id} has invalid size`);
      }

      if (r.x < 0 || r.y < 0) {
        errors.push(`Room ${r.id} has negative coordinates`);
      }

      if (r.x + r.w > lvl.width || r.y + r.h > lvl.height) {
        errors.push(`Room ${r.id} out of bounds on level ${lvl.level}`);
      }

      // Prevent micro-rooms (helps AI correction)
      const minRoomSize = 2;
      if (r.w < minRoomSize || r.h < minRoomSize) {
        errors.push(`Room ${r.id} too small (< ${minRoomSize} units)`);
      }

      if (r.type === "bedroom") beds += 1;
      if (r.type === "bathroom") baths += 1;
    }

    // Overlap check
    const rooms = lvl.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (overlaps(rooms[i], rooms[j])) {
          errors.push(
            `Rooms overlap on level ${lvl.level}: ${rooms[i].id} & ${rooms[j].id}`
          );
        }
      }
    }
  }

  if (wantBeds && beds !== wantBeds) {
    errors.push(`Bedrooms mismatch: wanted ${wantBeds}, got ${beds}`);
  }

  if (wantBaths && baths !== wantBaths) {
    errors.push(`Bathrooms mismatch: wanted ${wantBaths}, got ${baths}`);
  }

  // Feature validation
  if (feats.includes("garage")) {
    const hasGarage = planSpec.levels.some(l =>
      l.rooms.some(r => r.type === "garage")
    );
    if (!hasGarage) errors.push("Feature requested: garage (missing)");
  }

  if (feats.includes("office")) {
    const hasOffice = planSpec.levels.some(l =>
      l.rooms.some(r => r.type === "office")
    );
    if (!hasOffice) errors.push("Feature requested: office (missing)");
  }

  return errors;
}

module.exports = { validatePlanSpec };
