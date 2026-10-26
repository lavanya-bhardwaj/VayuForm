/**
 * Economics & Energy Validation
 *
 * Tests cost and energy calculations:
 * - Intervention costs (unit cost × area)
 * - Annual energy savings (cooling kWh reduction)
 * - CO₂ emissions avoided
 * - Payback period calculations
 * - Optimizer ranking logic
 *
 * Run in browser console: validateEconomics()
 */

import { analyse, buildGeometry, interventionCostInr, DEFAULT_BUILDING } from './heatModel.js';
import { annualImpact, FACADES } from './heatModel.js';
import { INTERVENTIONS } from './interventions.js';
import { optimise, totalCostInr } from './optimizer.js';
import climate from '../data/climate/delhi.json';

export function validateEconomics() {
  console.log('\n=== ECONOMICS & ENERGY VALIDATION ===\n');

  const results = {
    passed: [],
    failed: [],
  };

  const building = DEFAULT_BUILDING;
  const geo = buildGeometry(building, []);
  const baseline = analyse(building, []);

  console.log('BASELINE BUILDING:');
  console.log(`  Floor area: ${geo.floorAreaM2} m²`);
  console.log(`  Heat gain: ${baseline.totalGainW.toFixed(0)} W`);
  console.log(`  Gain per m²: ${baseline.gainPerFloorM2.toFixed(1)} W/m²\n`);

  // ============================================================
  // Test 1: Baseline Energy Calculation
  // ============================================================
  console.log('TEST 1: Baseline Annual Cooling Energy\n');

  const baselineCoolingKwhPerM2Yr = climate.energy.baselineCoolingKwhPerM2Yr; // 45 kWh/m²
  const baselineKwh = baselineCoolingKwhPerM2Yr * geo.floorAreaM2;

  console.log(`  Assumed annual cooling demand (no interventions):`);
  console.log(`  ${baselineCoolingKwhPerM2Yr} kWh/m² × ${geo.floorAreaM2} m² = ${baselineKwh.toFixed(0)} kWh/year`);
  console.log(`  Cost: ${baselineKwh.toFixed(0)} × ₹${climate.energy.tariffInrPerKwh} = ₹${(baselineKwh * climate.energy.tariffInrPerKwh).toFixed(0)}/year`);
  console.log(`  CO₂: ${baselineKwh.toFixed(0)} × ${climate.energy.gridCo2KgPerKwh} kg = ${(baselineKwh * climate.energy.gridCo2KgPerKwh).toFixed(0)} kg CO₂/year\n`);

  if (baselineKwh > 0) {
    results.passed.push(`Baseline energy is positive: ${baselineKwh.toFixed(0)} kWh/year`);
  } else {
    results.failed.push({
      test: 'Baseline energy should be positive',
      value: baselineKwh,
    });
  }

  // ============================================================
  // Test 2: Intervention Cost Calculation
  // ============================================================
  console.log('TEST 2: Intervention Cost Calculation\n');

  const testInterventions = ['jali', 'lime-cool-roof', 'green-roof'];

  for (const intId of testInterventions) {
    const item = INTERVENTIONS.find(i => i.id === intId);
    if (!item) continue;

    const costInr = interventionCostInr(item, building, geo);
    const basis = item.costBasis;

    let quantity = 0;
    let unit = '';

    if (basis === 'glazing_m2') {
      quantity = geo.glazingM2;
      unit = 'm² glazing';
    } else if (basis === 'wall_m2') {
      quantity = geo.wallM2;
      unit = 'm² wall';
    } else if (basis === 'roof_m2') {
      quantity = geo.roofM2;
      unit = 'm² roof';
    } else if (basis === 'facade_m2') {
      quantity = geo.grossFacadeM2;
      unit = 'm² facade';
    } else if (basis === 'floor') {
      quantity = building.floors;
      unit = 'floors';
    } else if (basis === 'courtyard_m2') {
      quantity = geo.courtyardM2;
      unit = 'm² courtyard';
    }

    console.log(`  ${item.name}:`);
    console.log(`    Basis: ${item.costBasis} (${quantity.toFixed(1)} ${unit})`);
    console.log(`    Unit cost: ₹${item.unitCostInr.toLocaleString('en-IN')}`);
    console.log(`    Total: ₹${item.unitCostInr.toLocaleString('en-IN')} × ${quantity.toFixed(1)} = ₹${costInr.toLocaleString('en-IN')}`);
    console.log();

    if (costInr > 0) {
      results.passed.push(`${item.name} cost calculated: ₹${costInr.toLocaleString('en-IN')}`);
    } else {
      results.failed.push({
        test: `${item.name} cost should be positive`,
        value: costInr,
      });
    }
  }

  // ============================================================
  // Test 3: Energy Savings from Gain Reduction
  // ============================================================
  console.log('TEST 3: Energy Savings Calculation\n');

  const testInterventionForEnergy = 'jali';
  const withIntervention = analyse(building, [testInterventionForEnergy]);
  const impact = annualImpact(building, [testInterventionForEnergy], baseline);

  const gainRatio = withIntervention.gainPerFloorM2 / baseline.gainPerFloorM2;
  const coolingKwh = baselineKwh * gainRatio;
  const savedKwh = baselineKwh - coolingKwh;
  const savedInr = savedKwh * climate.energy.tariffInrPerKwh;
  const savedCo2 = savedKwh * climate.energy.gridCo2KgPerKwh;

  console.log(`  With Jali intervention:`);
  console.log(`  Gain reduction: ${baseline.gainPerFloorM2.toFixed(1)} → ${withIntervention.gainPerFloorM2.toFixed(1)} W/m²`);
  console.log(`  Gain ratio: ${(gainRatio * 100).toFixed(1)}% of baseline\n`);

  console.log(`  Annual cooling demand (scaled by gain):`);
  console.log(`  ${baselineKwh.toFixed(0)} × ${gainRatio.toFixed(3)} = ${coolingKwh.toFixed(0)} kWh/year`);
  console.log(`  Savings: ${baselineKwh.toFixed(0)} - ${coolingKwh.toFixed(0)} = ${savedKwh.toFixed(0)} kWh/year\n`);

  console.log(`  Cost savings: ${savedKwh.toFixed(0)} × ₹${climate.energy.tariffInrPerKwh} = ₹${savedInr.toFixed(0)}/year`);
  console.log(`  CO₂ avoided: ${savedKwh.toFixed(0)} × ${climate.energy.gridCo2KgPerKwh} = ${savedCo2.toFixed(0)} kg/year\n`);

  // Verify against impact calculation
  const impactMatch =
    Math.abs(impact.coolingKwh - coolingKwh) < 1 &&
    Math.abs(impact.savedKwh - savedKwh) < 1 &&
    Math.abs(impact.savedInr - savedInr) < 10 &&
    Math.abs(impact.savedCo2Kg - savedCo2) < 1;

  if (impactMatch) {
    results.passed.push(`Energy savings calculated consistently`);
  } else {
    results.failed.push({
      test: 'Energy savings mismatch',
      calculated: { coolingKwh, savedKwh, savedInr, savedCo2 },
      fromAPI: { coolingKwh: impact.coolingKwh, savedKwh: impact.savedKwh, savedInr: impact.savedInr, savedCo2: impact.savedCo2Kg },
    });
  }

  // ============================================================
  // Test 4: Payback Period Calculation
  // ============================================================
  console.log('TEST 4: Payback Period Calculation\n');

  const interventionCost = interventionCostInr(
    INTERVENTIONS.find(i => i.id === testInterventionForEnergy),
    building,
    geo
  );
  const paybackYears = interventionCost / savedInr;

  console.log(`  Jali cost: ₹${interventionCost.toLocaleString('en-IN')}`);
  console.log(`  Annual savings: ₹${savedInr.toFixed(0)}`);
  console.log(`  Payback: ₹${interventionCost.toLocaleString('en-IN')} / ₹${savedInr.toFixed(0)} = ${paybackYears.toFixed(1)} years\n`);

  if (paybackYears > 0 && paybackYears < 50) {
    results.passed.push(`Payback period is reasonable: ${paybackYears.toFixed(1)} years`);
  } else {
    results.failed.push({
      test: 'Payback period seems unreasonable',
      years: paybackYears,
    });
  }

  // ============================================================
  // Test 5: Multiple Interventions Stacking
  // ============================================================
  console.log('TEST 5: Multiple Interventions Stacking\n');

  const combined = analyse(building, ['jali', 'lime-cool-roof']);
  const combinedImpact = annualImpact(building, ['jali', 'lime-cool-roof'], baseline);
  const combinedCost = totalCostInr(building, ['jali', 'lime-cool-roof']);
  const jaliCost = interventionCostInr(INTERVENTIONS.find(i => i.id === 'jali'), building, geo);
  const roofCost = interventionCostInr(INTERVENTIONS.find(i => i.id === 'lime-cool-roof'), building, geo);

  console.log(`  Individual costs:`);
  console.log(`    Jali: ₹${jaliCost.toLocaleString('en-IN')}`);
  console.log(`    Cool roof: ₹${roofCost.toLocaleString('en-IN')}`);
  console.log(`    Sum: ₹${(jaliCost + roofCost).toLocaleString('en-IN')}`);
  console.log(`  Combined cost: ₹${combinedCost.toLocaleString('en-IN')}\n`);

  const costsMatch = Math.abs((jaliCost + roofCost) - combinedCost) < 1;
  if (costsMatch) {
    results.passed.push(`Costs stack correctly (additive)`);
  } else {
    results.failed.push({
      test: 'Combined cost should equal sum of individual costs',
      sum: jaliCost + roofCost,
      combined: combinedCost,
    });
  }

  const combinedGainPercent = (baseline.totalGainW - combined.totalGainW) / baseline.totalGainW;
  const jaliGainPercent = (baseline.totalGainW - withIntervention.totalGainW) / baseline.totalGainW;
  const roofAnalysis = analyse(building, ['lime-cool-roof']);
  const roofGainPercent = (baseline.totalGainW - roofAnalysis.totalGainW) / baseline.totalGainW;

  console.log(`  Heat gain reduction:`);
  console.log(`    Jali alone: ${(jaliGainPercent * 100).toFixed(1)}%`);
  console.log(`    Cool roof alone: ${(roofGainPercent * 100).toFixed(1)}%`);
  console.log(`    Combined: ${(combinedGainPercent * 100).toFixed(1)}%`);
  console.log(`    Expected (if additive): ~${((jaliGainPercent + roofGainPercent) * 100).toFixed(1)}%\n`);

  // Combined should be better than either alone but less than sum (multiplicative)
  const minReduction = Math.max(jaliGainPercent, roofGainPercent);
  const sumReduction = jaliGainPercent + roofGainPercent;
  if (combinedGainPercent > minReduction && combinedGainPercent <= sumReduction) {
    results.passed.push(`Interventions stack properly (multiplicative, not additive)`);
  } else {
    results.failed.push({
      test: 'Stacking should be multiplicative',
      individual: { jali: jaliGainPercent, roof: roofGainPercent },
      combined: combinedGainPercent,
    });
  }

  // ============================================================
  // Test 6: Optimizer Ranking (Simple Budget Test)
  // ============================================================
  console.log('TEST 6: Optimizer Ranking Logic\n');

  const testBuilding = { ...building, budgetInr: 200000 };
  const optimization = optimise(testBuilding);

  console.log(`  Budget: ₹${testBuilding.budgetInr.toLocaleString('en-IN')}`);
  console.log(`  Best pick (highest cooling for budget):`);

  if (optimization.best) {
    const best = optimization.best;
    console.log(`    Interventions: ${best.ids.join(', ')}`);
    console.log(`    Cost: ₹${best.costInr.toLocaleString('en-IN')}`);
    console.log(`    Cooling: ${((42.1 - best.indoorPeakC)).toFixed(2)}°C reduction`);
    console.log(`    Savings: ₹${best.savedInr.toFixed(0)}/year`);
    console.log(`    Payback: ${best.paybackYears.toFixed(1)} years\n`);

    if (best.costInr <= testBuilding.budgetInr) {
      results.passed.push(`Best pick respects budget`);
    } else {
      results.failed.push({
        test: 'Best pick should respect budget',
        cost: best.costInr,
        budget: testBuilding.budgetInr,
      });
    }
  } else {
    results.failed.push({
      test: 'Optimizer should find a best pick within budget',
      best: optimization.best,
    });
  }

  console.log(`  Pareto set (${optimization.paretoSet.length} options):`);
  for (let i = 0; i < Math.min(3, optimization.paretoSet.length); i++) {
    const opt = optimization.paretoSet[i];
    console.log(`    ${i + 1}. Cost ₹${opt.costInr.toLocaleString('en-IN')}, Cooling ${((42.1 - opt.indoorPeakC)).toFixed(2)}°C`);
  }
  console.log();

  // ============================================================
  // Test 7: CO₂ Emissions Reduction
  // ============================================================
  console.log('TEST 7: CO₂ Emissions Reduction\n');

  const baselineCo2 = baselineKwh * climate.energy.gridCo2KgPerKwh;
  const withJaliCo2 = coolingKwh * climate.energy.gridCo2KgPerKwh;
  const co2Avoided = baselineCo2 - withJaliCo2;

  console.log(`  Baseline: ${baselineKwh.toFixed(0)} kWh × ${climate.energy.gridCo2KgPerKwh} = ${baselineCo2.toFixed(0)} kg CO₂/year`);
  console.log(`  With Jali: ${coolingKwh.toFixed(0)} kWh × ${climate.energy.gridCo2KgPerKwh} = ${withJaliCo2.toFixed(0)} kg CO₂/year`);
  console.log(`  Avoided: ${co2Avoided.toFixed(0)} kg CO₂/year (${(co2Avoided / baselineCo2 * 100).toFixed(1)}%)\n`);

  if (co2Avoided > 0) {
    results.passed.push(`CO₂ reduction calculated: ${co2Avoided.toFixed(0)} kg/year`);
  } else {
    results.failed.push({
      test: 'CO₂ reduction should be positive',
      avoided: co2Avoided,
    });
  }

  // ============================================================
  // Test 8: Sensitivity Check (Budget vs Interventions)
  // ============================================================
  console.log('TEST 8: Budget Sensitivity\n');

  const budgets = [50000, 100000, 200000, 300000];
  console.log('  Optimal picks at different budgets:\n');

  for (const budget of budgets) {
    const budgetBuilding = { ...building, budgetInr: budget };
    const opt = optimise(budgetBuilding);

    if (opt.best) {
      console.log(`    ₹${budget.toLocaleString('en-IN')}: ${opt.best.ids.join(', ')} → ${((42.1 - opt.best.indoorPeakC)).toFixed(2)}°C cooling`);
    } else {
      console.log(`    ₹${budget.toLocaleString('en-IN')}: No solution within budget`);
    }
  }
  console.log();

  // Higher budget should give more/better interventions
  const opt50k = optimise({ ...building, budgetInr: 50000 });
  const opt300k = optimise({ ...building, budgetInr: 300000 });

  if (
    opt300k.best &&
    opt50k.best &&
    opt300k.best.indoorPeakC <= opt50k.best.indoorPeakC
  ) {
    results.passed.push(`Higher budget enables better cooling`);
  } else if (opt50k.best && !opt300k.best) {
    results.failed.push({
      test: 'Higher budget should enable at least as good solutions',
    });
  }

  // ============================================================
  // Summary
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
globalThis.validateEconomics = validateEconomics;
