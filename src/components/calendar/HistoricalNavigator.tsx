import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../constants/colors';
import { useThemedStyles, type AppTheme } from '../../theme';
import { auroraFont, auroraRadius, auroraType, getAuroraTokens, useAurora } from '../../theme/aurora';
import {
  SharedWeeklyCalendar,
  type SharedWeeklyCalendarDay,
} from './SharedWeeklyCalendar';

interface HistoricalNavigatorProps {
  days: SharedWeeklyCalendarDay[];
  title: string;
  subtitle?: string | null;
  eyebrow?: string | null;
  weekLabel?: string | null;
  contentWidth?: number;
  isTabletPortrait?: boolean;
  canGoToPreviousWeek?: boolean;
  canGoToNextWeek?: boolean;
  showWeekButtons?: boolean;
  datePickerLabel?: string;
  accentColor?: string;
  onShiftWeek: (direction: -1 | 1) => void;
  onOpenDatePicker?: () => void;
}

const SWIPE_ACTIVATION_THRESHOLD = 10;
const SWIPE_THRESHOLD = 28;

export const HistoricalNavigator: React.FC<HistoricalNavigatorProps> = ({
  days,
  title,
  subtitle,
  eyebrow,
  weekLabel,
  contentWidth = 390,
  isTabletPortrait = false,
  canGoToPreviousWeek = true,
  canGoToNextWeek = true,
  showWeekButtons = true,
  datePickerLabel = 'Ir a fecha',
  accentColor,
  onShiftWeek,
  onOpenDatePicker,
}) => {
  const aurora = useAurora();
  const styles = useThemedStyles(createStyles);
  const showEyebrow = Boolean(eyebrow);
  const resolvedAccentColor = accentColor ?? aurora.tones.blue.ink;
  const showDateButtonText = contentWidth >= 420;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > SWIPE_ACTIVATION_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > SWIPE_ACTIVATION_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          if (Math.abs(gestureState.dx) < SWIPE_THRESHOLD || days.length === 0) {
            return;
          }

          if (gestureState.dx < 0 && canGoToNextWeek) {
            onShiftWeek(1);
            return;
          }

          if (gestureState.dx > 0 && canGoToPreviousWeek) {
            onShiftWeek(-1);
          }
        },
      }),
    [canGoToNextWeek, canGoToPreviousWeek, days.length, onShiftWeek],
  );

  if (!days.length) {
    return null;
  }

  return (
    <View style={styles.containerSurface}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            {showEyebrow ? (
              <Text style={[styles.eyebrow, { color: resolvedAccentColor }]}>{eyebrow}</Text>
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                showEyebrow ? styles.titleWithEyebrow : null,
              ]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            {weekLabel ? (
              <View style={styles.weekPill}>
                <Text
                  numberOfLines={1}
                  style={[styles.weekPillText, { color: resolvedAccentColor }]}
                >
                  {weekLabel}
                </Text>
              </View>
            ) : null}

            {showWeekButtons ? (
              <>
                <Pressable
                  onPress={() => onShiftWeek(-1)}
                  disabled={!canGoToPreviousWeek}
                  accessibilityRole="button"
                  accessibilityLabel="Semana anterior"
                  style={[
                    styles.navButton,
                    !canGoToPreviousWeek ? styles.navButtonDisabled : null,
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={canGoToPreviousWeek ? aurora.text : aurora.faint}
                  />
                </Pressable>

                <Pressable
                  onPress={() => onShiftWeek(1)}
                  disabled={!canGoToNextWeek}
                  accessibilityRole="button"
                  accessibilityLabel="Semana siguiente"
                  style={[
                    styles.navButton,
                    !canGoToNextWeek ? styles.navButtonDisabled : null,
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={canGoToNextWeek ? aurora.text : aurora.faint}
                  />
                </Pressable>
              </>
            ) : null}

            {onOpenDatePicker ? (
              <Pressable
                onPress={onOpenDatePicker}
                accessibilityRole="button"
                accessibilityLabel={datePickerLabel}
                style={[
                  styles.dateButton,
                  !showDateButtonText ? styles.dateButtonIconOnly : null,
                ]}
              >
                <Ionicons name="calendar-clear-outline" size={18} color={resolvedAccentColor} />
                {showDateButtonText ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dateButtonText,
                      { color: resolvedAccentColor },
                    ]}
                  >
                    {datePickerLabel}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.calendarWrap} {...panResponder.panHandlers}>
          <SharedWeeklyCalendar
            days={days}
            heroSelectionMode="selected-only"
            density="compact"
            contentWidth={contentWidth}
            isTabletPortrait={isTabletPortrait}
          />
        </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) => {
  const aurora = getAuroraTokens(theme.isDark);

  return StyleSheet.create({
    containerSurface: {
      borderRadius: auroraRadius.card,
      backgroundColor: aurora.surface,
      borderWidth: 1,
      borderColor: aurora.border,
      boxShadow: aurora.shadow,
      paddingTop: 8,
      paddingBottom: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      ...auroraType.label,
    },
    title: {
      ...auroraFont('extrabold'),
      fontSize: 15,
      lineHeight: 20,
      color: aurora.text,
    },
    titleWithEyebrow: {
      marginTop: 1,
    },
    subtitle: {
      ...auroraFont('medium'),
      marginTop: 1,
      fontSize: 12,
      lineHeight: 16,
      color: aurora.faint,
    },
    weekPill: {
      minHeight: 32,
      maxWidth: 116,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: aurora.surface2,
      borderWidth: 1,
      borderColor: aurora.border,
    },
    weekPillText: {
      ...auroraFont('bold'),
      fontSize: 11.5,
      textTransform: 'capitalize',
      textAlign: 'center',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.xs,
      flexShrink: 0,
    },
    navButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: aurora.surface2,
      borderWidth: 1,
      borderColor: aurora.border,
    },
    navButtonDisabled: {
      opacity: 0.5,
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 44,
      paddingHorizontal: 10,
      borderRadius: 14,
      backgroundColor: aurora.surface2,
      borderWidth: 1,
      borderColor: aurora.border,
    },
    dateButtonIconOnly: {
      width: 44,
      paddingHorizontal: 0,
      justifyContent: 'center',
    },
    dateButtonText: {
      ...auroraFont('bold'),
      fontSize: 12,
    },
    calendarWrap: {
      marginTop: -4,
    },
  });
};

export default HistoricalNavigator;
