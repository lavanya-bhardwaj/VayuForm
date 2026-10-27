#!/usr/bin/env python3
"""
Trains a small neural-network surrogate of the VayuForm heat engine.

The engine in frontend/src/engine/heatModel.js is the reference. This script ports its formulas,
labels random building, site and intervention combinations with them, and fits an MLP to the labels.
The fitted weights are written as plain JSON, so the backend can run them with no ML library.

Run from the repo root:
    python3 scripts/train_surrogate.py
"""
import argparse
import itertools
import json
import math
import random
import warnings
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

# Accelerate BLAS on macOS reports spurious divide-by-zero warnings for ordinary matrix products.
# The export check in main() confirms the weights are sound, so the warnings are muted here.
warnings.filterwarnings("ignore", message="divide by zero|overflow|invalid value", category=RuntimeWarning)

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "frontend" / "src" / "data"
DEFAULT_OUT = REPO / "backend" / "models" / "surrogate.json"

CITY_IDS = ["delhi", "jaipur", "ahmedabad", "kochi"]
FACADES = ["N", "E", "S", "W"]
COURTYARD_SHARE = 0.15  # same as COURTYARD_SHARE in heatModel.js
SCENARIOS = ["retrofit", "new"]

# Sampling ranges. Climate values are drawn from the spread of the four city files.
# Footprint has no upper limit in the app, so 300 m² is a sampling choice, not a rule.
FLOORS_RANGE = (1, 5)
FOOTPRINT_RANGE = (20, 300)
WWR_RANGE = (0.1, 0.6)

with open(DATA / "interventions.json") as f:
    INTERVENTIONS = json.load(f)["interventions"]
with open(DATA / "materials.json") as f:
    MATERIALS = json.load(f)["baseline"]
CITY_FILES = {}
for city in CITY_IDS:
    with open(DATA / "climate" / f"{city}.json") as f:
        CITY_FILES[city] = json.load(f)

CATALOGUE_IDS = [i["id"] for i in INTERVENTIONS]
BY_ID = {i["id"]: i for i in INTERVENTIONS}

FEATURES = [
    "outdoorPeakC",
    "relHumidityPct",
    "roofSolarWm2",
    "baselineCoolingKwhPerM2Yr",
    "floors",
    "footprintM2",
    "wwr",
    *CATALOGUE_IDS,
]
# The model predicts the cooling-demand ratio, not rupees. Savings are then computed exactly from the ratio,
# because a rupee target is large and noisy while the ratio stays between 0 and 1.
TARGETS = ["indoorPeakC", "gainRatio"]


def applicable_ids(scenario):
    """The 'IMAC rules' in this project: an intervention may only be chosen where applicableTo allows it."""
    return [i["id"] for i in INTERVENTIONS if scenario in i["applicableTo"]]


def check_shared_constants():
    """The surrogate samples only four climate values. Everything else must be identical across cities."""
    reference = CITY_FILES["delhi"]
    for city in CITY_IDS[1:]:
        other = CITY_FILES[city]
        for key in ["indoorComfortC", "surfaceHeatTransferCoeffWm2K", "airDensityTimesSpecificHeat", "storeyHeightM", "calibration"]:
            assert other[key] == reference[key], f"{city}.{key} differs from delhi"
        for face in FACADES:
            assert other["solarPeakWm2"][face] == reference["solarPeakWm2"][face], f"{city} vertical solar differs"
        assert other["energy"]["tariffInrPerKwh"] == reference["energy"]["tariffInrPerKwh"]


def climate_bounds():
    """Lowest and highest value of each sampled climate field across the four cities."""
    def values(get):
        return [get(CITY_FILES[c]) for c in CITY_IDS]

    fields = {
        "outdoorPeakC": lambda c: c["outdoorPeakC"],
        "relHumidityPct": lambda c: c["relHumidityAfternoonPct"],
        "roofSolarWm2": lambda c: c["solarPeakWm2"]["roof"],
        "baselineCoolingKwhPerM2Yr": lambda c: c["energy"]["baselineCoolingKwhPerM2Yr"],
    }
    return {name: (min(values(get)), max(values(get))) for name, get in fields.items()}


