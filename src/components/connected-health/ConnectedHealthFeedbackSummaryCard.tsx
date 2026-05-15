import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '../common';
import { useConnectedHealthFeedback } from '../../hooks/useConnectedHealthFeedback';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import {
  ConnectedHealthCardSkeleton,
  ConnectedHealthEmptyState,
  ConnectedHealthErrorText,
  ConnectedHealthFreshnessBadge,
  ConnectedHealthInlineAction,
  ConnectedHealthMetricTile,
} from './ConnectedHealthFeedbackParts';

interface ConnectedHealthFeedbackSummaryCardProps {
  contentWidth?: number;
  horizontalPadding?: number;
}

const SUMMARY_METRICS = ['recovery', 'sleep', 'active_energy', 'steps'];

export const ConnectedHealthFeedbackSummaryCard: React.FC<ConnectedHealthFeedbackSummaryCardProps> = ({
  horizontalPadding = spacing.md,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const {
    feedback,
    isLoading,
    isSyncing,
    syncError,
    error,
    needsPermissionCta,
    sync,
  } = useConnectedHealthFeedback({ days: 7, autoSync: true });
  const metrics = feedback.metrics.filter((metric) =>
    SUMMARY_METRICS.includes(metric.key),
  );
  const primaryInsight = feedback.insights[0] ?? null;
  const showLoading = isLoading && !feedback.hasData;

  const settingsAction = {
    label: 'Configurar',
    icon: 'settings-outline' as const,
    onPress: () => router.push('/profile/connected-health' as never),
  };

  return (
    <View style={[styles.outer, { paddingHorizontal: horizontalPadding }]}>
      <Card style={styles.card} padding="lg">
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <View style={styles.iconBubble}>
              <Ionicons name="pulse-outline" size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>Salud conectada</Text>
              <Text style={styles.title}>Preparacion de hoy</Text>
            </View>
          </View>
          <ConnectedHealthFreshnessBadge feedback={feedback} isSyncing={isSyncing} />
        </View>

        {showLoading ? (
          <ConnectedHealthCardSkeleton compact />
        ) : feedback.hasData ? (
          <View style={styles.body}>
            <View style={styles.readinessBlock}>
              <Text style={styles.readinessValue}>
                {feedback.readiness.score == null
                  ? '--'
                  : Math.round(feedback.readiness.score)}
              </Text>
              <View style={styles.readinessCopy}>
                <Text style={styles.readinessTitle}>{feedback.readiness.title}</Text>
                <Text style={styles.readinessMessage}>
                  {feedback.readiness.message}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              {metrics.map((metric) => (
                <ConnectedHealthMetricTile
                  key={metric.key}
                  metric={metric}
                  compact
                />
              ))}
            </View>

            {primaryInsight ? (
              <View style={styles.insightPreview}>
                <Ionicons
                  name={primaryInsight.tone === 'warning' ? 'alert-circle-outline' : 'sparkles-outline'}
                  size={16}
                  color={
                    primaryInsight.tone === 'warning'
                      ? theme.colors.warning
                      : theme.colors.primary
                  }
                />
                <Text style={styles.insightPreviewText} numberOfLines={2}>
                  {primaryInsight.title}: {primaryInsight.message}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <ConnectedHealthEmptyState
            title="Sin datos recientes"
            message={
              needsPermissionCta
                ? 'Revisa permisos para activar el feedback de energia y recuperacion.'
                : 'Sincroniza salud conectada para ver sueno, kcal, pasos y recuperacion.'
            }
            action={needsPermissionCta ? settingsAction : {
              label: 'Sincronizar',
              icon: 'sync-outline',
              onPress: () => {
                void sync();
              },
              loading: isSyncing,
            }}
          />
        )}

        <View style={styles.footer}>
          <Text style={styles.sourceText}>
            Fuente: {feedback.sourceLabel} - {feedback.latestDateLabel}
          </Text>
          {feedback.hasData && feedback.isStale ? (
            <ConnectedHealthInlineAction
              action={{
                label: 'Actualizar',
                icon: 'sync-outline',
                onPress: () => {
                  void sync();
                },
                loading: isSyncing,
              }}
            />
          ) : null}
        </View>

        <ConnectedHealthErrorText message={syncError ?? error} />
      </Card>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      marginVertical: spacing.md,
    },
    card: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    titleWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
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
    titleCopy: {
      flex: 1,
      gap: 2,
    },
    eyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    body: {
      gap: spacing.md,
    },
    readinessBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    readinessValue: {
      width: 54,
      textAlign: 'center',
      fontSize: fontSize['2xl'],
      fontWeight: '900',
      color: theme.colors.primary,
      fontVariant: ['tabular-nums'],
    },
    readinessCopy: {
      flex: 1,
      gap: 3,
    },
    readinessTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    readinessMessage: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 19,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    insightPreview: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.primarySoft,
    },
    insightPreviewText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 19,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    sourceText: {
      flex: 1,
      minWidth: 180,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 17,
    },
  });
