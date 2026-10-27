import { INTERVENTIONS, interventionsFor } from "./interventions";
import { analyse, annualImpact, buildGeometry, interventionCostInr } from "./heatModel";

/** Total cost in ₹ for a set of intervention ids. */
export function totalCostInr(building, ids) {
  const geo = buildGeometry(building, ids);
  return ids.reduce((sum, id) => {
    const item = INTERVENTIONS.find((i) => i.id === id);
    return item ? sum + interventionCostInr(item, building, geo) : sum;
  }, 0);
}

/**
 * Tries every subset of the candidate interventions for the scenario.
 * Keeps subsets within budget and ranks them by yearly savings, then by lower cost.
 * Brute force is fine here: with the current catalogue it is only a few hundred combinations.
 */
export function optimise(building) {
  const excluded = building.excluded ?? [];
  const required = building.required ?? [];
  const candidates = interventionsFor(building.scenario)
    .map((i) => i.id)
    .filter((id) => !excluded.includes(id));
  const baseline = analyse(building, []);
  const results = [];

  for (let mask = 0; mask < 1 << candidates.length; mask++) {
    const ids = candidates.filter((_, bit) => mask & (1 << bit));
    if (!required.every((id) => ids.includes(id))) continue;
    const costInr = totalCostInr(building, ids);
    if (costInr > building.budgetInr) continue;
    const impact = annualImpact(building, ids, baseline);
    results.push({
      ids,
      costInr,
      indoorPeakC: analyse(building, ids).indoorPeakC,
      ...impact,
      paybackYears: impact.savedInr > 0 ? costInr / impact.savedInr : Infinity,
    });
  }

  results.sort((a, b) => b.savedInr - a.savedInr || a.costInr - b.costInr);
  return { best: results[0] ?? null, ranked: results.slice(0, 5) };
}
