import React, { useId } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { useCountUp } from '../../hooks/useCountUp';
import { auroraFont, useAurora } from '../../theme/aurora';
import type { ClientDietNutrients } from '../../types';

// Macro colors from the proposal: protein blue, carbohydrates amber, fat pink.
const MACRO_COLORS = { protein: '#2563eb', carbs: '#d97706', fat: '#db2777' } as const;

type DietDaySummaryProps = {
  dateLabel: string;
  /** «Menú 1», or «Vista previa» while reviewing another menu. */
  badgeLabel: string;
  note?: string | null;
  kcal: number | null;
  mealCount: number;
  recipeCount: number;
  nutrients?: ClientDietNutrients | null;
  canChangeMenu: boolean;
  isLoadingMenuOptions?: boolean;
  onChangeMenu: () => void;
  onOpenWeeklyPlan: () => void;
};

const getMacros = (nutrients: ClientDietNutrients | null | undefined) => {
  if (!nutrients || nutrients.proteinG === null || nutrients.carbsG === null || nutrients.fatG === null) {
    return null;
  }

  const energy = [
    { key: 'protein', label: 'Proteína', grams: nutrients.proteinG, kcal: nutrients.proteinG * 4 },
    { key: 'carbs', label: 'Carbohidratos', grams: nutrients.carbsG, kcal: nutrients.carbsG * 4 },
    { key: 'fat', label: 'Grasas', grams: nutrients.fatG, kcal: nutrients.fatG * 9 },
  ] as const;
  const total = energy.reduce((sum, macro) => sum + macro.kcal, 0);

  return total > 0
    ? energy.map((macro) => ({ ...macro, share: Math.round((macro.kcal / total) * 100) }))
    : null;
};

/** The day's menu at a glance: energy, macros when the menu has them, and its two actions. */
export const DietDaySummary = ({
  dateLabel,
  badgeLabel,
  note,
  kcal,
  mealCount,
  recipeCount,
  nutrients,
  canChangeMenu,
  isLoadingMenuOptions = false,
  onChangeMenu,
  onOpenWeeklyPlan,
}: DietDaySummaryProps) => {
  const aurora = useAurora();
  const emerald = aurora.tones.emerald;
  const glowId = toSvgId(useId());
  const shownKcal = useCountUp(kcal === null ? null : Math.round(kcal));
  const macros = getMacros(nutrients);
  const macroLabel = macros
    ? `Macros: ${macros.map((macro) => `${macro.label.toLowerCase()} ${Math.round(macro.grams)} gramos, ${macro.share} por ciento`).join('; ')}`
    : '';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: aurora.surface, borderColor: aurora.border, boxShadow: aurora.shadowLg },
      ]}
    >
      <Svg pointerEvents="none" width={220} height={220} style={styles.glow}>
        <Defs>
          <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={emerald.tone} stopOpacity={0.14} />
            <Stop offset="0.7" stopColor={emerald.tone} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={110} cy={110} r={110} fill={`url(#${glowId})`} />
      </Svg>

      <View style={styles.topRow}>
        <Text style={[styles.date, auroraFont('bold'), { color: aurora.muted }]} numberOfLines={1}>
          {dateLabel}
        </Text>
        <View style={[styles.badge, { backgroundColor: emerald.soft }]}>
          <View style={[styles.badgeDot, { backgroundColor: emerald.tone }]} />
          <Text style={[styles.badgeText, auroraFont('extrabold'), { color: emerald.ink }]}>{badgeLabel}</Text>
        </View>
      </View>

      <Text style={[styles.kcal, auroraFont('extrabold'), { color: aurora.text }]}>
        {shownKcal === null ? '—' : Math.round(shownKcal).toLocaleString('es-MX')}
        <Text style={[styles.kcalUnit, auroraFont('bold'), { color: aurora.faint }]}> kcal</Text>
      </Text>
      <Text style={[styles.counts, auroraFont('medium'), { color: aurora.faint }]}>
        {mealCount} {mealCount === 1 ? 'comida' : 'comidas'} · {recipeCount}{' '}
        {recipeCount === 1 ? 'receta' : 'recetas'}
      </Text>
      {note ? (
        <Text style={[styles.note, auroraFont('semibold'), { color: emerald.ink }]}>{note}</Text>
      ) : null}

      {macros ? (
        <>
          <View accessibilityRole="image" accessibilityLabel={macroLabel} style={styles.macroBar}>
            {macros.map((macro) => (
              <View
                key={macro.key}
                style={{ flex: Math.max(1, macro.share), backgroundColor: MACRO_COLORS[macro.key] }}
              />
            ))}
          </View>
          <View style={styles.macroLegend}>
            {macros.map((macro) => (
              <View key={macro.key} style={{ flex: Math.max(1, macro.share) }}>
                <View style={styles.macroLabelRow}>
                  <View style={[styles.macroKey, { backgroundColor: MACRO_COLORS[macro.key] }]} />
                  <Text style={[styles.macroLabel, auroraFont('bold'), { color: aurora.faint }]} numberOfLines={1}>
                    {macro.label}
                  </Text>
                </View>
                <Text style={[styles.macroValue, auroraFont('extrabold'), { color: aurora.text }]}>
                  {Math.round(macro.grams)} g
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir el plan de la semana y la lista del súper"
          onPress={onOpenWeeklyPlan}
          style={({ pressed }) => [styles.primaryPress, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <LinearGradient
            colors={emerald.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.primary, { boxShadow: `0px 14px 28px -14px ${emerald.tone}` }]}
          >
            <Ionicons name="calendar-outline" size={17} color={aurora.onTone} />
            <Text style={[styles.primaryText, auroraFont('extrabold'), { color: aurora.onTone }]}>Plan y súper</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar el menú de este día"
          accessibilityState={{ disabled: !canChangeMenu, busy: isLoadingMenuOptions }}
          disabled={!canChangeMenu}
          onPress={onChangeMenu}
          style={({ pressed }) => [
            styles.secondary,
            {
              backgroundColor: aurora.surface,
              borderColor: aurora.borderStrong,
              opacity: canChangeMenu ? 1 : 0.5,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          {isLoadingMenuOptions ? (
            <ActivityIndicator size="small" color={emerald.ink} />
          ) : (
            <Ionicons name="swap-horizontal-outline" size={17} color={aurora.text} />
          )}
          <Text style={[styles.secondaryText, auroraFont('bold'), { color: aurora.text }]}>Cambiar</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -60,
    top: -80,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  date: {
    flexShrink: 1,
    fontSize: 13,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11.5,
  },
  kcal: {
    marginTop: 10,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    fontSize: 17,
    letterSpacing: 0,
  },
  counts: {
    marginTop: 6,
    fontSize: 13,
  },
  note: {
    marginTop: 6,
    fontSize: 12.5,
  },
  macroBar: {
    flexDirection: 'row',
    gap: 2,
    height: 12,
    marginTop: 18,
    borderRadius: 6,
    overflow: 'hidden',
  },
  macroLegend: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  macroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  macroKey: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  macroLabel: {
    flexShrink: 1,
    fontSize: 11,
  },
  macroValue: {
    marginTop: 3,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  primaryPress: {
    flex: 1,
  },
  primary: {
    height: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: {
    fontSize: 14.5,
  },
  secondary: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryText: {
    fontSize: 14,
  },
});
