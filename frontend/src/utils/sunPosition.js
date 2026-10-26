import * as SunCalc from "suncalc";

// Delhi coordinates
const DELHI_LAT = 28.7041;
const DELHI_LNG = 77.1025;

// Use May 15 as reference (peak summer day)
const REFERENCE_DATE = new Date(2026, 4, 15);

export function getSunPosition(hourOfDay) {
  const date = new Date(REFERENCE_DATE);
  date.setHours(Math.floor(hourOfDay), (hourOfDay % 1) * 60, 0, 0);

  const sunPos = SunCalc.getPosition(date, DELHI_LAT, DELHI_LNG);

  // azimuth: 0 = N, π/2 = E, π = S, 3π/2 = W
  // altitude: 0 = horizon, π/2 = zenith

  const altitude = sunPos.altitude;
  const azimuth = sunPos.azimuth;

  // Only return valid position if sun is above horizon
  if (altitude < 0) return null;

  // Convert to 3D scene coordinates
  // Sun distance from origin (arbitrary, but far enough to light scene)
  const distance = 50;

  // Convert spherical to cartesian
  // In Three.js: +X right, +Y up, +Z toward camera
  // azimuth 0=N(+Z), π/2=E(+X), π=S(-Z), 3π/2=W(-X)
  const x = distance * Math.sin(azimuth) * Math.cos(altitude);
  const y = distance * Math.sin(altitude);
  const z = distance * Math.cos(azimuth) * Math.cos(altitude);

  return { x, y, z, altitude, azimuth };
}

export function getSunTimes(date = REFERENCE_DATE) {
  const times = SunCalc.getTimes(date, DELHI_LAT, DELHI_LNG);
  return {
    sunrise: times.sunrise.getHours() + times.sunrise.getMinutes() / 60,
    sunset: times.sunset.getHours() + times.sunset.getMinutes() / 60,
  };
}

export function generateSunPath(numPoints = 40) {
  const { sunrise, sunset } = getSunTimes();
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const hour = sunrise + t * (sunset - sunrise);
    const pos = getSunPosition(hour);
    if (pos) {
      points.push([pos.x, pos.y, pos.z]);
    }
  }

  return points;
}
