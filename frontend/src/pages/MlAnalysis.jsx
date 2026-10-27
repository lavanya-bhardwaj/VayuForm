import { useState } from "react";
import report from "../data/ml/surrogate-report.json";
import { API_URL } from "../config";
import { CLIMATES, SITE_IDS } from "../engine/climate";
import { BUILDING_LIMITS, DEFAULT_BUILDING, sanitiseBuilding } from "../engine/building";
import { INTERVENTIONS, interventionsFor } from "../engine/interventions";
import { analyse, annualImpact } from "../engine/heatModel";
import { optimise } from "../engine/optimizer";
import { BarList, Card, Histogram, LineChart, PALETTE, ScatterPlot, Stat } from "../components/charts/Charts";

const LABELS = {
  outdoorPeakC: "Design outdoor peak",
  relHumidityPct: "Afternoon humidity",
  roofSolarWm2: "Roof sun",
  baselineCoolingKwhPerM2Yr: "Baseline cooling need",
  floors: "Floors",
  footprintM2: "Footprint",
  wwr: "Window-to-wall ratio",
  ...Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i.name])),
};

const pct = (v, digits = 1) => `${v.toFixed(digits)}%`;
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Counts regret values into bands, so the histogram reads as "how often is the pick close enough". */
function regretBands(values) {
  const edges = [1, 2, 5, 10, 20, Infinity];
  const labels = ["≤1%", "1–2%", "2–5%", "5–10%", "10–20%", ">20%"];
  const counts = edges.map(() => 0);
  for (const v of values) {
    const k = edges.findIndex((e) => v <= e);
    counts[k === -1 ? edges.length - 1 : k] += 1;
  }
  return { counts, labels };
}

const footprintLabels = report.sampling.footprintBins.map((_, i) => {
  const [lo, hi] = report.sampling.footprintRange;
  return String(Math.round(lo + ((hi - lo) / report.sampling.footprintBins.length) * i));
});
const wwrLabels = report.sampling.wwrBins.map((_, i) => {
  const [lo, hi] = report.sampling.wwrRange;
  return `${Math.round((lo + ((hi - lo) / report.sampling.wwrBins.length) * i) * 100)}%`;
});

const METRIC_ROWS = [
  { key: "indoorPeakC", label: "Indoor peak (°C)", digits: 2 },
  { key: "gainRatio", label: "Cooling-demand ratio", digits: 4 },
  { key: "savedInr", label: "Annual saving (₹, derived)", digits: 0 },
];

const PIPELINE = [
  { title: "Physics engine", text: "heatModel.js, the reference the app already uses" },
  { title: "Sample 5,000", text: "Random buildings, sites and intervention sets" },
  { title: "Label", text: "The engine gives the true peak and gain ratio for each sample" },
  { title: "Train", text: "A small network learns the mapping: 15 inputs → 64 → 64 → 2 outputs" },
  { title: "Export", text: "Weights saved as plain JSON, about 116 KB, no ML library at runtime" },
  { title: "Serve", text: "/api/ml/predict and /api/ml/optimize answer in microseconds" },
];