BOUNDS = climate_bounds()


def make_climate(outdoor_c, rel_humidity_pct, roof_solar, baseline_kwh):
    """A climate dict in the same shape as a city file, with the four sampled values replaced."""
    clim = json.loads(json.dumps(CITY_FILES["delhi"]))
    clim["outdoorPeakC"] = outdoor_c
    clim["relHumidityAfternoonPct"] = rel_humidity_pct
    clim["solarPeakWm2"]["roof"] = roof_solar
    clim["energy"]["baselineCoolingKwhPerM2Yr"] = baseline_kwh
    return clim


# ---------- Port of frontend/src/engine/heatModel.js ----------

def merge_effects(ids):
    fx = {
        "wallU": MATERIALS["wall"]["U"],
        "wallAlpha": MATERIALS["wall"]["alpha"],
        "roofU": MATERIALS["roof"]["U"],
        "roofAlpha": MATERIALS["roof"]["alpha"],
        "glazingU": MATERIALS["glazing"]["U"],
        "shgc": MATERIALS["glazing"]["SHGC"],
        "glazingShadingMult": 1.0,
        "wallExposureMult": 1.0,
        "achAdd": 0.0,
        "evapCoolingK": 0.0,
    }
    for iid in ids:
        e = BY_ID[iid]["effect"]
        for key in ["wallU", "wallAlpha", "roofU", "roofAlpha"]:
            if key in e:
                fx[key] = e[key]
        if "glazingShadingMult" in e:
            fx["glazingShadingMult"] *= e["glazingShadingMult"]
        if "wallExposureMult" in e:
            fx["wallExposureMult"] *= e["wallExposureMult"]
        if "achAdd" in e:
            fx["achAdd"] += e["achAdd"]
        if "evapCoolingK" in e:
            fx["evapCoolingK"] += e["evapCoolingK"]
    return fx


def geometry(b, ids, clim):
    footprint = b["footprintM2"]
    courtyard = footprint * COURTYARD_SHARE if "aangan" in ids else 0.0
    side = math.sqrt(footprint)
    gross = side * clim["storeyHeightM"] * b["floors"]  # per facade
    glazing = gross * b["wwr"]  # per facade
    wall = gross - glazing  # per facade
    return {
        "courtyardM2": courtyard,
        "roofM2": footprint - courtyard,
        "floorAreaM2": footprint * b["floors"],
        "grossFacadeM2": gross * len(FACADES),
        "glazingM2": glazing * len(FACADES),
        "wallM2": wall * len(FACADES),
        "glazingPerFacadeM2": glazing,
        "wallPerFacadeM2": wall,
    }


def analyse(b, ids, clim):
    fx = merge_effects(ids)
    geo = geometry(b, ids, clim)
    t_out = clim["outdoorPeakC"]
    t_in = clim["indoorComfortC"]
    ho = clim["surfaceHeatTransferCoeffWm2K"]
    sun = clim["solarPeakWm2"]

    wall_gain = 0.0
    glazing_gain = 0.0
    for f in FACADES:
        wall_exposed = geo["wallPerFacadeM2"] * fx["wallExposureMult"]
        t_sol = t_out + fx["wallAlpha"] * sun[f] / ho
        wall_gain += fx["wallU"] * wall_exposed * (t_sol - t_in)
        glazing_gain += (
            fx["glazingU"] * geo["glazingPerFacadeM2"] * (t_out - t_in)
            + fx["shgc"] * geo["glazingPerFacadeM2"] * sun[f] * fx["glazingShadingMult"]
        )

    roof_t_sol = t_out + fx["roofAlpha"] * sun["roof"] / ho
    roof_gain = fx["roofU"] * geo["roofM2"] * (roof_t_sol - t_in)

    ach_total = clim["calibration"]["baseAchPerHour"] + fx["achAdd"]
    vent = clim["airDensityTimesSpecificHeat"] * ach_total * clim["storeyHeightM"] / 3600
    heat_removal = clim["calibration"]["lumpedHeatLossWm2K"] + vent

    dryness = min(1.0, max(0.0, (100 - clim["relHumidityAfternoonPct"]) / 70))
    evap_gain = fx["evapCoolingK"] * dryness * heat_removal * geo["floorAreaM2"]

    total = wall_gain + glazing_gain + roof_gain - evap_gain
    gain_per_floor = total / geo["floorAreaM2"] if geo["floorAreaM2"] > 0 else 0.0
    return {
        "totalGainW": total,
        "gainPerFloorM2": gain_per_floor,
        "indoorPeakC": t_in + gain_per_floor / heat_removal,
    }


