import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Card } from '../common';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type {
  ConnectedHealthHistoryPoint,
  ConnectedHealthHistorySeries,
  ConnectedHealthHistoryModel,
  ConnectedHealthMetricKey,
} from '../../types/connectedHealthFeedback';
import {
  formatConnectedHealthHistoryChange,
  formatConnectedHealthHistoryValue,
} from '../../utils/connectedHealthFeedback';
import { buildMonotonePath, getLineChartDomain } from '../../utils/chartScale';
import { formatLocalDate } from '../../utils/date';

type ConnectedHealthHistoryCardProps = {
  history: ConnectedHealthHistoryModel;
  isRefreshing?: boolean;
};

type ChartCoordinate = {
  point: ConnectedHealthHistoryPoint;
  x: number;
  y: number;
};

const CHART_HEIGHT = 196;
const CHART_PADDING = { top: 14, right: 10, bottom: 14, left: 10 };
const GRID_LINES = 4;

const getDefaultMetricKey = (series: ConnectedHealthHistorySeries[]) =>
  series.find((metric) => metric.key === 'recovery')?.key ?? series[0]?.key ?? null;

const getValueDomain = (series: ConnectedHealthHistorySeries) => {
  const values = series.points
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (series.key === 'recovery') {
    return { min: 0, max: 100 };
  }

  if (series.chartKind === 'bar') {
    return { min: 0, max: Math.max(...values, 1) * 1.08 };
  }

  return getLineChartDomain(values);
};

const buildLinePaths = (coordinates: (ChartCoordinate | null)[]) => {
  const segments: ChartCoordinate[][] = [];
  let currentSegment: ChartCoordinate[] = [];

  const flush = () => {
    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    }
    currentSegment = [];
  };

  coordinates.forEach((coordinate) => {
    if (!coordinate) {
      flush();
      return;
    }

    currentSegment.push(coordinate);
  });
  flush();

  return segments.map((segment) => buildMonotonePath(segment).trim());
};

const formatChartDate = (date: string) =>
  formatLocalDate(date, { day: 'numeric', month: 'short' }).replace('.', '');

