import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brandColors, colors, shadows } from '../../constants/colors';

interface FloatingButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  accessibilityLabel: string;
  disabled?: boolean;
  isLoading?: boolean;
  size?: number;
  bottomOffset?: number;
  rightOffset?: number;
  style?: StyleProp<ViewStyle>;
  gradientColors?: readonly [string, string];
}

export const FloatingButton: React.FC<FloatingButtonProps> = ({
  onPress,
  icon,
  accessibilityLabel,
  disabled = false,
  isLoading = false,
  size = 56,
  bottomOffset = -10,
  rightOffset = 25,
  style,
  gradientColors = [brandColors.navy, brandColors.sky],
}) => {
  const insets = useSafeAreaInsets();
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.85}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom: Math.max(insets.bottom, 0) + bottomOffset,
          right: rightOffset,
        },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {isLoading ? <ActivityIndicator color={colors.white} size="small" /> : icon}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    overflow: 'hidden',
    ...shadows.lg,
    elevation: 8,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
});
