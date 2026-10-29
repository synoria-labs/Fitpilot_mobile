import type {
  ConnectedHealthConnection,
  ConnectedHealthDailySummary,
  ConnectedHealthSummaryResponse,
} from '../services/connectedHealth';
import type {
  ConnectedHealthConnectionState,
  ConnectedHealthFeedbackModel,
  ConnectedHealthFeedbackRange,
  ConnectedHealthHistoryModel,
  ConnectedHealthHistorySeries,
  ConnectedHealthHistoryValueFormat,
  ConnectedHealthInsight,
  ConnectedHealthInsightTone,
  ConnectedHealthMetricCard,
  ConnectedHealthReadinessStatus,
  ConnectedHealthStateCopy,
} from '../types/connectedHealthFeedback';
import {
  addDaysToDateKey,
  getCalendarDayDiff,
  toLocalDateKey,
} from './date';

const STALE_SYNC_THRESHOLD_MS = 6 * 60 * 60 * 1000;

const numberFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
});

const isPresent = (value: number | null | undefined) =>
  value !== null && value !== undefined;

const hasMetricValue = (summary: ConnectedHealthDailySummary) =>
  [
    summary.active_energy_kcal,
    summary.basal_energy_kcal,
    summary.total_energy_kcal,
    summary.steps,
    summary.distance_m,
    summary.exercise_minutes,
    summary.sleep_minutes,
    summary.resting_hr_bpm,
    summary.avg_hr_bpm,
    summary.hrv_ms,
    summary.recovery_score,
  ].some(isPresent);

// Igual que hasMetricValue pero SIN la energía basal ni la total. Health Connect deriva
// ambas del perfil del usuario aunque no haya ninguna app fuente escribiendo datos, así
// que un día "con datos" puede no tener ni una sola medición real detrás. Esto es lo que
// separa "Health Connect vacío" de "Health Connect funcionando".
const hasRealMetricValue = (summary: ConnectedHealthDailySummary) =>
  [
    summary.active_energy_kcal,
    summary.steps,
    summary.distance_m,
    summary.exercise_minutes,
    summary.sleep_minutes,
    summary.resting_hr_bpm,
    summary.avg_hr_bpm,
    summary.hrv_ms,
  ].some(isPresent);

// Señales sobre las que se puede estimar recuperación. Sin ninguna, no hay score que dar:
// el backend devuelve null y marca 'insufficient_signals'. El respaldo por campos cubre los
// días guardados antes de ese cambio, que conservan un 100 fabricado.
const hasRecoverySignal = (summary: ConnectedHealthDailySummary) =>
  [
    summary.sleep_minutes,
    summary.resting_hr_bpm,
    summary.hrv_ms,
    summary.active_energy_kcal,
  ].some(isPresent);

const isSyntheticEnergyOnly = (summary: ConnectedHealthDailySummary | null) =>
  summary != null &&
  (summary.flags?.includes('synthetic_basal_energy') === true ||
    (isPresent(summary.basal_energy_kcal) &&
      !isPresent(summary.active_energy_kcal) &&
      !isPresent(summary.steps) &&
      !isPresent(summary.distance_m)));

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = value.includes('T')
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sortSummariesDesc = (summaries: ConnectedHealthDailySummary[]) =>
  [...summaries].sort((left, right) => {
    const leftTime = parseDate(left.date)?.getTime() ?? 0;
    const rightTime = parseDate(right.date)?.getTime() ?? 0;
    return rightTime - leftTime;
  });

const average = (
  summaries: ConnectedHealthDailySummary[],
  selector: (summary: ConnectedHealthDailySummary) => number | null | undefined,
) => {
  const values = summaries
    .map(selector)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
};

const formatKcal = (value: number | null | undefined) =>
  value == null ? '--' : `${numberFormatter.format(Math.round(value))} kcal`;

const formatCount = (value: number | null | undefined) =>
  value == null ? '--' : numberFormatter.format(Math.round(value));

