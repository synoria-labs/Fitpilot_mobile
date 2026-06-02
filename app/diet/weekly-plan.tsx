import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, SegmentedControl } from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { DietMenuSelectorModal } from '../../src/components/diet';
import { borderRadius, fontSize, spacing } from '../../src/constants/colors';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  addDaysToDateKey,
  formatLocalDate,
  getLocalWeekDateKeys,
  getStartOfLocalWeekDateKey,
  getTodayDateKey,
} from '../../src/utils/date';
import {
  getClientDietCalendar,
  getClientDietMenuCalendar,
  updateClientDailyPrimarySelection,
} from '../../src/services/diet';
import { generateShoppingList } from '../../src/services/shoppingList';
import {
  cancelMealPlanningReminder,
  DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS,
  getMealPlanningReminderSettings,
  saveMealPlanningReminderSettings,
  scheduleMealPlanningReminder,
  type MealPlanningReminderHour,
  type MealPlanningReminderSettings,
  type MealPlanningReminderWeekday,
} from '../../src/services/mealPlanningReminder';
import { mergeDietMenuOptions } from '../../src/utils/dietMenuSelection';
import type { ClientDietMenu } from '../../src/types';

type SelectorState = { date: string } | null;
type WeekPlanRange = 'current' | 'next';
type ReminderHourOptionKey = '8' | '10' | '18';

type ReminderPersistOptions = {
  cancelWhenDisabled?: boolean;
};

const WEEK_RANGE_OPTIONS: { key: WeekPlanRange; label: string }[] = [
  { key: 'current', label: 'Esta semana' },
  { key: 'next', label: 'Proxima semana' },
];

const REMINDER_CALENDAR_DAYS: {
  weekday: MealPlanningReminderWeekday;
  shortLabel: string;
  label: string;
}[] = [
  { weekday: 1, shortLabel: 'Dom', label: 'Domingo' },
  { weekday: 2, shortLabel: 'Lun', label: 'Lunes' },
  { weekday: 3, shortLabel: 'Mar', label: 'Martes' },
  { weekday: 4, shortLabel: 'Mie', label: 'Miercoles' },
  { weekday: 5, shortLabel: 'Jue', label: 'Jueves' },
  { weekday: 6, shortLabel: 'Vie', label: 'Viernes' },
  { weekday: 7, shortLabel: 'Sab', label: 'Sabado' },
];

const REMINDER_HOUR_OPTIONS: { key: ReminderHourOptionKey; label: string }[] = [
  { key: '8', label: '8:00' },
  { key: '10', label: '10:00' },
  { key: '18', label: '18:00' },
];

const REMINDER_WEEKDAY_LABELS: Record<MealPlanningReminderWeekday, string> = {
  1: 'Domingo',
  2: 'Lunes',
  3: 'Martes',
  4: 'Miercoles',
  5: 'Jueves',
  6: 'Viernes',
  7: 'Sabado',
};

const hasSelectedMenuId = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatReminderTime = (hour: MealPlanningReminderHour) =>
  `${String(hour).padStart(2, '0')}:00`;

const formatReminderSchedule = (settings: MealPlanningReminderSettings) =>
  `${REMINDER_WEEKDAY_LABELS[settings.weekday]} ${formatReminderTime(settings.hour)}`;

const getSelectedMenuForDate = (
  date: string,
  primaryByDate: Record<string, number | null>,
  optionsByDate: Record<string, ClientDietMenu[]>,
) => {
  const primaryId = primaryByDate[date] ?? null;
  if (!hasSelectedMenuId(primaryId)) {
    return null;
  }

  return optionsByDate[date]?.find((option) => option.menuId === primaryId) ?? null;
};

const getMenuOptionLabel = (menu: ClientDietMenu, options: ClientDietMenu[]) => {
  const selectedMenuIndex = options.findIndex((option) => option.menuId === menu.menuId);
  return selectedMenuIndex >= 0
    ? `Opcion ${selectedMenuIndex + 1}`
    : 'Seleccion confirmada';
};

