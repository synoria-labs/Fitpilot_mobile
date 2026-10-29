import React, { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { auroraFont, useAurora, type AuroraTone } from '../../theme/aurora';
import { toSvgId } from './AuroraBackdrop';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ReadinessRingProps = {
  /** 0–100, or null when there is no score yet. */
  score: number | null;
  tone: AuroraTone;
  size?: number;
  stroke?: number;
  /** Text inside the ring; defaults to the rounded score. */
  label?: string;
};

/** A score as a ring that fills on appear, drawn in its tone's gradient. */
export const ReadinessRing = ({ score, tone, size = 64, stroke = 6, label }: ReadinessRingProps) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const gradientId = toSvgId(useId());
  const colors = aurora.tones[tone];
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = score == null ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const progress = useSharedValue(reduceMotion ? target : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion, target]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.tone} />
            <Stop offset="1" stopColor={colors.tone2} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={aurora.surface3}
          strokeWidth={stroke}
          fill="none"
        />
        {score != null ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            fill="none"
            animatedProps={arcProps}
          />
        ) : null}
      </Svg>
      <Text
        style={[
          auroraFont('extrabold'),
          styles.value,
          { fontSize: Math.round(size * 0.3), color: score == null ? aurora.faint : aurora.text },
        ]}
      >
        {label ?? (score == null ? '—' : Math.round(score))}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  svg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
});
