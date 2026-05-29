import type {
  ConnectedHealthConnection,
  ConnectedHealthDailySummary,
  ConnectedHealthSummaryResponse,
} from '../services/connectedHealth';
import type {
  ConnectedHealthFeedbackModel,
  ConnectedHealthFeedbackRange,
  ConnectedHealthInsight,
  ConnectedHealthInsightTone,
  ConnectedHealthMetricCard,
  ConnectedHealthReadinessStatus,
} from '../types/connectedHealthFeedback';

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
  ].some((value) => value !== null && value !== undefined);

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
      message: 'Conecta o sincroniza tus datos para estimar energia y recuperacion.',
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
      title: 'Buena preparacion',
      message: 'Tus senales recientes favorecen un dia productivo de entrenamiento.',
    };
  }

  if (score >= 55) {
    return {
      status: 'watch' as ConnectedHealthReadinessStatus,
      score,
      title: 'Preparacion moderada',
      message: 'Cuida intensidad, hidratacion y descanso entre bloques exigentes.',
    };
  }

  return {
    status: 'low' as ConnectedHealthReadinessStatus,
    score,
    title: 'Recuperacion limitada',
    message: 'Prioriza recuperacion y ajusta cargas si te sientes fatigado.',
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
      title: 'Sueno corto',
      message: 'Conviene bajar friccion hoy: calentamiento gradual y pausas completas.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['sleep_minutes'],
    });
  } else if (sleepAvg != null && sleepAvg >= 420) {
    insights.push({
      id: 'sleep-consistent',
      title: 'Descanso consistente',
      message: 'Mantener este promedio ayuda a sostener energia y adherencia.',
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
      message: 'Tu gasto activo viene alto; revisa hambre, hidratacion y recuperacion.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['active_energy_kcal'],
    });
  }

  if (latest.steps != null && latest.steps < 4000 && (stepsAvg == null || stepsAvg < 6000)) {
    insights.push({
      id: 'steps-low',
      title: 'Movimiento bajo',
      message: 'Un bloque ligero de caminata puede sumar energia sin interferir con tu plan.',
      tone: 'neutral',
      source: sourceLabel,
      metricKeys: ['steps'],
    });
  }

  if (latest.hrv_ms != null && hrvAvg != null && latest.hrv_ms < hrvAvg * 0.85) {
    insights.push({
      id: 'hrv-low',
      title: 'HRV por debajo de tu promedio',
      message: 'Usalo como senal de contexto para moderar volumen si notas fatiga.',
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
      title: 'FC reposo mas alta',
      message: 'Observa como te sientes antes de forzar intensidad o cardio extra.',
      tone: 'warning',
      source: sourceLabel,
      metricKeys: ['resting_hr_bpm'],
    });
  }

  if (!insights.length) {
    insights.push({
      id: 'steady-context',
      title: 'Senales estables',
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

  return [
    {
      key: 'recovery',
      label: 'Recuperacion',
      value: formatScore(latest?.recovery_score),
      helper: latest?.recovery_score == null ? 'Estimacion por senales' : 'Score conectado',
      trendLabel: null,
      icon: 'pulse-outline',
      tone: readinessTone,
    },
    {
      key: 'sleep',
      label: 'Sueno',
      value: formatDuration(latest?.sleep_minutes),
      helper: formatAverageHelper(avgLabel, sleepAvg, formatDuration),
      trendLabel: formatTrend(latest?.sleep_minutes, sleepAvg, formatDuration),
      icon: 'moon-outline',
      tone: latest?.sleep_minutes != null && latest.sleep_minutes < 360 ? 'warning' : 'neutral',
    },
    {
      key: 'active_energy',
      label: 'Kcal activas',
      value: formatKcal(latest?.active_energy_kcal),
      helper: formatAverageHelper(avgLabel, activeEnergyAvg, formatKcal),
      trendLabel: formatTrend(latest?.active_energy_kcal, activeEnergyAvg, formatKcal),
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
};

export const buildConnectedHealthFeedback = (
  summary: ConnectedHealthSummaryResponse | null,
  range: ConnectedHealthFeedbackRange,
  nowMs = Date.now(),
): ConnectedHealthFeedbackModel => {
  const connection = getConnection(summary);
  const sourceLabel = getPlatformLabel(connection);
  const summaries = sortSummariesDesc(summary?.summaries ?? [])
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
    sourceLabel,
    latestSyncAt,
    freshnessLabel: freshness.label,
    isStale: freshness.isStale,
    latestDateLabel: getLatestDateLabel(latest),
    readiness,
    metrics: buildMetrics(latest, summaries, range, readinessTone),
    insights: buildInsights(latest, summaries, sourceLabel),
  };
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

export const CONNECTED_HEALTH_AUTO_SYNC_STALE_MS = STALE_SYNC_THRESHOLD_MS;
