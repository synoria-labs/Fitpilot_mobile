import type { RecentWorkoutHistoryItem, WorkoutAnalyticsMetricCard } from '../types';
import { addDaysToDateKey, getStartOfLocalWeekDateKey } from './date';

export const buildTrainingConsistency = (sessions: RecentWorkoutHistoryItem[], today: string) => {
  const monday = getStartOfLocalWeekDateKey(today) ?? today;
  const start = addDaysToDateKey(monday, -77) ?? monday;
  const seen = new Set<string>();
  const byDate = new Map<string, { count: number; volume: number }>();
  sessions.forEach((session) => {
    const date = session.performed_on_date.slice(0, 10);
    if (
      session.status !== 'completed' ||
      seen.has(session.workout_log_id) ||
      date > today ||
      date < start
    )
      return;
    seen.add(session.workout_log_id);
    const day = byDate.get(date) ?? { count: 0, volume: 0 };
    day.count += 1;
    day.volume += Math.max(session.volume_kg, 0);
    byDate.set(date, day);
  });
  const maxVolume = Math.max(1, ...Array.from(byDate.values(), (day) => day.volume));
  const weeks = Array.from({ length: 12 }, (_, week) => {
    const days = Array.from({ length: 7 }, (_, day) => {
      const date = addDaysToDateKey(start, week * 7 + day) ?? start;
      const totals = byDate.get(date) ?? { count: 0, volume: 0 };
      return {
        date,
        ...totals,
        future: date > today,
        level: totals.count ? Math.max(1, Math.ceil((totals.volume / maxVolume) * 4)) : 0,
      };
    });
    return { days, count: days.reduce((sum, day) => sum + day.count, 0) };
  });
  // An unfinished current week does not break the streak of completed weeks.
  let index = weeks.length - 1;
  if (weeks[index].count < 3) index -= 1;
  let streak = 0;
  while (index >= 0 && weeks[index].count >= 3) {
    streak += 1;
    index -= 1;
  }
  return { weeks, streak };
};

export const getMetricChange = (
  card: WorkoutAnalyticsMetricCard,
  previous?: WorkoutAnalyticsMetricCard,
) => {
  if (card.value == null || previous?.value == null || previous.value <= 0) return null;
  const difference = card.value - previous.value;
  const value =
    card.id === 'avg_duration'
      ? Math.round(difference)
      : Math.round((difference / previous.value) * 100);
  return {
    label: `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}${card.id === 'avg_duration' ? ' min' : '%'}`,
    value,
  };
};
