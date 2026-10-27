import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { INTERVENTIONS } from "../engine/interventions";
import { BarList, Card, Donut, LineChart, PALETTE, Stat } from "../components/charts/Charts";
import { GrowBars, TraceLine } from "../components/charts/AnimatedCharts";

const SOURCE = {
  groq: { label: "AI model", color: PALETTE[0] },
  rules: { label: "Simple rules", color: PALETTE[3] },
  template: { label: "Template text", color: PALETTE[2] },
  error: { label: "Error", color: PALETTE[5] },
};

const KIND = {
  brief: "Brief reader",
  refine: "Follow-up reader",
  explain: "Explanation writer",
};

const NAME = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i.name]));
const SHORT = {
  jali: "Jali",
  chhajja: "Chhajja",
  aangan: "Aangan",
  "lime-cool-roof": "Lime roof",
  "green-roof": "Green roof",
  "rat-trap-wall": "Rat-trap wall",
  "khus-chik": "Khus chik",
  "clerestory-vent": "Clerestory",
};

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const shortTime = (ms) => new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const PIPELINE = [
  { title: "You type a brief", text: "Plain English in the dashboard bar, or a follow-up on the recommendation" },
  { title: "AI reads it", text: "Groq runs openai/gpt-oss-20b and returns JSON: fields, or a list of changes" },
  { title: "Server checks it", text: "Ranges clamped, ids matched to the catalogue, cities matched to the four known sites" },
  { title: "Engine searches", text: "Physics engine tries every allowed combination within budget. No AI here" },
  { title: "Engine computes", text: "Peak temperature, cooling demand, saving, cost and payback, all from formulas" },
  { title: "AI explains", text: "Groq writes three or four sentences from those numbers only" },
];

const ROLES = [
  {
    title: "Brief reader",
    endpoint: "POST /api/brief",
    model: "Groq · gpt-oss-20b · temperature 0",
    reads: "A sentence about the building, e.g. “Two-storey house in Jaipur, 120 sq m, budget 3 lakh, retrofit”.",
    writes: "JSON with scenario, site, floors, footprint, window ratio and budget. Only fields the sentence states.",
    checks: "Numbers clamped to the form's limits. Budget written as “3 lakh” or “₹3,00,000” becomes a plain number. Assumptions kept only if they touch the engine's inputs.",
    fallback: "Rules pick out floors, m², budget (₹, lakh, crore), city names and new-build or retrofit words.",
  },
  {
    title: "Follow-up reader",
    endpoint: "POST /api/refine",
    model: "Groq · gpt-oss-20b · temperature 0",
    reads: "A request such as “I don't want aangan, suggest something else” or “budget 2 lakh”.",
    writes: "Lists of techniques to leave out and to require, plus an optional budget.",
    checks: "Only the eight catalogue ids are accepted, and each has a set of words it answers to (e.g. “khus”, “courtyard”, “roshandan”).",
    fallback: "Splits the sentence at commas and “but”. A clause with a negative word such as “no” or “don't” leaves the technique out.",
  },
  {
    title: "Explanation writer",
    endpoint: "POST /api/explain",
    model: "Groq · gpt-oss-20b · temperature 0.2",
    reads: "The engine's figures for the chosen set: cost, saving, payback, peaks, and the city's climate.",
    writes: "Three or four plain sentences naming the city and one traditional method.",
    checks: "Told to quote only the figures given. Rupee amounts arrive pre-formatted, so the model cannot reword them.",
    fallback: "A template sentence built from the same figures, labelled “Template text” on screen.",
  },
];

