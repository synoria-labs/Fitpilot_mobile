import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { DietMenuSelectorModal } from '../../src/components/diet';
import { borderRadius, fontSize, spacing } from '../../src/constants/colors';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
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
import { mergeDietMenuOptions } from '../../src/utils/dietMenuSelection';
import type { ClientDietMenu } from '../../src/types';

type SelectorState = { date: string } | null;

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

  const todayKey = useMemo(() => getTodayDateKey(), []);
  const weekStartKey = useMemo(
    () => getStartOfLocalWeekDateKey(todayKey) ?? todayKey,
    [todayKey],
  );
  const weekDateKeys = useMemo(
    () => getLocalWeekDateKeys(todayKey),
    [todayKey],
  );

  const [primaryByDate, setPrimaryByDate] = useState<Record<string, number | null>>({});
  const [optionsByDate, setOptionsByDate] = useState<Record<string, ClientDietMenu[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectorState, setSelectorState] = useState<SelectorState>(null);
  const [isPersistingDate, setIsPersistingDate] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const numericClientId = useMemo(
    () => (userIdValue ? Number(userIdValue) : null),
    [userIdValue],
  );
  const clientIdString = useMemo(
    () => (userIdValue ? String(userIdValue) : null),
    [userIdValue],
  );

  const loadWeek = useCallback(async () => {
    if (!clientIdString || !numericClientId) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
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

      setPrimaryByDate(nextPrimary);
      setOptionsByDate(nextOptions);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar tu plan semanal.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [clientIdString, numericClientId, weekDateKeys, weekStartKey]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

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
          error instanceof Error ? error.message : 'No se pudo guardar la selección.';
        Alert.alert('Error', message);
      } finally {
        setIsPersistingDate(null);
      }
    },
    [selectorState],
  );

  const allDaysSelected = useMemo(
    () =>
      weekDateKeys.every((date) => {
        const menuId = primaryByDate[date];
        return typeof menuId === 'number' && Number.isFinite(menuId);
      }),
    [primaryByDate, weekDateKeys],
  );

  const handleGenerateList = useCallback(async () => {
    if (!numericClientId || !allDaysSelected) return;
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
          : 'No se pudo generar la lista del súper.';
      Alert.alert('Error', message);
    } finally {
      setIsGenerating(false);
    }
  }, [allDaysSelected, numericClientId, primaryByDate, weekDateKeys, weekStartKey]);

  const subtitle = useMemo(() => {
    const first = formatLocalDate(weekDateKeys[0], { day: 'numeric', month: 'short' });
    const last = formatLocalDate(weekDateKeys[6], { day: 'numeric', month: 'short' });
    return `${first} – ${last}`;
  }, [weekDateKeys]);

  const selectorDay = selectorState
    ? {
        date: selectorState.date,
        options: optionsByDate[selectorState.date] ?? [],
        persistedMenuId: primaryByDate[selectorState.date] ?? null,
      }
    : null;

  const footer = (
    <Button
      title={allDaysSelected ? 'Generar lista del súper' : 'Selecciona los 7 días'}
      onPress={handleGenerateList}
      isLoading={isGenerating}
      disabled={!allDaysSelected || isGenerating || isLoading}
      fullWidth
    />
  );

  return (
    <>
      <ProfileDetailScreen title="Plan semanal" subtitle={subtitle} footer={footer}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.centerStateLabel}>Cargando tu semana…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={32} color={theme.colors.warning} />
            <Text style={styles.centerStateLabel}>{loadError}</Text>
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
              const selectedMenu =
                primaryId != null
                  ? options.find((option) => option.menuId === primaryId) ?? null
                  : null;
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
                  accessibilityLabel={`Elegir menú para ${dayLabel}`}
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
                        {selectedMenu.totalCalories != null ? (
                          <Text style={styles.menuMeta}>
                            {Math.round(selectedMenu.totalCalories)} kcal · {selectedMenu.totalMeals} comidas
                          </Text>
                        ) : (
                          <Text style={styles.menuMeta}>{selectedMenu.totalMeals} comidas</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.menuPlaceholder}>
                        {options.length === 0 ? 'Sin menús disponibles' : 'Sin selección'}
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
        getMenuLabel={(_menu, index) => `Opción ${index + 1}`}
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
      letterSpacing: 0.4,
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
      letterSpacing: 0.4,
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
