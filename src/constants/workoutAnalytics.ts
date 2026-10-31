import type { WorkoutAnalyticsRange } from '../types';

export const DEFAULT_WORKOUT_ANALYTICS_RANGE: WorkoutAnalyticsRange = '2w';

export const WORKOUT_ANALYTICS_RANGE_OPTIONS: {
  value: WorkoutAnalyticsRange;
  label: string;
  /** El periodo completo, para botones y hojas de opciones. */
  longLabel: string;
  /** Largo en semanas; «Todo» no tiene. */
  weeks: number | null;
}[] = [
  { value: '2w', label: '2 sem', longLabel: 'Últimas 2 semanas', weeks: 2 },
  { value: '4w', label: '4 sem', longLabel: 'Últimas 4 semanas', weeks: 4 },
  { value: '8w', label: '8 sem', longLabel: 'Últimas 8 semanas', weeks: 8 },
  { value: '12w', label: '12 sem', longLabel: 'Últimas 12 semanas', weeks: 12 },
  { value: 'all', label: 'Todo', longLabel: 'Todo el historial', weeks: null },
];
