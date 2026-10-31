import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { spacing } from '../../constants/colors';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { MuscleVolumeResponse } from '../../types';
import { AuroraCard } from '../aurora';
import { Skeleton } from '../common/Skeleton';

const MAX_MUSCLES_SHOWN = 6;
const SESSION_LANDMARK_SETS = 12;
const KNOB_SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface ActivityChartProps {
  muscleVolume: Pick<MuscleVolumeResponse, 'muscles' | 'total_effective_sets'> | null;
  isLoading?: boolean;
  countSecondaryMuscles: boolean;
  onToggleSecondary: (value: boolean) => void;
  horizontalPadding?: number;
  maxRows?: number;
  collapsible?: boolean;
  title?: string;
  /** Defaults to the effective sets of what is shown. */
  subtitle?: string;
  /** Effective sets that fill a bar: a session tops out lower than a whole week. */
  landmarkSets?: number;
  emptyMessage?: string;
  onRetry?: () => void;
}

/** Series efectivas por músculo, con el interruptor que cuenta a los sinergistas a la mitad. */
export const ActivityChart: React.FC<ActivityChartProps> = ({
  muscleVolume,
  isLoading = false,
  countSecondaryMuscles,
  onToggleSecondary,
  horizontalPadding = spacing.md,
  maxRows = MAX_MUSCLES_SHOWN,
  collapsible = false,
  title = 'Series por músculo',
  subtitle,
  landmarkSets = SESSION_LANDMARK_SETS,
  emptyMessage = 'Sin series para mostrar.',
  onRetry,
}) => {
  const aurora = useAurora();
  const [isExpanded, setIsExpanded] = useState(false);

  const allMuscles = useMemo(() => muscleVolume?.muscles ?? [], [muscleVolume]);
  const hasHiddenMuscles = collapsible && allMuscles.length > maxRows;
  const hiddenRowsCount = Math.max(0, allMuscles.length - maxRows);
  const muscles = hasHiddenMuscles && !isExpanded ? allMuscles.slice(0, Math.max(1, maxRows)) : allMuscles;
  // No bar overflows: a muscle above the landmark sets the scale instead.
  const scale = Math.max(landmarkSets, ...allMuscles.map((muscle) => muscle.effective_sets));
  const hasData = muscles.length > 0;
  const totalSets = Math.round(muscleVolume?.total_effective_sets ?? 0);

  return (
    <View style={{ paddingHorizontal: horizontalPadding }}>
      <AuroraCard padding={18} radius={24}>
        <View style={styles.header}>
          <View style={styles.titleCopy}>
            <Text style={[auroraType.headline, { color: aurora.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[auroraType.caption, styles.subtitle, { color: aurora.faint }]} numberOfLines={1}>
              {subtitle ?? `${totalSets} series efectivas`}
            </Text>
          </View>
          <SynergistSwitch value={countSecondaryMuscles} onChange={onToggleSecondary} />
        </View>

        {isLoading && !hasData ? (
          <View style={styles.bars}>
            {[0.75, 0.6, 0.5, 0.4, 0.3].map((ratio) => (
              <View key={ratio} style={styles.skeletonRow}>
                <Skeleton width={`${Math.round(ratio * 100)}%`} height={12} borderRadius={6} />
                <Skeleton width="100%" height={8} borderRadius={4} />
              </View>
            ))}
          </View>
        ) : hasData ? (
          <>
            <View style={styles.bars}>
              {muscles.map((muscle, index) => (
                <MuscleBar key={muscle.muscle_name} muscle={muscle} index={index} scale={scale} />
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
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={aurora.tones.blue.ink} />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: aurora.surface2 }]}>
            <Ionicons name="bar-chart-outline" size={18} color={aurora.faint} />
            <Text style={[auroraType.caption, styles.emptyText, { color: aurora.faint }]}>{emptyMessage}</Text>
            {onRetry ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
                <Text style={[styles.expandText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>Reintentar</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </AuroraCard>
    </View>
  );
};

const SynergistSwitch = ({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const knob = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    knob.value = reduceMotion ? (value ? 1 : 0) : withSpring(value ? 1 : 0, KNOB_SPRING);
  }, [knob, reduceMotion, value]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 14 }] }));
  const onStyle = useAnimatedStyle(() => ({ opacity: knob.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Contar a los sinergistas a la mitad"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.switchButton, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}
    >
      <Text style={[styles.switchLabel, auroraFont('bold'), { color: aurora.muted }]}>Sinergistas ×0.5</Text>
      <View style={[styles.switchTrack, { backgroundColor: aurora.surface3 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, onStyle]}>
          <LinearGradient
            colors={aurora.tones.blue.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.switchFill]}
          />
        </Animated.View>
        <Animated.View style={[styles.switchKnob, knobStyle]} />
      </View>
    </Pressable>
  );
};

interface MuscleBarProps {
  muscle: { muscle_name: string; display_name: string; effective_sets: number };
  index: number;
  scale: number;
}

const MuscleBar: React.FC<MuscleBarProps> = ({ muscle, index, scale }) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const ratio = clamp(muscle.effective_sets / scale, 0, 1);
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
  const value = muscle.effective_sets.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <View accessible accessibilityLabel={`${muscle.display_name}: ${value} series efectivas`}>
      <View style={styles.barLabels}>
        <Text style={[styles.muscleLabel, auroraFont('semibold'), { color: aurora.text }]} numberOfLines={1}>
          {muscle.display_name}
        </Text>
        <Text style={[styles.valueLabel, auroraFont('extrabold'), { color: aurora.text }]}>{value}</Text>
      </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 3,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchLabel: {
    fontSize: 12,
  },
  switchTrack: {
    width: 34,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  switchFill: {
    borderRadius: 10,
  },
  switchKnob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    boxShadow: '0px 1px 3px 0px rgba(15, 23, 42, 0.3)',
  },
  bars: {
    gap: 12,
    marginTop: 16,
  },
  skeletonRow: {
    gap: 6,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  muscleLabel: {
    flexShrink: 1,
    fontSize: 13,
  },
  valueLabel: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 36,
    marginTop: 8,
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
  emptyText: {
    flex: 1,
  },
});

export default ActivityChart;
