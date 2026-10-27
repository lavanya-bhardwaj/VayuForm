/**
 * The building definition shared by the engine, the optimiser, the App and the 3D scenes.
 * Anything that changes the building should pass through sanitiseBuilding, so values stay in range.
 */
import { DEFAULT_SITE, SITE_IDS } from "./climate";

export const SCENARIO_OPTIONS = ["retrofit", "new"];

/** Allowed range for each numeric field. The project form reads these limits too. */
export const BUILDING_LIMITS = {
  floors: { min: 1, max: 5 },
  footprintM2: { min: 20 },
  wwr: { min: 0.1, max: 0.6 },
  budgetInr: { min: 0 },
};

export const DEFAULT_BUILDING = {
  site: DEFAULT_SITE,
  scenario: "retrofit",
  floors: 2,
  footprintM2: 100,
  wwr: 0.2,
  budgetInr: 300000,
  interventions: [],
  // Follow-up constraints from the user. Excluded ids are never recommended. Required ids must be in every recommendation.
  excluded: [],
  required: [],
};

const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback);
const clamp = (value, { min, max = Infinity }) => Math.min(max, Math.max(min, value));

/**
 * Returns a complete, in-range building from a partial one.
 * Missing or invalid values fall back to the default. Numbers are clamped to BUILDING_LIMITS.
 */
export function sanitiseBuilding(input = {}) {
  const b = { ...DEFAULT_BUILDING, ...input };
  const excluded = Array.isArray(b.excluded) ? [...new Set(b.excluded)] : [];
  const required = Array.isArray(b.required) ? [...new Set(b.required)].filter((id) => !excluded.includes(id)) : [];
  return {
    excluded,
    required,
    site: SITE_IDS.includes(b.site) ? b.site : DEFAULT_BUILDING.site,
    scenario: SCENARIO_OPTIONS.includes(b.scenario) ? b.scenario : DEFAULT_BUILDING.scenario,
    floors: clamp(Math.round(finite(b.floors, DEFAULT_BUILDING.floors)), BUILDING_LIMITS.floors),
    footprintM2: clamp(finite(b.footprintM2, DEFAULT_BUILDING.footprintM2), BUILDING_LIMITS.footprintM2),
    wwr: clamp(finite(b.wwr, DEFAULT_BUILDING.wwr), BUILDING_LIMITS.wwr),
    budgetInr: clamp(finite(b.budgetInr, DEFAULT_BUILDING.budgetInr), BUILDING_LIMITS.budgetInr),
    interventions: Array.isArray(b.interventions) ? [...new Set(b.interventions)] : [],
  };
}
