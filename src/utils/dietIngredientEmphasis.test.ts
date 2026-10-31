import { describe, expect, it } from 'vitest';
import {
  getIngredientTier,
  groupIngredientsByRelevance,
  sumIngredientKcal,
} from './dietIngredientEmphasis';
import { getDietMealKind, getDietMealKinds, getNextDietMealIndex } from './dietMealVisuals';

const food = (label: string, exchangeGroupName: string | null, kcal?: number | null) => ({
  label,
  exchangeGroupName,
  nutrients: kcal === undefined ? undefined : { kcal },
});

describe('getIngredientTier', () => {
  it('tells vegetables and free foods apart from the calorie-relevant groups', () => {
    expect(getIngredientTier(food('Lechuga', 'Verduras'))).toBe('vegetable');
    expect(getIngredientTier(food('Limón', 'Alimentos Libres de Energía'))).toBe('free');
    expect(getIngredientTier(food('Arroz', 'Cereales sin Grasa'))).toBe('main');
    expect(getIngredientTier(food('Sin grupo', null))).toBe('main');
  });
});

describe('groupIngredientsByRelevance', () => {
  it('orders main foods by energy when every one has it', () => {
    const grouped = groupIngredientsByRelevance([
      food('Aceite', 'Aceites y Grasas', 90),
      food('Lechuga', 'Verduras', 10),
      food('Arroz', 'Cereales sin Grasa', 280),
      food('Sal', 'Alimentos Libres de Energía', 0),
      food('Pechuga', 'Alimentos de Origen Animal', 250),
    ]);

    expect(grouped.main.map((item) => item.label)).toEqual(['Arroz', 'Pechuga', 'Aceite']);
    expect(grouped.vegetables.map((item) => item.label)).toEqual(['Lechuga']);
    expect(grouped.free.map((item) => item.label)).toEqual(['Sal']);
  });

  it('falls back to the group order, keeping ties in place, without energy data', () => {
    const grouped = groupIngredientsByRelevance([
      food('Aceite', 'Aceites y Grasas'),
      food('Tortilla', 'Cereales y Tubérculos'),
      food('Huevo', 'Alimentos de Origen Animal'),
      food('Arroz', 'Cereales sin Grasa'),
    ]);

    expect(grouped.main.map((item) => item.label)).toEqual(['Huevo', 'Tortilla', 'Arroz', 'Aceite']);
  });

  it('adds energy only when every food has it', () => {
    expect(sumIngredientKcal([food('A', 'Verduras', 10), food('B', 'Verduras', 15)])).toBe(25);
    expect(sumIngredientKcal([food('A', 'Verduras', 10), food('B', 'Verduras')])).toBeNull();
  });
});

describe('meal kinds', () => {
  it('reads the kind of meal from its name', () => {
    expect(getDietMealKind('Desayuno')).toBe('desayuno');
    expect(getDietMealKind('Colación matutina')).toBe('colacion');
    expect(getDietMealKind('Comida')).toBe('comida');
    expect(getDietMealKind('Cena ligera')).toBe('cena');
    expect(getDietMealKind('Pre entreno')).toBe('otra');
  });

  it('finds the next meal by its usual hour, with snacks around the main meal', () => {
    const day = ['Desayuno', 'Colación', 'Comida', 'Colación', 'Cena'];
    expect(getNextDietMealIndex(day, 7)).toBe(0);
    expect(getNextDietMealIndex(day, 12)).toBe(2);
    expect(getNextDietMealIndex(day, 15)).toBe(3);
    expect(getNextDietMealIndex(day, 21)).toBeNull();
  });

  it('reads «almuerzo» as the mid-morning meal when the day also has a comida', () => {
    const day = ['Snack1', 'Almuerzo', 'Comida', 'Snack 2', 'Cena'];
    expect(getDietMealKinds(day)).toEqual(['colacion', 'desayuno', 'comida', 'colacion', 'cena']);
    expect(getDietMealKinds(['Desayuno', 'Almuerzo', 'Cena'])).toEqual(['desayuno', 'comida', 'cena']);
    expect(getNextDietMealIndex(day, 8)).toBe(0);
    expect(getNextDietMealIndex(day, 10)).toBe(1);
    expect(getNextDietMealIndex(day, 12)).toBe(2);
    expect(getNextDietMealIndex(day, 16)).toBe(3);
  });
});
