import interventionsData from "../data/interventions.json";
import materialsData from "../data/materials.json";
import climateData from "./delhi.json";

console.log("data.js - climateData loaded:", !!climateData, climateData?.peakDay_May15 ? "has peakDay_May15" : "NO peakDay_May15");

export const interventions = interventionsData;
export const materials = materialsData;
export const climate = climateData;
