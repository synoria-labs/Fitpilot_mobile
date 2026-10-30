import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { auroraFont, useAurora } from '../../theme/aurora';

export type AuroraSegmentOption<T extends string> = {
  key: T;
  label: string;
};

type AuroraSegmentedProps<T extends string> = {
  options: readonly AuroraSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
const TRACK_BORDER = 1;

/** Segmented control whose white thumb slides to the chosen option. */
export const AuroraSegmented = <T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: AuroraSegmentedProps<T>) => {
  const aurora = useAurora();
  const layouts = useRef<Partial<Record<T, { x: number; width: number }>>>({});
  const thumbX = useSharedValue(0);
  const thumbWidth = useSharedValue(0);

  const placeThumb = useCallback(
    (key: T, animate: boolean) => {
      const layout = layouts.current[key];
      if (!layout) {
        return;
      }
      // Option layouts include the track border; the absolute thumb starts inside it.
      const x = layout.x - TRACK_BORDER;
      thumbX.value = animate ? withSpring(x, SPRING) : x;
      thumbWidth.value = animate ? withSpring(layout.width, SPRING) : layout.width;
    },
    [thumbWidth, thumbX],
  );

  useEffect(() => {
    placeThumb(value, true);
  }, [placeThumb, value]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: thumbWidth.value,
    transform: [{ translateX: thumbX.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            backgroundColor: aurora.surface,
            borderColor: aurora.border,
            boxShadow: aurora.isDark ? undefined : '0px 1px 2px 0px rgba(15, 23, 42, 0.1)',
          },
          thumbStyle,
        ]}
      />
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onLayout={(event: LayoutChangeEvent) => {
              const { x, width } = event.nativeEvent.layout;
              layouts.current[option.key] = { x, width };
              if (selected) {
                placeThumb(option.key, false);
              }
            }}
            onPress={() => {
              if (selected) {
                return;
              }
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(option.key);
            }}
            style={styles.option}
          >
            <Text
              style={[
                styles.label,
                auroraFont(selected ? 'extrabold' : 'bold'),
                { color: selected ? aurora.text : aurora.faint },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 14,
    borderWidth: TRACK_BORDER,
  },
  thumb: {
    position: 'absolute',
    top: 4 - TRACK_BORDER,
    bottom: 4 - TRACK_BORDER,
    left: 0,
    borderRadius: 11,
    borderWidth: 1,
  },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  label: {
    fontSize: 13,
  },
});
