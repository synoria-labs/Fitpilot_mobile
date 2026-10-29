import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { spacing } from '../../constants/colors';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { MuscleVolumeResponse } from '../../types';
import { AuroraCard, AuroraPill, IconBadge } from '../aurora';
import { ChartSkeleton } from '../common/Skeleton';

const MAX_MUSCLES_SHOWN = 6;
const SESSION_LANDMARK_MAX = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getSessionVolumeFillRatio = (effectiveSets: number) =>
  clamp(effectiveSets / SESSION_LANDMARK_MAX, 0, 1);

interface ActivityChartProps {
  muscleVolume: MuscleVolumeResponse | null;
  isLoading?: boolean;
  countSecondaryMuscles: boolean;
  onToggleSecondary: (value: boolean) => void;
  contentWidth?: number;
  horizontalPadding?: number;
  maxRows?: number;
  collapsible?: boolean;
  compact?: boolean;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  muscleVolume,
  isLoading = false,
  countSecondaryMuscles,
  onToggleSecondary,
  contentWidth = 390,
  horizontalPadding = spacing.md,
  maxRows = MAX_MUSCLES_SHOWN,
  collapsible = false,
  compact = false,
}) => {
  const aurora = useAurora();
  const [isExpanded, setIsExpanded] = useState(false);
  // Card padding and border come off the row; a third of it leaves room for names like
  // "Deltoides anterior" while the bars keep most of the width.
  const rowWidth = contentWidth - horizontalPadding * 2 - 34;
  const labelWidth = clamp(Math.round(rowWidth * 0.36), 96, 150);

  const allMuscles = useMemo(() => muscleVolume?.muscles ?? [], [muscleVolume]);
  const hasHiddenMuscles = collapsible && allMuscles.length > maxRows;
  const hiddenRowsCount = Math.max(0, Math.min(MAX_MUSCLES_SHOWN, allMuscles.length) - maxRows);
  const muscles = useMemo(() => {
    const rows = Math.max(1, maxRows);
    const limit = hasHiddenMuscles && isExpanded ? MAX_MUSCLES_SHOWN : rows;

    return allMuscles.slice(0, limit);
  }, [allMuscles, hasHiddenMuscles, isExpanded, maxRows]);

  const outerStyle = [compact ? styles.outerCompact : styles.outer, { paddingHorizontal: horizontalPadding }];

  if (isLoading) {
    return (
      <View style={outerStyle}>
        <ChartSkeleton />
      </View>
    );
  }

  const totalSets = Math.round(muscleVolume?.total_effective_sets || 0);
  const hasData = Boolean(muscleVolume) && muscles.length > 0;

  return (
    <View style={outerStyle}>
      <AuroraCard padding={16}>
        <View style={styles.header}>
          <IconBadge icon="barbell-outline" tone="blue" variant="solid" size={36} />
          <View style={styles.titleCopy}>
            <Text style={[auroraType.headline, { color: aurora.text }]} numberOfLines={1}>
              Volumen del entrenamiento
            </Text>
            <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
              Series efectivas por músculo
            </Text>
          </View>
          {hasData ? <AuroraPill label={`${totalSets} series`} tone="blue" /> : null}
        </View>

        {hasData ? (
          <>
            <View style={[styles.toggleRow, { borderColor: aurora.border }]}>
              <Text style={[styles.toggleLabel, auroraFont('semibold'), { color: aurora.muted }]} numberOfLines={1}>
                Contar sinergistas (×0.5)
              </Text>
              <Switch
                accessibilityLabel="Contar el volumen de los músculos sinergistas a la mitad"
                value={countSecondaryMuscles}
                onValueChange={onToggleSecondary}
                trackColor={{ false: aurora.surface3, true: aurora.tones.blue.tone }}
                thumbColor="#ffffff"
                ios_backgroundColor={aurora.surface3}
                style={styles.switch}
              />
            </View>

            <View style={styles.bars}>
              {muscles.map((muscle, index) => (
                <MuscleBar key={muscle.muscle_name} muscle={muscle} index={index} labelWidth={labelWidth} />
              ))}
            </View>

            {hasHiddenMuscles ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                hitSlop={8}
                onPress={() => setIsExpanded((currentValue) => !currentValue)}
                style={styles.expandButton}
              >
                <Text style={[styles.expandText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>
                  {isExpanded ? 'Ver menos' : `Ver ${hiddenRowsCount} más`}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={aurora.tones.blue.ink}
                />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: aurora.surface2 }]}>
            <Ionicons name="bar-chart-outline" size={18} color={aurora.faint} />
            <Text style={[auroraType.caption, { color: aurora.faint }]}>
              Sin datos de volumen para esta sesión
            </Text>
          </View>
        )}
      </AuroraCard>
    </View>
  );
};

interface MuscleBarProps {
  muscle: { muscle_name: string; display_name: string; effective_sets: number };
  index: number;
  labelWidth: number;
}

const MuscleBar: React.FC<MuscleBarProps> = ({ muscle, index, labelWidth }) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const ratio = getSessionVolumeFillRatio(muscle.effective_sets);
  const fill = useSharedValue(reduceMotion ? ratio : 0);
  const hasAnimatedRef = useRef(false);

  // The first fill staggers row by row; later changes (the synergist switch) glide from where
  // the bar already is.
  useEffect(() => {
    if (reduceMotion) {
      fill.value = ratio;
      return;
    }

    const grow = withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) });
    fill.value = hasAnimatedRef.current ? grow : withDelay(120 + index * 70, grow);
    hasAnimatedRef.current = true;
  }, [fill, index, ratio, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const value = muscle.effective_sets.toFixed(1);

  return (
    <View
      accessible
      accessibilityLabel={`${muscle.display_name}: ${value} series efectivas`}
      style={styles.barRow}
    >
      <Text
        style={[styles.muscleLabel, auroraFont('semibold'), { width: labelWidth, color: aurora.text }]}
        numberOfLines={1}
      >
        {muscle.display_name}
      </Text>
      <View style={[styles.track, { backgroundColor: aurora.surface3 }]}>
        <Animated.View style={[styles.fill, fillStyle]}>
          <LinearGradient
            colors={aurora.tones.blue.gradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <Text style={[styles.valueLabel, auroraFont('extrabold'), { color: aurora.text }]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    marginVertical: spacing.md,
  },
  outerCompact: {
    marginVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 12.5,
  },
  switch: {
    transform: [{ scale: 0.86 }],
    marginRight: -4,
  },
  bars: {
    gap: 10,
    marginTop: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  muscleLabel: {
    fontSize: 13,
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    overflow: 'hidden',
  },
  valueLabel: {
    minWidth: 30,
    fontSize: 13,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 36,
    marginTop: 6,
  },
  expandText: {
    fontSize: 13,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
  },
});

export default ActivityChart;