const formatDuration = (minutes: number | null | undefined) => {
  if (minutes == null) {
    return '--';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours <= 0) {
    return `${remainingMinutes} min`;
  }

  return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
};

const formatDistance = (meters: number | null | undefined) => {
  if (meters == null) {
    return '--';
  }

  if (meters >= 1000) {
    return `${decimalFormatter.format(meters / 1000)} km`;
  }

  return `${numberFormatter.format(Math.round(meters))} m`;
};

const formatBpm = (value: number | null | undefined) =>
  value == null ? '--' : `${numberFormatter.format(Math.round(value))} bpm`;

const formatMs = (value: number | null | undefined) =>
  value == null ? '--' : `${numberFormatter.format(Math.round(value))} ms`;

const formatScore = (value: number | null | undefined) =>
  value == null ? '--' : `${numberFormatter.format(Math.round(value))}/100`;

export const formatConnectedHealthHistoryValue = (
  format: ConnectedHealthHistoryValueFormat,
  value: number | null | undefined,
) => {
  switch (format) {
    case 'score':
      return formatScore(value);
    case 'duration':
      return formatDuration(value);
    case 'kcal':
      return formatKcal(value);
    case 'count':
      return formatCount(value);
    case 'distance':
      return formatDistance(value);
    case 'milliseconds':
      return formatMs(value);
    case 'bpm':
      return formatBpm(value);
    default:
      return '--';
  }
};

export const formatConnectedHealthHistoryChange = (
  format: ConnectedHealthHistoryValueFormat,
  value: number | null,
) => {
  if (value == null) {
    return 'Sin comparativo';
  }

  if (Math.abs(value) < 0.005) {
    return 'Sin cambio';
  }

  const prefix = value > 0 ? '+' : '-';
  const absoluteValue = Math.abs(value);
  if (format === 'score') {
    return `${prefix}${numberFormatter.format(Math.round(absoluteValue))} pts`;
  }

  return `${prefix}${formatConnectedHealthHistoryValue(format, absoluteValue)}`;
};

const formatAverageHelper = (
  label: string,
  value: number | null,
  formatter: (value: number | null | undefined) => string,
) => (value == null ? 'Promedio sin dato' : `${label}: ${formatter(value)}`);

const formatTrend = (
  latest: number | null | undefined,
  baseline: number | null,
  formatter: (value: number | null | undefined) => string,
) => {
  if (latest == null || baseline == null || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }

  const difference = latest - baseline;
  const absDifference = Math.abs(difference);

  if (absDifference < Math.max(1, Math.abs(baseline) * 0.03)) {
    return 'Estable vs prom.';
  }

  return `${difference > 0 ? '+' : '-'}${formatter(absDifference)} vs prom.`;
};

const getConnection = (summary: ConnectedHealthSummaryResponse | null) =>
  summary?.connections?.[0] ?? null;

const getPlatformLabel = (connection: ConnectedHealthConnection | null) => {
  if (connection?.platform === 'healthkit') {
    return 'Apple Health';
  }

  if (connection?.platform === 'health_connect') {
    return 'Health Connect';
  }

  return 'Salud conectada';
};

const getLatestSyncAt = (summary: ConnectedHealthSummaryResponse | null) => {
  const connection = getConnection(summary);
  const connectionLastSyncAt = connection?.last_sync_at ?? null;
  const latestCompletedAt =
    summary?.latest_sync?.status === 'completed'
      ? summary.latest_sync.completed_at
      : null;
  const connectionSyncDate = parseDate(connectionLastSyncAt);
  const latestSyncDate = parseDate(latestCompletedAt);

  if (!connectionSyncDate) {
    return latestSyncDate ? latestCompletedAt : null;
  }

  if (!latestSyncDate) {
    return connectionLastSyncAt;
  }

  return latestSyncDate.getTime() > connectionSyncDate.getTime()
    ? latestCompletedAt
    : connectionLastSyncAt;
};

