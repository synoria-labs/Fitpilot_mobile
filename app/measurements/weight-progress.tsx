import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Card, LoadingSpinner } from '../../src/components/common';
import { CalendarDatePickerModal } from '../../src/components/calendar';
import { borderRadius, fontSize, spacing } from '../../src/constants/colors';
import { getMeasurementProgressMetricConfig } from '../../src/constants/measurements';
import { listMyMeasurements } from '../../src/services/measurements';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import type { ApiError, MeasurementHistoryItem } from '../../src/types';
import {
  formatMeasurementDate,
  formatMeasurementNumber,
  getMeasurementDisplayDate,
  getWeightChangePreference,
  type MeasurementChangePreference,
  parseMeasurementNumber,
} from '../../src/utils/measurements';
import { convertMeasurementUnitValue } from '../../src/utils/measurementUnits';
import { buildMonotonePath, getLineChartDomain } from '../../src/utils/chartScale';
import { useMeasurementPreferenceStore } from '../../src/store/measurementPreferenceStore';
import { useWorkoutStore } from '../../src/store/workoutStore';

type RangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
type PickerTarget = 'start' | 'end' | null;

interface MeasurementRecord {
  id: string;
  value: number;
  label: string;
  fullDate: string;
  dateTimeLabel: string;
  timestamp: number | null;
  notes: string | null;
}

interface ChartPoint extends MeasurementRecord {
  x: number;
  y: number;
}

interface MeasurementProgressScreenProps {
  metricKey?: string | null;
}

// Mismo criterio que en Medidas: el peso se juzga contra el objetivo del programa. El resto
// de métricas conserva la regla de siempre (bajar en verde, subir en azul).
const getTotalChangeColor = (
  totalChange: number | null,
  metricKey: string | undefined,
  weightChangePreference: MeasurementChangePreference,
  theme: AppTheme,
) => {
  if (totalChange === null || totalChange === 0) {
    return theme.colors.textMuted;
  }

  if (metricKey !== 'weight_kg') {
    return totalChange > 0 ? theme.colors.primary : theme.colors.success;
  }

  if (weightChangePreference === 'neutral') {
    return theme.colors.primary;
  }

  const isGoodChange =
    weightChangePreference === 'decrease' ? totalChange < 0 : totalChange > 0;
  return isGoodChange ? theme.colors.success : theme.colors.warning;
};

const HISTORY_PAGE_SIZE = 20;
const CHART_HEIGHT = 280;
const GRID_LINES = 4;
const CHART_HORIZONTAL_PADDING = 28;
const CHART_VERTICAL_PADDING = 20;

const rangeDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const recordDateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const RANGE_OPTIONS: { key: RangePreset; label: string }[] = [
  { key: '7d', label: '1 semana' },
  { key: '30d', label: '1 mes' },
  { key: '90d', label: '3 meses' },
  { key: 'all', label: 'Todo' },
  { key: 'custom', label: 'Fechas' },
];

const parseMeasurementDateTime = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalizedValue = value.includes('T') ? value : `${value}T00:00:00`;
  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatMeasurementDateTime = (value?: string | null) => {
  const parsedDate = parseMeasurementDateTime(value);

  if (!parsedDate) {
    return 'Sin fecha';
  }

  return recordDateTimeFormatter.format(parsedDate);
};

const formatRangeDate = (value?: Date | null) => {
  if (!value) {
    return 'Seleccionar';
  }

  return rangeDateFormatter.format(value);
};

const startOfDay = (value: Date) => {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const endOfDay = (value: Date) => {
  const nextDate = new Date(value);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
};

const subtractDays = (value: Date, days: number) => {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() - days);
  return nextDate;
};

const buildAreaPath = (points: ChartPoint[], baselineY: number) => {
  if (points.length === 0) {
    return '';
  }

  const linePath = buildMonotonePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return `${linePath}L${lastPoint.x} ${baselineY} L${firstPoint.x} ${baselineY} Z`;
};

