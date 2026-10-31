import { describe, expect, it } from 'vitest';
import { formatCount, formatDecimal, formatInteger, formatSigned, normalizeText } from './formatters';

describe('formatInteger', () => {
  it('rounds and groups thousands the Mexican way', () => {
    expect(formatInteger(2150.4)).toBe('2,150');
    expect(formatInteger(89.6)).toBe('90');
  });
});

describe('formatDecimal', () => {
  it('always shows one decimal', () => {
    expect(formatDecimal(9)).toBe('9.0');
    expect(formatDecimal(12.45)).toBe('12.5');
    expect(formatDecimal(1234.56)).toBe('1,234.6');
  });
});

describe('formatCount', () => {
  it('picks the singular only for one', () => {
    expect(formatCount(1, 'sesión', 'sesiones')).toBe('1 sesión');
    expect(formatCount(0, 'sesión', 'sesiones')).toBe('0 sesiones');
    expect(formatCount(1200, 'paso', 'pasos')).toBe('1,200 pasos');
  });
});

describe('formatSigned', () => {
  it('puts a plus or a true minus in front, and nothing for zero', () => {
    expect(formatSigned(3, '3 pts')).toBe('+3 pts');
    expect(formatSigned(-2, '2 kg')).toBe('−2 kg');
    expect(formatSigned(0, '0%')).toBe('0%');
  });
});

describe('normalizeText', () => {
  it('compares names without case, accents or outer spaces', () => {
    expect(normalizeText('  Colación Matutina ')).toBe('colacion matutina');
    expect(normalizeText('Alimentos Libres de Energía')).toBe('alimentos libres de energia');
    expect(normalizeText(null)).toBe('');
  });
});
