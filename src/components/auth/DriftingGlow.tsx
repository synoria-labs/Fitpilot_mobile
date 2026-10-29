import React, { useEffect, useId } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// react-native-svg resolves url(#id) references literally, and useId() returns colons.
export const toSvgId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');

type DriftingGlowProps = {
  color: string;
  /** Centre of the glow, in px from the parent's top-left corner. */
  x: number;
  y: number;
  /** Diameter in px. */
  size: number;
  /** Opacity of the colour at the centre; it fades to nothing at 70 % of the radius. */
  strength: number;
  /** One leg of the drift in ms. Give each glow its own so they never move in step. */
  duration: number;
  still?: boolean;
};

/** A soft colour bloom that wanders slowly around its spot, the building block of the auth auroras. */
export const DriftingGlow = ({ color, x, y, size, strength, duration, still = false }: DriftingGlowProps) => {
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
      style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, driftStyle]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="0.38" stopColor={color} stopOpacity={strength * 0.55} />
            <Stop offset="0.7" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
};
