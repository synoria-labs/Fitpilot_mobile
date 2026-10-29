import React, { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
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
import { BRAND_SLOGAN } from '../../constants/brand';
import { brandColors } from '../../constants/colors';
import { auroraFont, useAurora } from '../../theme/aurora';
import { LOGO_MARK_SPAN, LogoMark } from '../common/LogoMark';
import { BrandWordmark } from './BrandWordmark';
import { toSvgId } from './DriftingGlow';

type AuthBrandProps = {
  /** Smaller orb and lettering for short screens. */
  compact?: boolean;
};

const GLOW_SPREAD = 46;
const RING_GAP = 7;

/**
 * Brand header of the sign-in screens: the mark inside a glass orb with a soft halo and a ring
 * that breathes out every few seconds, then the wordmark and the tagline.
 */
export const AuthBrand = ({ compact = false }: AuthBrandProps) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const glowId = toSvgId(useId());
  const breath = useSharedValue(0);

  const orb = compact ? 64 : 80;
  const orbRadius = Math.round(orb * 0.34);
  const markBox = (compact ? 44 : 54) / LOGO_MARK_SPAN.width;
  const glow = orb + GLOW_SPREAD * 2;
  // Same inks as the logo files: navy wings on light grounds, the theme's text colour on dark.
  const ink = aurora.isDark ? aurora.text : brandColors.navy;

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }
    breath.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.bezier(0.22, 1, 0.36, 1) }), -1, false);
    return () => cancelAnimation(breath);
  }, [breath, reduceMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 0.35, 1], [0, 0.75, 0]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.92, 1.32]) }],
  }));

  return (
    <View style={styles.root}>
      <View accessible accessibilityRole="image" accessibilityLabel="FitPilot" style={styles.lockup}>
        <View style={{ width: orb, height: orb }}>
          <Svg
            width={glow}
            height={glow}
            style={[styles.glow, { left: -GLOW_SPREAD, top: -GLOW_SPREAD }]}
          >
            <Defs>
              <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#38bdf8" stopOpacity={0.32} />
                <Stop offset="0.46" stopColor="#6366f1" stopOpacity={0.14} />
                <Stop offset="0.7" stopColor="#6366f1" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill={`url(#${glowId})`} />
          </Svg>
          {reduceMotion ? null : (
            <Animated.View
              style={[
                styles.ring,
                {
                  left: -RING_GAP,
                  top: -RING_GAP,
                  width: orb + RING_GAP * 2,
                  height: orb + RING_GAP * 2,
                  borderRadius: orbRadius + RING_GAP,
                  borderColor: aurora.tones.blue.line,
                },
                ringStyle,
              ]}
            />
          )}
          <View
            style={[
              styles.orb,
              {
                width: orb,
                height: orb,
                borderRadius: orbRadius,
                backgroundColor: aurora.glass,
                borderColor: aurora.glassBorder,
                boxShadow: aurora.shadowLg,
              },
            ]}
          >
            <View style={[styles.markBox, { left: (orb - markBox) / 2, top: (orb - markBox) / 2 }]}>
              <LogoMark size={markBox} wingColor={ink} />
            </View>
          </View>
        </View>
        <View style={compact ? styles.wordmarkCompact : styles.wordmark}>
          <BrandWordmark width={compact ? 108 : 124} color={ink} />
        </View>
      </View>
      <Text style={[styles.tagline, { color: aurora.muted }]}>{BRAND_SLOGAN}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  lockup: {
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  orb: {
    borderWidth: 1,
    overflow: 'visible',
  },
  markBox: {
    position: 'absolute',
  },
  wordmark: {
    marginTop: 16,
  },
  wordmarkCompact: {
    marginTop: 12,
  },
  tagline: {
    ...auroraFont('semibold'),
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
