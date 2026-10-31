import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';
import { auroraFont, useAurora, type AuroraHeatRamp } from '../../theme/aurora';
import {
  describeCellForAccessibility,
  type ActivityCell,
  type ActivityGridModel,
  type ActivityMode,
} from '../../utils/activityGrid';

const MONTH_ROW = 18;
const RING_SPRING = { damping: 20, stiffness: 260, mass: 0.6 };

export type ActivityWeekdayLabel = { row: number; label: string };

type ActivityHeatGridProps = {
  model: ActivityGridModel;
  mode: ActivityMode;
  heat: AuroraHeatRamp;
  cellSize: number;
  gap?: number;
  labelColumn: number;
  labelGap: number;
  weekdayLabels: readonly ActivityWeekdayLabel[];
  showMonths?: boolean;
  hasLoaded: boolean;
  /** Cell under the selection ring; null leaves only the ring around today. */
  activeIndex: number | null;
  onSelect: (index: number) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * La cuadrícula estilo GitHub: una columna por semana, de lunes a domingo. Tocar elige un día al
 * soltar y deslizar en horizontal la recorre; el lector de pantalla la mueve con gestos de ajuste.
 */
export const ActivityHeatGrid = ({
  model,
  mode,
  heat,
  cellSize,
  gap = 4,
  labelColumn,
  labelGap,
  weekdayLabels,
  showMonths = false,
  hasLoaded,
  activeIndex,
  onSelect,
  accessibilityLabel,
  style,
}: ActivityHeatGridProps) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const weeks = model.weeks;
  const step = cellSize + gap;
  const radius = Math.max(3, Math.round(cellSize * 0.28));
  const gridHeight = step * 7 - gap;
  const activeCell: ActivityCell | undefined = activeIndex == null ? undefined : model.cells[activeIndex];

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
      onSelect(index);
    },
    [onSelect, step, weeks],
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

  const shiftSelection = (delta: number) => {
    const from = activeIndex ?? model.todayIndex;
    onSelect(Math.min(model.cells.length - 1, Math.max(0, from + delta)));
  };

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
  const a11yCell = activeCell ?? todayCell ?? undefined;

  return (
    <View style={[styles.root, style]}>
      <View style={{ width: labelColumn, marginRight: labelGap, paddingTop: showMonths ? MONTH_ROW : 0 }}>
        <View style={{ height: gridHeight }}>
          {weekdayLabels.map((weekday) => (
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
        {showMonths ? (
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
        ) : null}

        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: a11yCell ? describeCellForAccessibility(a11yCell, mode) : undefined }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            shiftSelection(event.nativeEvent.actionName === 'increment' ? 1 : -1);
          }}
          style={{ width: step * weeks - gap, height: gridHeight }}
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
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
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
});
