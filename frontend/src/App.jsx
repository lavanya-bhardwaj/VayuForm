import { useMemo, useState } from "react";
import BuildingScene from "./components/3d/BuildingScene";
import HeatModel from "./engine/heatModel";
import Optimizer from "./engine/optimizer";
import RETVCalculator from "./engine/retv";
import { INTERVENTIONS } from "./engine/interventions";
import "./App.css";

const SCENARIOS = [
  { id: "retrofit", label: "Retrofit existing building" },
  { id: "new", label: "New build" },
];

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

function App() {
  const [building, setBuilding] = useState({
    floors: 2,
    width_m: 10,
    depth_m: 15,
    wwr: 0.35,
    courtyard: null,
    budget_rupees: 300000,
    scenario: "retrofit",
  });

  const [appliedIds, setAppliedIds] = useState([]);
  const [recommendation, setRecommendation] = useState(null);

  const candidates = useMemo(() => {
    return INTERVENTIONS.filter(i => i.applicableTo.includes(building.scenario));
  }, [building.scenario]);

  const baseline = useMemo(() => {
    const model = new HeatModel(building);
    return model.analyze([]);
  }, [building]);

  const current = useMemo(() => {
    const model = new HeatModel(building);
    return model.analyze(appliedIds);
  }, [building, appliedIds]);

  const retv = useMemo(() => {
    const calc = new RETVCalculator(building);
    return calc.calculateRETVDetailed(appliedIds);
  }, [building, appliedIds]);

  const appliedCostInr = useMemo(() => {
    const buildingArea = building.width_m * building.depth_m;
    let total = 0;
    appliedIds.forEach(intId => {
      const int = INTERVENTIONS.find(i => i.id === intId);
      if (int) {
        if (int.cost.unit === "m²") {
          total += int.cost.perUnit * buildingArea;
        } else if (int.cost.unit === "m_linear") {
          const perimeter = (building.width_m + building.depth_m) * 2;
          total += int.cost.perUnit * perimeter;
        } else if (int.cost.unit === "unit") {
          total += int.cost.perUnit;
        }
      }
    });
    return total;
  }, [building, appliedIds]);

  const paybackYears = appliedCostInr > 0 && baseline.annualCost_rupees ?
    appliedCostInr / Math.max(0.1, baseline.annualCost_rupees - current.annualCost_rupees) : null;

  const temperatureDrop = baseline.indoorPeakTemp_C - current.indoorPeakTemp_C;
  const annualSavings = baseline.annualCost_rupees - current.annualCost_rupees;
  const co2Reduction = baseline.annualCO2_kg - current.annualCO2_kg;

  const updateBuilding = (patch) => {
    setBuilding((b) => ({ ...b, ...patch }));
  };

  const toggle = (id) => {
    setAppliedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const runOptimiser = () => {
    const optimizer = new Optimizer(building, building.budget_rupees);
    const result = optimizer.optimize();
    setRecommendation(result);
    if (result.topPick) {
      setAppliedIds(result.topPick.interventions);
    }
  };

  const reset = () => {
    setBuilding({
      floors: 2,
      width_m: 10,
      depth_m: 15,
      wwr: 0.35,
      courtyard: null,
      budget_rupees: 300000,
      scenario: "retrofit",
    });
    setAppliedIds([]);
    setRecommendation(null);
  };

  const groups = [...new Set(candidates.map((c) => c.category))];
  const getInterventionName = (id) => INTERVENTIONS.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="vayu-app">
      <header className="vayu-header">
        <div className="vayu-brand">
          <span className="brand-main">VAYU</span>
          <span className="brand-accent">FORM</span>
        </div>
        <h1 className="vayu-subtitle">Passive Cooling Design for Delhi</h1>
        <div className="vayu-header-actions">
          <button className="btn-icon" onClick={reset} title="Reset all inputs">
            ↻ Reset
          </button>
          <button className="btn-icon" title="Export report">
            ⤓ Export
          </button>
        </div>
      </header>

      <div className="vayu-body">
        {/* LEFT PANEL: Inputs + Interventions */}
        <aside className="panel panel-left">
          <section className="input-section">
            <h2 className="section-title">Building Profile</h2>
            <div className="form-group">
              <label className="form-label">
                <span>Building Type</span>
                <select
                  value={building.scenario}
                  onChange={(e) => updateBuilding({ scenario: e.target.value })}
                  className="form-input"
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>

              <label className="form-label">
                <span>Floors</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={building.floors}
                  onChange={(e) => updateBuilding({ floors: Math.max(1, Number(e.target.value) || 1) })}
                  className="form-input"
                />
              </label>

              <label className="form-label">
                <span>Width (m)</span>
                <input
                  type="number"
                  min="5"
                  value={building.width_m}
                  onChange={(e) => updateBuilding({ width_m: Math.max(5, Number(e.target.value) || 5) })}
                  className="form-input"
                />
              </label>

              <label className="form-label">
                <span>Depth (m)</span>
                <input
                  type="number"
                  min="5"
                  value={building.depth_m}
                  onChange={(e) => updateBuilding({ depth_m: Math.max(5, Number(e.target.value) || 5) })}
                  className="form-input"
                />
              </label>

              <label className="form-label">
                <span>Window-Wall Ratio</span>
                <input
                  type="range"
                  min="0.2"
                  max="0.6"
                  step="0.05"
                  value={building.wwr}
                  onChange={(e) => updateBuilding({ wwr: Number(e.target.value) })}
                  className="form-slider"
                />
                <span className="slider-value">{(building.wwr * 100).toFixed(0)}%</span>
              </label>

              <label className="form-label">
                <span>Budget (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={building.budget_rupees}
                  onChange={(e) => updateBuilding({ budget_rupees: Math.max(0, Number(e.target.value) || 0) })}
                  className="form-input"
                />
              </label>
            </div>

            <button className="btn-primary" onClick={runOptimiser}>
              Find Best Combo
            </button>
          </section>

          <section className="interventions-section">
            <h2 className="section-title">Interventions</h2>
            <p className="section-hint">Click to apply to your design</p>

            {groups.map((group) => (
              <div key={group} className="intervention-group">
                <h3 className="group-name">{group}</h3>
                {candidates
                  .filter((c) => c.category === group)
                  .map((intervention) => {
                    const isApplied = appliedIds.includes(intervention.id);
                    const cost = (() => {
                      const area = building.width_m * building.depth_m;
                      if (intervention.cost.unit === "m²") return intervention.cost.perUnit * area;
                      if (intervention.cost.unit === "m_linear") {
                        const perimeter = (building.width_m + building.depth_m) * 2;
                        return intervention.cost.perUnit * perimeter;
                      }
                      return intervention.cost.perUnit;
                    })();

                    return (
                      <button
                        key={intervention.id}
                        className={`intervention-card ${isApplied ? "active" : ""}`}
                        onClick={() => toggle(intervention.id)}
                      >
                        <div className="intervention-icon">🏗</div>
                        <div className="intervention-info">
                          <strong>{intervention.name}</strong>
                          <small className="hindi-text">{intervention.hindiName}</small>
                          <p className="description">{intervention.description}</p>
                          <span className="cost">{inr(cost)}</span>
                        </div>
                        {isApplied && <div className="check-mark">✓</div>}
                      </button>
                    );
                  })}
              </div>
            ))}
          </section>
        </aside>

        {/* CENTRE: 3D Viewport */}
        <main className="viewport-container">
          <BuildingScene
            thermalScore={current.indoorPeakTemp_C}
            showJali={appliedIds.includes("jali_screen")}
          />
        </main>

        {/* RIGHT PANEL: Analytics */}
        <aside className="panel panel-right">
          <section className="analysis-section">
            <h2 className="section-title">Analysis</h2>

            <div className="metric-card">
              <span className="metric-label">Baseline Peak Temperature</span>
              <span className="metric-value">{baseline.indoorPeakTemp_C.toFixed(1)}°C</span>
            </div>

            {appliedIds.length > 0 && (
              <div className="metric-card highlight">
                <span className="metric-label">Current Peak Temperature</span>
                <div className="temp-comparison">
                  <span className="metric-value">{current.indoorPeakTemp_C.toFixed(1)}°C</span>
                  <span className="delta-positive">↓ {temperatureDrop.toFixed(1)}°C</span>
                </div>
              </div>
            )}

            <div className="metric-card">
              <span className="metric-label">Annual Cooling Demand</span>
              <span className="metric-value">{current.annualCoolingKwh.toLocaleString()} <small>kWh</small></span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Annual Cost</span>
              <span className="metric-value">{inr(current.annualCost_rupees)} <small>/yr</small></span>
            </div>

            <div className="metric-card">
              <span className="metric-label">RETV (Envelope Efficiency)</span>
              <div className="retv-display">
                <span className="retv-value">{retv.retv} W/m²K</span>
                <span className={`retv-status ${retv.compliance === 'PASS' ? 'pass' : 'fail'}`}>
                  {retv.compliance === 'PASS' ? '✓ PASS (≤15)' : '✗ FAIL (target ≤15)'}
                </span>
              </div>
            </div>
          </section>

          {appliedIds.length > 0 && (
            <section className="impact-section">
              <h2 className="section-title">Impact</h2>

              <div className="impact-grid">
                <div className="impact-item">
                  <span className="impact-label">Temperature Drop</span>
                  <span className="impact-value positive">{temperatureDrop.toFixed(1)}°C</span>
                </div>
                <div className="impact-item">
                  <span className="impact-label">Annual Savings</span>
                  <span className="impact-value positive">{inr(annualSavings)}</span>
                </div>
                <div className="impact-item">
                  <span className="impact-label">CO₂ Reduction</span>
                  <span className="impact-value positive">{(co2Reduction / 1000).toFixed(2)} t/yr</span>
                </div>
                <div className="impact-item">
                  <span className="impact-label">Installation Cost</span>
                  <span className="impact-value">{inr(appliedCostInr)}</span>
                </div>
                {paybackYears !== null && paybackYears > 0 && (
                  <div className="impact-item">
                    <span className="impact-label">Payback Period</span>
                    <span className="impact-value">{paybackYears.toFixed(1)} years</span>
                  </div>
                )}
              </div>

              <div className="applied-list">
                <span className="list-title">Applied Interventions:</span>
                {appliedIds.map(id => (
                  <span key={id} className="tag">{getInterventionName(id)}</span>
                ))}
              </div>
            </section>
          )}

          {recommendation && recommendation.topPick && (
            <section className="recommendation-section">
              <h2 className="section-title">💡 Recommendation</h2>
              <div className="recommendation-card">
                <p className="rec-text">
                  Best combination within {inr(building.budget_rupees)}:
                </p>
                <div className="rec-details">
                  {recommendation.topPick.interventions.length > 0 ? (
                    <>
                      <div className="rec-item">
                        <strong>{recommendation.topPick.interventions.map(id => getInterventionName(id)).join(" + ")}</strong>
                      </div>
                      <div className="rec-item">
                        <span>Peak Temperature:</span> {recommendation.topPick.indoorPeakTemp_C.toFixed(1)}°C
                      </div>
                      <div className="rec-item">
                        <span>Annual Savings:</span> {inr(recommendation.topPick.indoorPeakTemp_C * 2000)} /yr
                      </div>
                    </>
                  ) : (
                    <p>No interventions fit your budget.</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>

      <footer className="vayu-footer">
        <div className="footer-stat">
          <span className="stat-label">Building</span>
          <strong>{building.floors}F × {(building.width_m * building.depth_m).toFixed(0)}m²</strong>
        </div>
        <div className="footer-stat">
          <span className="stat-label">Peak Temperature</span>
          <strong>{current.indoorPeakTemp_C.toFixed(1)}°C</strong>
        </div>
        <div className="footer-stat">
          <span className="stat-label">Applied</span>
          <strong>{appliedIds.length} intervention{appliedIds.length !== 1 ? 's' : ''}</strong>
        </div>
        <div className="footer-hint">ⓘ Physics-based simulation using Delhi climate data & Indian standards</div>
      </footer>
    </div>
  );
}

export default App;
