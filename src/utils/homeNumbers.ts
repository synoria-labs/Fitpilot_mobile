import type { DashboardTimelineSession } from '../types';
import type { DailyActivity } from './activityGrid';
import { addDaysToDateKey, getStartOfLocalWeekDateKey } from './date';

export type WeeklyAdherence = {
  weekStartKey: string;
  /** 0–100: share of the sessions planned that week (up to today) that were done. */
  percentage: number;
};

export type AdherenceSummary = {
  /** Mean of the last (up to) four weeks with planned sessions, or null without any. */
  value: number | null;
  /** Points against the (up to) four weeks before those, or null when there are none. */
  delta: number | null;
  /** Weekly percentages, oldest first, for the trend line. */
  series: number[];
};

export type StepsSummary = {
  /** Steps recorded today, or null when the health source has no step data. */
  today: number | null;
  /** Today against the average of the previous 30 days that have steps. */
  delta: number | null;
  /** The last seven days, oldest first; days without data count as zero. */
  series: number[];
};

const WINDOW = 4;

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

const sessionCredit = (session: DashboardTimelineSession) => {
  if (session.planned_status === 'completed' || session.actual_status === 'completed') {
    return 1;
  }
  return session.planned_status === 'partial' ? 0.5 : 0;
};

/**
 * Weekly adherence for the last `weeks` Monday-first weeks: of the sessions scheduled that week
 * up to today, how many were done (a partial one counts half). Weeks with nothing planned are
 * left out, so a program that started recently only reports its own weeks.
 */
export const buildWeeklyAdherence = (
  sessions: DashboardTimelineSession[],
  todayKey: string,
  weeks = 8,
): WeeklyAdherence[] => {
  const currentWeekStart = getStartOfLocalWeekDateKey(todayKey);
  if (!currentWeekStart) {
    return [];
  }

  const firstWeekStart = addDaysToDateKey(currentWeekStart, -7 * (weeks - 1));
  if (!firstWeekStart) {
    return [];
  }

  const byWeek = new Map<string, { planned: number; done: number }>();
  sessions.forEach((session) => {
    const key = session.scheduled_date_key;
    if (session.planned_status === 'rest' || key < firstWeekStart || key > todayKey) {
      return;
    }

    const weekStart = getStartOfLocalWeekDateKey(key);
    if (!weekStart) {
      return;
    }

    const week = byWeek.get(weekStart) ?? { planned: 0, done: 0 };
    week.planned += 1;
    week.done += sessionCredit(session);
    byWeek.set(weekStart, week);
  });

  return [...byWeek.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([weekStartKey, week]) => ({
      weekStartKey,
      percentage: Math.round((week.done / week.planned) * 100),
    }));
};

export const summarizeAdherence = (weeks: WeeklyAdherence[]): AdherenceSummary => {
  const series = weeks.map((week) => week.percentage);
  if (!series.length) {
    return { value: null, delta: null, series };
  }

  const recent = series.slice(-WINDOW);
  const earlier = series.slice(-WINDOW * 2, -WINDOW);
  const value = Math.round(mean(recent));

  return {
    value,
    delta: earlier.length ? value - Math.round(mean(earlier)) : null,
    series,
  };
};

export const summarizeSteps = (days: Record<string, DailyActivity>, todayKey: string): StepsSummary => {
  const stepsOn = (offset: number) => {
    const key = addDaysToDateKey(todayKey, offset);
    return key ? days[key]?.steps ?? null : null;
  };

  const previous: number[] = [];
  for (let offset = -30; offset <= -1; offset += 1) {
    const steps = stepsOn(offset);
    if (steps != null && steps > 0) {
      previous.push(steps);
    }
  }

  const series: number[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    series.push(stepsOn(offset) ?? 0);
  }

  const todaySteps = stepsOn(0);
  // No steps today and none in the last month means there is no step source, not a lazy day.
  const today = todaySteps != null && (todaySteps > 0 || previous.length > 0) ? todaySteps : null;

  return {
    today,
    delta: today != null && previous.length ? Math.round(today - mean(previous)) : null,
    series,
  };
};
