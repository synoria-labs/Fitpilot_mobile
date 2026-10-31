import { describe, expect, it } from 'vitest';
import type { DashboardTimeline, MuscleVolumeItem, WorkoutAnalyticsMetricCard } from '../types';
import {
  aggregateMuscleVolume,
  countPlannedSessions,
  getMetricChange,
  getPlannedTrainingDays,
} from './trainingProgress';

const card = (id: string, value: number | null): WorkoutAnalyticsMetricCard => ({
  id,
  label: id,
  value,
  display_value: String(value ?? '—'),
});

const session = (id: string, name: string, totalSets: number, restDay = false) => ({
  training_day: { id, name, total_sets: totalSets, rest_day: restDay },
});

// Solo lo que estas utilidades leen del timeline del dashboard.
const timeline = (days: { date_key: string; sessions: ReturnType<typeof session>[] }[]) =>
  ({ planned_days: days }) as unknown as DashboardTimeline;

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
  });

  it('no compara sin una base útil', () => {
    expect(getMetricChange(card('volume', 10), card('volume', 0))).toBeNull();
    expect(getMetricChange(card('volume', null), card('volume', 10))).toBeNull();
    expect(getMetricChange(card('volume', 10))).toBeNull();
  });
});

describe('countPlannedSessions', () => {
  it('cuenta las sesiones del plan entre dos fechas sin los descansos', () => {
    const plan = timeline([
      { date_key: '2026-10-04', sessions: [session('a', 'Push A', 18)] },
      { date_key: '2026-10-05', sessions: [session('b', 'Pull A', 16), session('c', 'Cardio', 4)] },
      { date_key: '2026-10-06', sessions: [session('r', 'Descanso', 0, true)] },
      { date_key: '2026-11-01', sessions: [session('d', 'Pierna', 20)] },
    ]);

    expect(countPlannedSessions(plan, '2026-10-05', '2026-11-01')).toBe(3);
    expect(countPlannedSessions(null, '2026-10-05', '2026-11-01')).toBe(0);
  });
});

describe('getPlannedTrainingDays', () => {
  it('toma cada día de entreno de la semana una sola vez', () => {
    const plan = timeline([
      { date_key: '2026-10-26', sessions: [session('a', 'Push A', 18)] },
      { date_key: '2026-10-27', sessions: [session('r', 'Descanso', 0, true)] },
      { date_key: '2026-10-28', sessions: [session('b', 'Pull A', 16), session('a', 'Push A', 18)] },
      { date_key: '2026-11-02', sessions: [session('c', 'Pierna', 20)] },
    ]);
    const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];

    expect(getPlannedTrainingDays(plan, week)).toEqual([
      { id: 'a', name: 'Push A', totalSets: 18 },
      { id: 'b', name: 'Pull A', totalSets: 16 },
    ]);
    expect(getPlannedTrainingDays(undefined, week)).toEqual([]);
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
