import type {
  DashboardTimeline,
  MuscleVolumeItem,
  MuscleVolumeResponse,
  WorkoutAnalyticsMetricCard,
} from '../types';

/**
 * Cambio de un indicador frente al periodo anterior: en minutos para la duración y en porcentaje
 * para lo demás. Sin base comparable (sin dato o en cero) no hay cambio que mostrar.
 */
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

const isInRange = (dateKey: string, startKey: string, endKey: string) =>
  dateKey >= startKey && dateKey <= endKey;

/** Sesiones de entreno (sin descansos) que el plan tenía entre dos fechas, ambas incluidas. */
export const countPlannedSessions = (
  timeline: DashboardTimeline | null | undefined,
  startKey: string,
  endKey: string,
) =>
  (timeline?.planned_days ?? [])
    .filter((day) => isInRange(day.date_key, startKey, endKey))
    .reduce(
      (total, day) => total + day.sessions.filter((session) => !session.training_day.rest_day).length,
      0,
    );

export type WeekTrainingDay = { id: string; name: string; totalSets: number };

/** Días de entreno que el plan pone en estas fechas, una vez cada uno y sin descansos. */
export const getPlannedTrainingDays = (
  timeline: DashboardTimeline | null | undefined,
  dateKeys: readonly string[],
): WeekTrainingDay[] => {
  const keys = new Set(dateKeys);
  const days = new Map<string, WeekTrainingDay>();
  (timeline?.planned_days ?? [])
    .filter((day) => keys.has(day.date_key))
    .flatMap((day) => day.sessions)
    .filter((session) => !session.training_day.rest_day)
    .forEach(({ training_day: day }) => {
      if (!days.has(day.id)) {
        days.set(day.id, { id: day.id, name: day.name, totalSets: day.total_sets });
      }
    });
  return Array.from(days.values());
};

/** Suma las series por músculo de varios días y deja primero los músculos con más series. */
export const aggregateMuscleVolume = (
  responses: readonly Pick<MuscleVolumeResponse, 'muscles'>[],
): Pick<MuscleVolumeResponse, 'muscles' | 'total_effective_sets'> => {
  const totals = new Map<string, MuscleVolumeItem>();
  responses.forEach((response) =>
    response.muscles.forEach((muscle) => {
      const previous = totals.get(muscle.muscle_name);
      totals.set(muscle.muscle_name, {
        ...muscle,
        effective_sets: muscle.effective_sets + (previous?.effective_sets ?? 0),
        total_sets: muscle.total_sets + (previous?.total_sets ?? 0),
      });
    }),
  );
  const muscles = Array.from(totals.values())
    .filter((muscle) => muscle.effective_sets > 0)
    .sort(
      (left, right) =>
        right.effective_sets - left.effective_sets || left.display_name.localeCompare(right.display_name, 'es-MX'),
    );
  return {
    muscles,
    total_effective_sets: muscles.reduce((total, muscle) => total + muscle.effective_sets, 0),
  };
};
