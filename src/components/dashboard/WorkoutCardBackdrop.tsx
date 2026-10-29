import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { brandColors } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { ProgramTimelineCardSessionState } from '../../utils/programTimeline';

type WorkoutCardVisualState = 'focused' | 'overdue' | 'in_progress' | 'completed' | 'abandoned';

interface WorkoutCardBackdropProps {
  cardState: ProgramTimelineCardSessionState;
  cardWidth: number;
  cardHeight: number;
  shapePath: string;
}

interface WorkoutCardPalette {
  baseColors: readonly [string, string, string];
  accentColor: string;
  stateAccent: string;
  borderColor: string;
  traceColor: string;
  bottomGlowColor: string;
  neutralGlowColor: string;
}

const AnimatedView = Animated.createAnimatedComponent(View);

const normalizeComparableText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const withAlpha = (color: string, alpha: number) => {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));

  if (color.startsWith('#')) {
    const normalized = color.slice(1);
    const hex =
      normalized.length === 3
        ? normalized
            .split('')
            .map((chunk) => chunk + chunk)
            .join('')
        : normalized.slice(0, 6);

    if (hex.length !== 6) {
      return color;
    }

    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
  }

  const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (rgbMatch) {
    const [, red, green, blue] = rgbMatch;
    return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
  }

  const rgbaMatch = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i);
  if (rgbaMatch) {
    const [, red, green, blue] = rgbaMatch;
    return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
  }

  return color;
};

const getVisualState = (cardState: ProgramTimelineCardSessionState): WorkoutCardVisualState => {
  switch (cardState.session.actual_status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'abandoned':
      return 'abandoned';
    default:
      return cardState.recommendation === 'overdue' ? 'overdue' : 'focused';
  }
};

const getFocusAccent = (cardState: ProgramTimelineCardSessionState, theme: AppTheme) => {
  const comparableText = normalizeComparableText(
    `${cardState.trainingDay.focus ?? ''} ${cardState.trainingDay.name}`,
  );

  if (!comparableText) {
    return theme.colors.primary;
  }

  if (
    /pierna|gluteo|gluteos|femoral|quad|cuadricep|cuadriceps|lower|leg/.test(comparableText)
  ) {
    return '#2563eb';
  }

  if (
    /pecho|hombro|tricep|triceps|push|upper push|press/.test(comparableText)
  ) {
    return brandColors.sky;
  }

  if (
    /espalda|bicep|biceps|pull|row|back|remo/.test(comparableText)
  ) {
    return '#14b8a6';
  }

  if (
    /core|movilidad|mobility|stability|estabilidad|abdomen/.test(comparableText)
  ) {
    return '#34d399';
  }

  if (
    /cardio|conditioning|hiit|metcon|aerob/.test(comparableText)
  ) {
    return '#f59e0b';
  }

  return theme.colors.primary;
};

const getPalette = (
  visualState: WorkoutCardVisualState,
  accentColor: string,
): WorkoutCardPalette => {
  // Every state keeps the Aurora navy; the state only tints the far corner and the glows,
  // so an overdue session no longer turns the whole card brown.
  const baseByState: Record<WorkoutCardVisualState, readonly [string, string, string]> = {
    focused: ['#0a1630', '#13284a', '#0b2b3c'],
    overdue: ['#0a1630', '#13284a', '#272c40'],
    in_progress: ['#0a1630', '#0f2c4f', '#0b3a52'],
    completed: ['#0a1630', '#0f2a40', '#0b3b3a'],
    abandoned: ['#0a1630', '#182640', '#2a2a3a'],
  };

  const stateAccentByState: Record<WorkoutCardVisualState, string> = {
    focused: brandColors.sky,
    overdue: '#f59e0b',
    in_progress: '#38bdf8',
    completed: '#22c55e',
    abandoned: '#fbbf24',
  };

  const stateAccent = stateAccentByState[visualState];

  return {
    baseColors: baseByState[visualState],
    accentColor,
    stateAccent,
    borderColor: withAlpha('#ffffff', 0.16),
    traceColor: withAlpha(accentColor, 0.22),
    bottomGlowColor: withAlpha(stateAccent, 0.32),
    neutralGlowColor: withAlpha(stateAccent, 0.14),
  };
};

