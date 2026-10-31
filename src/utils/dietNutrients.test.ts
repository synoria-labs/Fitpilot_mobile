import { describe, expect, it } from 'vitest';
import { hasCompleteMacros } from './dietNutrients';

describe('hasCompleteMacros', () => {
  it('needs protein, carbohydrates and fat', () => {
    expect(hasCompleteMacros({ kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 })).toBe(true);
    expect(hasCompleteMacros({ kcal: 500, proteinG: 30, carbsG: null, fatG: 15 })).toBe(false);
    expect(hasCompleteMacros(null)).toBe(false);
  });
});
