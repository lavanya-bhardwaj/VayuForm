# VayuForm: Final Review Demo and Q&A Prep

The final review is scored on five areas: completeness and demo (25), technical depth and architecture (20), impact and scalability (20), security, privacy and reliability (15), and presentation and Q&A (20). This guide is organised the same way. Use it to rehearse the demo and to answer questions.

---

## 1. Demo script (about 5 minutes)

Start both servers before the session (`npm start` in `backend/`, `npm run dev` in `frontend/`). Open http://localhost:5173.

| Time | Show | Say |
|---|---|---|
| 0:00 | Empty app, then type the brief: *"Two-storey house in Jaipur, 120 sq m, budget 3 lakh, retrofit the existing home"* | "An architect describes a building in one sentence. We read floors, area, budget, site and scenario from it." |
| 0:45 | Point out the assumptions panel and the filled fields | "Anything we could not read is flagged as an assumption, not guessed." |
| 1:15 | Results: baseline and recommended indoor peak, cost, savings, payback, CO₂ | "Every number comes from the physics engine. The AI never produces them." |
| 2:00 | Switch to 3D Exterior. Scrub the sun-path slider from morning to afternoon | "Shading and sun angle update live from the climate for this city." |
| 2:45 | Switch to Interior. Show the aangan courtyard | "This is the courtyard that drives air movement in the house." |
| 3:15 | Type a follow-up: *"no aangan, suggest something else"* | "The follow-up is read into an exclude list. The optimiser re-runs with it." |
| 3:45 | Open the AI view and the ML analysis page | "A small neural network was trained to match the engine, so it can answer in microseconds. Here is how close it is." |
| 4:30 | Export Report | "The PDF has the inputs, the recommendation and the numbers." |

**Backup plan:** if the AI service fails or the network is down, the app still works. The explanation and brief parsing fall back to the rule-based path. Say so out loud; it is part of the reliability story.

---

## 2. Rubric checklist

### Completeness and demo (25)
- Covered end to end: brief → baseline → optimiser → explanation → 3D and interior → refinement → export.
- Eight methods in the catalogue (jali, chhajja, aangan, lime cool roof, green roof, rat-trap wall, khus chik, clerestory vent).
- Known gaps to state before someone else finds them: vertical solar values are placeholders, and there is no RETV or ECBC compliance check.

### Technical depth and architecture (20)
- Three layers, each with one job:
  - **Browser:** physics engine (`frontend/src/engine/`), optimiser and 3D rendering. Runs with no server.
  - **Backend:** Express API for AI calls, brief and refinement parsing, and surrogate routes.
  - **Offline training:** `scripts/train_surrogate.py` ports the engine formulas, labels 5,000 random buildings, trains a 15 → 64 → 64 → 2 network and exports JSON weights.
- Why the surrogate: the engine is accurate but slow to explore across many building variants. The network gives roughly the same answers in microseconds, and the backend needs no ML library to run it.
- Why the AI is kept out of the numbers: the LLM only explains and parses text. The engine decides. That makes the output checkable.
- Honest result numbers (held-out test set): indoor peak MAE 0.17 °C, R² 0.992. Top pick matches the physics 84% of the time, mean regret 0.12%.

### Impact and scalability (20)
- **Who benefits:** architects and design students working on residential retrofits and new houses in Delhi-NCR and nearby cities. Secondary: facility managers and municipal heat-action planners.
- **Realistic outcomes:** the app compares options. It does not certify a building. Results depend on the placeholder and calibrated values listed in the README.
- **Scaling path:** the surrogate makes batch assessment cheap, since one prediction takes microseconds. A batch mode over many buildings is the next logical step.
- **Practical constraints to name:** no measured building data yet, no authentication for a shared deployment, and the engine is steady-state.
- **Adoption:** the four cities already have climate files. Adding a city means adding it to the fetch script and regenerating its file.

