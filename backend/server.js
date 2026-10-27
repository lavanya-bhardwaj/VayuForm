import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "100kb" }));
// Let the local frontend (any localhost port) call this API from the browser.
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3001;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b"; // check the current model id on console.groq.com

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Plain-text explanation built only from the numbers we were given. Used when the AI call fails. */
function fallbackExplanation({ ids = [], costInr, savedInr, paybackYears, indoorPeakC, baselinePeakC, climate }) {
  if (!ids.length) return "No interventions are needed within this budget.";
  const drop = baselinePeakC - indoorPeakC;
  const place = climate
    ? `In ${climate.location}, where the design peak is ${climate.outdoorPeakC.toFixed(1)} °C and afternoon humidity averages ${climate.relHumidityAfternoonPct}%, `
    : "";
  return (
    `${place}applying ${ids.join(", ")} costs ${inr(costInr)} and saves about ${inr(savedInr)} a year, ` +
    `with a payback of ${paybackYears.toFixed(1)} years. The indoor peak falls from ` +
    `${baselinePeakC.toFixed(1)} °C to ${indoorPeakC.toFixed(1)} °C, a drop of ${drop.toFixed(1)} °C.`
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, keyLoaded: Boolean(process.env.GROQ_API_KEY), model: MODEL });
});

app.post("/api/explain", async (req, res) => {
  const result = req.body;
  const fallback = fallbackExplanation(result);

  if (!process.env.GROQ_API_KEY) {
    return res.json({ text: fallback, source: "template" });
  }

  const prompt =
    "You are explaining a passive-cooling recommendation to an architect. The climate block names the city the building is in. " +
    "Use ONLY the figures in the JSON below. Do not invent numbers. " +
    "Name the city and quote its figures. Keep the labels exact: outdoorPeakC is the city's outdoor design peak, " +
    "indoorPeakC is the building's indoor peak after the recommendation, and baselinePeakC is the indoor peak without it. " +
    "Explain how the climate shapes the choice, using these rules: " +
    "where afternoon humidity is low (under about 40%), evaporative measures such as khus chik work well; " +
    "where it is high (over about 70%), they work poorly. " +
    "Where the night low stays high, night-time ventilation releases less heat. " +
    "The cost, savings and payback apply to the WHOLE set of interventions listed in ids, not to any one of them. " +
    "For rupee amounts, use costText and savedText exactly as given in the JSON. Do not reformat them. " +
    "Method descriptions you may use: jali = perforated screen that filters sun; chhajja = deep overhang that blocks high sun; " +
    "aangan = open courtyard that drives air movement; khus chik = wet khus grass screen that cools air by evaporation; " +
    "green roof = vegetation layer that insulates the roof; lime cool roof = light lime wash that reflects sun. " +
    "Write 3 or 4 short sentences in plain English, and mention one traditional Indian method (jali, chhajja, aangan, or khus chik) " +
    "where it fits the recommendation.\n\nJSON:\n" +
    JSON.stringify({ ...result, costText: inr(result.costInr), savedText: inr(result.savedInr) });

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
        reasoning_effort: "low",
      }),
    });
    if (!r.ok) throw new Error(`Groq responded ${r.status}`);
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty reply");
    return res.json({ text, source: "groq" });
  } catch (err) {
    console.error("Groq call failed:", err.message);
    return res.json({ text: fallback, source: "template" });
  }
});

const SCENARIOS = ["retrofit", "new"];
const SITE_IDS = ["delhi", "jaipur", "ahmedabad", "kochi"];
const CITY_PATTERNS = {
  delhi: /\b(delhi|new delhi|ncr|gurgaon|gurugram|noida|faridabad)\b/,
  jaipur: /\bjaipur\b/,
  ahmedabad: /\b(ahmedabad|ahmadabad)\b/,
  kochi: /\b(kochi|cochin)\b/,
};
const RANGES = { floors: [1, 5], footprintM2: [20, Infinity], wwr: [0.1, 0.6], budgetInr: [0, Infinity] };
const clampTo = (v, [min, max]) => Math.min(max, Math.max(min, v));

