import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { AuroraIconName } from '../aurora';
import { auroraFont, useAurora } from '../../theme/aurora';

type DietEmptyDayProps = {
  icon: AuroraIconName;
  title: string;
  message: string;
  primaryLabel?: string;
  primaryIcon?: AuroraIconName;
  onPrimary?: () => void;
  /** A short read while there is no menu. */
  tip?: { title: string; content: string } | null;
};

/** A day without a menu: rings around the diet mark, what is going on and one thing to do. */
export const DietEmptyDay = ({
  icon,
  title,
  message,
  primaryLabel,
  primaryIcon = 'chatbubble-outline',
  onPrimary,
  tip,
}: DietEmptyDayProps) => {
  const aurora = useAurora();
  const emerald = aurora.tones.emerald;
  const reduceMotion = useReducedMotion();
  const ping = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }
    ping.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(ping);
  }, [ping, reduceMotion]);

  const pingStyle = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ping.value),
    transform: [{ scale: 0.9 + ping.value * 0.35 }],
  }));

  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.card,
          { backgroundColor: aurora.surface, borderColor: aurora.border, boxShadow: aurora.shadowLg },
        ]}
      >
        <View style={styles.rings}>
          <Animated.View style={[styles.ringOuter, { borderColor: emerald.line }, pingStyle]} />
          <View style={[styles.ringMiddle, { borderColor: aurora.borderStrong }]} />
          <LinearGradient
            colors={emerald.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.ringCore, { boxShadow: `0px 18px 30px -14px ${emerald.tone}` }]}
          >
            <Ionicons name={icon} size={30} color={aurora.onTone} />
          </LinearGradient>
        </View>
        <Text style={[styles.title, auroraFont('extrabold'), { color: aurora.text }]}>{title}</Text>
        <Text style={[styles.message, auroraFont('medium'), { color: aurora.muted }]}>{message}</Text>
        {primaryLabel && onPrimary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={onPrimary}
            style={({ pressed }) => [styles.buttonPress, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <LinearGradient
              colors={emerald.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.button, { boxShadow: `0px 14px 28px -14px ${emerald.tone}` }]}
            >
              <Ionicons name={primaryIcon} size={17} color={aurora.onTone} />
              <Text style={[styles.buttonText, auroraFont('extrabold'), { color: aurora.onTone }]}>{primaryLabel}</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>

      {tip ? (
        <View
          style={[
            styles.tip,
            { backgroundColor: aurora.surface, borderColor: aurora.border, boxShadow: aurora.shadow },
          ]}
        >
          <View style={[styles.tipIcon, { backgroundColor: emerald.soft }]}>
            <Ionicons name="bulb-outline" size={19} color={emerald.ink} />
          </View>
          <View style={styles.tipCopy}>
            <Text style={[styles.tipTitle, auroraFont('extrabold'), { color: aurora.text }]}>Mientras tanto</Text>
            <Text style={[styles.tipText, auroraFont('medium'), { color: aurora.muted }]}>{tip.content}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  card: {
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 22,
    paddingBottom: 24,
    borderRadius: 28,
    borderWidth: 1,
  },
  rings: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
  },
  ringMiddle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
  },
  ringCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 18,
    fontSize: 20,
    lineHeight: 25,
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    maxWidth: 300,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  buttonPress: {
    alignSelf: 'stretch',
    marginTop: 22,
  },
  button: {
    height: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14.5,
  },
  tip: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipCopy: {
    flex: 1,
    minWidth: 0,
  },
  tipTitle: {
    fontSize: 14,
  },
  tipText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
});
