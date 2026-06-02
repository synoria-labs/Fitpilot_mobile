import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '../common';
import { fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

interface ConnectedHealthSetupBannerProps {
  horizontalPadding?: number;
}

export const ConnectedHealthSetupBanner: React.FC<ConnectedHealthSetupBannerProps> = ({
  horizontalPadding = spacing.md,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.outer, { paddingHorizontal: horizontalPadding }]}>
      <Pressable
        onPress={() => router.push('/health-setup')}
        accessibilityRole="button"
        accessibilityLabel="Activar salud conectada"
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <Card style={styles.card} padding="md">
          <View style={styles.iconBubble}>
            <Ionicons name="pulse-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Activa salud conectada</Text>
            <Text style={styles.message} numberOfLines={2}>
              Conecta tus metricas de sueno, energia y recuperacion en un paso.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
        </Card>
      </Pressable>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      marginVertical: spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    iconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    message: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 19,
    },
  });