def cost_inr(b, ids, clim):
    geo = geometry(b, ids, clim)
    quantities = {
        "glazing_m2": geo["glazingM2"],
        "wall_m2": geo["wallM2"],
        "roof_m2": geo["roofM2"],
        "facade_m2": geo["grossFacadeM2"],
        "courtyard_m2": geo["courtyardM2"],
        "floor": b["floors"],
    }
    return sum(BY_ID[i]["unitCostInr"] * quantities[BY_ID[i]["costBasis"]] for i in ids)


def gain_ratio(b, ids, clim):
    """Gain with the interventions divided by gain without. Below 1 means cooling demand falls."""
    baseline = analyse(b, [], clim)
    current = analyse(b, ids, clim)
    return current["gainPerFloorM2"] / baseline["gainPerFloorM2"] if baseline["gainPerFloorM2"] > 0 else 1.0


def saving_inr(floors, footprint, base_kwh_per_m2, tariff, ratio):
    """Matches annualImpact in heatModel.js: cooling demand scales with the gain ratio."""
    base_kwh = base_kwh_per_m2 * footprint * floors
    return base_kwh * (1 - ratio) * tariff


def annual_saving_inr(b, ids, clim):
    return saving_inr(
        b["floors"],
        b["footprintM2"],
        clim["energy"]["baselineCoolingKwhPerM2Yr"],
        clim["energy"]["tariffInrPerKwh"],
        gain_ratio(b, ids, clim),
    )


def label(clim, b, ids):
    return [analyse(b, ids, clim)["indoorPeakC"], gain_ratio(b, ids, clim)]


# ---------- Sampling and features ----------

def sample_climate(rng):
    values = {name: rng.uniform(lo, hi) for name, (lo, hi) in BOUNDS.items()}
    return make_climate(
        values["outdoorPeakC"],
        values["relHumidityPct"],
        values["roofSolarWm2"],
        values["baselineCoolingKwhPerM2Yr"],
    )


def sample_case(rng):
    scenario = rng.choice(SCENARIOS)
    b = {
        "scenario": scenario,
        "floors": rng.randint(*FLOORS_RANGE),
        "footprintM2": rng.uniform(*FOOTPRINT_RANGE),
        "wwr": rng.uniform(*WWR_RANGE),
    }
    ids = [i for i in applicable_ids(scenario) if rng.random() < 0.5]
    return sample_climate(rng), b, [i for i in CATALOGUE_IDS if i in ids]


def encode(clim, b, ids):
    row = [
        clim["outdoorPeakC"],
        clim["relHumidityAfternoonPct"],
        clim["solarPeakWm2"]["roof"],
        clim["energy"]["baselineCoolingKwhPerM2Yr"],
        b["floors"],
        b["footprintM2"],
        b["wwr"],
    ]
    row += [1.0 if i in ids else 0.0 for i in CATALOGUE_IDS]
    return row


def build_dataset(n, rng):
    X, y = [], []
    while len(X) < n:
        clim, b, ids = sample_case(rng)
        X.append(encode(clim, b, ids))
        y.append(label(clim, b, ids))
    return np.array(X), np.array(y)


# ---------- Training and export ----------

def savings_from_rows(X, ratio):
    """Rupee savings for encoded rows. Columns 3, 4 and 5 are baseline kWh, floors and footprint."""
    tariff = CITY_FILES["delhi"]["energy"]["tariffInrPerKwh"]
    return X[:, 3] * X[:, 4] * X[:, 5] * (1 - ratio) * tariff


