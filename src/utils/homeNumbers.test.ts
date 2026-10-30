import { describe, expect, it } from 'vitest';
import type { DashboardTimelineSession } from '../types';
import { createEmptyDailyActivity, type DailyActivity } from './activityGrid';
import { buildWeeklyAdherence, summarizeAdherence, summarizeSteps } from './homeNumbers';

const session = (
  scheduled: string,
  planned: DashboardTimelineSession['planned_status'],
  actual: DashboardTimelineSession['actual_status'] = 'not_started',
): DashboardTimelineSession =>
  ({
    training_day_id: scheduled,
    session_index: 1,
    name: 'Sesión',
    planned_status: planned,
    actual_status: actual,
    completion_percentage: 0,
    position: 1,
    total_sessions: 1,
    scheduled_date_key: scheduled,
    training_day: {} as DashboardTimelineSession['training_day'],
  }) as DashboardTimelineSession;

describe('buildWeeklyAdherence', () => {
  // Thursday 29 October 2026; its week starts on Monday the 26th.
  const today = '2026-10-29';

  it('groups planned sessions by Monday-first week and ignores rest and future days', () => {
    const weeks = buildWeeklyAdherence(
      [
        session('2026-10-19', 'completed'),
        session('2026-10-21', 'pending'),
        session('2026-10-23', 'partial'),
        session('2026-10-25', 'rest'),
        session('2026-10-26', 'pending', 'completed'),
        session('2026-10-30', 'pending'),
      ],
      today,
    );

    expect(weeks).toEqual([
      { weekStartKey: '2026-10-19', percentage: 50 },
      { weekStartKey: '2026-10-26', percentage: 100 },
    ]);
  });

  it('leaves out weeks older than the window', () => {
    const weeks = buildWeeklyAdherence([session('2026-08-03', 'completed')], today, 8);
    expect(weeks).toEqual([]);
  });
});

describe('summarizeAdherence', () => {
  it('averages the last four weeks and compares them with the four before', () => {
    const summary = summarizeAdherence(
      [40, 50, 60, 70, 80, 90, 100, 90].map((percentage, index) => ({
        weekStartKey: `w${index}`,
        percentage,
      })),
    );

    expect(summary.value).toBe(90);
    expect(summary.delta).toBe(35);
    expect(summary.series).toHaveLength(8);
  });

  it('has no delta with four weeks or fewer and no value without weeks', () => {
    expect(summarizeAdherence([{ weekStartKey: 'w', percentage: 80 }])).toEqual({
      value: 80,
      delta: null,
      series: [80],
    });
    expect(summarizeAdherence([]).value).toBeNull();
  });
});

describe('summarizeSteps', () => {
  const day = (steps: number | null): DailyActivity => ({ ...createEmptyDailyActivity(), steps });

  it('compares today with the average of previous days that have steps', () => {
    const days: Record<string, DailyActivity> = {
      '2026-10-29': day(9000),
      '2026-10-28': day(6000),
      '2026-10-27': day(8000),
      '2026-10-26': day(0),
    };

    const summary = summarizeSteps(days, '2026-10-29');
    expect(summary.today).toBe(9000);
    expect(summary.delta).toBe(2000);
    expect(summary.series).toEqual([0, 0, 0, 0, 8000, 6000, 9000]);
  });

  it('reports no steps when the health source has never sent any', () => {
    const summary = summarizeSteps({ '2026-10-29': day(0) }, '2026-10-29');
    expect(summary.today).toBeNull();
    expect(summary.delta).toBeNull();
  });
});
