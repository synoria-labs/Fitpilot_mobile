import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { auroraFont, getAuroraTokens, useAurora } from '../../theme/aurora';
import { hapticImpactLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The light theme's blue in both themes: white text keeps 5:1 on it, while the dark theme's
// lighter blue would need dark text.
const PRIMARY_GRADIENT = getAuroraTokens(false).tones.blue.gradient;
const GLOSS = ['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0)'] as const;

type AuthButtonProps = {
  title: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const usePressScale = () => {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.03 * pressed.value }],
  }));

  return {
    style,
    onPressIn: () => {
      pressed.value = withTiming(1, { duration: 110 });
    },
    onPressOut: () => {
      pressed.value = withTiming(0, { duration: 180 });
    },
  };
};

type AuthPrimaryButtonProps = AuthButtonProps & {
  loading?: boolean;
  disabled?: boolean;
};

/** The screen's main action: blue gradient, an arrow chip that turns into a spinner while busy. */
export const AuthPrimaryButton = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}: AuthPrimaryButtonProps) => {
  const press = usePressScale();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    hapticImpactLight();
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.primary,
        disabled && !loading ? styles.primaryDisabled : styles.primaryRaised,
        press.style,
        style,
      ]}
    >
      <LinearGradient colors={PRIMARY_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryFill}>
        <LinearGradient
          colors={GLOSS}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.chipSpacer} />
        <Text numberOfLines={1} style={styles.primaryLabel}>
          {title}
        </Text>
        <View style={styles.chip}>
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          )}
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
};

type AuthSecondaryButtonProps = AuthButtonProps & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

/** Outlined companion to the primary button, for the screen's second path. */
export const AuthSecondaryButton = ({ title, icon, onPress, style }: AuthSecondaryButtonProps) => {
  const aurora = useAurora();
  const press = usePressScale();

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.secondary, { borderColor: aurora.borderStrong }, press.style, style]}
    >
      <Ionicons name={icon} size={18} color={aurora.tones.blue.tone} />
      <Text numberOfLines={1} style={[styles.secondaryLabel, { color: aurora.text }]}>
        {title}
      </Text>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  primary: {
    borderRadius: 18,
  },
  primaryRaised: {
    boxShadow: '0px 18px 32px -16px rgba(79, 70, 229, 0.85)',
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    paddingHorizontal: 11,
    borderRadius: 18,
    overflow: 'hidden',
  },
  chipSpacer: {
    width: 34,
  },
  primaryLabel: {
    ...auroraFont('extrabold'),
    flex: 1,
    fontSize: 16,
    letterSpacing: -0.1,
    textAlign: 'center',
    color: '#ffffff',
  },
  chip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
  },
  secondaryLabel: {
    ...auroraFont('bold'),
    fontSize: 15,
  },
});
