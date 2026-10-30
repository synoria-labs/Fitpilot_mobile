import { useEffect, useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SWIPE_ACTIVATION = 10;
const SWIPE_THRESHOLD = 28;

/**
 * Moves a week strip's day capsule to `targetX`: in place the first time, then gliding with a
 * short stretch on the way, and hidden while there is no target. Returns the capsule's animated
 * style; keep the capsule mounted so a first placement isn't lost to a view that mounts with it.
 */
export const useSlidingCapsuleStyle = (targetX: number | null) => {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const stretch = useSharedValue(1);
  const visible = useSharedValue(0);
  const hasPlacedRef = useRef(false);

  useEffect(() => {
    if (targetX === null) {
      visible.value = 0;
      return;
    }

    visible.value = 1;

    if (!hasPlacedRef.current || reduceMotion) {
      x.value = targetX;
      hasPlacedRef.current = true;
      return;
    }

    x.value = withSpring(targetX, { damping: 18, stiffness: 190, mass: 0.9 });
    stretch.value = withSequence(
      withTiming(1.14, { duration: 130 }),
      withSpring(1, { damping: 12, stiffness: 170 }),
    );
  }, [reduceMotion, stretch, targetX, visible, x]);

  return useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateX: x.value }, { scaleX: stretch.value }],
  }));
};

type WeekSwipeOptions = {
  onShiftWeek?: (direction: -1 | 1) => void;
  canGoToPreviousWeek?: boolean;
  canGoToNextWeek?: boolean;
};

/** Horizontal swipe on a week strip: left for the next week, right for the previous one. */
export const useWeekSwipe = ({
  onShiftWeek,
  canGoToPreviousWeek = true,
  canGoToNextWeek = true,
}: WeekSwipeOptions) =>
  useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > SWIPE_ACTIVATION && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          if (!onShiftWeek || Math.abs(gesture.dx) < SWIPE_THRESHOLD) {
            return;
          }
          if (gesture.dx < 0 && canGoToNextWeek) {
            onShiftWeek(1);
          } else if (gesture.dx > 0 && canGoToPreviousWeek) {
            onShiftWeek(-1);
          }
        },
      }).panHandlers,
    [canGoToNextWeek, canGoToPreviousWeek, onShiftWeek],
  );