export default function AiView({ aiLog, onRecord, view }) {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);

  const [brief, setBrief] = useState("");
  const [briefing, setBriefing] = useState(false);
  const [briefOut, setBriefOut] = useState(null);

  const [followUp, setFollowUp] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineOut, setRefineOut] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  // Same call the dashboard makes. Timed here so the activity charts can show how long each one took.
  const send = async (path, body) => {
    const started = performance.now();
    const r = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? `status ${r.status}`);
    return { data, ms: performance.now() - started };
  };

  const runBrief = async () => {
    setBriefing(true);
    setBriefOut(null);
    try {
      const { data, ms } = await send("/api/brief", { brief });
      setBriefOut({ data });
      onRecord({ kind: "brief", source: data.source, ms, input: brief, summary: `${Object.keys(data.fields).length} fields read` });
    } catch (err) {
      setBriefOut({ error: `Could not reach the backend (${err.message}).` });
      onRecord({ kind: "brief", source: "error", ms: 0, input: brief, summary: "Backend unreachable" });
    } finally {
      setBriefing(false);
    }
  };

  const runRefine = async () => {
    setRefining(true);
    setRefineOut(null);
    try {
      const { data, ms } = await send("/api/refine", { message: followUp });
      setRefineOut({ data });
      const n = data.exclude.length + data.include.length;
      onRecord({ kind: "refine", source: data.source, ms, input: followUp, summary: `${n} change${n === 1 ? "" : "s"} read` });
    } catch (err) {
      setRefineOut({ error: `Could not reach the backend (${err.message}).` });
      onRecord({ kind: "refine", source: "error", ms: 0, input: followUp, summary: "Backend unreachable" });
    } finally {
      setRefining(false);
    }
  };

  // ----- recommendation breakdown -----
  const steps = view?.breakdown.steps ?? [];
  const drops = steps.map((s) => ({ label: SHORT[s.id] ?? NAME[s.id], value: s.standaloneDropC }));
  const dropDetails = steps.map((s) => [
    ["Alone, peak", `${s.standalonePeakC.toFixed(2)} °C`],
    ["Drop alone", `${s.standaloneDropC.toFixed(2)} °C`],
    ["Added in order", `${s.stepDropC.toFixed(2)} °C`],
  ]);
  const traceLabels = view ? ["Baseline", ...steps.map((s) => SHORT[s.id] ?? NAME[s.id])] : [];
  const tracePoints = view ? [view.breakdown.baselinePeakC, ...steps.map((s) => s.peakC)] : [];
  const traceDetails = view
    ? [
        { title: "Baseline", rows: [["Peak", `${view.breakdown.baselinePeakC.toFixed(2)} °C`]] },
        ...steps.map((s) => ({
          title: `+ ${NAME[s.id]}`,
          rows: [
            ["Peak", `${s.peakC.toFixed(2)} °C`],
            ["This step", `−${s.stepDropC.toFixed(2)} °C`],
            ["Total drop", `−${s.cumulativeDropC.toFixed(2)} °C`],
          ],
        })),
      ]
    : [];

  // The main chart: shown first on the page whenever there is a recommendation.
  const heroChart = view && (
    <section className="hero-chart page-card">
      <div className="hero-chart-head">
        <div>
          <span className="page-kicker">Live recommendation · {view.location}</span>
          <h2>How each technique brings the indoor peak down</h2>
          <p className="page-card-sub">Hover a point for the values at that step. The line draws in from left to right each time this page opens.</p>
        </div>
        <div className="hero-chart-total">
          <strong>−{(view.breakdown.baselinePeakC - view.breakdown.finalPeakC).toFixed(1)} °C</strong>
          <span>
            {view.breakdown.baselinePeakC.toFixed(1)} → {view.breakdown.finalPeakC.toFixed(1)} °C design-day peak
          </span>
        </div>
      </div>
      {steps.length ? (
        <TraceLine tall points={tracePoints} labels={traceLabels} details={traceDetails} />
      ) : (
        <p className="page-card-sub">No techniques in the recommendation, so the peak stays at the baseline.</p>
      )}
    </section>
  );

  // ----- activity charts from the call log -----
  const bySource = Object.keys(SOURCE)
    .map((k) => ({ label: SOURCE[k].label, value: aiLog.filter((e) => e.source === k).length, color: SOURCE[k].color }))
    .filter((p) => p.value > 0);
  const byKind = Object.keys(KIND).map((k) => ({ label: KIND[k], value: aiLog.filter((e) => e.kind === k).length }));
  const timed = aiLog.filter((e) => e.ms > 0);
  const aiCalls = aiLog.filter((e) => e.source === "groq").length;
  const fallbacks = aiLog.filter((e) => e.source === "rules" || e.source === "template").length;
  const avgMs = timed.length ? timed.reduce((s, e) => s + e.ms, 0) / timed.length : 0;

  return (
    <div className="page-body">
      {heroChart}
      <header className="page-hero">
        <span className="page-kicker">AI view</span>
        <h1>How VayuForm uses AI, and the breakdown of this recommendation</h1>
        <p>
          The AI reads words and writes sentences. It does not calculate. Temperatures, savings and costs come from the physics
          engine, and the explanation is written only from those figures.
        </p>
      </header>

      <div className="stat-grid">
        <Stat
          label="Backend"
          value={healthError ? "Offline" : health ? "Connected" : "Checking…"}
          hint={health ? `Port 3001 · ${health.model}` : "Start the backend on port 3001 to use the AI"}
          tone={healthError ? "warn" : "good"}
        />
        <Stat
          label="API key"
          value={health ? (health.keyLoaded ? "Loaded" : "Not set") : "—"}
          hint={health && !health.keyLoaded ? "Without a key, the app uses simple rules and templates" : "Read by the server only, never sent to the browser"}
          tone={health && !health.keyLoaded ? "warn" : "good"}
        />
        <Stat label="AI calls this session" value={aiCalls} hint={`${fallbacks} used the fallback`} />
        <Stat label="Average response" value={timed.length ? `${avgMs.toFixed(0)} ms` : "—"} hint="Measured in the browser" />
      </div>

      {/* ---------- THE CURRENT RECOMMENDATION ---------- */}
      {!view && (
        <Card title="No recommendation yet" sub="Describe a building in the dashboard's brief bar and press Plan from brief, or press Recommend best within budget. Then press Explore AI.">
          <p className="page-card-sub">The breakdown appears here with an animated chart of how each technique lowers the indoor peak.</p>
        </Card>
      )}

      {view && (
        <>
          <Card title="Recommendation at a glance" sub={`${view.location} · ${view.scenario === "new" ? "new build" : "retrofit"} · ${view.floors} floors · ${view.footprintM2} m² per floor`} wide>
            <div className="stat-grid">
              <Stat label="Recommended set" value={view.ids.length ? `${view.ids.length} technique${view.ids.length > 1 ? "s" : ""}` : "None"} hint={view.ids.length ? view.ids.map((id) => NAME[id]).join(" + ") : "Nothing needed within this budget"} />
              <Stat label="Cost" value={inr(view.costInr)} hint={`Budget ${inr(view.budgetInr)}`} />
              <Stat label="Annual saving" value={inr(view.savedInr)} hint={view.paybackYears ? `Pays back in ${view.paybackYears.toFixed(1)} years` : "No saving to pay back"} />
              <Stat label="Indoor peak" value={`${view.breakdown.baselinePeakC.toFixed(1)} → ${view.breakdown.finalPeakC.toFixed(1)}`} unit="°C" hint={`Design-day peak, ${(view.breakdown.baselinePeakC - view.breakdown.finalPeakC).toFixed(1)} °C lower`} />
            </div>
            {(view.excluded.length > 0 || view.required.length > 0) && (
              <div className="field-chips constraint-row">
                {view.excluded.map((n) => (
                  <span key={`x-${n}`} className="field-chip chip-out">Left out: {n}</span>
                ))}
                {view.required.map((n) => (
                  <span key={`r-${n}`} className="field-chip chip-in">Required: {n}</span>
                ))}
              </div>
            )}
          </Card>

          <Card title="How the recommendation was reached" sub="The path from the inputs to the chosen set, step by step." wide>
            <ol className="trail">
              <li>
                <strong>Inputs</strong>
                <span>
                  Building from the form{view.briefSource ? `, filled from a brief (${SOURCE[view.briefSource]?.label ?? view.briefSource})` : ""}.
                  {view.refineSource ? ` A follow-up was read by ${SOURCE[view.refineSource]?.label ?? view.refineSource}.` : ""}
                </span>
              </li>
              <li>
                <strong>Constraints</strong>
                <span>
                  {view.excluded.length || view.required.length
                    ? `${view.excluded.length} technique(s) left out, ${view.required.length} required.`
                    : "No techniques left out or required."}{" "}
                  Budget {inr(view.budgetInr)}.
                </span>
              </li>
              <li>
                <strong>Search</strong>
                <span>
                  The engine tried every combination of the {view.candidates} allowed techniques and kept {view.feasible} that fit the
                  budget and constraints. This is brute force, not AI.
                </span>
              </li>
              <li>
                <strong>Pick</strong>
                <span>The set with the largest annual saving was chosen. Ties go to the cheaper set.</span>
              </li>
              <li>
                <strong>Explanation</strong>
                <span>{view.explanation ? `Written by ${SOURCE[view.explanation.source]?.label ?? view.explanation.source}.` : "Not written yet. Press the button below to ask the explanation writer."}</span>
              </li>
            </ol>
          </Card>

          <div className="chart-grid">
            <Card title="Temperature drop from each technique" wide sub="How much each technique lowers the peak on its own. Hover a bar for more.">
              {steps.length ? (
                <GrowBars items={drops} details={dropDetails} format={(v) => `−${v.toFixed(2)}`} color="var(--accent)" />
              ) : (
                <p className="page-card-sub">Nothing to show for an empty set.</p>
              )}
            </Card>
          </div>

          {steps.length > 0 && (
            <Card title="Breakdown table" sub="Numbers behind the two charts. Design-day peak at the city's May–June peak outdoor temperature." wide>
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Technique</th>
                    <th>Alone</th>
                    <th>Added in order</th>
                    <th>Peak after</th>
                    <th>Total drop</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>{NAME[s.id]}</td>
                      <td>−{s.standaloneDropC.toFixed(2)} °C</td>
                      <td>−{s.stepDropC.toFixed(2)} °C</td>
                      <td>{s.peakC.toFixed(2)} °C</td>
                      <td>−{s.cumulativeDropC.toFixed(2)} °C</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="page-card-sub">
                “Alone” and “Added in order” differ because the techniques overlap. For example, shading and ventilation both act on the same heat.
                The total drop is the peak with the whole set, against the baseline.
              </p>
            </Card>
          )}

          <Card title="Explanation" sub="Written by the explanation writer from the figures above. Shown only when you ask for it.">
            {view.explanation ? (
              <p className="explanation-text">
                {view.explanation.text.replace(/\*\*/g, "")}
                <span className={`source-badge src-${view.explanation.source}`}>{SOURCE[view.explanation.source]?.label ?? view.explanation.source}</span>
              </p>
            ) : (
              <p className="page-card-sub">Nothing written yet.</p>
            )}
            {view.ids.length > 0 && (
              <button className="btn solid" onClick={view.onExplain} disabled={view.explaining}>
                {view.explaining ? "Writing explanation…" : view.explanation ? "Write it again" : "Explain this recommendation"}
              </button>
            )}
          </Card>

          {view.ranked.length > 0 && (
            <Card title="Other strong options" sub="The engine's next-best sets within budget, for comparison." wide>
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Techniques</th>
                    <th>Cost</th>
                    <th>Annual saving</th>
                    <th>Peak</th>
                  </tr>
                </thead>
                <tbody>
                  {view.ranked.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r.ids.length ? r.ids.map((id) => NAME[id]).join(" + ") : "None"}</td>
                      <td>{inr(r.costInr)}</td>
                      <td>{inr(r.savedInr)}</td>
                      <td>{r.indoorPeakC.toFixed(2)} °C</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ---------- WHAT THE AI DOES ---------- */}
      <Card title="What the AI does in this app" sub="The path from your words to the result on screen." wide>
        <ol className="flow">
          {PIPELINE.map((step, i) => (
            <li key={step.title}>
              <div className={`flow-box ${i === 1 || i === 5 ? "is-ai" : i === 3 || i === 4 ? "is-engine" : ""}`}>
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </div>
              {i < PIPELINE.length - 1 && <span className="flow-arrow">→</span>}
            </li>
          ))}
        </ol>
        <p className="page-card-sub flow-key">
          <span className="key-dot is-ai" /> AI model &nbsp;&nbsp; <span className="key-dot is-engine" /> Physics engine (formulas, no AI)
        </p>
      </Card>

      <div className="role-grid">
        {ROLES.map((role) => (
          <section key={role.title} className="page-card role-card">
            <span className="role-model">{role.model}</span>
            <h3 className="page-card-title">{role.title}</h3>
            <code className="endpoint">{role.endpoint}</code>
            <dl>
              <dt>Reads</dt>
              <dd>{role.reads}</dd>
              <dt>Writes</dt>
              <dd>{role.writes}</dd>
              <dt>Checks</dt>
              <dd>{role.checks}</dd>
              <dt>If the AI is down</dt>
              <dd>{role.fallback}</dd>
            </dl>
          </section>
        ))}
        <section className="page-card role-card role-card-engine">
          <span className="role-model">Not AI · physics</span>
          <h3 className="page-card-title">Optimiser</h3>
          <code className="endpoint">optimise() in engine/optimizer.js</code>
          <dl>
            <dt>Reads</dt>
            <dd>The building, its budget and its constraints.</dd>
            <dt>Does</dt>
            <dd>Tries every allowed combination, drops those over budget or missing a required technique, and ranks by annual saving.</dd>
            <dt>Why not AI</dt>
            <dd>The search is small enough to check exactly, so an exact answer costs nothing extra.</dd>
          </dl>
        </section>
      </div>

      {/* ---------- PLAYGROUND ---------- */}
      <div className="chart-grid">
        <Card title="Try the brief reader" sub="Type a building in plain words. The result shows what the dashboard would fill in. Your dashboard is not changed.">
          <form
            className="ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (brief.trim()) runBrief();
            }}
          >
            <input
              type="text"
              maxLength={1000}
              value={brief}
              placeholder="e.g. Two-storey house in Jaipur, 120 sq m, budget 3 lakh, retrofit the existing home"
              onChange={(e) => setBrief(e.target.value)}
            />
            <button className="btn solid" type="submit" disabled={briefing || !brief.trim()}>
              {briefing ? "Reading…" : "Read brief"}
            </button>
          </form>
          {briefOut?.error && <p className="page-error">{briefOut.error}</p>}
          {briefOut?.data && (
            <div className="ai-result">
              <span className={`source-badge src-${briefOut.data.source}`}>{SOURCE[briefOut.data.source]?.label ?? briefOut.data.source}</span>
              {Object.keys(briefOut.data.fields).length === 0 ? (
                <p className="page-card-sub">Nothing could be read. Try including floors, area or budget.</p>
              ) : (
                <div className="field-chips">
                  {Object.entries(briefOut.data.fields).map(([k, v]) => (
                    <span key={k} className="field-chip">
                      <em>{k}</em> {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {briefOut.data.assumptions.length > 0 && (
                <ul className="notes">
                  {briefOut.data.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Try the follow-up reader" sub="Say what to change about a recommendation. The result shows which techniques would be left out or required.">
          <form
            className="ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (followUp.trim()) runRefine();
            }}
          >
            <input
              type="text"
              maxLength={500}
              value={followUp}
              placeholder="e.g. I don't want aangan, suggest something else"
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <button className="btn solid" type="submit" disabled={refining || !followUp.trim()}>
              {refining ? "Reading…" : "Read follow-up"}
            </button>
          </form>
          {refineOut?.error && <p className="page-error">{refineOut.error}</p>}
          {refineOut?.data && (
            <div className="ai-result">
              <span className={`source-badge src-${refineOut.data.source}`}>{SOURCE[refineOut.data.source]?.label ?? refineOut.data.source}</span>
              <div className="field-chips">
                {refineOut.data.exclude.map((id) => (
                  <span key={`x-${id}`} className="field-chip chip-out">Leave out {NAME[id] ?? id}</span>
                ))}
                {refineOut.data.include.map((id) => (
                  <span key={`i-${id}`} className="field-chip chip-in">Require {NAME[id] ?? id}</span>
                ))}
                {refineOut.data.budgetInr !== undefined && (
                  <span className="field-chip">Budget {inr(refineOut.data.budgetInr)}</span>
                )}
                {refineOut.data.exclude.length + refineOut.data.include.length === 0 && refineOut.data.budgetInr === undefined && (
                  <span className="page-card-sub">No change read from that.</span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ---------- ACTIVITY ---------- */}
      <Card title="Activity this session" sub="Every AI call made from the dashboard or this page, logged as it happens." wide>
        {aiLog.length === 0 ? (
          <p className="page-card-sub">No AI calls yet. Use the brief bar, a follow-up, or the explanation button, or try the readers above.</p>
        ) : (
          <div className="activity">
            <div className="activity-charts">
              <div>
                <h4 className="mini-title">Where answers came from</h4>
                <Donut parts={bySource} centerValue={aiLog.length} centerLabel="calls" />
              </div>
              <div>
                <h4 className="mini-title">Calls by reader</h4>
                <BarList items={byKind} />
              </div>
              <div className="activity-wide">
                <h4 className="mini-title">Response time per call (ms)</h4>
                {timed.length > 1 ? (
                  <LineChart
                    series={[{ name: "Response time", values: timed.map((e) => e.ms), color: PALETTE[2] }]}
                    labels={timed.map((_, i) => String(i + 1))}
                    yFormat={(v) => `${v.toFixed(0)}`}
                    height={180}
                  />
                ) : (
                  <p className="page-card-sub">Make two or more calls to see the trend.</p>
                )}
              </div>
            </div>
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Reader</th>
                  <th>Answer from</th>
                  <th>Took</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {[...aiLog].reverse().slice(0, 10).map((e, i) => (
                  <tr key={i}>
                    <td>{shortTime(e.at)}</td>
                    <td>{KIND[e.kind]}</td>
                    <td>
                      <span className={`source-badge src-${e.source}`}>{SOURCE[e.source]?.label ?? e.source}</span>
                    </td>
                    <td>{e.ms > 0 ? `${e.ms.toFixed(0)} ms` : "—"}</td>
                    <td>{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Guardrails in place" wide>
        <ul className="notes">
          <li>Numbers come from the physics engine. The explanation writer is given them and asked to quote them exactly.</li>
          <li>Replies must be JSON. Anything that does not parse falls back to simple rules, and the screen labels which one was used.</li>
          <li>Fields are range-checked and clamped to the same limits the form uses, so a bad reply cannot break the model.</li>
          <li>Interventions and cities are matched against fixed lists. Unknown names are dropped.</li>
          <li>The API key lives in the backend's environment file and is never sent to the browser.</li>
        </ul>
      </Card>
    </div>
  );
}
