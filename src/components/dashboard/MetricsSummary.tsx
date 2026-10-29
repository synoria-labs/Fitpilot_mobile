import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { spacing } from '../../constants/colors';
import { StatCardSkeleton } from '../common/Skeleton';
import { IconBadge, Sparkline, type AuroraIconName } from '../aurora';
import { listMyMeasurements } from '../../services/measurements';
import type { ApiError } from '../../types';
import { auroraFont, auroraRadius, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import {
  type MeasurementPreference,
  useMeasurementPreferenceStore,
} from '../../store/measurementPreferenceStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { convertMeasurementUnitValue } from '../../utils/measurementUnits';
import {
  formatMeasurementDate,
  formatMeasurementNumber,
  getWeightChangePreference,
  type MeasurementChangePreference,
} from '../../utils/measurements';
import {
  buildMeasurementSummaries,
  type MeasurementSummaryItem,
} from '../../utils/measurementSummaries';

interface MetricsSummaryProps {
  onPress?: () => void;
  contentWidth: number;
  horizontalPadding?: number;
}

const GRID_GAP = 12;

const METRIC_TONES: Record<MeasurementSummaryItem['key'], AuroraTone> = {
  weight_kg: 'violet',
  body_fat_pct: 'rose',
  muscle_mass_kg: 'emerald',
  visceral_fat: 'amber',
};

export const MetricsSummary: React.FC<MetricsSummaryProps> = ({
  onPress,
  contentWidth,
  horizontalPadding = spacing.md,
}) => {
  const aurora = useAurora();
  const [metrics, setMetrics] = useState<MeasurementSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const measurementPreference = useMeasurementPreferenceStore((state) => state.preference);
  const initializeMeasurementPreference = useMeasurementPreferenceStore((state) => state.initialize);
  const programObjective = useWorkoutStore((state) => state.dashboardBootstrap?.program?.objective ?? null);
  const weightPreference = getWeightChangePreference(programObjective);

  useEffect(() => {
    void loadMetrics();
  }, []);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await listMyMeasurements(1, 100, { skipErrorLogging: true });
      setMetrics(buildMeasurementSummaries(response.data));
    } catch (loadError) {
      const apiError = loadError as ApiError;

      if (apiError.status !== 403 && apiError.status !== 404 && apiError.status !== 501) {
        setError('Error al cargar métricas');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const columns = contentWidth >= 720 ? 4 : 2;
  const tileWidth = (contentWidth - horizontalPadding * 2 - GRID_GAP * (columns - 1)) / columns;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingHorizontal: horizontalPadding }]}>
        <Text style={[auroraType.title, { color: aurora.text }]}>Mis métricas</Text>
        <View style={styles.grid}>
          {Array.from({ length: 4 }, (_, index) => (
            <View key={`metrics-summary-skeleton-${index}`} style={{ width: tileWidth }}>
              <StatCardSkeleton />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (error || metrics.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingHorizontal: horizontalPadding }]}>
      <View style={styles.header}>
        <Text style={[auroraType.title, { color: aurora.text }]}>Mis métricas</Text>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todas las medidas"
            hitSlop={10}
            onPress={onPress}
            style={styles.seeAll}
          >
            <Text style={[styles.seeAllText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>Ver todo</Text>
            <Ionicons name="chevron-forward" size={15} color={aurora.tones.blue.ink} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.grid}>
        {metrics.slice(0, 4).map((metric, index) => (
          <Animated.View key={metric.key} entering={FadeInUp.delay(index * 90).duration(420)}>
            <MetricTile
              metric={metric}
              width={tileWidth}
              measurementPreference={measurementPreference}
              weightPreference={weightPreference}
              onPress={onPress}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
};

interface MetricTileProps {
  metric: MeasurementSummaryItem;
  width: number;
  measurementPreference: MeasurementPreference;
  weightPreference: MeasurementChangePreference;
  onPress?: () => void;
}

const MetricTile: React.FC<MetricTileProps> = ({
  metric,
  width,
  measurementPreference,
  weightPreference,
  onPress,
}) => {
  const aurora = useAurora();
  const toneKey = METRIC_TONES[metric.key];
  const tone = aurora.tones[toneKey];
  const converted = convertMeasurementUnitValue(metric.latestValue, metric.unit, measurementPreference);
  const change = metric.changeFromPrevious;
  const convertedChange =
    change === null ? null : convertMeasurementUnitValue(Math.abs(change), metric.unit, measurementPreference);

  // Whether a change is good depends on the metric, and for weight on the program's goal.
  const preferred: MeasurementChangePreference =
    metric.key === 'weight_kg' ? weightPreference : metric.emphasizeDecrease ? 'decrease' : 'increase';
  const hasChange = change !== null && change !== 0 && convertedChange !== null;
  const isGood = hasChange && preferred !== 'neutral' && (preferred === 'decrease' ? change < 0 : change > 0);
  const isBad = hasChange && preferred !== 'neutral' && !isGood;
  const pillTone = isGood ? aurora.tones.emerald : isBad ? aurora.tones.amber : aurora.tones.slate;
  // A change in body-fat percentage is in points, not in percent of the value.
  const changeUnit = convertedChange?.unit === '%' ? 'pts' : convertedChange?.unit ?? '';
  const changeLabel = hasChange
    ? `${change > 0 ? '+' : '−'}${formatMeasurementNumber(convertedChange.value, 1)} ${changeUnit}`
    : null;
  const history = metric.history.map(
    (value) => convertMeasurementUnitValue(value, metric.unit, measurementPreference).value,
  );
  const valueText = formatMeasurementNumber(converted.value, 1);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${metric.label}: ${valueText} ${converted.unit}${changeLabel ? `, ${changeLabel}` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          backgroundColor: aurora.surface,
          borderColor: aurora.border,
          boxShadow: aurora.shadow,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <IconBadge icon={metric.icon as AuroraIconName} tone={toneKey} size={34} />
      <Text style={[auroraType.label, styles.label, { color: aurora.faint }]} numberOfLines={1}>
        {metric.label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}>{valueText}</Text>
        <Text style={[styles.unit, auroraFont('bold'), { color: aurora.faint }]}>{converted.unit}</Text>
      </View>
      <View style={styles.changeRow}>
        {changeLabel ? (
          <View style={[styles.pill, { backgroundColor: pillTone.soft }]}>
            <Text style={[styles.pillText, auroraFont('extrabold'), { color: pillTone.ink }]}>{changeLabel}</Text>
          </View>
        ) : (
          <Text style={[auroraType.caption, { color: aurora.faint }]}>Sin comparativo</Text>
        )}
        {changeLabel && metric.previousDate ? (
          <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
            vs. {formatMeasurementDate(metric.previousDate, 'short')}
          </Text>
        ) : null}
      </View>
      <View style={styles.spark}>
        <Sparkline values={history} color={tone.tone} width={width - 32} height={30} area={false} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
  },
  seeAllText: {
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    marginTop: 4,
  },
  tile: {
    padding: 16,
    borderRadius: auroraRadius.card,
    borderWidth: 1,
  },
  label: {
    marginTop: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  value: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  spark: {
    marginTop: 10,
  },
});
