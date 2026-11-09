import { describe, expect, it } from 'vitest';
import type { MuscleVolumeItem, WorkoutAnalyticsMetricCard } from '../types';
import { aggregateMuscleVolume, getMetricChange } from './trainingProgress';

const card = (id: string, value: number | null): WorkoutAnalyticsMetricCard => ({
  id,
  label: id,
  value,
  display_value: String(value ?? '—'),
});

const muscle = (name: string, effective: number, total = effective): MuscleVolumeItem => ({
  muscle_name: name,
  display_name: name,
  effective_sets: effective,
  total_sets: total,
});

describe('getMetricChange', () => {
  it('compara en porcentaje y la duración en minutos', () => {
    expect(getMetricChange(card('sessions', 21), card('sessions', 19))?.label).toBe('+11%');
    expect(getMetricChange(card('avg_duration', 52), card('avg_duration', 55))?.label).toBe('−3 min');
    expect(getMetricChange(card('sessions', 5), card('sessions', 5))?.label).toBe('0%');
    expect(getMetricChange(card('avg_duration', 18504), card('avg_duration', 24211))?.label).toBe('−5,707 min');
  });

  it('no compara sin una base útil', () => {
    expect(getMetricChange(card('volume', 10), card('volume', 0))).toBeNull();
    expect(getMetricChange(card('volume', null), card('volume', 10))).toBeNull();
    expect(getMetricChange(card('volume', 10))).toBeNull();
  });
});

describe('aggregateMuscleVolume', () => {
  it('suma por músculo, quita los ceros y ordena de más a menos series', () => {
    const week = aggregateMuscleVolume([
      { muscles: [muscle('Tríceps', 3), muscle('Pectoral', 6, 8), muscle('Bíceps', 0)] },
      { muscles: [muscle('Tríceps', 1.5), muscle('Dorsal', 6)] },
    ]);

    expect(week.muscles.map((item) => [item.muscle_name, item.effective_sets])).toEqual([
      ['Dorsal', 6],
      ['Pectoral', 6],
      ['Tríceps', 4.5],
    ]);
    expect(week.muscles[1].total_sets).toBe(8);
    expect(week.total_effective_sets).toBe(16.5);
  });
});
