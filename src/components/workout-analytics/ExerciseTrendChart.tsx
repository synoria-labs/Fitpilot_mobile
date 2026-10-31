import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import { getAuroraTokens, getRepRangeColor } from '../../theme/aurora';
import type { ExerciseDetailMetric, ExerciseTrendPoint, DisplayHints, RepRangeBucket } from '../../types';
import { formatLocalDate } from '../../utils/date';
import { formatDurationSeconds } from '../../utils/formatters';
import { formatMetricContext, getPointMetricContext } from '../../utils/analyticsProfiles';
import {
  buildLineCoordinates,
  formatCalories,
  formatDistance,
  buildPolylinePoints,
  formatVolumeKg,
  formatWeightKg,
} from '../../utils/workoutAnalytics';

interface ExerciseTrendChartProps {
  series: ExerciseTrendPoint[];
  repRanges: RepRangeBucket[];
  contentWidth?: number;
  metric?: ExerciseDetailMetric;
  displayHints?: DisplayHints | null;
}

const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 20, right: 16, bottom: 32, left: 16 };

const METRIC_CONFIG: Record<ExerciseDetailMetric, {
  lineLabel: string;
  barLabel: string;
  showBars: boolean;
  emptyText: string;
  formatValue: (v: number | null | undefined) => string;
}> = {
  best_weight: {
    lineLabel: 'Mejor carga',
    barLabel: 'Volumen',
    showBars: true,
    emptyText: 'No hay registros de carga en este rango.',
    formatValue: (v) => formatWeightKg(v),
  },
  volume: {
    lineLabel: 'Volumen total',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay volumen registrado en este rango.',
    formatValue: (v) => formatVolumeKg(v ?? 0),
  },
  best_reps: {
    lineLabel: 'Mejor reps',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay repeticiones registradas en este rango.',
    formatValue: (v) => (v != null ? `${Math.round(v)} reps` : '-- reps'),
  },
  effort: {
    lineLabel: 'Esfuerzo prom.',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay datos de esfuerzo registrados en este rango.',
    formatValue: (v) => (v != null ? `${v.toFixed(1)}` : '--'),
  },
  e1rm: {
    lineLabel: '1RM estimado',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay datos suficientes para estimar 1RM.',
    formatValue: (v) => formatWeightKg(v),
  },
  top_set_weight: {
    lineLabel: 'Top set',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay top sets registrados.',
    formatValue: (v) => formatWeightKg(v),
  },
  total_reps: {
    lineLabel: 'Total reps',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay repeticiones registradas.',
    formatValue: (v) => (v != null ? `${Math.round(v)} reps` : '-- reps'),
  },
  duration: {
    lineLabel: 'Duración',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay sesiones de cardio registradas en este rango.',
    formatValue: (v) => (v != null ? `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(v)} min` : '-- min'),
  },
  calories: {
    lineLabel: 'Calorías',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay calorías registradas en este rango.',
    formatValue: (v) => formatCalories(v),
  },
  distance: {
    lineLabel: 'Distancia',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay distancia registrada en este rango.',
    formatValue: (v) => formatDistance(v),
  },
  best_hold_seconds: {
    lineLabel: 'Mejor tiempo',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay series sostenidas registradas en este rango.',
    formatValue: (v) => (v != null ? formatDurationSeconds(Math.round(v)) : '-- s'),
  },
  total_hold_seconds: {
    lineLabel: 'Tiempo total',
    barLabel: '',
    showBars: false,
    emptyText: 'No hay series sostenidas registradas en este rango.',
    formatValue: (v) => (v != null ? formatDurationSeconds(Math.round(v)) : '-- s'),
  },
};

const extractMetricValue = (point: ExerciseTrendPoint, metric: ExerciseDetailMetric): number | null => {
  switch (metric) {
    case 'best_weight':
      return point.best_weight_kg ?? null;
    case 'volume':
      return point.volume_kg;
    case 'best_reps':
      return point.best_reps ?? null;
    case 'effort':
      return point.avg_effort ?? null;
    case 'e1rm':
      return point.e1rm_kg ?? null;
    case 'top_set_weight':
      return point.top_set_weight_kg ?? null;
    case 'total_reps':
      return point.total_reps ?? null;
    case 'duration':
      return point.duration_minutes ?? null;
    case 'calories':
      return point.calories_burned ?? null;
    case 'distance':
      return point.distance_meters ?? null;
    case 'best_hold_seconds':
      return point.best_hold_seconds ?? null;
    case 'total_hold_seconds':
      return point.total_hold_seconds ?? null;
    default:
      return point.best_weight_kg ?? null;
  }
};

const HOLD_METRICS = new Set<ExerciseDetailMetric>(['best_hold_seconds', 'total_hold_seconds']);

