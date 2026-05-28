import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, nutritionTheme, colors, fontSize, spacing, shadows } from '../../constants/colors';
import type { ClientDietMenu } from '../../types';
import { formatLocalDate } from '../../utils/date';
import { useAppTheme } from '../../theme';

interface DietHeroProps {
  menu: ClientDietMenu;
  menuLabel: string;
  assignedDate: string;
  isToday: boolean;
  isPreview?: boolean;
  sourceSystemName?: string | null;
  sourceCount?: number;
}

const resolveSourceSystemShortLabel = (value: string | null | undefined) => {
  const normalizedName = value?.trim().replace(/\s+/g, ' ') ?? '';

  if (!normalizedName) {
    return 'Sistema del plan';
  }

  if (
    normalizedName.toUpperCase().includes('SMAE') ||
    normalizedName.toLowerCase() === 'sistema mexicano de alimentos equivalentes'
  ) {
    return 'SMAE';
  }

  const acronymMatch = normalizedName.match(/\(([^()]{2,12})\)\s*$/);

  return acronymMatch?.[1]?.trim() || normalizedName;
};

export const DietHero: React.FC<DietHeroProps> = ({
  menu,
  menuLabel,
  assignedDate,
  isToday,
  isPreview = false,
  sourceSystemName,
  sourceCount,
}) => {
  const { theme } = useAppTheme();
  const dateLabel = formatLocalDate(assignedDate, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const subtitle = menu.description || `Plan activo - ${dateLabel}`;
  const badgeLabel = isPreview ? 'Previsualizando' : isToday ? 'Hoy' : 'Plan del dia';
  const badgeIcon = isPreview ? 'eye-outline' : isToday ? 'sparkles' : 'calendar-outline';
  const stats: {
    label: string;
    value: string | number;
    icon: React.ComponentProps<typeof Ionicons>['name'];
  }[] = [
    { label: 'Comidas', value: menu.totalMeals, icon: 'restaurant-outline' },
    {
      label: 'Kcal',
      value: menu.totalCalories !== null ? Math.round(menu.totalCalories) : 'ND',
      icon: 'flame-outline',
    },
    { label: 'Recetas', value: menu.totalRecipes, icon: 'book-outline' },
  ];

  const gradientColors = theme.isDark
    ? (['rgba(20, 83, 45, 0.34)', 'rgba(21, 128, 61, 0.18)'] as const)
    : (['#F7FEFB', '#ECFDF5'] as const);
  const accentColor = theme.isDark ? '#6EE7B7' : nutritionTheme.accentStrong;
  const textPrimary = theme.isDark ? colors.white : theme.colors.textPrimary;
  const textSecondary = theme.isDark ? 'rgba(255,255,255,0.72)' : theme.colors.textMuted;
  const borderColor = theme.isDark ? 'rgba(110, 231, 183, 0.18)' : '#BBF7D0';
  const chipBackground = theme.isDark ? 'rgba(255,255,255,0.08)' : colors.white;
  const chipBorder = theme.isDark ? 'rgba(110, 231, 183, 0.14)' : '#D1FAE5';
  const badgeBg = theme.isDark ? 'rgba(110, 231, 183, 0.12)' : '#D1FAE5';
  const hasSourceSummary = sourceSystemName !== undefined || sourceCount !== undefined;
  const sourceSystemLabel = resolveSourceSystemShortLabel(sourceSystemName);
  const sourceCountLabel = sourceCount === undefined
    ? null
    : sourceCount > 0
      ? `${sourceCount} fuente${sourceCount === 1 ? '' : 's'}`
      : 'sin fuentes';

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { borderColor }]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBubble, { borderColor: chipBorder, backgroundColor: badgeBg }]}>
          <Ionicons name="nutrition-outline" size={18} color={accentColor} />
        </View>

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={[styles.eyebrow, { color: accentColor }]}>Resumen del menu</Text>
              <Text numberOfLines={1} style={[styles.title, { color: textPrimary }]}>{menuLabel}</Text>
            </View>

            <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: chipBorder }]}>
              <Ionicons name={badgeIcon} size={11} color={accentColor} />
              <Text style={[styles.badgeText, { color: accentColor }]}>{badgeLabel}</Text>
            </View>
          </View>

          <Text numberOfLines={1} style={[styles.subtitle, { color: textSecondary }]}>
            {subtitle}
          </Text>

          {hasSourceSummary ? (
            <View
              style={[
                styles.sourceSummaryRow,
                { backgroundColor: chipBackground, borderColor: chipBorder },
              ]}
            >
              <Ionicons name="library-outline" size={12} color={accentColor} />
              <Text numberOfLines={1} style={[styles.sourceSummaryText, { color: textSecondary }]}>
                Sistema: <Text style={[styles.sourceSummaryStrong, { color: textPrimary }]}>{sourceSystemLabel}</Text>
                {sourceCountLabel ? ` - ${sourceCountLabel}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[styles.statChip, { backgroundColor: chipBackground, borderColor: chipBorder }]}
          >
            <Ionicons name={stat.icon} size={13} color={accentColor} />
            <View style={styles.statCopy}>
              <Text style={[styles.statValue, { color: textPrimary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>{stat.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    fontSize: fontSize.base,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  sourceSummaryRow: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sourceSummaryText: {
    flexShrink: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  sourceSummaryStrong: {
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statChip: {
    flex: 1,
    minHeight: 42,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statCopy: {
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    lineHeight: 17,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

export default DietHero;
