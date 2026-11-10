import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuroraCard, AuroraGlass, AuroraSegmented, IconBadge } from '../aurora';
import { ActivityHeatGrid } from '../activity/ActivityHeatGrid';
import { auroraFont, useAurora } from '../../theme/aurora';
import {
  buildActivityGrid, describeActivityCell, summarizeAnnualActivity,
  type ActivityMode, type DailyActivity,
} from '../../utils/activityGrid';
import { getTodayDateKey } from '../../utils/date';
import { formatCount, formatInteger } from '../../utils/formatters';

const MODES = [
  { key: 'todo', label: 'Todo' },
  { key: 'entreno', label: 'Entreno' },
  { key: 'pasos', label: 'Pasos' },
] as const;
const WEEKDAYS = [{ row: 0, label: 'Lun' }, { row: 2, label: 'Mié' }, { row: 4, label: 'Vie' }];

type Props = {
  days: Record<string, DailyActivity>;
  startKey: string | null;
  hasLoaded: boolean;
  workoutsFailed: boolean;
  healthFailed: boolean;
  reload: () => Promise<void>;
};

/** Profile's annual presentation uses the same activity model, gestures and data as Inicio/Entreno. */
export const ProfileActivityOverview = ({ days, startKey, hasLoaded, workoutsFailed, healthFailed, reload }: Props) => {
  const aurora = useAurora();
  const [mode, setMode] = useState<ActivityMode>('todo');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const todayKey = getTodayDateKey();
  const model = useMemo(() => buildActivityGrid({ todayKey, weeks: 53, days, mode, startKey }), [todayKey, days, mode, startKey]);
  const stats = useMemo(() => summarizeAnnualActivity(days, todayKey, startKey), [days, todayKey, startKey]);
  const activeIndex = selectedIndex ?? model.todayIndex;
  const cell = model.cells[activeIndex];
  const detail = cell ? describeActivityCell(cell) : null;
  const heat = aurora.heat[mode];
  const complete = hasLoaded && !workoutsFailed && !healthFailed;
  const items = [
    { value: hasLoaded && !workoutsFailed ? formatInteger(stats.sessions) : '—', label: 'Entrenos' },
    { value: complete ? formatInteger(stats.active) : '—', label: 'Días activos' },
    { value: complete ? formatCount(stats.best, 'día', 'días') : '—', label: 'Mejor racha' },
  ];

  return (
    <>
      <View style={styles.stats} accessibilityLabel="Actividad del último año">
        {items.map(item => (
          <AuroraGlass key={item.label} radius={20} blur={false} style={styles.stat}>
            <View style={styles.statContent}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: aurora.text }]}>{item.value}</Text>
              <Text style={[styles.caption, { color: aurora.faint }]}>{item.label}</Text>
            </View>
          </AuroraGlass>
        ))}
      </View>
      <AuroraCard style={styles.card}>
        <View style={styles.header}>
          <IconBadge icon="calendar-outline" tone="violet" variant="solid" size={38} />
          <View style={styles.copy}>
            <Text style={[styles.title, { color: aurora.text }]}>Tu año en FitPilot</Text>
            <Text style={[styles.subtitle, { color: aurora.faint }]}>
              {complete ? `${formatCount(stats.active, 'día activo', 'días activos')} en el último año` : hasLoaded ? 'Historial parcialmente disponible' : 'Cargando tu actividad…'}
            </Text>
          </View>
        </View>
        <View style={styles.segment}>
          <AuroraSegmented options={MODES} value={mode} onChange={setMode} accessibilityLabel="Actividad del calendario anual" />
        </View>
        <ActivityHeatGrid
          model={model} mode={mode} heat={heat} cellSize={12} gap={3}
          labelColumn={24} labelGap={6} weekdayLabels={WEEKDAYS}
          showMonths scrollable hasLoaded={hasLoaded} activeIndex={activeIndex} onSelect={setSelectedIndex}
          accessibilityLabel="Calendario de actividad del último año" style={styles.grid}
        />
        <View style={styles.legend}>
          <Text style={[styles.hint, styles.copy, { color: aurora.faint }]}>Desliza para ver meses anteriores</Text>
          <Text style={[styles.hint, { color: aurora.faint }]}>Menos</Text>
          {heat.map((color, i) => <View key={i} style={[styles.swatch, { backgroundColor: color }]} />)}
          <Text style={[styles.hint, { color: aurora.faint }]}>Más</Text>
        </View>
        {detail ? (
          <View accessibilityLiveRegion="polite" style={[styles.detail, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}>
            <View style={[styles.dayBadge, { backgroundColor: heat[cell.level] }]} />
            <View style={styles.copy}>
              <Text numberOfLines={1} style={[styles.detailTitle, { color: aurora.text }]}>{detail.title}{cell.isToday ? ' · hoy' : ''}</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: aurora.faint }]}>
                {!hasLoaded ? 'Cargando actividad…' : cell.isFuture ? 'Aún no llega' : !cell.activity ? 'Sin actividad registrada' : `${detail.rows[0].value} · ${detail.rows[1].value} pasos · ${detail.rows[2].value} de sueño`}
              </Text>
            </View>
          </View>
        ) : null}
        {workoutsFailed || healthFailed ? (
          <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.retry}>
            <Text style={[styles.subtitle, { color: aurora.tones.blue.ink }]}>No se pudo cargar todo el historial. Reintentar</Text>
          </Pressable>
        ) : null}
      </AuroraCard>
    </>
  );
};

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, minWidth: 0 },
  statContent: { paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  value: { ...auroraFont('extrabold'), fontSize: 22, lineHeight: 28, includeFontPadding: false, letterSpacing: -0.44 },
  caption: { ...auroraFont('semibold'), fontSize: 11.5, lineHeight: 15, includeFontPadding: false, marginTop: 2 },
  card: { marginTop: 20 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { ...auroraFont('extrabold'), fontSize: 16, letterSpacing: -0.3 },
  subtitle: { ...auroraFont('medium'), fontSize: 12, marginTop: 2 },
  segment: { marginTop: 14 },
  grid: { marginTop: 18 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  hint: { ...auroraFont('medium'), fontSize: 10 },
  swatch: { width: 11, height: 11, borderRadius: 3 },
  detail: { marginTop: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1 },
  dayBadge: { width: 28, height: 28, borderRadius: 8 },
  detailTitle: { ...auroraFont('extrabold'), fontSize: 13 },
  retry: { paddingVertical: 10 },
});
