# VayuForm: Idea Clarity, Architecture, Data & Feature Plan

## Context
VayuForm is a hackathon project tackling extreme heat in Delhi-NCR. It takes cooling ideas from traditional Indian buildings (jaali, aangan, thick walls, chhajja, wind towers, lime plaster) and applies them to new or existing buildings, with AI recommendations shown in 3D.

**Where the repo is now:** frontend-only React 19 + React Three Fiber + drei (`frontend/`). It has one hardcoded building (`components/3d/BuildingScene.jsx`, 650 lines), a working Jali intervention (`interventions/Jali.jsx`), a thermal gradient shader (`utils/thermal.js` → `createThermalGradientMaterial`, `getThermalGradientColors`), and a 3-column dashboard (`App.jsx`). The numbers come from placeholder maths (`heatRisk = score * 0.72`, Jali = −20%). `backend/`, `data/`, `docs/`, `3d/` and the root `src/` are empty.

---

## 1. Rating: **6.5 / 10 today → path to 10**

| Strength | Gap holding it back |
|---|---|
| Real, urgent, local problem (Delhi has hit 49 °C+, heat-action plans exist) | "AI recommends" is vague. Judges will ask *what does the AI actually do?* |
| Strong cultural story that people remember | No real numbers: the heat score is a slider, not computed |
| The 3D visuals already look good | Too many users (architects + facility managers + new builds + retrofits) |
| Passive cooling = low cost + low carbon | No data sources = no credibility |
| | Aangan/interior idea not yet designed |

**What gets it to 10:**
1. **Numbers you can defend.** Every figure (°C, kWh, ₹, CO₂) comes from a simple physics engine that uses real Indian standards and real Delhi weather. It is never invented by the LLM.
2. **AI that explains itself.** A deterministic optimiser picks the best mix of interventions within the budget. The LLM explains *why*, with heritage context, and answers follow-up questions. It never makes up numbers.
3. **One sharp user story** (below).
4. **A demo moment people remember:** scrub the sun across a May day in Delhi. Watch the facade go red → green as jaali, chhajja and aangan get added. Then walk into the courtyard and see cool air being pulled through.
5. **Impact in rupees:** "₹1.8 L spent → ₹24k/yr saved on AC, 3.1 t CO₂/yr, indoor peak −4 °C, payback 7 yrs."

---

## 2. Sharpened idea (pitch-ready)

> **VayuForm is a passive-cooling design copilot for Delhi-NCR. Give it a building (location, size, orientation, budget). It simulates heat gain using real local climate data and India's own energy codes. It then recommends traditional Indian cooling interventions within your budget and shows their effect live in 3D, inside and out. Every recommendation comes with ₹ cost, ₹ savings, °C reduction and CO₂ avoided.**

- **Primary user:** an architect or design student doing a **residential retrofit or new house** (2–3 floors, plots of 100–300 m²). This is the most common Delhi building type, and the aangan fits it naturally.
- **Secondary (pitch slide only):** facility managers / RWAs (batch-assess many buildings), and municipal heat-action planners.
- **Retrofit vs new build:** one engine, one toggle. Retrofit locks the footprint (aangan becomes a "light well / skylight courtyard" option). New build allows a full aangan.

---

## 3. How it works end to end

```
[Input form / chat] ──► [Climate fetch] ──► [Physics engine: baseline]
   location, budget,       Open-Meteo /        heat gain per surface,
   floors, area,           EPW (Delhi)         indoor peak °C, cooling kWh
   orientation, WWR,                                   │
   existing materials                                  ▼
                                         [Optimiser: try intervention combos
                                          under budget → Pareto best set]
                                                       │
                                                       ▼
                                   [LLM layer: rank + explain + Q&A,
                                    gets engine output as JSON]
                                                       │
                                                       ▼
                      [3D scene: parametric house, interventions toggled,
                       thermal tint driven by engine, sun path, airflow, interior]
                                                       │
                                                       ▼
                                        [Report export: PDF / shareable]
```

