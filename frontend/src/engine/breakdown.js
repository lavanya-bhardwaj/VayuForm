import { analyse } from "./heatModel";

/**
 * Explains a set of interventions one technique at a time.
 * Each step adds the next technique in the set's order and records the design-day indoor peak after it.
 * standaloneDropC is what that technique alone would do to the building with no other changes.
 */
export function breakdownFor(building, ids) {
  const baselinePeakC = analyse(building, []).indoorPeakC;
  let previousPeakC = baselinePeakC;
  const steps = ids.map((id, k) => {
    const peakC = analyse(building, ids.slice(0, k + 1)).indoorPeakC;
    const alone = analyse(building, [id]).indoorPeakC;
    const step = {
      id,
      peakC,
      stepDropC: previousPeakC - peakC,
      cumulativeDropC: baselinePeakC - peakC,
      standalonePeakC: alone,
      standaloneDropC: baselinePeakC - alone,
    };
    previousPeakC = peakC;
    return step;
  });
  return {
    baselinePeakC,
    finalPeakC: steps.length ? steps[steps.length - 1].peakC : baselinePeakC,
    steps,
  };
}
