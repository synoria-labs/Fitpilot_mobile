import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../../constants/colors';
import {
  formatLocalDate,
  parseLocalDate,
  toLocalDateKey,
} from '../../utils/date';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

type CalendarDateInput = Date | string | null | undefined;

export interface CalendarDatePickerPanelProps {
  selectedDate?: CalendarDateInput;
  initialVisibleDate?: CalendarDateInput;
  minDate?: CalendarDateInput;
  maxDate?: CalendarDateInput;
  disabledDateKeys?: string[];
  isActive?: boolean;
  onSelect: (date: Date) => void;
}

interface CalendarDatePickerModalProps extends Omit<CalendarDatePickerPanelProps, 'isActive'> {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}

type CalendarDay = {
  key: string;
  date: Date;
  label: string;
  inCurrentMonth: boolean;
  disabled: boolean;
};

type CalendarSelectorMode = 'month' | 'year' | null;

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const YEAR_GRID_COLUMNS = 4;
const YEAR_ROW_HEIGHT = 44;
const DEFAULT_YEAR_RANGE = 120;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, monthIndex) => ({
  label: formatLocalDate(new Date(2020, monthIndex, 1, 12, 0, 0, 0), {
    month: 'short',
  }).replace('.', ''),
  value: monthIndex,
}));

const startOfMonth = (value: Date) => {
  const nextDate = new Date(value);
  nextDate.setDate(1);
  nextDate.setHours(12, 0, 0, 0);
  return nextDate;
};

const endOfMonth = (value: Date) => {
  const nextDate = new Date(value);
  nextDate.setMonth(nextDate.getMonth() + 1, 0);
  nextDate.setHours(12, 0, 0, 0);
  return nextDate;
};

const addMonths = (value: Date, months: number) => {
  const nextDate = new Date(value);
  nextDate.setMonth(nextDate.getMonth() + months, 1);
  nextDate.setHours(12, 0, 0, 0);
  return nextDate;
};

const compareDays = (left: Date, right: Date) => {
  const leftKey = toLocalDateKey(left);
  const rightKey = toLocalDateKey(right);

  if (!leftKey || !rightKey) {
    return 0;
  }

  return leftKey.localeCompare(rightKey);
};

const compareMonths = (left: Date, right: Date) => (
  left.getFullYear() - right.getFullYear() ||
  left.getMonth() - right.getMonth()
);

