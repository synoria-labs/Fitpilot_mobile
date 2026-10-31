import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { WorkoutAnalyticsRange, WorkoutAnalyticsScopeKind } from '../../types';

export const progressRangeLabels: Record<WorkoutAnalyticsRange, string> = {
  '2w': 'Últimas 2 semanas',
  '4w': 'Últimas 4 semanas',
  '8w': 'Últimas 8 semanas',
  '12w': 'Últimas 12 semanas',
  all: 'Todo el historial',
};

const PLAN_SCOPES: { id: Exclude<WorkoutAnalyticsScopeKind, 'range'>; label: string; hint: string }[] = [
  { id: 'microcycle', label: 'Microciclo', hint: 'Una semana del plan' },
  { id: 'mesocycle', label: 'Bloque', hint: 'Un bloque completo' },
  { id: 'program', label: 'Programa', hint: 'Todo el programa' },
];

type SheetOption = {
  key: string;
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
};

const SheetOptionRow = ({ option, last }: { option: SheetOption; last: boolean }) => {
  const aurora = useAurora();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: option.selected }}
      onPress={option.onPress}
      style={({ pressed }) => [
        styles.option,
        { borderBottomColor: aurora.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        pressed ? { backgroundColor: aurora.surface2 } : null,
      ]}
    >
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, auroraFont(option.selected ? 'bold' : 'semibold'), { color: aurora.text }]}>
          {option.label}
        </Text>
        {option.hint ? (
          <Text style={[auroraType.caption, { color: aurora.faint }]}>{option.hint}</Text>
        ) : null}
      </View>
      {option.selected ? (
        <View style={[styles.check, { backgroundColor: aurora.tones.blue.soft }]}>
          <Ionicons name="checkmark" size={16} color={aurora.tones.blue.ink} />
        </View>
      ) : null}
    </Pressable>
  );
};

/** Fila deslizable de opciones excluyentes, como el estado de las sesiones del historial. */
export function ProgressChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const aurora = useAurora();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.chips}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? aurora.tones.blue.soft : aurora.surface,
                borderColor: selected ? aurora.tones.blue.line : aurora.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                auroraFont(selected ? 'extrabold' : 'bold'),
                { color: selected ? aurora.tones.blue.ink : aurora.muted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * El botón del periodo y la píldora del programa. Las opciones de experto (microciclo, bloque,
 * programa) viven en la hoja que abren, no en la pantalla.
 */
export function ProgressFilters({
  range,
  scope,
  scopeLabel,
  programName,
  onRangeChange,
  onScopeChange,
}: {
  range: WorkoutAnalyticsRange;
  scope: WorkoutAnalyticsScopeKind;
  scopeLabel?: string | null;
  programName?: string | null;
  onRangeChange: (range: WorkoutAnalyticsRange) => void;
  onScopeChange: (scope: WorkoutAnalyticsScopeKind) => void;
}) {
  const aurora = useAurora();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const periodLabel = scope === 'range' ? progressRangeLabels[range] : scopeLabel || 'Tu plan';
  const close = () => setOpen(false);

  const rangeOptions: SheetOption[] = (Object.entries(progressRangeLabels) as [WorkoutAnalyticsRange, string][]).map(
    ([id, label]) => ({
      key: id,
      label,
      selected: scope === 'range' && range === id,
      onPress: () => {
        onRangeChange(id);
        onScopeChange('range');
        close();
      },
    }),
  );
  const planOptions: SheetOption[] = PLAN_SCOPES.map((item) => ({
    key: item.id,
    label: item.label,
    hint: item.hint,
    selected: scope === item.id,
    onPress: () => {
      onScopeChange(item.id);
      close();
    },
  }));

  return (
    <>
      <View style={styles.row}>
        <Pressable
          testID="progress-period-filter"
          accessibilityRole="button"
          accessibilityLabel={`Periodo: ${periodLabel}. Cambiar periodo`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.period,
            {
              backgroundColor: aurora.surface,
              borderColor: aurora.borderStrong,
              boxShadow: aurora.shadow,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Ionicons name="calendar-outline" size={16} color={aurora.tones.blue.tone} />
          <Text numberOfLines={1} style={[styles.periodLabel, auroraFont('bold'), { color: aurora.text }]}>
            {periodLabel}
          </Text>
          <Ionicons name="chevron-down" size={15} color={aurora.faint} />
        </Pressable>
        {programName ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Programa ${programName}. Ver opciones del plan`}
            onPress={() => setOpen(true)}
            style={[styles.program, { backgroundColor: aurora.tones.blue.soft }]}
          >
            <Text numberOfLines={1} style={[styles.programLabel, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>
              {programName}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} />
          <Animated.View
            accessibilityViewIsModal
            entering={reduceMotion ? FadeIn : SlideInDown.springify().damping(20).stiffness(180)}
            style={[
              styles.sheet,
              { backgroundColor: aurora.surface, paddingBottom: insets.bottom + 16, boxShadow: aurora.shadowLg },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: aurora.borderStrong }]} />
            <View style={styles.sheetHeader}>
              <Text style={[auroraType.title, { color: aurora.text }]}>Periodo de progreso</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8} onPress={close} style={styles.close}>
                <Ionicons name="close" size={22} color={aurora.muted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[auroraType.label, styles.sectionLabel, { color: aurora.faint }]}>Por periodo</Text>
              <View accessibilityRole="radiogroup">
                {rangeOptions.map((option, index) => (
                  <SheetOptionRow key={option.key} option={option} last={index === rangeOptions.length - 1} />
                ))}
              </View>
              <Text style={[auroraType.label, styles.sectionLabel, { color: aurora.faint }]}>Explorar tu plan</Text>
              <View accessibilityRole="radiogroup">
                {planOptions.map((option, index) => (
                  <SheetOptionRow key={option.key} option={option} last={index === planOptions.length - 1} />
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  period: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  periodLabel: {
    flexShrink: 1,
    fontSize: 13.5,
  },
  program: {
    flexShrink: 1,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  programLabel: {
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
  },
  sheet: {
    maxHeight: '86%',
    paddingHorizontal: 22,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    gap: 8,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
  },
});
