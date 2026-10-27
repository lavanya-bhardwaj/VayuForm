import { useMemo, useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import BuildingScene from "./components/3d/BuildingScene";
import ThermalSlider from "./components/ui/ThermalSlider";
import AanganInterior from "./components/3d/AanganInterior";
import { analyse, annualImpact, buildGeometry, interventionCostInr } from "./engine/heatModel";
import { BUILDING_LIMITS, DEFAULT_BUILDING, sanitiseBuilding } from "./engine/building";
import { interventionsFor } from "./engine/interventions";
import { optimise, totalCostInr } from "./engine/optimizer";
import { runValidation } from "./engine/validation";
import { validateConduction } from "./engine/validation_conduction";
import { validateSolar } from "./engine/validation_solar";
import { validateInterventions } from "./engine/validation_interventions";
import { validateEconomics } from "./engine/validation_economics";
import { getSunTimes, getOutdoorTemperature } from "./utils/sunPosition";
import { CLIMATES, SITE_IDS, climateFor } from "./engine/climate";
import "./App.css";

const API_URL = "http://localhost:3001";

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
  // Climate for the building's city. Everything location-dependent reads from this.
  const climate = climateFor(building.site);
  // The selected interventions live on the building, so they travel with it.
  const active = building.interventions;
  const setActive = (ids) => setBuilding((b) => sanitiseBuilding({ ...b, interventions: ids }));
  const [overrideScore, setOverrideScore] = useState(null);
  const [tintOpacity, setTintOpacity] = useState(0.58);
  const [showControls, setShowControls] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [viewMode, setViewMode] = useState("exterior");
  const [compare, setCompare] = useState("after");
  const [brief, setBrief] = useState("");
  const [briefing, setBriefing] = useState(false);
  const [briefResult, setBriefResult] = useState(null);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState(null);

  // Sun position: hour of day (0-24)
  const { sunrise, sunset } = getSunTimes(undefined, climate.site);
  const [sunHour, setSunHour] = useState((sunrise + sunset) / 2); // midday
  const [showSunSlider, setShowSunSlider] = useState(false);

  useEffect(() => {
    // Run physics engine validation on startup
    runValidation();
  }, []);

  const candidates = useMemo(
    () => interventionsFor(building.scenario).filter((c) => !building.excluded.includes(c.id)),
    [building.scenario, building.excluded]
  );
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
  const currentOutdoorTemp = getOutdoorTemperature(sunHour, climate, climate.site);
  const adjustedCurrent = useMemo(() => {
    const adjusted = { ...current };
    // Scale indoor peak based on outdoor temperature change
    const tempDelta = currentOutdoorTemp - climate.outdoorPeakC;
    adjusted.indoorPeakC = current.indoorPeakC + tempDelta;
    return adjusted;
  }, [sunHour, current, currentOutdoorTemp]);

  const updateBuilding = (patch) => {
    setBuilding((b) => sanitiseBuilding({ ...b, ...patch }));
    setOverrideScore(null);
  };

  const toggle = (id) => {
    if (building.excluded.includes(id)) return; // left out by a follow-up; remove it from the chips first
    setOverrideScore(null);
    setActive(active.includes(id) ? active.filter((x) => x !== id) : [...active, id]);
  };

  const runOptimiser = () => {
    const result = optimise(building);
    setRecommendation(result);
    setExplanation(null);
    if (result.best) {
      setActive(result.best.ids);
      setOverrideScore(null);
    }
  };

  // Sends the best set's figures to the local backend. The backend returns AI text, or template text if it can't reach the model.
  const explainBest = async () => {
    const best = recommendation?.best;
    if (!best) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const r = await fetch(`${API_URL}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: best.ids.map(nameOf),
          costInr: Math.round(best.costInr),
          savedInr: Math.round(best.savedInr),
          paybackYears: Math.round(best.paybackYears * 10) / 10,
          indoorPeakC: Math.round(best.indoorPeakC * 10) / 10,
          baselinePeakC: Math.round(baseline.indoorPeakC * 10) / 10,
          climate: {
            location: climate.location,
            outdoorPeakC: climate.outdoorPeakC,
            outdoorNightLowC: climate.outdoorNightLowC,
            relHumidityAfternoonPct: climate.relHumidityAfternoonPct,
            roofSolarWm2: climate.solarPeakWm2.roof,
          },
        }),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      setExplanation(await r.json());
    } catch {
      setExplanation({
        text: "Could not reach the explanation service. Check that the backend is running on port 3001.",
        source: "error",
      });
    } finally {
      setExplaining(false);
    }
  };

  // Saves the building's constraints, re-runs the optimiser and applies the best set under them.
  const applyConstraints = (next) => {
    setBuilding(next);
    setOverrideScore(null);
    const result = optimise(next);
    setRecommendation(result);
    setExplanation(null);
    if (result.best) setActive(result.best.ids);
    return result;
  };

  // Reads a follow-up such as "I don't want aangan, suggest something else" into exclusions and requirements.
  const refineRecommendation = async () => {
    if (!refineText.trim()) return;
    setRefining(true);
    setRefineNote(null);
    try {
      const r = await fetch(`${API_URL}/api/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: refineText }),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = await r.json();
      const excluded = [...new Set([...building.excluded, ...data.exclude])].filter((id) => !data.include.includes(id));
      const required = [...new Set([...building.required, ...data.include])].filter((id) => !data.exclude.includes(id));
      const next = sanitiseBuilding({
        ...building,
        excluded,
        required,
        ...(data.budgetInr !== undefined ? { budgetInr: data.budgetInr } : {}),
      });
      const result = applyConstraints(next);
      const changed = data.exclude.length + data.include.length + (data.budgetInr !== undefined ? 1 : 0);
      const parts = [];
      if (data.exclude.length) parts.push(`Left out ${data.exclude.map(nameOf).join(", ")}`);
      if (data.include.length) parts.push(`Required ${data.include.map(nameOf).join(", ")}`);
      if (data.budgetInr !== undefined) parts.push(`Budget set to ${inr(data.budgetInr)}`);
      const text = changed
        ? `${parts.join(". ")}. ${result.best ? "Re-ran the recommendation." : "Nothing fits these limits."}`
        : "No change from that follow-up. Name an intervention, for example \"no aangan\", or a budget.";
      setRefineNote({ text, source: data.source });
      setRefineText("");
    } catch {
      setRefineNote({ text: "Could not reach the follow-up service. Check that the backend is running on port 3001.", source: "error" });
    } finally {
      setRefining(false);
    }
  };

  const removeConstraint = (kind, id) => {
    applyConstraints(sanitiseBuilding({ ...building, [kind]: building[kind].filter((x) => x !== id) }));
  };

  // Reads the brief, fills the form, then runs the recommendation and applies the best set.
  const planFromBrief = async () => {
    if (!brief.trim()) return;
    setBriefing(true);
    setBriefResult(null);
    try {
      const r = await fetch(`${API_URL}/api/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = await r.json();
      const found = Object.keys(data.fields).length > 0;
      if (found) {
        updateBuilding(data.fields);
        const result = optimise(sanitiseBuilding({ ...building, ...data.fields }));
        setRecommendation(result);
        setExplanation(null);
        if (result.best) setActive(result.best.ids);
      }
      setBriefResult({ assumptions: data.assumptions, source: data.source, found });
    } catch {
      setBriefResult({ assumptions: ["Could not reach the brief service. Check that the backend is running on port 3001."], source: "error", found: false });
    } finally {
      setBriefing(false);
    }
  };

  const reset = () => {
    setBuilding(DEFAULT_BUILDING);
    setOverrideScore(null);
    setTintOpacity(0.58);
    setRecommendation(null);
  };

  // Numbers shown in the Building Analysis card: the building as it is today, or with the selected interventions.
  const shown =
    compare === "before"
      ? {
          score: baseline.thermalScore,
          indoorPeakC: baseline.indoorPeakC + (currentOutdoorTemp - climate.outdoorPeakC),
          coolingKwh: impact.coolingKwh + impact.savedKwh,
        }
      : { score: thermalScore, indoorPeakC: adjustedCurrent.indoorPeakC, coolingKwh: impact.coolingKwh };

  const groups = [...new Set(candidates.map((c) => c.category))];
  const nameOf = (id) => candidates.find((c) => c.id === id)?.name ?? id;
  
const exportReport = () => {
  const pdf = new jsPDF();
  let y = 20;

  const addLine = (text, size = 11) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(String(text), 170);

    if (y + lines.length * 7 > 275) {
      pdf.addPage();
      y = 20;
    }

    pdf.text(lines, 20, y);
    y += lines.length * 7 + 2;
  };

  const addHeading = (text) => {
    y += 4;
    addLine(text, 15);
    y += 2;
  };

  // Report title
  pdf.setFontSize(22);
  pdf.text("VayuForm", 20, y);
  y += 10;

  addLine("Passive Cooling Analysis Report", 16);
  addLine(`Generated: ${new Date().toLocaleDateString("en-IN")}`);
  addLine(" ");

  // Building details
  addHeading("1. Building Configuration");
  addLine(`Scenario: ${building.scenario}`);
  addLine(`Number of floors: ${building.floors}`);
  addLine(`Building footprint: ${building.footprintM2} m²`);
  addLine(`Budget: ${inr(building.budgetInr)}`);
  addLine(`Window-to-wall ratio: ${building.wwr}`);

  // Cooling strategies
  addHeading("2. Applied Cooling Strategies");

  if (applied.length > 0) {
    applied.forEach((item) => addLine(`• ${nameOf(item.id)}`));
  } else {
    addLine("No cooling strategies selected.");
  }

  // Thermal analysis
  addHeading("3. Thermal Analysis");
  addLine(`Thermal score: ${thermalScore}/100 (${level(thermalScore)})`);
  addLine(`Outdoor temperature: ${currentOutdoorTemp}°C`);
  addLine(`Estimated indoor peak temperature: ${adjustedCurrent.indoorPeakC}°C`);
  addLine(`Baseline indoor peak temperature: ${baseline.indoorPeakC}°C`);
  addLine(`Estimated cooling energy: ${impact.coolingKwh} kWh/year`);

  // Financial and environmental impact
  addHeading("4. Financial & Environmental Impact");
  addLine(`Estimated annual savings: ${inr(impact.savedInr)}`);
  addLine(`Estimated annual CO₂ reduction: ${impact.savedCo2Kg} kg`);
  addLine(`Estimated implementation cost: ${inr(appliedCostInr)}`);
  addLine(
    `Estimated payback period: ${
      paybackYears !== null ? `${paybackYears.toFixed(1)} years` : "Not available"
    }`
  );

  // Recommendation, if available
  if (recommendation?.best?.ids?.length) {
    addHeading("5. Recommended Cooling Strategies");
    recommendation.best.ids.forEach((id) => {
      addLine(`• ${nameOf(id)}`);
    });
    addLine(
      `Estimated savings from recommendation: ${inr(recommendation.best.savedInr)}`
    );
  }

  // Disclaimer
  addHeading("Disclaimer");
  addLine(
    "All figures are estimates generated by a simplified model and may differ from actual building performance and costs. Validate results with qualified professionals before making implementation decisions.",
    9
  );

  // Page numbers
  const pageCount = pdf.internal.getNumberOfPages();

  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setFontSize(9);
    pdf.text(`Page ${page} of ${pageCount}`, 190, 287, {
      align: "right",
    });
  }

  pdf.save("VayuForm_Cooling_Analysis_Report.pdf");
};


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
          <button className="btn solid" onClick={exportReport}>
  ⤓ Export Report
</button>
          <div className="location-chip">📍 {climate.location}</div>
          <div className="avatar">◯</div>
        </div>
      </header>

      {/* ---------- BRIEF BAR: describe the building in plain words ---------- */}
      <section className="vayu-brief">
        <form
          className="brief-form"
          onSubmit={(e) => {
            e.preventDefault();
            planFromBrief();
          }}
        >
          <label className="brief-label" htmlFor="brief-input">Describe the building</label>
          <input
            id="brief-input"
            className="brief-input"
            type="text"
            maxLength={1000}
            placeholder="e.g. Two-storey house in Jaipur, 120 sq m, budget 3 lakh, retrofit the existing home"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <button className="btn brief-btn" type="submit" disabled={briefing || !brief.trim()}>
            {briefing ? "Planning…" : "Plan from brief"}
          </button>
        </form>
        {briefResult && (
          <div className="brief-note">
            {briefResult.found ? "Filled from your brief and recommended the best set" : "Nothing filled"}
            {briefResult.source === "groq" && " · AI-written"}
            {briefResult.source === "rules" && " · simple rules"}
            {briefResult.assumptions.length > 0 && (
              <ul>
                {briefResult.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ---------- BODY: 3 COLUMNS ---------- */}
      <div className="vayu-body">
        {/* LEFT: project + interventions */}
        <aside className="panel panel-left">
          <h2 className="panel-title">Project</h2>
          <div className="card project-form">
            <label className="field">
              <span>Location</span>
              <select value={building.site} onChange={(e) => updateBuilding({ site: e.target.value })}>
                {SITE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CLIMATES[id].site.name}
                  </option>
                ))}
              </select>
            </label>
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
                min={BUILDING_LIMITS.floors.min}
                max={BUILDING_LIMITS.floors.max}
                value={building.floors}
                onChange={(e) => updateBuilding({ floors: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Footprint per floor (m²)</span>
              <input
                type="number"
                min={BUILDING_LIMITS.footprintM2.min}
                step="10"
                value={building.footprintM2}
                onChange={(e) => updateBuilding({ footprintM2: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Budget (₹)</span>
              <input
                type="number"
                min={BUILDING_LIMITS.budgetInr.min}
                step="10000"
                value={building.budgetInr}
                onChange={(e) => updateBuilding({ budgetInr: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Window-to-wall ratio</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range"
                  min={BUILDING_LIMITS.wwr.min}
                  max={BUILDING_LIMITS.wwr.max}
                  step="0.05"
                  value={building.wwr}
                  onChange={(e) => updateBuilding({ wwr: e.target.value })}
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

          <div className="compare-switch">
            {["before", "after"].map((m) => (
              <button key={m} className={compare === m ? "on" : ""} onClick={() => setCompare(m)}>
                {m === "before" ? "Before" : "After"}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="metric">
              <span className="metric-label">Solar Exposure</span>
              <span className={`metric-value ${level(shown.score) === "HIGH" ? "hot" : ""}`}>
                {level(shown.score)}
              </span>
              <Meter score={shown.score} />
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
                {shown.indoorPeakC.toFixed(1)} <small>°C</small>
              </span>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${Math.min(100, ((shown.indoorPeakC - 28) / 20) * 100)}%` }} />
              </div>
            </div>
            <div className="metric">
              <span className="metric-label">Cooling demand (est.)</span>
              <span className="metric-value">
                {Math.round(shown.coolingKwh).toLocaleString("en-IN")} <small>kWh / yr</small>
              </span>
            </div>
          </div>
          <p className="climate-source">
            Design peak {climate.outdoorPeakC} °C from Open-Meteo, {climate.site.name} 2015–2024 (May–June). Vertical sun values are still placeholders.
          </p>

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
              <form
                className="refine-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  refineRecommendation();
                }}
              >
                <label className="field">
                  <span>Follow-up on the recommendation</span>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="e.g. I don't want aangan, suggest something else"
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                  />
                </label>
                <button className="btn solid" type="submit" disabled={refining || !refineText.trim()}>
                  {refining ? "Re-planning…" : "Update recommendation"}
                </button>
              </form>
              {(building.excluded.length > 0 || building.required.length > 0) && (
                <div className="constraint-chips">
                  {building.excluded.map((id) => (
                    <button key={`x-${id}`} className="constraint-chip" onClick={() => removeConstraint("excluded", id)}>
                      Not {nameOf(id)} ✕
                    </button>
                  ))}
                  {building.required.map((id) => (
                    <button key={`r-${id}`} className="constraint-chip" onClick={() => removeConstraint("required", id)}>
                      Must have {nameOf(id)} ✕
                    </button>
                  ))}
                </div>
              )}
              {refineNote && (
                <p className="refine-note">
                  {refineNote.text}
                  {refineNote.source === "groq" && " · AI-understood"}
                  {refineNote.source === "rules" && " · simple rules"}
                </p>
              )}
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
              {recommendation.best?.ids.length > 0 && (
                <button className="btn solid explain-btn" onClick={explainBest} disabled={explaining}>
                  {explaining ? "Writing explanation…" : "Explain this recommendation"}
                </button>
              )}
              {explanation && (
                <p className="explanation">
                  {explanation.text}
                  <small className="explain-source">
                    {explanation.source === "groq" ? "AI-written" : explanation.source === "template" ? "Template text" : "Error"}
                  </small>
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ---------- FOOTER STATUS BAR ---------- */}
      <footer className="vayu-footer">
        <div className="stat"><span className="stat-label">Solar exposure</span><strong>{level(thermalScore)}</strong></div>
        <div className="stat"><span className="stat-label">Indoor peak</span><strong>{current.indoorPeakC.toFixed(1)}°C</strong></div>
        <div className="stat"><span className="stat-label">Air changes / hr</span><strong>{current.achTotal.toFixed(1)}</strong></div>
      </footer>
    </div>
  );
}

export default App;
