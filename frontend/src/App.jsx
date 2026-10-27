import { useMemo, useState, useEffect } from "react";
import BuildingScene from "./components/3d/BuildingScene";
import ThermalSlider from "./components/ui/ThermalSlider";
import AanganInterior from "./components/3d/AanganInterior";
import { DEFAULT_BUILDING, analyse, annualImpact, buildGeometry, interventionCostInr } from "./engine/heatModel";
import { interventionsFor } from "./engine/interventions";
import { optimise, totalCostInr } from "./engine/optimizer";
import { runValidation } from "./engine/validation";
import { validateConduction } from "./engine/validation_conduction";
import { validateSolar } from "./engine/validation_solar";
import { validateInterventions } from "./engine/validation_interventions";
import { validateEconomics } from "./engine/validation_economics";
import { getSunTimes, getOutdoorTemperature } from "./utils/sunPosition";
import climate from "./data/climate/delhi.json";
import "./App.css";

const VIEW_MODES = [
  { id: "exterior", label: "3D Exterior" },
  { id: "courtyard", label: "Courtyard" },
];

const SCENARIOS = [
  { id: "retrofit", label: "Retrofit existing building" },
  { id: "new", label: "New build" },
];

const level = (score) => (score >= 66 ? "HIGH" : score >= 33 ? "MEDIUM" : "LOW");
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

/* 7-segment meter, like the mock */
function Meter({ score }) {
  const filled = Math.round((score / 100) * 7);
  return (
    <div className="meter">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className={i < filled ? "seg on" : "seg"} />
      ))}
    </div>
  );
}

