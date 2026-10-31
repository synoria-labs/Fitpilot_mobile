import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMuscleVolume } from '../services/api';
import { useWorkoutStore } from '../store/workoutStore';
import type { MuscleVolumeResponse } from '../types';
import { getLocalWeekDateKeys } from '../utils/date';
import { aggregateMuscleVolume, getPlannedTrainingDays } from '../utils/trainingProgress';

export type WeekMuscleVolume = Pick<MuscleVolumeResponse, 'muscles' | 'total_effective_sets'>;

// Lo último que se vio de cada día: al volver a la pantalla se muestra mientras se refresca.
const responseCache = new Map<string, MuscleVolumeResponse>();
const cacheKey = (trainingDayId: string, countSecondary: boolean) =>
  `${trainingDayId}:${countSecondary ? 'sinergistas' : 'directas'}`;

/**
 * Series por músculo de la semana en curso, sumando los días que el plan pone en ella. Los días
 * salen del dashboard que ya está en el store (no se vuelve a pedir si existe) y la tarjeta nunca
 * se vacía mientras refresca.
 */
export const useWeeklyMuscleVolume = ({
  countSecondary,
  enabled = true,
}: {
  countSecondary: boolean;
  enabled?: boolean;
}) => {
  const timeline = useWorkoutStore((state) => state.dashboardBootstrap?.timeline);
  const hasBootstrap = useWorkoutStore((state) => state.dashboardBootstrap != null);
  const loadDashboardData = useWorkoutStore((state) => state.loadDashboardData);
  const weekKey = getLocalWeekDateKeys().join(',');
  const trainingDays = useMemo(() => getPlannedTrainingDays(timeline, weekKey.split(',')), [timeline, weekKey]);
  const plannedSets = trainingDays.reduce((total, day) => total + day.totalSets, 0);

  const readCache = useCallback((): WeekMuscleVolume | null => {
    const cached = trainingDays.map((day) => responseCache.get(cacheKey(day.id, countSecondary)));
    return cached.every((response): response is MuscleVolumeResponse => response != null)
      ? aggregateMuscleVolume(cached)
      : null;
  }, [countSecondary, trainingDays]);

  const [volume, setVolume] = useState<WeekMuscleVolume | null>(() => (hasBootstrap ? readCache() : null));
  const [isLoading, setIsLoading] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const requestRef = useRef(0);

  // Inicio carga el dashboard; si se llega aquí antes, se pide una sola vez.
  useEffect(() => {
    if (!enabled || hasBootstrap) {
      return undefined;
    }
    let active = true;
    void loadDashboardData().then(() => {
      if (active && !useWorkoutStore.getState().dashboardBootstrap) {
        setHasFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, hasBootstrap, loadDashboardData]);

  const reload = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    const cached = readCache();
    if (cached) {
      setVolume(cached);
    }
    if (!trainingDays.length) {
      setVolume({ muscles: [], total_effective_sets: 0 });
      setHasFailed(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const responses = await Promise.all(
        trainingDays.map(async (day) => {
          const response = await getMuscleVolume(day.id, countSecondary);
          responseCache.set(cacheKey(day.id, countSecondary), response);
          return response;
        }),
      );
      if (request !== requestRef.current) {
        return;
      }
      setVolume(aggregateMuscleVolume(responses));
      setHasFailed(false);
    } catch {
      if (request === requestRef.current) {
        setHasFailed(true);
      }
    } finally {
      if (request === requestRef.current) {
        setIsLoading(false);
      }
    }
  }, [countSecondary, readCache, trainingDays]);

  // Refresca al volver a la pantalla, al cambiar el plan de la semana o el conteo de sinergistas.
  useEffect(() => {
    if (enabled && hasBootstrap) {
      void reload();
    }
  }, [enabled, hasBootstrap, reload]);

  const retry = useCallback(() => {
    setHasFailed(false);
    if (hasBootstrap) {
      void reload();
      return;
    }
    void loadDashboardData().then(() => {
      if (!useWorkoutStore.getState().dashboardBootstrap) {
        setHasFailed(true);
      }
    });
  }, [hasBootstrap, loadDashboardData, reload]);

  return {
    volume,
    plannedSets,
    isLoading,
    hasLoaded: volume != null,
    hasFailed,
    retry,
  };
};
