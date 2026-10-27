# VayuForm

A passive-cooling design copilot for Delhi-NCR buildings. Describe a building, and VayuForm simulates its heat gain with local climate data, recommends traditional Indian cooling methods within your budget, and shows the effect in 3D, inside and out.

Methods covered: **jali** (perforated screen), **chhajja** (deep overhang), **aangan** (courtyard), **khus chik** (wet grass screen), **lime cool roof**, **green roof**, **rat-trap wall**, and **clerestory vent**.

Every number on screen comes from a physics engine. The AI only explains those numbers and reads follow-up requests. It never creates them.

---

## What it does

1. **Brief.** Describe the building in a sentence ("two-storey house in Dwarka, 150 m² per floor, ₹3 lakh, retrofit"), or set the fields by hand. Sites: Delhi, Jaipur, Ahmedabad, Kochi.
2. **Baseline.** The engine estimates the indoor peak temperature and yearly cooling demand for the building as it stands.
3. **Recommendation.** An optimiser tries the allowed combinations of methods under the budget and ranks them by temperature drop and rupee savings. The best set is shown with its cost, savings, payback and CO₂ avoided.
4. **Explanation.** A plain-English note explains the choice, using only the figures the engine produced.
5. **Refinement.** Follow-ups such as "no aangan, suggest something else" or "budget 2 lakh" re-run the recommendation.
6. **3D and interior views.** The building updates as methods are applied, with a sun-path slider for the time of day. An interior view shows the courtyard.
7. **AI view and ML analysis.** Shows how the trained surrogate model compares with the physics engine (see below).
8. **Export.** A PDF report with the inputs, recommendation and numbers.

---

## Repository layout

```
frontend/            React 19 + Vite + React Three Fiber (the app)
  src/engine/        physics engine: heat model, optimiser, validation checks
  src/components/    3D building and interventions, charts
  src/pages/         AI view and ML analysis pages
  src/data/          climate files per city, interventions, materials, ML report
  scripts/           fetch-climate.mjs (builds the climate files from Open-Meteo)
backend/             Express 5 API (AI calls, brief and refinement parsing, ML routes)
  ml/surrogate.js    runs the trained network with plain arithmetic
  models/            surrogate.json, the exported network weights
data/                source copies of interventions and materials
scripts/             train_surrogate.py (trains and exports the surrogate)
```

---

## Running it locally

You need Node.js 20 or later. Python is only needed to retrain the surrogate.

```bash
# backend (API on http://localhost:3001)
cd backend
npm install
npm start

# frontend (app on http://localhost:5173)
cd frontend
npm install
npm run dev
```

Optional AI. Without a key, the app still works: brief and refinement parsing use simple rules, and the explanation uses a template built from the same numbers. To turn on the AI, create `backend/.env`:

```bash
GROQ_API_KEY=your-key-here
# optional
GROQ_MODEL=openai/gpt-oss-20b
PORT=3001
```

`backend/.env` is git-ignored. Do not commit it.

To rebuild the climate files (needs internet, uses the free Open-Meteo archive):

```bash
cd frontend
node scripts/fetch-climate.mjs
```

To retrain the surrogate (needs Python with numpy and scikit-learn):

```bash
python3 scripts/train_surrogate.py
```

This writes `backend/models/surrogate.json` and `frontend/src/data/ml/surrogate-report.json`.

---

## How it works

### Physics engine (`frontend/src/engine/`)
- **Heat model** (`heatModel.js`): steady-state conduction through each facade, roof and glazing; solar gain from the orientation and hour; ventilation from an air-change rate that interventions can add to. It returns the indoor peak, the gain ratio and the cooling demand.
- **Interventions** (`interventions.js`, `data/interventions.json`): each method has effects on U-value, shading, albedo, air change and mass, a cost basis and the building types it applies to.
- **Optimiser** (`optimizer.js`): tries the allowed combinations under the budget. The method count is small, so the search is exhaustive and fast enough to run in the browser.
- **Climate** (`climate.js`, `data/climate/*.json`): per-city design values from Open-Meteo, May–June 2015–2024: outdoor peak, night low, afternoon humidity and roof solar radiation.
- **Validation** (`validation*.js`): sanity checks for geometry (`validation.js`, `runValidation()`), conduction, solar, interventions and economics (`validateConduction()`, `validateSolar()`, `validateInterventions()`, `validateEconomics()`).

### Surrogate model (`scripts/train_surrogate.py` → `backend/ml/surrogate.js`)
The physics engine is accurate but slow to explore. A small neural network was trained to reproduce it, so the backend can answer quickly.

