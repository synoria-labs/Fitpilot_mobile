import { describe, expect, it } from 'vitest';
import type { MeasurementHistoryItem } from '../types/measurements';
import { buildMeasurementOverviewSeries, selectMeasurementOverviewRange } from './measurementOverview';
import { getMeasurementChangeTone } from './measurements';

const record = (id: string, date: string, values: Partial<MeasurementHistoryItem> = {}): MeasurementHistoryItem => ({ id, date, user_id: 1, ...values });

describe('measurement overview', () => {
  it('keeps the latest available composition when a newer entry only contains weight', () => {
    const history = [record('new', '2026-10-30', { weight_kg: 71 }), record('fat', '2026-10-01', { body_fat_pct: 22 }), record('before', '2026-09-01', { body_fat_pct: 23 })];
    const series = buildMeasurementOverviewSeries(history, 'body_fat_pct', 'mx', '2026-10-30');
    expect(series.map((point) => point.value)).toEqual([23, 22]);
    expect(series.at(-1)?.date).toBe('2026-10-01');
  });

  it('deduplicates records and excludes missing, invalid and future values', () => {
    const same = record('same', '2026-10-20', { weight_kg: 70 });
    const series = buildMeasurementOverviewSeries([same, same, record('future', '2026-11-01', { weight_kg: 71 }), record('empty', '2026-10-21', { weight_kg: '' }), record('invalid', 'bad-date', { weight_kg: 72 })], 'weight_kg', 'mx', '2026-10-30');
    expect(series.map((point) => point.id)).toEqual(['same']);
  });

  it('converts weight and perimeter history to the preferred units', () => {
    const history = [record('one', '2026-10-01', { weight_kg: 70, waist_cm: 76.2 })];
    const weight = buildMeasurementOverviewSeries(history, 'weight_kg', 'us', '2026-10-30')[0];
    const waist = buildMeasurementOverviewSeries(history, 'waist_cm', 'us', '2026-10-30')[0];
    expect(weight.unit).toBe('lb');
    expect(weight.value).toBeCloseTo(154.324, 2);
    expect(waist.unit).toBe('in');
    expect(waist.value).toBeCloseTo(30);
  });

  it('calculates BMI using height and weight from the same record', () => {
    const history = [record('missing-height', '2026-10-30', { weight_kg: 75 }), record('complete', '2026-10-01', { weight_kg: 70, height_cm: 175 })];
    const series = buildMeasurementOverviewSeries(history, 'bmi', 'us', '2026-10-30');
    expect(series).toHaveLength(1);
    expect(series[0].value).toBeCloseTo(22.86);
  });

  it('anchors ranges to today and leaves stale history outside the range', () => {
    const series = buildMeasurementOverviewSeries([record('old', '2025-10-01', { weight_kg: 70 })], 'weight_kg', 'mx', '2026-10-30');
    expect(selectMeasurementOverviewRange(series, '6m', '2026-10-30')).toEqual([]);
    expect(selectMeasurementOverviewRange(series, 'all', '2026-10-30')).toHaveLength(1);
  });

  it('clamps month boundaries to the final day without dropping that day', () => {
    const series = buildMeasurementOverviewSeries([record('before', '2026-02-27', { weight_kg: 70 }), record('boundary', '2026-02-28', { weight_kg: 71 })], 'weight_kg', 'mx', '2026-05-31');
    expect(selectMeasurementOverviewRange(series, '3m', '2026-05-31').map((point) => point.id)).toEqual(['boundary']);
  });
});

describe('getMeasurementChangeTone', () => {
  it('pinta según la dirección que conviene', () => {
    expect(getMeasurementChangeTone(-1.2, 'decrease')).toBe('emerald');
    expect(getMeasurementChangeTone(0.8, 'decrease')).toBe('amber');
    expect(getMeasurementChangeTone(0.6, 'increase')).toBe('emerald');
  });

  it('deja en gris lo que casi no se movió o no tiene dirección preferida', () => {
    expect(getMeasurementChangeTone(0.04, 'increase')).toBe('slate');
    expect(getMeasurementChangeTone(2, 'neutral')).toBe('slate');
    expect(getMeasurementChangeTone(null, 'decrease')).toBe('slate');
  });
});
