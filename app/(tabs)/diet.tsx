import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Button,
  ProfileShortcutButton,
  Skeleton,
  TabScreenWrapper,
} from '../../src/components/common';
import {
  CalendarDatePickerModal,
  type SharedWeeklyCalendarDay,
} from '../../src/components/calendar';
import { AuroraBackdrop, AuroraTopScrim } from '../../src/components/aurora';
import {
  DietDaySummary,
  DietEmptyDay,
  DietMealTimeline,
  DietMenuSelectorModal,
  DietRecipesCarousel,
  DietShoppingCard,
  DietSourcesCard,
  DietWeekCard,
  RecipeIngredientSwapModal,
  type DietRecipeEntry,
} from '../../src/components/diet';
import { scienceTips } from '../../src/constants/scienceTips';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { auroraFont, useAurora } from '../../src/theme/aurora';
import { getDietMealKinds, getNextDietMealIndex } from '../../src/utils/dietMealVisuals';
import { buildDietRecipeDetailRoute } from '../../src/utils/dietRecipeRoute';
import { borderRadius, fontSize, spacing, nutritionTheme } from '../../src/constants/colors';
import { useAuthStore } from '../../src/store/authStore';
import { useBottomTabBarContentInset, useBottomTabBarScroll } from '../../src/hooks/useBottomTabBarVisibility';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import {
  getClientDietCalendar,
  getClientDietMenuPool,
  getClientDietMenuCalendar,
  getFoodsByExchangeGroup,
  resetDietRecipeIngredientSwap,
  resetDietStandaloneFoodSwap,
  swapDietRecipeIngredient,
  swapDietStandaloneFood,
  getTodayDietDateKey,
  updateClientDailyPrimarySelection,
} from '../../src/services/diet';
import {
  getDashboardContentWidth,
  getPrimaryScreenHorizontalPadding,
  isTabletLayout,
} from '../../src/utils/layout';
import {
  applyDietRotationMenuOptions,
  getDietSelectableMenus,
  mergeDietMenuOptionsByDate,
  resolveDietSelectableMenuById,
  resolveRotatedDietMenuId,
  resolveVisibleDietMenu,
} from '../../src/utils/dietMenuSelection';
import {
  addDaysToDateKey,
  formatLocalDate,
  formatLocalShortWeekday,
  getLocalDayNumber,
  toLocalDateKey,
} from '../../src/utils/date';
import type {
  ApiError,
  ClientDietFoodRow,
  ClientDietIngredientRow,
  ClientDietMenu,
  ClientDietRecipeCard,
  ClientDietWeekDay,
  ClientFoodSwapCandidate,
} from '../../src/types';

