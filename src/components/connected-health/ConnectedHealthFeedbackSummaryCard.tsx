import React, { useCallback, useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../common';
import { useConnectedHealthFeedback } from '../../hooks/useConnectedHealthFeedback';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type {
  ConnectedHealthMetricCard,
  ConnectedHealthMetricKey,
} from '../../types/connectedHealthFeedback';
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
  variant?: 'card' | 'compact';
}

const SUMMARY_METRICS: ConnectedHealthMetricKey[] = [
  'recovery',
  'sleep',
  'active_energy',
  'steps',
];

const COMPACT_CHIP_ORDER: ConnectedHealthMetricKey[] = [
  'steps',
  'sleep',
  'recovery',
  'active_energy',
];

const MetricChip: React.FC<{ metric: ConnectedHealthMetricCard }> = ({ metric }) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.chip}>
      <Ionicons name={metric.icon} size={14} color={theme.colors.primary} />
      <Text style={styles.chipValue} numberOfLines={1}>
        {metric.value}
      </Text>
      <Text style={styles.chipLabel} numberOfLines={1}>
        {metric.label}
      </Text>
    </View>
  );
};

export const ConnectedHealthFeedbackSummaryCard: React.FC<ConnectedHealthFeedbackSummaryCardProps> = ({
  horizontalPadding = spacing.md,
  variant = 'card',
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isCompact = variant === 'compact';
  const {
    feedback,
    isLoading,
    isSyncing,
    syncError,
    error,
    needsPermissionCta,
    sync,
    syncIfStale,
  } = useConnectedHealthFeedback({ days: 7, autoSync: true });

  useFocusEffect(
    useCallback(() => {
      void syncIfStale();
    }, [syncIfStale]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncIfStale();
      }
    });
    return () => subscription.remove();
  }, [syncIfStale]);

  const metricsByKey = new Map<ConnectedHealthMetricKey, ConnectedHealthMetricCard>(
    feedback.metrics.map((m) => [m.key, m]),
  );
  const chipMetrics = COMPACT_CHIP_ORDER
    .map((key) => metricsByKey.get(key))
    .filter((m): m is ConnectedHealthMetricCard => Boolean(m));

  const nonCompactMetrics = feedback.metrics.filter((metric) =>
    SUMMARY_METRICS.includes(metric.key),
  );

  const primaryInsight = feedback.insights[0] ?? null;
  const showLoading = isLoading && !feedback.hasData;

  const settingsAction = {
    label: 'Configurar',
    icon: 'settings-outline' as const,
    onPress: () => router.push('/profile/connected-health' as never),
  };

  const syncAction = {
    label: 'Sincronizar',
    icon: 'sync-outline' as const,
    onPress: () => {
      void sync();
    },
    loading: isSyncing,
  };

  const handlePress = () => {
    if (needsPermissionCta || !feedback.hasData) {
      router.push('/profile/connected-health' as never);
      return;
    }
    router.push({
      pathname: '/(tabs)/measurements',
      params: { initialTab: 'health' },
    } as never);
  };

  const readinessScoreLabel =
    feedback.readiness.score == null
      ? '--'
      : Math.round(feedback.readiness.score).toString();

  const cardContent = (
    <Card
      style={[styles.card, isCompact ? styles.cardCompact : null]}
      padding={isCompact ? 'md' : 'lg'}
    >
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <View style={[styles.iconBubble, isCompact ? styles.iconBubbleCompact : null]}>
            <Ionicons
              name="pulse-outline"
              size={isCompact ? 16 : 18}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.titleCopy}>
            <Text style={styles.eyebrow}>Salud conectada</Text>
            {!isCompact ? (
              <Text style={styles.title} numberOfLines={1}>
                Preparacion de hoy
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerActions}>
          <ConnectedHealthFreshnessBadge feedback={feedback} isSyncing={isSyncing} />
          {isCompact ? (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.iconMuted}
            />
          ) : null}
        </View>
      </View>

      {showLoading ? (
        <ConnectedHealthCardSkeleton compact={isCompact} />
      ) : feedback.hasData ? (
        isCompact ? (
          <View style={styles.bodyCompact}>
            <Text style={styles.readinessInline} numberOfLines={1}>
              <Text style={styles.readinessInlineScore}>
                Preparacion {readinessScoreLabel}
              </Text>
              <Text style={styles.readinessInlineDivider}>  -  </Text>
              <Text style={styles.readinessInlineTitle}>
                {feedback.readiness.title}
              </Text>
            </Text>
            {chipMetrics.length > 0 ? (
              <View style={styles.chipsRow}>
                {chipMetrics.map((metric) => (
                  <MetricChip key={metric.key} metric={metric} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.readinessBlock}>
              <Text style={styles.readinessValue}>{readinessScoreLabel}</Text>
              <View style={styles.readinessCopy}>
                <Text style={styles.readinessTitle} numberOfLines={1}>
                  {feedback.readiness.title}
                </Text>
                <Text style={styles.readinessMessage}>
                  {feedback.readiness.message}
                </Text>
              </View>
            </View>
            <View style={styles.metricsGrid}>
              {nonCompactMetrics.map((metric) => (
                <ConnectedHealthMetricTile key={metric.key} metric={metric} compact />
              ))}
            </View>
            {primaryInsight ? (
              <View style={styles.insightPreview}>
                <Ionicons
                  name={
                    primaryInsight.tone === 'warning'
                      ? 'alert-circle-outline'
                      : 'sparkles-outline'
                  }
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
        )
      ) : isCompact ? (
        <View style={styles.compactEmptyState}>
          <View style={styles.compactEmptyCopy}>
            <Text style={styles.compactEmptyTitle}>Sin datos recientes</Text>
            <Text style={styles.compactEmptyMessage} numberOfLines={1}>
              {needsPermissionCta
                ? 'Revisa permisos para activar energia y recuperacion.'
                : 'Sincroniza sueno, kcal, pasos y recuperacion.'}
            </Text>
          </View>
          <ConnectedHealthInlineAction
            action={needsPermissionCta ? settingsAction : syncAction}
          />
        </View>
      ) : (
        <ConnectedHealthEmptyState
          title="Sin datos recientes"
          message={
            needsPermissionCta
              ? 'Revisa permisos para activar el feedback de energia y recuperacion.'
              : 'Sincroniza salud conectada para ver sueno, kcal, pasos y recuperacion.'
          }
          action={needsPermissionCta ? settingsAction : syncAction}
        />
      )}

      {!isCompact ? (
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
      ) : null}

      <ConnectedHealthErrorText message={syncError ?? error} />
    </Card>
  );

  return (
    <View
      style={[
        styles.outer,
        isCompact ? styles.outerCompact : null,
        { paddingHorizontal: horizontalPadding },
      ]}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Ver detalles de salud conectada"
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        {cardContent}
      </Pressable>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      marginVertical: spacing.md,
    },
    outerCompact: {
      marginVertical: spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    card: {
      gap: spacing.md,
    },
    cardCompact: {
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    titleWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
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
    iconBubbleCompact: {
      width: 32,
      height: 32,
      borderRadius: 16,
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
    bodyCompact: {
      gap: spacing.sm,
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
    readinessInline: {
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
    },
    readinessInlineScore: {
      fontWeight: '900',
      color: theme.colors.primary,
      fontVariant: ['tabular-nums'],
    },
    readinessInlineDivider: {
      color: theme.colors.textMuted,
    },
    readinessInlineTitle: {
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipValue: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    chipLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
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
    compactEmptyState: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    compactEmptyCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    compactEmptyTitle: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    compactEmptyMessage: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
  });
