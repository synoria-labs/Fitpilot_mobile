import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '../common';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type {
  ConnectedHealthFeedbackModel,
  ConnectedHealthInsight,
  ConnectedHealthInsightTone,
  ConnectedHealthMetricCard,
} from '../../types/connectedHealthFeedback';

type HealthAction = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const toneColors = (theme: AppTheme, tone: ConnectedHealthInsightTone) => {
  if (tone === 'positive') {
    return {
      color: theme.colors.success,
      background: `${theme.colors.success}14`,
      border: `${theme.colors.success}30`,
    };
  }

  if (tone === 'warning') {
    return {
      color: theme.colors.warning,
      background: `${theme.colors.warning}18`,
      border: `${theme.colors.warning}36`,
    };
  }

  return {
    color: theme.colors.primary,
    background: theme.colors.primarySoft,
    border: theme.colors.primaryBorder,
  };
};

const getInsightIcon = (tone: ConnectedHealthInsightTone) => {
  if (tone === 'positive') {
    return 'checkmark-circle-outline' as const;
  }

  if (tone === 'warning') {
    return 'alert-circle-outline' as const;
  }

  return 'information-circle-outline' as const;
};

export const ConnectedHealthFreshnessBadge = ({
  feedback,
  isSyncing,
}: {
  feedback: ConnectedHealthFeedbackModel;
  isSyncing?: boolean;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const badgeTone = feedback.isStale ? 'warning' : 'positive';
  const colors = toneColors(theme, badgeTone);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      {isSyncing ? (
        <ActivityIndicator color={colors.color} size="small" />
      ) : (
        <Ionicons
          name={feedback.isStale ? 'time-outline' : 'checkmark-circle-outline'}
          size={13}
          color={colors.color}
        />
      )}
      <Text style={[styles.badgeText, { color: colors.color }]}>
        {isSyncing ? 'Sincronizando' : feedback.freshnessLabel}
      </Text>
    </View>
  );
};

export const ConnectedHealthMetricTile = ({
  metric,
  compact = false,
}: {
  metric: ConnectedHealthMetricCard;
  compact?: boolean;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const colors = toneColors(theme, metric.tone);

  return (
    <View style={[styles.metricTile, compact ? styles.metricTileCompact : null]}>
      <View style={styles.metricHeader}>
        <View
          style={[
            styles.metricIcon,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons name={metric.icon} size={15} color={colors.color} />
        </View>
        <Text style={styles.metricLabel} numberOfLines={1}>
          {metric.label}
        </Text>
      </View>
      <Text style={[styles.metricValue, compact ? styles.metricValueCompact : null]} numberOfLines={1}>
        {metric.value}
      </Text>
      <Text style={styles.metricHelper} numberOfLines={compact ? 1 : 2}>
        {metric.trendLabel ?? metric.helper}
      </Text>
    </View>
  );
};

export const ConnectedHealthInsightList = ({
  insights,
}: {
  insights: ConnectedHealthInsight[];
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  if (!insights.length) {
    return null;
  }

  return (
    <View style={styles.insightsList}>
      {insights.map((insight) => {
        const colors = toneColors(theme, insight.tone);

        return (
          <View
            key={insight.id}
            style={[
              styles.insightRow,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name={getInsightIcon(insight.tone)}
              size={18}
              color={colors.color}
            />
            <View style={styles.insightCopy}>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.insightMessage}>{insight.message}</Text>
              <Text style={styles.insightSource}>Fuente: {insight.source}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

export const ConnectedHealthEmptyState = ({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: HealthAction;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="pulse-outline" size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyMessage}>{message}</Text>
      </View>
      {action ? <ConnectedHealthInlineAction action={action} /> : null}
    </View>
  );
};

export const ConnectedHealthInlineAction = ({
  action,
}: {
  action: HealthAction;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <TouchableOpacity
      style={[styles.inlineAction, action.disabled ? styles.inlineActionDisabled : null]}
      activeOpacity={0.86}
      onPress={action.onPress}
      disabled={action.disabled || action.loading}
    >
      {action.loading ? (
        <ActivityIndicator color={theme.colors.primary} size="small" />
      ) : (
        <Ionicons name={action.icon} size={16} color={theme.colors.primary} />
      )}
      <Text style={styles.inlineActionText}>{action.label}</Text>
    </TouchableOpacity>
  );
};

export const ConnectedHealthErrorText = ({ message }: { message?: string | null }) => {
  const styles = useThemedStyles(createStyles);

  if (!message) {
    return null;
  }

  return <Text style={styles.errorText}>{message}</Text>;
};

export const ConnectedHealthCardSkeleton = ({ compact = false }: { compact?: boolean }) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.skeletonWrap}>
      <Skeleton width="52%" height={18} />
      <Skeleton width="82%" height={14} style={styles.skeletonLine} />
      <View style={styles.skeletonGrid}>
        {Array.from({ length: compact ? 4 : 6 }, (_, index) => (
          <Skeleton
            key={`health-feedback-skeleton-${index}`}
            width={compact ? '48%' : '31%'}
            height={compact ? 76 : 92}
            borderRadius={borderRadius.lg}
          />
        ))}
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    badge: {
      minHeight: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    metricTile: {
      flex: 1,
      minWidth: 148,
      minHeight: 116,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    metricTileCompact: {
      width: '48%',
      minWidth: 0,
      minHeight: 96,
      padding: spacing.sm,
    },
    metricHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    metricIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricLabel: {
      flex: 1,
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    metricValue: {
      fontSize: fontSize.xl,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    metricValueCompact: {
      fontSize: fontSize.base,
    },
    metricHelper: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    insightsList: {
      gap: spacing.sm,
    },
    insightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
    },
    insightCopy: {
      flex: 1,
      gap: 3,
    },
    insightTitle: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    insightMessage: {
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 19,
    },
    insightSource: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    emptyState: {
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    emptyCopy: {
      gap: spacing.xs,
    },
    emptyTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    emptyMessage: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    inlineAction: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    inlineActionDisabled: {
      opacity: 0.55,
    },
    inlineActionText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    errorText: {
      fontSize: fontSize.xs,
      color: theme.colors.warning,
      lineHeight: 17,
    },
    skeletonWrap: {
      gap: spacing.sm,
    },
    skeletonLine: {
      marginTop: spacing.xs,
    },
    skeletonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
  });
