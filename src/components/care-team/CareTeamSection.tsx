import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
}) => {
  const styles = useThemedStyles(createStyles);
  const cards = useMemo(
    () => buildCareTeamCards(summaries, errors, isLoading),
    [errors, isLoading, summaries],
  );
  const isSummary = variant === 'summary';

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
          <Text style={styles.summaryTitle}>{title}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
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
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    summaryTitle: {
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
