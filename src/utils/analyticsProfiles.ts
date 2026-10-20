/**
 * Analytics Profiles - Frontend adapter layer.
 *
 * Provides utilities to interpret the backend's AnalyticsProfile-aware
 * data and drive the UI without hardcoding metric meanings.
 */

import type {
  AnalyticsProfileId,
  AvailableMetric,
  ExerciseDetailMetric,
  ExerciseTrendDetail,
  ExerciseTrendPoint,
  ExerciseTrendSummary,
  WorkoutAnalyticsMetricContext,
} from '../types';
import { formatDurationSeconds } from './formatters';
import { formatCalories, formatDistance } from './workoutAnalytics';

export interface ProfileConfig {
  id: AnalyticsProfileId;
  label: string;
  primaryMetric: ExerciseDetailMetric;
  secondaryMetrics: ExerciseDetailMetric[];
  primaryUnit: string;
  showVolumeBars: boolean;
  showRepRangeBuckets: boolean;
  showEffortComparison: boolean;
  chartType: 'line_with_volume_bars' | 'line_only' | 'bar_chart';
}

const PROFILE_CONFIGS: Record<AnalyticsProfileId, ProfileConfig> = {
  double_progression_hypertrophy: {
    id: 'double_progression_hypertrophy',
    label: 'Doble progresion (hipertrofia)',
    primaryMetric: 'best_weight',
    secondaryMetrics: ['volume', 'best_reps', 'e1rm'],
    primaryUnit: 'kg',
    showVolumeBars: true,
    showRepRangeBuckets: true,
    showEffortComparison: false,
    chartType: 'line_with_volume_bars',
  },
  percentage_1rm_strength: {
    id: 'percentage_1rm_strength',
    label: 'Fuerza (% 1RM)',
    primaryMetric: 'e1rm',
    secondaryMetrics: ['top_set_weight', 'best_reps', 'volume', 'effort'],
    primaryUnit: 'kg',
    showVolumeBars: false,
    showRepRangeBuckets: false,
    showEffortComparison: true,
    chartType: 'line_only',
  },
  rpe_strength: {
    id: 'rpe_strength',
    label: 'Fuerza (RPE/RIR)',
    primaryMetric: 'top_set_weight',
    secondaryMetrics: ['e1rm', 'best_reps', 'effort', 'volume'],
    primaryUnit: 'kg',
    showVolumeBars: false,
    showRepRangeBuckets: false,
    showEffortComparison: true,
    chartType: 'line_only',
  },
  bodyweight_progression: {
    id: 'bodyweight_progression',
    label: 'Peso corporal',
    primaryMetric: 'best_reps',
    secondaryMetrics: ['total_reps', 'volume'],
    primaryUnit: 'reps',
    showVolumeBars: false,
    showRepRangeBuckets: false,
    showEffortComparison: false,
    chartType: 'bar_chart',
  },
  cardio_progression: {
    id: 'cardio_progression',
    label: 'Cardio',
    primaryMetric: 'duration',
    secondaryMetrics: ['calories', 'distance', 'effort'],
    primaryUnit: 'min',
    showVolumeBars: false,
    showRepRangeBuckets: false,
    showEffortComparison: true,
    chartType: 'line_only',
  },
  isometric_hold: {
    id: 'isometric_hold',
    label: 'Isométrico (tiempo)',
    primaryMetric: 'best_hold_seconds',
    secondaryMetrics: ['total_hold_seconds', 'best_weight', 'effort'],
    primaryUnit: 's',
    showVolumeBars: false,
    showRepRangeBuckets: false,
    showEffortComparison: false,
    chartType: 'line_only',
  },
};

const DEFAULT_PROFILE: AnalyticsProfileId = 'double_progression_hypertrophy';

const METRIC_EXTRACTORS: Record<
  ExerciseDetailMetric,
  (point: ExerciseTrendPoint) => number | null | undefined
> = {
  best_weight: (point) => point.best_weight_kg,
  volume: (point) => (point.volume_kg > 0 ? point.volume_kg : null),
  best_reps: (point) => point.best_reps,
  effort: (point) => point.avg_effort,
  e1rm: (point) => point.e1rm_kg,
  top_set_weight: (point) => point.top_set_weight_kg,
  total_reps: (point) => point.total_reps,
  duration: (point) => point.duration_minutes,
  calories: (point) => point.calories_burned,
  distance: (point) => point.distance_meters,
  best_hold_seconds: (point) => point.best_hold_seconds,
  total_hold_seconds: (point) => point.total_hold_seconds,
};