const getFreshness = (latestSyncAt: string | null, nowMs = Date.now()) => {
  const parsed = parseDate(latestSyncAt);

  if (!parsed) {
    return {
      label: 'Sin sincronizar',
      isStale: true,
    };
  }

  const diffMs = Math.max(0, nowMs - parsed.getTime());

  if (diffMs <= 60_000) {
    return {
      label: 'Actualizado ahora',
      isStale: false,
    };
  }

  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return {
      label: `Hace ${minutes} min`,
      isStale: false,
    };
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return {
      label: `Hace ${hours} h`,
      isStale: diffMs >= STALE_SYNC_THRESHOLD_MS,
    };
  }

  return {
    label: dateFormatter.format(parsed).replace('.', ''),
    isStale: true,
  };
};

const getLatestDateLabel = (summary: ConnectedHealthDailySummary | null) => {
  const parsed = parseDate(summary?.date);
  return parsed ? dateFormatter.format(parsed).replace('.', '') : 'Sin fecha';
};

const getToneFromStatus = (
  status: ConnectedHealthReadinessStatus,
): ConnectedHealthInsightTone => {
  if (status === 'good') {
    return 'positive';
  }

  if (status === 'low' || status === 'watch') {
    return 'warning';
  }

  return 'neutral';
};

const buildReadiness = (
  latest: ConnectedHealthDailySummary | null,
  summaries: ConnectedHealthDailySummary[],
) => {
  if (!latest || !hasMetricValue(latest)) {
    return {
      status: 'unknown' as ConnectedHealthReadinessStatus,
      score: null,
      title: 'Sin lectura reciente',
      message: 'Conecta o sincroniza tus datos para estimar energía y recuperación.',
    };
  }

  // Sin sueño, FC en reposo, HRV ni kcal activas no hay nada sobre lo que estimar. Antes
  // se caía al heurístico, que parte de 64 y solo ajusta cuando hay datos: el resultado
  // era un score inventado presentado como si fuera una medición.
  if (!hasRecoverySignal(latest)) {
    return {
      status: 'unknown' as ConnectedHealthReadinessStatus,
      score: null,
      title: 'Sin señales suficientes',
      message:
        'Faltan sueño, frecuencia cardíaca o HRV para estimar tu recuperación. Conecta un reloj o una app de actividad.',
    };
  }

  const recoveryScore = latest.recovery_score;
  let score = recoveryScore ?? null;

  if (score == null) {
    score = 64;

    const sleepAvg = average(summaries, (summary) => summary.sleep_minutes);
    const activeEnergyAvg = average(summaries, (summary) => summary.active_energy_kcal);
    const restingHrAvg = average(summaries, (summary) => summary.resting_hr_bpm);
    const hrvAvg = average(summaries, (summary) => summary.hrv_ms);

    if (latest.sleep_minutes != null) {
      if (latest.sleep_minutes >= 420) {
        score += 14;
      } else if (latest.sleep_minutes < 360) {
        score -= 18;
      }
    } else if (sleepAvg == null) {
      score -= 8;
    }

    if (
      latest.active_energy_kcal != null &&
      activeEnergyAvg != null &&
      latest.active_energy_kcal > activeEnergyAvg * 1.35
    ) {
      score -= 8;
    }

    if (
      latest.resting_hr_bpm != null &&
      restingHrAvg != null &&
      latest.resting_hr_bpm > restingHrAvg + 8
    ) {
      score -= 10;
    }

    if (latest.hrv_ms != null && hrvAvg != null && latest.hrv_ms < hrvAvg * 0.85) {
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));
  }

  if (score >= 75) {
    return {
      status: 'good' as ConnectedHealthReadinessStatus,
      score,
      title: 'Buena preparación',
      message: 'Tus señales recientes favorecen un día productivo de entrenamiento.',
    };
  }

  if (score >= 55) {
    return {
      status: 'watch' as ConnectedHealthReadinessStatus,
      score,
      title: 'Preparación moderada',
      message: 'Cuida intensidad, hidratación y descanso entre bloques exigentes.',
    };
  }

  return {
    status: 'low' as ConnectedHealthReadinessStatus,
    score,
    title: 'Recuperación limitada',
    message: 'Prioriza recuperación y ajusta cargas si te sientes fatigado.',
  };
};