export function MeasurementProgressScreen({
  metricKey = 'weight_kg',
}: MeasurementProgressScreenProps) {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const metricConfig = useMemo(
    () => getMeasurementProgressMetricConfig(metricKey),
    [metricKey],
  );
  const metricLabel = metricConfig?.label ?? 'Medición';
  const metricLabelLower = metricLabel.toLowerCase();
  const metricTitle = metricConfig?.progressTitle ?? 'Progreso de medición';
  const metricSubtitle = metricConfig?.progressSubtitle
    ?? 'Tendencia real, filtros por rango y detalle de cada registro.';
  const metricValueDecimals = metricConfig?.decimals ?? 1;
  const metricIconName = (
    metricConfig?.icon ?? 'analytics-outline'
  ) as keyof typeof Ionicons.glyphMap;
  const measurementPreference = useMeasurementPreferenceStore((state) => state.preference);
  const initializeMeasurementPreference = useMeasurementPreferenceStore((state) => state.initialize);
  const programObjective = useWorkoutStore(
    (state) => state.dashboardBootstrap?.program?.objective ?? null,
  );
  const weightChangePreference = getWeightChangePreference(programObjective);
  const { width, height } = useWindowDimensions();
  const [measurements, setMeasurements] = useState<MeasurementHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRotationEnabled, setAutoRotationEnabled] = useState(true);
  const [canUseAutoRotation, setCanUseAutoRotation] = useState(true);
  const [chartViewportWidth, setChartViewportWidth] = useState(0);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('90d');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const loadMeasurements = useCallback(async (options?: { refresh?: boolean }) => {
    const isRefresh = options?.refresh ?? false;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const firstPage = await listMyMeasurements(1, HISTORY_PAGE_SIZE);
      let nextMeasurements = firstPage.data;

      if (firstPage.pagination.totalPages > 1) {
        for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
          const response = await listMyMeasurements(page, HISTORY_PAGE_SIZE);
          nextMeasurements = [...nextMeasurements, ...response.data];
        }
      }

      setMeasurements(nextMeasurements);
      setError(null);
    } catch (loadError) {
      const apiError = loadError as ApiError;
      setError(apiError.message || 'No fue posible cargar el progreso de la medición.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

  useEffect(() => {
    if (!metricConfig) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    void loadMeasurements();
  }, [loadMeasurements, metricConfig]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let isActive = true;

    const syncOrientation = async () => {
      if (!autoRotationEnabled) {
        setCanUseAutoRotation(true);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        return;
      }

      const supportsLandscape = await ScreenOrientation
        .supportsOrientationLockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .catch(() => false);

      if (!isActive) {
        return;
      }

      setCanUseAutoRotation(supportsLandscape);

      if (!supportsLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        return;
      }

      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    };

    void syncOrientation();

    return () => {
      isActive = false;
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [autoRotationEnabled]);

  const allRecords = useMemo<MeasurementRecord[]>(() => {
    if (!metricConfig) {
      return [];
    }

    return measurements
      .map((measurement) => {
        const rawValue = metricConfig.source === 'derived'
          ? metricConfig.getValue(measurement)
          : parseMeasurementNumber(measurement[metricConfig.fieldKey]);

        if (rawValue === null) {
          return null;
        }

        const convertedValue = convertMeasurementUnitValue(
          rawValue,
          metricConfig.unit,
          measurementPreference,
        );
        const displayDate = getMeasurementDisplayDate(measurement);
        const recordDateTime = measurement.logged_at ?? measurement.date ?? null;
        const parsedDate = parseMeasurementDateTime(recordDateTime ?? displayDate);

        return {
          id: measurement.id,
          value: convertedValue.value,
          label: formatMeasurementDate(displayDate, 'short'),
          fullDate: formatMeasurementDate(displayDate, 'long'),
          dateTimeLabel: formatMeasurementDateTime(recordDateTime ?? displayDate),
          timestamp: parsedDate?.getTime() ?? null,
          notes: measurement.notes ?? null,
        };
      })
      .filter(Boolean)
      .reverse() as MeasurementRecord[];
  }, [measurementPreference, measurements, metricConfig]);

  const availableStartDate = allRecords.find((point) => point.timestamp !== null)?.timestamp ?? null;
  const availableEndDate = [...allRecords].reverse().find((point) => point.timestamp !== null)?.timestamp ?? null;

  // Medidas compara cada cifra con la medición anterior, aunque sea de hace meses. Si en 3
  // meses no hay al menos dos registros, se abre en "Todo": antes la gráfica decía "Sin
  // cambio" justo después de que la tarjeta dijera "↓ 15 kg".
  const hasPickedInitialRangeRef = useRef(false);
  useEffect(() => {
    if (hasPickedInitialRangeRef.current || allRecords.length === 0) {
      return;
    }

    hasPickedInitialRangeRef.current = true;
    const ninetyDaysAgo = startOfDay(subtractDays(new Date(), 89)).getTime();
    const recentRecords = allRecords.filter(
      (point) => point.timestamp !== null && point.timestamp >= ninetyDaysAgo,
    );

    if (recentRecords.length < 2 && allRecords.length >= 2) {
      setRangePreset('all');
    }
  }, [allRecords]);

  const filteredRecords = useMemo(() => {
    if (rangePreset === 'all') {
      return allRecords;
    }

    if (rangePreset === 'custom') {
      if (!customStartDate || !customEndDate) {
        return allRecords;
      }

      const startTime = startOfDay(customStartDate).getTime();
      const endTime = endOfDay(customEndDate).getTime();

      return allRecords.filter((point) => (
        point.timestamp !== null &&
        point.timestamp >= startTime &&
        point.timestamp <= endTime
      ));
    }

    const today = new Date();
    const startDate = startOfDay(
      subtractDays(
        today,
        rangePreset === '7d'
          ? 6
          : rangePreset === '30d'
            ? 29
            : 89,
      ),
    ).getTime();
    const endDate = endOfDay(today).getTime();

    return allRecords.filter((point) => (
      point.timestamp !== null &&
      point.timestamp >= startDate &&
      point.timestamp <= endDate
    ));
  }, [allRecords, customEndDate, customStartDate, rangePreset]);

  useEffect(() => {
    setSelectedPointId((currentSelectedPointId) => {
      if (currentSelectedPointId && filteredRecords.some((point) => point.id === currentSelectedPointId)) {
        return currentSelectedPointId;
      }

      return filteredRecords[filteredRecords.length - 1]?.id ?? null;
    });
  }, [filteredRecords]);

  const handleSelectRangePreset = useCallback((nextPreset: RangePreset) => {
    setRangePreset(nextPreset);
    setPickerTarget(null);

    if (nextPreset === 'custom') {
      setCustomStartDate((currentStartDate) => currentStartDate ?? (
        availableStartDate ? new Date(availableStartDate) : null
      ));
      setCustomEndDate((currentEndDate) => currentEndDate ?? (
        availableEndDate ? new Date(availableEndDate) : null
      ));
    }
  }, [availableEndDate, availableStartDate]);

  const openCalendar = useCallback((target: PickerTarget) => {
    if (!target) {
      return;
    }
    setPickerTarget(target);
  }, []);

  const handleCalendarSelect = useCallback((selectedDate: Date) => {
    if (!pickerTarget) {
      return;
    }

    if (pickerTarget === 'start') {
      const nextStartDate = startOfDay(selectedDate);
      setCustomStartDate(nextStartDate);
      setCustomEndDate((currentEndDate) =>
        currentEndDate && currentEndDate < nextStartDate ? endOfDay(nextStartDate) : currentEndDate,
      );
    } else {
      const nextEndDate = endOfDay(selectedDate);
      setCustomEndDate(nextEndDate);
      setCustomStartDate((currentStartDate) =>
        currentStartDate && currentStartDate > nextEndDate ? startOfDay(nextEndDate) : currentStartDate,
      );
    }

    setPickerTarget(null);
  }, [pickerTarget]);

  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setChartViewportWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) > 1 ? nextWidth : currentWidth,
    );
  }, []);

  const chartUnit = metricConfig?.unit
    ? convertMeasurementUnitValue(1, metricConfig.unit, measurementPreference).unit ?? metricConfig.unit
    : null;
  const isLandscape = width > height;
  const fallbackChartWidth = Math.max(
    Math.min(width - (isLandscape ? 120 : 64), isLandscape ? 760 : 420),
    240,
  );
  const chartWidth = Math.max(
    (chartViewportWidth > 0 ? chartViewportWidth : fallbackChartWidth) - 8,
    240,
  );
  const chartInnerWidth = chartWidth - CHART_HORIZONTAL_PADDING * 2;
  const chartInnerHeight = CHART_HEIGHT - CHART_VERTICAL_PADDING * 2;

  const valueRange = useMemo(() => {
    if (filteredRecords.length === 0) {
      return { min: 0, max: 0, paddedMin: 0, paddedMax: 0 };
    }

    const values = filteredRecords.map((point) => point.value);
    const domain = getLineChartDomain(values);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      paddedMin: domain.min,
      paddedMax: domain.max,
    };
  }, [filteredRecords]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (filteredRecords.length === 0) {
      return [];
    }

    if (filteredRecords.length === 1) {
      return [
        {
          ...filteredRecords[0],
          x: CHART_HORIZONTAL_PADDING + chartInnerWidth / 2,
          y: CHART_VERTICAL_PADDING + chartInnerHeight / 2,
        },
      ];
    }

    return filteredRecords.map((point, index) => {
      const x = CHART_HORIZONTAL_PADDING + (index / (filteredRecords.length - 1)) * chartInnerWidth;
      const ratio =
        valueRange.paddedMax === valueRange.paddedMin
          ? 0.5
          : (point.value - valueRange.paddedMin) /
            (valueRange.paddedMax - valueRange.paddedMin);
      const y = CHART_VERTICAL_PADDING + chartInnerHeight - ratio * chartInnerHeight;

      return {
        ...point,
        x,
        y,
      };
    });
  }, [chartInnerHeight, chartInnerWidth, filteredRecords, valueRange.paddedMax, valueRange.paddedMin]);

  const firstPoint = filteredRecords[0] ?? null;
  const latestPoint = filteredRecords[filteredRecords.length - 1] ?? null;
  const selectedPoint = filteredRecords.find((point) => point.id === selectedPointId) ?? latestPoint;
  const totalChange = firstPoint && latestPoint
    ? latestPoint.value - firstPoint.value
    : null;
  const unitSuffix = chartUnit ? ` ${chartUnit}` : '';
  const changeLabel = totalChange === null
    ? 'Sin comparativo'
    : totalChange === 0
      ? 'Sin cambio'
      : `${totalChange > 0 ? '+' : ''}${formatMeasurementNumber(totalChange, metricValueDecimals)}${unitSuffix}`;
  const changeDirectionColor = getTotalChangeColor(
    totalChange,
    metricConfig?.key,
    weightChangePreference,
    theme,
  );

  const linePath = buildMonotonePath(chartPoints);
  const baselineY = CHART_HEIGHT - CHART_VERTICAL_PADDING;
  const areaPath = buildAreaPath(chartPoints, baselineY);
  const minLabel = filteredRecords.length > 0
    ? formatMeasurementNumber(valueRange.min, metricValueDecimals)
    : '--';
  const maxLabel = filteredRecords.length > 0
    ? formatMeasurementNumber(valueRange.max, metricValueDecimals)
    : '--';

  const listRecords = useMemo(() => filteredRecords.slice().reverse(), [filteredRecords]);

  const metricsCards = (
    <>
      <View style={[styles.metricCard, isLandscape ? styles.metricCardLandscape : null]}>
        <Text style={styles.metricLabel}>Actual</Text>
        <Text style={styles.metricValue}>
          {latestPoint ? formatMeasurementNumber(latestPoint.value, metricValueDecimals) : '--'}{unitSuffix}
        </Text>
        <Text style={styles.metricHint}>{latestPoint?.fullDate ?? 'Sin fecha'}</Text>
      </View>

      <View style={[styles.metricCard, isLandscape ? styles.metricCardLandscape : null]}>
        <Text style={styles.metricLabel}>Cambio total</Text>
        <Text style={[styles.metricValue, { color: changeDirectionColor }]}>
          {changeLabel}
        </Text>
        <Text style={styles.metricHint}>
          {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'}
        </Text>
      </View>

      {selectedPoint ? (
        <View
          style={[
            styles.metricCard,
            styles.selectedMetricCard,
            isLandscape ? styles.metricCardLandscape : null,
          ]}
        >
          <Text style={styles.metricLabel}>Registro seleccionado</Text>
          <Text style={styles.selectedMetricValue}>
            {formatMeasurementNumber(selectedPoint.value, metricValueDecimals)}{unitSuffix}
          </Text>
          <Text style={styles.selectedMetricHint}>{selectedPoint.dateTimeLabel}</Text>
        </View>
      ) : null}
    </>
  );

  if (!metricConfig) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.title}>Progreso no disponible</Text>
            <Text style={styles.subtitle}>
              La medida seleccionada no tiene una vista de progreso configurada.
            </Text>
          </View>
        </View>

        <View style={styles.scrollContent}>
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>No fue posible abrir esta medición</Text>
            <Text style={styles.errorText}>
              Regresa a la pantalla anterior y selecciona una medida compatible.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && measurements.length === 0) {
    return <LoadingSpinner fullScreen text={`Cargando progreso de ${metricLabelLower}...`} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.title}>{metricTitle}</Text>
          <Text style={styles.subtitle}>{metricSubtitle}</Text>
        </View>

        <Pressable
          onPress={() => setAutoRotationEnabled((currentValue) => !currentValue)}
          accessibilityRole="switch"
          accessibilityState={{ checked: autoRotationEnabled }}
          accessibilityLabel="Auto rotacion"
          style={({ pressed }) => [
            styles.autoButton,
            autoRotationEnabled ? styles.autoButtonActive : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Ionicons
            name="phone-landscape-outline"
            size={16}
            color={autoRotationEnabled ? theme.colors.surface : theme.colors.textSecondary}
          />
          <Text
            style={[
              styles.autoButtonText,
              autoRotationEnabled ? styles.autoButtonTextActive : null,
            ]}
          >
            Auto
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadMeasurements({ refresh: true })}
            tintColor={theme.colors.primary}
          />
        }
      >
        {!canUseAutoRotation ? (
          <Card style={styles.inlineNotice}>
            <Text style={styles.noticeText}>
              Este build no permite landscape todavía. Auto se mantendrá en vertical hasta que recompiles la app.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>No fue posible cargar el progreso de {metricLabelLower}</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
              onPress={() => void loadMeasurements()}
            >
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          </Card>
        ) : null}

        {!error && allRecords.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name={metricIconName} size={40} color={theme.colors.iconMuted} />
            <Text style={styles.emptyTitle}>Todavía no hay registros de {metricLabelLower}</Text>
            <Text style={styles.emptyText}>
              En cuanto existan registros válidos de {metricLabelLower}, aquí vas a poder revisar la evolución completa.
            </Text>
          </Card>
        ) : (
          <>
            {isLandscape ? (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.metricsRowLandscapeScroll}
                contentContainerStyle={[styles.metricsRow, styles.metricsRowLandscape]}
              >
                {metricsCards}
              </ScrollView>
            ) : (
              <View style={styles.metricsRow}>
                {metricsCards}
              </View>
            )}

            <Card style={styles.chartCard}>
              <View style={styles.rangeSection}>
                <View style={styles.rangeChipsRow}>
                  {RANGE_OPTIONS.map((option) => {
                    const isActive = rangePreset === option.key;

                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => handleSelectRangePreset(option.key)}
                        style={({ pressed }) => [
                          styles.rangeChip,
                          isActive ? styles.rangeChipActive : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rangeChipText,
                            isActive ? styles.rangeChipTextActive : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {rangePreset === 'custom' ? (
                  <View style={styles.customRangeRow}>
                    <Pressable
                      onPress={() => openCalendar('start')}
                      style={({ pressed }) => [styles.dateButton, pressed ? styles.pressed : null]}
                    >
                      <Ionicons name="calendar-outline" size={16} color={theme.colors.icon} />
                      <View style={styles.dateButtonText}>
                        <Text style={styles.dateButtonLabel}>Desde</Text>
                        <Text style={styles.dateButtonValue}>{formatRangeDate(customStartDate)}</Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => openCalendar('end')}
                      style={({ pressed }) => [styles.dateButton, pressed ? styles.pressed : null]}
                    >
                      <Ionicons name="calendar-outline" size={16} color={theme.colors.icon} />
                      <View style={styles.dateButtonText}>
                        <Text style={styles.dateButtonLabel}>Hasta</Text>
                        <Text style={styles.dateButtonValue}>{formatRangeDate(customEndDate)}</Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.chartLegend}>
                <View>
                  <Text style={styles.legendLabel}>Máximo</Text>
                  <Text style={styles.legendValue}>{maxLabel}{unitSuffix}</Text>
                </View>
                <View style={styles.legendRight}>
                  <Text style={styles.legendLabel}>Mínimo</Text>
                  <Text style={styles.legendValue}>{minLabel}{unitSuffix}</Text>
                </View>
              </View>

              {filteredRecords.length > 0 ? (
                <>
                  <View style={styles.chartWrapper} onLayout={handleChartLayout}>
                    <Svg width={chartWidth} height={CHART_HEIGHT}>
                      <Defs>
                        <LinearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                          <Stop
                            offset="0%"
                            stopColor={theme.colors.primary}
                            stopOpacity={theme.isDark ? '0.32' : '0.25'}
                          />
                          <Stop
                            offset="100%"
                            stopColor={theme.colors.primary}
                            stopOpacity={theme.isDark ? '0.06' : '0.02'}
                          />
                        </LinearGradient>
                      </Defs>

                      {Array.from({ length: GRID_LINES }).map((_, index) => {
                        const y =
                          CHART_VERTICAL_PADDING +
                          (index / (GRID_LINES - 1)) * chartInnerHeight;

                        return (
                          <Line
                            key={`grid-${index}`}
                            x1={CHART_HORIZONTAL_PADDING}
                            y1={y}
                            x2={chartWidth - CHART_HORIZONTAL_PADDING}
                            y2={y}
                            stroke={theme.colors.border}
                            strokeDasharray="4 8"
                            strokeWidth={1}
                          />
                        );
                      })}

                      {areaPath ? <Path d={areaPath} fill="url(#weightFill)" /> : null}

                      {linePath ? (
                        <Path
                          d={linePath}
                          fill="none"
                          stroke={theme.colors.primary}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}

                      {chartPoints.map((point, index) => (
                        <React.Fragment key={point.id}>
                          {selectedPoint?.id === point.id ? (
                            <Circle
                              cx={point.x}
                              cy={point.y}
                              r={10}
                              fill={theme.isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(59, 130, 246, 0.14)'}
                            />
                          ) : null}
                          <Circle
                            cx={point.x}
                            cy={point.y}
                            r={12}
                            fill="transparent"
                            onPress={() => setSelectedPointId(point.id)}
                          />
                          <Circle
                            cx={point.x}
                            cy={point.y}
                            r={
                              selectedPoint?.id === point.id
                                ? 6
                                : index === chartPoints.length - 1
                                  ? 5
                                  : 4
                            }
                            fill={
                              selectedPoint?.id === point.id || index === chartPoints.length - 1
                                ? theme.colors.primary
                                : theme.colors.surface
                            }
                            stroke={theme.colors.primary}
                            strokeWidth={2}
                            onPress={() => setSelectedPointId(point.id)}
                          />
                        </React.Fragment>
                      ))}
                    </Svg>
                  </View>

                  <View style={styles.axisLabels}>
                    <View style={styles.axisLabelGroup}>
                      <Text style={styles.axisLabelCaption}>Inicio</Text>
                      <Text style={styles.axisLabelText}>{firstPoint?.label ?? '--'}</Text>
                    </View>
                    <View style={[styles.axisLabelGroup, styles.axisLabelGroupRight]}>
                      <Text style={styles.axisLabelCaption}>Actual</Text>
                      <Text style={styles.axisLabelText}>{latestPoint?.label ?? '--'}</Text>
                    </View>
                  </View>

                  {filteredRecords.length === 1 ? (
                    <Text style={styles.singlePointHint}>
                      Necesitas una segunda medición para ver una tendencia completa.
                    </Text>
                  ) : null}
                </>
              ) : (
                <View style={styles.filteredEmptyState}>
                  <Ionicons name="calendar-outline" size={28} color={theme.colors.iconMuted} />
                  <Text style={styles.filteredEmptyTitle}>No hay registros en este rango</Text>
                  <Text style={styles.filteredEmptyText}>
                    Ajusta el periodo o selecciona fechas distintas para ver la gráfica.
                  </Text>
                </View>
              )}
            </Card>

            <Card style={styles.listCard}>
              <Text style={styles.sectionTitle}>Registros del rango</Text>
              <Text style={styles.sectionDescription}>
                Lista simple del periodo actual para revisar {metricLabelLower} y fecha de cada medición.
              </Text>

              {listRecords.length > 0 ? (
                <View style={styles.recordList}>
                  {listRecords.map((record) => {
                    const isSelected = selectedPoint?.id === record.id;

                    return (
                      <Pressable
                        key={record.id}
                        onPress={() => setSelectedPointId(record.id)}
                        style={({ pressed }) => [
                          styles.recordRow,
                          isSelected ? styles.recordRowSelected : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <View style={styles.recordCopy}>
                          <Text style={styles.recordValue}>
                            {formatMeasurementNumber(record.value, 1)}{unitSuffix}
                          </Text>
                          <Text style={styles.recordDate}>{record.dateTimeLabel}</Text>
                          {record.notes ? (
                            <Text style={styles.recordNote} numberOfLines={2}>
                              {record.notes}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons
                          name={isSelected ? 'radio-button-on-outline' : 'chevron-forward-outline'}
                          size={18}
                          color={isSelected ? theme.colors.primary : theme.colors.iconMuted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.recordsEmpty}>
                  <Text style={styles.filteredEmptyText}>
                    No hay registros que mostrar en este periodo.
                  </Text>
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <CalendarDatePickerModal
        visible={Boolean(pickerTarget && rangePreset === 'custom')}
        title={pickerTarget === 'start' ? 'Selecciona fecha inicial' : 'Selecciona fecha final'}
        subtitle="Elige el día que quieres usar para este rango."
        selectedDate={pickerTarget === 'start' ? customStartDate : customEndDate}
        minDate={pickerTarget === 'end' ? customStartDate : null}
        maxDate={pickerTarget === 'start' ? customEndDate : null}
        onClose={() => setPickerTarget(null)}
        onSelect={handleCalendarSelect}
      />
    </SafeAreaView>
  );
}

export default function WeightProgressScreen() {
  return <MeasurementProgressScreen metricKey="weight_kg" />;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: theme.colors.textMuted,
  },
  autoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  autoButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  autoButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  autoButtonTextActive: {
    color: theme.colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  inlineNotice: {
    marginTop: spacing.sm,
  },
  noticeText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: theme.colors.warning,
  },
  errorCard: {
    marginTop: spacing.sm,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  errorText: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    color: theme.colors.textSecondary,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.colors.surface,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    marginTop: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricsRowLandscape: {
    flexWrap: 'nowrap',
    paddingRight: spacing.lg,
  },
  metricsRowLandscapeScroll: {
    marginBottom: spacing.sm,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metricCardLandscape: {
    width: 220,
    flexGrow: 0,
    flexShrink: 0,
  },
  selectedMetricCard: {
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySoft,
  },
  metricLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    marginTop: spacing.xs,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  metricHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: theme.colors.textMuted,
  },
  selectedMetricValue: {
    marginTop: spacing.xs,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  selectedMetricHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  chartCard: {},
  rangeSection: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  rangeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rangeChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rangeChipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  rangeChipTextActive: {
    color: theme.colors.surface,
  },
  customRangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateButton: {
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateButtonText: {
    flex: 1,
  },
  dateButtonLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  dateButtonValue: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  legendLabel: {
    fontSize: fontSize.xs,
    color: theme.colors.textMuted,
  },
  legendValue: {
    marginTop: 2,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  legendRight: {
    alignItems: 'flex-end',
  },
  chartWrapper: {
    marginTop: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  axisLabels: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  axisLabelGroup: {
    flex: 1,
  },
  axisLabelGroupRight: {
    alignItems: 'flex-end',
  },
  axisLabelCaption: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: theme.colors.iconMuted,
  },
  axisLabelText: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  singlePointHint: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  filteredEmptyState: {
    marginTop: spacing.md,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  filteredEmptyTitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  filteredEmptyText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  listCard: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  sectionDescription: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: theme.colors.textMuted,
  },
  recordList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recordRowSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primaryBorder,
  },
  recordCopy: {
    flex: 1,
  },
  recordValue: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  recordDate: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: theme.colors.textMuted,
  },
  recordNote: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: theme.colors.textSecondary,
  },
  recordsEmpty: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.88,
  },
});
