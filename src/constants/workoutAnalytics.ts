import type { WorkoutAnalyticsRange } from '../types';

export const DEFAULT_WORKOUT_ANALYTICS_RANGE: WorkoutAnalyticsRange = '2w';

export const WORKOUT_ANALYTICS_RANGE_OPTIONS: {
  value: WorkoutAnalyticsRange;
  label: string;
}[] = [
  { value: '2w', label: '2 sem' },
  { value: '4w', label: '4 sem' },
  { value: '8w', label: '8 sem' },
  { value: '12w', label: '12 sem' },
  { value: 'all', label: 'Todo' },
];
