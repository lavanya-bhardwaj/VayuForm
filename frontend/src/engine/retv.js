/**
 * RETV Calculator: Residential Envelope Thermal Value
 * Based on ECO-Niwas Samhita 2018 (Part 2: Residential Buildings)
 *
 * RETV = Total Envelope Conduction Heat / Total Exposed Surface Area
 * Unit: W/m²K
 * Target: RETV ≤ 15 W/m²K for compliance (ECO-Niwas 2018)
 *
 * Formula:
 * RETV = Σ(U_i × A_i) / Σ(A_i)
 * where U_i = U-value of surface i, A_i = area of surface i
 */

import { materials } from './data';

class RETVCalculator {
  constructor(buildingParams, materialIDs = {}) {
    this.building = buildingParams;
    this.materialIDs = {
      walls: materialIDs.walls || 'brick_230mm_solid',
      roof: materialIDs.roof || 'rcc_100mm_concrete',
      glazing: materialIDs.glazing || 'clear_single_pane_6mm',
      ...materialIDs,
    };
  }

  getMaterial(category, id) {
    const mat = materials.materials[category]?.find(m => m.id === id);
    if (!mat) {
      console.warn(`Material ${id} not found in ${category}`);
      return materials.materials[category][0];
    }
    return mat;
  }

  /**
   * Calculate building envelope areas
   */
  calculateEnvelopeAreas() {
    const { floors, width_m, depth_m, wwr } = this.building;
    const floorHeight = 3.5; // typical floor height

    // Wall areas
    const northSouthWalls = floorHeight * width_m * floors;
    const eastWestWalls = floorHeight * depth_m * floors;

    const glazingArea =
      (northSouthWalls + eastWestWalls) * wwr;
    const opaqueWallArea =
      (northSouthWalls + eastWestWalls) * (1 - wwr);

    const roofArea = width_m * depth_m;

    return {
      glazing: glazingArea,
      opaqueWalls: opaqueWallArea,
      roof: roofArea,
      totalEnvelopeArea: glazingArea + opaqueWallArea + roofArea,
    };
  }

  /**
   * Calculate RETV: weighted average U-value of the envelope
   * RETV = Σ(U × A) / Σ(A)
   */
  calculateRETVBaseline(appliedInterventions = []) {
    const areas = this.calculateEnvelopeAreas();

    // Get material U-values
    const wallMat = this.getMaterial('walls', this.materialIDs.walls);
    const roofMat = this.getMaterial('roofs', this.materialIDs.roof);
    const glazingMat = this.getMaterial('glazing', this.materialIDs.glazing);

    let U_walls = wallMat.U_value_W_m2K;
    let U_roof = roofMat.U_value_W_m2K;
    let U_glazing = glazingMat.U_value_W_m2K;

    // Apply intervention effects that modify U-values
    appliedInterventions.forEach(intId => {
      // This would read from interventions.json
      // For now, simplified effects
      if (intId === 'green_roof') {
        U_roof = 0.4;
      } else if (intId === 'rat_trap_cavity_wall') {
        U_walls = 1.2;
      } else if (intId === 'reflective_coated_double_pane') {
        U_glazing = 1.4;
      }
    });

    // RETV = (U_walls × A_walls + U_roof × A_roof + U_glazing × A_glazing) / A_total
    const weightedSum =
      U_walls * areas.opaqueWalls +
      U_roof * areas.roof +
      U_glazing * areas.glazing;

    const retv = weightedSum / areas.totalEnvelopeArea;

    return {
      retv: Math.round(retv * 10) / 10,
      compliance: retv <= 15 ? 'PASS' : 'FAIL',
      target: 15,
      margin_W_m2K: Math.round((15 - retv) * 10) / 10,
    };
  }

  /**
   * Detailed breakdown by surface type
   */
  calculateRETVDetailed(appliedInterventions = []) {
    const baseline = this.calculateRETVBaseline(appliedInterventions);
    const areas = this.calculateEnvelopeAreas();

    const wallMat = this.getMaterial('walls', this.materialIDs.walls);
    const roofMat = this.getMaterial('roofs', this.materialIDs.roof);
    const glazingMat = this.getMaterial('glazing', this.materialIDs.glazing);

    return {
      retv: baseline.retv,
      compliance: baseline.compliance,
      target: 15,
      breakdown: {
        opaqueWalls: {
          area_m2: Math.round(areas.opaqueWalls),
          U_value: wallMat.U_value_W_m2K,
          contribution: Math.round((wallMat.U_value_W_m2K * areas.opaqueWalls) * 10) / 10,
        },
        roof: {
          area_m2: Math.round(areas.roof),
          U_value: roofMat.U_value_W_m2K,
          contribution: Math.round((roofMat.U_value_W_m2K * areas.roof) * 10) / 10,
        },
        glazing: {
          area_m2: Math.round(areas.glazing),
          U_value: glazingMat.U_value_W_m2K,
          contribution: Math.round((glazingMat.U_value_W_m2K * areas.glazing) * 10) / 10,
        },
      },
      interventions: appliedInterventions,
    };
  }

  /**
   * What U-value would achieve RETV = 15?
   */
  calculateTargetUValues() {
    const areas = this.calculateEnvelopeAreas();
    const targetRETVsum = 15 * areas.totalEnvelopeArea;

    // If we upgrade the roof to green (U = 0.4), what can walls be?
    const greenRoofContribution = 0.4 * areas.roof;
    const glazingContribution = 1.4 * areas.glazing; // low-E glazing
    const remainingBudget = targetRETVsum - greenRoofContribution - glazingContribution;
    const maxWallU = remainingBudget / areas.opaqueWalls;

    return {
      currentWallU: this.getMaterial('walls', this.materialIDs.walls).U_value_W_m2K,
      targetWallU: Math.round(maxWallU * 10) / 10,
      hint: `To meet RETV ≤15, upgrade walls to U ≤ ${Math.round(maxWallU * 10) / 10} (consider rat-trap cavity wall or thick masonry)`,
    };
  }
}

export default RETVCalculator;
