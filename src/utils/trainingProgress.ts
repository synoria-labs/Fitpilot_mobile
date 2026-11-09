import type { MuscleVolumeItem, MuscleVolumeResponse, WorkoutAnalyticsMetricCard } from '../types';
import { formatInteger, formatSigned } from './formatters';

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
    label: formatSigned(value, `${formatInteger(Math.abs(value))}${card.id === 'avg_duration' ? ' min' : '%'}`),
    value,
  };
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
