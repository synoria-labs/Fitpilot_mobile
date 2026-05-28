import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { borderRadius, spacing, shadows } from '../../constants/colors';
import { useAppTheme, useThemedStyles } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  padding = 'md',
}) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.card, styles[`padding_${padding}`], style]}>
      {children}
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.md,
    },
    padding_none: {
      padding: 0,
    },
    padding_sm: {
      padding: spacing.sm,
    },
    padding_md: {
      padding: spacing.md,
    },
    padding_lg: {
      padding: spacing.lg,
    },
  });
