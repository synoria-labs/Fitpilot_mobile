import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';
import { AuroraCard, AuroraSegmented, IconBadge, type AuroraSegmentOption } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import {
  buildActivityGrid,
  describeActivityCell,
  describeCellForAccessibility,
  summarizeActivity,
  type ActivityCell,
  type ActivityMode,
  type DailyActivity,
} from '../../utils/activityGrid';
import { getTodayDateKey } from '../../utils/date';

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
const MONTH_ROW = 18;
const GAP = 4;
const RING_SPRING = { damping: 20, stiffness: 260, mass: 0.6 };

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
  const reduceMotion = useReducedMotion();
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
  const step = cellSize + GAP;
  const radius = Math.max(3, Math.round(cellSize * 0.28));
  const gridHeight = step * 7 - GAP;
  const heat = aurora.heat[mode];

  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  useEffect(() => {
    if (!activeCell) {
      return;
    }
    const x = activeCell.weekIndex * step;
    const y = activeCell.dayIndex * step;
    ringX.value = reduceMotion ? x : withSpring(x, RING_SPRING);
    ringY.value = reduceMotion ? y : withSpring(y, RING_SPRING);
  }, [activeCell, reduceMotion, ringX, ringY, step]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ringX.value }, { translateY: ringY.value }],
  }));

  const lastPickedRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const pickAt = useCallback(
    (x: number, y: number) => {
      const week = Math.floor(x / step);
      const row = Math.floor(y / step);
      if (week < 0 || week >= weeks || row < 0 || row > 6) {
        return;
      }
      const index = week * 7 + row;
      if (lastPickedRef.current !== index) {
        lastPickedRef.current = index;
        void Haptics.selectionAsync().catch(() => undefined);
      }
      setSelectedIndex(index);
    },
    [step, weeks],
  );

  // Tocar elige un día al soltar; deslizar en horizontal recorre la cuadrícula. Un gesto vertical
  // se lo queda el scroll de la pantalla sin mover la selección.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          isScrubbingRef.current = false;
        },
        onPanResponderMove: (event, gesture) => {
          if (!isScrubbingRef.current && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            isScrubbingRef.current = true;
          }
          if (isScrubbingRef.current) {
            pickAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
          }
        },
        onPanResponderRelease: (event, gesture) => {
          if (!isScrubbingRef.current && Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
            pickAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
          }
          isScrubbingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
        },
        // Mientras se recorre en horizontal, el scroll vertical no se queda con el gesto.
        onPanResponderTerminationRequest: () => !isScrubbingRef.current,
      }),
    [pickAt],
  );

  const shiftSelection = useCallback(
    (delta: number) => {
      const next = Math.min(model.cells.length - 1, Math.max(0, activeIndex + delta));
      setSelectedIndex(next);
    },
    [activeIndex, model.cells.length],
  );

  const changeMode = useCallback((next: ActivityMode) => {
    setMode(next);
  }, []);

  const cellStyle = (cell: ActivityCell) => {
    if (cell.isFuture) {
      return { backgroundColor: 'transparent', borderWidth: 1, borderColor: aurora.borderStrong };
    }
    if (cell.isBeforeStart) {
      return { backgroundColor: heat[0], opacity: 0.5 };
    }
    return { backgroundColor: heat[cell.level] };
  };

  const todayCell = model.todayIndex >= 0 ? model.cells[model.todayIndex] : null;
  const showTodayRing = todayCell && activeIndex !== model.todayIndex;

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

        <View style={styles.gridRow}>
          <View style={{ width: LABEL_COLUMN, marginRight: LABEL_GAP, paddingTop: MONTH_ROW }}>
            <View style={{ height: gridHeight }}>
              {WEEKDAY_LABELS.map((weekday) => (
                <Text
                  key={weekday.label}
                  style={[
                    styles.axisLabel,
                    auroraFont('semibold'),
                    { color: aurora.faint, top: weekday.row * step, height: cellSize, lineHeight: cellSize },
                  ]}
                >
                  {weekday.label}
                </Text>
              ))}
            </View>
          </View>

          <View>
            <View style={{ height: MONTH_ROW }}>
              {model.months.map((month) => (
                <Text
                  key={`${month.label}-${month.weekIndex}`}
                  style={[styles.monthLabel, auroraFont('bold'), { color: aurora.faint, left: month.weekIndex * step }]}
                >
                  {month.label}
                </Text>
              ))}
            </View>

            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Actividad diaria de las últimas ${weeks} semanas`}
              accessibilityValue={{ text: activeCell ? describeCellForAccessibility(activeCell, mode) : undefined }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => {
                shiftSelection(event.nativeEvent.actionName === 'increment' ? 1 : -1);
              }}
              style={{ width: step * weeks - GAP, height: gridHeight }}
              {...panResponder.panHandlers}
            >
              {model.cells.map((cell) => (
                <Animated.View
                  key={`${mode}-${hasLoaded ? 'listo' : 'cargando'}-${cell.dateKey}`}
                  pointerEvents="none"
                  entering={
                    reduceMotion
                      ? undefined
                      : ZoomIn.delay(Math.min(720, 100 + (cell.weekIndex + cell.dayIndex) * 24)).duration(360)
                  }
                  style={[
                    styles.cell,
                    {
                      left: cell.weekIndex * step,
                      top: cell.dayIndex * step,
                      width: cellSize,
                      height: cellSize,
                      borderRadius: radius,
                    },
                    cellStyle(cell),
                  ]}
                />
              ))}

              {showTodayRing && todayCell ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.ring,
                    {
                      left: todayCell.weekIndex * step - 3,
                      top: todayCell.dayIndex * step - 3,
                      width: cellSize + 6,
                      height: cellSize + 6,
                      borderRadius: radius + 3,
                      borderColor: aurora.tones.blue.tone,
                    },
                  ]}
                />
              ) : null}

              {activeCell ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.ring,
                    {
                      left: -3,
                      top: -3,
                      width: cellSize + 6,
                      height: cellSize + 6,
                      borderRadius: radius + 3,
                      borderColor: aurora.text,
                    },
                    ringStyle,
                  ]}
                />
              ) : null}
            </View>
          </View>
        </View>

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
    flexDirection: 'row',
    marginTop: 16,
  },
  axisLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 10,
  },
  monthLabel: {
    position: 'absolute',
    top: 0,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cell: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
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
