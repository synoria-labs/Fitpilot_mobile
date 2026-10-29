import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../constants/colors';
import { Skeleton } from '../common';
import { AuroraCard, AuroraPill, type AuroraIconName } from '../aurora';
import { useAppTheme, useThemedStyles } from '../../theme';
import { auroraFont, useAurora, type AuroraTone } from '../../theme/aurora';
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
  onMessagePress?: () => void;
  onViewPlanPress?: (domains: AssignedProfessionalDomain[]) => void;
};

const DOMAIN_LABELS: Record<AssignedProfessionalDomain, string> = {
  training: 'Entrenamiento',
  nutrition: 'Nutrición',
};

const DOMAIN_STYLES: Record<AssignedProfessionalDomain, { tone: AuroraTone; icon: AuroraIconName }> = {
  training: { tone: 'blue', icon: 'barbell-outline' },
  nutrition: { tone: 'emerald', icon: 'restaurant-outline' },
};

const AVATAR_GRADIENT = ['#0ea5e9', '#4f46e5'] as const;

const EMPTY_MESSAGES: Record<AssignedProfessionalDomain, string> = {
  training: 'Aún no tienes entrenador asignado para entrenamiento.',
  nutrition: 'Aún no tienes nutriólogo asignado para nutrición.',
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
  onMessagePress,
  onViewPlanPress,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [hasImageError, setHasImageError] = useState(false);

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
      : 'Aún no tienes profesionales asignados para tus planes actuales.';
  const canRenderAvatarImage =
    state === 'assigned' && Boolean(summary?.avatarUrl) && !hasImageError;
  const headline =
    state === 'assigned'
      ? summary?.fullName ?? joinDomainLabels(domains)
      : joinDomainLabels(domains);
  const roleLabel =
    state === 'assigned' ? summary?.roleLabel : state === 'error' ? 'No disponible' : 'Sin asignación';
  const contextLabel =
    state === 'assigned'
      ? summary?.contextLabel
      : state === 'error'
        ? errorMessage ?? 'No fue posible cargar esta asignación.'
        : emptyMessage;
  const contextParts = contextLabel
    ?.split(' / ')
    .map((part) => part.trim())
    .filter(Boolean) ?? [];

  if (variant === 'summary') {
    return (
      <ProfessionalSummary
        domains={domains}
        state={state}
        headline={headline}
        roleLabel={roleLabel ?? null}
        contextParts={contextParts}
        initials={initials}
        avatarUrl={canRenderAvatarImage ? summary?.avatarUrl ?? null : null}
        onAvatarError={() => setHasImageError(true)}
        onMessagePress={onMessagePress}
        onViewPlanPress={onViewPlanPress ? () => onViewPlanPress(domains) : undefined}
      />
    );
  }

  if (state === 'loading') {
    return (
      <View style={[styles.card, compact ? styles.cardCompact : styles.cardExpanded]}>
        <View style={styles.badgeRow}>
          {domains.map((domain) => (
            <DomainBadge key={domain} domain={domain} />
          ))}
        </View>
        <View style={styles.loadingRow}>
          <View style={[styles.avatarBase, compact ? styles.avatarCompact : styles.avatarExpanded]} />
          <View style={styles.loadingTextGroup}>
            <Skeleton width="62%" height={18} />
            <Skeleton width="44%" height={14} style={styles.loadingLine} />
            <Skeleton width="78%" height={14} style={styles.loadingLine} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, compact ? styles.cardCompact : styles.cardExpanded]}>
      <View style={styles.badgeRow}>
        {domains.map((domain) => (
          <DomainBadge key={domain} domain={domain} />
        ))}
      </View>

      <View style={styles.bodyRow}>
        <View
          style={[
            styles.avatarBase,
            compact ? styles.avatarCompact : styles.avatarExpanded,
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
            <Ionicons name="alert-circle-outline" size={compact ? 22 : 24} color={theme.colors.error} />
          ) : state === 'unassigned' ? (
            <Ionicons name="person-outline" size={compact ? 20 : 22} color={theme.colors.icon} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>

        <View style={styles.copyColumn}>
          <Text style={styles.headline} numberOfLines={1}>
            {headline}
          </Text>
          {roleLabel ? (
            <Text style={styles.roleLabel} numberOfLines={1}>
              {roleLabel}
            </Text>
          ) : null}
          {contextParts.length ? <Text style={styles.contextLabel}>{contextLabel}</Text> : null}
        </View>
      </View>
    </View>
  );
};

type ProfessionalSummaryProps = {
  domains: AssignedProfessionalDomain[];
  state: AssignedProfessionalCardState;
  headline: string;
  roleLabel: string | null;
  contextParts: string[];
  initials: string;
  avatarUrl: string | null;
  onAvatarError: () => void;
  onMessagePress?: () => void;
  onViewPlanPress?: () => void;
};

/** Inicio's version of the card: who is on the team, what they cover and what they set up. */
const ProfessionalSummary: React.FC<ProfessionalSummaryProps> = ({
  domains,
  state,
  headline,
  roleLabel,
  contextParts,
  initials,
  avatarUrl,
  onAvatarError,
  onMessagePress,
  onViewPlanPress,
}) => {
  const aurora = useAurora();

  if (state === 'loading') {
    return (
      <AuroraCard padding={16} radius={24} style={summaryStyles.row}>
        <View style={[summaryStyles.avatar, { backgroundColor: aurora.surface3 }]} />
        <View style={summaryStyles.copy}>
          <Skeleton width="62%" height={16} />
          <Skeleton width="40%" height={12} style={summaryStyles.skeletonLine} />
          <Skeleton width="70%" height={12} style={summaryStyles.skeletonLine} />
        </View>
      </AuroraCard>
    );
  }

  // The backend joins one context line per domain, in the same order as the domains.
  const lineDomains = contextParts.length === domains.length ? domains : null;

  return (
    <AuroraCard padding={16} radius={24}>
      <View style={summaryStyles.row}>
        {avatarUrl ? (
          <LinearGradient
            colors={AVATAR_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[summaryStyles.avatar, summaryStyles.avatarRing]}
          >
            <Image
              source={{ uri: avatarUrl }}
              style={[summaryStyles.avatarImage, { borderColor: aurora.surface }]}
              onError={onAvatarError}
            />
          </LinearGradient>
        ) : state === 'assigned' ? (
          <LinearGradient
            colors={AVATAR_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[summaryStyles.avatar, { boxShadow: '0px 12px 24px -12px #4f46e5' }]}
          >
            <Text style={[summaryStyles.initials, auroraFont('extrabold')]}>{initials}</Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              summaryStyles.avatar,
              {
                backgroundColor: state === 'error' ? aurora.tones.rose.soft : aurora.surface2,
                borderWidth: 1,
                borderColor: state === 'error' ? aurora.tones.rose.line : aurora.border,
              },
            ]}
          >
            <Ionicons
              name={state === 'error' ? 'alert-circle-outline' : 'person-outline'}
              size={22}
              color={state === 'error' ? aurora.tones.rose.ink : aurora.faint}
            />
          </View>
        )}

        <View style={summaryStyles.copy}>
          <Text style={[summaryStyles.name, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
            {headline}
          </Text>
          {roleLabel ? (
            <Text style={[summaryStyles.role, auroraFont('medium'), { color: aurora.muted }]} numberOfLines={1}>
              {roleLabel}
            </Text>
          ) : null}
          <View style={summaryStyles.pills}>
            {domains.map((domain) => (
              <AuroraPill
                key={domain}
                label={DOMAIN_LABELS[domain]}
                tone={DOMAIN_STYLES[domain].tone}
                icon={DOMAIN_STYLES[domain].icon}
              />
            ))}
          </View>
        </View>
      </View>

      {contextParts.length ? (
        <View style={[summaryStyles.context, { backgroundColor: aurora.surface2 }]}>
          {contextParts.map((part, index) => {
            const domain = lineDomains?.[index];
            const tone = domain ? aurora.tones[DOMAIN_STYLES[domain].tone] : aurora.tones.slate;

            return (
              <View key={part} style={summaryStyles.contextLine}>
                <Ionicons
                  name={domain ? DOMAIN_STYLES[domain].icon : 'information-circle-outline'}
                  size={16}
                  color={tone.tone}
                />
                <Text
                  style={[summaryStyles.contextText, auroraFont('semibold'), { color: aurora.text }]}
                  numberOfLines={2}
                >
                  {part}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {state === 'assigned' && (onMessagePress || onViewPlanPress) ? (
        <View style={summaryStyles.actions}>
          {onMessagePress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Enviar un mensaje a ${headline}`}
              onPress={onMessagePress}
              style={({ pressed }) => [summaryStyles.actionPress, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <LinearGradient
                colors={aurora.tones.blue.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[summaryStyles.action, { boxShadow: `0px 12px 24px -14px ${aurora.tones.blue.tone}` }]}
              >
                <Ionicons name="chatbubble-outline" size={16} color={aurora.onTone} />
                <Text style={[summaryStyles.actionText, auroraFont('extrabold'), { color: aurora.onTone }]}>Mensaje</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
          {onViewPlanPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver tu plan"
              onPress={onViewPlanPress}
              style={({ pressed }) => [
                summaryStyles.actionPress,
                summaryStyles.action,
                {
                  backgroundColor: aurora.surface,
                  borderWidth: 1,
                  borderColor: aurora.borderStrong,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text style={[summaryStyles.actionText, auroraFont('bold'), { color: aurora.text }]}>Ver plan</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </AuroraCard>
  );
};

const DomainBadge: React.FC<{ domain: AssignedProfessionalDomain }> = ({ domain }) => {
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

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarRing: {
    padding: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    borderWidth: 2,
  },
  initials: {
    fontSize: 18,
    color: '#ffffff',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  role: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  context: {
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  contextLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  skeletonLine: {
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionPress: {
    flex: 1,
  },
  action: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  actionText: {
    fontSize: 14,
  },
});

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
    badgeText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
    },
    bodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
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
    headline: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    roleLabel: {
      marginTop: 2,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    contextLabel: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
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
