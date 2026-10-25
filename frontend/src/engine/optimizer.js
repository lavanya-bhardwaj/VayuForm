/**
 * Intervention Optimizer
 * Brute-force search through intervention combinations to find Pareto-optimal solutions under budget
 */

import { interventions } from './data';
import HeatModel from './heatModel.js';

class Optimizer {
  constructor(buildingParams, budgetRupees) {
    this.building = buildingParams;
    this.budget = budgetRupees;
    this.interventions = interventions.interventions;
    this.feasibleSet = [];
  }

  /**
   * Calculate total cost and count of an intervention combination
   */
  calculateComboCost(comboIds) {
    let totalCost = 0;
    
    comboIds.forEach(intId => {
      const intervention = this.interventions.find(i => i.id === intId);
      if (intervention) {
        // Assume 200 m² building area for cost calculation
        const area = this.building.width_m * this.building.depth_m;
        
        if (intervention.cost.unit === 'm²') {
          totalCost += intervention.cost.perUnit * area;
        } else if (intervention.cost.unit === 'm_linear') {
          // Rough: perimeter of building
          const perimeter = (this.building.width_m + this.building.depth_m) * 2;
          totalCost += intervention.cost.perUnit * perimeter;
        } else if (intervention.cost.unit === 'unit') {
          totalCost += intervention.cost.perUnit;
        }
      }
    });

    return totalCost;
  }

  /**
   * Check if intervention is applicable to building type
   */
  isApplicable(interventionId) {
    const intervention = this.interventions.find(i => i.id === interventionId);
    if (!intervention) return false;

    const buildingType = this.building.courtyard ? 'new' : 'retrofit';
    return intervention.applicableTo.includes(buildingType) || intervention.applicableTo.includes('retrofit_as_lightwell');
  }

  /**
   * Brute-force search: generate all combos, filter by budget, rank by impact
   */
  optimize() {
    const applicableIds = this.interventions
      .filter(i => this.isApplicable(i.id))
      .map(i => i.id);

    if (applicableIds.length === 0) {
      return { topPick: null, paretoSet: [] };
    }

    // Generate all subsets (power set)
    const allCombos = this.generateSubsets(applicableIds);

    // Evaluate each combo
    const results = [];

    allCombos.forEach(comboIds => {
      const cost = this.calculateComboCost(comboIds);

      if (cost <= this.budget) {
        // Run heat model for this combo
        const heatModel = new HeatModel(this.building);
        const analysis = heatModel.analyze(comboIds);

        // Add cost info
        const result = {
          interventions: comboIds,
          cost_rupees: cost,
          payback_years: cost > 0 ? Math.round((cost / (analysis.annualCost_rupees || 1)) * 10) / 10 : 0,
          ...analysis,
        };

        results.push(result);
      }
    });

    // Rank by Pareto front: maximize cooling (°C reduction) while minimizing cost
    const paretoSet = this.findParetoFront(results);

    // Top pick: highest temperature reduction
    const topPick = results.reduce((best, current) => {
      const currentCooling = (42.1 - current.indoorPeakTemp_C); // baseline 42.1°C peak
      const bestCooling = (42.1 - (best?.indoorPeakTemp_C || 42.1));
      return currentCooling > bestCooling ? current : best;
    }, null);

    return {
      topPick,
      paretoSet,
      allResults: results,
    };
  }

  /**
   * Generate all subsets of an array (power set)
   */
  generateSubsets(arr) {
    const result = [];
    const n = arr.length;

    for (let i = 0; i < Math.pow(2, n); i++) {
      const subset = [];
      for (let j = 0; j < n; j++) {
        if (i & (1 << j)) {
          subset.push(arr[j]);
        }
      }
      result.push(subset);
    }

    return result;
  }

  /**
   * Find Pareto-optimal solutions
   * A solution is Pareto if no other solution has both lower cost AND better cooling
   */
  findParetoFront(results) {
    return results.filter(current => {
      const currentCooling = 42.1 - current.indoorPeakTemp_C;
      
      return !results.some(other => {
        const otherCooling = 42.1 - other.indoorPeakTemp_C;
        // Other is better if: cheaper AND equal/better cooling
        return other.cost_rupees < current.cost_rupees && otherCooling >= currentCooling;
      });
    });
  }
}

export default Optimizer;
