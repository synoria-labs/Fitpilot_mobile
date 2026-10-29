import React, { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useAurora } from '../../theme/aurora';

export type AuroraPalette = 'home' | 'training' | 'nutrition' | 'body';

const PALETTES: Record<AuroraPalette, readonly [string, string, string]> = {
  home: ['#3b82f6', '#10b981', '#8b5cf6'],
  training: ['#3b82f6', '#6366f1', '#06b6d4'],
  nutrition: ['#10b981', '#14b8a6', '#84cc16'],
  body: ['#8b5cf6', '#d946ef', '#3b82f6'],
};

// Position and size are fractions of the backdrop width; each glow drifts on its own period
// so the three never line up into a visible loop.
const GLOWS = [
  { left: 0.34, top: -0.32, size: 0.95, strength: 0.62, duration: 24000 },
  { left: 0.5, top: 0.1, size: 0.85, strength: 0.46, duration: 30000 },
  { left: -0.3, top: 0, size: 0.9, strength: 0.52, duration: 36000 },
] as const;

// react-native-svg resolves url(#id) references literally, and useId() returns colons.
export const toSvgId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');

const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type GlowProps = {
  color: string;
  size: number;
  left: number;
  top: number;
  strength: number;
  duration: number;
  still: boolean;
};

const AuroraGlow = ({ color, size, left, top, strength, duration, still }: GlowProps) => {
  const gradientId = toSvgId(useId());
  const progress = useSharedValue(0);

  useEffect(() => {
    if (still) {
      return undefined;
    }
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(progress);
  }, [duration, progress, still]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 0.5, 1], [0, size * 0.07, -size * 0.06]) },
      { translateY: interpolate(progress.value, [0, 0.5, 1], [0, -size * 0.06, size * 0.05]) },
      { scale: interpolate(progress.value, [0, 0.5, 1], [1, 1.12, 0.94]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left, top, width: size, height: size }, driftStyle]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="0.7" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
};

type AuroraBackdropProps = {
  width: number;
  height: number;
  palette?: AuroraPalette;
};

/**
 * Drifting colour glows, a faint grid that fades out from the top-right corner and a fade
 * into the screen's ground. Purely decorative: it sits behind the content and takes no touches.
 */
export const AuroraBackdrop = ({ width, height, palette = 'home' }: AuroraBackdropProps) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const gridId = toSvgId(useId());
  const fadeId = toSvgId(useId());
  const maskId = toSvgId(useId());
  const colors = PALETTES[palette];

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.root, { width, height }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: aurora.auroraOpacity }]}>
        {GLOWS.map((glow, index) => (
          <AuroraGlow
            key={index}
            color={colors[index]}
            size={width * glow.size}
            left={width * glow.left}
            top={width * glow.top}
            strength={glow.strength}
            duration={glow.duration}
            still={reduceMotion}
          />
        ))}
      </View>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id={gridId} x="0" y="0" width={30} height={30} patternUnits="userSpaceOnUse">
            <Path d="M 30 0 L 0 0 0 30" stroke={aurora.gridLine} strokeWidth={1} fill="none" />
          </Pattern>
          <RadialGradient id={fadeId} cx="78%" cy="0%" rx="85%" ry="70%">
            <Stop offset="0.1" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={maskId} x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
            <Rect x="0" y="0" width={width} height={height} fill={`url(#${fadeId})`} />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${gridId})`} mask={`url(#${maskId})`} />
      </Svg>
      <LinearGradient
        colors={[withAlpha(aurora.ground, 0), aurora.ground]}
        style={[styles.fade, { height: height * 0.42 }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
