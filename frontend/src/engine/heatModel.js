import climate from "../data/climate/delhi.json";
import materials from "../data/materials.json";
import { INTERVENTIONS } from "./interventions";

const FACADES = ["N", "E", "S", "W"];
const COURTYARD_SHARE = 0.15;

export const DEFAULT_BUILDING = {
  floors: 2,
  footprintM2: 100,
  wwr: 0.2,
  budgetInr: 300000,
  scenario: "retrofit",
};

/**
 * Merges the effects of the chosen interventions into one set of envelope values.
 * Replacements take the last value applied. Multipliers compound. Air-change adds sum.
 */
export function mergeEffects(ids) {
  const base = {
    wallU: materials.baseline.wall.U,
    wallAlpha: materials.baseline.wall.alpha,
    roofU: materials.baseline.roof.U,
    roofAlpha: materials.baseline.roof.alpha,
    glazingU: materials.baseline.glazing.U,
    shgc: materials.baseline.glazing.SHGC,
    glazingShadingMult: 1,
    wallExposureMult: 1,
    achAdd: 0,
  };

  for (const id of ids) {
    const item = INTERVENTIONS.find((i) => i.id === id);
    if (!item) continue;
    const e = item.effect;
    if (e.wallU !== undefined) base.wallU = e.wallU;
    if (e.wallAlpha !== undefined) base.wallAlpha = e.wallAlpha;
    if (e.roofU !== undefined) base.roofU = e.roofU;
    if (e.roofAlpha !== undefined) base.roofAlpha = e.roofAlpha;
    if (e.glazingShadingMult !== undefined) base.glazingShadingMult *= e.glazingShadingMult;
    if (e.wallExposureMult !== undefined) base.wallExposureMult *= e.wallExposureMult;
    if (e.achAdd !== undefined) base.achAdd += e.achAdd;
  }
  return base;
}

/** Builds the geometry: facade areas, glazing, roof and the courtyard if it is used. */
export function buildGeometry(building, ids) {
  const hasCourtyard = ids.includes("aangan");
  const courtyardM2 = hasCourtyard ? building.footprintM2 * COURTYARD_SHARE : 0;
  const roofM2 = building.footprintM2 - courtyardM2;
  const side = Math.sqrt(building.footprintM2);
  const facades = {};
  for (const f of FACADES) {
    const grossM2 = side * climate.storeyHeightM * building.floors;
    const glazingM2 = grossM2 * building.wwr;
    facades[f] = { grossM2, glazingM2, wallM2: grossM2 - glazingM2 };
  }
  const grossFacadeM2 = FACADES.reduce((sum, f) => sum + facades[f].grossM2, 0);
  const glazingM2 = FACADES.reduce((sum, f) => sum + facades[f].glazingM2, 0);
  const wallM2 = FACADES.reduce((sum, f) => sum + facades[f].wallM2, 0);
  return {
    facades,
    courtyardM2,
    roofM2,
    // Normalised by the whole plot so the courtyard is compared on equal footing with other options.
    floorAreaM2: building.footprintM2 * building.floors,
    grossFacadeM2,
    glazingM2,
    wallM2,
  };
}

/**
 * Peak-hour heat gain for the whole building (W), per m² of floor and per m² of envelope.
 * Conduction uses sol-air temperature. Glazing adds transmitted solar gain.
 */
export function analyse(building, ids = []) {
  const fx = mergeEffects(ids);
  const geo = buildGeometry(building, ids);
  const tOut = climate.outdoorPeakC;
  const tIn = climate.indoorComfortC;
  const ho = climate.surfaceHeatTransferCoeffWm2K;
  const sun = climate.solarPeakWm2;

  let wallGainW = 0;
  let glazingGainW = 0;
  for (const f of FACADES) {
    const { wallM2, glazingM2 } = geo.facades[f];
    const wallExposed = wallM2 * fx.wallExposureMult;
    const tSol = tOut + (fx.wallAlpha * sun[f]) / ho;
    wallGainW += fx.wallU * wallExposed * (tSol - tIn);
    glazingGainW +=
      fx.glazingU * glazingM2 * (tOut - tIn) + fx.shgc * glazingM2 * sun[f] * fx.glazingShadingMult;
  }

  const roofTSol = tOut + (fx.roofAlpha * sun.roof) / ho;
  const roofGainW = fx.roofU * geo.roofM2 * (roofTSol - tIn);

  const totalGainW = wallGainW + glazingGainW + roofGainW;
  const envelopeM2 =
    geo.wallM2 * fx.wallExposureMult + geo.glazingM2 + geo.roofM2;
  const gainPerFloorM2 = geo.floorAreaM2 > 0 ? totalGainW / geo.floorAreaM2 : 0;

  // Lumped estimate of indoor peak: gain divided by the effective heat-removal coefficient.
  const achTotal = climate.calibration.baseAchPerHour + fx.achAdd;
  const ventCoeff = (climate.airDensityTimesSpecificHeat * achTotal * climate.storeyHeightM) / 3600;
  const heatRemovalWm2K = climate.calibration.lumpedHeatLossWm2K + ventCoeff;
  const indoorPeakC = tIn + gainPerFloorM2 / heatRemovalWm2K;

  return {
    totalGainW,
    gainBreakdownW: { walls: wallGainW, glazing: glazingGainW, roof: roofGainW },
    gainPerFloorM2,
    envelopeGainWm2: envelopeM2 > 0 ? totalGainW / envelopeM2 : 0,
    indoorPeakC,
    achTotal,
    thermalScore: thermalScoreFromGain(gainPerFloorM2),
    geometry: geo,
  };
}

/** Maps gain per m² of floor onto the 0-100 scale that drives the thermal tint. */
export function thermalScoreFromGain(gainPerFloorM2) {
  const { minGainWm2Floor, maxGainWm2Floor } = climate.calibration.scoreRange;
  const t = (gainPerFloorM2 - minGainWm2Floor) / (maxGainWm2Floor - minGainWm2Floor);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Cost of one intervention for this building, in ₹. */
export function interventionCostInr(item, building, geo) {
  const quantities = {
    glazing_m2: geo.glazingM2,
    wall_m2: geo.wallM2,
    roof_m2: geo.roofM2,
    facade_m2: geo.grossFacadeM2,
    courtyard_m2: geo.courtyardM2,
    floor: building.floors,
  };
  return item.unitCostInr * (quantities[item.costBasis] ?? 0);
}

/** Yearly energy, money and carbon, scaled from an assumed baseline cooling demand. */
export function annualImpact(building, ids, baseline) {
  const current = analyse(building, ids);
  const { baselineCoolingKwhPerM2Yr, tariffInrPerKwh, gridCo2KgPerKwh } = climate.energy;
  const baseKwh = baselineCoolingKwhPerM2Yr * baseline.geometry.floorAreaM2;
  const ratio = baseline.gainPerFloorM2 > 0 ? current.gainPerFloorM2 / baseline.gainPerFloorM2 : 1;
  const kwh = baseKwh * ratio;
  const savedKwh = baseKwh - kwh;
  return {
    coolingKwh: kwh,
    savedKwh,
    savedInr: savedKwh * tariffInrPerKwh,
    savedCo2Kg: savedKwh * gridCo2KgPerKwh,
  };
}

export { FACADES };