const formatLongDate = (value: string) =>
  formatLocalDate(value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

type SelectedSwapTarget = {
  type: 'recipe';
  recipeId: number;
  ingredient: ClientDietIngredientRow;
} | {
  type: 'standalone';
  menuId: number;
  ingredient: ClientDietFoodRow;
} | null;

const mergeUpdatedMenu = (
  currentMenu: ClientDietMenu,
  updatedMenu: ClientDietMenu,
): ClientDietMenu => (
  currentMenu.menuId !== updatedMenu.menuId
    ? currentMenu
    : {
        ...updatedMenu,
        id: currentMenu.id,
        assignedDate: currentMenu.assignedDate,
      }
);

const applyUpdatedMenuToWeekDays = (
  days: ClientDietWeekDay[],
  updatedMenu: ClientDietMenu,
): ClientDietWeekDay[] =>
  days.map((day) => {
    if (!day.menuOptions.some((menu) => menu.menuId === updatedMenu.menuId)) {
      return day;
    }

    return {
      ...day,
      menuOptions: day.menuOptions.map((menu) => mergeUpdatedMenu(menu, updatedMenu)),
    };
  });

const buildDietMenuLabel = (index: number) => `Menú ${index + 1}`;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type LoadDietOptions = {
  mode?: 'initial' | 'refresh';
  anchorDate: string;
  selectedDate?: string;
};

export default function DietScreen() {
  const { width, height } = useWindowDimensions();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const contentWidth = Math.max(0, getDashboardContentWidth(width) - horizontalPadding * 2);
  const aurora = useAurora();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const tabBarScroll = useBottomTabBarScroll();
  const onTabBarScroll = tabBarScroll.onScroll;
  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onTabBarScroll(event);
      const scrolled = event.nativeEvent.contentOffset.y > 4;
      setIsScrolled((current) => (current === scrolled ? current : scrolled));
    },
    [onTabBarScroll],
  );
  // The vegetable note about hunger only matters while the plan cuts energy.
  const showHungerHint = useWorkoutStore(
    (state) => state.dashboardBootstrap?.program?.objective === 'fat_loss',
  );
  const contentInsetBottom = useBottomTabBarContentInset(spacing.xl);
  const { user } = useAuthStore();
  const [dietDays, setDietDays] = useState<ClientDietWeekDay[]>([]);
  const [anchorDate, setAnchorDate] = useState(getTodayDietDateKey());
  const [selectedDate, setSelectedDate] = useState(getTodayDietDateKey());
  const [previewMenuIdByDate, setPreviewMenuIdByDate] = useState<Record<string, number>>({});
  const [menuOptionsHydratedByDate, setMenuOptionsHydratedByDate] = useState<Record<string, boolean>>({});
  const [menuOptionsLoadingByDate, setMenuOptionsLoadingByDate] = useState<Record<string, boolean>>({});
  const [menuOptionsErrorByDate, setMenuOptionsErrorByDate] = useState<Record<string, string | null>>({});
  const [isMenuSelectorVisible, setIsMenuSelectorVisible] = useState(false);
  const [isPersistingMenuSelection, setIsPersistingMenuSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [hasPlayedEntryAnimation, setHasPlayedEntryAnimation] = useState(false);
  const [selectedSwapTarget, setSelectedSwapTarget] = useState<SelectedSwapTarget>(null);
  const [isSwapModalVisible, setIsSwapModalVisible] = useState(false);
  const [swapFoods, setSwapFoods] = useState<ClientFoodSwapCandidate[]>([]);
  const [swapFoodsLoading, setSwapFoodsLoading] = useState(false);
  const [swapFoodsError, setSwapFoodsError] = useState<string | null>(null);
  const [isSavingSwap, setIsSavingSwap] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const isTablet = isTabletLayout(width, height);

  const selectedIngredient = selectedSwapTarget?.ingredient ?? null;

  const clearPreviewMenuCandidates = useCallback(() => {
    setPreviewMenuIdByDate((currentState) => (
      Object.keys(currentState).length === 0 ? currentState : {}
    ));
  }, []);

  const clearPreviewMenuForDate = useCallback((dateKey: string) => {
    setPreviewMenuIdByDate((currentState) => {
      if (!(dateKey in currentState)) {
        return currentState;
      }

      const nextState = { ...currentState };
      delete nextState[dateKey];
      return nextState;
    });
  }, []);

  const loadRotationMenuPool = useCallback(
    async (
      resolvedAnchorDate: string,
      preferredSelectedDate: string,
      baseDays: ClientDietWeekDay[],
    ) => {
      if (!user) {
        return [] as ClientDietMenu[];
      }

      const candidateDates = Array.from(
        new Set(
          [
            preferredSelectedDate,
            resolvedAnchorDate,
            ...baseDays
              .filter((day) => day.backendPrimaryMenuId !== null)
              .map((day) => day.assignedDate),
          ].filter(Boolean),
        ),
      );

      for (const candidateDate of candidateDates) {
        try {
          const poolMenus = await getClientDietMenuPool(user.id, candidateDate);
          if (poolMenus.length > 0) {
            return poolMenus;
          }
        } catch {
          // Fall back to the next candidate date and keep the week usable without rotation.
        }
      }

      return [];
    },
    [user],
  );

  const loadDiet = useCallback(
    async ({
      mode = 'initial',
      anchorDate: requestedAnchorDate,
      selectedDate: requestedSelectedDate,
    }: LoadDietOptions) => {
      if (!user) {
        return;
      }

      const resolvedAnchorDate = requestedAnchorDate || getTodayDietDateKey();

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const preferredSelectedDate = requestedSelectedDate ?? resolvedAnchorDate;
        const baseDays = await getClientDietCalendar(user.id, resolvedAnchorDate);
        const rotationMenus = await loadRotationMenuPool(
          resolvedAnchorDate,
          preferredSelectedDate,
          baseDays,
        );
        const days = applyDietRotationMenuOptions(baseDays, rotationMenus);

        setDietDays(days);
        setAnchorDate(resolvedAnchorDate);
        setPreviewMenuIdByDate({});
        setMenuOptionsHydratedByDate({});
        setMenuOptionsLoadingByDate({});
        setMenuOptionsErrorByDate({});
        setError(null);
        setIsMenuSelectorVisible(false);
        setIsDatePickerVisible(false);
        setIsSwapModalVisible(false);
        setSelectedSwapTarget(null);
        setSwapFoods([]);
        setSwapFoodsError(null);
        setRenderVersion((currentValue) => currentValue + 1);
        setSelectedDate(
          days.find((day) => day.assignedDate === preferredSelectedDate)?.assignedDate ||
          days.find((day) => day.assignedDate === resolvedAnchorDate)?.assignedDate ||
          days[0]?.assignedDate ||
          preferredSelectedDate,
        );
      } catch (loadError: any) {
        setDietDays([]);
        setPreviewMenuIdByDate({});
        setMenuOptionsHydratedByDate({});
        setMenuOptionsLoadingByDate({});
        setMenuOptionsErrorByDate({});
        setError(loadError?.message || 'No se pudo cargar tu dieta.');
        setIsDatePickerVisible(false);
        setIsSwapModalVisible(false);
        setSelectedSwapTarget(null);
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [loadRotationMenuPool, user],
  );

  const loadMenuCalendar = useCallback(
    async (dateKey: string) => {
      if (!user) {
        return;
      }

      if (menuOptionsHydratedByDate[dateKey] || menuOptionsLoadingByDate[dateKey]) {
        return;
      }

      setMenuOptionsLoadingByDate((currentState) => ({
        ...currentState,
        [dateKey]: true,
      }));

      try {
        const calendarMenusByDate = await getClientDietMenuCalendar(user.id, dateKey);
        setDietDays((currentDays) => mergeDietMenuOptionsByDate(currentDays, calendarMenusByDate));
        setMenuOptionsHydratedByDate((currentState) => ({
          ...currentState,
          [dateKey]: true,
          ...Object.fromEntries(
            Object.keys(calendarMenusByDate).map((assignedDate) => [assignedDate, true] as const),
          ),
        }));
        setMenuOptionsErrorByDate((currentState) => ({
          ...currentState,
          [dateKey]: null,
        }));
      } catch (loadError: any) {
        const message = loadError?.message || 'No se pudieron cargar los menús visibles.';
        setMenuOptionsErrorByDate((currentState) => ({
          ...currentState,
          [dateKey]: message,
        }));
        setMenuOptionsHydratedByDate((currentState) => ({
          ...currentState,
          [dateKey]: true,
        }));
      } finally {
        setMenuOptionsLoadingByDate((currentState) => ({
          ...currentState,
          [dateKey]: false,
        }));
      }
    },
    [menuOptionsHydratedByDate, menuOptionsLoadingByDate, user],
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const todayDate = getTodayDietDateKey();
    void loadDiet({ anchorDate: todayDate, selectedDate: todayDate });
  }, [loadDiet, user]);

  const showInitialLoadingState = isLoading && !refreshing;
  const shouldAnimateEntry = !hasPlayedEntryAnimation && !showInitialLoadingState;
  const getEntryAnimation = useCallback(
    (delay: number) => (shouldAnimateEntry ? FadeInDown.delay(delay).duration(350) : undefined),
    [shouldAnimateEntry],
  );

  useEffect(() => {
    if (!shouldAnimateEntry) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHasPlayedEntryAnimation(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldAnimateEntry]);

  const selectedDay = useMemo(
    () => dietDays.find((day) => day.assignedDate === selectedDate) || null,
    [dietDays, selectedDate],
  );

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    void loadMenuCalendar(selectedDate);
  }, [loadMenuCalendar, selectedDate, selectedDay]);

  const selectorMenus = useMemo(
    () => getDietSelectableMenus(selectedDay),
    [selectedDay],
  );

  const selectedPreviewMenuId = previewMenuIdByDate[selectedDate] ?? null;
  const suggestedMenuId = useMemo(() => resolveRotatedDietMenuId(selectedDay), [selectedDay]);
  const visibleMenu = useMemo(
    () => resolveVisibleDietMenu(selectedDay, selectedPreviewMenuId),
    [selectedDay, selectedPreviewMenuId],
  );
  const previewMenu = useMemo(
    () => resolveDietSelectableMenuById(selectedDay, selectedPreviewMenuId),
    [selectedDay, selectedPreviewMenuId],
  );
  const isPreviewingMenu = Boolean(
    previewMenu &&
    visibleMenu &&
    previewMenu.menuId === visibleMenu.menuId,
  );
  const hasPersistedOverride = Boolean(
    !isPreviewingMenu &&
    visibleMenu &&
    selectedDay?.backendPrimaryMenuId !== null &&
    visibleMenu.menuId === selectedDay?.backendPrimaryMenuId &&
    visibleMenu.menuId !== suggestedMenuId,
  );
  const menuLabelsById = useMemo(
    () => new Map(selectorMenus.map((menu, index) => [menu.menuId, buildDietMenuLabel(index)])),
    [selectorMenus],
  );
  const visibleMenuLabel = visibleMenu
    ? menuLabelsById.get(visibleMenu.menuId) ?? buildDietMenuLabel(0)
    : 'Sin menú asignado';
  // Today the meal that comes next starts open; other days start with every meal closed.
  const nextMealIndex = useMemo(
    () =>
      selectedDay?.isToday && visibleMenu
        ? getNextDietMealIndex(visibleMenu.meals.map((meal) => meal.name), new Date().getHours())
        : null,
    [selectedDay?.isToday, visibleMenu],
  );
  const defaultExpandedMealId =
    nextMealIndex !== null ? visibleMenu?.meals[nextMealIndex]?.id ?? null : null;
  const visibleMenuExchangeSystem = visibleMenu?.exchangeSystem ?? null;
  const visibleMenuSourceCitations = visibleMenuExchangeSystem?.citations ?? [];

  useEffect(() => {
    setExpandedMealId(defaultExpandedMealId);
  }, [defaultExpandedMealId, selectedDate, visibleMenu?.menuId]);

  const handleToggleMeal = useCallback((mealId: string) => {
    setExpandedMealId((currentMealId) => (
      currentMealId === mealId ? null : mealId
    ));
  }, []);

  const hasHydratedOptionsForSelectedDate = Boolean(menuOptionsHydratedByDate[selectedDate]);
  const hasAvailableMenuOptions = Boolean(selectedDay) && (
    selectorMenus.length > 0 || Boolean(selectedDay?.backendPrimaryMenuId) || !hasHydratedOptionsForSelectedDate
  );
  const previewBannerDateLabel = selectedDay ? formatLongDate(selectedDay.assignedDate) : '';
  useEffect(() => {
    if (selectedPreviewMenuId !== null && !previewMenu) {
      clearPreviewMenuForDate(selectedDate);
    }
  }, [clearPreviewMenuForDate, previewMenu, selectedDate, selectedPreviewMenuId]);

  useEffect(() => {
    setIsSourcesExpanded(false);
  }, [selectedDate, visibleMenu?.menuId]);

  const navigatorDays = useMemo<SharedWeeklyCalendarDay[]>(
    () =>
      dietDays.map((day) => ({
        id: day.id,
        dateKey: day.assignedDate,
        dayLabel: formatLocalShortWeekday(day.assignedDate),
        dateNumber: getLocalDayNumber(day.assignedDate),
        isSelected: day.assignedDate === selectedDate,
        isToday: day.isToday,
        isDisabled: false,
        statusText: day.isToday ? 'Hoy' : '',
        variant: getDietSelectableMenus(day).length > 0 || day.backendPrimaryMenuId ? 'diet' : 'rest',
        onPress: () => {
          clearPreviewMenuCandidates();
          setIsMenuSelectorVisible(false);
          setSelectedDate(day.assignedDate);
        },
      })),
    [clearPreviewMenuCandidates, dietDays, selectedDate],
  );
  const currentWeekLabel = useMemo(() => {
    const firstDate = dietDays[0]?.assignedDate;
    const lastDate = dietDays[dietDays.length - 1]?.assignedDate;

    if (!firstDate || !lastDate) {
      return null;
    }

    return `${formatLocalDate(firstDate, { month: 'short', day: 'numeric' })} - ${formatLocalDate(
      lastDate,
      { month: 'short', day: 'numeric' },
    )}`;
  }, [dietDays]);

  const handleShiftWeek = useCallback((direction: -1 | 1) => {
    const nextAnchorDate = addDaysToDateKey(anchorDate, direction * 7);
    const nextSelectedDate = addDaysToDateKey(selectedDate, direction * 7) ?? nextAnchorDate;

    if (!nextAnchorDate) {
      return;
    }

    clearPreviewMenuCandidates();
    void loadDiet({
      anchorDate: nextAnchorDate,
      selectedDate: nextSelectedDate ?? nextAnchorDate,
    });
  }, [anchorDate, clearPreviewMenuCandidates, loadDiet, selectedDate]);

  const handleOpenDatePicker = useCallback(() => {
    setIsDatePickerVisible(true);
  }, []);

  const handleCloseDatePicker = useCallback(() => {
    setIsDatePickerVisible(false);
  }, []);

  const handleSelectAnchorDate = useCallback((date: Date) => {
    const nextDateKey = toLocalDateKey(date);

    if (!nextDateKey) {
      return;
    }

    setIsDatePickerVisible(false);
    clearPreviewMenuCandidates();
    void loadDiet({
      anchorDate: nextDateKey,
      selectedDate: nextDateKey,
    });
  }, [clearPreviewMenuCandidates, loadDiet]);

  const handleOpenMenuSelector = useCallback(async () => {
    if (!selectedDay) {
      return;
    }

    setIsMenuSelectorVisible(true);
    if (!menuOptionsHydratedByDate[selectedDate] && !menuOptionsLoadingByDate[selectedDate]) {
      await loadMenuCalendar(selectedDate);
    }
  }, [loadMenuCalendar, menuOptionsHydratedByDate, menuOptionsLoadingByDate, selectedDate, selectedDay]);

  const handleCloseMenuSelector = useCallback(() => {
    setIsMenuSelectorVisible(false);
  }, []);

  const handleRetryMenuOptions = useCallback(async () => {
    await loadMenuCalendar(selectedDate);
  }, [loadMenuCalendar, selectedDate]);

  const persistSelectedMenu = useCallback(async (menu: ClientDietMenu) => {
    if (!selectedDay) {
      return;
    }

    setIsPersistingMenuSelection(true);

    try {
      await updateClientDailyPrimarySelection(selectedDay.assignedDate, menu.menuId);
      setDietDays((currentDays) =>
        currentDays.map((day) => (
          day.assignedDate !== selectedDay.assignedDate
            ? day
            : {
                ...day,
                backendPrimaryMenuId: menu.menuId,
                menuOptions: day.menuOptions.some((option) => option.menuId === menu.menuId)
                  ? day.menuOptions
                  : [...day.menuOptions, menu],
              }
        )),
      );
      setMenuOptionsErrorByDate((currentState) => ({
        ...currentState,
        [selectedDay.assignedDate]: null,
      }));
      clearPreviewMenuForDate(selectedDay.assignedDate);
      setError(null);
      setIsMenuSelectorVisible(false);
      setRenderVersion((currentValue) => currentValue + 1);
    } catch (saveError) {
      const apiError = saveError as ApiError;
      Alert.alert(
        'Error',
        apiError.message || 'No fue posible guardar el menú elegido para este día.',
      );
    } finally {
      setIsPersistingMenuSelection(false);
    }
  }, [clearPreviewMenuForDate, selectedDay]);

  const handleCancelPreviewMenu = useCallback(() => {
    if (!selectedDay || isPersistingMenuSelection) {
      return;
    }

    clearPreviewMenuForDate(selectedDay.assignedDate);
  }, [clearPreviewMenuForDate, isPersistingMenuSelection, selectedDay]);

  const handleSelectMenu = useCallback((menu: ClientDietMenu) => {
    if (!selectedDay || isPersistingMenuSelection) {
      return;
    }

    if (menu.menuId === selectedDay.backendPrimaryMenuId) {
      clearPreviewMenuForDate(selectedDay.assignedDate);
      setIsMenuSelectorVisible(false);
      return;
    }

    setPreviewMenuIdByDate((currentState) => ({
      ...currentState,
      [selectedDay.assignedDate]: menu.menuId,
    }));
    setIsMenuSelectorVisible(false);
  }, [clearPreviewMenuForDate, isPersistingMenuSelection, selectedDay]);

  const handleOpenCitation = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Fuente no disponible', 'No fue posible abrir este enlace.');
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert('Fuente no disponible', 'No fue posible abrir este enlace.');
    }
  }, []);

  const handleToggleSources = useCallback(() => {
    setIsSourcesExpanded((currentState) => !currentState);
  }, []);

  const loadSwapFoods = useCallback(async (ingredient: ClientDietIngredientRow | null) => {
    if (!ingredient?.exchangeGroupId) {
      setSwapFoods([]);
      setSwapFoodsError(
        ingredient?.recipeIngredientId
          ? 'Este ingrediente no tiene equivalentes disponibles.'
          : 'Este alimento no tiene equivalentes disponibles.',
      );
      return;
    }

    setSwapFoodsLoading(true);
    setSwapFoodsError(null);

    try {
      const response = await getFoodsByExchangeGroup(
        ingredient.exchangeGroupId,
        ingredient.portion.equivalents,
      );
      setSwapFoods(response);
    } catch (loadError) {
      const apiError = loadError as ApiError;
      setSwapFoods([]);
      setSwapFoodsError(apiError.message || 'No fue posible cargar los equivalentes.');
    } finally {
      setSwapFoodsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSwapModalVisible || !selectedIngredient) {
      return;
    }

    void loadSwapFoods(selectedIngredient);
  }, [isSwapModalVisible, loadSwapFoods, selectedIngredient]);

  // A recipe swap applies to every menu with that recipe, and the recipe endpoint
  // answers with the recipe's base quantities; reload the week so each menu row
  // shows the swapped food at the client's own portion.
  const reloadAfterRecipeSwap = useCallback(
    () => loadDiet({ mode: 'refresh', anchorDate, selectedDate }),
    [anchorDate, loadDiet, selectedDate],
  );

  const applyUpdatedMenu = useCallback((menu: ClientDietMenu) => {
    setDietDays((currentDays) => applyUpdatedMenuToWeekDays(currentDays, menu));
    setError(null);
  }, []);

  const handleOpenRecipeIngredientSwap = useCallback(
    (recipe: ClientDietRecipeCard, ingredient: ClientDietIngredientRow) => {
      if (!ingredient.exchangeGroupId || !ingredient.menuItemId || !recipe.menuId) {
        return;
      }

      setSelectedSwapTarget({
        type: 'standalone',
        menuId: recipe.menuId!,
        ingredient,
      });
      setSwapFoods([]);
      setSwapFoodsError(null);
      setIsSwapModalVisible(true);
    },
    [],
  );

  const handleOpenStandaloneFoodSwap = useCallback(
    (menu: ClientDietMenu, food: ClientDietFoodRow) => {
      if (!food.exchangeGroupId || !food.menuItemId) {
        return;
      }

      setSelectedSwapTarget({
        type: 'standalone',
        menuId: menu.menuId,
        ingredient: food,
      });
      setSwapFoods([]);
      setSwapFoodsError(null);
      setIsSwapModalVisible(true);
    },
    [],
  );

  const handleVisibleMenuStandaloneFoodPress = useCallback(
    (food: ClientDietFoodRow) => {
      if (!visibleMenu) {
        return;
      }

      handleOpenStandaloneFoodSwap(visibleMenu, food);
    },
    [handleOpenStandaloneFoodSwap, visibleMenu],
  );

  const handleCloseSwapModal = useCallback(() => {
    if (isSavingSwap) {
      return;
    }

    setIsSwapModalVisible(false);
    setSelectedSwapTarget(null);
    setSwapFoodsError(null);
  }, [isSavingSwap]);

  const handleRetrySwapFoods = useCallback(() => {
    if (!selectedIngredient) {
      return;
    }

    void loadSwapFoods(selectedIngredient);
  }, [loadSwapFoods, selectedIngredient]);

  const handleSelectSwapFood = useCallback(async (food: ClientFoodSwapCandidate) => {
    if (!selectedSwapTarget || !selectedIngredient) {
      return;
    }

    setIsSavingSwap(true);
    setSwapFoodsError(null);

    try {
      if (selectedSwapTarget.type === 'recipe' && selectedIngredient.recipeIngredientId) {
        await swapDietRecipeIngredient(
          selectedSwapTarget.recipeId,
          selectedIngredient.recipeIngredientId,
          food.id,
        );
        await reloadAfterRecipeSwap();
      } else if (selectedSwapTarget.type === 'standalone' && selectedIngredient.menuItemId) {
        const response = await swapDietStandaloneFood(
          selectedSwapTarget.menuId,
          selectedIngredient.menuItemId,
          food.id,
          selectedDate,
        );
        applyUpdatedMenu(response);
      } else {
        return;
      }

      setIsSwapModalVisible(false);
      setSelectedSwapTarget(null);
    } catch (saveError) {
      const apiError = saveError as ApiError;
      setSwapFoodsError(apiError.message || 'No fue posible guardar el cambio.');
    } finally {
      setIsSavingSwap(false);
    }
  }, [applyUpdatedMenu, reloadAfterRecipeSwap, selectedDate, selectedIngredient, selectedSwapTarget]);

  const handleResetSwap = useCallback(async () => {
    if (!selectedSwapTarget || !selectedIngredient) {
      return;
    }

    setIsSavingSwap(true);
    setSwapFoodsError(null);

    try {
      if (selectedSwapTarget.type === 'recipe' && selectedIngredient.recipeIngredientId) {
        await resetDietRecipeIngredientSwap(
          selectedSwapTarget.recipeId,
          selectedIngredient.recipeIngredientId,
        );
        await reloadAfterRecipeSwap();
      } else if (selectedSwapTarget.type === 'standalone' && selectedIngredient.menuItemId) {
        const response = await resetDietStandaloneFoodSwap(
          selectedSwapTarget.menuId,
          selectedIngredient.menuItemId,
          selectedDate,
        );
        applyUpdatedMenu(response);
      } else {
        return;
      }

      setIsSwapModalVisible(false);
      setSelectedSwapTarget(null);
    } catch (resetError) {
      const apiError = resetError as ApiError;
      setSwapFoodsError(
        apiError.message || (
          selectedSwapTarget.type === 'recipe'
            ? 'No fue posible restaurar el ingrediente original.'
            : 'No fue posible restaurar el alimento original.'
        ),
      );
    } finally {
      setIsSavingSwap(false);
    }
  }, [applyUpdatedMenu, reloadAfterRecipeSwap, selectedDate, selectedIngredient, selectedSwapTarget]);

  const nutritionTip = useMemo(
    () => scienceTips.find((tip) => tip.category === 'nutrition') ?? null,
    [],
  );
  const recipeEntries = useMemo<DietRecipeEntry[]>(() => {
    if (!visibleMenu) {
      return [];
    }

    const seenRecipeIds = new Set<number>();
    const mealKinds = getDietMealKinds(visibleMenu.meals.map((meal) => meal.name));
    return visibleMenu.meals.flatMap((meal, index) =>
      meal.recipes
        .filter((recipe) => {
          if (seenRecipeIds.has(recipe.recipeId)) {
            return false;
          }
          seenRecipeIds.add(recipe.recipeId);
          return true;
        })
        .map((recipe) => ({ recipe, mealId: meal.id, mealName: meal.name, mealKind: mealKinds[index] })),
    );
  }, [visibleMenu]);
  const handleOpenRecipeEntry = useCallback(
    (entry: DietRecipeEntry) => {
      if (!visibleMenu || !selectedDay) {
        return;
      }

      router.push(
        buildDietRecipeDetailRoute(entry.recipe.recipeId, {
          menuId: visibleMenu.menuId,
          assignedDate: selectedDay.assignedDate,
          mealId: entry.mealId,
        }),
      );
    },
    [selectedDay, visibleMenu],
  );
  const handleOpenShoppingList = useCallback(() => {
    router.push('/diet/shopping-list');
  }, []);
  const handleOpenChat = useCallback(() => {
    router.push('/(tabs)/chat');
  }, []);
  const monthLabel = capitalize(
    formatLocalDate(selectedDay?.assignedDate ?? selectedDate, { month: 'long' }),
  );
  const rangeLabel = currentWeekLabel ? currentWeekLabel.replace(' - ', ' – ') : null;
  const summaryDateLabel = selectedDay
    ? capitalize(
        formatLocalDate(selectedDay.assignedDate, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).replace(',', ''),
      )
    : '';

  if (!user) {
    return null;
  }

  if (showInitialLoadingState) {
    return (
      <TabScreenWrapper>
        <View style={styles.container}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top, paddingBottom: contentInsetBottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <AuroraBackdrop width={width} height={560 + insets.top} palette="nutrition" />
            <View style={[styles.skeletonHeader, { maxWidth: contentWidth }]}>
              <View style={styles.headerCopy}>
                <Skeleton width={92} height={18} />
                <Skeleton width={180} height={28} style={{ marginTop: spacing.sm }} />
              </View>
              <ProfileShortcutButton />
            </View>
            <View style={[styles.skeletonBlock, { maxWidth: contentWidth }]}>
              <Skeleton width="100%" height={132} borderRadius={24} />
            </View>
            <View style={[styles.skeletonBlock, { maxWidth: contentWidth }]}>
              <Skeleton width="100%" height={236} borderRadius={28} />
            </View>
            {[1, 2, 3, 4].map((item) => (
              <View key={item} style={[styles.skeletonBlock, { maxWidth: contentWidth }]}>
                <Skeleton width="100%" height={80} borderRadius={22} />
              </View>
            ))}
          </ScrollView>
        </View>
      </TabScreenWrapper>
    );
  }

  return (
    <TabScreenWrapper>
      {/* The backdrop runs under the status bar; the scrim takes over once content scrolls there. */}
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          onScroll={handleScroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: contentInsetBottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                clearPreviewMenuCandidates();
                void loadDiet({
                  mode: 'refresh',
                  anchorDate,
                  selectedDate,
                });
              }}
              tintColor={aurora.tones.emerald.tone}
              progressViewOffset={insets.top}
            />
          }
          scrollEventThrottle={tabBarScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        >
          <AuroraBackdrop width={width} height={560 + insets.top} palette="nutrition" />

          <Animated.View
            entering={getEntryAnimation(0)}
            style={[styles.header, { paddingHorizontal: horizontalPadding + 4 }]}
          >
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, auroraFont('extrabold'), { color: aurora.tones.emerald.ink }]}>
                Nutrición
              </Text>
              <Text style={[styles.title, auroraFont('extrabold'), { color: aurora.text }]}>Dieta</Text>
              <Text numberOfLines={1} style={[styles.subtitle, auroraFont('medium'), { color: aurora.muted }]}>
                Tu menú de hoy y la semana.
              </Text>
            </View>
            <ProfileShortcutButton />
          </Animated.View>

          {selectedDay ? (
            <>
              <Animated.View
                entering={getEntryAnimation(80)}
                style={[styles.section, { paddingHorizontal: horizontalPadding }]}
              >
                <DietWeekCard
                  days={navigatorDays}
                  monthLabel={monthLabel}
                  rangeLabel={rangeLabel}
                  showWeekButtons={isTablet}
                  onShiftWeek={handleShiftWeek}
                  onOpenDatePicker={handleOpenDatePicker}
                />
              </Animated.View>

              {visibleMenu ? (
                <>
                  <Animated.View
                    entering={getEntryAnimation(120)}
                    style={[styles.section, { paddingHorizontal: horizontalPadding }]}
                  >
                    <DietDaySummary
                      dateLabel={summaryDateLabel}
                      badgeLabel={isPreviewingMenu ? 'Vista previa' : visibleMenuLabel}
                      note={
                        isPreviewingMenu
                          ? 'Revisa este menú antes de confirmar el cambio.'
                          : hasPersistedOverride
                            ? 'Elegiste una opción distinta para este día.'
                            : null
                      }
                      kcal={visibleMenu.nutrients?.kcal ?? visibleMenu.totalCalories}
                      mealCount={visibleMenu.totalMeals}
                      recipeCount={visibleMenu.totalRecipes}
                      nutrients={visibleMenu.nutrients}
                      canChangeMenu={hasAvailableMenuOptions}
                      isLoadingMenuOptions={Boolean(menuOptionsLoadingByDate[selectedDate])}
                      onChangeMenu={() => {
                        void handleOpenMenuSelector();
                      }}
                      onOpenWeeklyPlan={() => router.push('/diet/weekly-plan')}
                    />
                  </Animated.View>

                  <Animated.View
                    entering={getEntryAnimation(160)}
                    style={[styles.sectionLarge, { paddingHorizontal: horizontalPadding }]}
                  >
                    {visibleMenu.meals.length > 0 ? (
                      <DietMealTimeline
                        key={`${selectedDay.assignedDate}-${visibleMenu.menuId}-${renderVersion}`}
                        meals={visibleMenu.meals}
                        title={selectedDay.isToday ? 'Comidas de hoy' : 'Comidas del día'}
                        nextMealIndex={nextMealIndex}
                        expandedMealId={expandedMealId}
                        onToggleMeal={handleToggleMeal}
                        menuId={visibleMenu.menuId}
                        assignedDate={selectedDay.assignedDate}
                        onRecipeIngredientPress={
                          isPreviewingMenu ? undefined : handleOpenRecipeIngredientSwap
                        }
                        onStandaloneFoodPress={
                          isPreviewingMenu ? undefined : handleVisibleMenuStandaloneFoodPress
                        }
                        showHungerHint={showHungerHint}
                      />
                    ) : (
                      <DietEmptyDay
                        icon="restaurant-outline"
                        title="Sin comidas cargadas"
                        message="Tu menú existe, pero este día todavía no tiene comidas visibles."
                      />
                    )}
                  </Animated.View>

                  <Animated.View
                    entering={getEntryAnimation(220)}
                    style={[styles.section, { paddingHorizontal: horizontalPadding }]}
                  >
                    <DietShoppingCard onOpenList={handleOpenShoppingList} />
                  </Animated.View>

                  <Animated.View entering={getEntryAnimation(260)} style={styles.sectionLarge}>
                    <DietRecipesCarousel
                      entries={recipeEntries}
                      horizontalPadding={horizontalPadding}
                      onOpenRecipe={handleOpenRecipeEntry}
                    />
                  </Animated.View>

                  <Animated.View
                    entering={getEntryAnimation(300)}
                    style={[styles.section, { paddingHorizontal: horizontalPadding }]}
                  >
                    <DietSourcesCard
                      exchangeSystemName={visibleMenuExchangeSystem?.name}
                      citations={visibleMenuSourceCitations}
                      isExpanded={isSourcesExpanded}
                      onToggleExpanded={handleToggleSources}
                      onOpenCitation={handleOpenCitation}
                    />
                  </Animated.View>
                </>
              ) : (
                <Animated.View
                  entering={getEntryAnimation(120)}
                  style={[styles.section, { paddingHorizontal: horizontalPadding }]}
                >
                  <DietEmptyDay
                    icon="restaurant-outline"
                    title={selectedDay.isToday ? 'Tu menú de hoy aún no está listo' : 'Este día aún no tiene menú'}
                    message={`Todavía no se publica el menú del ${formatLongDate(selectedDay.assignedDate)}. Cuando llegue, lo verás aquí.`}
                    primaryLabel="Enviar un mensaje"
                    primaryIcon="chatbubble-outline"
                    onPrimary={handleOpenChat}
                    tip={nutritionTip}
                  />
                </Animated.View>
              )}
            </>
          ) : (
            <Animated.View
              entering={getEntryAnimation(80)}
              style={[styles.section, { paddingHorizontal: horizontalPadding }]}
            >
              <DietEmptyDay
                icon={error ? 'alert-circle-outline' : 'restaurant-outline'}
                title={error ? 'No pudimos cargar tu dieta' : 'Todavía no tienes una dieta asignada'}
                message={
                  error ?? 'Cuando tu plan de nutrición esté listo, aparecerá aquí con sus comidas y recetas.'
                }
                primaryLabel="Reintentar"
                primaryIcon="refresh"
                onPrimary={() => void loadDiet({ anchorDate, selectedDate })}
              />
            </Animated.View>
          )}
        </ScrollView>
        <AuroraTopScrim height={insets.top} visible={isScrolled} />

        <CalendarDatePickerModal
          visible={isDatePickerVisible}
          title="Ir a fecha"
          subtitle="Salta a cualquier día para revisar semanas anteriores o futuras."
          selectedDate={selectedDate}
          onClose={handleCloseDatePicker}
          onSelect={handleSelectAnchorDate}
        />

        <DietMenuSelectorModal
          visible={isMenuSelectorVisible && Boolean(selectedDay)}
          dateLabel={selectedDay ? formatLongDate(selectedDay.assignedDate) : ''}
          menus={selectorMenus}
          getMenuLabel={(menu, index) => menuLabelsById.get(menu.menuId) ?? buildDietMenuLabel(index)}
          visibleMenuId={visibleMenu?.menuId ?? suggestedMenuId ?? null}
          persistedMenuId={selectedDay?.backendPrimaryMenuId ?? null}
          suggestedMenuId={suggestedMenuId}
          previewMenuId={selectedPreviewMenuId}
          isLoading={Boolean(menuOptionsLoadingByDate[selectedDate])}
          error={menuOptionsErrorByDate[selectedDate]}
          onClose={handleCloseMenuSelector}
          onRetry={handleRetryMenuOptions}
          onSelect={handleSelectMenu}
        />

        {selectedDay && previewMenu ? (
          <View
            style={[
              styles.previewActionBar,
              {
                paddingHorizontal: horizontalPadding,
                paddingBottom: Math.max(contentInsetBottom, spacing.lg),
              },
            ]}
          >
            <View style={styles.previewActionCard}>
              <View style={styles.previewActionCopy}>
                <Text style={styles.previewActionEyebrow}>Previsualización</Text>
                <Text style={styles.previewActionTitle}>
                  {menuLabelsById.get(previewMenu.menuId) ?? 'Menú seleccionado'}
                </Text>
                <Text style={styles.previewActionText}>
                  Revisa lo que comerías el {previewBannerDateLabel} y confirma si quieres cambiar a este menú.
                </Text>
              </View>

              <View style={styles.previewActionButtons}>
                <Button
                  title="Cancelar"
                  onPress={handleCancelPreviewMenu}
                  variant="secondary"
                  disabled={isPersistingMenuSelection}
                  style={styles.previewSecondaryButton}
                />
                <Button
                  title="Confirmar"
                  onPress={() => void persistSelectedMenu(previewMenu)}
                  isLoading={isPersistingMenuSelection}
                  style={styles.previewPrimaryButton}
                />
              </View>
            </View>
          </View>
        ) : null}

        <RecipeIngredientSwapModal
          visible={isSwapModalVisible}
          ingredient={selectedIngredient}
          foods={swapFoods}
          isLoading={swapFoodsLoading}
          isSaving={isSavingSwap}
          error={swapFoodsError}
          onClose={handleCloseSwapModal}
          onRetry={handleRetrySwapFoods}
          onSelectFood={handleSelectSwapFood}
          onReset={handleResetSwap}
        />
      </View>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    skeletonHeader: {
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: 26,
    },
    skeletonBlock: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingTop: 26,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 6,
      fontSize: 32,
      lineHeight: 36,
      letterSpacing: -1,
    },
    subtitle: {
      marginTop: 6,
      fontSize: 14.5,
      lineHeight: 20,
    },
    section: {
      marginTop: 16,
    },
    sectionLarge: {
      marginTop: 28,
    },
    previewActionBar: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingTop: spacing.md,
    },
    previewActionCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
      padding: spacing.md,
    },
    previewActionCopy: {
      gap: spacing.xs,
    },
    previewActionEyebrow: {
      color: nutritionTheme.accentStrong,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    previewActionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    previewActionText: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    previewActionButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    previewSecondaryButton: {
      flex: 1,
    },
    previewPrimaryButton: {
      flex: 1,
    },
  });