def metrics(X, y_true, y_pred):
    out = {}
    for k, name in enumerate(TARGETS):
        out[name] = {
            "mae": float(mean_absolute_error(y_true[:, k], y_pred[:, k])),
            "rmse": float(math.sqrt(mean_squared_error(y_true[:, k], y_pred[:, k]))),
            "r2": float(r2_score(y_true[:, k], y_pred[:, k])),
        }
    saved_true = savings_from_rows(X, y_true[:, 1])
    saved_pred = savings_from_rows(X, y_pred[:, 1])
    out["savedInr"] = {
        "mae": float(mean_absolute_error(saved_true, saved_pred)),
        "rmse": float(math.sqrt(mean_squared_error(saved_true, saved_pred))),
        "r2": float(r2_score(saved_true, saved_pred)),
        "note": "derived from gainRatio, in rupees per year",
    }
    return out


def forward(layers, x):
    """Same arithmetic the backend uses, so the export can be checked against sklearn."""
    h = x
    for layer in layers:
        h = h @ np.array(layer["weights"]) + np.array(layer["bias"])
        if layer["activation"] == "relu":
            h = np.maximum(h, 0.0)
    return h


def ranking_check(model_predict_saved, rng, n_buildings):
    """
    For fresh random buildings, enumerate every applicable subset, then ask which subset the surrogate
    ranks first by savings and compare it with the physics. Reports how often the top pick matches
    and how much saving is lost when it does not.
    """
    matches = 0
    regrets = []
    for _ in range(n_buildings):
        clim = sample_climate(rng)
        scenario = rng.choice(SCENARIOS)
        b = {
            "scenario": scenario,
            "floors": rng.randint(*FLOORS_RANGE),
            "footprintM2": rng.uniform(*FOOTPRINT_RANGE),
            "wwr": rng.uniform(*WWR_RANGE),
        }
        options = applicable_ids(scenario)
        subsets = [list(s) for k in range(len(options) + 1) for s in itertools.combinations(options, k)]
        physics = np.array([annual_saving_inr(b, s, clim) for s in subsets])
        X = np.array([encode(clim, b, s) for s in subsets])
        predicted = model_predict_saved(X)  # rupees per year, one per subset
        pick = int(np.argmax(predicted))
        best = physics.max()
        if physics[pick] >= best - 1e-6:
            matches += 1
        regrets.append(0.0 if best <= 0 else (best - physics[pick]) / best)
    return {
        "buildings": n_buildings,
        "topPickMatchesPhysicsPct": round(100 * matches / n_buildings, 1),
        "meanRegretPct": round(100 * float(np.mean(regrets)), 2),
        "regretsPct": [round(100 * r, 3) for r in regrets],
    }


def city_budget_check(model_predict_saved, rng, n_buildings):
    """
    The check the app actually faces: the four real cities, a random budget, and some exclusions.
    Only feasible subsets count, as in the optimiser. Compares the surrogate's pick with the physics.
    """
    matches = 0
    regrets = []
    for _ in range(n_buildings):
        city = rng.choice(CITY_IDS)
        clim = CITY_FILES[city]
        scenario = rng.choice(SCENARIOS)
        b = {
            "scenario": scenario,
            "floors": rng.randint(*FLOORS_RANGE),
            "footprintM2": rng.uniform(*FOOTPRINT_RANGE),
            "wwr": rng.uniform(*WWR_RANGE),
        }
        budget = rng.uniform(50_000, 800_000)
        excluded = [rng.choice(applicable_ids(scenario))] if rng.random() < 0.3 else []
        options = [i for i in applicable_ids(scenario) if i not in excluded]
        subsets = [list(s) for k in range(len(options) + 1) for s in itertools.combinations(options, k)]
        feasible = [s for s in subsets if cost_inr(b, s, clim) <= budget]
        if not feasible:
            continue
        physics = np.array([annual_saving_inr(b, s, clim) for s in feasible])
        X = np.array([encode(clim, b, s) for s in feasible])
        pick = int(np.argmax(model_predict_saved(X)))
        best = physics.max()
        if physics[pick] >= best - 1e-6:
            matches += 1
        regrets.append(0.0 if best <= 0 else (best - physics[pick]) / best)
    return {
        "buildings": len(regrets),
        "topPickMatchesPhysicsPct": round(100 * matches / len(regrets), 1),
        "meanRegretPct": round(100 * float(np.mean(regrets)), 2),
        "worstRegretPct": round(100 * float(np.max(regrets)), 2),
    }


