import { describe, expect, it } from 'vitest';
import { formatInteger, normalizeText } from './formatters';

describe('formatInteger', () => {
  it('rounds and groups thousands the Mexican way', () => {
    expect(formatInteger(2150.4)).toBe('2,150');
    expect(formatInteger(89.6)).toBe('90');
  });
});

describe('normalizeText', () => {
  it('compares names without case, accents or outer spaces', () => {
    expect(normalizeText('  Colación Matutina ')).toBe('colacion matutina');
    expect(normalizeText('Alimentos Libres de Energía')).toBe('alimentos libres de energia');
    expect(normalizeText(null)).toBe('');
  });
});
