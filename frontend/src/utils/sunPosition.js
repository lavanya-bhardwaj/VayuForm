import * as SunCalc from "suncalc";

// Default location for sun calculations: New Delhi. Pass a site ({ lat, lon }) to use another city.
const DEFAULT_AT = { lat: 28.6139, lon: 77.209 };

// Use May 15 as reference (peak summer day)
const REFERENCE_DATE = new Date(2026, 4, 15);

export function getSunPosition(hourOfDay, at = DEFAULT_AT) {
  const date = new Date(REFERENCE_DATE);
  date.setHours(Math.floor(hourOfDay), (hourOfDay % 1) * 60, 0, 0);

  const sunPos = SunCalc.getPosition(date, at.lat, at.lon);

  // suncalc 2.x returns degrees, with azimuth clockwise from north (0 = N, 90 = E, 180 = S).
  // Convert to radians here so the rest of the scene can use radians.
  const DEG = Math.PI / 180;
  const altitude = sunPos.altitude * DEG; // 0 = horizon, π/2 = zenith
  const azimuth = sunPos.azimuth * DEG; // 0 = N, π/2 = E, π = S, 3π/2 = W

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

export function getSunTimes(date = REFERENCE_DATE, at = DEFAULT_AT) {
  const times = SunCalc.getTimes(date, at.lat, at.lon);
  return {
    sunrise: times.sunrise.getHours() + times.sunrise.getMinutes() / 60,
    sunset: times.sunset.getHours() + times.sunset.getMinutes() / 60,
  };
}

export function generateSunPath(numPoints = 40, at = DEFAULT_AT) {
  const { sunrise, sunset } = getSunTimes(REFERENCE_DATE, at);
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const hour = sunrise + t * (sunset - sunrise);
    const pos = getSunPosition(hour, at);
    if (pos) {
      points.push([pos.x, pos.y, pos.z]);
    }
  }

  return points;
}

/**
 * Outdoor air temperature at a given hour, for the sun slider.
 * It follows a sine curve from the city's night low at sunrise and sunset up to its design peak.
 */
export function getOutdoorTemperature(hourOfDay, climate, at = DEFAULT_AT) {
  const { sunrise, sunset } = getSunTimes(REFERENCE_DATE, at);
  const peakTemp = climate.outdoorPeakC;
  const minTemp = climate.outdoorNightLowC;

  if (hourOfDay < sunrise || hourOfDay > sunset) {
    return minTemp;
  }

  // Normalized position in day (0 to 1)
  const dayLength = sunset - sunrise;
  const positionInDay = (hourOfDay - sunrise) / dayLength;

  // Sine curve: min at edges, max at peak
  const tempFraction = Math.sin(positionInDay * Math.PI);
  const temp = minTemp + tempFraction * (peakTemp - minTemp);

  return Math.round(temp * 10) / 10; // Round to 1 decimal
}
