/**
 * Heat Model: steady-state + peak-hour simulation for Delhi buildings
 * Calculates envelope conduction, solar gain, ventilation, and indoor peak temperature
 * Based on ECBC 2017, ECO-Niwas Samhita 2018, NBC 2016 Part 11
 */

import { interventions, materials, climate as climateData } from './data';

// Constants
const GRAVITY = 9.81;
const AIR_DENSITY = 1.2;
const AIR_SPECIFIC_HEAT = 1005;
const DISCHARGE_COEFF = 0.6;

class HeatModel {
  constructor(buildingParams, materialIDs = {}) {
    this.building = buildingParams;
    this.materialIDs = {
      walls: materialIDs.walls || 'brick_230mm_solid',
      roof: materialIDs.roof || 'rcc_100mm_concrete',
      glazing: materialIDs.glazing || 'clear_single_pane_6mm',
      ...materialIDs,
    };
    this.validateInputs();
  }

  validateInputs() {
    const { floors, width_m, depth_m, wwr } = this.building;
    if (floors < 1 || width_m < 5 || depth_m < 5 || wwr < 0.2 || wwr > 0.6) {
      throw new Error('Invalid building parameters');
    }
  }

  getMaterial(category, id) {
    const mat = materials.materials[category]?.find(m => m.id === id);
    if (!mat) {
      console.warn(`Material ${id} not found in ${category}`);
      return materials.materials[category][0];
    }
    return mat;
  }

  getInterventionEffect(interventionId) {
    const intervention = interventions.interventions.find(i => i.id === interventionId);
    if (!intervention) return null;
    return intervention.effect;
  }

  calculateExposedArea() {
    const { floors, width_m, depth_m, wwr } = this.building;
    const floorHeight = 3.5;
    const wallArea = (width_m + depth_m) * 2 * floors * floorHeight;
    const roofArea = width_m * depth_m;

    const northSouthArea = floorHeight * width_m * floors;
    const eastWestArea = floorHeight * depth_m * floors;

    return {
      glazing: {
        north: (northSouthArea * wwr) / 2,
        south: (northSouthArea * wwr) / 2,
        east: (eastWestArea * wwr) / 2,
        west: (eastWestArea * wwr) / 2,
      },
      opaque: {
        north: (northSouthArea * (1 - wwr)) / 2,
        south: (northSouthArea * (1 - wwr)) / 2,
        east: (eastWestArea * (1 - wwr)) / 2,
        west: (eastWestArea * (1 - wwr)) / 2,
      },
      roof: roofArea,
      totalWallArea: wallArea,
    };
  }

  calculateConduction(U_value, area_m2, indoorTemp, outdoorTemp) {
    const deltaT = Math.max(outdoorTemp - indoorTemp, 0);
    return U_value * area_m2 * deltaT;
  }

  calculateGlazingSolarGain(area_m2, SHGC, solarIrradiance_Wm2, shadingFactor = 1) {
    return area_m2 * SHGC * solarIrradiance_Wm2 * shadingFactor;
  }

  calculateSolAirGain(area_m2, absorptivity, solarIrradiance_Wm2, U_value, indoorTemp, outdoorTemp) {
    const solarAbsorbed = absorptivity * solarIrradiance_Wm2;
    const surfaceTemp = outdoorTemp + solarAbsorbed / 25;
    const effectiveDeltaT = surfaceTemp - indoorTemp;
    return U_value * area_m2 * effectiveDeltaT;
  }

  calculateStackEffect(courtyardHeight_m, indoorTemp_C, outdoorTemp_C, courtyardArea_m2) {
    if (!courtyardHeight_m || courtyardHeight_m < 1) return 0;

    const deltaT = Math.abs(indoorTemp_C - outdoorTemp_C) + 1;
    const T_absolute = outdoorTemp_C + 273.15;

    const flowRate_m3_s =
      DISCHARGE_COEFF *
      courtyardArea_m2 *
      Math.sqrt((2 * GRAVITY * courtyardHeight_m * deltaT) / T_absolute);

    const buildingVolume = this.building.width_m * this.building.depth_m * this.building.floors * 3.5;
    const ACH = (flowRate_m3_s * 3600) / buildingVolume;

    return Math.min(ACH, 10);
  }

  calculateVentilationCooling(ACH, buildingVolume_m3, indoorTemp_C, outdoorTemp_C) {
    if (ACH <= 0 || indoorTemp_C <= outdoorTemp_C) return 0;

    const massFlowRate = AIR_DENSITY * (ACH / 3600) * buildingVolume_m3;
    const deltaT = indoorTemp_C - outdoorTemp_C;
    return massFlowRate * AIR_SPECIFIC_HEAT * deltaT;
  }

  calculateThermalMassDecrement(wallMaterial) {
    const decrementFactors = {
      brick_230mm_solid: 0.75,
      brick_240mm_cavity: 0.65,
      brick_rat_trap_bond: 0.70,
      stone_200mm: 0.60,
      rcc_200mm: 0.80,
      adobe_300mm: 0.55,
    };
    return decrementFactors[wallMaterial] || 0.75;
  }