### 3a. Physics engine (the credibility core). Pure JS, `frontend/src/engine/`
A simplified steady-state + peak-hour model. It is fast enough to re-run every time a slider moves.
- **Envelope conduction:** `Q = U × A × ΔT` per wall (N/S/E/W), roof and glazing.
- **Solar gain:** `Q = A_glass × SHGC × I_solar(orientation, hour) × shading_factor`, plus `α × I × A / h_o` sol-air for opaque surfaces.
- **Ventilation / stack effect:** ACH estimate from courtyard height and opening area (stack formula `Q = Cd·A·√(2gH·ΔT/T)`).
- **Thermal mass:** time-lag/decrement factor that lowers the indoor peak for thick masonry / rammed earth.
- **Outputs:** heat gain (W/m²), indoor peak °C estimate, annual cooling kWh, ₹ (Delhi tariff ~₹7–8/kWh), CO₂ (CEA grid factor ~0.71 kg/kWh), and **RETV**, India's official residential envelope metric from ECO-Niwas Samhita 2018. Show the code target (≤15 W/m²) next to it. Judges love that.
- `thermalScore` (currently a slider) becomes a **derived** value from the engine. The existing shader (`mat.updateThermal`) stays exactly as it is, driven by real numbers, and can be tinted per surface (e.g. west wall hotter).

### 3b. Intervention catalogue. `data/interventions.json`
Each entry: `id, name, hindiName, origin/heritage example, category, applicable(retrofit|new), cost_per_unit (₹, CPWD DSR), unit (m²/rm/each), effect {U, SHGC, shadingFactor, albedo, ACH, massFactor}, citation`.
Use it as the single source for the left panel in `App.jsx` (replacing the hardcoded `INTERVENTIONS`), the engine, the optimiser and the LLM prompt.

### 3c. Optimiser
~12 interventions → at most 4,096 combos, so brute force in the browser takes milliseconds. Filter by budget and compatibility (e.g. aangan needs new-build/footprint). Score by °C drop and ₹ savings. Return the Pareto set plus "best under budget". Deterministic and explainable.

### 3d. AI layer. Thin backend, `backend/` (Node/Express or FastAPI, one endpoint)
- Exists only to hold the API key and call Claude (`claude-sonnet-5-5`, cheaper and fast) with **tool use / structured JSON output**.
- **Jobs:** (1) turn free-text into structured inputs ("2-storey house in Dwarka, west facing, ₹3 lakh"), (2) explain the optimiser's top pick in plain English/Hindi with heritage context, (3) answer follow-ups ("why not a green roof?"), each grounded in the engine JSON passed in context.
- **Guardrail:** the prompt says "use only numbers from the provided JSON." This is the line that answers the "is the AI hallucinating?" question.

### 3e. 3D + interior (aangan)
- **Parametric house:** refactor `BuildingScene.jsx` into a generator driven by `{floors, width, depth, orientation, courtyard: {w,d} | null, wwr}` so that user inputs actually reshape the model. Keep the existing palette and materials from `utils/thermal.js`.
- **Interior views:** (1) a **section/cutaway** toggle using three.js clipping planes (best for showing the aangan), (2) a **walkthrough** camera (drei `PointerLockControls` / `KeyboardControls`) placed in the courtyard.
- **Sun path:** `suncalc` npm package turns lat/long + date/time into a directional light position. Add a time-of-day slider for May 15, 6am→7pm. Shadows show the chhajja and the courtyard self-shading.
- **Airflow:** an instanced particle system. Particles enter low through the jaali, rise in the aangan and leave at the top (stack effect). Colour them by temperature.
- **Before/after:** a split-screen or toggle with the same camera.

---

## 4. Where the data comes from (all free / public)

| Need | Source | How to use |
|---|---|---|
| Hourly temp, humidity, solar radiation, wind | **Open-Meteo API** (free, no key, historical + forecast) | Fetch from the browser by lat/long |
| Typical-year design weather | **climate.onebuilding.org**: New Delhi ISHRAE `.epw` | Pre-process once → `data/climate/delhi.json` (peak day + monthly) |
| Solar irradiance backup | **NASA POWER API** | Optional cross-check |
| Sun position | **suncalc** (JS library) | Lighting + solar angle per facade |
| Material U-values, SHGC, albedo | **ECBC 2017**, **ECO-Niwas Samhita 2018** (BEE), **NBC 2016** Part 11 | Hand-enter about 20 materials into `data/materials.json` |
| Costs (₹) | **CPWD Delhi Schedule of Rates (DSR)** | Per m² rates for brick, lime plaster, terracotta, RCC chhajja, etc. |
| Electricity tariff / CO₂ factor | DERC tariff order, **CEA CO₂ baseline database** | Constants |
| Urban heat by locality (stretch) | Landsat 8/9 land surface temperature via **Google Earth Engine** | Pre-export a Delhi ward heat map → `data/delhi_lst.geojson` |
| Building footprints (stretch) | **OpenStreetMap Overpass** / **Google Open Buildings** | Click a real building → auto-fill footprint |
| Intervention effect sizes | Published studies: courtyard cooling 2–6 °C, jaali solar reduction, cool-roof albedo, Laurie Baker rat-trap bond, Pearl Academy Jaipur (Morphogenesis) | Cite them in `interventions.json`; show them as "Evidence" in the UI |

