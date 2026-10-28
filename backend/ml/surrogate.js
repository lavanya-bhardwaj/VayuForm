/**
 * Runs the trained surrogate (backend/models/surrogate.json, made by scripts/train_surrogate.py).
 * The model is a small MLP written out as plain arrays, so inference is a few matrix steps in plain JS.
 * Cost is computed exactly here, the same way the frontend does, because it is a simple sum.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "..", "..", "frontend", "src", "data");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const model = readJson(path.join(here, "..", "models", "surrogate.json"));
const { interventions } = readJson(path.join(DATA, "interventions.json"));
const SITE_IDS = ["delhi", "jaipur", "ahmedabad", "kochi"];
const cities = Object.fromEntries(SITE_IDS.map((id) => [id, readJson(path.join(DATA, "climate", `${id}.json`))]));
const byId = Object.fromEntries(interventions.map((i) => [i.id, i]));

const SCENARIOS = ["retrofit", "new"];
const COURTYARD_SHARE = 0.15; // same as heatModel.js
const FACADES = 4;
const DEFAULT_BUILDING = {
  site: "delhi",
  scenario: "retrofit",
  floors: 2,
  footprintM2: 100,
  wwr: 0.2,
  budgetInr: 300000,
};
const RANGES = { floors: [1, 5], footprintM2: [20, Infinity], wwr: [0.1, 0.6], budgetInr: [0, Infinity] };

/** Returns a complete, in-range building. Same rules as sanitiseBuilding in building.js. */
export function sanitise(raw = {}) {
  const b = { ...DEFAULT_BUILDING };
  if (SITE_IDS.includes(raw.site)) b.site = raw.site;
  if (SCENARIOS.includes(raw.scenario)) b.scenario = raw.scenario;
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const value = raw[key];
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) continue;
    const n = key === "floors" ? Math.round(Number(value)) : Number(value);
    b[key] = Math.min(max, Math.max(min, n));
  }
  const excluded = Array.isArray(raw.excluded) ? [...new Set(raw.excluded)] : [];
  b.excluded = excluded;
  b.required = Array.isArray(raw.required) ? [...new Set(raw.required)].filter((id) => !excluded.includes(id)) : [];
  return b;
}

/** Intervention ids that the scenario allows, in catalogue order. */
export function applicableIds(scenario) {
  return interventions.filter((i) => i.applicableTo.includes(scenario)).map((i) => i.id);
}

/** Raised for bad caller input. The server shows its message; any other error is logged and hidden. */
export class InputError extends Error {}

/** Throws if an id is unknown or not allowed for the scenario. Returns the ids in catalogue order. */
function checkIds(building, ids) {
  const allowed = applicableIds(building.scenario);
  const bad = ids.filter((id) => !allowed.includes(id));
  if (bad.length) throw new InputError(`Not available for ${building.scenario}: ${bad.join(", ")}`);
  return allowed.filter((id) => ids.includes(id));
}

/** Feature order comes from the model file, so it always matches the training script. */
function encode(building, ids) {
  const c = cities[building.site];
  const values = {
    outdoorPeakC: c.outdoorPeakC,
    relHumidityPct: c.relHumidityAfternoonPct,
    roofSolarWm2: c.solarPeakWm2.roof,
    baselineCoolingKwhPerM2Yr: c.energy.baselineCoolingKwhPerM2Yr,
    floors: building.floors,
    footprintM2: building.footprintM2,
    wwr: building.wwr,
  };
  return model.features.map((name) => (name in values ? values[name] : ids.includes(name) ? 1 : 0));
}

/** One forward pass through the MLP. Returns the outputs in the units of the targets. */
function forward(x) {
  const { mean, scale } = model.inputScaler;
  let h = x.map((v, i) => (v - mean[i]) / scale[i]);
  for (const layer of model.layers) {
    const out = layer.bias.slice();
    for (let i = 0; i < h.length; i++) {
      const row = layer.weights[i];
      const hi = h[i];
      for (let j = 0; j < out.length; j++) out[j] += hi * row[j];
    }
    h = layer.activation === "relu" ? out.map((v) => (v > 0 ? v : 0)) : out;
  }
  const { mean: yMean, scale: yScale } = model.targetScaler;
  return h.map((v, k) => v * yScale[k] + yMean[k]);
}