const CONTEXTUAL_METRICS = new Set<ExerciseDetailMetric>([
  'best_weight',
  'best_reps',
  'e1rm',
  'top_set_weight',
]);

const METRIC_LABELS: Record<ExerciseDetailMetric, string> = {
  best_weight: 'Mejor carga',
  volume: 'Volumen',
  best_reps: 'Mejor reps',
  effort: 'Esfuerzo',
  e1rm: '1RM estimado',
  top_set_weight: 'Top set',
  total_reps: 'Total reps',
  duration: 'Duración',
  calories: 'Calorías',
  distance: 'Distancia',
  best_hold_seconds: 'Mejor tiempo',
  total_hold_seconds: 'Tiempo total',
};

const METRIC_CHART_SUBTITLES: Record<ExerciseDetailMetric, string> = {
  best_weight:
    'La línea principal sigue la mejor carga registrada; las barras dejan ver el volumen por rango de reps.',
  volume: 'Volumen total (reps x kg) por sesión a lo largo del tiempo.',
  best_reps: 'Las repeticiones más altas logradas en un set por sesión.',
  effort:
    'Esfuerzo promedio registrado (RIR/RPE) por sesión. Menor valor = más cerca del fallo.',
  e1rm: '1RM estimado (Epley) basado en el top set de cada sesión. Útil como tendencia relativa.',
  top_set_weight: 'Peso del top set (set con mayor carga) por sesión.',
  total_reps: 'Total de repeticiones completadas por sesión.',
  duration: 'Duración total ejecutada por sesión.',
  calories: 'Calorías registradas por sesión.',
  distance: 'Distancia recorrida por sesión.',
  best_hold_seconds: 'El mayor tiempo sostenido en un set por sesión.',
  total_hold_seconds: 'Segundos sostenidos sumando todos los sets de la sesión.',
};

export type MetricContextVariant =
  | 'list_compact'
  | 'summary_compact'
  | 'record_detail'
  | 'chart_weight_meta'
  | 'chart_reps_meta'
  | 'chart_default';

const formatContextWeight = (weightKg: number): string =>
  `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(weightKg)} kg`;

const METRIC_UNITS: Record<ExerciseDetailMetric, string> = {
  best_weight: 'kg',
  volume: 'kg',
  best_reps: 'reps',
  effort: '',
  e1rm: 'kg',
  top_set_weight: 'kg',
  total_reps: 'reps',
  duration: 'min',
  calories: 'cal',
  distance: 'm',
  best_hold_seconds: 's',
  total_hold_seconds: 's',
};

export const getProfileConfig = (
  profileId: AnalyticsProfileId | null | undefined,
): ProfileConfig => PROFILE_CONFIGS[profileId ?? DEFAULT_PROFILE] ?? PROFILE_CONFIGS[DEFAULT_PROFILE];

export const getMetricValue = (
  point: ExerciseTrendPoint,
  metricKey: ExerciseDetailMetric,
): number | null | undefined => {
  const extractor = METRIC_EXTRACTORS[metricKey];
  return extractor ? extractor(point) : null;
};

export const getPointMetricContext = (
  point: ExerciseTrendPoint | null | undefined,
  metricKey: ExerciseDetailMetric,
): WorkoutAnalyticsMetricContext | null => {
  if (!point || !CONTEXTUAL_METRICS.has(metricKey)) {
    return null;
  }

  return point.metric_contexts?.[metricKey] ?? null;
};

export const getSummaryMetricContext = (
  summary: ExerciseTrendSummary | null | undefined,
  kind: 'primary' | 'personal_best' = 'primary',
): WorkoutAnalyticsMetricContext | null => {
  if (!summary) {
    return null;
  }

  return kind === 'personal_best'
    ? summary.personal_best_context ?? null
    : summary.primary_metric_context ?? null;
};

export const formatMetricContext = (
  metricKey: ExerciseDetailMetric,
  context: WorkoutAnalyticsMetricContext | null | undefined,
  options?: { variant?: MetricContextVariant },
): string | null => {
  if (!context?.reps_exact) {
    return null;
  }

  const variant = options?.variant ?? 'chart_default';
  const parts: string[] = [];
  const weightKg = context.weight_kg;
  const hasWeight =
    metricKey === 'best_reps' &&
    typeof weightKg === 'number' &&
    weightKg > 0;

  if (variant === 'record_detail' && metricKey === 'e1rm') {
    return null;
  }

  if (hasWeight) {
    parts.push(formatContextWeight(weightKg));
  }

  if (
    (variant === 'record_detail' || variant === 'chart_reps_meta') &&
    metricKey === 'best_reps'
  ) {
    return parts.length ? parts.join(' · ') : null;
  }

  if (variant === 'chart_weight_meta' && metricKey === 'best_weight') {
    return `${context.reps_exact} reps`;
  }

  parts.push(`${context.reps_exact} reps`);

  const shouldIncludeBucket =
    Boolean(context.rep_bucket_label) &&
    (
      variant === 'list_compact' ||
      variant === 'summary_compact' ||
      (variant === 'chart_default' && metricKey !== 'best_reps')
    );

  if (shouldIncludeBucket && context.rep_bucket_label) {
    parts.push(
      variant === 'list_compact' || variant === 'summary_compact'
        ? context.rep_bucket_label
        : `rango ${context.rep_bucket_label}`,
    );
  }

  return parts.join(' · ');
};

