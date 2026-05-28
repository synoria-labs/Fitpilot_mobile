import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useThemedStyles, type AppTheme } from '../../theme';

export interface SegmentedControlOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'default' | 'compact';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
}: SegmentedControlProps<T>) {
  const styles = useThemedStyles(createStyles);
  const isCompact = size === 'compact';

  return (
    <View style={[styles.container, isCompact ? styles.containerCompact : null]}>
      {options.map((option) => {
        const isActive = option.key === value;

        return (
          <Pressable
            key={option.key}
            style={[
              styles.tab,
              isCompact ? styles.tabCompact : null,
              isActive ? styles.activeTab : null,
            ]}
            onPress={() => onChange(option.key)}
          >
            <Text
              style={[
                styles.tabText,
                isCompact ? styles.tabTextCompact : null,
                isActive ? styles.activeTabText : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    containerCompact: {
      padding: 3,
      gap: 3,
    },
    tab: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
    },
    tabCompact: {
      minHeight: 34,
      paddingHorizontal: spacing.xs,
    },
    activeTab: {
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    tabText: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
    tabTextCompact: {
      fontSize: fontSize.xs,
      fontWeight: '800',
    },
    activeTabText: {
      color: theme.colors.primary,
    },
  });

export default SegmentedControl;
