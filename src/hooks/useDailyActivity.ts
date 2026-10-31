import { useCallback, useEffect, useRef, useState } from 'react';
import { connectedHealthService } from '../services/connectedHealth';
import { getWorkoutAnalyticsHistory } from '../services/workoutAnalytics';
import { createEmptyDailyActivity, type DailyActivity } from '../utils/activityGrid';
import { addDaysToDateKey, compareDateKeys, getTodayDateKey, toLocalDateKey } from '../utils/date';

const PAGE_SIZE = 50;
const MAX_PAGES = 8;

type DailyActivityState = {
  days: Record<string, DailyActivity>;
  /** Primer día con algún dato: lo anterior se pinta atenuado en la cuadrícula. */
  startKey: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  /** El historial de entreno no respondió en la última carga. */
  workoutsFailed: boolean;
};

const ensureDay = (days: Record<string, DailyActivity>, key: string) => {
  days[key] ??= createEmptyDailyActivity();
  return days[key];
};

const loadWorkouts = async (sinceKey: string, days: Record<string, DailyActivity>) => {
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await getWorkoutAnalyticsHistory({
      scopeKind: 'range',
      range: 'all',
      status: 'completed',
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    const items = response?.items ?? [];
    let reachedOlder = false;

    for (const item of items) {
      const key = toLocalDateKey(item.performed_on_date);
      if (!key) {
        continue;
      }
      if (compareDateKeys(key, sinceKey) < 0) {
        reachedOlder = true;
        continue;
      }
      const day = ensureDay(days, key);
      day.sessions += 1;
      day.volumeKg += item.volume_kg ?? 0;
      day.minutes += item.duration_minutes ?? item.cardio_duration_minutes ?? 0;
      if (item.training_day_name) {
        day.trainingNames.push(item.training_day_name);
      }
    }

    // Older pages can only matter if the history comes oldest first.
    const isNewestFirst =
      items.length < 2 || compareDateKeys(items[0].performed_on_date, items[items.length - 1].performed_on_date) >= 0;
    const fetched = (page + 1) * PAGE_SIZE;
    if (items.length < PAGE_SIZE || fetched >= (response?.total ?? 0) || (reachedOlder && isNewestFirst)) {
      return;
    }
  }
};

const loadHealth = async (spanDays: number, days: Record<string, DailyActivity>) => {
  const summary = await connectedHealthService.getSummary(spanDays);
  for (const entry of summary?.summaries ?? []) {
    if (entry.steps == null && entry.sleep_minutes == null && entry.active_energy_kcal == null) {
      continue;
    }
    const key = toLocalDateKey(entry.date) ?? entry.date;
    const day = ensureDay(days, key);
    day.steps = entry.steps;
    day.sleepMinutes = entry.sleep_minutes;
    day.activeKcal = entry.active_energy_kcal;
  }
};

/**
 * Actividad por día local para la cuadrícula: sesiones completadas del historial de entreno y
 * pasos, sueño y kcal activas del resumen de salud conectada. Una fuente que falla no tumba a la otra.
 * Con includeHealth en false solo se pide el historial (Entreno no usa los datos de salud).
 */
export const useDailyActivity = ({
  weeks,
  enabled = true,
  includeHealth = true,
}: {
  weeks: number;
  enabled?: boolean;
  includeHealth?: boolean;
}) => {
  const [state, setState] = useState<DailyActivityState>({
    days: {},
    startKey: null,
    isLoading: false,
    hasLoaded: false,
    workoutsFailed: false,
  });
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setState((current) => ({ ...current, isLoading: true }));

    const todayKey = getTodayDateKey();
    const spanDays = weeks * 7 + 7;
    const sinceKey = addDaysToDateKey(todayKey, -spanDays) ?? todayKey;
    const days: Record<string, DailyActivity> = {};

    const [workouts] = await Promise.allSettled([
      loadWorkouts(sinceKey, days),
      includeHealth ? loadHealth(spanDays, days) : Promise.resolve(),
    ]);

    if (request !== requestRef.current) {
      return;
    }
    const workoutsFailed = workouts.status === 'rejected';
    setState((current) => {
      // Un refresco fallido no borra la cuadrícula que ya se veía.
      if (workoutsFailed && current.hasLoaded) {
        return { ...current, isLoading: false, workoutsFailed };
      }
      const keys = Object.keys(days).sort();
      return { days, startKey: keys[0] ?? null, isLoading: false, hasLoaded: true, workoutsFailed };
    });
  }, [includeHealth, weeks]);

  useEffect(() => {
    if (enabled) {
      void reload();
    }
  }, [enabled, reload]);

  return { ...state, reload };
};
