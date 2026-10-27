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
function fallbackExplanation({ ids = [], costInr, savedInr, paybackYears, indoorPeakC, baselinePeakC }) {
  if (!ids.length) return "No interventions are needed within this budget.";
  const drop = baselinePeakC - indoorPeakC;
  return (
    `Applying ${ids.join(", ")} costs ${inr(costInr)} and saves about ${inr(savedInr)} a year, ` +
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
    "You are explaining a passive-cooling recommendation for a building in Delhi-NCR to an architect. " +
    "Use ONLY the figures in the JSON below. Do not invent numbers. " +
    "The cost, savings and payback apply to the WHOLE set of interventions listed in ids, not to any one of them. " +
    "Write amounts in Indian format (for example ₹2,10,980). " +
    "Method descriptions you may use: jali = perforated screen that filters sun; chhajja = deep overhang that blocks high sun; " +
    "aangan = open courtyard that drives air movement; khus chik = wet khus grass screen that cools air by evaporation; " +
    "green roof = vegetation layer that insulates the roof; lime cool roof = light lime wash that reflects sun. " +
    "Write 3 short sentences in plain English, and mention one traditional Indian method (jali, chhajja, aangan, or khus chik) " +
    "where it fits the recommendation.\n\nJSON:\n" +
    JSON.stringify(result);

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

app.listen(PORT, () => console.log(`VayuForm backend on http://localhost:${PORT}`));
