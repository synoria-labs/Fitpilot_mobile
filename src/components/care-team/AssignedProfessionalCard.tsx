import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../constants/colors';
import { Skeleton } from '../common';
import { useAppTheme, useThemedStyles } from '../../theme';
import type {
  AssignedProfessionalDomain,
  AssignedProfessionalSummary,
} from '../../types';

type AssignedProfessionalCardState =
  | 'loading'
  | 'assigned'
  | 'unassigned'
  | 'error';

type AssignedProfessionalCardProps = {
  domains: AssignedProfessionalDomain[];
  state: AssignedProfessionalCardState;
  summary?: AssignedProfessionalSummary | null;
  errorMessage?: string | null;
  compact?: boolean;
  variant?: 'full' | 'summary';
};

const DOMAIN_LABELS: Record<AssignedProfessionalDomain, string> = {
  training: 'Entrenamiento',
  nutrition: 'Nutricion',
};

const EMPTY_MESSAGES: Record<AssignedProfessionalDomain, string> = {
  training: 'Aun no tienes entrenador asignado para entrenamiento.',
  nutrition: 'Aun no tienes nutriologo asignado para nutricion.',
};

const joinDomainLabels = (domains: AssignedProfessionalDomain[]) =>
  domains.map((domain) => DOMAIN_LABELS[domain]).join(' y ');