function predictTargets(building, ids) {
  const y = forward(encode(building, ids));
  return Object.fromEntries(model.targets.map((name, k) => [name, y[k]]));
}

/**
 * Rupees saved per year. The model gives the cooling-demand ratio, and the saving follows from it
 * exactly, as in annualImpact (heatModel.js). With no interventions the ratio is 1 by definition.
 */
function savingInr(building, ids, gainRatio) {
  if (ids.length === 0) return 0;
  const c = cities[building.site];
  const baseKwh = c.energy.baselineCoolingKwhPerM2Yr * building.footprintM2 * building.floors;
  return baseKwh * (1 - gainRatio) * c.energy.tariffInrPerKwh;
}

/** Peak temperature and saving for one set of ids. Used by predict and optimise. */
function evaluate(building, ids) {
  const { indoorPeakC, gainRatio } = predictTargets(building, ids);
  return { indoorPeakC, savedInr: savingInr(building, ids, gainRatio) };
}

/** Exact cost in ₹, the same arithmetic as heatModel.js. */
export function totalCostInr(building, ids) {
  const c = cities[building.site];
  const gross = Math.sqrt(building.footprintM2) * c.storeyHeightM * building.floors;
  const glazing = gross * building.wwr;
  const courtyard = ids.includes("aangan") ? building.footprintM2 * COURTYARD_SHARE : 0;
  const quantities = {
    glazing_m2: glazing * FACADES,
    wall_m2: (gross - glazing) * FACADES,
    roof_m2: building.footprintM2 - courtyard,
    facade_m2: gross * FACADES,
    courtyard_m2: courtyard,
    floor: building.floors,
  };
  return ids.reduce((sum, id) => sum + byId[id].unitCostInr * quantities[byId[id].costBasis], 0);
}

const modelInfo = { name: model.name, trainedOn: model.trainedOn, samples: model.samples };

/** Predicted peak and saving for one set of interventions, with the baseline for comparison. */
export function predict(rawBuilding, rawIds = []) {
  const building = sanitise(rawBuilding);
  const ids = checkIds(building, Array.isArray(rawIds) ? rawIds : []);
  const started = performance.now();
  const baseline = predictTargets(building, []);
  const current = evaluate(building, ids);
  const inferenceMs = performance.now() - started;
  const costInr = totalCostInr(building, ids);
  return {
    ids,
    indoorPeakC: current.indoorPeakC,
    baselinePeakC: baseline.indoorPeakC,
    savedInr: current.savedInr,
    costInr,
    paybackYears: current.savedInr > 0 ? costInr / current.savedInr : null,
    inferenceMs,
    model: modelInfo,
  };
}

/**
 * Tries every allowed subset, keeps the ones within budget that include every required id,
 * and ranks them by predicted saving, then by lower cost. Same rules as optimizer.js.
 */
export function optimise(rawBuilding) {
  const building = sanitise(rawBuilding);
  const candidates = applicableIds(building.scenario).filter((id) => !building.excluded.includes(id));
  const started = performance.now();
  const results = [];

  for (let mask = 0; mask < 1 << candidates.length; mask++) {
    const ids = candidates.filter((_, bit) => mask & (1 << bit));
    if (!building.required.every((id) => ids.includes(id))) continue;
    const costInr = totalCostInr(building, ids);
    if (costInr > building.budgetInr) continue;
    const { indoorPeakC, savedInr } = evaluate(building, ids);
    results.push({
      ids,
      costInr,
      indoorPeakC,
      savedInr,
      paybackYears: savedInr > 0 ? costInr / savedInr : null,
    });
  }

  results.sort((a, b) => b.savedInr - a.savedInr || a.costInr - b.costInr);
  return {
    best: results[0] ?? null,
    ranked: results.slice(0, 5),
    evaluated: results.length,
    inferenceMs: performance.now() - started,
    model: modelInfo,
  };
}
