import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuroraCard, AuroraSegmented, IconBadge, type AuroraSegmentOption } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import {
  buildActivityGrid,
  describeActivityCell,
  summarizeActivity,
  type ActivityCell,
  type ActivityMode,
  type DailyActivity,
} from '../../utils/activityGrid';
import { getTodayDateKey } from '../../utils/date';
import { ActivityHeatGrid } from './ActivityHeatGrid';

const MODE_OPTIONS: readonly AuroraSegmentOption<ActivityMode>[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'entreno', label: 'Entreno' },
  { key: 'pasos', label: 'Pasos' },
];

const LEGEND_CAPTION: Record<ActivityMode, string> = {
  todo: 'Metas cumplidas por día',
  entreno: 'Volumen por sesión',
  pasos: 'Pasos por día',
};

const WEEKDAY_LABELS = [
  { row: 0, label: 'Lun' },
  { row: 2, label: 'Mié' },
  { row: 4, label: 'Vie' },
];

const CARD_PADDING = 18;
const LABEL_COLUMN = 26;
const LABEL_GAP = 8;
const GAP = 4;

type ActivityGridCardProps = {
  days: Record<string, DailyActivity>;
  startKey: string | null;
  hasLoaded: boolean;
  contentWidth: number;
  horizontalPadding: number;
  weeks?: number;
};

export const ActivityGridCard = ({
  days,
  startKey,
  hasLoaded,
  contentWidth,
  horizontalPadding,
  weeks = 16,
}: ActivityGridCardProps) => {
  const aurora = useAurora();
  const [mode, setMode] = useState<ActivityMode>('todo');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const todayKey = getTodayDateKey();

  const model = useMemo(
    () => buildActivityGrid({ todayKey, weeks, days, mode, startKey }),
    [days, mode, startKey, todayKey, weeks],
  );
  const stats = useMemo(() => summarizeActivity(model, mode), [mode, model]);
  const activeIndex = selectedIndex ?? model.todayIndex;
  const activeCell: ActivityCell | undefined = model.cells[activeIndex];
  const detail = activeCell ? describeActivityCell(activeCell) : null;
  const hasAnyData = Object.keys(days).length > 0;

  const gridWidth = Math.max(0, contentWidth - horizontalPadding * 2 - CARD_PADDING * 2 - LABEL_COLUMN - LABEL_GAP);
  const cellSize = Math.max(9, Math.min(18, Math.floor((gridWidth - GAP * (weeks - 1)) / weeks)));
  const heat = aurora.heat[mode];

  const changeMode = useCallback((next: ActivityMode) => {
    setMode(next);
  }, []);

  return (
    <View style={{ paddingHorizontal: horizontalPadding }}>
      <AuroraCard padding={CARD_PADDING}>
        <View style={styles.header}>
          <IconBadge icon="calendar-clear-outline" tone="violet" />
          <View style={styles.headerText}>
            <Text style={[auroraType.headline, { color: aurora.text }]}>Tu constancia</Text>
            <Text style={[auroraType.caption, { color: aurora.faint }]}>Últimas {weeks} semanas</Text>
          </View>
        </View>

        <View style={styles.segmented}>
          <AuroraSegmented
            options={MODE_OPTIONS}
            value={mode}
            onChange={changeMode}
            accessibilityLabel="Qué mostrar en la cuadrícula"
          />
        </View>

        <View style={styles.stats}>
          {stats.map((stat) => (
            <View key={stat.label} style={[styles.stat, { backgroundColor: aurora.surface2 }]}>
              <Text style={[auroraType.label, styles.statLabel, { color: aurora.faint }]} numberOfLines={1}>
                {stat.label}
              </Text>
              <Text style={[styles.statValue, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
                {hasLoaded ? stat.value : '—'}
              </Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
                {stat.caption}
              </Text>
            </View>
          ))}
        </View>

        <ActivityHeatGrid
          model={model}
          mode={mode}
          heat={heat}
          cellSize={cellSize}
          gap={GAP}
          labelColumn={LABEL_COLUMN}
          labelGap={LABEL_GAP}
          weekdayLabels={WEEKDAY_LABELS}
          showMonths
          hasLoaded={hasLoaded}
          activeIndex={activeIndex >= 0 ? activeIndex : null}
          onSelect={setSelectedIndex}
          accessibilityLabel={`Actividad diaria de las últimas ${weeks} semanas`}
          style={styles.gridRow}
        />

        <View style={styles.legend}>
          <Text style={[auroraType.caption, styles.legendCaption, { color: aurora.faint }]} numberOfLines={1}>
            {LEGEND_CAPTION[mode]}
          </Text>
          <Text style={[auroraType.caption, { color: aurora.faint }]}>Menos</Text>
          {heat.map((color, level) => (
            <View key={level} style={[styles.swatch, { backgroundColor: color }]} />
          ))}
          <Text style={[auroraType.caption, { color: aurora.faint }]}>Más</Text>
        </View>

        {detail ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.inspector, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}
          >
            <View style={styles.inspectorHeader}>
              <Text style={[styles.inspectorTitle, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
                {detail.title}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: detail.isToday ? aurora.tones.blue.soft : aurora.tones.violet.soft },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    auroraFont('extrabold'),
                    { color: detail.isToday ? aurora.tones.blue.ink : aurora.tones.violet.ink },
                  ]}
                >
                  {detail.badge}
                </Text>
              </View>
            </View>
            <View style={styles.inspectorRows}>
              {detail.rows.map((row, index) => (
                <View key={row.key} style={[styles.inspectorRow, index === 0 ? styles.inspectorRowWide : null]}>
                  <Text style={[auroraType.caption, auroraFont('semibold'), { color: aurora.faint }]}>{row.label}</Text>
                  <Text
                    style={[styles.inspectorValue, auroraFont('bold'), { color: aurora.text }]}
                    numberOfLines={1}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[auroraType.caption, styles.hint, { color: aurora.faint }]}>
              {hasLoaded && !hasAnyData
                ? 'Tu actividad aparecerá aquí cuando entrenes o conectes tu app de salud.'
                : 'Toca un día o desliza el dedo sobre la cuadrícula.'}
            </Text>
          </View>
        ) : null}
      </AuroraCard>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  segmented: {
    marginTop: 14,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  statLabel: {
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  statValue: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  gridRow: {
    marginTop: 16,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  legendCaption: {
    flex: 1,
  },
  swatch: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },
  inspector: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inspectorTitle: {
    flexShrink: 1,
    fontSize: 14,
  },
  badge: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
  },
  inspectorRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    marginTop: 12,
  },
  inspectorRow: {
    width: '50%',
    paddingRight: 8,
  },
  inspectorRowWide: {
    width: '100%',
  },
  inspectorValue: {
    marginTop: 2,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: 12,
  },
});
