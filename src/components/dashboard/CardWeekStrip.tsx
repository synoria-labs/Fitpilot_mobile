import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { useSlidingCapsuleStyle, useWeekSwipe } from '../../hooks/useWeekStripMotion';
import { AURORA_SIGNATURE_ANGLE, auroraFont } from '../../theme/aurora';
import { SlantedCapsule, getSlantedCapsuleBox } from '../aurora';
import type { SharedWeeklyCalendarDay } from '../calendar/SharedWeeklyCalendar';
import { getWeekdayLetter } from '../../utils/weekdayLetter';

const SLOT_WIDTH = 40;
const CIRCLE_SIZE = 36;
const CAPSULE_WIDTH = 42;
const CAPSULE_HEIGHT = 82;
const SLANT = Math.tan((AURORA_SIGNATURE_ANGLE * Math.PI) / 180);
const CAPSULE_BOX = getSlantedCapsuleBox(CAPSULE_WIDTH, CAPSULE_HEIGHT);
const ROW_TOP_PADDING = 7;

// Offsets of the letter, number and dot from the capsule's centre, so they follow its slant.
const shiftFor = (dy: number) => ({ transform: [{ translateX: dy * SLANT }] });
const LETTER_SHIFT = shiftFor(-26.5);
const NUMBER_SHIFT = shiftFor(5);
const DOT_SHIFT = shiftFor(31.5);

type DayLook = {
  circle: object;
  text: object;
  dot: string;
  gradient?: readonly [string, string];
};

const getDayLook = (day: SharedWeeklyCalendarDay): DayLook => {
  switch (day.variant) {
    case 'complete':
      return {
        circle: { boxShadow: '0px 6px 16px -6px rgba(56, 189, 248, 0.8)' },
        text: { color: '#ffffff', ...auroraFont('extrabold') },
        dot: '#7dd3fc',
        gradient: ['#38bdf8', '#6366f1'],
      };
    case 'partial':
      return {
        circle: { backgroundColor: 'rgba(56, 189, 248, 0.16)', borderWidth: 1, borderColor: 'rgba(125, 211, 252, 0.5)' },
        text: { color: '#e0f2fe', ...auroraFont('extrabold') },
        dot: '#7dd3fc',
      };
    case 'missed':
      return {
        circle: { backgroundColor: 'rgba(251, 191, 36, 0.12)', borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.42)' },
        text: { color: '#fde68a', ...auroraFont('bold') },
        dot: '#fbbf24',
      };
    case 'rest':
      return {
        circle: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255, 255, 255, 0.24)' },
        text: { color: '#8ea3c2', ...auroraFont('bold') },
        dot: 'transparent',
      };
    default:
      return {
        circle: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
        text: { color: '#c6d4ea', ...auroraFont('bold') },
        dot: 'transparent',
      };
  }
};

type CardWeekStripProps = {
  days: SharedWeeklyCalendarDay[];
  canGoToPreviousWeek?: boolean;
  canGoToNextWeek?: boolean;
  onShiftWeek?: (direction: -1 | 1) => void;
};

/**
 * The week inside the today card: one column per day on the navy surface, with the selected
 * day held by a leaning glass capsule that slides (and leans further) when the day changes.
 */
export const CardWeekStrip = ({
  days,
  canGoToPreviousWeek = true,
  canGoToNextWeek = true,
  onShiftWeek,
}: CardWeekStripProps) => {
  const [rowWidth, setRowWidth] = useState(0);
  const selectedIndex = days.findIndex((day) => day.isSelected);
  const step = days.length > 1 ? (rowWidth - SLOT_WIDTH) / (days.length - 1) : 0;
  const capsuleStyle = useSlidingCapsuleStyle(
    selectedIndex >= 0 && rowWidth > 0
      ? selectedIndex * step + SLOT_WIDTH / 2 - CAPSULE_BOX.width / 2
      : null,
  );
  const swipeHandlers = useWeekSwipe({ onShiftWeek, canGoToPreviousWeek, canGoToNextWeek });

  const handleLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width);

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel="Semana de entrenamiento"
      onLayout={handleLayout}
      style={styles.row}
      {...swipeHandlers}
    >
      <Animated.View pointerEvents="none" style={[styles.capsule, capsuleStyle]}>
        <SlantedCapsule
          width={CAPSULE_WIDTH}
          height={CAPSULE_HEIGHT}
          colors={['#7dd3fc', '#6366f1']}
          fillOpacity={0.3}
          stroke="#ffffff"
          strokeOpacity={0.72}
          strokeWidth={1.5}
          halo="#7dd3fc"
        />
      </Animated.View>

      {days.map((day) => {
        const look = getDayLook(day);
        const selected = day.isSelected;
        const label = `${day.dayLabel} ${day.dateNumber}${day.isToday ? ', hoy' : ''}${day.statusText ? `: ${day.statusText}` : ''}`;

        return (
          <Pressable
            key={day.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected, disabled: day.isDisabled }}
            disabled={day.isDisabled || !day.onPress}
            onPress={day.onPress}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.slot, day.isDisabled ? styles.slotDisabled : null]}
          >
            <Text
              style={[
                styles.letter,
                auroraFont('bold'),
                { color: selected || day.isToday ? '#ffffff' : '#8ea3c2' },
                selected ? LETTER_SHIFT : null,
              ]}
            >
              {getWeekdayLetter(day.dateKey) ?? day.dayLabel}
            </Text>
            <View style={selected ? NUMBER_SHIFT : null}>
              {look.gradient ? (
                <LinearGradient
                  colors={look.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.circle, look.circle]}
                >
                  <Text style={[styles.number, look.text]}>{day.dateNumber}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.circle, selected ? styles.circleSelected : look.circle]}>
                  <Text
                    style={[
                      styles.number,
                      selected ? styles.numberSelected : look.text,
                    ]}
                  >
                    {day.dateNumber}
                  </Text>
                </View>
              )}
            </View>
            <View
              style={[
                styles.dot,
                { backgroundColor: day.isToday && look.dot === 'transparent' ? '#ffffff' : look.dot },
                selected ? DOT_SHIFT : null,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: ROW_TOP_PADDING,
    paddingBottom: 4,
  },
  capsule: {
    position: 'absolute',
    left: 0,
    top: CAPSULE_HEIGHT / 2 - CAPSULE_BOX.height / 2,
  },
  slot: {
    width: SLOT_WIDTH,
    alignItems: 'center',
    gap: 6,
  },
  slotDisabled: {
    opacity: 0.45,
  },
  letter: {
    fontSize: 11,
    lineHeight: 15,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelected: {
    backgroundColor: 'transparent',
  },
  number: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  numberSelected: {
    ...auroraFont('extrabold'),
    fontSize: 15,
    color: '#ffffff',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
