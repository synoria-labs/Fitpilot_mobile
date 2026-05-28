import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, fontSize } from '../../constants/colors';
import { useAppTheme, useThemedStyles } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  compact = false,
  secureTextEntry,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const isPassword = secureTextEntry !== undefined;

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      {label ? <Text style={[styles.label, compact ? styles.labelCompact : null]}>{label}</Text> : null}
      <View
        style={[
          styles.inputContainer,
          compact ? styles.inputContainerCompact : null,
          isFocused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={compact ? 18 : 20}
            color={isFocused ? theme.colors.primary : theme.colors.iconMuted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, compact ? styles.inputCompact : null, style]}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          {...props}
        />
        {isPassword ? (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={compact ? 18 : 20}
              color={theme.colors.iconMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    containerCompact: {
      marginBottom: 10,
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      marginBottom: spacing.xs,
    },
    labelCompact: {
      fontSize: fontSize.xs,
      marginBottom: 3,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.inputBackground,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      paddingHorizontal: spacing.md,
    },
    inputContainerCompact: {
      paddingHorizontal: 12,
    },
    inputFocused: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    inputError: {
      borderColor: theme.colors.error,
    },
    icon: {
      marginRight: spacing.sm,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
    },
    inputCompact: {
      paddingVertical: 10,
      fontSize: fontSize.sm,
    },
    eyeButton: {
      padding: spacing.xs,
    },
    error: {
      fontSize: fontSize.xs,
      color: theme.colors.error,
      marginTop: spacing.xs,
    },
  });