---

## 5. Feature list

### MVP (must have for the demo)
1. **Project input**: form + optional natural-language chat box (location, floors, plot area, orientation, budget, retrofit/new).
2. **Real-climate baseline**: Delhi peak-day heat gain, indoor peak °C, RETV vs code.
3. **Intervention library** (about 8–10): Jaali, Chhajja/deep overhang, Aangan courtyard, Lime/cool-roof whitewash, Terracotta/jaali cladding, Cavity/rat-trap bond wall, Green roof, Khus chik / vegetative screen, Jharokha, Ventilator/clerestory.
4. **AI recommendation**: best set under budget + plain-language explanation + heritage note.
5. **Live 3D**: parametric house, interventions appear on the model, thermal tint from the engine.
6. **Sun-path time slider** with real shadows.
7. **Interior/aangan view**: section cutaway + courtyard camera.
8. **Impact panel**: °C drop, kWh, ₹/yr saved, CO₂, cost, payback (replaces placeholder maths in `App.jsx`).
9. **Before/after compare**.
10. **Export report**: PDF/print view with inputs, recommendations, numbers and citations (wire up the existing Export button).

### Stretch
- Airflow particle visualisation (stack effect).
- Delhi ward heat map: pick a location on the map; heat-island intensity sets the baseline.
- **Heat Passport**: a single A-to-G building heat rating (like energy labels).
- 2050 climate mode (future-morphed weather files): "will this house survive 2050 summers?"
- Hindi + voice input.
- Low-income / "₹10,000 mode": khus chiks, lime wash, matka cooling, reflective roof paint for informal housing. Big social-impact point for judges.
- Facility-manager batch mode: upload a CSV of buildings → ranked retrofit priority list.
- Heritage gallery: each intervention links to a real monument (Hawa Mahal jharokha, Rajasthan havelis, Fatehpur Sikri) with photos.
- Upload a floor-plan image → AI extracts dimensions (vision model).

---

## 6. Implementation order (hackathon-sized)

1. **Data first:** `data/interventions.json`, `data/materials.json`, `data/climate/delhi.json` (processed from EPW).
2. **Engine:** `frontend/src/engine/{heatModel.js, optimizer.js, retv.js}` with unit-sanity checks.
3. **Wire the engine into `App.jsx`:** replace placeholder maths. `thermalScore` becomes derived. The left panel is generated from the JSON. Unlock the "Coming soon" cards one by one.
4. **Parametric building + courtyard:** refactor `BuildingScene.jsx`. Add `interventions/{Chhajja,Aangan,GreenRoof,CoolRoof}.jsx`, following the `Jali.jsx` pattern.
5. **Sun path:** `suncalc` + time slider.
6. **Interior:** clipping-plane section + courtyard camera.
7. **Backend + LLM:** single `/api/recommend` + `/api/chat`. Input form/chat UI.
8. **Report export** + before/after.
9. **Stretch features** + pitch polish.

Housekeeping: delete the empty root `src/` duplicate. Commit the current uncommitted `BuildingScene.jsx` changes before refactoring.

---

## 7. Pitch demo script (90 s)
1. "Delhi hit 49 °C. AC demand is crashing the grid. Our grandparents' buildings stayed cool without any."
2. Type: *"2-floor house, Rohini, west-facing, ₹3 lakh budget."* The building appears, glowing red at 3 pm in May.
3. AI: "Add jaali on the west, a 600 mm chhajja, lime cool roof and a light-well aangan. ₹2.7 L, indoor peak −4.2 °C, ₹26k/yr saved." Each one snaps onto the model.
4. Scrub the sun: shadows sweep, the tint goes green. Cut into the section: air particles rise through the aangan.
5. Show RETV going from 22 to 13 W/m², which now passes India's code. Export the report.
6. Close: impact at scale (₹ and MW saved if 10% of Delhi homes retrofit).

---

## Verification
- **Engine:** sanity-check against known values (e.g. a 230 mm brick wall U ≈ 2.1 W/m²K; Delhi May peak ≈ 42–45 °C; adding a green roof should cut roof heat gain by roughly 50–70%). Write small assertion tests for `heatModel.js` and `retv.js`.
- **App:** `cd frontend && npm run dev`. Check in the browser pane that each intervention toggle changes the engine numbers and 3D tint, the sun slider moves the shadows, the section view shows the aangan, and the budget filter is respected.
- **AI:** with fixed inputs, check that the LLM explanation uses only numbers from the engine JSON.
- `npm run lint` and `npm run build` pass.
