import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { borderRadius, fontSize, nutritionTheme, spacing } from '../../constants/colors';
import { useThemedStyles, type AppTheme } from '../../theme';
import type { Citation } from '../../types';

interface DietSourcesCardProps {
  exchangeSystemName?: string | null;
  citations: Citation[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenCitation: (url: string) => void;
}

const buildCitationCountLabel = (count: number) => `${count} fuente${count === 1 ? '' : 's'}`;

const getCitationHostname = (url: string) => {
  const hostname =
    url.match(/^https?:\/\/([^/]+)/i)?.[1] ??
    url.replace(/^https?:\/\//, '').split('/')[0];

  return hostname?.replace(/^www\./, '') || url;
};

const normalizeExchangeSystemName = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, ' ') ?? '';

const resolveExchangeSystemLabels = (value: string | null | undefined) => {
  const normalizedName = normalizeExchangeSystemName(value);
  const fallbackLabel = 'Sistema del plan';
  const smaeBaseName = 'Sistema Mexicano de Alimentos Equivalentes';

  if (!normalizedName) {
    return {
      shortLabel: fallbackLabel,
      collapsedSubtitle: null,
      expandedLabel: fallbackLabel,
    };
  }

  if (
    normalizedName.toUpperCase().includes('SMAE') ||
    normalizedName.toLowerCase() === smaeBaseName.toLowerCase()
  ) {
    return {
      shortLabel: 'SMAE',
      collapsedSubtitle: smaeBaseName,
      expandedLabel: normalizedName.includes('(SMAE)')
        ? normalizedName
        : `${smaeBaseName} (SMAE)`,
    };
  }

  const acronymMatch = normalizedName.match(/\(([^()]{2,12})\)\s*$/);
  if (!acronymMatch) {
    return {
      shortLabel: normalizedName,
      collapsedSubtitle: null,
      expandedLabel: normalizedName,
    };
  }

  const acronym = acronymMatch[1].trim();
  const baseName = normalizedName.replace(/\s*\([^()]{2,12}\)\s*$/, '').trim();

  return {
    shortLabel: acronym || normalizedName,
    collapsedSubtitle: baseName || null,
    expandedLabel: normalizedName,
  };
};

export const DietSourcesCard: React.FC<DietSourcesCardProps> = ({
  exchangeSystemName,
  citations,
  isExpanded,
  onToggleExpanded,
  onOpenCitation,
}) => {
  const styles = useThemedStyles(createStyles);
  const sortedCitations = useMemo(
    () =>
      citations
        .slice()
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.title.localeCompare(right.title),
        ),
    [citations],
  );
  const labels = useMemo(
    () => resolveExchangeSystemLabels(exchangeSystemName),
    [exchangeSystemName],
  );
  const displayedCitations = isExpanded
    ? sortedCitations
    : sortedCitations[0]
      ? [sortedCitations[0]]
      : [];
  const hasCitations = sortedCitations.length > 0;
  const title = isExpanded ? labels.expandedLabel : labels.shortLabel;

  return (
    <Card style={styles.card} padding="sm">
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <Ionicons name="library-outline" size={17} color={nutritionTheme.accentStrong} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Fuentes</Text>
          <Text numberOfLines={isExpanded ? 2 : 1} style={styles.title}>
            {title}
          </Text>
          {!isExpanded && labels.collapsedSubtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {labels.collapsedSubtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {hasCitations ? buildCitationCountLabel(sortedCitations.length) : 'Sin fuentes'}
            </Text>
          </View>
          {hasCitations ? (
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={onToggleExpanded}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'Ocultar fuentes' : 'Ver fuentes'}
            >
              <Text style={styles.toggleText}>{isExpanded ? 'Ocultar' : 'Ver'}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={14}
                color={nutritionTheme.accentStrong}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {displayedCitations.length > 0 ? (
        <View style={styles.list}>
          {displayedCitations.map((citation) => (
            <TouchableOpacity
              key={`${citation.sortOrder}-${citation.url}`}
              style={styles.sourceRow}
              onPress={() => {
                onOpenCitation(citation.url);
              }}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={`Abrir fuente ${citation.title}${citation.publisher ? ` de ${citation.publisher}` : ''}`}
            >
              <View style={styles.sourceIcon}>
                <Ionicons name="document-text-outline" size={15} color={nutritionTheme.accentStrong} />
              </View>
              <View style={styles.sourceCopy}>
                <Text numberOfLines={1} style={styles.sourceTitle}>
                  {citation.title}
                </Text>
                <Text numberOfLines={1} style={styles.sourceMeta}>
                  {citation.publisher
                    ? `${citation.publisher} - ${getCitationHostname(citation.url)}`
                    : getCitationHostname(citation.url)}
                </Text>
              </View>
              <Ionicons name="open-outline" size={15} color={nutritionTheme.accentStrong} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyRow}>
          <Ionicons name="document-outline" size={15} color={nutritionTheme.accentStrong} />
          <Text style={styles.emptyText}>
            Referencia pendiente para este sistema.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={14} color={nutritionTheme.accentStrong} />
        <Text style={styles.footerText}>
          Consulta profesional antes de tomar decisiones medicas.
        </Text>
      </View>
    </Card>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.18)' : '#BBF7D0',
      backgroundColor: theme.isDark ? 'rgba(20, 83, 45, 0.16)' : '#F7FEFB',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconBubble: {
      width: 34,
      height: 34,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? 'rgba(110, 231, 183, 0.12)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.18)' : '#BBF7D0',
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    eyebrow: {
      color: nutritionTheme.accentStrong,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '800',
      lineHeight: 18,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      lineHeight: 16,
    },
    headerActions: {
      alignItems: 'flex-end',
      gap: spacing.xs,
      flexShrink: 0,
    },
    countPill: {
      minHeight: 24,
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.16)' : '#BBF7D0',
    },
    countText: {
      color: nutritionTheme.accentStrong,
      fontSize: 11,
      fontWeight: '800',
    },
    toggleButton: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      borderRadius: borderRadius.full,
      paddingHorizontal: 9,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.16)' : '#BBF7D0',
    },
    toggleText: {
      color: nutritionTheme.accentStrong,
      fontSize: fontSize.xs,
      fontWeight: '800',
    },
    list: {
      gap: spacing.xs,
    },
    sourceRow: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.12)' : '#D1FAE5',
    },
    sourceIcon: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? 'rgba(110, 231, 183, 0.1)' : '#ECFDF5',
    },
    sourceCopy: {
      flex: 1,
      minWidth: 0,
    },
    sourceTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '700',
      lineHeight: 18,
    },
    sourceMeta: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      lineHeight: 16,
    },
    emptyRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(110, 231, 183, 0.12)' : '#D1FAE5',
    },
    emptyText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    footerText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
  });

export default DietSourcesCard;