export const ExerciseTrendChart: React.FC<ExerciseTrendChartProps> = ({
  series: allSeries,
  repRanges,
  contentWidth = 360,
  metric = 'best_weight',
  displayHints,
}) => {
  const { theme } = useAppTheme();
  const aurora = getAuroraTokens(theme.isDark);
  const styles = useThemedStyles(createStyles);
  const config = METRIC_CONFIG[metric] ?? METRIC_CONFIG.best_weight;
  // Sessions of a plank logged in reps, before holds could be timed, have no seconds: leave them
  // off the hold line instead of plotting them as 0 s.
  const series = HOLD_METRICS.has(metric)
    ? allSeries.filter((point) => extractMetricValue(point, metric) != null)
    : allSeries;

  // displayHints can override bar visibility
  const shouldShowBars = displayHints
    ? displayHints.show_volume_bars && config.showBars
    : config.showBars;

  const lineValues = series.map((point) => extractMetricValue(point, metric) ?? 0);
  const hasData = lineValues.some((v) => v !== 0);

  if (!series.length || !hasData) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{config.emptyText}</Text>
      </View>
    );
  }

  const chartWidth = Math.max(contentWidth - spacing.lg * 2, 280);
  const linePoints = buildLineCoordinates(lineValues, chartWidth, CHART_HEIGHT, CHART_PADDING);
  const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const barAreaHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const slotWidth =
    series.length === 1 ? 0 : (chartWidth - CHART_PADDING.left - CHART_PADDING.right) / (series.length - 1);

  const volumeValues = series.map((point) => {
    const bucketTotal = Object.values(point.rep_bucket_totals ?? {}).reduce((sum, value) => sum + value, 0);
    return bucketTotal > 0 ? bucketTotal : point.volume_kg;
  });
  const maxVolume = Math.max(...volumeValues, 1);

  const lastPoint = series[series.length - 1];
  const lastValue = extractMetricValue(lastPoint, metric);
  const lastMetricContext = formatMetricContext(metric, getPointMetricContext(lastPoint, metric), {
    variant:
      metric === 'best_weight'
        ? 'chart_weight_meta'
        : metric === 'best_reps'
          ? 'chart_reps_meta'
          : 'chart_default',
  });

  return (
    <View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendLineDot]} />
          <Text style={styles.legendLabel}>{config.lineLabel}</Text>
        </View>
        {shouldShowBars ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendBarDot]} />
            <Text style={styles.legendLabel}>{config.barLabel}</Text>
          </View>
        ) : null}
      </View>

      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {shouldShowBars
          ? series.map((point, index) => {
              const x =
                series.length === 1 ? chartWidth / 2 : CHART_PADDING.left + slotWidth * index;
              const bucketTotals = point.rep_bucket_totals ?? {};
              const totalVolume = Object.values(bucketTotals).reduce((sum, value) => sum + value, 0) || point.volume_kg;
              let stackedOffsetY = chartBottom;

              if (totalVolume <= 0) {
                return null;
              }

              return (
                <React.Fragment key={`${point.performed_on_date}-volume`}>
                  {repRanges.map((bucket, bucketIndex) => {
                    const bucketValue =
                      Object.keys(bucketTotals).length > 0
                        ? bucketTotals[bucket.id] || 0
                        : bucketIndex === 0
                          ? totalVolume
                          : 0;
                    const segmentHeight = (bucketValue / maxVolume) * (barAreaHeight * 0.45);

                    if (segmentHeight <= 0) {
                      return null;
                    }

                    stackedOffsetY -= segmentHeight;
                    return (
                      <Rect
                        key={`${point.performed_on_date}-${bucket.id}`}
                        x={x - 10}
                        y={stackedOffsetY}
                        width={20}
                        height={segmentHeight}
                        rx={6}
                        fill={getRepRangeColor(aurora, bucketIndex)}
                        fillOpacity={theme.isDark ? 0.34 : 0.28}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })
          : null}

        <Polyline
          fill="none"
          stroke={theme.colors.primary}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={buildPolylinePoints(linePoints)}
        />

        {linePoints.map((point, index) => (
          <Circle
            key={`${series[index].performed_on_date}-circle`}
            cx={point.x}
            cy={point.y}
            r={4.5}
            fill={theme.colors.surface}
            stroke={theme.colors.primary}
            strokeWidth={2}
          />
        ))}
      </Svg>

      <View style={styles.bottomMeta}>
        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>Primera</Text>
          <Text style={styles.metaValue}>
            {formatLocalDate(series[0].performed_on_date, { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>Última</Text>
          <Text style={styles.metaValue}>
            {formatLocalDate(series[series.length - 1].performed_on_date, { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>{config.lineLabel} reciente</Text>
          <Text style={styles.metaValue}>{config.formatValue(lastValue)}</Text>
          {lastMetricContext ? <Text style={styles.metaContext}>{lastMetricContext}</Text> : null}
        </View>
      </View>

      {shouldShowBars ? (
        <Text style={styles.chartHint}>
          Las barras apiladas muestran cómo se repartió el volumen de la sesión entre los rangos de reps que tocaste ese día.
        </Text>
      ) : null}
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    legendRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendLineDot: {
      backgroundColor: theme.colors.primary,
    },
    legendBarDot: {
      backgroundColor: theme.colors.borderStrong,
    },
    legendLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    bottomMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    metaColumn: {
      flex: 1,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.sm,
    },
    metaLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    metaValue: {
      marginTop: 4,
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    metaContext: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    emptyState: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    chartHint: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
  });

export default ExerciseTrendChart;
