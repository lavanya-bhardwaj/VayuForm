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
 * Thermal gradient stops from coolest (0) to hottest (100).
 * Each stop defines:
 * - top: Darker / richer thermal tone at the upper roof / parapet level (where solar heat is highest)
 * - bottom: Lighter / softer pastel tint at the lower ground level
 *
 * Both are soft, architectural tints (not harsh, oversaturated solid colors).
 */
export const THERMAL_GRADIENT_STOPS = [
  {
    score: 0,
    name: "Cool (Blue)",
    top: "#2d7cd6",
    bottom: "#bfdbfe",
    accent: "#3b82f6",
  },
  {
    score: 25,
    name: "Mitigated (Green)",
    top: "#389e5a",
    bottom: "#bbf7d0",
    accent: "#16a34a",
  },
  {
    score: 50,
    name: "Moderate (Yellow)",
    top: "#dfa724",
    bottom: "#fef08a",
    accent: "#eab308",
  },
  {
    score: 75,
    name: "High Exposure (Orange)",
    top: "#e66a2b",
    bottom: "#fed7aa",
    accent: "#ea580c",
  },
  {
    score: 100,
    name: "Severe Heat (Red)",
    top: "#d94a38",
    bottom: "#fca5a5",
    accent: "#dc2626",
  },
];

const parsedGradientStops = THERMAL_GRADIENT_STOPS.map((stop) => ({
  score: stop.score,
  top: new THREE.Color(stop.top),
  bottom: new THREE.Color(stop.bottom),
  accent: new THREE.Color(stop.accent),
}));

/**
 * Smoothly interpolates the top (darker) and bottom (lighter) thermal colors
 * across the gradient from Red (100) -> Orange (75) -> Yellow (50) -> Green (25) -> Blue (0).
 *
 * @param {number} score - Thermal score between 0 and 100
 * @returns {{ top: string, bottom: string, accent: string }}
 */
export function getThermalGradientColors(score) {
  const num = Number(score);
  const s = Math.max(0, Math.min(100, Number.isFinite(num) ? num : 100));

  let lower = parsedGradientStops[0];
  let upper = parsedGradientStops[parsedGradientStops.length - 1];

  for (let i = 0; i < parsedGradientStops.length - 1; i++) {
    if (s >= parsedGradientStops[i].score && s <= parsedGradientStops[i + 1].score) {
      lower = parsedGradientStops[i];
      upper = parsedGradientStops[i + 1];
      break;
    }
  }

  const range = upper.score - lower.score;
  const factor = range === 0 ? 0 : (s - lower.score) / range;

  const topColor = new THREE.Color().copy(lower.top).lerp(upper.top, factor);
  const bottomColor = new THREE.Color().copy(lower.bottom).lerp(upper.bottom, factor);
  const accentColor = new THREE.Color().copy(lower.accent).lerp(upper.accent, factor);

  return {
    top: "#" + topColor.getHexString(),
    bottom: "#" + bottomColor.getHexString(),
    accent: "#" + accentColor.getHexString(),
  };
}

/**
 * Single-color helper for backwards compatibility and UI indicators.
 */
export function getThermalColor(score) {
  return getThermalGradientColors(score).top;
}

/**
 * Creates a MeshStandardMaterial with custom shader injection that renders
 * a smooth world-space vertical gradient tint (top to bottom) over the base architectural color.
 *
 * @param {object} options
 * @param {string} options.baseColor - Underlying architectural stucco/beige color
 * @param {number} options.roughness - Standard material roughness
 * @param {number} options.metalness - Standard material metalness
 * @param {string} options.name - Unique material identifier for shader caching
 * @param {number} options.minY - World elevation for bottom of gradient (ground = 0)
 * @param {number} options.maxY - World elevation for top of gradient (roof parapet = 9.5)
 */
