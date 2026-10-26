/**
 * Intervention Validation
 *
 * Tests each cooling intervention individually:
 * - Verifies it reduces heat gain
 * - Checks temperature reduction is proportional
 * - Validates cost per m² is reasonable
 * - Calculates payback period
 *
 * Run in browser console: validateInterventions()
 */

import { analyse, buildGeometry, DEFAULT_BUILDING } from './heatModel.js';
import { INTERVENTIONS, interventionsFor } from './interventions.js';
import { totalCostInr } from './optimizer.js';
import climate from '../data/climate/delhi.json';

export function validateInterventions() {
  console.log('\n=== INTERVENTION VALIDATION ===\n');

  const results = {
    passed: [],
    failed: [],
    interventions: [],
  };

  const building = DEFAULT_BUILDING;
  const geo = buildGeometry(building, []);
  const baseline = analyse(building, []);
  const baselineTemp = baseline.indoorPeakC;
  const baselineGain = baseline.totalGainW;

  console.log('BASELINE (No interventions):');
  console.log(`  Heat gain: ${baselineGain.toFixed(0)} W`);
  console.log(`  Indoor peak temp: ${baselineTemp.toFixed(1)}°C`);
  console.log(`  Thermal score: ${baseline.thermalScore}/100\n`);

  const candidates = interventionsFor(building.scenario);

  console.log(`Testing ${candidates.length} interventions for "${building.scenario}" scenario:\n`);

  // ============================================================
  // Test Each Intervention
  // ============================================================

  for (const intervention of candidates) {
    const id = intervention.id;
    const name = intervention.name;
    const category = intervention.category;
    const effect = intervention.effect;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${name.toUpperCase()} (${id})`);
    console.log(`Category: ${category}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Analyze with intervention
    const withIntervention = analyse(building, [id]);
    const costInr = totalCostInr(building, [id]);
    const costPerM2 = costInr / geo.floorAreaM2;

    const gainReduction = baselineGain - withIntervention.totalGainW;
    const gainPercent = (gainReduction / baselineGain) * 100;
    const tempDrop = baselineTemp - withIntervention.indoorPeakC;

    console.log(`EFFECT:`);
    if (effect.wallU !== undefined) console.log(`  Wall U-value: baseline → ${effect.wallU} W/m²K`);
    if (effect.wallAlpha !== undefined) console.log(`  Wall absorptance: baseline → ${effect.wallAlpha}`);
    if (effect.roofU !== undefined) console.log(`  Roof U-value: baseline → ${effect.roofU} W/m²K`);
    if (effect.roofAlpha !== undefined) console.log(`  Roof absorptance: baseline → ${effect.roofAlpha}`);
    if (effect.glazingShadingMult !== undefined) console.log(`  Glazing shading: × ${effect.glazingShadingMult} (blocks ${((1 - effect.glazingShadingMult) * 100).toFixed(0)}%)`);
    if (effect.wallExposureMult !== undefined) console.log(`  Wall exposure: × ${effect.wallExposureMult}`);
    if (effect.achAdd !== undefined) console.log(`  Air changes: +${effect.achAdd} ACH`);
    console.log();

    console.log(`RESULTS:`);
    console.log(`  Heat gain: ${baselineGain.toFixed(0)} W → ${withIntervention.totalGainW.toFixed(0)} W`);
    console.log(`  Reduction: ${gainReduction.toFixed(0)} W (${gainPercent.toFixed(1)}%)`);
    console.log(`  Indoor peak: ${baselineTemp.toFixed(1)}°C → ${withIntervention.indoorPeakC.toFixed(1)}°C`);
    console.log(`  Temp drop: ${tempDrop.toFixed(2)}°C`);
    console.log(`  Thermal score: ${baseline.thermalScore} → ${withIntervention.thermalScore}\n`);

    console.log(`COST & PAYBACK:`);
    console.log(`  Total cost: ₹${costInr.toLocaleString('en-IN')}`);
    console.log(`  Cost per m²: ₹${costPerM2.toFixed(0)}/m²`);

    // Annual savings calculation
    const baselineKwh = climate.energy.baselineCoolingKwhPerM2Yr * geo.floorAreaM2;
    const currentKwh = baselineKwh * (withIntervention.gainPerFloorM2 / baseline.gainPerFloorM2);
    const savedKwh = baselineKwh - currentKwh;
    const savedInr = savedKwh * climate.energy.tariffInrPerKwh;
    const paybackYears = savedInr > 0 ? costInr / savedInr : Infinity;

    console.log(`  Annual savings: ${savedKwh.toFixed(0)} kWh`);
    console.log(`  Annual savings: ₹${savedInr.toFixed(0)}`);
    console.log(`  Payback period: ${paybackYears === Infinity ? '∞' : paybackYears.toFixed(1)} years\n`);

    // ============================================================
    // Validation Checks
    // ============================================================

    const checks = {
      test: name,
      id: id,
      gainReduction: gainReduction,
      gainPercent: gainPercent,
      tempDrop: tempDrop,
      cost: costInr,
      payback: paybackYears,
      passed: [],
      failed: [],
    };

    // Check 1: Reduces gain
    if (gainReduction > 0) {
      checks.passed.push(`Reduces heat gain: ${gainPercent.toFixed(1)}%`);
    } else {
      checks.failed.push('Should reduce heat gain');
    }

    // Check 2: Reduces temperature
    if (tempDrop > 0) {
      checks.passed.push(`Reduces peak temp: ${tempDrop.toFixed(2)}°C`);
    } else {
      checks.failed.push('Should reduce indoor peak temperature');
    }

    // Check 3: Reasonable cost
    if (costPerM2 > 0 && costPerM2 < 100000) {
      checks.passed.push(`Cost reasonable: ₹${costPerM2.toFixed(0)}/m²`);
    } else {
      checks.failed.push(`Cost seems unreasonable: ₹${costPerM2}/m²`);
    }

    // Check 4: Reasonable payback (< 30 years for retrofit)
    if (paybackYears > 0 && paybackYears < 30) {
      checks.passed.push(`Payback < 30 years: ${paybackYears.toFixed(1)} years`);
    } else if (paybackYears === Infinity) {
      checks.failed.push('No annual savings calculated (infinite payback)');
    } else {
      checks.failed.push(`Payback too long: ${paybackYears.toFixed(1)} years`);
    }

    // Check 5: Proportional effect
    // Temperature reduction should scale somewhat with gain reduction
    // Very rough: if gain drops 20%, temp should drop ~1-2°C
    if (gainPercent > 5 && tempDrop > 0) {
      const gainTempRatio = gainPercent / tempDrop;
      if (gainTempRatio > 5 && gainTempRatio < 50) {
        checks.passed.push(`Effect is proportional (gain:temp ratio ${gainTempRatio.toFixed(1)})`);
      } else {
        checks.failed.push(`Effect not proportional (gain:temp ratio ${gainTempRatio.toFixed(1)})`);
      }
    }

    // Check 6: Cost-effectiveness (Cooling per rupee)
    if (costInr > 0 && gainReduction > 0) {
      const coolingPerRupee = gainReduction / costInr;
      console.log(`  Efficiency: ${(coolingPerRupee * 1000).toFixed(2)} W reduction per ₹1000\n`);

      if (coolingPerRupee > 0.001 && coolingPerRupee < 1) {
        checks.passed.push(`Cost-effective: ${(coolingPerRupee * 1000).toFixed(1)} W/₹1000`);
      }
    }

    results.interventions.push(checks);
  }

  // ============================================================
  // Comparative Analysis
  // ============================================================

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('COMPARATIVE RANKING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Sort by gain reduction (most impactful first)
  const byImpact = [...results.interventions].sort((a, b) => b.gainPercent - a.gainPercent);

  console.log('By cooling impact (heat gain reduction):');
  for (let i = 0; i < Math.min(5, byImpact.length); i++) {
    const int = byImpact[i];
    console.log(`  ${i + 1}. ${int.test}: ${int.gainPercent.toFixed(1)}% gain reduction`);
  }
  console.log();

  // Sort by payback (shortest first)
  const byPayback = [...results.interventions].filter(i => i.payback < 30).sort((a, b) => a.payback - b.payback);

  console.log('By payback period (shortest first, < 30 years):');
  for (let i = 0; i < Math.min(5, byPayback.length); i++) {
    const int = byPayback[i];
    console.log(`  ${i + 1}. ${int.test}: ${int.payback.toFixed(1)} years`);
  }
  console.log();

  // Sort by cost-effectiveness
  const byCostEff = [...results.interventions]
    .filter(i => i.cost > 0 && i.gainReduction > 0)
    .sort((a, b) => (b.gainReduction / b.cost) - (a.gainReduction / a.cost));

  console.log('By cost-effectiveness (W reduction per rupee, highest first):');
  for (let i = 0; i < Math.min(5, byCostEff.length); i++) {
    const int = byCostEff[i];
    const wPerRupee = (int.gainReduction / int.cost) * 1000;
    console.log(`  ${i + 1}. ${int.test}: ${wPerRupee.toFixed(1)} W/₹1000`);
  }
  console.log();

  // ============================================================
  // Summary
  // ============================================================

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const int of results.interventions) {
    totalPassed += int.passed.length;
    totalFailed += int.failed.length;
  }

  console.log('PASSED:');
  for (const int of results.interventions) {
    if (int.passed.length > 0) {
      console.log(`  ${int.test}:`);
      for (const msg of int.passed) {
        console.log(`    ✓ ${msg}`);
      }
    }
  }

  if (totalFailed > 0) {
    console.log('\nFAILED:');
    for (const int of results.interventions) {
      if (int.failed.length > 0) {
        console.log(`  ${int.test}:`);
        for (const msg of int.failed) {
          console.log(`    ✗ ${msg}`);
        }
      }
    }
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed\n`);

  return totalFailed === 0;
}

// Export for browser console
globalThis.validateInterventions = validateInterventions;