const buildInsights = (
  latest: ConnectedHealthDailySummary | null,
  summaries: ConnectedHealthDailySummary[],
  sourceLabel: string,
): ConnectedHealthInsight[] => {
  if (!latest || !hasMetricValue(latest)) {
    return [];
  }

  const insights: ConnectedHealthInsight[] = [];
  const sleepAvg = average(summaries, (summary) => summary.sleep_minutes);
  const activeEnergyAvg = average(summaries, (summary) => summary.active_energy_kcal);
  const stepsAvg = average(summaries, (summary) => summary.steps);
  const hrvAvg = average(summaries, (summary) => summary.hrv_ms);
  const restingHrAvg = average(summaries, (summary) => summary.resting_hr_bpm);

  if (latest.sleep_minutes != null && latest.sleep_minutes < 360) {
    insights.push({
      id: 'sleep-short',
      title: 'Sueño corto',
      message: 'Conviene bajar fricción hoy: calentamiento gradual y pausas completas.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['sleep_minutes'],
    });
  } else if (sleepAvg != null && sleepAvg >= 420) {
    insights.push({
      id: 'sleep-consistent',
      title: 'Descanso consistente',
      message: 'Mantener este promedio ayuda a sostener energía y adherencia.',
      tone: 'positive',
      source: sourceLabel,
      metricKeys: ['sleep_minutes'],
    });
  }

  if (
    latest.active_energy_kcal != null &&
    activeEnergyAvg != null &&
    latest.active_energy_kcal > activeEnergyAvg * 1.3
  ) {
    insights.push({
      id: 'energy-high',
      title: 'Gasto elevado',
      message: 'Tu gasto activo viene alto; revisa hambre, hidratación y recuperación.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['active_energy_kcal'],
    });
  }

  if (latest.steps != null && latest.steps < 4000 && (stepsAvg == null || stepsAvg < 6000)) {
    insights.push({
      id: 'steps-low',
      title: 'Movimiento bajo',
      message: 'Un bloque ligero de caminata puede sumar energía sin interferir con tu plan.',
      tone: 'neutral',
      source: sourceLabel,
      metricKeys: ['steps'],
    });
  }

  if (latest.hrv_ms != null && hrvAvg != null && latest.hrv_ms < hrvAvg * 0.85) {
    insights.push({
      id: 'hrv-low',
      title: 'HRV por debajo de tu promedio',
      message: 'Úsalo como señal de contexto para moderar volumen si notas fatiga.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['hrv_ms'],
    });
  }

  if (
    latest.resting_hr_bpm != null &&
    restingHrAvg != null &&
    latest.resting_hr_bpm > restingHrAvg + 8
  ) {
    insights.push({
      id: 'resting-hr-high',
      title: 'FC reposo más alta',
      message: 'Observa cómo te sientes antes de forzar intensidad o cardio extra.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['resting_hr_bpm'],
    });
  }

  if (!insights.length) {
    insights.push({
      id: 'steady-context',
      title: 'Señales estables',
      message: 'No hay alertas fuertes en los datos recientes disponibles.',
      tone: 'positive',
      source: sourceLabel,
      metricKeys: [],
    });
  }

  return insights.slice(0, 4);
};

