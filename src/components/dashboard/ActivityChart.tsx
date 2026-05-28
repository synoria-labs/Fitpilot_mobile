import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient as ExpoGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { borderRadius, brandColors, colors, fontSize, shadows, spacing } from '../../constants/colors';
import { useAppTheme } from '../../theme';
import type { MuscleVolumeResponse } from '../../types';
import { ChartSkeleton } from '../common/Skeleton';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const MAX_MUSCLES_SHOWN = 6;
const SESSION_LANDMARK_MAX = 12;

const DEFAULT_BAR_METRICS = {
  barHeight: 20,
  trackVerticalPadding: 4,
  trackRadius: 6,
};

const COMPACT_BAR_METRICS = {
  barHeight: 16,
  trackVerticalPadding: 4,
  trackRadius: 5,
};

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
  const { theme } = useAppTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const animationProgress = useSharedValue(0);
  const containerWidth = Math.max(320, contentWidth - horizontalPadding * 2);
  const chartHorizontalPadding = compact ? spacing.md : spacing.lg;
  const chartWidth = Math.max(220, containerWidth - chartHorizontalPadding * 2);
  const labelWidth = chartWidth >= 720 ? 128 : chartWidth >= 560 ? 112 : compact ? 86 : 96;
  const valueWidth = compact ? 38 : 48;
  const barAreaWidth = Math.max(80, chartWidth - labelWidth - valueWidth - spacing.sm);
  const gradientColors = theme.isDark
    ? ([brandColors.navy, brandColors.sky] as const)
    : ([`${brandColors.sky}22`, `${brandColors.navy}14`] as const);
  const textColor = theme.isDark ? colors.white : brandColors.navy;
  const subtextColor = theme.isDark ? 'rgba(255,255,255,0.72)' : `${brandColors.navy}AA`;

  useEffect(() => {
    if (muscleVolume && !isLoading) {
      animationProgress.value = 0;
      animationProgress.value = withDelay(
        200,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [animationProgress, isLoading, muscleVolume]);

  const allMuscles = useMemo(() => muscleVolume?.muscles ?? [], [muscleVolume]);
  const hasHiddenMuscles = collapsible && allMuscles.length > maxRows;
  const hiddenRowsCount = Math.max(0, Math.min(MAX_MUSCLES_SHOWN, allMuscles.length) - maxRows);
  const muscles = useMemo(() => {
    const rows = Math.max(1, maxRows);
    const limit = hasHiddenMuscles && isExpanded ? MAX_MUSCLES_SHOWN : rows;

    return allMuscles.slice(0, limit);
  }, [allMuscles, hasHiddenMuscles, isExpanded, maxRows]);

  if (isLoading) {
    return (
      <View
        style={[
          styles.skeletonWrapper,
          compact ? styles.skeletonWrapperCompact : null,
          { width: containerWidth, alignSelf: 'center' },
        ]}
      >
        <ChartSkeleton />
      </View>
    );
  }

  const totalSets = Math.round(muscleVolume?.total_effective_sets || 0);

  if (!muscleVolume || muscles.length === 0) {
    return (
      <View
        style={[
          styles.container,
          compact ? styles.containerCompact : null,
          {
            width: containerWidth,
            alignSelf: 'center',
            borderWidth: 1,
            borderColor: theme.isDark ? theme.colors.borderStrong : theme.colors.border,
          },
        ]}
      >
        <ExpoGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[styles.title, compact ? styles.titleCompact : null, { color: textColor }]}>
          Volumen de entrenamiento por sesion
        </Text>
        <View style={[styles.emptyState, compact ? styles.emptyStateCompact : null]}>
          <Text style={[styles.emptyText, { color: subtextColor }]}>Sin datos de volumen</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        compact ? styles.containerCompact : null,
        {
          width: containerWidth,
          alignSelf: 'center',
          borderWidth: theme.isDark ? 0 : 1,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <ExpoGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, compact ? styles.headerCompact : null]}>
        <Text style={[styles.title, compact ? styles.titleCompact : null, { color: textColor }]} numberOfLines={2}>
          Volumen del entrenamiento
        </Text>
        <View
          style={[
            styles.badge,
            compact ? styles.badgeCompact : null,
            { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : `${brandColors.sky}22` },
          ]}
        >
          <Text style={[styles.badgeText, compact ? styles.badgeTextCompact : null, { color: textColor }]}>
            {totalSets} series
          </Text>
        </View>
      </View>

      <View style={[styles.toggleRow, compact ? styles.toggleRowCompact : null]}>
        <Text
          style={[styles.toggleLabel, compact ? styles.toggleLabelCompact : null, { color: subtextColor }]}
          numberOfLines={1}
        >
          {compact ? 'Sinergistas 0.5x' : 'Contar volumen de sinergistas(0.5x)'}
        </Text>
        <Switch
          value={countSecondaryMuscles}
          onValueChange={onToggleSecondary}
          trackColor={{
            false: theme.isDark ? 'rgba(255,255,255,0.3)' : `${brandColors.sky}44`,
            true: theme.isDark ? 'rgba(255,255,255,0.6)' : brandColors.sky,
          }}
          thumbColor={countSecondaryMuscles ? (theme.isDark ? colors.white : brandColors.navy) : colors.gray[300]}
          style={compact ? styles.switchCompact : null}
        />
      </View>

      <View style={[styles.chartContainer, compact ? styles.chartContainerCompact : null]}>
        {muscles.map((muscle) => (
          <MuscleBar
            key={muscle.muscle_name}
            muscle={muscle}
            labelWidth={labelWidth}
            valueWidth={valueWidth}
            barAreaWidth={barAreaWidth}
            animationProgress={animationProgress}
            textColor={textColor}
            barFill={theme.isDark ? 'rgba(255,255,255,0.9)' : brandColors.navy}
            barBg={theme.isDark ? 'rgba(255,255,255,0.15)' : `${brandColors.sky}30`}
            compact={compact}
          />
        ))}
      </View>

      {hasHiddenMuscles ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsExpanded((currentValue) => !currentValue)}
          style={[
            styles.expandButton,
            compact ? styles.expandButtonCompact : null,
            {
              backgroundColor: theme.isDark
                ? 'rgba(255,255,255,0.14)'
                : `${brandColors.sky}18`,
            },
          ]}
        >
          <Text style={[styles.expandButtonText, { color: textColor }]}>
            {isExpanded ? 'Ver menos' : `Ver ${hiddenRowsCount} mas`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

interface MuscleBarProps {
  muscle: { muscle_name: string; display_name: string; effective_sets: number };
  labelWidth: number;
  valueWidth: number;
  barAreaWidth: number;
  animationProgress: SharedValue<number>;
  textColor?: string;
  barFill?: string;
  barBg?: string;
  compact?: boolean;
}

const MuscleBar: React.FC<MuscleBarProps> = ({
  muscle,
  labelWidth,
  valueWidth,
  barAreaWidth,
  animationProgress,
  textColor = colors.white,
  barFill = colors.white,
  barBg = 'rgba(255,255,255,0.15)',
  compact = false,
}) => {
  const metrics = compact ? COMPACT_BAR_METRICS : DEFAULT_BAR_METRICS;
  const trackHeight = metrics.barHeight - metrics.trackVerticalPadding * 2;
  const barWidth = getSessionVolumeFillRatio(muscle.effective_sets) * barAreaWidth;

  const animatedProps = useAnimatedProps(() => ({
    width: barWidth * animationProgress.value,
  }));

  return (
    <View style={[styles.barRow, compact ? styles.barRowCompact : null]}>
      <Text
        style={[
          styles.muscleLabel,
          compact ? styles.muscleLabelCompact : null,
          { width: labelWidth, color: textColor },
        ]}
        numberOfLines={1}
      >
        {muscle.display_name}
      </Text>
      <View style={styles.barContainer}>
        <Svg height={metrics.barHeight} width={barAreaWidth}>
          <Rect
            x={0}
            y={metrics.trackVerticalPadding}
            width={barAreaWidth}
            height={trackHeight}
            rx={metrics.trackRadius}
            fill={barBg}
          />
          <AnimatedRect
            x={0}
            y={metrics.trackVerticalPadding}
            height={trackHeight}
            rx={metrics.trackRadius}
            fill={barFill}
            fillOpacity={0.9}
            animatedProps={animatedProps}
          />
        </Svg>
      </View>
      <Text
        style={[
          styles.valueLabel,
          compact ? styles.valueLabelCompact : null,
          { width: valueWidth, color: textColor },
        ]}
      >
        {muscle.effective_sets.toFixed(1)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.lg,
  },
  containerCompact: {
    marginVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  skeletonWrapper: {
    marginVertical: spacing.md,
  },
  skeletonWrapperCompact: {
    marginVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerCompact: {
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
  },
  titleCompact: {
    fontSize: fontSize.base,
    lineHeight: 20,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  badgeTextCompact: {
    fontSize: fontSize.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  toggleRowCompact: {
    marginBottom: 0,
    paddingVertical: 0,
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSize.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  toggleLabelCompact: {
    fontSize: 11,
    fontWeight: '700',
  },
  switchCompact: {
    transform: [{ scale: 0.82 }],
    marginRight: -6,
  },
  chartContainer: {
    marginTop: spacing.sm,
  },
  chartContainerCompact: {
    marginTop: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  barRowCompact: {
    marginBottom: 3,
  },
  muscleLabel: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '500',
    paddingRight: spacing.sm,
  },
  muscleLabelCompact: {
    fontSize: 11,
    paddingRight: spacing.xs,
  },
  barContainer: {
    flex: 1,
  },
  valueLabel: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  valueLabelCompact: {
    fontSize: 11,
  },
  emptyState: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateCompact: {
    height: 48,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  expandButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  expandButtonCompact: {
    marginTop: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  expandButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
});

export default ActivityChart;