export const getAvailableMetrics = (
  detail: ExerciseTrendDetail | null,
): AvailableMetric[] => {
  if (detail?.available_metrics && detail.available_metrics.length > 0) {
    return detail.available_metrics;
  }

  const profile = getProfileConfig(detail?.analytics_profile);
  return [profile.primaryMetric, ...profile.secondaryMetrics].map((metric) => ({
    key: metric,
    label: getMetricLabel(metric),
    unit: METRIC_UNITS[metric] ?? '',
    available: true,
  }));
};

export const getDefaultMetric = (
  detail: ExerciseTrendDetail | null,
): ExerciseDetailMetric => {
  if (detail?.default_metric) {
    return detail.default_metric;
  }

  const config = getProfileConfig(detail?.analytics_profile);
  return config.primaryMetric;
};

export const getMetricLabel = (metric: ExerciseDetailMetric): string =>
  METRIC_LABELS[metric] ?? metric;

export const getMetricChartSubtitle = (metric: ExerciseDetailMetric): string =>
  METRIC_CHART_SUBTITLES[metric] ?? '';

export const getProfileContextCopy = (
  profileId: AnalyticsProfileId | null | undefined,
): string => {
  const profile = getProfileConfig(profileId);

  if (profile.id === 'percentage_1rm_strength') {
    return 'La progresión prioriza 1RM estimado, top set e intensidad relativa frente al volumen total.';
  }

  if (profile.id === 'rpe_strength') {
    return 'La lectura principal combina top set, esfuerzo real y adherencia a la prescripción.';
  }

  if (profile.id === 'bodyweight_progression') {
    return 'La señal principal es reps y densidad; el peso externo deja de ser la métrica dominante.';
  }

  if (profile.id === 'cardio_progression') {
    return 'La lectura principal sigue duración, calorías y distancia; las métricas de fuerza dejan de aplicar.';
  }

  if (profile.id === 'isometric_hold') {
    return 'La señal principal es el tiempo sostenido por set; las repeticiones no aplican a un isométrico.';
  }

  return 'La lectura principal sigue la mejor carga, pero mantiene el volumen repartido por rangos de reps.';
};

export const getProfilePrimaryMetricLabel = (
  profileId: AnalyticsProfileId | null | undefined,
): string => getMetricLabel(getProfileConfig(profileId).primaryMetric);

export const getPrimaryMetricPersonalBest = (
  detail: ExerciseTrendDetail | null,
): {
  label: string;
  value: number | null;
  unit: string;
  context: WorkoutAnalyticsMetricContext | null;
} => {
  const profile = getProfileConfig(detail?.analytics_profile);
  const metric = profile.primaryMetric;

  if (detail?.summary.personal_best_value != null) {
    return {
      label: detail.summary.personal_best_label ?? getMetricLabel(metric),
      value: detail.summary.personal_best_value,
      unit: detail.summary.personal_best_unit ?? profile.primaryUnit,
      context: null,
    };
  }

  let bestValue: number | null = null;
  let bestContext: WorkoutAnalyticsMetricContext | null = null;

  (detail?.series ?? []).forEach((point) => {
    const value = getMetricValue(point, metric);
    if (value == null || (bestValue != null && value < bestValue)) {
      return;
    }

    bestValue = value;
    bestContext = getPointMetricContext(point, metric);
  });

  return {
    label: getMetricLabel(metric),
    value: bestValue,
    unit: profile.primaryUnit,
    context: bestContext,
  };
};

export const formatMetricValue = (
  value: number | null | undefined,
  unit: string,
): string => {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  if (unit === 'reps') {
    return `${Math.round(value)} reps`;
  }

  if (unit === 's') {
    return formatDurationSeconds(Math.round(value));
  }

  if (unit === 'cal') {
    return formatCalories(value);
  }

  if (unit === 'm') {
    return formatDistance(value);
  }

  const formatted = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
};