  calculateIndoorPeakTemp(appliedInterventions = []) {
    const peakDayHours = climateData.peakDay_May15.hourly;
    const area = this.calculateExposedArea();

    const wallMat = this.getMaterial('walls', this.materialIDs.walls);
    const roofMat = this.getMaterial('roofs', this.materialIDs.roof);
    const glazingMat = this.getMaterial('glazing', this.materialIDs.glazing);

    let U_walls = wallMat.U_value_W_m2K;
    let U_roof = roofMat.U_value_W_m2K;
    let SHGC_glazing = glazingMat.SHGC;
    let roof_albedo = roofMat.albedo || 0.25;
    let ACH_base = 0.5;

    appliedInterventions.forEach(intId => {
      const effect = this.getInterventionEffect(intId);
      if (!effect) return;
      if (effect.U_value_old_to_new) U_roof = effect.U_value_old_to_new[1];
      if (effect.SHGC_reduction) SHGC_glazing *= 1 - effect.SHGC_reduction;
      if (effect.albedo_old_to_new) roof_albedo = effect.albedo_old_to_new[1];
      if (effect.ACH_increase) ACH_base += effect.ACH_increase;
    });

    let ACH_courtyard = 0;
    if (this.building.courtyard) {
      const courtArea = this.building.courtyard.width_m * this.building.courtyard.depth_m;
      ACH_courtyard = this.calculateStackEffect(
        this.building.courtyard.height_m,
        25,
        peakDayHours[7].drybulb_C,
        courtArea
      );
    }

    const totalACH = ACH_base + ACH_courtyard;
    const buildingVolume = this.building.width_m * this.building.depth_m * this.building.floors * 3.5;

    let peakIndoorTemp = 25;
    let maxHourlyLoad = 0;

    for (let i = 7; i < peakDayHours.length; i++) {
      const hour = peakDayHours[i];
      const outdoorTemp = hour.drybulb_C;

      const avgOpaqueArea = (area.opaque.north + area.opaque.south + area.opaque.east + area.opaque.west) / 4;
      const conductionWalls = this.calculateConduction(U_walls, avgOpaqueArea * 4, peakIndoorTemp, outdoorTemp);

      const avgOpaqueAbsorptivity = 0.6;
      const solairOpaqueWalls =
        this.calculateSolAirGain(
          avgOpaqueArea * 4,
          avgOpaqueAbsorptivity,
          (hour.direct_normal_irradiance_Wm2 + hour.diffuse_horizontal_irradiance_Wm2) * 0.6,
          U_walls,
          peakIndoorTemp,
          outdoorTemp
        ) * 0.5;

      const avgGlazingArea = (area.glazing.north + area.glazing.south + area.glazing.east + area.glazing.west) / 4;
      const shadingFactor = 0.7;
      const solarGlazing =
        this.calculateGlazingSolarGain(
          avgGlazingArea * 4,
          SHGC_glazing,
          hour.direct_normal_irradiance_Wm2 + hour.diffuse_horizontal_irradiance_Wm2,
          shadingFactor
        ) * 0.8;

      const roofSolarAbsorbed = area.roof * (1 - roof_albedo) * (hour.direct_normal_irradiance_Wm2 + hour.diffuse_horizontal_irradiance_Wm2 * 2.5);
      const roofConduction = this.calculateConduction(U_roof, area.roof, peakIndoorTemp, outdoorTemp);
      const roofGain = (roofSolarAbsorbed + roofConduction) * 0.6;

      const totalGain = conductionWalls + solairOpaqueWalls + solarGlazing + roofGain;
      const ventilationCooling = this.calculateVentilationCooling(totalACH, buildingVolume, peakIndoorTemp, outdoorTemp);

      const netLoad = (totalGain - ventilationCooling) / 1000;
      maxHourlyLoad = Math.max(maxHourlyLoad, netLoad);

      const tempRise = (netLoad * 3600) / (buildingVolume * AIR_DENSITY * AIR_SPECIFIC_HEAT);
      peakIndoorTemp = Math.max(peakIndoorTemp, outdoorTemp - 5 + tempRise);
    }

    const massDecrement = this.calculateThermalMassDecrement(this.materialIDs.walls);
    peakIndoorTemp *= massDecrement;
    peakIndoorTemp = Math.max(peakIndoorTemp, 38);

    return {
      indoorPeakTemp_C: Math.round(peakIndoorTemp * 10) / 10,
      maxHourlyLoad_kW: Math.round(maxHourlyLoad * 10) / 10,
      ACH_effective: Math.round(totalACH * 10) / 10,
    };
  }

  calculateAnnualCoolingKwh(appliedInterventions = []) {
    const monthlyData = climateData.monthlyAverage.data;
    let totalAnnualKwh = 0;

    monthlyData.forEach(month => {
      const setPoint = 24;
      const avgOutdoor = month.avg_drybulb_C;

      if (avgOutdoor > setPoint) {
        const daysInMonth = 30;
        const coolingDegreeDays = (avgOutdoor - setPoint) * daysInMonth;
        const buildingArea = this.building.width_m * this.building.depth_m * this.building.floors;
        const monthlyKwh = (coolingDegreeDays * buildingArea * 0.005) / (1 + appliedInterventions.length * 0.1);
        totalAnnualKwh += monthlyKwh;
      }
    });

    return Math.round(totalAnnualKwh);
  }

  calculateEnergyImpact(annualKwh) {
    const tariff_rupees_per_kwh = 7.5;
    const CO2_kg_per_kwh = 0.71;

    return {
      annualCoolingKwh: annualKwh,
      annualCost_rupees: Math.round(annualKwh * tariff_rupees_per_kwh),
      annualCO2_kg: Math.round(annualKwh * CO2_kg_per_kwh),
    };
  }

  analyze(appliedInterventions = []) {
    const peakResults = this.calculateIndoorPeakTemp(appliedInterventions);
    const annualKwh = this.calculateAnnualCoolingKwh(appliedInterventions);
    const energyImpact = this.calculateEnergyImpact(annualKwh);

    return {
      ...peakResults,
      ...energyImpact,
      interventions: appliedInterventions,
    };
  }
}

export default HeatModel;
