import type {
  ExerciseDetailMetric,
  ExerciseTrendStatus,
  RepRangeBucket,
  WorkoutAnalyticsColorToken,
  WorkoutAnalyticsRange,
} from '../types';
import { WORKOUT_ANALYTICS_RANGE_OPTIONS } from '../constants/workoutAnalytics';

export type TrendStatusMeta = {
  icon: string;
  color: string;
  label: string;
};

const TREND_STATUS_META: Record<ExerciseTrendStatus, TrendStatusMeta> = {
  rising: { icon: 'trending-up', color: '#22c55e', label: 'Subiendo' },
  stable: { icon: 'remove-outline', color: '#f59e0b', label: 'Estable' },
  declining: { icon: 'trending-down', color: '#ef4444', label: 'Bajando' },
  insufficient: { icon: 'ellipsis-horizontal', color: '#94a3b8', label: 'Pocos datos' },
};

export const getTrendStatusMeta = (status: ExerciseTrendStatus | null | undefined): TrendStatusMeta =>
  TREND_STATUS_META[status ?? 'insufficient'] ?? TREND_STATUS_META.insufficient;

export const EXERCISE_DETAIL_METRIC_OPTIONS: {
  value: ExerciseDetailMetric;
  label: string;
  unit: string;
}[] = [
  { value: 'best_weight', label: 'Mejor carga', unit: 'kg' },
  { value: 'volume', label: 'Volumen', unit: 'kg' },
  { value: 'best_reps', label: 'Mejor reps', unit: 'reps' },
  { value: 'effort', label: 'Esfuerzo', unit: 'RIR/RPE' },
  { value: 'duration', label: 'Duración', unit: 'min' },
  { value: 'calories', label: 'Calorías', unit: 'cal' },
  { value: 'distance', label: 'Distancia', unit: 'm' },
];

export type RepRangeDraft = {
  id: string;
  minReps: string;
  maxReps: string;
  colorToken: WorkoutAnalyticsColorToken;
};

export type ChartCoordinate = {
  x: number;
  y: number;
  value: number;
};

const integerFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export const isWorkoutAnalyticsRange = (value: string | undefined | null): value is WorkoutAnalyticsRange =>
  WORKOUT_ANALYTICS_RANGE_OPTIONS.some((option) => option.value === value);

export const normalizeWorkoutAnalyticsRange = (
  value: string | undefined | null,
  fallback: WorkoutAnalyticsRange = '2w',
): WorkoutAnalyticsRange => (isWorkoutAnalyticsRange(value) ? value : fallback);

export const formatVolumeKg = (value: number) => `${integerFormatter.format(Math.round(value))} kg`;

export const formatCalories = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '-- cal';
  }

  return `${integerFormatter.format(Math.round(value))} cal`;
};

export const formatWeightKg = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '-- kg';
  }

  return `${decimalFormatter.format(value)} kg`;
};

export const formatDistance = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '-- m';
  }

  if (value >= 1000) {
    return `${decimalFormatter.format(value / 1000)} km`;
  }

  return `${decimalFormatter.format(value)} m`;
};