const buildMetrics = (
  latest: ConnectedHealthDailySummary | null,
  summaries: ConnectedHealthDailySummary[],
  range: ConnectedHealthFeedbackRange,
  readinessTone: ConnectedHealthInsightTone,
): ConnectedHealthMetricCard[] => {
  const avgLabel = `Prom. ${range}d`;
  const sleepAvg = average(summaries, (summary) => summary.sleep_minutes);
  const activeEnergyAvg = average(summaries, (summary) => summary.active_energy_kcal);
  const totalEnergyAvg = average(summaries, (summary) => summary.total_energy_kcal);
  const stepsAvg = average(summaries, (summary) => summary.steps);
  const distanceAvg = average(summaries, (summary) => summary.distance_m);
  const hrvAvg = average(summaries, (summary) => summary.hrv_ms);
  const restingHrAvg = average(summaries, (summary) => summary.resting_hr_bpm);

  // En Android (Health Connect) casi nunca hay "kcal activas"; usamos "kcal
  // totales" como respaldo para no mostrar la tarjeta de energía vacía.
  const energyFromActive = latest?.active_energy_kcal != null;
  const energyValue = latest?.active_energy_kcal ?? latest?.total_energy_kcal ?? null;
  const energyAvg = energyFromActive ? activeEnergyAvg : totalEnergyAvg;
  // ...pero si ese total es solo el basal que Health Connect deriva del perfil, no es
  // gasto medido y la tarjeta no debe presentarlo como tal.
  const energyIsSynthetic = !energyFromActive && isSyntheticEnergyOnly(latest);
  const energyLabel = energyIsSynthetic
    ? 'Gasto basal estimado'
    : energyFromActive
      ? 'Kcal activas'
      : 'Kcal totales';

  const metrics: ConnectedHealthMetricCard[] = [
    {
      key: 'recovery',
      label: 'Recuperación',
      value: formatScore(latest?.recovery_score),
      helper:
        latest?.recovery_score != null
          ? 'Score conectado'
          : latest && hasRecoverySignal(latest)
            ? 'Estimación por señales'
            : 'Sin señales suficientes',
      trendLabel: null,
      icon: 'pulse-outline',
      tone: readinessTone,
    },
    {
      key: 'sleep',
      label: 'Sueño',
      value: formatDuration(latest?.sleep_minutes),
      helper: formatAverageHelper(avgLabel, sleepAvg, formatDuration),
      trendLabel: formatTrend(latest?.sleep_minutes, sleepAvg, formatDuration),
      icon: 'moon-outline',
      tone: latest?.sleep_minutes != null && latest.sleep_minutes < 360 ? 'warning' : 'neutral',
    },
    {
      key: 'active_energy',
      label: energyLabel,
      value: formatKcal(energyValue),
      helper: energyIsSynthetic
        ? 'Estimado por Health Connect, no medido'
        : formatAverageHelper(avgLabel, energyAvg, formatKcal),
      trendLabel: formatTrend(energyValue, energyAvg, formatKcal),
      icon: 'flame-outline',
      tone: 'neutral',
    },
    {
      key: 'total_energy',
      label: 'Kcal totales',
      value: formatKcal(latest?.total_energy_kcal),
      helper: formatAverageHelper(avgLabel, totalEnergyAvg, formatKcal),
      trendLabel: formatTrend(latest?.total_energy_kcal, totalEnergyAvg, formatKcal),
      icon: 'speedometer-outline',
      tone: 'neutral',
    },
    {
      key: 'steps',
      label: 'Pasos',
      value: formatCount(latest?.steps),
      helper: formatAverageHelper(avgLabel, stepsAvg, formatCount),
      trendLabel: formatTrend(latest?.steps, stepsAvg, formatCount),
      icon: 'walk-outline',
      tone: latest?.steps != null && latest.steps < 4000 ? 'warning' : 'neutral',
    },
    {
      key: 'distance',
      label: 'Distancia',
      value: formatDistance(latest?.distance_m),
      helper: formatAverageHelper(avgLabel, distanceAvg, formatDistance),
      trendLabel: formatTrend(latest?.distance_m, distanceAvg, formatDistance),
      icon: 'map-outline',
      tone: 'neutral',
    },
    {
      key: 'hrv',
      label: 'HRV',
      value: formatMs(latest?.hrv_ms),
      helper: formatAverageHelper(avgLabel, hrvAvg, formatMs),
      trendLabel: formatTrend(latest?.hrv_ms, hrvAvg, formatMs),
      icon: 'analytics-outline',
      tone: latest?.hrv_ms != null && hrvAvg != null && latest.hrv_ms < hrvAvg * 0.85
        ? 'warning'
        : 'neutral',
    },
    {
      key: 'resting_hr',
      label: 'FC reposo',
      value: formatBpm(latest?.resting_hr_bpm),
      helper: formatAverageHelper(avgLabel, restingHrAvg, formatBpm),
      trendLabel: formatTrend(latest?.resting_hr_bpm, restingHrAvg, formatBpm),
      icon: 'heart-outline',
      tone:
        latest?.resting_hr_bpm != null &&
        restingHrAvg != null &&
        latest.resting_hr_bpm > restingHrAvg + 8
          ? 'warning'
          : 'neutral',
    },
  ];

  // Evita duplicar "Kcal totales" cuando la tarjeta de energía ya usa ese valor.
  return energyFromActive ? metrics : metrics.filter((metric) => metric.key !== 'total_energy');
};

