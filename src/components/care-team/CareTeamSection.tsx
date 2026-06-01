import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles } from '../../theme';
import type {
  AssignedProfessionalDomain,
  AssignedProfessionalSummary,
} from '../../types';
import {
  areSameAssignedProfessionals,
  mergeAssignedProfessionalSummaries,
} from '../../utils/careTeam';
import { AssignedProfessionalCard } from './AssignedProfessionalCard';

type CareTeamSectionProps = {
  summaries: Record<AssignedProfessionalDomain, AssignedProfessionalSummary | null>;
  errors: Record<AssignedProfessionalDomain, string | null>;
  isLoading: boolean;
  compact?: boolean;
  variant?: 'full' | 'summary';
  title?: string;
  subtitle?: string;
  horizontalPadding?: number;
  actionLabel?: string;
  actionIcon?: React.ComponentProps<typeof Ionicons>['name'];
  actionAccessibilityLabel?: string;
  onActionPress?: () => void;
};

type CareTeamCardModel = {
  key: string;
  domains: AssignedProfessionalDomain[];
  state: 'loading' | 'assigned' | 'unassigned' | 'error';
  summary: AssignedProfessionalSummary | null;
  errorMessage: string | null;
};

const buildCareTeamCards = (
  summaries: Record<AssignedProfessionalDomain, AssignedProfessionalSummary | null>,
  errors: Record<AssignedProfessionalDomain, string | null>,
  isLoading: boolean,
): CareTeamCardModel[] => {
  if (
    isLoading &&
    !summaries.training &&
    !summaries.nutrition &&
    !errors.training &&
    !errors.nutrition
  ) {
    return [
      {
        key: 'training-loading',
        domains: ['training'],
        state: 'loading',
        summary: null,
        errorMessage: null,
      },
      {
        key: 'nutrition-loading',
        domains: ['nutrition'],
        state: 'loading',
        summary: null,
        errorMessage: null,
      },
    ];
  }

  const trainingSummary = summaries.training;
  const nutritionSummary = summaries.nutrition;
  const canMergeAssignedProfessional =
    !errors.training &&
    !errors.nutrition &&
    areSameAssignedProfessionals(trainingSummary, nutritionSummary);

  if (canMergeAssignedProfessional && trainingSummary && nutritionSummary) {
    return [
      {
        key: `merged-${trainingSummary.id ?? nutritionSummary.id ?? 'professional'}`,
        domains: ['training', 'nutrition'],
        state: 'assigned',
        summary: mergeAssignedProfessionalSummaries(
          trainingSummary,
          nutritionSummary,
        ),
        errorMessage: null,
      },
    ];
  }

  return (['training', 'nutrition'] as AssignedProfessionalDomain[]).map(
    (domain) => {
      if (errors[domain]) {
        return {
          key: `${domain}-error`,
          domains: [domain],
          state: 'error',
          summary: null,
          errorMessage: errors[domain],
        } satisfies CareTeamCardModel;
      }

      const summary = summaries[domain];
      return {
        key: `${domain}-${summary?.status ?? 'unassigned'}`,
        domains: [domain],
        state: summary?.status === 'assigned' ? 'assigned' : 'unassigned',
        summary,
        errorMessage: null,
      } satisfies CareTeamCardModel;
    },
  );
};

export const CareTeamSection: React.FC<CareTeamSectionProps> = ({
  summaries,
  errors,
  isLoading,
  compact = false,
  variant = 'full',
  title = 'Tus profesionales',
  subtitle,
  horizontalPadding = 0,
  actionLabel,
  actionIcon = 'search-outline',
  actionAccessibilityLabel,
  onActionPress,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const cards = useMemo(
    () => buildCareTeamCards(summaries, errors, isLoading),
    [errors, isLoading, summaries],
  );
  const isSummary = variant === 'summary';
  const action = onActionPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
      onPress={onActionPress}
      style={({ pressed }) => [
        styles.actionButton,
        pressed ? styles.actionButtonPressed : null,
      ]}
    >
      <Ionicons name={actionIcon} size={14} color={theme.colors.primary} />
      {actionLabel ? <Text style={styles.actionButtonText}>{actionLabel}</Text> : null}
    </Pressable>
  ) : null;

  return (
    <View
      style={[
        styles.container,
        isSummary ? styles.containerSummary : null,
        { paddingHorizontal: horizontalPadding },
      ]}
    >
      {isSummary ? (
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle} numberOfLines={1}>
            {title}
          </Text>
          {action}
        </View>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {action}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}

      <View style={[styles.cardsColumn, isSummary ? styles.cardsColumnSummary : null]}>
        {cards.map((card) => (
          <AssignedProfessionalCard
            key={card.key}
            domains={card.domains}
            state={card.state}
            summary={card.summary}
            errorMessage={card.errorMessage}
            compact={compact}
            variant={isSummary ? 'summary' : 'full'}
          />
        ))}
      </View>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    container: {
      width: '100%',
    },
    containerSummary: {
      marginTop: spacing.sm,
    },
    header: {
      marginBottom: spacing.md,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    summaryTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    actionButton: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    actionButtonPressed: {
      opacity: 0.82,
    },
    actionButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    cardsColumn: {
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: borderRadius.xl,
    },
    cardsColumnSummary: {
      gap: spacing.xs,
      padding: 0,
    },
  });

export default CareTeamSection;
