import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  borderRadius,
  brandColors,
  buttonGradients,
  colors,
  spacing,
  fontSize,
} from "../../constants/colors";
import { useAppTheme, useThemedStyles } from "../../theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type ButtonAppearance = "default" | "profile";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  appearance?: ButtonAppearance;
  isLoading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "md",
  appearance = "default",
  isLoading = false,
  disabled = false,
  icon,
  style,
  fullWidth = false,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled || isLoading;
  const isProfileAppearance = appearance === "profile";
  const primaryGradientColors = theme.isDark
    ? buttonGradients.primary.dark
    : buttonGradients.primary.light;
  const defaultSizeStyleMap = {
    sm: styles.defaultSize_sm,
    md: styles.defaultSize_md,
    lg: styles.defaultSize_lg,
  } as const;
  const textDefaultSizeStyleMap = {
    sm: styles.textDefaultSize_sm,
    md: styles.textDefaultSize_md,
    lg: styles.textDefaultSize_lg,
  } as const;
  const defaultVariantStyleMap = {
    secondary: styles.default_secondary,
    ghost: styles.default_ghost,
    danger: styles.default_danger,
  } as const;
  const profileVariantStyleMap = {
    secondary: styles.profile_secondary,
    ghost: styles.profile_ghost,
    danger: styles.profile_danger,
  } as const;
  const defaultTextStyleMap = {
    primary: styles.textDefault_primary,
    secondary: styles.textDefault_secondary,
    ghost: styles.textDefault_ghost,
    danger: styles.textDefault_danger,
  } as const;
  const profileTextStyleMap = {
    primary: styles.textProfile_primary,
    secondary: styles.textProfile_secondary,
    ghost: styles.textProfile_ghost,
    danger: styles.textProfile_danger,
  } as const;
  const loaderColor =
    variant === "primary" || variant === "danger"
      ? colors.white
      : isProfileAppearance
        ? theme.colors.textPrimary
        : theme.colors.primary;

  const content = isLoading ? (
    <ActivityIndicator color={loaderColor} size="small" />
  ) : (
    <>
      {icon}
      <Text
        style={[
          styles.textBase,
          isProfileAppearance
            ? styles.textProfileBase
            : textDefaultSizeStyleMap[size],
          isProfileAppearance
            ? profileTextStyleMap[variant]
            : defaultTextStyleMap[variant],
          icon
            ? isProfileAppearance
              ? styles.textWithProfileIcon
              : styles.textWithDefaultIcon
            : null,
        ]}
      >
        {title}
      </Text>
    </>
  );

  if (variant === "primary") {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={isProfileAppearance ? 0.9 : 0.8}
        style={[
          fullWidth ? styles.fullWidth : null,
          isDisabled ? styles.disabled : null,
          style,
        ]}
      >
        <LinearGradient
          colors={primaryGradientColors}
          start={{ x: 0, y: 0.15 }}
          end={{ x: 1, y: 0.85 }}
          style={[
            styles.base,
            isProfileAppearance ? styles.profileBase : styles.defaultBase,
            isProfileAppearance ? styles.profilePrimary : styles.defaultPrimary,
            isProfileAppearance ? null : defaultSizeStyleMap[size],
            fullWidth ? styles.fullWidth : null,
          ]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isProfileAppearance ? styles.profileBase : styles.defaultBase,
        isProfileAppearance
          ? profileVariantStyleMap[variant as Exclude<ButtonVariant, "primary">]
          : defaultVariantStyleMap[
              variant as Exclude<ButtonVariant, "primary">
            ],
        isProfileAppearance ? null : defaultSizeStyleMap[size],
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={isProfileAppearance ? 0.9 : 0.7}
    >
      {content}
    </TouchableOpacity>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>["theme"]) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    defaultBase: {
      borderRadius: borderRadius.full,
    },
    profileBase: {
      minHeight: 50,
      paddingHorizontal: 20,
      borderRadius: borderRadius.full,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
    defaultPrimary: {
      shadowColor: brandColors.sky,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.2 : 0.12,
      shadowRadius: 10,
      elevation: 2,
    },
    profilePrimary: {
      borderWidth: 1,
      borderColor: theme.isDark
        ? "rgba(255,255,255,0.1)"
        : "rgba(255,255,255,0.26)",
      shadowColor: brandColors.sky,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.22 : 0.12,
      shadowRadius: 14,
      elevation: 3,
    },
    default_secondary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    default_ghost: {
      backgroundColor: "transparent",
    },
    default_danger: {
      backgroundColor: theme.colors.error,
    },
    profile_secondary: {
      backgroundColor: theme.isDark
        ? "rgba(255,255,255,0.05)"
        : "rgba(255,255,255,0.94)",
      borderWidth: 1,
      borderColor: theme.isDark
        ? "rgba(255,255,255,0.08)"
        : "rgba(24, 47, 80, 0.12)",
      shadowColor: theme.isDark ? "#000000" : brandColors.navy,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.2 : 0.1,
      shadowRadius: 16,
      elevation: 4,
    },
    profile_ghost: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    profile_danger: {
      backgroundColor: theme.colors.error,
      borderWidth: 1,
      borderColor: `${theme.colors.error}99`,
      shadowColor: theme.colors.error,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 14,
      elevation: 4,
    },
    defaultSize_sm: {
      minHeight: 36,
      paddingVertical: 7,
      paddingHorizontal: 14,
    },
    defaultSize_md: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 18,
    },
    defaultSize_lg: {
      minHeight: 50,
      paddingVertical: 12,
      paddingHorizontal: 22,
    },
    disabled: {
      opacity: 0.5,
    },
    textBase: {
      fontWeight: "600",
    },
    textProfileBase: {
      fontSize: fontSize.base,
      fontWeight: "700",
    },
    textDefault_primary: {
      color: colors.white,
    },
    textDefault_secondary: {
      color: theme.colors.textSecondary,
    },
    textDefault_ghost: {
      color: theme.colors.primary,
    },
    textDefault_danger: {
      color: colors.white,
    },
    textProfile_primary: {
      color: colors.white,
    },
    textProfile_secondary: {
      color: theme.colors.textPrimary,
    },
    textProfile_ghost: {
      color: theme.colors.primary,
    },
    textProfile_danger: {
      color: colors.white,
    },
    textDefaultSize_sm: {
      fontSize: fontSize.sm,
    },
    textDefaultSize_md: {
      fontSize: fontSize.base,
    },
    textDefaultSize_lg: {
      fontSize: fontSize.lg,
    },
    textWithDefaultIcon: {
      marginLeft: spacing.sm,
    },
    textWithProfileIcon: {
      marginLeft: spacing.sm,
    },
  });