type ConnectedHealthHistoryMetricDefinition = Pick<
  ConnectedHealthHistorySeries,
  'key' | 'label' | 'icon' | 'chartKind' | 'valueFormat'
> & {
  select: (summary: ConnectedHealthDailySummary) => number | null;
};

const CONNECTED_HEALTH_HISTORY_METRICS: ConnectedHealthHistoryMetricDefinition[] = [
  {
    key: 'recovery',
    label: 'Recuperación',
    icon: 'pulse-outline',
    chartKind: 'line',
    valueFormat: 'score',
    select: (summary) => summary.recovery_score,
  },
  {
    key: 'sleep',
    label: 'Sueño',
    icon: 'moon-outline',
    chartKind: 'bar',
    valueFormat: 'duration',
    select: (summary) => summary.sleep_minutes,
  },
  {
    key: 'active_energy',
    label: 'Kcal activas',
    icon: 'flame-outline',
    chartKind: 'bar',
    valueFormat: 'kcal',
    select: (summary) => summary.active_energy_kcal,
  },
  {
    key: 'total_energy',
    label: 'Kcal totales',
    icon: 'speedometer-outline',
    chartKind: 'bar',
    valueFormat: 'kcal',
    select: (summary) => summary.total_energy_kcal,
  },
  {
    key: 'steps',
    label: 'Pasos',
    icon: 'walk-outline',
    chartKind: 'bar',
    valueFormat: 'count',
    select: (summary) => summary.steps,
  },
  {
    key: 'distance',
    label: 'Distancia',
    icon: 'map-outline',
    chartKind: 'bar',
    valueFormat: 'distance',
    select: (summary) => summary.distance_m,
  },
  {
    key: 'hrv',
    label: 'HRV',
    icon: 'analytics-outline',
    chartKind: 'line',
    valueFormat: 'milliseconds',
    select: (summary) => summary.hrv_ms,
  },
  {
    key: 'resting_hr',
    label: 'FC reposo',
    icon: 'heart-outline',
    chartKind: 'line',
    valueFormat: 'bpm',
    select: (summary) => summary.resting_hr_bpm,
  },
];