### Security, privacy and reliability (15)
- **Privacy:** no database, no accounts, no stored user data. The only data sent off the machine is brief or follow-up text, and only when a Groq key is set. Advise users not to type personal details.
- **Secrets:** the API key is only in `backend/.env`, which is git-ignored.
- **Misuse:** CORS limited to localhost, request body capped at 100 kB, free text capped at 1,000 and 500 characters, AI output checked against an allow-list and clamped to valid ranges.
- **Reliability:** every AI route falls back to rules or a template. The ML routes return 400 with a message for bad input. The engine runs in the browser.
- **Gap to admit:** no authentication or rate limiting. Fine for local use; it needs both before any public deployment.

### Presentation and Q&A (20)
Use the demo script above. Keep to the three messages that matter: the numbers are from physics, the AI explains them, and the system still works when the AI is down.

---

## 3. Likely questions and answers

**Is the AI making up the numbers?**
No. The engine calculates every temperature, cost and saving. The language model gets those numbers as JSON, is told to use only them, and its reply is checked before it is shown. If it fails, a template built from the same numbers is used.

**How accurate is the engine?**
It is a simplified steady-state model. Its purpose is to compare options side by side, not to certify a building. We have not checked it against measured building data yet. That is the first next step.

**Why a neural network if you already have a physics engine?**
Speed for exploration, and a check on the engine's own behaviour. The network runs in microseconds and matches the engine closely on held-out cases (indoor peak within 0.17 °C on average). It is trained on the engine, so it cannot be more accurate than the engine.

**How did you pick 5,000 training buildings and the 80/20 split?**
The buildings are random combinations of city, floors, floor area, window share, building type and allowed methods. The 80/20 split keeps 1,000 buildings hidden for testing, so the scores reflect buildings the network has not seen. A 10% validation slice inside the training set stops training when it stops improving.

**What data do you use for the climate?**
Open-Meteo's historical archive for May and June, 2015–2024. For each city we use the median hottest-hour temperature, the median night low, the afternoon humidity and the roof solar radiation.

**What about the vertical facades?**
Their solar values are still placeholders. The app says so on screen. The next step is to process them from each city's EPW weather file.

**Can this be used for building approval or energy certificates?**
No. It has no RETV or ECBC compliance check, and the material values are approximate. It supports early design choices, not regulatory sign-off.

**Who is the user, and why these four cities?**
Architects and design students doing residential work in the Delhi-NCR belt. Delhi is the main case. Jaipur, Ahmedabad and Kochi show how the same methods change with a hotter-dry, a hot-humid and a warm-humid climate.

**What happens to the data people enter?**
It stays in the browser session, except the brief or follow-up text, which goes to the Groq API only when a key is set. We store nothing. We would not put personal or identifying details in a brief.

**What stops someone misusing the API?**
Right now: CORS limited to localhost, body size limits, and input length limits. It has no authentication or rate limiting, so it is not safe to expose on the internet yet. That is the first thing we would fix for a shared deployment.

**What if the AI service goes down during a demo?**
The app still works. Brief parsing and follow-ups use simple rules, and the explanation uses a template built from the same numbers. The results are the same; the wording is simpler.

**How would this scale?**
One prediction takes microseconds, so screening many buildings is cheap. The next steps are a batch mode for a list of buildings, and more climate files. The physics engine runs in the browser, so it adds no server load.

**What did you not get to?**
Measured-data validation, real vertical solar values, RETV and ECBC checks, authentication, and clearing the 27 lint errors (mostly unused variables in the validation scripts).

**Why does the frontend bundle exceed 500 kB?**
The main bundle includes the 3D and PDF libraries, which are large. Splitting the code with dynamic imports is the planned fix. We have not measured how much that would save.

---

## 4. Before the session

- [ ] Both servers start cleanly (`backend/`: `npm start`; `frontend/`: `npm run dev`).
- [ ] `backend/.env` holds a working `GROQ_API_KEY`, or the fallback path has been tried once.
- [ ] Rehearse the brief in section 1 at least twice. Time it.
- [ ] Open the AI view and ML analysis page in advance so the first load is not slow.
- [ ] Have the README and this guide open for questions.
