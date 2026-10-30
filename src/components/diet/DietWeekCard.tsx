import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { SlantedCapsule, getSlantedCapsuleBox, type AuroraIconName } from '../aurora';
import type { SharedWeeklyCalendarDay } from '../calendar/SharedWeeklyCalendar';
import { useSlidingCapsuleStyle, useWeekSwipe } from '../../hooks/useWeekStripMotion';
import { AURORA_SIGNATURE_ANGLE, auroraFont, useAurora } from '../../theme/aurora';
import { getWeekdayLetter } from '../../utils/weekdayLetter';

const STRIP_HEIGHT = 70;
const CAPSULE_WIDTH = 44;
const CAPSULE_BOX = getSlantedCapsuleBox(CAPSULE_WIDTH, STRIP_HEIGHT);
const SLANT = Math.tan((AURORA_SIGNATURE_ANGLE * Math.PI) / 180);

// Letter, number and dot follow the capsule's slant on the selected day.
const shiftFor = (dy: number) => ({ transform: [{ translateX: dy * SLANT }] });
const LETTER_SHIFT = shiftFor(-15.5);
const NUMBER_SHIFT = shiftFor(4.5);
const DOT_SHIFT = shiftFor(20);

type DietWeekCardProps = {
  days: SharedWeeklyCalendarDay[];
  /** The month of the visible week, «Octubre». */
  monthLabel: string;
  rangeLabel: string | null;
  canGoToPreviousWeek?: boolean;
  canGoToNextWeek?: boolean;
  showWeekButtons?: boolean;
  onShiftWeek: (direction: -1 | 1) => void;
  onOpenDatePicker?: () => void;
};

/** The diet week on glass: month and range, and the days with an emerald capsule on the chosen one. */
export const DietWeekCard = ({
  days,
  monthLabel,
  rangeLabel,
  canGoToPreviousWeek = true,
  canGoToNextWeek = true,
  showWeekButtons = false,
  onShiftWeek,
  onOpenDatePicker,
}: DietWeekCardProps) => {
  const aurora = useAurora();
  const emerald = aurora.tones.emerald;
  const [rowWidth, setRowWidth] = useState(0);
  const selectedIndex = days.findIndex((day) => day.isSelected);
  const column = days.length ? rowWidth / days.length : 0;
  const capsuleStyle = useSlidingCapsuleStyle(
    selectedIndex >= 0 && rowWidth > 0 ? selectedIndex * column + column / 2 - CAPSULE_BOX.width / 2 : null,
  );
  const swipeHandlers = useWeekSwipe({ onShiftWeek, canGoToPreviousWeek, canGoToNextWeek });

  const handleLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: aurora.glass, borderColor: aurora.glassBorder, boxShadow: aurora.shadowLg },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
          {monthLabel}
          {rangeLabel ? (
            <Text style={[auroraFont('bold'), { color: aurora.faint }]}>{` · ${rangeLabel}`}</Text>
          ) : null}
        </Text>
        <View style={styles.actions}>
          {showWeekButtons ? (
            <>
              <IconButton
                icon="chevron-back"
                label="Semana anterior"
                disabled={!canGoToPreviousWeek}
                onPress={() => onShiftWeek(-1)}
              />
              <IconButton
                icon="chevron-forward"
                label="Semana siguiente"
                disabled={!canGoToNextWeek}
                onPress={() => onShiftWeek(1)}
              />
            </>
          ) : null}
          {onOpenDatePicker ? (
            <IconButton icon="calendar-clear-outline" label="Abrir calendario" onPress={onOpenDatePicker} />
          ) : null}
        </View>
      </View>

      <View
        accessibilityRole="list"
        accessibilityLabel="Semana del menú"
        onLayout={handleLayout}
        style={styles.strip}
        {...swipeHandlers}
      >
        <Animated.View pointerEvents="none" style={[styles.capsule, capsuleStyle]}>
          <SlantedCapsule width={CAPSULE_WIDTH} height={STRIP_HEIGHT} colors={emerald.gradient} shadow={emerald.tone} />
        </Animated.View>

        {days.map((day) => {
          const selected = day.isSelected;
          const hasMenu = day.variant !== 'rest';
          const color = selected ? aurora.onTone : day.isToday ? emerald.ink : aurora.text;

          return (
            <Pressable
              key={day.id}
              accessibilityRole="button"
              accessibilityLabel={`${day.dayLabel} ${day.dateNumber}${hasMenu ? ', con menú' : ', sin menú'}${day.isToday ? ', hoy' : ''}`}
              accessibilityState={{ selected }}
              onPress={day.onPress}
              style={styles.day}
            >
              <Text style={[styles.letter, auroraFont('bold'), { color }, selected ? LETTER_SHIFT : null]}>
                {getWeekdayLetter(day.dateKey) ?? day.dayLabel}
              </Text>
              <Text style={[styles.number, auroraFont('extrabold'), { color }, selected ? NUMBER_SHIFT : null]}>
                {day.dateNumber}
              </Text>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: hasMenu ? (selected ? aurora.onTone : emerald.tone) : 'transparent' },
                  selected ? DOT_SHIFT : null,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const IconButton = ({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: AuroraIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => {
  const aurora = useAurora();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: aurora.surface,
          borderColor: aurora.border,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={aurora.tones.emerald.ink} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    flexDirection: 'row',
    height: STRIP_HEIGHT,
    marginTop: 10,
  },
  capsule: {
    position: 'absolute',
    left: 0,
    top: (STRIP_HEIGHT - CAPSULE_BOX.height) / 2,
  },
  day: {
    flex: 1,
    height: STRIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  letter: {
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.85,
  },
  number: {
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
