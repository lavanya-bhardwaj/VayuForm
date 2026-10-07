import * as THREE from "three";

/**
 * Baseline architectural palette for VayuForm building.
 */
export const BASE_BUILDING_PALETTE = {
  wall: "#efd9c1",
  wallLight: "#f6eadc",
  charcoal: "#60554a", // slab edges, fins, columns
  taupe: "#85776a", // entrance canopy
  frame: "#2a2a2b", // window frames
  glass: "#5c6366",
  door: "#332a27",
  wood: "#b5753f",
  woodDark: "#8d5a30",
  coping: "#d9d2c4",
  roofDeck: "#b9b2a5",
  steel: "#c2baa9",
  plinthTop: "#bab2a5",
  plinthSide: "#5b5753",
  joint: "#a39d92",
  carportFloor: "#8d887f",
  planter: "#4d463f",
  road: "#6b6968",
  grass: "#9aa583",
};

/**
 * Standard thermal exposure color stops:
 * 100: Red    - Maximum heat exposure (very hot)
 *  75: Orange - High heat exposure
 *  50: Yellow - Moderate heat exposure
 *  25: Green  - Reduced heat exposure / passive mitigation
 *   0: Blue   - Coolest / baseline protected
 */
export const THERMAL_STOPS = [
  { score: 0, hex: "#2563eb", name: "Cool (Blue)" },
  { score: 25, hex: "#16a34a", name: "Mitigated (Green)" },
  { score: 50, hex: "#eab308", name: "Moderate (Yellow)" },
  { score: 75, hex: "#ea580c", name: "High Exposure (Orange)" },
  { score: 100, hex: "#dc2626", name: "Severe Heat (Red)" },
];

const parsedStops = THERMAL_STOPS.map((stop) => ({
  score: stop.score,
  color: new THREE.Color(stop.hex),
}));

/**
 * Smoothly interpolates the primary thermal color across the gradient:
 * red (100) -> orange (75) -> yellow (50) -> green (25) -> blue (0)
 *
 * @param {number} score - Thermal score between 0 and 100
 * @returns {string} Hex color string, e.g. "#dc2626"
 */
export function getThermalColor(score) {
  const num = Number(score);
  const s = Math.max(0, Math.min(100, Number.isFinite(num) ? num : 100));

  let lower = parsedStops[0];
  let upper = parsedStops[parsedStops.length - 1];

  for (let i = 0; i < parsedStops.length - 1; i++) {
    if (s >= parsedStops[i].score && s <= parsedStops[i + 1].score) {
      lower = parsedStops[i];
      upper = parsedStops[i + 1];
      break;
    }
  }

  const range = upper.score - lower.score;
  const factor = range === 0 ? 0 : (s - lower.score) / range;
  const c = new THREE.Color().copy(lower.color).lerp(upper.color, factor);
  return "#" + c.getHexString();
}

/**
 * Derives a lighter, high-clarity tint of the thermal color for facade trims,
 * pilasters, window sills, and parapet coping so architectural depth is preserved.
 *
 * @param {number} score - Thermal score between 0 and 100
 * @returns {string} Hex color string
 */
export function getThermalLightColor(score) {
  const baseHex = getThermalColor(score);
  const c = new THREE.Color(baseHex);
  // Lerp 35% towards pure white for legible architectural relief
  c.lerp(new THREE.Color("#ffffff"), 0.35);
  return "#" + c.getHexString();
}

/**
 * Derives a roof surface thermal tone, softly balanced with the architectural deck.
 *
 * @param {number} score - Thermal score between 0 and 100
 * @returns {string} Hex color string
 */
export function getThermalRoofColor(score) {
  const baseHex = getThermalColor(score);
  const c = new THREE.Color(baseHex);
  // Soften 30% towards neutral roof tone so solar heat exposure is visible without glare
  c.lerp(new THREE.Color("#b9b2a5"), 0.3);
  return "#" + c.getHexString();
}

/**
 * Returns a complete building palette where relevant wall and facade materials
 * derive their colors from the thermal score.
 *
 * @param {number} thermalScore - Score between 0 (coolest/blue) and 100 (very hot/red)
 * @returns {object} Full building palette
 */
export function getBuildingPalette(thermalScore) {
  const wall = getThermalColor(thermalScore);
  const wallLight = getThermalLightColor(thermalScore);
  const coping = wallLight;
  const roofDeck = getThermalRoofColor(thermalScore);

  return {
    ...BASE_BUILDING_PALETTE,
    wall,
    wallLight,
    coping,
    roofDeck,
  };
}

/**
 * Returns descriptive status and badges for UI display.
 *
 * @param {number} score - Thermal score between 0 and 100
 */
export function getThermalStatus(score) {
  const num = Number(score);
  const s = Math.max(0, Math.min(100, Number.isFinite(num) ? num : 100));
  if (s >= 85) {
    return {
      label: "Severe Heat Exposure",
      subtext: "Extreme solar gain on building envelope",
      hex: "#dc2626",
    };
  }
  if (s >= 65) {
    return {
      label: "High Heat Exposure",
      subtext: "Elevated thermal absorption on facades",
      hex: "#ea580c",
    };
  }
  if (s >= 40) {
    return {
      label: "Moderate Solar Heat",
      subtext: "Intermediate envelope heat exposure",
      hex: "#eab308",
    };
  }
  if (s >= 15) {
    return {
      label: "Mitigated / Passive Cooling",
      subtext: "Significant thermal dissipation",
      hex: "#16a34a",
    };
  }
  return {
    label: "Optimal / Cool State",
    subtext: "Maximum passive thermal protection",
    hex: "#2563eb",
  };
}