export const WorkoutCardBackdrop: React.FC<WorkoutCardBackdropProps> = ({
  cardState,
  cardWidth,
  cardHeight,
  shapePath,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const drift = useSharedValue(0);
  const driftAlt = useSharedValue(0);

  const visualState = getVisualState(cardState);
  const palette = useMemo(
    () => getPalette(visualState, getFocusAccent(cardState, theme)),
    [cardState, theme, visualState],
  );

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotionEnabled) {
      cancelAnimation(drift);
      cancelAnimation(driftAlt);
      drift.value = 0;
      driftAlt.value = 0;
      return;
    }

    drift.value = withRepeat(
      withTiming(1, {
        duration: 9200,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    driftAlt.value = withRepeat(
      withTiming(1, {
        duration: 11200,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(drift);
      cancelAnimation(driftAlt);
    };
  }, [drift, driftAlt, reduceMotionEnabled]);

  const primaryHaloStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-10, 12]) },
      { translateY: interpolate(drift.value, [0, 1], [8, -10]) },
      { scale: interpolate(drift.value, [0, 1], [0.96, 1.08]) },
    ],
  }));

  const secondaryHaloStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftAlt.value, [0, 1], [10, -8]) },
      { translateY: interpolate(driftAlt.value, [0, 1], [-8, 10]) },
      { scale: interpolate(driftAlt.value, [0, 1], [1.05, 0.94]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={styles.container}>
      <LinearGradient
        colors={palette.baseColors}
        start={{ x: 0.05, y: 0.08 }}
        end={{ x: 0.98, y: 0.95 }}
        style={StyleSheet.absoluteFill}
      />

      <AnimatedView
        style={[
          styles.halo,
          primaryHaloStyle,
          {
            width: cardWidth * 0.7,
            height: cardWidth * 0.7,
            top: -cardHeight * 0.18,
            right: -cardWidth * 0.12,
          },
        ]}
      >
        <LinearGradient
          colors={[
            withAlpha(palette.accentColor, 0.52),
            withAlpha(palette.accentColor, 0.18),
            'rgba(0,0,0,0)',
          ]}
          start={{ x: 0.12, y: 0.18 }}
          end={{ x: 0.88, y: 0.92 }}
          style={styles.haloFill}
        />
      </AnimatedView>

      <AnimatedView
        style={[
          styles.halo,
          secondaryHaloStyle,
          {
            width: cardWidth * 0.6,
            height: cardWidth * 0.6,
            bottom: -cardHeight * 0.18,
            left: -cardWidth * 0.08,
          },
        ]}
      >
        <LinearGradient
          colors={[
            withAlpha(palette.stateAccent, 0.34),
            withAlpha(palette.stateAccent, 0.12),
            'rgba(0,0,0,0)',
          ]}
          start={{ x: 0.08, y: 0.18 }}
          end={{ x: 0.92, y: 0.88 }}
          style={styles.haloFill}
        />
      </AnimatedView>

      <LinearGradient
        colors={['rgba(0,0,0,0)', palette.bottomGlowColor]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.bottomGlow, { height: cardHeight * 0.48 }]}
      />

      <Svg width={cardWidth} height={cardHeight} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="workoutCardFrame" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={withAlpha('#ffffff', 0.22)} />
            <Stop offset="60%" stopColor={palette.borderColor} />
            <Stop offset="100%" stopColor={withAlpha(palette.accentColor, 0.18)} />
          </SvgLinearGradient>
          <SvgLinearGradient id="workoutCardTrace" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <Stop offset="45%" stopColor={withAlpha(palette.accentColor, 0.44)} />
            <Stop offset="100%" stopColor={withAlpha(palette.stateAccent, 0.16)} />
          </SvgLinearGradient>
          <SvgLinearGradient id="workoutCardTraceSubtle" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <Stop offset="45%" stopColor={withAlpha(palette.accentColor, 0.18)} />
            <Stop offset="100%" stopColor={withAlpha(palette.stateAccent, 0.08)} />
          </SvgLinearGradient>
          <SvgLinearGradient id="workoutCardTraceSoft" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={palette.traceColor} />
            <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </SvgLinearGradient>
        </Defs>

        <Path
          d={shapePath}
          fill="none"
          stroke="url(#workoutCardFrame)"
          strokeWidth={1.05}
          strokeLinejoin="round"
        />

        <Circle
          cx={cardWidth * 0.76}
          cy={cardHeight * 0.24}
          r={3.8}
          fill={withAlpha(palette.accentColor, 0.2)}
          stroke={withAlpha('#ffffff', 0.34)}
          strokeWidth={0.9}
        />
        <Circle
          cx={cardWidth * 0.58}
          cy={cardHeight * 0.68}
          r={4.6}
          fill={withAlpha(palette.stateAccent, 0.16)}
          stroke={withAlpha('#ffffff', 0.24)}
          strokeWidth={0.9}
        />
        <Circle
          cx={cardWidth * 0.2}
          cy={cardHeight * 0.44}
          r={2.8}
          fill={withAlpha('#ffffff', 0.18)}
        />
      </Svg>

      <View
        style={[
          styles.vignette,
          {
            backgroundColor: palette.neutralGlowColor,
          },
        ]}
      />
    </View>
  );
};

const createStyles = (_theme: AppTheme) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    },
    halo: {
      position: 'absolute',
      borderRadius: 999,
      overflow: 'hidden',
      opacity: 0.9,
    },
    haloFill: {
      flex: 1,
      borderRadius: 999,
    },
    bottomGlow: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    vignette: {
      position: 'absolute',
      top: '46%',
      left: '-18%',
      width: '62%',
      height: '72%',
      borderRadius: 999,
      opacity: 0.12,
    },
  });

export default WorkoutCardBackdrop;
