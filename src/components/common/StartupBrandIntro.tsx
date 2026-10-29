import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { brandColors } from '../../constants/colors';
import { auroraFont, getAuroraTokens } from '../../theme/aurora';
import { DriftingGlow, toSvgId } from '../auth/DriftingGlow';
import { LOGO_MARK_SPAN, LogoMark } from './LogoMark';
import WordmarkDark from '../../../assets/logo-wordmark-dark.svg';

type StartupBrandIntroProps = {
  onComplete: () => void;
};

// The intro always plays on the Aurora night ground. The native splash paints the same colour
// on both platforms, so the hand-off has no seam whichever theme the app opens in.
const NIGHT = getAuroraTokens(true);

const MARK_WIDTH = 160;
const MARK_BOX = MARK_WIDTH / LOGO_MARK_SPAN.width;
const MARK_HEIGHT = MARK_BOX * LOGO_MARK_SPAN.height;
// The mark starts where the native splash leaves it, on the screen centre, and settles this far
// above it to make room for the wordmark. Every other offset is measured from the centre too.
const MARK_RISE = 64;
const WORDMARK_WIDTH = 176;
const WORDMARK_HEIGHT = 39;
const WORDMARK_TOP = MARK_HEIGHT / 2 + 30 - MARK_RISE;
const TAGLINE_TOP = WORDMARK_TOP + WORDMARK_HEIGHT + 14;
const HALO = 300;
const RING = 128;
const SHINE_WIDTH = 120;
const SHINE_FROM = (MARK_BOX - MARK_WIDTH) / 2 - SHINE_WIDTH;
const SHINE_TO = (MARK_BOX + MARK_WIDTH) / 2;
const SHINE_COLORS = ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0)'] as const;

/**
 * Width of the mark in the native splash: iOS fits a 1024 px image, whose mark is 268 px wide,
 * to the screen width; Android draws a 288 dp icon whose mark is 52 dp wide.
 */
const nativeMarkWidth = (screenWidth: number) => (Platform.OS === 'ios' ? (screenWidth * 268) / 1024 : 52);

// Centres are fractions of the screen and sizes fractions of its width; the sky glow sits behind
// the settled mark.
const GLOWS = [
  { color: '#3b82f6', x: 0.85, y: 0.18, size: 0.9, strength: 0.66, duration: 11000 },
  { color: '#38bdf8', x: 0.5, y: 0.42, size: 0.74, strength: 0.5, duration: 13000 },
  { color: '#8b5cf6', x: 0.11, y: 0.67, size: 0.84, strength: 0.56, duration: 15000 },
  { color: '#10b981', x: 0.85, y: 0.9, size: 0.82, strength: 0.44, duration: 17000 },
] as const;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const LIFT_SPRING = { mass: 1, stiffness: 140, damping: 15 };
const EXIT_AT = 1180;
const EXIT_DURATION = 420;
const STILL_EXIT_AT = 700;

/** Faint grid centred on the settled mark, plus a vignette that sinks the edges into the ground. */
const NightGrid = ({ width, height }: { width: number; height: number }) => {
  const baseId = toSvgId(useId());
  const markY = height / 2 - MARK_RISE;
  const centreY = `${((markY / height) * 100).toFixed(2)}%`;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern
          id={`${baseId}grid`}
          x={(width / 2) % 30}
          y={markY % 30}
          width={30}
          height={30}
          patternUnits="userSpaceOnUse"
        >
          <Path d="M 30 0 L 0 0 0 30" stroke={NIGHT.gridLine} strokeWidth={1} fill="none" />
        </Pattern>
        <RadialGradient id={`${baseId}fade`} cx="50%" cy={centreY} rx="72%" ry="40%">
          <Stop offset="0.08" stopColor="#ffffff" stopOpacity={1} />
          <Stop offset="0.74" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
        <Mask id={`${baseId}mask`} x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width={width} height={height} fill={`url(#${baseId}fade)`} />
        </Mask>
        <RadialGradient id={`${baseId}vignette`} cx="50%" cy={centreY} rx="125%" ry="78%">
          <Stop offset="0.42" stopColor={NIGHT.ground} stopOpacity={0} />
          <Stop offset="1" stopColor={NIGHT.ground} stopOpacity={0.86} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${baseId}grid)`} mask={`url(#${baseId}mask)`} />
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${baseId}vignette)`} />
    </Svg>
  );
};

const HaloGlow = () => {
  const gradientId = toSvgId(useId());

  return (
    <Svg width={HALO} height={HALO}>
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={brandColors.sky} stopOpacity={0.34} />
          <Stop offset="0.45" stopColor="#4f46e5" stopOpacity={0.12} />
          <Stop offset="0.7" stopColor="#4f46e5" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2} fill={`url(#${gradientId})`} />
    </Svg>
  );
};

/**
 * Plays right after the native splash: the mark lifts from where the splash left it while the
 * aurora blooms, a halo ripples out, light sweeps across the mark and the wordmark rises. Then
 * the whole layer fades away over the app.
 */