export const ConnectedHealthHistoryCard: React.FC<ConnectedHealthHistoryCardProps> = ({
  history,
  isRefreshing = false,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedMetricKey, setSelectedMetricKey] = useState<ConnectedHealthMetricKey | null>(
    () => getDefaultMetricKey(history.series),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  const selectedSeries =
    history.series.find((series) => series.key === selectedMetricKey) ??
    history.series[0] ??
    null;

  useEffect(() => {
    if (!history.series.some((series) => series.key === selectedMetricKey)) {
      setSelectedMetricKey(getDefaultMetricKey(history.series));
    }
  }, [history.series, selectedMetricKey]);

  useEffect(() => {
    setSelectedDate(selectedSeries?.latest?.date ?? null);
  }, [history.range, selectedSeries?.key, selectedSeries?.latest?.date]);

  const chart = useMemo(() => {
    if (!selectedSeries || chartWidth <= 0) {
      return null;
    }

    const innerWidth = Math.max(
      1,
      chartWidth - CHART_PADDING.left - CHART_PADDING.right,
    );
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const domain = getValueDomain(selectedSeries);
    const valueSpan = Math.max(domain.max - domain.min, 1);
    const slotWidth = innerWidth / Math.max(selectedSeries.points.length, 1);

    const coordinates = selectedSeries.points.map((point, index): ChartCoordinate | null => {
      if (point.value == null) {
        return null;
      }

      const ratio = (point.value - domain.min) / valueSpan;
      return {
        point,
        x: CHART_PADDING.left + slotWidth * (index + 0.5),
        y: CHART_PADDING.top + innerHeight - ratio * innerHeight,
      };
    });

    return {
      chartBottom,
      coordinates,
      domain,
      innerHeight,
      innerWidth,
      linePaths: buildLinePaths(coordinates),
      slotWidth,
    };
  }, [chartWidth, selectedSeries]);

  const selectedPoint = selectedSeries?.points.find(
    (point) => point.date === selectedDate && point.value != null,
  ) ?? selectedSeries?.latest ?? null;
  const observedValues = selectedSeries?.points
    .map((point) => point.value)
    .filter((value): value is number => value != null) ?? [];
  const observedMin = observedValues.length > 0 ? Math.min(...observedValues) : null;
  const observedMax = observedValues.length > 0 ? Math.max(...observedValues) : null;
  const firstPoint = selectedSeries?.points[0] ?? null;
  const middlePoint = selectedSeries?.points[Math.floor(selectedSeries.points.length / 2)] ?? null;
  const lastPoint = selectedSeries?.points[selectedSeries.points.length - 1] ?? null;

  const handleChartLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  return (
    <Card style={styles.card} padding="md">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Historial</Text>
          <Text style={styles.subtitle}>Evolución diaria de tus señales</Text>
        </View>
        <View style={styles.rangeStatus}>
          {isRefreshing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          <Text style={styles.rangeLabel}>{history.range} días</Text>
        </View>
      </View>

      {history.series.length === 0 || !selectedSeries ? (
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={26} color={theme.colors.iconMuted} />
          <Text style={styles.emptyTitle}>Sin histórico disponible</Text>
          <Text style={styles.emptyText}>
            Aún no hay suficientes métricas diarias para mostrar una tendencia.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricSelector}
          >
            {history.series.map((series) => {
              const isSelected = series.key === selectedSeries.key;
              return (
                <Pressable
                  key={series.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Ver historial de ${series.label}`}
                  onPress={() => setSelectedMetricKey(series.key)}
                  style={({ pressed }) => [
                    styles.metricChip,
                    isSelected ? styles.metricChipSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Ionicons
                    name={series.icon}
                    size={15}
                    color={isSelected ? theme.colors.primary : theme.colors.iconMuted}
                  />
                  <Text
                    style={[
                      styles.metricChipText,
                      isSelected ? styles.metricChipTextSelected : null,
                    ]}
                  >
                    {series.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.selectedValuePanel}>
            <View style={styles.selectedValueCopy}>
              <Text style={styles.selectedDate}>
                {selectedPoint
                  ? formatLocalDate(selectedPoint.date, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  : 'Sin fecha'}
              </Text>
              <Text style={styles.selectedMetric}>{selectedSeries.label}</Text>
            </View>
            <Text style={styles.selectedValue}>
              {formatConnectedHealthHistoryValue(
                selectedSeries.valueFormat,
                selectedPoint?.value,
              )}
            </Text>
          </View>

          <View style={styles.scaleRow}>
            <Text style={styles.scaleText}>
              Máx. {formatConnectedHealthHistoryValue(selectedSeries.valueFormat, observedMax)}
            </Text>
            <Text style={styles.scaleText}>
              Mín. {formatConnectedHealthHistoryValue(selectedSeries.valueFormat, observedMin)}
            </Text>
          </View>

          <View
            accessible
            accessibilityLabel={`Gráfica de ${selectedSeries.label} de los últimos ${history.range} días`}
            style={styles.chartWrap}
            onLayout={handleChartLayout}
          >
            {chart ? (
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                {Array.from({ length: GRID_LINES }).map((_, index) => {
                  const y =
                    CHART_PADDING.top +
                    (index / (GRID_LINES - 1)) * chart.innerHeight;
                  return (
                    <Line
                      key={`grid-${index}`}
                      x1={CHART_PADDING.left}
                      y1={y}
                      x2={chartWidth - CHART_PADDING.right}
                      y2={y}
                      stroke={theme.colors.border}
                      strokeDasharray="4 7"
                      strokeWidth={1}
                    />
                  );
                })}

                {chart.coordinates.map((coordinate, index) => {
                  if (!coordinate || selectedSeries.chartKind !== 'bar') {
                    return null;
                  }

                  const barWidth = Math.min(18, Math.max(3, chart.slotWidth * 0.62));
                  const barHeight = Math.max(2, chart.chartBottom - coordinate.y);
                  const isSelected = coordinate.point.date === selectedPoint?.date;
                  return (
                    <React.Fragment key={`${coordinate.point.date}-bar`}>
                      <Rect
                        x={coordinate.x - barWidth / 2}
                        y={chart.chartBottom - barHeight}
                        width={barWidth}
                        height={barHeight}
                        rx={Math.min(4, barWidth / 2)}
                        fill={theme.colors.primary}
                        fillOpacity={isSelected ? 1 : theme.isDark ? 0.58 : 0.48}
                        stroke={isSelected ? theme.colors.primary : 'transparent'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                      <Rect
                        x={CHART_PADDING.left + chart.slotWidth * index}
                        y={CHART_PADDING.top}
                        width={chart.slotWidth}
                        height={chart.innerHeight}
                        fill="transparent"
                        onPress={() => setSelectedDate(coordinate.point.date)}
                      />
                    </React.Fragment>
                  );
                })}

                {selectedSeries.chartKind === 'line'
                  ? chart.linePaths.map((path, index) => (
                      <Path
                        key={`line-${index}`}
                        d={path}
                        fill="none"
                        stroke={theme.colors.primary}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))
                  : null}

                {chart.coordinates.map((coordinate) => {
                  if (!coordinate || selectedSeries.chartKind !== 'line') {
                    return null;
                  }

                  const isSelected = coordinate.point.date === selectedPoint?.date;
                  return (
                    <React.Fragment key={`${coordinate.point.date}-point`}>
                      {isSelected ? (
                        <Circle
                          cx={coordinate.x}
                          cy={coordinate.y}
                          r={10}
                          fill={theme.colors.primarySoft}
                        />
                      ) : null}
                      <Circle
                        cx={coordinate.x}
                        cy={coordinate.y}
                        r={isSelected ? 5 : 3.5}
                        fill={theme.colors.surface}
                        stroke={theme.colors.primary}
                        strokeWidth={2}
                      />
                      <Circle
                        cx={coordinate.x}
                        cy={coordinate.y}
                        r={12}
                        fill="transparent"
                        onPress={() => setSelectedDate(coordinate.point.date)}
                      />
                    </React.Fragment>
                  );
                })}
              </Svg>
            ) : (
              <View style={styles.chartPlaceholder} />
            )}
          </View>

          <View style={styles.axisRow}>
            <Text style={styles.axisLabel}>{firstPoint ? formatChartDate(firstPoint.date) : ''}</Text>
            <Text style={styles.axisLabel}>{middlePoint ? formatChartDate(middlePoint.date) : ''}</Text>
            <Text style={[styles.axisLabel, styles.axisLabelRight]}>
              {lastPoint ? formatChartDate(lastPoint.date) : ''}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Último</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {formatConnectedHealthHistoryValue(
                  selectedSeries.valueFormat,
                  selectedSeries.latest?.value,
                )}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Promedio</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {formatConnectedHealthHistoryValue(
                  selectedSeries.valueFormat,
                  selectedSeries.average,
                )}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Cambio</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {formatConnectedHealthHistoryChange(
                  selectedSeries.valueFormat,
                  selectedSeries.change,
                )}
              </Text>
            </View>
          </View>
        </>
      )}
    </Card>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    title: {
      fontSize: fontSize.base,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    rangeStatus: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rangeLabel: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    metricSelector: {
      gap: spacing.xs,
      paddingRight: spacing.sm,
    },
    metricChip: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    metricChipSelected: {
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
    },
    metricChipText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    metricChipTextSelected: {
      color: theme.colors.primary,
    },
    selectedValuePanel: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
    },
    selectedValueCopy: {
      flex: 1,
      gap: 2,
    },
    selectedDate: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textTransform: 'capitalize',
    },
    selectedMetric: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    selectedValue: {
      maxWidth: '48%',
      fontSize: fontSize.xl,
      fontWeight: '900',
      color: theme.colors.primary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    scaleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    scaleText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    chartWrap: {
      width: '100%',
      minHeight: CHART_HEIGHT,
      overflow: 'hidden',
    },
    chartPlaceholder: {
      height: CHART_HEIGHT,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
    },
    axisRow: {
      marginTop: -spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    axisLabel: {
      flex: 1,
      fontSize: 10,
      color: theme.colors.textMuted,
    },
    axisLabelRight: {
      textAlign: 'right',
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    summaryItem: {
      flex: 1,
      minWidth: 86,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    summaryLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    summaryValue: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      fontWeight: '900',
      color: theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
    },
    emptyTitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyText: {
      maxWidth: 300,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    pressed: {
      opacity: 0.75,
    },
  });