/** Keeps only known building fields with usable values, clamped to the same ranges the app uses. */
function cleanFields(raw = {}) {
  const out = {};
  if (SITE_IDS.includes(raw.site)) out.site = raw.site;
  if (SCENARIOS.includes(raw.scenario)) out.scenario = raw.scenario;
  for (const key of Object.keys(RANGES)) {
    const value = raw[key];
    if (value === null || value === "" || value === undefined || !Number.isFinite(Number(value))) continue;
    const n = Number(value);
    out[key] = clampTo(key === "floors" ? Math.round(n) : n, RANGES[key]);
  }
  return out;
}

const UNIT = { k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7 };
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
// Only assumptions about inputs the engine actually uses are shown. Roof type, material and energy targets are not inputs yet.
const ENGINE_TOPIC = /floor|storey|story|footprint|area|m²|m2|sq|budget|cost|₹|rupee|window|wwr|glaz|retrofit|new build|existing|building type|city|location|site/i;

/** Reads the few things a plain sentence reliably gives: floors, floor area, budget and building type. */
function parseBriefByRules(brief) {
  const text = brief.toLowerCase();
  const fields = {};
  const floors = text.match(/(\d+|one|two|three|four|five)\s*-?\s*(?:storey|storeys|story|stories|floor|floors)/);
  if (floors) fields.floors = Number(floors[1]) || WORD_NUMBERS[floors[1]];
  const area = text.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sq\.?\s*m|square\s+met(?:er|re)s?)/);
  if (area) fields.footprintM2 = Number(area[1]);
  const budget =
    text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|crores?)?/) ||
    text.match(/([\d.]+)\s*(lakhs?|lacs?|crores?)\b/);
  if (budget) {
    const base = Number(budget[1].replace(/,/g, ""));
    fields.budgetInr = base * (UNIT[budget[2]] ?? 1);
  }
  const city = Object.keys(CITY_PATTERNS).find((id) => CITY_PATTERNS[id].test(text));
  if (city) fields.site = city;
  if (/\bnew\s+(build|construction|house|home)|build\s+(a\s+)?new|greenfield/.test(text)) fields.scenario = "new";
  else if (/retrofit|existing|renovat/.test(text)) fields.scenario = "retrofit";
  return fields;
}

app.post("/api/brief", async (req, res) => {
  const brief = String(req.body?.brief ?? "").trim().slice(0, 1000);
  if (!brief) return res.status(400).json({ error: "Describe the building first." });

  const ruleFields = cleanFields(parseBriefByRules(brief));
  const fallback = {
    fields: ruleFields,
    assumptions: Object.keys(ruleFields).length
      ? ["Read with simple rules: only floors, floor area, budget and building type were picked up."]
      : ["Nothing in the brief could be read. Set the fields by hand."],
    source: "rules",
  };

  if (!process.env.GROQ_API_KEY) return res.json(fallback);

  const prompt =
    "Read this brief for a building in Delhi-NCR and return ONLY a JSON object with these keys. " +
    'scenario: "retrofit" for an existing building, "new" for a new build. ' +
    "site: the city the building is in, one of delhi, jaipur, ahmedabad, kochi. " +
    "floors: whole number from 1 to 5. " +
    "footprintM2: floor area per floor in square metres. " +
    "wwr: window-to-wall ratio from 0.1 to 0.6. " +
    "budgetInr: budget in rupees as a plain number, so 3 lakh is 300000. " +
    "assumptions: up to 3 short strings naming anything the brief leaves unstated that affects floors, floor area, budget, window-to-wall ratio or building type. " +
    "Only include a key when the brief states or clearly implies its value. Never guess a number. " +
    "Leave out any key the brief does not mention, except assumptions. Output nothing but the JSON.\n\nBrief:\n" +
    brief;

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 800,
        reasoning_effort: "low",
      }),
    });
    if (!r.ok) throw new Error(`Groq responded ${r.status}`);
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
    const fields = cleanFields(parsed);
    if (!Object.keys(fields).length) throw new Error("no usable fields");
    const assumptions = Array.isArray(parsed.assumptions)
      ? parsed.assumptions.map(String).filter((a) => ENGINE_TOPIC.test(a)).slice(0, 3)
      : [];
    return res.json({ fields, assumptions, source: "groq" });
  } catch (err) {
    console.error("Brief parse fell back to rules:", err.message);
    return res.json(fallback);
  }
});