- Training data: 5,000 random buildings, labelled by the ported physics formulas. Each intervention set is drawn only from the methods that apply to that building type.
- Network: 15 inputs → 64 → 64 → 2 outputs, ReLU, Adam, L2 regularisation 1e-4, early stopping on a 10% validation split. 80/20 train/test split.
- Targets: indoor peak (°C) and gain ratio (0–1). Savings in rupees are derived from the ratio, which keeps the target scale small.
- Held-out test results (from `surrogate-report.json`):

| Target | MAE | R² |
|---|---|---|
| Indoor peak (°C) | 0.17 | 0.992 |
| Gain ratio | 0.009 | 0.996 |
| Savings (₹/yr, derived) | ₹787 | 0.999 |

- Ranking check on 200 buildings: the surrogate's top pick matches the physics top pick 84% of the time, and the mean regret (extra cost of the surrogate's pick) is 0.12%.
- At runtime the backend reads the JSON weights and does multiply, add and ReLU. No ML library is loaded on the server, and one prediction takes microseconds.

### AI layer (`backend/server.js`)
The backend calls the Groq chat API (OpenAI-compatible) for three jobs: explaining a recommendation, reading a free-text brief, and reading a follow-up. In each case:
- The model's output is parsed as JSON. Fields are kept only if they are on an allow-list, and numbers are clamped to the app's ranges.
- Intervention IDs must be in the catalogue.
- If the call fails or no key is set, the rule-based fallback runs instead. The explanation text is built only from the numbers passed in.

---

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Status, whether a key is loaded, model name |
| POST | `/api/brief` | Free-text brief → building fields and assumptions |
| POST | `/api/refine` | Follow-up text → include and exclude lists, optional budget |
| POST | `/api/explain` | Recommendation JSON → plain-English explanation |
| POST | `/api/ml/predict` | Building and interventions → surrogate prediction |
| POST | `/api/ml/optimize` | Building → ranked intervention sets (surrogate) |

Request bodies are limited to 100 kB. Free-text briefs are cut to 1,000 characters and follow-ups to 500.

---

## Safety, privacy and reliability

**Data handling**
- There is no database, no account system and no user storage. The app keeps its state in the browser session only.
- The only data that leaves the machine is the text of a brief or follow-up, plus the recommendation numbers for the explanation. These go to Groq only when `GROQ_API_KEY` is set. Do not type personal details into the brief. Nothing else is sent.
- The API key lives only in `backend/.env`, which is git-ignored.

**Misuse and abuse**
- CORS allows only `http://localhost` origins, so other websites cannot call the API from a visitor's browser.
- The request body size is capped. Free text is length-capped.
- AI output cannot add new fields, intervention IDs or out-of-range numbers. Prompt text does not change the physics.
- The explanation is instructed to use only the numbers given. The rule-based fallback is used whenever the AI reply is missing or invalid.

**Reliability**
- Every AI route has a fallback, so the app still returns results when the AI service is down, slow or unconfigured.
- The surrogate needs no network and no ML library at runtime. The physics engine runs in the browser, so the app works offline apart from the AI calls.
- Bad input to the ML routes returns HTTP 400 with an error message, not a crash.

**Known gaps (to be fixed before any real use)**
- The API has no authentication or rate limiting. It is meant for local use, not a public deployment.
- Solar values for the vertical facades are still placeholders. The app and the climate files say so.
- The air-change rate is a calibrated constant, not a measured value.
- Material values in `data/materials.json` are approximate, taken from ECBC 2017 and ECO-Niwas Samhita 2018 typical constructions. Check them against the code tables before quoting them.
- The engine is a simplified steady-state model. It is useful for comparing options, not for compliance certificates. No RETV or ECBC compliance check is implemented.
- The surrogate was trained on the engine's own outputs, not on measured building data.
- The AI explanation is not checked by a person before it is shown.
- The frontend has 27 lint errors (mostly unused variables in the validation scripts) and a main bundle over 500 kB.

---

## Sources

- Climate: Open-Meteo historical archive, 2015–2024.
- Methods and effects: published passive-cooling studies cited in `data/interventions.json`.
- Material values: `data/materials.json`.
- Building codes referenced for the envelope: ECBC 2017 and ECO-Niwas Samhita 2018 (targets, not compliance checks).

---

## Status

Working end to end: brief, recommendation, 3D and interior views, AI and rule explanations, refinement, the surrogate and ML analysis, and PDF export.

Next steps: API authentication and rate limiting for a shared deployment, measured building data to check the engine, real vertical solar values, a RETV check, and lint clean-up.
