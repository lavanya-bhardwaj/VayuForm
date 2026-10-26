/**
 * Conduction Formula Validation
 *
 * Verifies: Q = U × A × ΔT (conduction heat gain)
 * And: tSol = tOut + (α × irradiance) / h (sol-air temperature)
 *
 * Run in browser console: validateConduction()
 */

import { buildGeometry, mergeEffects, analyse, DEFAULT_BUILDING } from './heatModel.js';
import climate from '../data/climate/delhi.json';
import materials from '../data/materials.json';

export function validateConduction() {
  console.log('\n=== CONDUCTION FORMULA VALIDATION ===\n');

  const results = {
    passed: [],
    failed: [],
  };

  const building = DEFAULT_BUILDING;
  const geo = buildGeometry(building, []);
  const fx = mergeEffects([]);
  const tOut = climate.outdoorPeakC; // 44°C
  const tIn = climate.indoorComfortC; // 28°C
  const ho = climate.surfaceHeatTransferCoeffWm2K; // 17 W/m²K

  console.log('CONSTANTS:');
  console.log(`  Outdoor peak: ${tOut}°C`);
  console.log(`  Indoor comfort: ${tIn}°C`);
  console.log(`  Surface heat transfer coeff (h): ${ho} W/m²K`);
  console.log(`  ΔT (outdoor - indoor): ${tOut - tIn}°C\n`);

  // ============================================================
  // Test 1: Basic Conduction through Walls
  // ============================================================
  console.log('TEST 1: Wall Conduction (Q = U × A × ΔT)\n');

  const wallU = materials.baseline.wall.U; // 2.1 W/m²K
  const wallAlpha = materials.baseline.wall.alpha; // 0.6
  const wallArea = geo.facades.N.wallM2; // 51.2 m² per facade

  console.log(`  Wall material: ${materials.baseline.wall.name}`);
  console.log(`  U-value: ${wallU} W/m²K`);
  console.log(`  Solar absorptance (α): ${wallAlpha}`);
  console.log(`  Area (north facade): ${wallArea.toFixed(1)} m²\n`);

  // Without solar (basic conduction only)
  const Q_wall_basic = wallU * wallArea * (tOut - tIn);
  console.log(`  Basic conduction (no solar):`);
  console.log(`    Q = ${wallU} × ${wallArea.toFixed(1)} × ${tOut - tIn}`);
  console.log(`    Q = ${Q_wall_basic.toFixed(0)} W\n`);

  if (Q_wall_basic > 0) {
    results.passed.push(`Wall conduction is positive: ${Q_wall_basic.toFixed(0)} W`);
  } else {
    results.failed.push({
      test: 'Wall conduction should be positive',
      calculation: `${wallU} × ${wallArea} × ${tOut - tIn}`,
      result: Q_wall_basic,
    });
  }

  // ============================================================
  // Test 2: Sol-Air Temperature for Walls
  // ============================================================
  console.log('TEST 2: Sol-Air Temperature (tSol = tOut + α×irr/h)\n');

  const solarIrrN = climate.solarPeakWm2.N; // 150 W/m² (north)
  const solarIrrS = climate.solarPeakWm2.S; // 350 W/m² (south)
  const solarIrrE = climate.solarPeakWm2.E; // 550 W/m² (east)
  const solarIrrW = climate.solarPeakWm2.W; // 650 W/m² (west)

  const tSol_N = tOut + (wallAlpha * solarIrrN) / ho;
  const tSol_S = tOut + (wallAlpha * solarIrrS) / ho;
  const tSol_E = tOut + (wallAlpha * solarIrrE) / ho;
  const tSol_W = tOut + (wallAlpha * solarIrrW) / ho;

  console.log(`  North: tSol = ${tOut} + (${wallAlpha} × ${solarIrrN}) / ${ho} = ${tSol_N.toFixed(1)}°C`);
  console.log(`  South: tSol = ${tOut} + (${wallAlpha} × ${solarIrrS}) / ${ho} = ${tSol_S.toFixed(1)}°C`);
  console.log(`  East:  tSol = ${tOut} + (${wallAlpha} × ${solarIrrE}) / ${ho} = ${tSol_E.toFixed(1)}°C`);
  console.log(`  West:  tSol = ${tOut} + (${wallAlpha} × ${solarIrrW}) / ${ho} = ${tSol_W.toFixed(1)}°C\n`);

  const solAirTemps = [tSol_N, tSol_S, tSol_E, tSol_W];
  const allGreaterThanOutdoor = solAirTemps.every(t => t > tOut);
  if (allGreaterThanOutdoor) {
    results.passed.push(`Sol-air temps correctly exceed outdoor (${tOut}°C)`);
  } else {
    results.failed.push({
      test: 'Sol-air temps should exceed outdoor temp (solar heats surface)',
      outdoor: tOut,
      solAir: solAirTemps,
    });
  }

  const solAirIncreases = [tSol_N - tOut, tSol_S - tOut, tSol_E - tOut, tSol_W - tOut];
  const eastWestHigherThanNorthSouth = Math.min(...solAirIncreases.slice(2)) > Math.max(...solAirIncreases.slice(0, 2));
  if (eastWestHigherThanNorthSouth) {
    results.passed.push(`East/West sol-air temps higher than North/South (more solar exposure) ✓`);
  } else {
    results.failed.push({
      test: 'East/West should have higher sol-air temps than N/S',
      northSouth: solAirIncreases.slice(0, 2),
      eastWest: solAirIncreases.slice(2),
    });
  }

  // ============================================================
  // Test 3: Wall Gain with Sol-Air Temperature
  // ============================================================
  console.log('TEST 3: Wall Heat Gain with Sol-Air (Q = U × A × (tSol - tIn))\n');

  const Q_wall_N = wallU * wallArea * (tSol_N - tIn);
  const Q_wall_S = wallU * wallArea * (tSol_S - tIn);
  const Q_wall_E = wallU * wallArea * (tSol_E - tIn);
  const Q_wall_W = wallU * wallArea * (tSol_W - tIn);

  console.log(`  North: Q = ${wallU} × ${wallArea.toFixed(1)} × (${tSol_N.toFixed(1)} - ${tIn}) = ${Q_wall_N.toFixed(0)} W`);
  console.log(`  South: Q = ${wallU} × ${wallArea.toFixed(1)} × (${tSol_S.toFixed(1)} - ${tIn}) = ${Q_wall_S.toFixed(0)} W`);
  console.log(`  East:  Q = ${wallU} × ${wallArea.toFixed(1)} × (${tSol_E.toFixed(1)} - ${tIn}) = ${Q_wall_E.toFixed(0)} W`);
  console.log(`  West:  Q = ${wallU} × ${wallArea.toFixed(1)} × (${tSol_W.toFixed(1)} - ${tIn}) = ${Q_wall_W.toFixed(0)} W`);
  console.log(`  TOTAL (4 facades): ${(Q_wall_N + Q_wall_S + Q_wall_E + Q_wall_W).toFixed(0)} W\n`);

  const wallGains = [Q_wall_N, Q_wall_S, Q_wall_E, Q_wall_W];
  if (wallGains.every(q => q > 0)) {
    results.passed.push(`All wall gains positive (sun heats all facades)`);
  } else {
    results.failed.push({
      test: 'All wall gains should be positive',
      gains: wallGains,
    });
  }

  // ============================================================
  // Test 4: Roof Conduction & Sol-Air
  // ============================================================
  console.log('TEST 4: Roof Conduction (Q = U × A × (tSol - tIn))\n');

  const roofU = materials.baseline.roof.U; // 3.2 W/m²K
  const roofAlpha = materials.baseline.roof.alpha; // 0.7
  const roofArea = geo.roofM2; // 100 m²
  const solarIrrRoof = climate.solarPeakWm2.roof; // 900 W/m²

  const tSol_roof = tOut + (roofAlpha * solarIrrRoof) / ho;
  const Q_roof = roofU * roofArea * (tSol_roof - tIn);

  console.log(`  Roof material: ${materials.baseline.roof.name}`);
  console.log(`  U-value: ${roofU} W/m²K, α: ${roofAlpha}`);
  console.log(`  Area: ${roofArea} m², Irradiance: ${solarIrrRoof} W/m²\n`);
  console.log(`  Sol-air temp: ${tOut} + (${roofAlpha} × ${solarIrrRoof}) / ${ho} = ${tSol_roof.toFixed(1)}°C`);
  console.log(`  Heat gain: ${roofU} × ${roofArea} × (${tSol_roof.toFixed(1)} - ${tIn}) = ${Q_roof.toFixed(0)} W\n`);

  if (Q_roof > 0) {
    results.passed.push(`Roof gain is positive: ${Q_roof.toFixed(0)} W`);
  } else {
    results.failed.push({
      test: 'Roof gain should be positive',
      calculation: `${roofU} × ${roofArea} × (${tSol_roof.toFixed(1)} - ${tIn})`,
      result: Q_roof,
    });
  }

  if (Q_roof > Q_wall_N + Q_wall_S) {
    results.passed.push(`Roof gain (${Q_roof.toFixed(0)}W) > wall gains (roof has higher solar exposure)`);
  } else {
    results.failed.push({
      test: 'Roof gain should exceed wall gains due to higher irradiance',
      roof: Q_roof,
      walls: Q_wall_N + Q_wall_S,
    });
  }

  // ============================================================
  // Test 5: Glazing Conduction
  // ============================================================
  console.log('TEST 5: Glazing Conduction (Separate from SHGC Solar)\n');

  const glazingU = materials.baseline.glazing.U; // 5.8 W/m²K
  const glazingArea = geo.facades.N.glazingM2; // 12.8 m² per facade
  const Q_glazing_cond = glazingU * glazingArea * (tOut - tIn);

  console.log(`  Glazing: ${materials.baseline.glazing.name}`);
  console.log(`  U-value: ${glazingU} W/m²K (higher than opaque walls!)`);
  console.log(`  Area per facade: ${glazingArea.toFixed(1)} m²\n`);
  console.log(`  Conduction only: Q = ${glazingU} × ${glazingArea.toFixed(1)} × ${tOut - tIn} = ${Q_glazing_cond.toFixed(0)} W`);
  console.log(`  Note: Glazing has NO sol-air component (transparent to solar)\n`);

  if (glazingU > wallU) {
    results.passed.push(`Glazing U-value (${glazingU}) > wall U-value (${wallU}) — glass conducts more heat`);
  } else {
    results.failed.push({
      test: 'Glazing should have higher U-value than walls (worse insulator)',
      glazing: glazingU,
      wall: wallU,
    });
  }

  // ============================================================
  // Test 6: U-Value Material Differences
  // ============================================================
  console.log('TEST 6: Material U-Value Hierarchy\n');

  const materials_to_check = [
    ['Baseline wall', wallU],
    ['Baseline roof', roofU],
    ['Baseline glazing', glazingU],
  ];

  console.log('  U-values (lower = better insulation):');
  for (const [name, u] of materials_to_check) {
    console.log(`    ${name}: ${u} W/m²K`);
  }
  console.log();

  const wallBetterThanRoof = wallU < roofU;
  if (wallBetterThanRoof) {
    results.passed.push(`Wall U (${wallU}) < roof U (${roofU}) — roof is bottleneck ✓`);
  } else {
    results.failed.push({
      test: 'Roof should have higher U-value than wall (typical construction)',
      wall: wallU,
      roof: roofU,
    });
  }

  // ============================================================
  // Print Results
  // ============================================================
  console.log('=== SUMMARY ===\n');
  console.log('PASSED:');
  for (const msg of results.passed) {
    console.log(`  ✓ ${msg}`);
  }

  if (results.failed.length > 0) {
    console.log('\nFAILED:');
    for (const fail of results.failed) {
      console.log(`  ✗ ${fail.test}`);
      console.log(`    ${JSON.stringify(fail)}`);
    }
  }

  console.log(`\nResult: ${results.passed.length} passed, ${results.failed.length} failed\n`);

  return results.failed.length === 0;
}

// Export for browser console
globalThis.validateConduction = validateConduction;
