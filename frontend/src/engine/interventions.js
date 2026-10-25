import data from "../data/interventions.json";

/** Intervention catalogue, shared by the engine, the optimiser and the UI. */
export const INTERVENTIONS = data.interventions;

/** Interventions that apply to a given scenario ("retrofit" or "new"). */
export function interventionsFor(scenario) {
  return INTERVENTIONS.filter((i) => i.applicableTo.includes(scenario));
}
