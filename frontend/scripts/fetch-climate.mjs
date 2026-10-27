// Derives the Delhi design-day values in src/data/climate/delhi.json from Open-Meteo historical data.
// Run with: node scripts/fetch-climate.mjs
// Method: for each year 2015–2024, take the hottest hour and the highest horizontal solar
// irradiance in May–June. The design value is the median of those annual peaks, so one
// unusually hot year does not set it.

const LAT = 28.6139;
const LON = 77.209;
const START = "2015-05-01";
const END = "2024-06-30";
const MONTHS = [5, 6];

const url =
  `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}` +
  `&start_date=${START}&end_date=${END}` +
  `&hourly=temperature_2m,shortwave_radiation&timezone=Asia%2FKolkata`;

const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
const { hourly } = await res.json();

const years = {};
hourly.time.forEach((stamp, i) => {
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(5, 7));
  if (!MONTHS.includes(month)) return;
  const y = (years[year] ??= { temps: [], solar: [] });
  y.temps.push(hourly.temperature_2m[i]);
  y.solar.push(hourly.shortwave_radiation[i]);
});

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2;
};

const annual = Object.entries(years).map(([year, v]) => ({
  year: Number(year),
  maxTempC: Math.max(...v.temps),
  maxGhiWm2: Math.max(...v.solar),
}));

const outdoorPeakC = Number(median(annual.map((a) => a.maxTempC)).toFixed(1));
const roofSolarWm2 = Math.round(median(annual.map((a) => a.maxGhiWm2)));

console.log(JSON.stringify({ outdoorPeakC, roofSolarWm2, years: annual }, null, 2));
