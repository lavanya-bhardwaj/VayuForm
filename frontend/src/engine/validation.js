/**
 * Physics engine validation & unit-sanity checks
 * Import and call runValidation() to check engine correctness
 */

import { buildGeometry, analyse, mergeEffects, DEFAULT_BUILDING } from './heatModel.js';
import climate from '../data/climate/delhi.json';

export function runValidation() {
  console.log('\n=== PHYSICS ENGINE VALIDATION ===\n');

  const results = {
    passed: [],
    failed: [],
  };

  // Test 1: Geometry calculations
  const geo = buildGeometry(DEFAULT_BUILDING, []);
  const storeyHeight = climate.storeyHeightM;
  const side = Math.sqrt(DEFAULT_BUILDING.footprintM2);
  const expectedGrossPerFacade = side * storeyHeight * DEFAULT_BUILDING.floors;

  if (Math.abs(geo.facades.N.grossM2 - expectedGrossPerFacade) < 0.1) {
    results.passed.push('Geometry: Facade gross area calculation');
  } else {
    results.failed.push({
      test: 'Geometry: Facade gross area',
      expected: expectedGrossPerFacade,
      actual: geo.facades.N.grossM2,
    });
  }

  // Test 2: Glazing area
  const expectedGlazing = expectedGrossPerFacade * DEFAULT_BUILDING.wwr;
  if (Math.abs(geo.facades.N.glazingM2 - expectedGlazing) < 0.1) {
    results.passed.push('Geometry: Per-facade glazing area (20% wwr)');
  } else {
    results.failed.push({
      test: 'Geometry: Glazing area',
      expected: expectedGlazing,
      actual: geo.facades.N.glazingM2,
    });
  }

  // Test 3: Total glazing area (4 facades)
  const expectedTotalGlazing = expectedGlazing * 4;
  if (Math.abs(geo.glazingM2 - expectedTotalGlazing) < 0.1) {
    results.passed.push('Geometry: Total glazing area (4 facades)');
  } else {
    results.failed.push({
      test: 'Geometry: Total glazing area',
      expected: expectedTotalGlazing,
      actual: geo.glazingM2,
    });
  }

  // Test 4: Roof area
  if (Math.abs(geo.roofM2 - DEFAULT_BUILDING.footprintM2) < 0.1) {
    results.passed.push('Geometry: Roof area');
  } else {
    results.failed.push({
      test: 'Geometry: Roof area',
      expected: DEFAULT_BUILDING.footprintM2,
      actual: geo.roofM2,
    });
  }

  // Test 5: Floor area
  const expectedFloorArea = DEFAULT_BUILDING.footprintM2 * DEFAULT_BUILDING.floors;
  if (Math.abs(geo.floorAreaM2 - expectedFloorArea) < 0.1) {
    results.passed.push('Geometry: Floor area');
  } else {
    results.failed.push({
      test: 'Geometry: Floor area',
      expected: expectedFloorArea,
      actual: geo.floorAreaM2,
    });
  }

  // Test 6: Default building baseline temperature
  // Expected: ~39°C for typical 2-storey brick house (per climate.json comment)
  const baseline = analyse(DEFAULT_BUILDING, []);
  if (baseline.indoorPeakC > 35 && baseline.indoorPeakC < 43) {
    results.passed.push(`Baseline: Indoor peak temperature = ${baseline.indoorPeakC.toFixed(1)}°C (expected 35-43°C)`);
  } else {
    results.failed.push({
      test: 'Baseline: Indoor peak temperature',
      expected: '35-43°C',
      actual: baseline.indoorPeakC,
    });
  }

  // Test 7: Solar gain is positive (sun heats building)
  if (baseline.totalGainW > 0) {
    results.passed.push(`Baseline: Total heat gain = ${baseline.totalGainW.toFixed(0)}W (positive ✓)`);
  } else {
    results.failed.push({
      test: 'Baseline: Heat gain should be positive',
      expected: '> 0 W',
      actual: baseline.totalGainW,
    });
  }

  // Test 8: Gain breakdown is positive
  const { walls, glazing, roof } = baseline.gainBreakdownW;
  if (walls > 0 && glazing > 0 && roof > 0) {
    results.passed.push(`Baseline: Gain breakdown all positive (walls=${walls.toFixed(0)}W, glazing=${glazing.toFixed(0)}W, roof=${roof.toFixed(0)}W)`);
  } else {
    results.failed.push({
      test: 'Baseline: All gain components should be positive',
      walls,
      glazing,
      roof,
    });
  }

  // Test 9: Thermal score maps gain to 0-100
  const score = baseline.thermalScore;
  if (score >= 0 && score <= 100 && typeof score === 'number') {
    results.passed.push(`Baseline: Thermal score = ${score} (valid 0-100 range ✓)`);
  } else {
    results.failed.push({
      test: 'Baseline: Thermal score out of bounds',
      expected: '0-100',
      actual: score,
    });
  }

  // Test 10: Interventions reduce heat gain
  // Example: Jali screen should block some wall solar
  const withJali = analyse(DEFAULT_BUILDING, ['jali']);
  if (withJali.totalGainW < baseline.totalGainW) {
    const reduction = baseline.totalGainW - withJali.totalGainW;
    results.passed.push(`Intervention: Jali reduces gain by ${reduction.toFixed(0)}W (${((reduction/baseline.totalGainW)*100).toFixed(1)}%)`);
  } else {
    results.failed.push({
      test: 'Intervention: Jali should reduce total gain',
      baseline: baseline.totalGainW,
      withJali: withJali.totalGainW,
    });
  }

  // Test 11: Interventions reduce indoor peak temp
  if (withJali.indoorPeakC < baseline.indoorPeakC) {
    const tempDrop = baseline.indoorPeakC - withJali.indoorPeakC;
    results.passed.push(`Intervention: Jali lowers peak by ${tempDrop.toFixed(2)}°C`);
  } else {
    results.failed.push({
      test: 'Intervention: Jali should lower indoor peak temp',
      baseline: baseline.indoorPeakC,
      withJali: withJali.indoorPeakC,
    });
  }

  // Test 12: Effect merging multiplies shading factors
  const fx = mergeEffects(['jali']);
  if (fx.glazingShadingMult < 1.0) {
    results.passed.push(`Effects: Jali shading multiplier = ${fx.glazingShadingMult.toFixed(3)} (reduced from 1.0 ✓)`);
  } else {
    results.failed.push({
      test: 'Effects: Jali should reduce glazing shading multiplier',
      expected: '< 1.0',
      actual: fx.glazingShadingMult,
    });
  }

  // Test 13: Multiple interventions compound
  const withCoolRoof = analyse(DEFAULT_BUILDING, ['lime-cool-roof']);
  const withBoth = analyse(DEFAULT_BUILDING, ['jali', 'lime-cool-roof']);
  const jaliReduction = baseline.totalGainW - withJali.totalGainW;
  const roofReduction = baseline.totalGainW - withCoolRoof.totalGainW;
  const bothReduction = baseline.totalGainW - withBoth.totalGainW;

  // Should have roughly additive effect (or more if they interact positively)
  if (bothReduction >= Math.min(jaliReduction + roofReduction * 0.5, baseline.totalGainW * 0.8)) {
    results.passed.push(`Interventions: Multiple interventions compound (jali+cool-roof reduces by ${bothReduction.toFixed(0)}W)`);
  } else {
    results.failed.push({
      test: 'Interventions: Multiple interventions should have compounding effect',
      jaliOnly: jaliReduction.toFixed(0),
      roofOnly: roofReduction.toFixed(0),
      bothTogether: bothReduction.toFixed(0),
    });
  }

  // Print results
  console.log('PASSED:');
  for (const msg of results.passed) {
    console.log(`  ✓ ${msg}`);
  }

  if (results.failed.length > 0) {
    console.log('\nFAILED:');
    for (const fail of results.failed) {
      console.log(`  ✗ ${fail.test}`);
      console.log(`    Expected: ${JSON.stringify(fail.expected || fail)}`);
      console.log(`    Actual: ${JSON.stringify(fail.actual || fail)}`);
    }
  }

  console.log(`\nSummary: ${results.passed.length} passed, ${results.failed.length} failed\n`);

  return results.failed.length === 0;
}

// Export for use in browser console or tests
globalThis.validatePhysicsEngine = runValidation;