FRONTEND_REPORT = REPO / "frontend" / "src" / "data" / "ml" / "surrogate-report.json"


def permutation_importance(predict_raw, X, y, rng, repeats=5):
    """
    For each feature, shuffle its column and measure how much the error on each target grows.
    Returned as a share of the total growth, so the bars add up to 100% per target.
    """
    base_mae = np.abs(predict_raw(X) - y).mean(axis=0)
    growth = np.zeros((X.shape[1], len(TARGETS)))
    for f in range(X.shape[1]):
        for _ in range(repeats):
            Xp = X.copy()
            Xp[:, f] = rng.permutation(Xp[:, f])
            growth[f] += np.abs(predict_raw(Xp) - y).mean(axis=0) - base_mae
        growth[f] /= repeats
    growth = np.clip(growth, 0, None)
    share = growth / growth.sum(axis=0, keepdims=True) * 100
    return {name: [round(float(v), 2) for v in share[:, k]] for k, name in enumerate(TARGETS)}


def build_report(model, X, y, X_test, y_test, predict_raw, rank, args, layers):
    """Diagnostics for the ML analysis page. Holds no weights, only what the charts need."""
    rng = np.random.default_rng(args.seed)
    pred_test = predict_raw(X_test)
    picks = rng.choice(len(X_test), size=min(200, len(X_test)), replace=False)
    scatter = [
        {"actual": round(float(y_test[i, 0]), 3), "predicted": round(float(pred_test[i, 0]), 3)}
        for i in picks
    ]
    ratio_scatter = [
        {"actual": round(float(y_test[i, 1]), 4), "predicted": round(float(pred_test[i, 1]), 4)}
        for i in picks
    ]
    floors = X[:, 4].astype(int)
    footprint_bins = np.histogram(X[:, 5], bins=10, range=FOOTPRINT_RANGE)[0]
    wwr_bins = np.histogram(X[:, 6], bins=9, range=WWR_RANGE)[0]
    included = X[:, 7:].sum(axis=1).astype(int)
    per_intervention = X[:, 7:].mean(axis=0) * 100
    return {
        "trainedOn": date.today().isoformat(),
        "seed": args.seed,
        "samples": args.samples,
        "architecture": {
            "inputs": len(FEATURES),
            "hidden": [layer["weights"][0].__len__() for layer in layers[:-1]],
            "outputs": len(TARGETS),
            "parameters": int(sum(np.array(layer["weights"]).size + len(layer["bias"]) for layer in layers)),
            "iterations": int(model.n_iter_),
            "bestValidationR2": round(float(max(model.validation_scores_)), 4),
            "activation": "relu",
            "optimiser": "adam",
        },
        "features": FEATURES,
        "targets": TARGETS,
        "testMetrics": metrics(X_test, y_test, pred_test),
        "rankingCheck": {k: v for k, v in rank.items() if k != "regretsPct"},
        "regretsPct": rank["regretsPct"],
        "scatter": scatter,
        "ratioScatter": ratio_scatter,
        "loss": {
            "train": [round(float(v), 5) for v in model.loss_curve_],
            "validationR2": [round(float(v), 5) for v in model.validation_scores_],
        },
        "importance": permutation_importance(predict_raw, X_test, y_test, rng),
        "sampling": {
            "floorsCounts": {str(f): int((floors == f).sum()) for f in range(FLOORS_RANGE[0], FLOORS_RANGE[1] + 1)},
            "footprintBins": footprint_bins.tolist(),
            "footprintRange": FOOTPRINT_RANGE,
            "wwrBins": wwr_bins.tolist(),
            "wwrRange": WWR_RANGE,
            "interventionShare": {name: round(float(v), 1) for name, v in zip(CATALOGUE_IDS, per_intervention)},
            "includedCounts": {str(n): int((included == n).sum()) for n in range(len(CATALOGUE_IDS) + 1)},
            "climateBounds": BOUNDS,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--samples", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--ranking-buildings", type=int, default=200)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    check_shared_constants()
    rng = random.Random(args.seed)
    X, y = build_dataset(args.samples, rng)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=args.seed)

    x_scaler = StandardScaler().fit(X_train)
    y_scaler = StandardScaler().fit(y_train)
    model = MLPRegressor(
        hidden_layer_sizes=(64, 64),
        activation="relu",
        solver="adam",
        alpha=1e-4,
        learning_rate_init=1e-3,
        max_iter=3000,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=50,
        random_state=args.seed,
    )
    model.fit(x_scaler.transform(X_train), y_scaler.transform(y_train))

    def predict_raw(features):
        scaled = model.predict(x_scaler.transform(features))
        return y_scaler.inverse_transform(scaled.reshape(len(features), -1))

    layers = []
    for k, (W, b_vec) in enumerate(zip(model.coefs_, model.intercepts_)):
        last = k == len(model.coefs_) - 1
        layers.append({
            "weights": W.tolist(),  # shape (inputs, outputs); row i feeds output j through weights[i][j]
            "bias": b_vec.tolist(),
            "activation": "linear" if last else "relu",
        })

    # Export check: the plain forward pass must match sklearn on the test set.
    exported = forward(
        layers,
        (X_test - x_scaler.mean_) / x_scaler.scale_,
    ) * y_scaler.scale_ + y_scaler.mean_
    assert np.allclose(exported, predict_raw(X_test), atol=1e-6), "exported weights do not match sklearn"

    test_metrics = metrics(X_test, y_test, predict_raw(X_test))
    rank = ranking_check(
        lambda Xs: savings_from_rows(Xs, predict_raw(Xs)[:, 1]),
        random.Random(args.seed + 1),
        args.ranking_buildings,
    )

    city_check = city_budget_check(
        lambda Xs: savings_from_rows(Xs, predict_raw(Xs)[:, 1]),
        random.Random(args.seed + 2),
        args.ranking_buildings,
    )
    report = build_report(model, X, y, X_test, y_test, predict_raw, rank, args, layers)
    report["cityBudgetCheck"] = city_check
    FRONTEND_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with open(FRONTEND_REPORT, "w") as f:
        json.dump(report, f)

    model_json = {
        "name": "vayuform-surrogate",
        "schemaVersion": 1,
        "trainedOn": date.today().isoformat(),
        "seed": args.seed,
        "samples": args.samples,
        "features": FEATURES,
        "targets": TARGETS,
        "inputScaler": {"mean": x_scaler.mean_.tolist(), "scale": x_scaler.scale_.tolist()},
        "targetScaler": {"mean": y_scaler.mean_.tolist(), "scale": y_scaler.scale_.tolist()},
        "layers": layers,
        "testMetrics": test_metrics,
        "rankingCheck": {k: v for k, v in rank.items() if k != "regretsPct"},
        "sampling": {
            "climateBounds": BOUNDS,
            "floors": FLOORS_RANGE,
            "footprintM2": FOOTPRINT_RANGE,
            "wwr": WWR_RANGE,
            "interventionChance": 0.5,
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(model_json, f)

    print(f"Samples: {args.samples} (train {len(X_train)}, test {len(X_test)})")
    for name in [*TARGETS, "savedInr"]:
        m = test_metrics[name]
        print(f"  {name}: MAE {m['mae']:.3f}, RMSE {m['rmse']:.3f}, R² {m['r2']:.4f}")
    print(f"Ranking check on {rank['buildings']} fresh buildings: top pick matches physics "
          f"{rank['topPickMatchesPhysicsPct']}% of the time, mean regret {rank['meanRegretPct']}%")
    print(f"City check on {city_check['buildings']} real-city buildings with budgets: top pick matches physics "
          f"{city_check['topPickMatchesPhysicsPct']}% of the time, mean regret {city_check['meanRegretPct']}%")
    print(f"Wrote {args.out} and {FRONTEND_REPORT}")


if __name__ == "__main__":
    main()
