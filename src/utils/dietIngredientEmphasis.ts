import type { ClientDietIngredientRow } from '../types';
import {
  getExchangeGroupKey,
  normalizeExchangeGroupName,
  type ExchangeGroupKey,
} from './exchangeGroups';

/**
 * How much a food matters for the day's energy:
 * - `main`: calorie-relevant groups, shown in full and measured.
 * - `vegetable`: the minimum the professional prescribes; the client may add more when hungry.
 * - `free`: SMAE «Alimentos libres de energía», eaten to taste unless a condition limits them.
 */
export type IngredientTier = 'main' | 'vegetable' | 'free';

export type GroupedIngredients<T> = {
  main: T[];
  vegetables: T[];
  free: T[];
};

type EmphasisIngredient = Pick<ClientDietIngredientRow, 'exchangeGroupName'> & {
  nutrients?: { kcal: number | null } | null;
};

export const isFreeEnergyGroup = (groupName: string | null | undefined) =>
  normalizeExchangeGroupName(groupName).includes('libre');

export const getIngredientTier = (ingredient: EmphasisIngredient): IngredientTier => {
  if (isFreeEnergyGroup(ingredient.exchangeGroupName)) {
    return 'free';
  }

  return getExchangeGroupKey(ingredient.exchangeGroupName) === 'verduras' ? 'vegetable' : 'main';
};

// Without per-food energy, denser groups lead: protein, starches, legumes, dairy, fats, fruit, sugar.
const MAIN_GROUP_ORDER: readonly ExchangeGroupKey[] = [
  'alimentos_origen_animal',
  'cereales_tuberculos',
  'leguminosas',
  'leche',
  'grasas',
  'frutas',
  'azucares',
  'unknown',
];

const groupRank = (ingredient: EmphasisIngredient) => {
  const index = MAIN_GROUP_ORDER.indexOf(getExchangeGroupKey(ingredient.exchangeGroupName));
  return index === -1 ? MAIN_GROUP_ORDER.length : index;
};

const getKcal = (ingredient: EmphasisIngredient) => ingredient.nutrients?.kcal ?? null;

/**
 * Splits a recipe's (or a meal's) foods by how much they matter for energy. Main foods come
 * first by energy when every one of them has it, else by group; the others keep their order.
 */
export const groupIngredientsByRelevance = <T extends EmphasisIngredient>(
  ingredients: T[],
): GroupedIngredients<T> => {
  const grouped: GroupedIngredients<T> = { main: [], vegetables: [], free: [] };

  ingredients.forEach((ingredient) => {
    const tier = getIngredientTier(ingredient);
    if (tier === 'free') {
      grouped.free.push(ingredient);
    } else if (tier === 'vegetable') {
      grouped.vegetables.push(ingredient);
    } else {
      grouped.main.push(ingredient);
    }
  });

  const everyMainHasKcal = grouped.main.every((ingredient) => getKcal(ingredient) !== null);
  grouped.main = grouped.main
    .map((ingredient, index) => ({ ingredient, index }))
    .sort((left, right) => {
      if (everyMainHasKcal) {
        const byKcal = (getKcal(right.ingredient) ?? 0) - (getKcal(left.ingredient) ?? 0);
        if (byKcal !== 0) {
          return byKcal;
        }
      }
      return groupRank(left.ingredient) - groupRank(right.ingredient) || left.index - right.index;
    })
    .map(({ ingredient }) => ingredient);

  return grouped;
};

/** Energy of a list of foods, or null when any of them lacks it. */
export const sumIngredientKcal = (ingredients: EmphasisIngredient[]) => {
  let total = 0;
  for (const ingredient of ingredients) {
    const kcal = getKcal(ingredient);
    if (kcal === null) {
      return null;
    }
    total += kcal;
  }
  return total;
};