export function createThermalGradientMaterial({
  baseColor = BASE_BUILDING_PALETTE.wall,
  roughness = 0.88,
  metalness = 0,
  name = "wall",
  minY = 0.0,
  maxY = 9.5,
} = {}) {
  const initialGrad = getThermalGradientColors(100);

  const uniforms = {
    uTopColor: { value: new THREE.Color(initialGrad.top) },
    uBottomColor: { value: new THREE.Color(initialGrad.bottom) },
    uBaseColor: { value: new THREE.Color(baseColor) },
    uStrength: { value: 0.58 }, // Default translucent tint strength (not opaque)
    uMinY: { value: minY },
    uMaxY: { value: maxY },
  };

  const mat = new THREE.MeshStandardMaterial({
    roughness,
    metalness,
  });

  mat.customProgramCacheKey = () => `thermalGrad_${name}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTopColor = uniforms.uTopColor;
    shader.uniforms.uBottomColor = uniforms.uBottomColor;
    shader.uniforms.uBaseColor = uniforms.uBaseColor;
    shader.uniforms.uStrength = uniforms.uStrength;
    shader.uniforms.uMinY = uniforms.uMinY;
    shader.uniforms.uMaxY = uniforms.uMaxY;

    // Inject world Y position varying into vertex shader
    shader.vertexShader = `
      varying float vWorldPosY;
      ${shader.vertexShader}
    `.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      vWorldPosY = (modelMatrix * vec4(position, 1.0)).y;
      `
    );

    // Inject smooth top-to-bottom gradient tint blending in fragment shader
    shader.fragmentShader = `
      varying float vWorldPosY;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform vec3 uBaseColor;
      uniform float uStrength;
      uniform float uMinY;
      uniform float uMaxY;
      ${shader.fragmentShader}
    `.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      // Height factor t: 0.0 at ground level (minY) to 1.0 at roof level (maxY)
      float tGrad = clamp((vWorldPosY - uMinY) / max(uMaxY - uMinY, 0.001), 0.0, 1.0);
      
      // Vertical gradient: top is darker/richer tint, bottom is lighter/softer tint
      vec3 gradTint = mix(uBottomColor, uTopColor, tGrad);
      
      // Gentle depth response: slightly deeper tint at high-exposure roof, softer at ground
      float effectiveStrength = uStrength * (0.65 + 0.35 * tGrad);
      
      // Soft translucent blend with base architectural material
      diffuseColor.rgb = mix(uBaseColor, gradTint, clamp(effectiveStrength, 0.0, 1.0));
      `
    );
  };

  /**
   * Updates uniforms dynamically without shader recompilation.
   */
  mat.updateThermal = (topColorHex, bottomColorHex, strength = 0.58) => {
    if (topColorHex) uniforms.uTopColor.value.set(topColorHex);
    if (bottomColorHex) uniforms.uBottomColor.value.set(bottomColorHex);
    if (typeof strength === "number") uniforms.uStrength.value = strength;
  };

  return mat;
}

/**
 * Returns descriptive status and badges for UI display.
 */
export function getThermalStatus(score) {
  const num = Number(score);
  const s = Math.max(0, Math.min(100, Number.isFinite(num) ? num : 100));
  if (s >= 85) {
    return {
      label: "Severe Heat Exposure",
      subtext: "High solar radiation on envelope (dark-to-light red gradient tint)",
      hex: "#dc2626",
    };
  }
  if (s >= 65) {
    return {
      label: "High Heat Exposure",
      subtext: "Elevated thermal absorption on facades (orange gradient tint)",
      hex: "#ea580c",
    };
  }
  if (s >= 40) {
    return {
      label: "Moderate Solar Heat",
      subtext: "Intermediate envelope exposure (yellow gradient tint)",
      hex: "#eab308",
    };
  }
  if (s >= 15) {
    return {
      label: "Mitigated / Passive Cooling",
      subtext: "Dissipated envelope heat (green gradient tint)",
      hex: "#16a34a",
    };
  }
  return {
    label: "Optimal / Cool State",
    subtext: "Maximum passive thermal protection (blue gradient tint)",
    hex: "#2563eb",
  };
}