const mergeOptionsByDate = (
  currentOptions: Record<string, ClientDietMenu[]>,
  incomingOptions: Record<string, ClientDietMenu[]>,
) => {
  const nextOptions = { ...currentOptions };

  for (const [date, menus] of Object.entries(incomingOptions)) {
    nextOptions[date] = mergeDietMenuOptions(nextOptions[date] ?? [], menus);
  }

  return nextOptions;
};

export default function WeeklyPlanScreen() {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const userIdValue = useAuthStore((state) => state.user?.id);
  const loadRequestIdRef = useRef(0);

  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [selectedWeek, setSelectedWeek] = useState<WeekPlanRange>('current');
  const [primaryByDate, setPrimaryByDate] = useState<Record<string, number | null>>({});
  const [optionsByDate, setOptionsByDate] = useState<Record<string, ClientDietMenu[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectorState, setSelectorState] = useState<SelectorState>(null);
  const [isPersistingDate, setIsPersistingDate] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reminderSettings, setReminderSettings] =
    useState<MealPlanningReminderSettings>(DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS);
  const [isReminderLoading, setIsReminderLoading] = useState(true);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const selectedWeekAnchorKey = useMemo(() => {
    if (selectedWeek === 'next') {
      return addDaysToDateKey(todayKey, 7) ?? todayKey;
    }

    return todayKey;
  }, [selectedWeek, todayKey]);

  const weekStartKey = useMemo(
    () => getStartOfLocalWeekDateKey(selectedWeekAnchorKey) ?? selectedWeekAnchorKey,
    [selectedWeekAnchorKey],
  );

  const weekDateKeys = useMemo(
    () => getLocalWeekDateKeys(selectedWeekAnchorKey),
    [selectedWeekAnchorKey],
  );

  const numericClientId = useMemo(() => {
    const parsedClientId = Number(userIdValue);
    return Number.isInteger(parsedClientId) && parsedClientId > 0 ? parsedClientId : null;
  }, [userIdValue]);

  const clientIdString = useMemo(
    () => (numericClientId !== null ? String(numericClientId) : null),
    [numericClientId],
  );

  const selectedWeekLabel = selectedWeek === 'current' ? 'Esta semana' : 'Proxima semana';

  const loadWeek = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setSelectorState(null);

    if (!clientIdString || numericClientId === null) {
      setPrimaryByDate({});
      setOptionsByDate({});
      setLoadError('Inicia sesion para planificar tus menus.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setPrimaryByDate({});
    setOptionsByDate({});

    try {
      const calendar = await getClientDietCalendar(clientIdString, weekStartKey);
      const nextPrimary: Record<string, number | null> = {};
      let nextOptions: Record<string, ClientDietMenu[]> = {};

      for (const day of calendar) {
        nextPrimary[day.assignedDate] = day.backendPrimaryMenuId;
        nextOptions[day.assignedDate] = day.menuOptions;
      }

      const optionResults = await Promise.allSettled(
        weekDateKeys.map((date) => getClientDietMenuCalendar(clientIdString, date)),
      );

      for (const result of optionResults) {
        if (result.status === 'fulfilled') {
          nextOptions = mergeOptionsByDate(nextOptions, result.value);
        }
      }

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setPrimaryByDate(nextPrimary);
      setOptionsByDate(nextOptions);
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      const message =
        error instanceof Error ? error.message : 'No se pudo cargar tu plan semanal.';
      setLoadError(message);
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [clientIdString, numericClientId, weekDateKeys, weekStartKey]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    let isMounted = true;

    const hydrateReminderSettings = async () => {
      try {
        const storedSettings = await getMealPlanningReminderSettings();
        if (isMounted) {
          setReminderSettings(storedSettings);
        }
      } finally {
        if (isMounted) {
          setIsReminderLoading(false);
        }
      }
    };

    void hydrateReminderSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const persistReminderSettings = useCallback(
    async (
      nextSettings: MealPlanningReminderSettings,
      options: ReminderPersistOptions = {},
    ) => {
      setIsSavingReminder(true);
      setReminderMessage(null);

      try {
        if (nextSettings.enabled) {
          const notificationId = await scheduleMealPlanningReminder(nextSettings);

          if (!notificationId) {
            const disabledSettings = { ...nextSettings, enabled: false };
            const savedSettings = await saveMealPlanningReminderSettings(disabledSettings);
            setReminderSettings(savedSettings);
            setReminderMessage('Permisos de notificaciones desactivados.');
            return;
          }

          const savedSettings = await saveMealPlanningReminderSettings(nextSettings);
          setReminderSettings(savedSettings);
          setReminderMessage(`Recordatorio activo: ${formatReminderSchedule(savedSettings)}.`);
          return;
        }

        if (options.cancelWhenDisabled) {
          await cancelMealPlanningReminder();
        }

        const savedSettings = await saveMealPlanningReminderSettings(nextSettings);
        setReminderSettings(savedSettings);

        if (options.cancelWhenDisabled) {
          setReminderMessage('Recordatorio desactivado.');
        }
      } catch (error) {
        if (nextSettings.enabled) {
          try {
            await cancelMealPlanningReminder();
          } catch {
            // Keep the visible state conservative if notification scheduling failed.
          }
        }

        const message =
          error instanceof Error ? error.message : 'No se pudo actualizar el recordatorio.';
        Alert.alert('Recordatorio', message);
      } finally {
        setIsSavingReminder(false);
      }
    },
    [],
  );

  const handleToggleReminder = useCallback(
    (enabled: boolean) => {
      if (isReminderLoading || isSavingReminder) {
        return;
      }

      const nextSettings = { ...reminderSettings, enabled };
      void persistReminderSettings(nextSettings, { cancelWhenDisabled: !enabled });
    },
    [isReminderLoading, isSavingReminder, persistReminderSettings, reminderSettings],
  );

  const handleReminderWeekdayPress = useCallback(
    (weekday: MealPlanningReminderWeekday) => {
      if (isReminderLoading || isSavingReminder) {
        return;
      }

      const nextSettings = {
        ...reminderSettings,
        weekday,
      };
      void persistReminderSettings(nextSettings);
    },
    [isReminderLoading, isSavingReminder, persistReminderSettings, reminderSettings],
  );

  const handleReminderHourChange = useCallback(
    (hourKey: ReminderHourOptionKey) => {
      if (isReminderLoading || isSavingReminder) {
        return;
      }

      const nextSettings = {
        ...reminderSettings,
        hour: Number(hourKey) as MealPlanningReminderHour,
      };
      void persistReminderSettings(nextSettings);
    },
    [isReminderLoading, isSavingReminder, persistReminderSettings, reminderSettings],
  );

  const handleOpenSelector = useCallback((date: string) => {
    if (!optionsByDate[date] || optionsByDate[date].length === 0) {
      Alert.alert('Sin menus', 'No hay menus disponibles para este dia.');
      return;
    }
    setSelectorState({ date });
  }, [optionsByDate]);

  const handleCloseSelector = useCallback(() => {
    setSelectorState(null);
  }, []);

  const handleSelectMenu = useCallback(
    async (menu: ClientDietMenu) => {
      const targetDate = selectorState?.date;
      if (!targetDate) return;
      setIsPersistingDate(targetDate);
      try {
        await updateClientDailyPrimarySelection(targetDate, menu.menuId);
        setPrimaryByDate((current) => ({ ...current, [targetDate]: menu.menuId }));
        setSelectorState(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo guardar la seleccion.';
        Alert.alert('Error', message);
      } finally {
        setIsPersistingDate(null);
      }
    },
    [selectorState],
  );

  const selectedCount = useMemo(
    () => weekDateKeys.filter((date) => hasSelectedMenuId(primaryByDate[date])).length,
    [primaryByDate, weekDateKeys],
  );

  const remainingDays = Math.max(0, 7 - selectedCount);
  const allDaysSelected = selectedCount === 7;

  const selectedMenus = useMemo(
    () =>
      weekDateKeys
        .map((date) => getSelectedMenuForDate(date, primaryByDate, optionsByDate))
        .filter((menu): menu is ClientDietMenu => Boolean(menu)),
    [optionsByDate, primaryByDate, weekDateKeys],
  );

  const totalSelectedMeals = selectedMenus.reduce(
    (total, menu) => total + menu.totalMeals,
    0,
  );

  const averageSelectedCalories = useMemo(() => {
    const knownCalories = selectedMenus
      .map((menu) => menu.totalCalories)
      .filter((value): value is number => value !== null && Number.isFinite(value));

    if (knownCalories.length === 0) {
      return null;
    }

    const totalCalories = knownCalories.reduce((total, value) => total + value, 0);
    return Math.round(totalCalories / knownCalories.length);
  }, [selectedMenus]);

  const handleGenerateList = useCallback(async () => {
    if (numericClientId === null || !allDaysSelected) return;
    setIsGenerating(true);
    try {
      const days = weekDateKeys.map((date) => ({
        date,
        menu_id: primaryByDate[date] as number,
      }));
      const list = await generateShoppingList({
        client_id: numericClientId,
        start_date: weekStartKey,
        days,
      });
      router.push({
        pathname: '/diet/shopping-list',
        params: { listId: String(list.id) },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo generar la lista del super.';
      Alert.alert('Error', message);
    } finally {
      setIsGenerating(false);
    }
  }, [allDaysSelected, numericClientId, primaryByDate, weekDateKeys, weekStartKey]);

  const subtitle = useMemo(() => {
    const first = formatLocalDate(weekDateKeys[0], { day: 'numeric', month: 'short' });
    const last = formatLocalDate(weekDateKeys[6], { day: 'numeric', month: 'short' });
    return `${selectedWeekLabel} - ${first} al ${last}`;
  }, [selectedWeekLabel, weekDateKeys]);

  const selectorDay = selectorState
    ? {
        date: selectorState.date,
        options: optionsByDate[selectorState.date] ?? [],
        persistedMenuId: primaryByDate[selectorState.date] ?? null,
      }
    : null;

  const footer = (
    <Button
      title={allDaysSelected ? 'Generar lista del super' : `Faltan ${remainingDays} dias`}
      onPress={handleGenerateList}
      isLoading={isGenerating}
      disabled={!allDaysSelected || isGenerating || isLoading}
      fullWidth
    />
  );

  return (
    <>
      <ProfileDetailScreen
        title="Plan semanal"
        subtitle={subtitle}
        footer={footer}
        contentStyle={styles.screenContent}
      >
        <View style={styles.weekSelector}>
          <SegmentedControl
            options={WEEK_RANGE_OPTIONS}
            value={selectedWeek}
            onChange={setSelectedWeek}
          />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.summaryTitle}>{selectedWeekLabel}</Text>
              <Text style={styles.summarySubtitle}>
                Elige tus 7 menus para generar una lista exacta.
              </Text>
            </View>
            <View
              style={[
                styles.readinessBadge,
                allDaysSelected ? styles.readinessBadgeReady : styles.readinessBadgePending,
              ]}
            >
              <Text
                style={[
                  styles.readinessBadgeText,
                  allDaysSelected
                    ? styles.readinessBadgeReadyText
                    : styles.readinessBadgePendingText,
                ]}
              >
                {allDaysSelected ? 'Completo' : `${remainingDays} pendientes`}
              </Text>
            </View>
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{selectedCount}/7</Text>
              <Text style={styles.summaryStatLabel}>Dias</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{totalSelectedMeals}</Text>
              <Text style={styles.summaryStatLabel}>Comidas</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>
                {averageSelectedCalories === null ? '--' : averageSelectedCalories}
              </Text>
              <Text style={styles.summaryStatLabel}>Kcal prom.</Text>
            </View>
          </View>
        </View>

        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={styles.reminderIcon}>
              <Ionicons
                name="notifications-outline"
                size={20}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.reminderCopy}>
              <Text style={styles.reminderTitle}>Recordatorio semanal</Text>
              <Text style={styles.reminderSubtitle}>
                {isReminderLoading
                  ? 'Cargando recordatorio...'
                  : reminderSettings.enabled
                    ? formatReminderSchedule(reminderSettings)
                    : `Sugerido: ${formatReminderSchedule(reminderSettings)}`}
              </Text>
            </View>
            <Switch
              value={reminderSettings.enabled}
              onValueChange={handleToggleReminder}
              disabled={isReminderLoading || isSavingReminder}
              trackColor={{
                false: theme.colors.borderStrong,
                true: theme.colors.primaryBorder,
              }}
              thumbColor={
                reminderSettings.enabled ? theme.colors.primary : theme.colors.surface
              }
            />
          </View>

          <View
            style={[
              styles.reminderControls,
              isReminderLoading || isSavingReminder ? styles.reminderControlsDisabled : null,
            ]}
          >
            <View style={styles.reminderControlGroup}>
              <Text style={styles.reminderControlLabel}>Calendario</Text>
              <View style={styles.reminderCalendar}>
                {REMINDER_CALENDAR_DAYS.map((day) => {
                  const isSelected = reminderSettings.weekday === day.weekday;
                  const isDisabled = isReminderLoading || isSavingReminder;

                  return (
                    <Pressable
                      key={day.weekday}
                      onPress={() => handleReminderWeekdayPress(day.weekday)}
                      disabled={isDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={`Recordar cada ${day.label}`}
                      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                      style={({ pressed }) => [
                        styles.reminderCalendarDay,
                        isSelected ? styles.reminderCalendarDayActive : null,
                        pressed ? styles.reminderCalendarDayPressed : null,
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? 'calendar' : 'calendar-outline'}
                        size={16}
                        color={isSelected ? theme.colors.surface : theme.colors.iconMuted}
                      />
                      <Text
                        style={[
                          styles.reminderCalendarDayText,
                          isSelected ? styles.reminderCalendarDayTextActive : null,
                        ]}
                      >
                        {day.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.reminderControlGroup}>
              <Text style={styles.reminderControlLabel}>Hora</Text>
              <SegmentedControl
                options={REMINDER_HOUR_OPTIONS}
                value={String(reminderSettings.hour) as ReminderHourOptionKey}
                onChange={handleReminderHourChange}
                size="compact"
              />
            </View>
          </View>

          {reminderMessage ? (
            <Text style={styles.reminderMessage} selectable>
              {reminderMessage}
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.centerStateLabel}>Cargando tu semana...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={32} color={theme.colors.warning} />
            <Text style={styles.centerStateLabel} selectable>
              {loadError}
            </Text>
            <Pressable onPress={loadWeek} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {weekDateKeys.map((date) => {
              const isToday = date === todayKey;
              const dayLabel = formatLocalDate(date, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              const options = optionsByDate[date] ?? [];
              const primaryId = primaryByDate[date] ?? null;
              const hasSavedSelection = hasSelectedMenuId(primaryId);
              const selectedMenu = getSelectedMenuForDate(
                date,
                primaryByDate,
                optionsByDate,
              );
              const isPersisting = isPersistingDate === date;

              return (
                <Pressable
                  key={date}
                  onPress={() => handleOpenSelector(date)}
                  style={({ pressed }) => [
                    styles.dayRow,
                    isToday && styles.dayRowToday,
                    pressed && styles.dayRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Elegir menu para ${dayLabel}`}
                >
                  <View style={styles.dayCopy}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayLabel}>{dayLabel}</Text>
                      {isToday ? (
                        <View style={styles.todayBadge}>
                          <Text style={styles.todayBadgeText}>Hoy</Text>
                        </View>
                      ) : null}
                    </View>
                    {selectedMenu ? (
                      <>
                        <Text style={styles.menuName} numberOfLines={1}>
                          {selectedMenu.title}
                        </Text>
                        <Text style={styles.menuMeta}>
                          {getMenuOptionLabel(selectedMenu, options)}
                          {selectedMenu.totalCalories != null
                            ? ` - ${Math.round(selectedMenu.totalCalories)} kcal`
                            : ''}
                          {` - ${selectedMenu.totalMeals} comidas`}
                        </Text>
                      </>
                    ) : hasSavedSelection ? (
                      <>
                        <Text style={styles.menuName} numberOfLines={1}>
                          Seleccion guardada
                        </Text>
                        <Text style={styles.menuMeta}>Menu #{primaryId}</Text>
                      </>
                    ) : (
                      <Text style={styles.menuPlaceholder}>
                        {options.length === 0 ? 'Sin menus disponibles' : 'Sin seleccion'}
                      </Text>
                    )}
                  </View>
                  {isPersisting ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={theme.colors.iconMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ProfileDetailScreen>

      <DietMenuSelectorModal
        visible={selectorState !== null}
        dateLabel={
          selectorDay
            ? formatLocalDate(selectorDay.date, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
        menus={selectorDay?.options ?? []}
        getMenuLabel={(_menu, index) => `Opcion ${index + 1}`}
        visibleMenuId={selectorDay?.persistedMenuId ?? null}
        persistedMenuId={selectorDay?.persistedMenuId ?? null}
        suggestedMenuId={null}
        previewMenuId={null}
        isLoading={false}
        error={null}
        onClose={handleCloseSelector}
        onSelect={handleSelectMenu}
      />
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    screenContent: {
      gap: spacing.md,
    },
    weekSelector: {
      gap: spacing.sm,
    },
    summaryCard: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    summaryTitleWrap: {
      flex: 1,
      gap: spacing.xs,
      minWidth: 0,
    },
    summaryTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    summarySubtitle: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    readinessBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      borderWidth: 1,
    },
    readinessBadgeReady: {
      backgroundColor: `${theme.colors.success}18`,
      borderColor: `${theme.colors.success}44`,
    },
    readinessBadgePending: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    readinessBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    readinessBadgeReadyText: {
      color: theme.colors.success,
    },
    readinessBadgePendingText: {
      color: theme.colors.primary,
    },
    summaryStats: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    summaryStat: {
      flex: 1,
      minHeight: 62,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    summaryStatValue: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    summaryStatLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    reminderCard: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reminderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    reminderIcon: {
      width: 38,
      height: 38,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    reminderCopy: {
      flex: 1,
      gap: spacing.xs,
      minWidth: 0,
    },
    reminderTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    reminderSubtitle: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    reminderControls: {
      gap: spacing.sm,
    },
    reminderControlsDisabled: {
      opacity: 0.55,
    },
    reminderControlGroup: {
      gap: spacing.xs,
    },
    reminderControlLabel: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    reminderCalendar: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    reminderCalendarDay: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 2,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reminderCalendarDayActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    reminderCalendarDayPressed: {
      opacity: 0.82,
    },
    reminderCalendarDayText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    reminderCalendarDayTextActive: {
      color: theme.colors.surface,
    },
    reminderMessage: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    centerState: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    centerStateLabel: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    retryButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    list: {
      gap: spacing.sm,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dayRowToday: {
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
    },
    dayRowPressed: {
      opacity: 0.85,
    },
    dayCopy: {
      flex: 1,
      gap: spacing.xs,
      minWidth: 0,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    dayLabel: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    todayBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primary,
    },
    todayBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.surface,
      textTransform: 'uppercase',
    },
    menuName: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    menuMeta: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    menuPlaceholder: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      fontStyle: 'italic',
    },
  });
