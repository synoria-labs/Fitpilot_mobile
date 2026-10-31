import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { RepRangeBucket, RepRangeChartPoint } from '../../types';
import { auroraFont, auroraType, getRepRangeColor, useAurora } from '../../theme/aurora';
import { AuroraCard } from '../aurora';
import { formatLocalDate, getStartOfLocalWeekDateKey } from '../../utils/date';

interface RepRangeVolumeChartProps {
  points: RepRangeChartPoint[];
  repRanges: RepRangeBucket[];
  selectedBucketId?: string | null;
  /** Tapping a range filters exercises and sessions; without it the legend is read-only. */
  onSelectBucket?: (bucketId: string | null) => void;
  onEditRanges?: () => void;
}

const CHART_HEIGHT = 200;
const MAX_STACK = 150;
const COLUMN = 54;
const STACK = 40;
const SCROLL_GAP = 12;
const GROW_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const formatTons = (kilograms: number) =>
  (kilograms / 1000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The stack rises from the baseline once, when its column first shows these numbers. */
const GrowingStack = ({
  delay,
  children,
  style,
}: {
  delay: number;
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}) => {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, { duration: 800, easing: GROW_EASING }));
  }, [delay, progress, reduceMotion]);

  const growStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: progress.value }] }));

  return <Animated.View style={[style, styles.growOrigin, growStyle]}>{children}</Animated.View>;
};

