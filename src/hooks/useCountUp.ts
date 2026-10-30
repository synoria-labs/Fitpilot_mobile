import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts from the last shown value up (or down) to `target`. Returns the value to render;
 * with reduced motion, or for a null target, it jumps straight there.
 */
export const useCountUp = (target: number | null, duration = 900): number | null => {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState<number | null>(reduceMotion ? target : target == null ? null : 0);
  const shownRef = useRef(value ?? 0);

  useEffect(() => {
    if (target == null || reduceMotion) {
      shownRef.current = target ?? 0;
      setValue(target);
      return undefined;
    }

    const from = shownRef.current;
    const startedAt = Date.now();
    let frame = 0;

    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const next = from + (target - from) * easeOutCubic(progress);
      shownRef.current = next;
      setValue(next);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduceMotion, target]);

  return value;
};