export default function MlAnalysis() {
  const regret = regretBands(report.regretsPct);
  const arch = report.architecture;
  const test = report.testMetrics;
  const city = report.cityBudgetCheck;

  // ----- live check state -----
  const [site, setSite] = useState(DEFAULT_BUILDING.site);
  const [scenario, setScenario] = useState("retrofit");
  const [floors, setFloors] = useState(2);
  const [footprint, setFootprint] = useState(100);
  const [wwr, setWwr] = useState(0.2);
  const [budget, setBudget] = useState(300000);
  const [ids, setIds] = useState(["jali", "green-roof", "khus-chik"]);
  const [compare, setCompare] = useState(null);
  const [rank, setRank] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const building = sanitiseBuilding({ site, scenario, floors, footprintM2: footprint, wwr, budgetInr: budget });
  const options = interventionsFor(building.scenario);
  const chosen = ids.filter((id) => options.some((o) => o.id === id));

  const toggleId = (id) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const physicsFor = (b, set) => {
    const base = analyse(b, []);
    const cur = analyse(b, set);
    return { indoorPeakC: cur.indoorPeakC, savedInr: annualImpact(b, set, base).savedInr };
  };

  const runCompare = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/ml/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building, ids: chosen }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `status ${r.status}`);
      setCompare({ model: data, physics: physicsFor(building, chosen) });
    } catch (err) {
      setError(`Could not reach the model service (${err.message}). Start the backend on port 3001.`);
    } finally {
      setBusy(false);
    }
  };

  const runRank = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/ml/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `status ${r.status}`);
      const physicsBest = optimise(building).best;
      setRank({
        model: data,
        // Savings the engine gives for the same sets the model ranked, so the two lists are comparable.
        physicsForModel: data.ranked.map((row) => ({ ...row, physicsSavedInr: physicsFor(building, row.ids).savedInr })),
        physicsBest,
      });
    } catch (err) {
      setError(`Could not reach the model service (${err.message}). Start the backend on port 3001.`);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id) => LABELS[id] ?? id;

  return (
    <div className="page-body">
      <header className="page-hero">
        <span className="page-kicker">ML analysis</span>
        <h1>A small neural network that copies the heat engine</h1>
        <p>
          The physics engine is slow to explore many combinations. This network was trained on 5,000 samples from that engine,
          so it can estimate a result in microseconds. These are its measured results and a live check against the engine.
        </p>
      </header>

      <div className="stat-grid">
        <Stat label="Training samples" value={report.samples.toLocaleString("en-IN")} hint={`Seed ${report.seed}, trained ${report.trainedOn}`} />
        <Stat label="Indoor peak accuracy" value={`R² ${test.indoorPeakC.r2.toFixed(3)}`} hint={`Average error ${test.indoorPeakC.mae.toFixed(2)} °C`} />
        <Stat label="Saving accuracy" value={`R² ${test.savedInr.r2.toFixed(3)}`} hint={`Average error ${inr(test.savedInr.mae)} a year`} />
        <Stat label="Top pick, real cities" value={pct(city.topPickMatchesPhysicsPct, 0)} hint="Share of buildings where the model's first choice is the engine's first choice" tone="warn" />
        <Stat label="Mean lost saving" value={pct(city.meanRegretPct)} hint={`Worst case ${pct(city.worstRegretPct)} · with budgets and exclusions`} tone="warn" />
        <Stat label="Parameters" value={arch.parameters.toLocaleString("en-IN")} hint={`${arch.iterations} training passes, early stopping`} />
      </div>

      <Card title="How it was built" sub="Each step runs from scripts/train_surrogate.py. Re-running it reproduces every number on this page.">
        <ol className="pipeline">
          {PIPELINE.map((step, i) => (
            <li key={step.title}>
              <span className="pipeline-num">{i + 1}</span>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="chart-grid">
        <Card title="Indoor peak: model against engine" sub={`${report.scatter.length} held-out samples. Points on the diagonal are exact.`}>
          <ScatterPlot points={report.scatter.map((p) => ({ actual: p.actual, predicted: p.predicted }))} xLabel="peak" yLabel="peak" unit="°C" />
        </Card>
        <Card title="Cooling-demand ratio: model against engine" sub="Ratio below 1 means the interventions cut cooling demand. Savings follow from this exactly.">
          <ScatterPlot points={report.ratioScatter.map((p) => ({ actual: p.actual, predicted: p.predicted }))} xLabel="ratio" yLabel="ratio" />
        </Card>

        <Card title="Learning curve" sub="Training loss falls as the network learns. Validation score rises, then the run stops when it stops improving.">
          <LineChart
            series={[{ name: "Training loss", values: report.loss.train, color: PALETTE[1] }]}
            labels={report.loss.train.map((_, i) => String(i + 1))}
            yFormat={(v) => v.toFixed(3)}
          />
        </Card>
        <Card title="Validation score" sub="R² on a validation slice during training. Closer to 1 is better.">
          <LineChart
            series={[{ name: "Validation R²", values: report.loss.validationR2, color: PALETTE[0] }]}
            labels={report.loss.validationR2.map((_, i) => String(i + 1))}
            yFormat={(v) => v.toFixed(3)}
          />
        </Card>

        <Card title="What drives the indoor peak" sub="Share of the error increase when each input is scrambled. Bigger share means the model leans on that input more.">
          <BarList
            items={report.features
              .map((f, k) => ({ label: nameOf(f), value: report.importance.indoorPeakC[k] }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10)}
            format={(v) => `${v.toFixed(1)}%`}
          />
        </Card>
        <Card title="What drives the cooling-demand ratio" sub="Same measure, for the ratio that sets the annual saving.">
          <BarList
            items={report.features
              .map((f, k) => ({ label: nameOf(f), value: report.importance.gainRatio[k] }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10)}
            color="var(--accent)"
            format={(v) => `${v.toFixed(1)}%`}
          />
        </Card>

        <Card title="How close is the model's first pick?" sub={`${city.buildings} real-city buildings with random budgets and exclusions. Count of buildings in each lost-saving band.`}>
          <Histogram values={regret.counts} labels={regret.labels} color={PALETTE[2]} />
        </Card>
        <Card title="Training data: how many interventions per sample" sub="The 5,000 samples were drawn across this range, so the model has seen each count.">
          <Histogram
            values={Object.values(report.sampling.includedCounts)}
            labels={Object.keys(report.sampling.includedCounts)}
            color={PALETTE[3]}
          />
        </Card>

        <Card title="Floors in the training set" sub="Samples are spread evenly across 1–5 floors.">
          <Histogram values={Object.values(report.sampling.floorsCounts)} labels={Object.keys(report.sampling.floorsCounts)} color={PALETTE[4]} />
        </Card>
        <Card title="Footprint and window ratio ranges" sub="Footprint in m² per floor, window-to-wall ratio across 0.1–0.6.">
          <Histogram values={report.sampling.footprintBins} labels={footprintLabels} color={PALETTE[0]} />
          <div className="spacer" />
          <Histogram values={report.sampling.wwrBins} labels={wwrLabels} color={PALETTE[5]} />
        </Card>

        <Card title="How often each intervention appears" sub="Share of all 5,000 samples that include it. Only options allowed for the building type are sampled.">
          <BarList
            items={Object.entries(report.sampling.interventionShare)
              .map(([id, v]) => ({ label: nameOf(id), value: v }))
              .sort((a, b) => b.value - a.value)}
            format={(v) => `${v.toFixed(1)}%`}
          />
        </Card>
        <Card title="Model shape">
          <div className="arch">
            {[arch.inputs, ...arch.hidden, arch.outputs].map((n, i, all) => (
              <div key={i} className="arch-col">
                <div className="arch-nodes">
                  {Array.from({ length: Math.min(n, 6) }, (_, k) => (
                    <span key={k} className={`arch-node ${i === 0 ? "in" : i === all.length - 1 ? "out" : ""}`} />
                  ))}
                  {n > 6 && <span className="arch-more">+{n - 6}</span>}
                </div>
                <span className="arch-label">
                  {i === 0 ? `${n} inputs` : i === all.length - 1 ? `${n} outputs` : `${n} hidden`}
                </span>
              </div>
            ))}
          </div>
          <p className="page-card-sub">
            Inputs: site climate, floors, footprint, window ratio and one switch per intervention. Outputs: indoor peak and cooling-demand ratio.
            Best validation R² {arch.bestValidationR2.toFixed(3)}.
          </p>
        </Card>
      </div>

      <Card title="Accuracy on held-out samples" sub="Measured on the 20% of samples the model never trained on. Savings are derived from the ratio and converted to rupees.">
        <table className="metric-table">
          <thead>
            <tr>
              <th>Quantity</th>
              <th>Average error</th>
              <th>Typical error (RMSE)</th>
              <th>R²</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{test[row.key].mae.toFixed(row.digits)}</td>
                <td>{test[row.key].rmse.toFixed(row.digits)}</td>
                <td>{test[row.key].r2.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Try it live" sub="Pick a building. The model and the physics engine run on the same inputs so you can compare them." wide>
        <div className="live-grid">
          <div className="live-inputs">
            <label className="field">
              <span>Location</span>
              <select value={site} onChange={(e) => setSite(e.target.value)}>
                {SITE_IDS.map((id) => (
                  <option key={id} value={id}>{CLIMATES[id].site.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Building type</span>
              <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                <option value="retrofit">Retrofit existing building</option>
                <option value="new">New build</option>
              </select>
            </label>
            <label className="field">
              <span>Floors</span>
              <input type="number" min={BUILDING_LIMITS.floors.min} max={BUILDING_LIMITS.floors.max} value={floors} onChange={(e) => setFloors(e.target.value)} />
            </label>
            <label className="field">
              <span>Footprint per floor (m²)</span>
              <input type="number" min={BUILDING_LIMITS.footprintM2.min} value={footprint} onChange={(e) => setFootprint(e.target.value)} />
            </label>
            <label className="field">
              <span>Window-to-wall ratio: {Math.round(building.wwr * 100)}%</span>
              <input type="range" min={BUILDING_LIMITS.wwr.min} max={BUILDING_LIMITS.wwr.max} step="0.05" value={wwr} onChange={(e) => setWwr(e.target.value)} />
            </label>
            <label className="field">
              <span>Budget (₹)</span>
              <input type="number" min={0} step="10000" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>

          <div className="live-main">
            <div className="chip-row">
              {options.map((o) => (
                <button key={o.id} className={`pick-chip ${chosen.includes(o.id) ? "on" : ""}`} onClick={() => toggleId(o.id)}>
                  {o.name}
                </button>
              ))}
            </div>
            <div className="live-actions">
              <button className="btn solid" onClick={runCompare} disabled={busy}>
                Compare model with engine
              </button>
              <button className="btn solid" onClick={runRank} disabled={busy}>
                Rank best sets within budget
              </button>
            </div>
            {error && <p className="page-error">{error}</p>}

            {compare && (
              <div className="compare">
                <div className="compare-row">
                  <span>Indoor peak</span>
                  <BarPair label="°C" engine={compare.physics.indoorPeakC} model={compare.model.indoorPeakC} digits={2} />
                </div>
                <div className="compare-row">
                  <span>Annual saving</span>
                  <BarPair label="₹" engine={compare.physics.savedInr} model={compare.model.savedInr} digits={0} money />
                </div>
                <p className="page-card-sub">
                  Model answered in {(compare.model.inferenceMs * 1000).toFixed(0)} µs on the server. Engine peak
                  {" "}{compare.physics.indoorPeakC.toFixed(2)} °C, model {compare.model.indoorPeakC.toFixed(2)} °C.
                </p>
              </div>
            )}

            {rank && (
              <div className="rank">
                <p className="page-card-sub">
                  Model searched {rank.model.evaluated} sets in {rank.model.inferenceMs.toFixed(2)} ms. Top five, with the engine's saving for each:
                </p>
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Interventions</th>
                      <th>Cost</th>
                      <th>Model saving</th>
                      <th>Engine saving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rank.physicsForModel.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{row.ids.length ? row.ids.map(nameOf).join(" + ") : "None"}</td>
                        <td>{inr(row.costInr)}</td>
                        <td>{inr(row.savedInr)}</td>
                        <td>{inr(row.physicsSavedInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rank.physicsBest && (
                  <p className="page-card-sub">
                    The engine's own best within budget: {rank.physicsBest.ids.length ? rank.physicsBest.ids.map(nameOf).join(" + ") : "None"},
                    saving {inr(rank.physicsBest.savedInr)} a year.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Limits to keep in mind" wide>
        <ul className="notes">
          <li>The model copies the engine. It cannot be more accurate than the engine's own assumptions, such as the placeholder vertical sun values.</li>
          <li>Ranking is good but not perfect. Several sets often save almost the same amount, so a near miss costs little.</li>
          <li>Climate values are sampled across the four cities. A new city needs a wider sampling range and a retrain.</li>
          <li>With the current eight interventions the engine is already fast. The model earns its place when the catalogue grows.</li>
        </ul>
      </Card>
    </div>
  );
}

/** Two bars for the same quantity, one for the engine and one for the model. */
function BarPair({ label, engine, model, digits, money = false }) {
  const max = Math.max(1e-9, Math.abs(engine), Math.abs(model));
  const fmt = (v) => (money ? inr(v) : `${v.toFixed(digits)} ${label}`);
  const diff = model - engine;
  return (
    <div className="bar-pair">
      <div className="bar-pair-row">
        <span className="bar-pair-name">Engine</span>
        <span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(Math.abs(engine) / max) * 100}%`, background: "var(--primary)" }} /></span>
        <span className="bar-list-value">{fmt(engine)}</span>
      </div>
      <div className="bar-pair-row">
        <span className="bar-pair-name">Model</span>
        <span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(Math.abs(model) / max) * 100}%`, background: "var(--accent)" }} /></span>
        <span className="bar-list-value">{fmt(model)}</span>
      </div>
      <span className="bar-pair-diff">Difference {money ? inr(diff) : `${diff.toFixed(digits)} ${label}`}</span>
    </div>
  );
}