export const AssignedProfessionalCard: React.FC<AssignedProfessionalCardProps> = ({
  domains,
  state,
  summary,
  errorMessage,
  compact = false,
  variant = 'full',
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [hasImageError, setHasImageError] = useState(false);
  const isSummary = variant === 'summary';

  useEffect(() => {
    setHasImageError(false);
  }, [summary?.avatarUrl]);

  const initials = useMemo(() => {
    const sourceLabel = summary?.fullName ?? joinDomainLabels(domains);
    return sourceLabel
      .split(' ')
      .map((token) => token[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [domains, summary?.fullName]);

  const emptyMessage =
    domains.length === 1
      ? EMPTY_MESSAGES[domains[0]]
      : 'Aun no tienes profesionales asignados para tus planes actuales.';
  const canRenderAvatarImage =
    state === 'assigned' && Boolean(summary?.avatarUrl) && !hasImageError;

  if (state === 'loading') {
    return (
      <View
        style={[
          styles.card,
          compact || isSummary ? styles.cardCompact : styles.cardExpanded,
          isSummary ? styles.cardSummary : null,
        ]}
      >
        {!isSummary ? (
          <View style={styles.badgeRow}>
            {domains.map((domain) => (
              <DomainBadge key={domain} domain={domain} />
            ))}
          </View>
        ) : null}
        <View style={[styles.loadingRow, isSummary ? styles.loadingRowSummary : null]}>
          <View
            style={[
              styles.avatarBase,
              compact || isSummary ? styles.avatarCompact : styles.avatarExpanded,
              isSummary ? styles.avatarSummary : null,
            ]}
          />
          <View style={styles.loadingTextGroup}>
            <Skeleton width="62%" height={18} />
            <Skeleton width="44%" height={14} style={styles.loadingLine} />
            <Skeleton width="78%" height={14} style={styles.loadingLine} />
          </View>
        </View>
      </View>
    );
  }

  const headline =
    state === 'assigned'
      ? summary?.fullName ?? joinDomainLabels(domains)
      : joinDomainLabels(domains);
  const roleLabel =
    state === 'assigned' ? summary?.roleLabel : state === 'error' ? 'No disponible' : 'Sin asignacion';
  const contextLabel =
    state === 'assigned'
      ? summary?.contextLabel
      : state === 'error'
        ? errorMessage ?? 'No fue posible cargar esta asignacion.'
        : emptyMessage;
  const contextParts = contextLabel
    ?.split(' / ')
    .map((part) => part.trim())
    .filter(Boolean) ?? [];

  return (
    <View
      style={[
        styles.card,
        compact || isSummary ? styles.cardCompact : styles.cardExpanded,
        isSummary ? styles.cardSummary : null,
      ]}
    >
      {!isSummary ? (
        <View style={styles.badgeRow}>
          {domains.map((domain) => (
            <DomainBadge key={domain} domain={domain} />
          ))}
        </View>
      ) : null}

      <View style={[styles.bodyRow, isSummary ? styles.bodyRowSummary : null]}>
        <View
          style={[
            styles.avatarBase,
            compact || isSummary ? styles.avatarCompact : styles.avatarExpanded,
            isSummary ? styles.avatarSummary : null,
            state === 'error'
              ? styles.avatarError
              : state === 'unassigned'
                ? styles.avatarUnassigned
                : null,
          ]}
        >
          {canRenderAvatarImage ? (
            <Image
              source={{ uri: summary?.avatarUrl ?? '' }}
              style={styles.avatarImage}
              onError={() => setHasImageError(true)}
            />
          ) : state === 'error' ? (
            <Ionicons name="alert-circle-outline" size={compact || isSummary ? 22 : 24} color={theme.colors.error} />
          ) : state === 'unassigned' ? (
            <Ionicons name="person-outline" size={compact || isSummary ? 20 : 22} color={theme.colors.icon} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>

        <View style={styles.copyColumn}>
          <View style={isSummary ? styles.summaryTopRow : null}>
            <View style={styles.summaryNameRole}>
              <Text style={[styles.headline, isSummary ? styles.headlineSummary : null]} numberOfLines={1}>
                {headline}
              </Text>
              {roleLabel ? (
                <Text style={[styles.roleLabel, isSummary ? styles.roleLabelSummary : null]} numberOfLines={1}>
                  {roleLabel}
                </Text>
              ) : null}
            </View>

            {isSummary ? (
              <View style={styles.badgeRowSummary}>
                {domains.map((domain) => (
                  <DomainBadge key={domain} domain={domain} compact />
                ))}
              </View>
            ) : null}
          </View>

          {contextParts.length ? (
            isSummary ? (
              <View style={styles.contextListSummary}>
                {contextParts.map((part) => (
                  <Text key={part} style={styles.contextLabelSummary} numberOfLines={1}>
                    {part}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.contextLabel}>{contextLabel}</Text>
            )
          ) : null}
        </View>
      </View>
    </View>
  );
};

const DomainBadge: React.FC<{ domain: AssignedProfessionalDomain; compact?: boolean }> = ({
  domain,
  compact = false,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const palette =
    domain === 'training'
      ? {
          backgroundColor: theme.colors.primarySoft,
          borderColor: theme.colors.primaryBorder,
          color: theme.colors.primary,
          icon: 'fitness-outline' as const,
        }
      : {
          backgroundColor: `${theme.colors.success}18`,
          borderColor: `${theme.colors.success}36`,
          color: theme.colors.success,
          icon: 'restaurant-outline' as const,
        };

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.badgeCompact : null,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <Ionicons name={palette.icon} size={12} color={palette.color} />
      <Text style={[styles.badgeText, { color: palette.color }]}>
        {DOMAIN_LABELS[domain]}
      </Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    cardCompact: {
      padding: spacing.md,
    },
    cardSummary: {
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
    },
    cardExpanded: {
      padding: spacing.lg,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    badgeCompact: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
    },
    bodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    bodyRowSummary: {
      alignItems: 'flex-start',
      marginTop: 0,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    loadingRowSummary: {
      marginTop: 0,
    },
    avatarBase: {
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    avatarCompact: {
      width: 52,
      height: 52,
    },
    avatarSummary: {
      width: 44,
      height: 44,
    },
    avatarExpanded: {
      width: 64,
      height: 64,
    },
    avatarUnassigned: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
    },
    avatarError: {
      backgroundColor: `${theme.colors.error}12`,
      borderColor: `${theme.colors.error}30`,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    copyColumn: {
      flex: 1,
      marginLeft: spacing.md,
      minWidth: 0,
    },
    summaryTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    summaryNameRole: {
      flex: 1,
      minWidth: 0,
    },
    badgeRowSummary: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 4,
      maxWidth: '48%',
    },
    headline: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    headlineSummary: {
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    roleLabel: {
      marginTop: 2,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    roleLabelSummary: {
      fontSize: fontSize.xs,
    },
    contextLabel: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    contextListSummary: {
      marginTop: spacing.xs,
      gap: 2,
    },
    contextLabelSummary: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    loadingTextGroup: {
      flex: 1,
      marginLeft: spacing.md,
    },
    loadingLine: {
      marginTop: spacing.xs,
    },
  });

export default AssignedProfessionalCard;
