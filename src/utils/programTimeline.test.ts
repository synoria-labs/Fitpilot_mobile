import { describe, expect, it } from 'vitest';
import type { DashboardTimeline, DashboardTimelineSession } from '../types';
import { countPlannedSessions, getPlannedSessions, getPlannedTrainingDays } from './programTimeline';

// Solo los campos que leen estas utilidades.
const session = (dateKey: string, id: string, name: string, totalSets: number, rest = false) =>
  ({
    scheduled_date_key: dateKey,
    planned_status: rest ? 'rest' : 'pending',
    training_day: { id, name, total_sets: totalSets, rest_day: rest },
  }) as unknown as DashboardTimelineSession;

const timeline = {
  planned_days: [
    { date_key: '2026-10-04', sessions: [session('2026-10-04', 'a', 'Push A', 18)] },
    {
      date_key: '2026-10-05',
      sessions: [session('2026-10-05', 'b', 'Pull A', 16), session('2026-10-05', 'c', 'Cardio', 4)],
    },
    { date_key: '2026-10-06', sessions: [session('2026-10-06', 'r', 'Descanso', 0, true)] },
    { date_key: '2026-10-07', sessions: [session('2026-10-07', 'a', 'Push A', 18)] },
    { date_key: '2026-11-01', sessions: [session('2026-11-01', 'd', 'Pierna', 20)] },
  ],
} as unknown as DashboardTimeline;

describe('sesiones del plan', () => {
  it('aplana el timeline en orden, con los descansos', () => {
    expect(getPlannedSessions(timeline)).toHaveLength(6);
    expect(getPlannedSessions(null)).toEqual([]);
  });

  it('cuenta las sesiones de entreno entre dos fechas, sin descansos', () => {
    const sessions = getPlannedSessions(timeline);

    expect(countPlannedSessions(sessions, '2026-10-05', '2026-11-01')).toBe(4);
    expect(countPlannedSessions(sessions, '2026-10-06', '2026-10-06')).toBe(0);
  });

  it('toma cada día de entreno una sola vez', () => {
    const days = getPlannedTrainingDays(getPlannedSessions(timeline), [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);

    expect(days).toEqual([
      { id: 'b', name: 'Pull A', totalSets: 16 },
      { id: 'c', name: 'Cardio', totalSets: 4 },
      { id: 'a', name: 'Push A', totalSets: 18 },
    ]);
  });
});
