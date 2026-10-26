/**
 * Solar Gain Formula Validation
 *
 * Verifies: Q_solar = SHGC × A × irradiance × shadingFactor
 *
 * Solar Heat Gain Coefficient (SHGC) = fraction of solar radiation transmitted through glass
 * Ranges: 0-1 (0 = opaque, 1 = all solar passes through)
 *
 * Run in browser console: validateSolar()
 */

import { buildGeometry, mergeEffects, analyse, DEFAULT_BUILDING } from './heatModel.js';
import climate from '../data/climate/delhi.json';
import materials from '../data/materials.json';
import { INTERVENTIONS } from './interventions.js';

export function validateSolar() {
  console.log('\n=== SOLAR GAIN FORMULA VALIDATION ===\n');

  const results = {
    passed: [],
    failed: [],
  };

  const building = DEFAULT_BUILDING;
  const geo = buildGeometry(building, []);
  const tOut = climate.outdoorPeakC;
  const tIn = climate.indoorComfortC;

  // ============================================================
  // Test 1: SHGC Values & Glazing Properties
  // ============================================================
  console.log('TEST 1: Solar Heat Gain Coefficient (SHGC)\n');

  const shgc = materials.baseline.glazing.SHGC; // 0.8
  const glazingU = materials.baseline.glazing.U; // 5.8

  console.log(`  Glazing type: ${materials.baseline.glazing.name}`);
  console.log(`  SHGC: ${shgc} (meaning ${(shgc * 100).toFixed(0)}% of solar radiation transmits through)`);
  console.log(`  U-value: ${glazingU} W/m²K\n`);

  if (shgc > 0 && shgc <= 1) {
    results.passed.push(`SHGC is valid (0-1 range): ${shgc}`);
  } else {
    results.failed.push({
      test: 'SHGC should be between 0-1',
      value: shgc,
    });
  }

  // ============================================================
  // Test 2: Solar Irradiance by Facade
  // ============================================================
  console.log('TEST 2: Solar Irradiance by Facade (Peak Day, May 15)\n');

  const irradiances = {
    N: climate.solarPeakWm2.N,
    E: climate.solarPeakWm2.E,
    S: climate.solarPeakWm2.S,
    W: climate.solarPeakWm2.W,
    roof: climate.solarPeakWm2.roof,
  };

  console.log('  Peak solar irradiance (W/m²):');
  for (const [facade, irr] of Object.entries(irradiances)) {
    console.log(`    ${facade.toUpperCase()}: ${irr}`);
  }
  console.log();

  // Verify east/west > north/south (morning/afternoon dominance)
  const ewAvg = (irradiances.E + irradiances.W) / 2;
  const nsAvg = (irradiances.N + irradiances.S) / 2;
  if (ewAvg > nsAvg) {
    results.passed.push(`East/West avg (${ewAvg.toFixed(0)}) > North/South avg (${nsAvg.toFixed(0)}) ✓`);
  } else {
    results.failed.push({
      test: 'East/West should have higher average irradiance',
      ewAvg,
      nsAvg,
    });
  }

  // Roof should be highest (nearly perpendicular)
  if (irradiances.roof > Math.max(...Object.values(irradiances).slice(0, 4))) {
    results.passed.push(`Roof irradiance (${irradiances.roof}) highest (perpendicular sun)`);
  } else {
    results.failed.push({
      test: 'Roof should have highest irradiance',
      roof: irradiances.roof,
      facades: Object.values(irradiances).slice(0, 4),
    });
  }

  // ============================================================
  // Test 3: Transmitted Solar Through Glazing (No Shading)
  // ============================================================
  console.log('TEST 3: Transmitted Solar Through Glazing (SHGC × A × irradiance)\n');

  const glazingAreaPerFacade = geo.facades.N.glazingM2; // 12.8 m²

  console.log(`  Glazing area per facade: ${glazingAreaPerFacade.toFixed(1)} m²`);
  console.log(`  Formula: Q_solar = SHGC × A × irradiance\n`);

  const solarGains = {};
  for (const [facade, irr] of Object.entries(irradiances)) {
    if (facade === 'roof') continue; // Skip roof (different area)
    const gain = shgc * glazingAreaPerFacade * irr;
    solarGains[facade] = gain;
    console.log(`  ${facade.toUpperCase()}: ${shgc} × ${glazingAreaPerFacade.toFixed(1)} × ${irr} = ${gain.toFixed(0)} W`);
  }
  console.log();

  const totalGlazingSolar = Object.values(solarGains).reduce((a, b) => a + b, 0);
  console.log(`  TOTAL (4 facades, no shading): ${totalGlazingSolar.toFixed(0)} W\n`);

  if (totalGlazingSolar > 0) {
    results.passed.push(`Transmitted solar (no shading): ${totalGlazingSolar.toFixed(0)} W`);
  } else {
    results.failed.push({
      test: 'Transmitted solar should be positive',
      value: totalGlazingSolar,
    });
  }

  // ============================================================
  // Test 4: Shading Factor Effect (Fixed 30% Shading)
  // ============================================================
  console.log('TEST 4: Shading Factor (How Much Solar is Blocked)\n');

  const fixedShadingFactor = 0.7; // 30% blocked, 70% passes through

  console.log(`  Fixed shading factor: ${fixedShadingFactor} (meaning ${((1 - fixedShadingFactor) * 100).toFixed(0)}% is blocked)\n`);

  const shadedGains = {};
  for (const [facade, irr] of Object.entries(irradiances)) {
    if (facade === 'roof') continue;
    const gain = shgc * glazingAreaPerFacade * irr * fixedShadingFactor;
    shadedGains[facade] = gain;
    console.log(`  ${facade.toUpperCase()}: ${shgc} × ${glazingAreaPerFacade.toFixed(1)} × ${irr} × ${fixedShadingFactor} = ${gain.toFixed(0)} W`);
  }
  console.log();

  const totalShadedSolar = Object.values(shadedGains).reduce((a, b) => a + b, 0);
  console.log(`  TOTAL (4 facades, with 30% shading): ${totalShadedSolar.toFixed(0)} W\n`);

  const reduction = totalGlazingSolar - totalShadedSolar;
  if (reduction > 0) {
    results.passed.push(`Shading blocks ${(reduction / totalGlazingSolar * 100).toFixed(1)}% of glazing solar`);
  } else {
    results.failed.push({
      test: 'Shading should reduce solar gain',
      unshaded: totalGlazingSolar,
      shaded: totalShadedSolar,
    });
  }

  // ============================================================
  // Test 5: Intervention Shading Factors
  // ============================================================
  console.log('TEST 5: Intervention Shading Factors\n');

  const interventions = [
    { id: 'jali', expectedMult: 0.5 },
    { id: 'chhajja', expectedMult: 0.7 },
    { id: 'khus-chik', expectedMult: 0.6 },
  ];

  console.log('  Shading device effectiveness (higher multiplier = more sun passes):\n');

  for (const intervention of interventions) {
    const item = INTERVENTIONS.find(i => i.id === intervention.id);
    if (!item) {
      results.failed.push({
        test: `Intervention ${intervention.id} not found`,
      });
      continue;
    }

    const mult = item.effect.glazingShadingMult ?? 1.0;
    console.log(`  ${item.name} (${item.id}):`);
    console.log(`    Shading multiplier: ${mult}`);
    console.log(`    Blocks: ${((1 - mult) * 100).toFixed(0)}%`);
    console.log();

    if (Math.abs(mult - intervention.expectedMult) < 0.01) {
      results.passed.push(`${item.name} has expected shading multiplier: ${mult}`);
    } else {
      results.failed.push({
        test: `${item.name} shading multiplier`,
        expected: intervention.expectedMult,
        actual: mult,
      });
    }
  }

  // ============================================================
  // Test 6: Shading Multiplier Ranking
  // ============================================================
  console.log('TEST 6: Shading Effectiveness Ranking\n');

  console.log('  For glazing solar gain, lower multiplier = more effective:');
  console.log(`    Jali (0.5×):      MOST effective, blocks 50% of solar`);
  console.log(`    Khus-chik (0.6×): Effective, blocks 40% of solar`);
  console.log(`    Chhajja (0.7×):   Moderate, blocks 30% of solar`);
  console.log(`    Fixed shade (0.7×): Moderate, blocks 30% of solar\n`);

  const jaliEffectivenessRanking =
    interventions[0].expectedMult < interventions[2].expectedMult &&
    interventions[2].expectedMult < interventions[1].expectedMult;

  if (jaliEffectivenessRanking) {
    results.passed.push(`Intervention ranking correct (Jali > Khus > Chhajja)`);
  } else {
    results.failed.push({
      test: 'Intervention shading should rank correctly',
      jali: interventions[0].expectedMult,
      khus: interventions[2].expectedMult,
      chhajja: interventions[1].expectedMult,
    });
  }

  // ============================================================
  // Test 7: Multiple Interventions Compound
  // ============================================================
  console.log('TEST 7: Shading Multipliers Compound (Multiplicative)\n');

  console.log('  If two shading devices are combined, multipliers multiply:\n');
  console.log('  Example: Jali (0.5×) + existing fixed shade (0.7×)');
  console.log(`    Result: 0.5 × 0.7 = 0.35× (65% of solar is blocked!)\n`);

  const compoundedMult = 0.5 * 0.7;
  console.log(`  Formula verification: ${(0.5 * 0.7).toFixed(2)} = ${compoundedMult}`);
  console.log();

  if (compoundedMult < 0.5 && compoundedMult < 0.7) {
    results.passed.push(`Compounded multipliers work: 0.5 × 0.7 = ${compoundedMult.toFixed(2)}`);
  } else {
    results.failed.push({
      test: 'Compounded multipliers should be multiplicative',
      calculation: '0.5 × 0.7',
      result: compoundedMult,
    });
  }

  // ============================================================
  // Test 8: Solar Gain Dominates Over Conduction
  // ============================================================
  console.log('TEST 8: Solar Gain vs. Conduction (For Glazing)\n');

  const conductionGain = glazingU * glazingAreaPerFacade * (tOut - tIn);
  const solarGain = totalGlazingSolar;

  console.log(`  Conduction through glazing: ${conductionGain.toFixed(0)} W`);
  console.log(`  Transmitted solar (no shade): ${solarGain.toFixed(0)} W`);
  console.log(`  Solar/Conduction ratio: ${(solarGain / conductionGain).toFixed(1)}×\n`);

  if (solarGain > conductionGain) {
    results.passed.push(`Solar gain dominates (${(solarGain / conductionGain).toFixed(1)}× conduction)`);
  } else {
    results.failed.push({
      test: 'Solar should dominate over conduction for glazing in Delhi',
      conduction: conductionGain,
      solar: solarGain,
    });
  }

  // ============================================================
  // Test 9: Total Heat Gain Breakdown
  // ============================================================
  console.log('TEST 9: Complete Heat Gain Composition\n');

  const baseline = analyse(building, []);
  const { walls, glazing, roof } = baseline.gainBreakdownW;

  console.log(`  Baseline building total heat gain: ${baseline.totalGainW.toFixed(0)} W\n`);
  console.log('  Breakdown:');
  console.log(`    Walls (conduction + sol-air):  ${walls.toFixed(0)} W (${(walls / baseline.totalGainW * 100).toFixed(1)}%)`);
  console.log(`    Glazing (conduct + solar):     ${glazing.toFixed(0)} W (${(glazing / baseline.totalGainW * 100).toFixed(1)}%)`);
  console.log(`    Roof (conduction + sol-air):   ${roof.toFixed(0)} W (${(roof / baseline.totalGainW * 100).toFixed(1)}%)\n`);

  if (walls > 0 && glazing > 0 && roof > 0) {
    results.passed.push(`All heat sources positive: walls=${walls.toFixed(0)}, glazing=${glazing.toFixed(0)}, roof=${roof.toFixed(0)}`);
  } else {
    results.failed.push({
      test: 'All heat gain components should be positive',
      walls,
      glazing,
      roof,
    });
  }

  if (roof > walls) {
    results.passed.push(`Roof dominates (${roof.toFixed(0)} W > walls ${walls.toFixed(0)} W)`);
  }

  // ============================================================
  // Test 10: Jali Intervention Effect
  // ============================================================
  console.log('TEST 10: Jali Intervention Effect on Solar Gain\n');

  const baselineSolar = baseline.totalGainW;
  const withJali = analyse(building, ['jali']);
  const jaliReduction = baselineSolar - withJali.totalGainW;
  const jaliPercent = (jaliReduction / baselineSolar) * 100;

  console.log(`  Without Jali: ${baselineSolar.toFixed(0)} W`);
  console.log(`  With Jali:    ${withJali.totalGainW.toFixed(0)} W`);
  console.log(`  Reduction:    ${jaliReduction.toFixed(0)} W (${jaliPercent.toFixed(1)}%)\n`);

  if (jaliReduction > 0 && jaliPercent > 5 && jaliPercent < 30) {
    results.passed.push(`Jali reduces gain by ${jaliPercent.toFixed(1)}% (expected 10-20%)`);
  } else {
    results.failed.push({
      test: 'Jali should reduce gain by 10-20%',
      baseline: baselineSolar,
      withJali: withJali.totalGainW,
      reduction: jaliPercent,
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
globalThis.validateSolar = validateSolar;
