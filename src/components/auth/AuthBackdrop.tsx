import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAurora } from '../../theme/aurora';
import { DriftingGlow, toSvgId } from './DriftingGlow';

// Centres are fractions of the screen and sizes fractions of its width: blue and sky behind the
// brand, violet behind the form, emerald under the note at the bottom.
const GLOWS = [
  { color: '#3b82f6', x: 0.85, y: 0.1, size: 0.87, strength: 0.62, duration: 24000 },
  { color: '#38bdf8', x: 0.43, y: 0.13, size: 0.7, strength: 0.46, duration: 28000 },
  { color: '#8b5cf6', x: 0.09, y: 0.46, size: 0.87, strength: 0.52, duration: 32000 },
  { color: '#10b981', x: 0.88, y: 0.77, size: 0.81, strength: 0.42, duration: 36000 },
] as const;

const GRID_HEIGHT = 520;

type AuthBackdropProps = {
  width: number;
  height: number;
};

/**
 * Full-screen aurora behind the sign-in screens, so their glass card has colour to frost: four
 * drifting glows and a grid that fades out under the brand. Decorative; it takes no touches.
 */
export const AuthBackdrop = ({ width, height }: AuthBackdropProps) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const baseId = toSvgId(useId());
  const gridHeight = Math.min(GRID_HEIGHT, height);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.root, { width, height }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: aurora.auroraOpacity }]}>
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
      <Svg width={width} height={gridHeight} style={styles.grid}>
        <Defs>
          <Pattern
            id={`${baseId}grid`}
            x={(width / 2) % 30}
            y="0"
            width={30}
            height={30}
            patternUnits="userSpaceOnUse"
          >
            <Path d="M 30 0 L 0 0 0 30" stroke={aurora.gridLine} strokeWidth={1} fill="none" />
          </Pattern>
          <RadialGradient id={`${baseId}fade`} cx="50%" cy="12%" rx="80%" ry="62%">
            <Stop offset="0.12" stopColor="#ffffff" stopOpacity={1} />
            <Stop offset="0.72" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`${baseId}mask`} x="0" y="0" width={width} height={gridHeight} maskUnits="userSpaceOnUse">
            <Rect x="0" y="0" width={width} height={gridHeight} fill={`url(#${baseId}fade)`} />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={width} height={gridHeight} fill={`url(#${baseId}grid)`} mask={`url(#${baseId}mask)`} />
      </Svg>
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
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
