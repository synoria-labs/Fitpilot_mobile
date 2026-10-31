import type { ClientDietNutrients } from '../types';

export type DietMacros = ClientDietNutrients & { proteinG: number; carbsG: number; fatG: number };

/** True when the menu, meal or food brings all three macros, as the backend's v2 menus do. */
export const hasCompleteMacros = (nutrients: ClientDietNutrients | null | undefined): nutrients is DietMacros =>
  Boolean(nutrients && nutrients.proteinG !== null && nutrients.carbsG !== null && nutrients.fatG !== null);
