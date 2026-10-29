import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAurora } from '../../theme/aurora';
import { withAlpha } from './AuroraBackdrop';

const FADE_TAIL = 18;

type AuroraTopScrimProps = {
  /** Height of the status bar area it covers. */
  height: number;
  visible: boolean;
};

/**
 * Lays the ground colour under the status bar once content scrolls beneath it, so the clock and
 * icons stay legible. At the top of the screen it stays hidden and the backdrop shows through.
 */
export const AuroraTopScrim = ({ height, visible }: AuroraTopScrimProps) => {
  const aurora = useAurora();
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [opacity, visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (height <= 0) {
    return null;
  }

  const total = height + FADE_TAIL;

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { height: total }, animatedStyle]}>
      <LinearGradient
        colors={[withAlpha(aurora.ground, 0.97), withAlpha(aurora.ground, 0.9), withAlpha(aurora.ground, 0)]}
        locations={[0, height / total, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