export const CalendarDatePickerPanel: React.FC<CalendarDatePickerPanelProps> = ({
  selectedDate,
  initialVisibleDate,
  minDate,
  maxDate,
  disabledDateKeys,
  isActive = true,
  onSelect,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const parsedSelectedDate = parseLocalDate(selectedDate) ?? null;
  const initialVisibleDateKey = toLocalDateKey(initialVisibleDate);
  const parsedInitialVisibleDate = parseLocalDate(initialVisibleDateKey) ?? null;
  const parsedMinDate = parseLocalDate(minDate) ?? null;
  const parsedMaxDate = parseLocalDate(maxDate) ?? null;
  const selectedDateKey = toLocalDateKey(parsedSelectedDate);
  const disabledDateKeySet = useMemo(
    () => new Set(disabledDateKeys ?? []),
    [disabledDateKeys],
  );
  const yearScrollRef = React.useRef<ScrollView>(null);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(parsedSelectedDate ?? parsedInitialVisibleDate ?? new Date()),
  );
  const [selectorMode, setSelectorMode] = useState<CalendarSelectorMode>(null);

  const clampMonthToBounds = (value: Date) => {
    const nextMonth = startOfMonth(value);

    if (parsedMinDate && compareMonths(nextMonth, startOfMonth(parsedMinDate)) < 0) {
      return startOfMonth(parsedMinDate);
    }

    if (parsedMaxDate && compareMonths(nextMonth, startOfMonth(parsedMaxDate)) > 0) {
      return startOfMonth(parsedMaxDate);
    }

    return nextMonth;
  };

  useEffect(() => {
    if (!isActive) {
      setSelectorMode(null);
      return;
    }

    const nextSelectedDate = selectedDateKey
      ? parseLocalDate(selectedDateKey)
      : null;
    const nextInitialVisibleDate = parseLocalDate(initialVisibleDateKey) ?? null;
    const nextMonth = startOfMonth(nextSelectedDate ?? nextInitialVisibleDate ?? new Date());

    setCalendarMonth((currentMonth) => (
      compareMonths(currentMonth, nextMonth) === 0
        ? currentMonth
        : nextMonth
    ));
  }, [initialVisibleDateKey, isActive, selectedDateKey]);

  const yearOptions = useMemo(() => {
    const currentYear = calendarMonth.getFullYear();
    const minYear = parsedMinDate?.getFullYear();
    const maxYear = parsedMaxDate?.getFullYear();
    const startYear = minYear ?? (
      maxYear !== undefined ? maxYear - DEFAULT_YEAR_RANGE : currentYear - 10
    );
    const endYear = maxYear ?? (
      minYear !== undefined ? minYear + DEFAULT_YEAR_RANGE : currentYear + 10
    );

    return Array.from(
      { length: Math.max(0, endYear - startYear + 1) },
      (_, index) => startYear + index,
    );
  }, [calendarMonth, parsedMaxDate, parsedMinDate]);

  useEffect(() => {
    if (selectorMode !== 'year') {
      return undefined;
    }

    const selectedYearIndex = yearOptions.indexOf(calendarMonth.getFullYear());
    if (selectedYearIndex < 0) {
      return undefined;
    }

    const timer = setTimeout(() => {
      const rowIndex = Math.floor(selectedYearIndex / YEAR_GRID_COLUMNS);
      yearScrollRef.current?.scrollTo({
        y: Math.max(0, (rowIndex - 2) * YEAR_ROW_HEIGHT),
        animated: false,
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [calendarMonth, selectorMode, yearOptions]);

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
    const totalDays = Math.round(
      (gridEnd.getTime() - gridStart.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;

    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      date.setHours(12, 0, 0, 0);
      const dateKey = toLocalDateKey(date) ?? `${date.getTime()}`;

      const disabled = Boolean(
        (parsedMinDate && compareDays(date, parsedMinDate) < 0) ||
        (parsedMaxDate && compareDays(date, parsedMaxDate) > 0) ||
        disabledDateKeySet.has(dateKey),
      );

      return {
        key: dateKey,
        date,
        label: `${date.getDate()}`,
        inCurrentMonth: date.getMonth() === monthStart.getMonth(),
        disabled,
      };
    });
  }, [calendarMonth, disabledDateKeySet, parsedMaxDate, parsedMinDate]);

  const canGoToPreviousMonth = !parsedMinDate ||
    compareMonths(calendarMonth, startOfMonth(parsedMinDate)) > 0;
  const canGoToNextMonth = !parsedMaxDate ||
    compareMonths(calendarMonth, startOfMonth(parsedMaxDate)) < 0;
  const currentMonthLabel = formatLocalDate(calendarMonth, { month: 'long' });
  const currentYearLabel = `${calendarMonth.getFullYear()}`;

  const toggleSelectorMode = (nextMode: Exclude<CalendarSelectorMode, null>) => {
    setSelectorMode((currentMode) => currentMode === nextMode ? null : nextMode);
  };

  const isMonthDisabled = (monthIndex: number) => {
    const candidateMonth = startOfMonth(
      new Date(calendarMonth.getFullYear(), monthIndex, 1, 12, 0, 0, 0),
    );

    return Boolean(
      (parsedMinDate && compareMonths(candidateMonth, startOfMonth(parsedMinDate)) < 0) ||
      (parsedMaxDate && compareMonths(candidateMonth, startOfMonth(parsedMaxDate)) > 0),
    );
  };

  const handleMonthSelect = (monthIndex: number) => {
    setCalendarMonth(clampMonthToBounds(
      new Date(calendarMonth.getFullYear(), monthIndex, 1, 12, 0, 0, 0),
    ));
    setSelectorMode(null);
  };

  const handleYearSelect = (year: number) => {
    setCalendarMonth(clampMonthToBounds(
      new Date(year, calendarMonth.getMonth(), 1, 12, 0, 0, 0),
    ));
    setSelectorMode('month');
  };

  return (
    <>
      <View style={styles.monthHeader}>
        <Pressable
          onPress={() => {
            setSelectorMode(null);
            setCalendarMonth((currentDate) => addMonths(currentDate, -1));
          }}
          disabled={!canGoToPreviousMonth}
          style={[
            styles.monthNav,
            !canGoToPreviousMonth ? styles.monthNavDisabled : null,
          ]}
        >
          <Ionicons name="chevron-back-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>

        <View style={styles.monthSelectorGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Seleccionar mes"
            onPress={() => toggleSelectorMode('month')}
            style={[
              styles.monthSelectorButton,
              selectorMode === 'month' ? styles.monthSelectorButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.monthSelectorText,
                selectorMode === 'month' ? styles.monthSelectorTextActive : null,
              ]}
            >
              {currentMonthLabel}
            </Text>
            <Ionicons
              name={selectorMode === 'month' ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={16}
              color={selectorMode === 'month' ? colors.white : theme.colors.textSecondary}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Seleccionar año"
            onPress={() => toggleSelectorMode('year')}
            style={[
              styles.yearSelectorButton,
              selectorMode === 'year' ? styles.monthSelectorButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.yearSelectorText,
                selectorMode === 'year' ? styles.monthSelectorTextActive : null,
              ]}
            >
              {currentYearLabel}
            </Text>
            <Ionicons
              name={selectorMode === 'year' ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={16}
              color={selectorMode === 'year' ? colors.white : theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setSelectorMode(null);
            setCalendarMonth((currentDate) => addMonths(currentDate, 1));
          }}
          disabled={!canGoToNextMonth}
          style={[
            styles.monthNav,
            !canGoToNextMonth ? styles.monthNavDisabled : null,
          ]}
        >
          <Ionicons name="chevron-forward-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {selectorMode ? (
        <View style={styles.selectorPanel}>
          {selectorMode === 'month' ? (
            <View style={styles.monthGrid}>
              {MONTH_OPTIONS.map((month) => {
                const isSelected = month.value === calendarMonth.getMonth();
                const disabled = isMonthDisabled(month.value);

                return (
                  <Pressable
                    key={month.value}
                    disabled={disabled}
                    onPress={() => handleMonthSelect(month.value)}
                    style={[
                      styles.monthOption,
                      isSelected ? styles.selectorOptionActive : null,
                      disabled ? styles.selectorOptionDisabled : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthOptionText,
                        isSelected ? styles.selectorOptionTextActive : null,
                        disabled ? styles.selectorOptionTextDisabled : null,
                      ]}
                    >
                      {month.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <ScrollView
              ref={yearScrollRef}
              style={styles.yearScroll}
              contentContainerStyle={styles.yearGrid}
              showsVerticalScrollIndicator
            >
              {yearOptions.map((year) => {
                const isSelected = year === calendarMonth.getFullYear();

                return (
                  <Pressable
                    key={year}
                    onPress={() => handleYearSelect(year)}
                    style={[
                      styles.yearOption,
                      isSelected ? styles.selectorOptionActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.yearOptionText,
                        isSelected ? styles.selectorOptionTextActive : null,
                      ]}
                    >
                      {year}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : (
        <>
          <View style={styles.weekdaysRow}>
            {WEEKDAY_LABELS.map((weekday) => (
              <Text key={weekday} style={styles.weekday}>
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {calendarDays.map((day) => {
              const isSelected = selectedDateKey === toLocalDateKey(day.date);

              return (
                <Pressable
                  key={day.key}
                  disabled={day.disabled}
                  onPress={() => onSelect(day.date)}
                  style={[
                    styles.day,
                    day.disabled ? styles.dayDisabled : null,
                  ]}
                >
                  <View
                    style={[
                      styles.dayInner,
                      !day.inCurrentMonth ? styles.dayOutsideMonth : null,
                      isSelected ? styles.daySelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !day.inCurrentMonth ? styles.dayTextOutsideMonth : null,
                        day.disabled ? styles.dayTextDisabled : null,
                        isSelected ? styles.dayTextSelected : null,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </>
  );
};

export const CalendarDatePickerModal: React.FC<CalendarDatePickerModalProps> = ({
  visible,
  title,
  subtitle,
  onClose,
  ...panelProps
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-outline" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <CalendarDatePickerPanel {...panelProps} isActive={visible} />

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.doneButton}>
              <Text style={styles.doneButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      backgroundColor: theme.colors.overlay,
      zIndex: 30,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      minHeight: 500,
      maxHeight: '82%',
      alignSelf: 'center',
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    monthNav: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    monthNavDisabled: {
      opacity: 0.35,
    },
    monthSelectorGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    monthSelectorButton: {
      flex: 1,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    yearSelectorButton: {
      minWidth: 86,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    monthSelectorButtonActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    monthSelectorText: {
      flexShrink: 1,
      fontSize: fontSize.sm,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textTransform: 'capitalize',
    },
    yearSelectorText: {
      fontSize: fontSize.sm,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    monthSelectorTextActive: {
      color: colors.white,
    },
    selectorPanel: {
      minHeight: 294,
      justifyContent: 'center',
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: spacing.sm,
    },
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    monthOption: {
      width: '30.9%',
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    monthOptionText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'capitalize',
    },
    yearScroll: {
      maxHeight: 264,
    },
    yearGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    yearOption: {
      width: '22.5%',
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    yearOptionText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    selectorOptionActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    selectorOptionDisabled: {
      opacity: 0.35,
    },
    selectorOptionTextActive: {
      color: colors.white,
    },
    selectorOptionTextDisabled: {
      color: theme.colors.iconMuted,
    },
    weekdaysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    weekday: {
      width: '14.2857%',
      textAlign: 'center',
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.iconMuted,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      flexGrow: 1,
      alignContent: 'space-between',
    },
    day: {
      width: '14.2857%',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayDisabled: {
      opacity: 0.32,
    },
    dayInner: {
      width: 38,
      height: 38,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    dayOutsideMonth: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    daySelected: {
      backgroundColor: theme.colors.primary,
      borderRadius: borderRadius.full,
    },
    dayText: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    dayTextOutsideMonth: {
      color: theme.colors.iconMuted,
    },
    dayTextDisabled: {
      color: theme.colors.iconMuted,
    },
    dayTextSelected: {
      color: colors.white,
    },
    footer: {
      marginTop: spacing.md,
      alignItems: 'flex-end',
    },
    doneButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primary,
    },
    doneButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: colors.white,
    },
  });

export default CalendarDatePickerModal;
