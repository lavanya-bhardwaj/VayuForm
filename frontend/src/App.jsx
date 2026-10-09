import { useState } from "react";
import BuildingScene from "./components/3d/BuildingScene";
import ThermalSlider from "./components/ui/ThermalSlider";
import "./App.css";

const INTERVENTIONS = [
  {
    group: "Passive Cooling",
    items: [
      { id: "jali", name: "Jali Screen", desc: "Filters direct sunlight and reduces heat gain.", active: true },
      { id: "shade", name: "Solar Shade", desc: "Reduces window exposure to sunlight." },
    ],
  },
  {
    group: "Materials",
    items: [{ id: "terracotta", name: "Terracotta Wall", desc: "Reduces heat transfer through walls." }],
  },
  {
    group: "Roof",
    items: [{ id: "green-roof", name: "Green Roof", desc: "Reduces roof heat gain and improves insulation." }],
  },
];

const level = (score) => (score >= 66 ? "HIGH" : score >= 33 ? "MEDIUM" : "LOW");

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
  const [thermalScore, setThermalScore] = useState(100);
  const [tintOpacity, setTintOpacity] = useState(0.58);
  const [showJali, setShowJali] = useState(true);
  const [showControls, setShowControls] = useState(false);

  // placeholder maths – replace with real simulation later
  const heatRisk = Math.round(thermalScore * 0.72);
  const heatRiskAfter = showJali ? Math.round(heatRisk * 0.8) : heatRisk;
  const improvement = heatRisk ? Math.round(((heatRisk - heatRiskAfter) / heatRisk) * 100) : 0;
  const surfaceTemp = Math.round(30 + thermalScore * 0.11);

  const handleCardClick = (id) => {
    if (id === "jali") setShowJali((p) => !p);
  };

  return (
    <div className="vayu-app">
      {/* ---------- HEADER ---------- */}
      <header className="vayu-header">
        <div className="vayu-brand">
          <span className="brand-main">VAYU</span>
          <span className="brand-accent">FORM</span>
        </div>
        <div className="vayu-header-title">Passive Cooling Simulator</div>
        <div className="vayu-header-actions">
          <button className="btn ghost" onClick={() => setShowControls((p) => !p)}>
            Dev controls
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setThermalScore(100);
              setTintOpacity(0.58);
              setShowJali(false);
            }}
          >
            ↻ Reset
          </button>
          <button className="btn solid">⤓ Export</button>
        </div>
      </header>

      {/* ---------- BODY: 3 COLUMNS ---------- */}
      <div className="vayu-body">
        {/* LEFT: interventions */}
        <aside className="panel panel-left">
          <h2 className="panel-title">Interventions</h2>
          <p className="panel-sub">Click to apply to the building</p>

          {INTERVENTIONS.map((g) => (
            <section key={g.group} className="int-group">
              <h3 className="group-label">{g.group}</h3>
              {g.items.map((it) => {
                const locked = it.id !== "jali";
                const active = it.id === "jali" && showJali;
                return (
                  <button
                    key={it.id}
                    className={`int-card ${active ? "active" : ""} ${locked ? "locked" : ""}`}
                    onClick={() => !locked && handleCardClick(it.id)}
                    disabled={locked}
                  >
                    <div className="int-thumb" />
                    <div className="int-text">
                      <strong>{it.name}</strong>
                      <span>{it.desc}</span>
                      <em>{locked ? "🔒 Coming soon" : active ? "Applied" : "Click to apply"}</em>
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
            <BuildingScene thermalScore={thermalScore} tintOpacity={tintOpacity} showJali={showJali} />
          </div>
          {showControls && (
            <div className="dev-controls">
              <ThermalSlider
                value={thermalScore}
                onChange={setThermalScore}
                opacity={tintOpacity}
                onOpacityChange={setTintOpacity}
                showJali={showJali}
                onToggleJali={() => setShowJali((p) => !p)}
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
              <span className="metric-value hot">{level(thermalScore)}</span>
              <Meter score={thermalScore} />
            </div>
            <div className="metric">
              <span className="metric-label">Heat Risk</span>
              <span className="metric-value">
                {heatRisk} <small>/ 100</small>
              </span>
              <div className="bar"><div className="bar-fill" style={{ width: `${heatRisk}%` }} /></div>
            </div>
            <div className="metric">
              <span className="metric-label">Cooling Demand</span>
              <span className="metric-value hot">{level(thermalScore)}</span>
              <Meter score={thermalScore} />
            </div>
          </div>

          <h3 className="group-label impact-title">Impact</h3>
          <p className="panel-sub">Estimated improvement after applying intervention</p>

          <div className="card">
            <div className="metric">
              <span className="metric-label">Heat Risk</span>
              <span className="metric-value">
                {heatRisk} → {heatRiskAfter}
                {showJali && <span className="delta">↓ {improvement}%</span>}
              </span>
              <div className="bar"><div className="bar-fill" style={{ width: `${heatRiskAfter}%` }} /></div>
            </div>
            {showJali && <div className="toast">✓ Jali Screen added</div>}
          </div>
        </aside>
      </div>

      {/* ---------- FOOTER STATUS BAR ---------- */}
      <footer className="vayu-footer">
        <div className="stat"><span className="stat-label">Solar exposure</span><strong>{level(thermalScore)}</strong></div>
        <div className="stat"><span className="stat-label">Estimated surface temp.</span><strong>{surfaceTemp}°C</strong></div>
        <div className="stat"><span className="stat-label">Natural ventilation</span><strong>Moderate</strong></div>
        <div className="hint">ⓘ Select an intervention to apply it to the facade</div>
      </footer>
    </div>
  );
}

export default App;