export const StartupBrandIntro: React.FC<StartupBrandIntroProps> = ({ onComplete }) => {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [startScale] = useState(() => nativeMarkWidth(width) / MARK_WIDTH);
  const onCompleteRef = useRef(onComplete);

  const lift = useSharedValue(reduceMotion ? 1 : 0);
  const bloom = useSharedValue(0);
  const glow = useSharedValue(0);
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  const shine = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const tagline = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // The parent passes a new callback on every render; reading it through the ref keeps the
  // timeline from restarting when the layout re-renders mid-intro.
  const finish = useCallback(() => onCompleteRef.current(), []);

  useEffect(() => {
    if (reduceMotion) {
      bloom.value = 1;
      glow.value = 1;
      wordmark.value = 1;
      tagline.value = 1;
      exit.value = withDelay(STILL_EXIT_AT, withTiming(1, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(finish)();
        }
      }));
      return;
    }

    lift.value = withSpring(1, LIFT_SPRING);
    bloom.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    glow.value = withDelay(80, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    ringA.value = withDelay(150, withTiming(1, { duration: 1400, easing: EASE_OUT }));
    ringB.value = withDelay(380, withTiming(1, { duration: 1600, easing: EASE_OUT }));
    shine.value = withDelay(380, withTiming(1, { duration: 820, easing: Easing.bezier(0.45, 0, 0.2, 1) }));
    wordmark.value = withDelay(300, withTiming(1, { duration: 620, easing: EASE_OUT }));
    tagline.value = withDelay(440, withTiming(1, { duration: 620, easing: EASE_OUT }));
    exit.value = withDelay(EXIT_AT, withTiming(1, {
      duration: EXIT_DURATION,
      easing: Easing.inOut(Easing.quad),
    }, (finished) => {
      if (finished) {
        runOnJS(finish)();
      }
    }));
  }, [bloom, exit, finish, glow, lift, reduceMotion, ringA, ringB, shine, tagline, wordmark]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
  }));

  const auroraStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
    transform: [{ scale: interpolate(bloom.value, [0, 1], [0.82, 1]) * (1 + 0.18 * exit.value) }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.55, 1]) }],
  }));

  const ringAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringA.value, [0, 0.18, 1], [0, 0.9, 0]),
    transform: [{ scale: interpolate(ringA.value, [0, 1], [0.55, 2.7]) }],
  }));

  const ringBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringB.value, [0, 0.18, 1], [0, 0.9, 0]),
    transform: [{ scale: interpolate(ringB.value, [0, 1], [0.55, 2.7]) }],
  }));

  // The spring overshoots a little, so the mark swells past its size before it settles.
  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(lift.value, [0, 1], [0, -MARK_RISE]) - 10 * exit.value },
      { scale: interpolate(lift.value, [0, 1], [startScale, 1]) * (1 + 0.06 * exit.value) },
    ],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shine.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateX: interpolate(shine.value, [0, 1], [SHINE_FROM, SHINE_TO]) }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: interpolate(wordmark.value, [0, 1], [16, 0]) - 10 * exit.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
    transform: [{ translateY: interpolate(tagline.value, [0, 1], [16, 0]) - 10 * exit.value }],
  }));

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, auroraStyle]}>
        <View style={[StyleSheet.absoluteFill, { opacity: NIGHT.auroraOpacity }]}>
          {GLOWS.map((spec) => (
            <DriftingGlow
              key={spec.color}
              color={spec.color}
              x={spec.x * width}
              y={spec.y * height}
              size={spec.size * width}
              strength={spec.strength}
              duration={spec.duration}
              still={reduceMotion}
            />
          ))}
        </View>
        <NightGrid width={width} height={height} />
      </Animated.View>

      <View style={styles.centreLine}>
        <Animated.View style={[styles.row, { top: -MARK_RISE - HALO / 2 }, haloStyle]}>
          <HaloGlow />
        </Animated.View>
        {reduceMotion ? null : (
          <>
            <View style={[styles.row, { top: -MARK_RISE - RING / 2 }]}>
              <Animated.View style={[styles.ring, styles.ringSky, ringAStyle]} />
            </View>
            <View style={[styles.row, { top: -MARK_RISE - RING / 2 }]}>
              <Animated.View style={[styles.ring, styles.ringIndigo, ringBStyle]} />
            </View>
          </>
        )}
        <Animated.View style={[styles.row, { top: -MARK_HEIGHT / 2 }, markStyle]}>
          <View style={styles.markFrame}>
            <View style={styles.markBox}>
              <LogoMark size={MARK_BOX} wingColor="#ffffff" />
            </View>
            {reduceMotion ? null : (
              <MaskedView
                style={styles.markBox}
                maskElement={<LogoMark size={MARK_BOX} wingColor="#000000" pColor="#000000" dotColor="#000000" />}
              >
                <Animated.View style={[styles.shine, shineStyle]}>
                  <LinearGradient
                    colors={SHINE_COLORS}
                    start={{ x: 0, y: 0.3 }}
                    end={{ x: 1, y: 0.7 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </MaskedView>
            )}
          </View>
        </Animated.View>
        <Animated.View style={[styles.row, { top: WORDMARK_TOP }, wordmarkStyle]}>
          <WordmarkDark width={WORDMARK_WIDTH} height={WORDMARK_HEIGHT} />
        </Animated.View>
        <Animated.Text style={[styles.tagline, { top: TAGLINE_TOP }, taglineStyle]}>
          Tu entrenamiento y dieta personalizados
        </Animated.Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: NIGHT.ground,
  },
  centreLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 0,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
  },
  ringSky: {
    borderWidth: 1.5,
    borderColor: 'rgba(125, 211, 252, 0.6)',
  },
  ringIndigo: {
    borderWidth: 1,
    borderColor: 'rgba(165, 180, 252, 0.45)',
  },
  markFrame: {
    width: MARK_WIDTH,
    height: MARK_HEIGHT,
    overflow: 'visible',
  },
  markBox: {
    position: 'absolute',
    left: (MARK_WIDTH - MARK_BOX) / 2,
    top: (MARK_HEIGHT - MARK_BOX) / 2,
    width: MARK_BOX,
    height: MARK_BOX,
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SHINE_WIDTH,
    height: MARK_BOX,
  },
  tagline: {
    ...auroraFont('semibold'),
    position: 'absolute',
    left: 24,
    right: 24,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.14,
    textAlign: 'center',
    color: NIGHT.muted,
  },
});

export default StartupBrandIntro;
