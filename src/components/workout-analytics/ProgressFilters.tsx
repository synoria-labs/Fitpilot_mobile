import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme';
import type { WorkoutAnalyticsRange, WorkoutAnalyticsScopeKind } from '../../types';
import { progressColors, progressShadow } from './progressTheme';

export const progressRangeLabels: Record<WorkoutAnalyticsRange, string> = {
  '2w': 'Últimas 2 semanas',
  '4w': 'Últimas 4 semanas',
  '8w': 'Últimas 8 semanas',
  '12w': 'Últimas 12 semanas',
  all: 'Todo el historial',
};

export function ProgressTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  return (
    <View
      style={[
        styles.tabs,
        {
          backgroundColor: theme.isDark ? colors.soft : 'rgba(255,255,255,0.68)',
          borderColor: colors.border,
        },
      ]}
    >
      {[
        { id: 'overview', label: 'Resumen' },
        { id: 'exercises', label: 'Ejercicios' },
        { id: 'history', label: 'Historial' },
      ].map((tab) => (
        <Pressable
          key={tab.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab.id }}
          onPress={() => onChange(tab.id)}
          style={styles.tab}
        >
          {value === tab.id ? (
            <LinearGradient
              colors={['#2563eb', '#4f46e5']}
              style={[StyleSheet.absoluteFill, { borderRadius: 13 }]}
            />
          ) : null}
          <Text style={[styles.tabText, { color: value === tab.id ? '#ffffff' : colors.muted }]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

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
  scopeLabel: string;
  programName?: string | null;
  onRangeChange: (range: WorkoutAnalyticsRange) => void;
  onScopeChange: (scope: string) => void;
}) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const [open, setOpen] = useState(false);
  const scopes = [
    { id: 'range', label: 'Por periodo' },
    { id: 'microcycle', label: 'Microciclo' },
    { id: 'mesocycle', label: 'Bloque' },
    { id: 'program', label: 'Programa' },
  ];
  return (
    <>
      <View style={styles.filterRow}>
        <Pressable
          testID="progress-period-filter"
          accessibilityRole="button"
          accessibilityLabel="Cambiar periodo de progreso"
          onPress={() => setOpen(true)}
          style={[styles.filter, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
          <Text numberOfLines={1} style={[styles.filterText, { color: colors.text }]}>
            {scope === 'range' ? progressRangeLabels[range] : scopeLabel}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.muted} />
        </Pressable>
        {programName ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver filtros del programa"
            onPress={() => setOpen(true)}
            style={[styles.program, { backgroundColor: colors.accentSoft }]}
          >
            <Text numberOfLines={1} style={[styles.programText, { color: colors.accent }]}>
              {programName}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Cerrar filtros"
            onPress={() => setOpen(false)}
          />
          <SafeAreaView
            edges={['bottom']}
            style={[styles.sheet, { backgroundColor: colors.surface }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.title, { color: colors.text }]}>Periodo de progreso</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar filtros"
                onPress={() => setOpen(false)}
                style={styles.close}
              >
                <Ionicons name="close" size={23} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView>
              {(Object.entries(progressRangeLabels) as [WorkoutAnalyticsRange, string][]).map(
                ([id, label]) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: scope === 'range' && range === id }}
                    key={id}
                    onPress={() => {
                      onScopeChange('range');
                      onRangeChange(id);
                      setOpen(false);
                    }}
                    style={styles.option}
                  >
                    <Text style={{ color: colors.text }}>{label}</Text>
                    {scope === 'range' && range === id ? (
                      <Ionicons name="checkmark" size={20} color={colors.accent} />
                    ) : null}
                  </Pressable>
                ),
              )}
              <Text style={[styles.sheetCaption, { color: colors.muted }]}>EXPLORAR TU PLAN</Text>
              {scopes
                .filter((item) => item.id !== 'range')
                .map((item) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: scope === item.id }}
                    key={item.id}
                    onPress={() => {
                      onScopeChange(item.id);
                      setOpen(false);
                    }}
                    style={styles.option}
                  >
                    <Text style={{ color: colors.text }}>{item.label}</Text>
                    {scope === item.id ? (
                      <Ionicons name="checkmark" size={20} color={colors.accent} />
                    ) : null}
                  </Pressable>
                ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 18, borderWidth: 1, gap: 3 },
  tab: {
    flex: 1,
    minHeight: 43,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 44,
    ...progressShadow,
  },
  filterText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  program: { flex: 1, borderRadius: 12, padding: 9 },
  programText: { fontSize: 10, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 14,
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800' },
  close: { padding: 12 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 12,
  },
  sheetCaption: { fontSize: 11, letterSpacing: 1, fontWeight: '700', marginTop: 18 },
});
