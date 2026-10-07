import { createContext, useContext } from "react";
import { BASE_BUILDING_PALETTE } from "../utils/thermal";

export const BuildingPaletteContext = createContext(BASE_BUILDING_PALETTE);

export function useBuildingPalette() {
  return useContext(BuildingPaletteContext);
}