export const formatDeltaKg = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value) || value === 0) {
    return 'Sin cambio';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${decimalFormatter.format(value)} kg`;
};

export const buildRepRangeLabel = (minReps: number, maxReps: number | null) =>
  maxReps == null ? `${minReps}+` : `${minReps}-${maxReps}`;

export const cloneRepRangeDrafts = (repRanges: RepRangeBucket[]): RepRangeDraft[] =>
  repRanges.map((bucket) => ({
    id: bucket.id,
    minReps: `${bucket.min_reps}`,
    maxReps: bucket.max_reps == null ? '' : `${bucket.max_reps}`,
    colorToken: bucket.color_token,
  }));

export const buildRepRangeDraftLabel = (draft: RepRangeDraft) => {
  const minReps = Number.parseInt(draft.minReps, 10);
  const maxReps = draft.maxReps.trim() ? Number.parseInt(draft.maxReps, 10) : null;

  if (Number.isNaN(minReps) || minReps < 1) {
    return 'Rango inválido';
  }

  if (maxReps != null && (Number.isNaN(maxReps) || maxReps < minReps)) {
    return 'Rango inválido';
  }

  return buildRepRangeLabel(minReps, maxReps);
};

export const validateRepRangeDrafts = (drafts: RepRangeDraft[]): string | null => {
  if (drafts.length < 2 || drafts.length > 6) {
    return 'Debes tener entre 2 y 6 rangos.';
  }

  let expectedMin = 1;

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const minReps = Number.parseInt(draft.minReps, 10);
    const maxReps = draft.maxReps.trim() ? Number.parseInt(draft.maxReps, 10) : null;
    const isLast = index === drafts.length - 1;

    if (Number.isNaN(minReps) || minReps < 1) {
      return 'Todos los rangos deben iniciar en 1 o mas.';
    }

    if (minReps !== expectedMin) {
      return 'Los rangos deben ser contiguos, ordenados y sin huecos.';
    }

    if (!isLast && maxReps == null) {
      return 'Solo el último rango puede quedar abierto.';
    }

    if (maxReps != null && (Number.isNaN(maxReps) || maxReps < minReps)) {
      return 'Cada rango debe terminar en un valor mayor o igual al inicio.';
    }

    if (maxReps != null) {
      expectedMin = maxReps + 1;
    }
  }

  return null;
};

export const draftsToRepRanges = (drafts: RepRangeDraft[]): RepRangeBucket[] =>
  drafts.map((draft, index) => {
    const minReps = Number.parseInt(draft.minReps, 10);
    const maxReps = draft.maxReps.trim() ? Number.parseInt(draft.maxReps, 10) : null;

    return {
      id: draft.id || `range_${index + 1}`,
      label: buildRepRangeLabel(minReps, maxReps),
      min_reps: minReps,
      max_reps: maxReps,
      color_token: draft.colorToken,
    };
  });

export const buildNextRepRangeDraft = (drafts: RepRangeDraft[]): RepRangeDraft[] => {
  const nextDrafts = drafts.map((draft) => ({ ...draft }));
  const lastDraft = nextDrafts[nextDrafts.length - 1];

  if (!lastDraft) {
    return nextDrafts;
  }

  const lastMin = Number.parseInt(lastDraft.minReps, 10) || 1;
  const lastMax = lastDraft.maxReps.trim() ? Number.parseInt(lastDraft.maxReps, 10) : null;
  const normalizedLastMax = lastMax ?? lastMin + 2;
  const nextMin = normalizedLastMax + 1;
  lastDraft.maxReps = `${normalizedLastMax}`;

  nextDrafts.push({
    id: `range_${nextDrafts.length + 1}`,
    minReps: `${nextMin}`,
    maxReps: '',
    colorToken: (['navy', 'sky', 'emerald', 'amber', 'rose', 'violet'] as WorkoutAnalyticsColorToken[])[
      nextDrafts.length % 6
    ],
  });

  return nextDrafts;
};

export const buildLineCoordinates = (
  values: number[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  domain?: { min: number; max: number },
): ChartCoordinate[] => {
  if (!values.length) {
    return [];
  }

  const usableWidth = Math.max(width - padding.left - padding.right, 1);
  const usableHeight = Math.max(height - padding.top - padding.bottom, 1);
  const maxValue = domain?.max ?? Math.max(...values);
  const minValue = domain?.min ?? Math.min(...values);
  const valueRange = maxValue === minValue ? Math.max(maxValue, 1) : maxValue - minValue;

  return values.map((value, index) => {
    const x =
      values.length === 1
        ? padding.left + usableWidth / 2
        : padding.left + (index / Math.max(values.length - 1, 1)) * usableWidth;
    const normalizedY =
      maxValue === minValue ? 0.5 : (value - minValue) / Math.max(valueRange, 1);
    const y = padding.top + usableHeight - normalizedY * usableHeight;

    return { x, y, value };
  });
};

export const buildPolylinePoints = (points: ChartCoordinate[]) =>
  points.map((point) => `${point.x},${point.y}`).join(' ');
