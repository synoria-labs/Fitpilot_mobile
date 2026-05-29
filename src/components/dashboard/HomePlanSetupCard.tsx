import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

const PENDING_PLAN_CHIPS = [
  {
    key: 'training',
    label: 'Entrenamiento pendiente',
    icon: 'fitness-outline' as const,
  },
  {
    key: 'nutrition',
    label: 'Nutricion pendiente',
    icon: 'restaurant-outline' as const,
  },
];

export const HomePlanSetupCard: React.FC = () => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconShell}>
          <Ionicons name="sparkles-outline" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Completa tus planes</Text>
          <Text style={styles.description}>
            Cuando tengas profesionales o planes asignados, veras aqui tu
            entrenamiento y nutricion activos.
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {PENDING_PLAN_CHIPS.map((chip) => (
          <View key={chip.key} style={styles.statusChip}>
            <Ionicons name={chip.icon} size={14} color={theme.colors.textMuted} />
            <Text style={styles.statusChipText}>{chip.label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar profesionales"
        onPress={() => router.push('/(tabs)/search')}
        style={({ pressed }) => [
          styles.ctaButton,
          pressed ? styles.ctaButtonPressed : null,
        ]}
      >
        <Text style={styles.ctaText}>Buscar profesionales</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    iconShell: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    title: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    description: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statusChipText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    ctaButton: {
      minHeight: 38,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    ctaButtonPressed: {
      opacity: 0.82,
    },
    ctaText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
  });

export default HomePlanSetupCard;