/** Volumen semanal con carga, apilado por rango de repeticiones. */
export function RepRangeVolumeChart({
  points,
  repRanges,
  selectedBucketId = null,
  onSelectBucket,
  onEditRanges,
}: RepRangeVolumeChartProps) {
  const aurora = useAurora();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const totals = points.map((point) =>
    repRanges.reduce((sum, bucket) => sum + Math.max(0, point.totals[bucket.id] ?? 0), 0),
  );
  const maxTotal = Math.max(1, ...totals);
  const hasData = points.length > 0 && totals.some((total) => total > 0);
  const currentWeek = getStartOfLocalWeekDateKey();
  // Up to a handful of weeks fill the card; a longer window scrolls and opens on the latest.
  const scrolls = width > 0 && points.length * COLUMN + (points.length - 1) * SCROLL_GAP > width - 12;
  const dominant = repRanges
    .map((bucket, index) => ({
      bucket,
      index,
      volume: points.reduce((sum, point) => sum + Math.max(0, point.totals[bucket.id] ?? 0), 0),
    }))
    .sort((left, right) => right.volume - left.volume)[0];
  const select = (id: string) => onSelectBucket?.(id === selectedBucketId ? null : id);

  const columns = points.map((point, index) => {
    const isCurrent = point.week_start === currentWeek;
    const weekLabel = formatLocalDate(point.week_start, { day: 'numeric', month: 'long' });
    const segments = repRanges
      .map((bucket, bucketIndex) => ({
        bucket,
        color: getRepRangeColor(aurora, bucketIndex),
        value: Math.max(0, point.totals[bucket.id] ?? 0),
      }))
      .filter((segment) => segment.value > 0)
      .reverse();

    return (
      <View
        key={`${point.week_start}-${Math.round(totals[index])}`}
        accessible
        accessibilityLabel={`Semana del ${weekLabel}: ${formatTons(totals[index])} toneladas${isCurrent ? ', en curso' : ''}`}
        style={styles.column}
      >
        <Text
          style={[
            styles.total,
            auroraFont('extrabold'),
            { color: isCurrent ? aurora.faint : aurora.text },
          ]}
        >
          {formatTons(totals[index])} t
        </Text>
        <GrowingStack delay={200 + index * 90} style={[styles.stack, isCurrent ? styles.currentStack : null]}>
          {segments.map((segment, segmentIndex) => (
            <View
              key={segment.bucket.id}
              style={[
                {
                  height: Math.max(3, Math.round((segment.value / maxTotal) * MAX_STACK)),
                  backgroundColor: segment.color,
                  opacity: selectedBucketId && selectedBucketId !== segment.bucket.id ? 0.25 : 1,
                },
                segmentIndex === 0 ? styles.topSegment : null,
              ]}
            />
          ))}
        </GrowingStack>
      </View>
    );
  });

  const axis = points.map((point) => (
    <Text
      key={point.week_start}
      numberOfLines={1}
      style={[styles.axisLabel, auroraFont('bold'), { color: aurora.faint }]}
    >
      {point.week_start === currentWeek
        ? 'Esta sem.'
        : formatLocalDate(point.week_start, { day: 'numeric', month: 'short' }).replace('.', '')}
    </Text>
  ));

  return (
    <AuroraCard padding={18} radius={24}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[auroraType.headline, { color: aurora.text }]}>Volumen por rango de reps</Text>
          <Text style={[auroraType.caption, styles.subtitle, { color: aurora.faint }]}>
            Toneladas por semana (kg × reps)
          </Text>
        </View>
        {onEditRanges ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editar rangos de repeticiones"
            onPress={onEditRanges}
            style={[
              styles.editButton,
              { backgroundColor: aurora.tones.blue.soft, borderColor: aurora.tones.blue.line },
            ]}
          >
            <Ionicons name="options-outline" size={14} color={aurora.tones.blue.ink} />
            <Text style={[styles.editLabel, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>Rangos</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.legend}>
        {repRanges.map((bucket, index) => {
          const selected = bucket.id === selectedBucketId;
          return (
            <Pressable
              key={bucket.id}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${bucket.label} repeticiones`}
              accessibilityState={{ selected, disabled: !onSelectBucket }}
              disabled={!onSelectBucket}
              hitSlop={6}
              onPress={() => select(bucket.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? aurora.tones.blue.soft : aurora.surface2,
                  borderColor: selected ? aurora.tones.blue.line : aurora.border,
                  opacity: selectedBucketId && !selected ? 0.45 : 1,
                },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: getRepRangeColor(aurora, index) }]} />
              <Text
                style={[
                  styles.chipLabel,
                  auroraFont('bold'),
                  { color: selected ? aurora.tones.blue.ink : aurora.muted },
                ]}
              >
                {bucket.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hasData ? (
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {scrolls ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              <View>
                <View style={[styles.chart, styles.scrollRow]}>
                  <View style={[styles.baseline, { borderTopColor: aurora.borderStrong }]} />
                  {columns}
                </View>
                <View style={[styles.axis, styles.scrollRow]}>{axis}</View>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={[styles.chart, styles.spreadRow]}>
                <View style={[styles.baseline, { borderTopColor: aurora.borderStrong }]} />
                {columns}
              </View>
              <View style={[styles.axis, styles.spreadRow]}>{axis}</View>
            </>
          )}
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: aurora.surface2 }]}>
          <Text style={[auroraType.caption, { color: aurora.faint }]}>
            Sin volumen con carga en este periodo. Completa sesiones con peso para ver cómo se reparte por
            semana.
          </Text>
        </View>
      )}

      <View style={[styles.hint, { backgroundColor: aurora.surface2 }]}>
        <Text style={[styles.hintText, auroraFont('medium'), { color: aurora.muted }]}>
          {hasData && dominant && dominant.volume > 0
            ? `El ${dominant.bucket.label} domina tu volumen en este periodo. `
            : ''}
          {onSelectBucket
            ? 'Toca un rango para filtrar ejercicios y sesiones.'
            : 'Volumen semanal con carga, repartido por rango de repeticiones.'}
        </Text>
      </View>
    </AuroraCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 3,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  editLabel: {
    fontSize: 12.5,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  chipLabel: {
    fontSize: 12,
  },
  chart: {
    height: CHART_HEIGHT,
    marginTop: 18,
    alignItems: 'flex-end',
  },
  spreadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: SCROLL_GAP,
    paddingHorizontal: 6,
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
  },
  column: {
    width: COLUMN,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  total: {
    marginBottom: 6,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  stack: {
    width: STACK,
    gap: 2,
  },
  currentStack: {
    opacity: 0.55,
  },
  growOrigin: {
    transformOrigin: 'bottom',
  },
  topSegment: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  axis: {
    marginTop: 8,
  },
  axisLabel: {
    width: COLUMN,
    fontSize: 11,
    textAlign: 'center',
  },
  empty: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
  },
  hint: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  hintText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});

export default RepRangeVolumeChart;