// Every intervention id the app knows, with words a user might write for it.
const CATALOGUE = {
  jali: ["jali", "jaali"],
  chhajja: ["chhajja", "overhang"],
  aangan: ["aangan", "angan", "courtyard"],
  "lime-cool-roof": ["lime", "cool roof", "whitewash"],
  "green-roof": ["green roof", "vegetation roof", "garden roof", "green"],
  "rat-trap-wall": ["rat-trap", "rat trap", "cavity wall"],
  "khus-chik": ["khus", "khus chik"],
  "clerestory-vent": ["clerestory", "roshandan", "ventilator"],
};
const NEGATIVE = /n't|\bnot\b|\bno\b|\bwithout\b|\bremove\b|\bavoid\b|\bexclude\b|\bskip\b|\binstead\b|\bdrop\b|\bdon'?t\b/;

const idsIn = (text) => Object.keys(CATALOGUE).filter((id) => CATALOGUE[id].some((name) => text.includes(name)));

/** Splits a follow-up into clauses and reads each one as a want (include) or a don't-want (exclude). */
function parseRefineByRules(message) {
  const text = message.toLowerCase();
  const exclude = new Set();
  const include = new Set();
  for (const clause of text.split(/,|;|\bbut\b|\band\b|\bthen\b/)) {
    const ids = idsIn(clause);
    if (!ids.length) continue;
    const target = NEGATIVE.test(clause) ? exclude : include;
    ids.forEach((id) => target.add(id));
  }
  const result = { exclude: [...exclude], include: [...include] };
  const budget = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac)s?\b/);
  if (budget) result.budgetInr = Number(budget[1]) * 1e5;
  return result;
}

app.post("/api/refine", async (req, res) => {
  const message = String(req.body?.message ?? "").trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: "Write a follow-up first." });

  const fallback = { ...parseRefineByRules(message), source: "rules" };
  if (!process.env.GROQ_API_KEY) return res.json(fallback);

  const prompt =
    "A user is refining a passive-cooling recommendation for a building. Read their follow-up and return ONLY a JSON object: " +
    `{"exclude": [ids the user does not want], "include": [ids the user wants kept or added], "budgetInr": number, only if they state a budget}. ` +
    `Allowed ids: ${Object.keys(CATALOGUE).join(", ")}. ` +
    "Use only these ids. If the user only says to suggest something else, leave both lists empty. Output nothing but the JSON.\n\nFollow-up:\n" +
    message;

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 400,
        reasoning_effort: "low",
      }),
    });
    if (!r.ok) throw new Error(`Groq responded ${r.status}`);
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "");
    const known = (list) => (Array.isArray(list) ? list.filter((id) => id in CATALOGUE) : []);
    const budget = Number(parsed.budgetInr);
    const result = { exclude: known(parsed.exclude), include: known(parsed.include), source: "groq" };
    if (Number.isFinite(budget) && budget >= 0) result.budgetInr = budget;
    return res.json(result);
  } catch (err) {
    console.error("Refine fell back to rules:", err.message);
    return res.json(fallback);
  }
});

app.listen(PORT, () => console.log(`VayuForm backend on http://localhost:${PORT}`));