const getHistoryDateKeys = (
  summary: ConnectedHealthSummaryResponse,
  range: ConnectedHealthFeedbackRange,
) => {
  const startDate = toLocalDateKey(summary.range.start_date);
  const endDate = toLocalDateKey(summary.range.end_date);

  if (startDate && endDate) {
    const dayCount = getCalendarDayDiff(startDate, endDate) + 1;
    if (dayCount > 0 && dayCount <= 366) {
      return Array.from({ length: dayCount }, (_, index) =>
        addDaysToDateKey(startDate, index),
      )
        .filter((date): date is string => Boolean(date))
        .slice(-range);
    }
  }

  return Array.from(
    new Set(
      summary.summaries
        .map((dailySummary) => toLocalDateKey(dailySummary.date))
        .filter((date): date is string => Boolean(date)),
    ),
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(-range);
};

export const buildConnectedHealthHistory = (
  summary: ConnectedHealthSummaryResponse | null,
  range: ConnectedHealthFeedbackRange,
): ConnectedHealthHistoryModel => {
  if (!summary) {
    return { range, series: [] };
  }

  const dateKeys = getHistoryDateKeys(summary, range);
  const summariesByDate = new Map<string, ConnectedHealthDailySummary>();
  summary.summaries.forEach((dailySummary) => {
    const dateKey = toLocalDateKey(dailySummary.date);
    if (dateKey) {
      summariesByDate.set(dateKey, dailySummary);
    }
  });

  const series = CONNECTED_HEALTH_HISTORY_METRICS.flatMap((metric) => {
    const points = dateKeys.map((date) => {
      const dailySummary = summariesByDate.get(date);
      const rawValue = dailySummary ? metric.select(dailySummary) : null;
      const value = rawValue != null && Number.isFinite(rawValue) ? rawValue : null;
      return { date, value };
    });
    const values = points.filter(
      (point): point is { date: string; value: number } => point.value != null,
    );

    if (values.length === 0) {
      return [];
    }

    const latest = values[values.length - 1] ?? null;
    const first = values[0] ?? null;
    const averageValue = values.reduce((total, point) => total + point.value, 0) / values.length;

    return [{
      ...metric,
      points,
      latest,
      average: averageValue,
      change: first && latest && values.length > 1 ? latest.value - first.value : null,
    }];
  });

  return { range, series };
};

export const buildConnectedHealthFeedback = (
  summary: ConnectedHealthSummaryResponse | null,
  range: ConnectedHealthFeedbackRange,
  nowMs = Date.now(),
): ConnectedHealthFeedbackModel => {
  const connection = getConnection(summary);
  const sourceLabel = getPlatformLabel(connection);
  const todayKey = toLocalDateKey(new Date(nowMs));
  const summaries = sortSummariesDesc(summary?.summaries ?? [])
    // Un día posterior al de hoy en este teléfono solo puede venir de otro dispositivo en otra
    // zona horaria (o de un reloj mal puesto): no se presenta como el día más reciente.
    .filter((day) => !todayKey || (toLocalDateKey(day.date) ?? day.date) <= todayKey)
    .filter(hasMetricValue)
    .slice(0, range);
  const latest = summaries[0] ?? null;
  const latestSyncAt = getLatestSyncAt(summary);
  const freshness = getFreshness(latestSyncAt, nowMs);
  const readiness = buildReadiness(latest, summaries);
  const readinessTone = getToneFromStatus(readiness.status);

  return {
    range,
    hasData: summaries.length > 0,
    hasRealData: summaries.some(hasRealMetricValue),
    sourceLabel,
    latestSyncAt,
    freshnessLabel: freshness.label,
    isStale: freshness.isStale,
    latestDateLabel: getLatestDateLabel(latest),
    readiness,
    metrics: buildMetrics(latest, summaries, range, readinessTone),
    insights: buildInsights(latest, summaries, sourceLabel),
    // El backend guarda el motivo del fallo pero hasta ahora nadie lo pintaba: el usuario
    // veía "Sin sincronizar" sin explicación, porque getLatestSyncAt ignora los runs
    // fallidos.
    lastSyncErrorMessage:
      summary?.latest_sync?.status === 'failed'
        ? (summary.latest_sync.error_message ?? null)
        : null,
  };
};

/**
 * Qué contar al usuario en cada estado, y con qué botón sacarle de ahí.
 *
 * El caso que más confundía a los testers es `no_source_data`: la plataforma de salud
 * instalada, los permisos concedidos y aun así ningún dato, porque no hay ninguna app
 * fuente escribiendo en ella. La app mostraba "Sincroniza para ver sueño, kcal, pasos" y
 * un botón que repetía el mismo sync vacío indefinidamente.
 */
export const getConnectedHealthStateCopy = (
  state: ConnectedHealthConnectionState,
  platformLabel = "Health Connect",
): ConnectedHealthStateCopy => {
  switch (state) {
    case "no_permissions":
      return {
        title: "Falta conceder permisos",
        message: `FitPilot no tiene permisos de ${platformLabel}. Concédelos para ver pasos, sueño, kcal y recuperación.`,
        compactMessage: "Concede permisos para ver tus métricas.",
        action: "permissions",
      };
    case "partial_permissions":
      return {
        title: "Permisos incompletos",
        message: `Faltan permisos en ${platformLabel}. Actívalos para completar tu recuperación.`,
        compactMessage: "Faltan permisos por activar.",
        action: "permissions",
      };
    case "no_source_data":
      return {
        title: `${platformLabel} está vacío`,
        message: `FitPilot ya tiene permisos, pero ${platformLabel} no tiene datos de ningún dispositivo ni app. Conecta ahí tu reloj o tu app de actividad (Samsung Health, Fitbit, Garmin, Zepp, Google Fit) y vuelve a sincronizar.`,
        compactMessage: `${platformLabel} no tiene datos de ningún dispositivo.`,
        action: "settings",
      };
    case "needs_update":
      return {
        title: `${platformLabel} está desactualizado`,
        message: `Actualiza ${platformLabel} desde Play Store para que FitPilot pueda leer tus métricas.`,
        compactMessage: `Actualiza ${platformLabel} para continuar.`,
        action: "settings",
      };
    case "needs_install":
      return {
        title: `Falta instalar ${platformLabel}`,
        message: `Instala ${platformLabel} desde Play Store para activar tus métricas.`,
        compactMessage: `Instala ${platformLabel} para activar tus métricas.`,
        action: "settings",
      };
    case "unavailable":
      return {
        title: `${platformLabel} no está activo`,
        message: `Actívalo en los ajustes del dispositivo para que FitPilot pueda leer tus métricas.`,
        compactMessage: `${platformLabel} no está activo.`,
        action: "settings",
      };
    case "ok":
    default:
      return {
        title: "Sin datos recientes",
        message: "Sincroniza salud conectada para ver sueño, kcal, pasos y recuperación.",
        compactMessage: "Sincroniza sueño, kcal, pasos y recuperación.",
        action: "sync",
      };
  }
};

export const shouldAutoSyncConnectedHealth = (
  summary: ConnectedHealthSummaryResponse | null,
  nowMs = Date.now(),
) => {
  const hasData = (summary?.summaries ?? []).some(hasMetricValue);
  const latestSyncAt = getLatestSyncAt(summary);

  if (!hasData || !latestSyncAt) {
    return true;
  }

  return getFreshness(latestSyncAt, nowMs).isStale;
};

// Igual que shouldAutoSyncConnectedHealth pero con un umbral de antigüedad
// configurable (en ms), para permitir re-sincronizar el dispositivo al enfocar
// la pantalla mucho antes del umbral de 6 h.
export const isConnectedHealthSyncOlderThan = (
  summary: ConnectedHealthSummaryResponse | null,
  maxAgeMs: number,
  nowMs = Date.now(),
): boolean => {
  const hasData = (summary?.summaries ?? []).some(hasMetricValue);
  const latestSyncAt = getLatestSyncAt(summary);

  if (!hasData || !latestSyncAt) {
    return true;
  }

  const parsedMs = Date.parse(latestSyncAt);
  if (Number.isNaN(parsedMs)) {
    return true;
  }

  return nowMs - parsedMs >= maxAgeMs;
};

export const CONNECTED_HEALTH_AUTO_SYNC_STALE_MS = STALE_SYNC_THRESHOLD_MS;