function App() {
  const [building, setBuilding] = useState(DEFAULT_BUILDING);
  const [active, setActive] = useState([]);
  const [overrideScore, setOverrideScore] = useState(null);
  const [tintOpacity, setTintOpacity] = useState(0.58);
  const [showControls, setShowControls] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [viewMode, setViewMode] = useState("exterior");

  // Sun position: hour of day (0-24)
  const { sunrise, sunset } = getSunTimes();
  const [sunHour, setSunHour] = useState((sunrise + sunset) / 2); // midday
  const [showSunSlider, setShowSunSlider] = useState(false);

  useEffect(() => {
    // Run physics engine validation on startup
    runValidation();
  }, []);

  const candidates = useMemo(() => interventionsFor(building.scenario), [building.scenario]);
  // Drop interventions that don't fit the chosen scenario, e.g. rat-trap walls after switching to retrofit.
  const applied = useMemo(
    () => active.filter((id) => candidates.some((c) => c.id === id)),
    [active, candidates]
  );

  const baseline = useMemo(() => analyse(building, []), [building]);
  const current = useMemo(() => analyse(building, applied), [building, applied]);
  const impact = useMemo(() => annualImpact(building, applied, baseline), [building, applied, baseline]);
  const appliedCostInr = totalCostInr(building, applied);
  const paybackYears = impact.savedInr > 0 ? appliedCostInr / impact.savedInr : null;

  const thermalScore = overrideScore ?? current.thermalScore;

  // Calculate time-dependent outdoor temperature
  const currentOutdoorTemp = getOutdoorTemperature(sunHour);
  const adjustedCurrent = useMemo(() => {
    const adjusted = { ...current };
    // Scale indoor peak based on outdoor temperature change
    const tempDelta = currentOutdoorTemp - climate.outdoorPeakC;
    adjusted.indoorPeakC = current.indoorPeakC + tempDelta;
    return adjusted;
  }, [sunHour, current, currentOutdoorTemp]);

  const updateBuilding = (patch) => {
    setBuilding((b) => ({ ...b, ...patch }));
    setOverrideScore(null);
  };

  const toggle = (id) => {
    setOverrideScore(null);
    setActive((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const runOptimiser = () => {
    const result = optimise(building);
    setRecommendation(result);
    if (result.best) {
      setActive(result.best.ids);
      setOverrideScore(null);
    }
  };

  const reset = () => {
    setBuilding(DEFAULT_BUILDING);
    setActive([]);
    setOverrideScore(null);
    setTintOpacity(0.58);
    setRecommendation(null);
  };

  const groups = [...new Set(candidates.map((c) => c.category))];
  const nameOf = (id) => candidates.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="vayu-app">
      {/* ---------- SIDEBAR ---------- */}
      <nav className="vayu-sidebar">
        <button className="nav-item active">⌂ Home</button>
        <button className="nav-item">▦ Explore Heat Map</button>
        <button className="nav-item">▤ My Projects</button>
        <button className="nav-item">ⓘ About</button>
        <div className="sidebar-tagline">Sustainable architecture<br />for a cooler tomorrow.</div>
      </nav>

      {/* ---------- HEADER ---------- */}
      <header className="vayu-header">
        <div className="vayu-brand">
          <span className="brand-main">VAYU</span>
          <span className="brand-accent">FORM</span>
        </div>
        <div className="vayu-header-title">Cooler Buildings. Healthier Cities.</div>
        <div className="vayu-header-actions">
          <button className="btn ghost" onClick={() => setShowControls((p) => !p)}>
            Dev controls
          </button>
          <button className="btn ghost" onClick={reset}>
            ↻ Reset
          </button>
          <button className="btn solid">⤓ Export</button>
          <div className="location-chip">📍 Delhi, India</div>
          <div className="avatar">◯</div>
        </div>
      </header>

      {/* ---------- BODY: 3 COLUMNS ---------- */}
      <div className="vayu-body">
        {/* LEFT: project + interventions */}
        <aside className="panel panel-left">
          <h2 className="panel-title">Project</h2>
          <div className="card project-form">
            <label className="field">
              <span>Building type</span>
              <select value={building.scenario} onChange={(e) => updateBuilding({ scenario: e.target.value })}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Floors</span>
              <input
                type="number"
                min="1"
                max="5"
                value={building.floors}
                onChange={(e) => updateBuilding({ floors: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <label className="field">
              <span>Footprint per floor (m²)</span>
              <input
                type="number"
                min="20"
                step="10"
                value={building.footprintM2}
                onChange={(e) => updateBuilding({ footprintM2: Math.max(20, Number(e.target.value) || 20) })}
              />
            </label>
            <label className="field">
              <span>Budget (₹)</span>
              <input
                type="number"
                min="0"
                step="10000"
                value={building.budgetInr}
                onChange={(e) => updateBuilding({ budgetInr: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="field">
              <span>Window-to-wall ratio</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range"
                  min="0.1"
                  max="0.6"
                  step="0.05"
                  value={building.wwr}
                  onChange={(e) => updateBuilding({ wwr: Number(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: '45px', fontSize: '0.9em', fontWeight: 'bold' }}>
                  {(building.wwr * 100).toFixed(0)}%
                </span>
              </div>
            </label>
            <button className="btn solid rec-btn" onClick={runOptimiser}>
              Recommend best within budget
            </button>
          </div>

          <h2 className="panel-title interventions-title">Interventions</h2>
          <p className="panel-sub">Click to apply to the building</p>

          {groups.map((group) => (
            <section key={group} className="int-group">
              <h3 className="group-label">{group}</h3>
              {candidates
                .filter((c) => c.category === group)
                .map((it) => {
                  const on = applied.includes(it.id);
                  const cost = interventionCostInr(it, building, buildGeometry(building, [it.id]));
                  return (
                    <button key={it.id} className={`int-card ${on ? "active" : ""}`} onClick={() => toggle(it.id)}>
                      <div className="int-thumb" />
                      <div className="int-text">
                        <strong>
                          {it.name} <small className="hindi">{it.hindiName}</small>
                        </strong>
                        <span>{it.description}</span>
                        <em>
                          {on ? "Applied" : "Click to apply"} · est. {inr(cost)}
                        </em>
                      </div>
                    </button>
                  );
                })}
            </section>
          ))}
        </aside>

        {/* CENTRE: viewport */}
        <main className="vayu-center">
          <div className="vayu-viewport">
            <div className="view-switch">
              {VIEW_MODES.map((m) => (
                <button key={m.id} className={viewMode === m.id ? "on" : ""} onClick={() => setViewMode(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            {viewMode !== "exterior" && (
              <AanganInterior
                building={building}
                hasAangan={applied.includes("aangan")}
                showJali={applied.includes("jali")}
                showKhusChik={applied.includes("khus-chik")}
                hasGreenRoof={applied.includes("green-roof")}
                thermalScore={thermalScore}
                tintOpacity={tintOpacity}
                sunHour={sunHour}
              />
            )}
            {viewMode === "exterior" && <BuildingScene
              building={building}
              thermalScore={thermalScore}
              tintOpacity={tintOpacity}
              showJali={applied.includes("jali")}
              showChhajja={applied.includes("chhajja")}
              showKhusChik={applied.includes("khus-chik")}
              hasCoolRoof={applied.includes("lime-cool-roof")}
              showGreenRoof={applied.includes("green-roof")}
              sunHour={sunHour}
            />}
          </div>

          {/* Time slider - compact sun icon */}
          {!showSunSlider && (
            <button
              onClick={() => setShowSunSlider(true)}
              style={{
                position: "fixed",
                bottom: "100px",
                right: "20px",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                border: "none",
                background: "rgba(255, 215, 0, 0.3)",
                cursor: "pointer",
                fontSize: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.3s",
                zIndex: 1000,
              }}
              onMouseEnter={(e) => e.target.style.background = "rgba(255, 215, 0, 0.5)"}
              onMouseLeave={(e) => e.target.style.background = "rgba(255, 215, 0, 0.3)"}
            >
              ☀️
            </button>
          )}

          {showSunSlider && (
            <>
              {/* Click outside to close */}
              <div
                onClick={() => setShowSunSlider(false)}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 999,
                }}
              />
              {/* Popup */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "fixed",
                  bottom: "100px",
                  right: "20px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "16px",
                  minWidth: "300px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 1000,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "500", color: "#2b2623" }}>Time of Day</span>
                  <button
                    onClick={() => setShowSunSlider(false)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "18px" }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <input
                    type="range"
                    min={sunrise.toFixed(2)}
                    max={sunset.toFixed(2)}
                    step="0.25"
                    value={sunHour}
                    onChange={(e) => setSunHour(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: "60px", fontSize: "0.9em", fontWeight: "bold", color: "#2b2623" }}>
                    {Math.floor(sunHour)}:{String(Math.round((sunHour % 1) * 60)).padStart(2, "0")}
                  </span>
                </div>
              </div>
            </>
          )}
          {showControls && (
            <div className="dev-controls">
              <ThermalSlider
                value={thermalScore}
                onChange={setOverrideScore}
                opacity={tintOpacity}
                onOpacityChange={setTintOpacity}
                showJali={applied.includes("jali")}
                onToggleJali={() => toggle("jali")}
                showChhajja={applied.includes("chhajja")}
                onToggleChhajja={() => toggle("chhajja")}
                showKhusChik={applied.includes("khus-chik")}
                onToggleKhusChik={() => toggle("khus-chik")}
              />
            </div>
          )}
        </main>

        {/* RIGHT: analysis */}
        <aside className="panel panel-right">
          <h2 className="panel-title">Building Analysis</h2>

          <div className="card">
            <div className="metric">
              <span className="metric-label">Solar Exposure</span>
              <span className={`metric-value ${level(thermalScore) === "HIGH" ? "hot" : ""}`}>
                {level(thermalScore)}
              </span>
              <Meter score={thermalScore} />
            </div>
            <div className="metric">
              <span className="metric-label">Outdoor temperature (now)</span>
              <span className="metric-value">
                {currentOutdoorTemp.toFixed(1)} <small>°C</small>
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Indoor peak temperature</span>
              <span className="metric-value">
                {adjustedCurrent.indoorPeakC.toFixed(1)} <small>°C</small>
              </span>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${Math.min(100, ((current.indoorPeakC - 28) / 20) * 100)}%` }} />
              </div>
            </div>
            <div className="metric">
              <span className="metric-label">Cooling demand (est.)</span>
              <span className="metric-value">
                {Math.round(impact.coolingKwh).toLocaleString("en-IN")} <small>kWh / yr</small>
              </span>
            </div>
          </div>

          <h3 className="group-label impact-title">Impact</h3>
          <p className="panel-sub">Compared with the building as it is today</p>

          <div className="card">
            <div className="metric">
              <span className="metric-label">Indoor peak</span>
              <span className="metric-value">
                {baseline.indoorPeakC.toFixed(1)} → {adjustedCurrent.indoorPeakC.toFixed(1)} <small>°C</small>
                {applied.length > 0 && (
                  <span className="delta">
                    ↓ {(baseline.indoorPeakC - adjustedCurrent.indoorPeakC).toFixed(1)} °C
                  </span>
                )}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Annual saving</span>
              <span className="metric-value">
                {inr(impact.savedInr)} <small>/ yr</small>
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">CO₂ avoided</span>
              <span className="metric-value">
                {(impact.savedCo2Kg / 1000).toFixed(2)} <small>t / yr</small>
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Cost of applied set</span>
              <span className="metric-value">
                {inr(appliedCostInr)}
                {paybackYears !== null && <small> · payback {paybackYears.toFixed(1)} yrs</small>}
              </span>
            </div>
            {applied.length > 0 && (
              <div className="toast">✓ {applied.map(nameOf).join(", ")}</div>
            )}
          </div>

          {recommendation && (
            <div className="card rec-card">
              <div className="metric">
                <span className="metric-label">Best within {inr(building.budgetInr)}</span>
                {recommendation.best ? (
                  <>
                    <span className="metric-value">
                      {recommendation.best.ids.length ? recommendation.best.ids.map(nameOf).join(" + ") : "Nothing needed"}
                    </span>
                    <span className="metric-label">
                      Saves {inr(recommendation.best.savedInr)} / yr · peak {recommendation.best.indoorPeakC.toFixed(1)} °C
                    </span>
                  </>
                ) : (
                  <span className="metric-label">No combination fits this budget.</span>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ---------- FOOTER STATUS BAR ---------- */}
      <footer className="vayu-footer">
        <div className="stat"><span className="stat-label">Solar exposure</span><strong>{level(thermalScore)}</strong></div>
        <div className="stat"><span className="stat-label">Indoor peak</span><strong>{current.indoorPeakC.toFixed(1)}°C</strong></div>
        <div className="stat"><span className="stat-label">Air changes / hr</span><strong>{current.achTotal.toFixed(1)}</strong></div>
        <div className="hint">ⓘ Estimates from a simplified model. Costs are rough, pending CPWD DSR check.</div>
      </footer>
    </div>
  );
}

export default App;
