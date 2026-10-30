import { describe, expect, it } from 'vitest';
import { getDietPortionEquivalentsValue, sumDietPortionEquivalents } from './dietPortions';

const portion = (equivalents: number | null, grams: number | null = 100) => ({
  householdLabel: null,
  equivalents,
  grams,
});

describe('getDietPortionEquivalentsValue', () => {
  it('shows the equivalents of a portion without a display', () => {
    expect(getDietPortionEquivalentsValue(portion(4))).toBe('4 eq');
    expect(getDietPortionEquivalentsValue(portion(1.5))).toBe('1.5 eq');
    expect(getDietPortionEquivalentsValue(portion(0))).toBeNull();
    expect(getDietPortionEquivalentsValue(portion(null))).toBeNull();
  });

  it('prefers the backend display and keeps equivalents it leaves out', () => {
    expect(
      getDietPortionEquivalentsValue({
        ...portion(2),
        display: [{ key: 'equivalents', value: '2 eq', approximate: true }],
      }),
    ).toBe('≈ 2 eq');
    expect(
      getDietPortionEquivalentsValue({
        ...portion(2),
        display: [{ key: 'equivalents', value: '2', approximate: false }],
      }),
    ).toBe('2 eq');
    expect(
      getDietPortionEquivalentsValue({
        ...portion(1.5),
        display: [{ key: 'grams', value: '46 g', approximate: false }],
      }),
    ).toBe('1.5 eq');
  });
});

describe('sumDietPortionEquivalents', () => {
  it('adds equivalents only when every portion has them', () => {
    expect(sumDietPortionEquivalents([portion(1), portion(0.5)])).toBe('1.5 eq');
    expect(sumDietPortionEquivalents([portion(1), portion(null)])).toBeNull();
    expect(sumDietPortionEquivalents([])).toBeNull();
  });
});
