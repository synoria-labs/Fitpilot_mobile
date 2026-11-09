import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { auroraFont, useAurora, type AuroraTone } from '../../theme/aurora';
import { AuroraGlassLayer } from './AuroraGlass';

export type AuroraSegmentOption<T extends string> = {
  key: T;
  label: string;
};

type AuroraSegmentedProps<T extends string> = {
  options: readonly AuroraSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  /**
   * `surface`: a white thumb on a soft track, for choices inside a card. `tone`: the module's
   * gradient on a glass track, for a screen's main tabs over the aurora.
   */
  variant?: 'surface' | 'tone';
  tone?: AuroraTone;
};

const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
const TRACK_BORDER = 1;
const TONE_RADIUS = 16;

/** Segmented control whose thumb slides to the chosen option. */
export const AuroraSegmented = <T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  variant = 'surface',
  tone = 'blue',
}: AuroraSegmentedProps<T>) => {
  const aurora = useAurora();
  const isTone = variant === 'tone';
  const colors = aurora.tones[tone];
  // The glass track draws its edge in a layer, so its options start at the container's edge.
  const trackBorder = isTone ? 0 : TRACK_BORDER;
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
      const x = layout.x - trackBorder;
      thumbX.value = animate ? withSpring(x, SPRING) : x;
      thumbWidth.value = animate ? withSpring(layout.width, SPRING) : layout.width;
    },
    [thumbWidth, thumbX, trackBorder],
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
      style={[
        styles.track,
        isTone
          ? [styles.toneTrack, { boxShadow: aurora.shadow }]
          : { backgroundColor: aurora.surface2, borderColor: aurora.border, borderWidth: TRACK_BORDER },
      ]}
    >
      {isTone ? <AuroraGlassLayer radius={TONE_RADIUS} /> : null}
      {isTone ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, styles.toneThumb, { boxShadow: `0px 10px 20px -12px ${colors.tone}` }, thumbStyle]}
        >
          <View style={styles.toneThumbClip}>
            <LinearGradient
              colors={colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              top: 4 - TRACK_BORDER,
              bottom: 4 - TRACK_BORDER,
              backgroundColor: aurora.surface,
              borderColor: aurora.border,
              borderWidth: 1,
              boxShadow: aurora.isDark ? undefined : '0px 1px 2px 0px rgba(15, 23, 42, 0.1)',
            },
            thumbStyle,
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.key === value;
        const labelColor = isTone
          ? selected
            ? aurora.onTone
            : aurora.muted
          : selected
            ? aurora.text
            : aurora.faint;
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
            style={[styles.option, isTone ? styles.toneOption : null]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                isTone ? styles.toneLabel : null,
                auroraFont(selected ? 'extrabold' : 'bold'),
                { color: labelColor },
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
  },
  toneTrack: {
    borderRadius: TONE_RADIUS,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    borderRadius: 11,
  },
  toneThumb: {
    top: 4,
    bottom: 4,
    borderRadius: 12,
  },
  toneThumbClip: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  toneOption: {
    minHeight: 42,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
  },
  toneLabel: {
    fontSize: 14,
  },
});
