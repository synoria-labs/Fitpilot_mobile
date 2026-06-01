import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  LoadingSpinner,
  ProfileShortcutButton,
  TabScreenWrapper,
} from '../../src/components/common';
import {
  CalendarDatePickerModal,
  HistoricalNavigator,
  type SharedWeeklyCalendarDay,
} from '../../src/components/calendar';
import {
  DietHero,
  DietMealCard,
  DietMenuSelectorModal,
  DietSourcesCard,
  RecipeIngredientSwapModal,
} from '../../src/components/diet';
import { borderRadius, brandColors, fontSize, spacing, nutritionTheme } from '../../src/constants/colors';
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
  ClientDietRecipeDetail,
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

const applyRecipeDetailToRecipeCard = (
  recipe: ClientDietRecipeCard,
  recipeDetail: ClientDietRecipeDetail,
): ClientDietRecipeCard => {
  if (recipe.recipeId !== recipeDetail.recipeId) {
    return recipe;
  }

  return {
    ...recipe,
    ingredientCount: recipeDetail.ingredientCount,
    ingredients: recipeDetail.ingredients,
  };
};

const applyRecipeDetailToMenu = (
  menu: ClientDietMenu,
  recipeDetail: ClientDietRecipeDetail,
): ClientDietMenu => {
  let hasChanges = false;

  const meals = menu.meals.map((meal) => {
    let mealChanged = false;
    const recipes = meal.recipes.map((recipe) => {
      const nextRecipe = applyRecipeDetailToRecipeCard(recipe, recipeDetail);
      if (nextRecipe !== recipe) {
        mealChanged = true;
      }
      return nextRecipe;
    });

    if (!mealChanged) {
      return meal;
    }

    hasChanges = true;
    return {
      ...meal,
      recipes,
    };
  });

  return hasChanges
    ? {
        ...menu,
        meals,
      }
    : menu;
};

const applyRecipeDetailToWeekDays = (
  days: ClientDietWeekDay[],
  recipeDetail: ClientDietRecipeDetail,
): ClientDietWeekDay[] =>
  days.map((day) => {
    if (day.menuOptions.length === 0) {
      return day;
    }

    let hasChanges = false;
    const nextMenuOptions = day.menuOptions.map((menu) => {
      const nextMenu = applyRecipeDetailToMenu(menu, recipeDetail);
      if (nextMenu !== menu) {
        hasChanges = true;
      }
      return nextMenu;
    });

    return !hasChanges
      ? day
      : {
          ...day,
          menuOptions: nextMenuOptions,
        };
  });

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

const buildDietMenuLabel = (index: number) => `Menu ${index + 1}`;

type LoadDietOptions = {
  mode?: 'initial' | 'refresh';
  anchorDate: string;
  selectedDate?: string;
};

export default function DietScreen() {
  const { width, height } = useWindowDimensions();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const contentWidth = Math.max(0, getDashboardContentWidth(width) - horizontalPadding * 2);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const tabBarScroll = useBottomTabBarScroll();
  const contentInsetBottom = useBottomTabBarContentInset();
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
  const isTablet = isTabletLayout(width, height);
  const isTabletPortrait = isTablet && height > width;

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
        const message = loadError?.message || 'No se pudieron cargar los menus visibles.';
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
    : 'Sin menu asignado';
  const visibleMenuExchangeSystem = visibleMenu?.exchangeSystem ?? null;
  const visibleMenuSourceCitations = visibleMenuExchangeSystem?.citations ?? [];

  const hasHydratedOptionsForSelectedDate = Boolean(menuOptionsHydratedByDate[selectedDate]);
  const hasAvailableMenuOptions = Boolean(selectedDay) && (
    selectorMenus.length > 0 || Boolean(selectedDay?.backendPrimaryMenuId) || !hasHydratedOptionsForSelectedDate
  );
  const selectorSubtitle = !selectedDay
    ? 'No hay menus disponibles para esta fecha.'
    : isPreviewingMenu
        ? 'Estas revisando un cambio pendiente para este dia.'
    : menuOptionsErrorByDate[selectedDate]
        ? menuOptionsErrorByDate[selectedDate] || 'No se pudieron cargar los menus.'
      : menuOptionsLoadingByDate[selectedDate]
          ? 'Cargando menus visibles.'
        : hasHydratedOptionsForSelectedDate
            ? selectorMenus.length > 0
              ? `${selectorMenus.length} opcion${selectorMenus.length === 1 ? '' : 'es'} disponible${selectorMenus.length === 1 ? '' : 's'}`
              : 'Sin menus visibles para este dia.'
            : 'Cargando menus visibles.';
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
        variant: 'diet',
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
  const selectedDateLabel = useMemo(
    () => (
      selectedDay
        ? formatLocalDate(selectedDay.assignedDate, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })
        : 'Semana visible'
    ),
    [selectedDay],
  );

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
        apiError.message || 'No fue posible guardar el menu elegido para este dia.',
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
      const response = await getFoodsByExchangeGroup(ingredient.exchangeGroupId);
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

  const applyUpdatedRecipeDetail = useCallback((recipeDetail: ClientDietRecipeDetail) => {
    setDietDays((currentDays) => applyRecipeDetailToWeekDays(currentDays, recipeDetail));
    setError(null);
  }, []);

  const applyUpdatedMenu = useCallback((menu: ClientDietMenu) => {
    setDietDays((currentDays) => applyUpdatedMenuToWeekDays(currentDays, menu));
    setError(null);
  }, []);

  const handleOpenRecipeIngredientSwap = useCallback(
    (recipe: ClientDietRecipeCard, ingredient: ClientDietIngredientRow) => {
      if (!ingredient.exchangeGroupId || !ingredient.recipeIngredientId) {
        return;
      }

      setSelectedSwapTarget({
        type: 'recipe',
        recipeId: recipe.recipeId,
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
        const response = await swapDietRecipeIngredient(
          selectedSwapTarget.recipeId,
          selectedIngredient.recipeIngredientId,
          food.id,
        );
        applyUpdatedRecipeDetail(response);
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
  }, [applyUpdatedMenu, applyUpdatedRecipeDetail, selectedDate, selectedIngredient, selectedSwapTarget]);

  const handleResetSwap = useCallback(async () => {
    if (!selectedSwapTarget || !selectedIngredient) {
      return;
    }

    setIsSavingSwap(true);
    setSwapFoodsError(null);

    try {
      if (selectedSwapTarget.type === 'recipe' && selectedIngredient.recipeIngredientId) {
        const response = await resetDietRecipeIngredientSwap(
          selectedSwapTarget.recipeId,
          selectedIngredient.recipeIngredientId,
        );
        applyUpdatedRecipeDetail(response);
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
  }, [applyUpdatedMenu, applyUpdatedRecipeDetail, selectedDate, selectedIngredient, selectedSwapTarget]);

  if (!user) {
    return null;
  }

  if (showInitialLoadingState) {
    return <LoadingSpinner fullScreen text="Cargando tu dieta..." />;
  }

  return (
    <TabScreenWrapper>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentInsetAdjustmentBehavior="automatic"
          onScroll={tabBarScroll.onScroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentInsetBottom }]}
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
              tintColor={brandColors.navy}
            />
          }
          scrollEventThrottle={tabBarScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={getEntryAnimation(0)}
            style={[styles.header, { paddingHorizontal: horizontalPadding }]}
          >
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Nutricion</Text>
              <Text style={styles.title}>Dieta</Text>
              <Text style={styles.subtitle}>
                Revisa tu menu del dia y las recetas asignadas.
              </Text>
            </View>
            <ProfileShortcutButton />
          </Animated.View>

          {selectedDay ? (
            <>
              <Animated.View
                entering={getEntryAnimation(80)}
                style={{ paddingHorizontal: horizontalPadding }}
              >
                <HistoricalNavigator
                  title="Historial semanal"
                  subtitle={selectedDateLabel}
                  weekLabel={currentWeekLabel}
                  days={navigatorDays}
                  contentWidth={contentWidth}
                  isTabletPortrait={isTabletPortrait}
                  showWeekButtons={isTablet}
                  accentColor={nutritionTheme.accentStrong}
                  datePickerLabel="Fecha"
                  onShiftWeek={handleShiftWeek}
                  onOpenDatePicker={handleOpenDatePicker}
                />
              </Animated.View>

              {visibleMenu ? (
                <Animated.View
                  entering={getEntryAnimation(140)}
                  style={[styles.heroSection, { paddingHorizontal: horizontalPadding }]}
                >
                  <DietHero
                    menu={visibleMenu}
                    menuLabel={visibleMenuLabel}
                    assignedDate={selectedDay.assignedDate}
                    isToday={selectedDay.isToday}
                    isPreview={isPreviewingMenu}
                    sourceSystemName={visibleMenuExchangeSystem?.name}
                    sourceCount={visibleMenuSourceCitations.length}
                  />
                </Animated.View>
              ) : null}

              <Animated.View
                entering={getEntryAnimation(180)}
                style={[styles.selectorSection, { paddingHorizontal: horizontalPadding }]}
              >
                <View style={styles.selectorCardShell}>
                  <TouchableOpacity
                    style={[
                      styles.selectorCard,
                      !hasAvailableMenuOptions && styles.selectorCardDisabled,
                    ]}
                    onPress={handleOpenMenuSelector}
                    disabled={!hasAvailableMenuOptions}
                    activeOpacity={0.85}
                  >
                    <View style={styles.selectorCopy}>
                      <Text style={styles.selectorEyebrow}>Menu visible</Text>
                      <Text style={styles.selectorTitle}>
                        {visibleMenuLabel}
                      </Text>
                      <Text numberOfLines={2} style={styles.selectorSubtitle}>
                        {isPreviewingMenu
                          ? 'Estas revisando este menu antes de confirmarlo.'
                          : hasPersistedOverride
                            ? 'Elegiste una opcion distinta para este dia.'
                            : selectorSubtitle}
                      </Text>
                    </View>

                    <View style={styles.selectorAction}>
                      {menuOptionsLoadingByDate[selectedDate] ? (
                        <ActivityIndicator size="small" color={nutritionTheme.accentStrong} />
                      ) : (
                        <Ionicons
                          name={hasAvailableMenuOptions ? 'chevron-forward-outline' : 'remove-outline'}
                          size={20}
                          color={hasAvailableMenuOptions ? nutritionTheme.accentStrong : theme.colors.iconMuted}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <Animated.View entering={getEntryAnimation(220)} style={styles.mealsSection}>
                <View style={[styles.sectionHeader, { paddingHorizontal: horizontalPadding }]}>
                  <View>
                    <Text style={styles.sectionTitle}>Comidas del dia</Text>
                    <Text style={styles.sectionSubtitle}>
                      {visibleMenu
                        ? isPreviewingMenu
                          ? `Estas revisando ${visibleMenu.totalMeals} ${visibleMenu.totalMeals === 1 ? 'bloque' : 'bloques'} antes de confirmar el cambio`
                          : `${visibleMenu.totalMeals} ${visibleMenu.totalMeals === 1 ? 'bloque' : 'bloques'} organizados para ti`
                        : 'No hay comidas programadas para esta fecha'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.mealList, { paddingHorizontal: horizontalPadding }]}>
                  {visibleMenu ? (
                    visibleMenu.meals.length > 0 ? (
                      visibleMenu.meals.map((meal, index) => (
                        <Animated.View
                          key={`${selectedDay.assignedDate}-${visibleMenu.menuId}-${renderVersion}-${meal.id}`}
                          entering={FadeInDown.delay(300 + index * 60).duration(320)}
                        >
                          <DietMealCard
                            meal={meal}
                            onRecipeIngredientPress={
                              isPreviewingMenu ? undefined : handleOpenRecipeIngredientSwap
                            }
                            onStandaloneFoodPress={
                              !isPreviewingMenu && visibleMenu
                                ? (food) => handleOpenStandaloneFoodSwap(visibleMenu, food)
                                : undefined
                            }
                          />
                        </Animated.View>
                      ))
                    ) : (
                      <Card style={styles.noMealsCard}>
                        <Text style={styles.noMealsTitle}>Sin comidas cargadas</Text>
                        <Text style={styles.noMealsText}>
                          Tu menu fue encontrado, pero este dia todavia no contiene bloques de comida visibles.
                        </Text>
                      </Card>
                    )
                  ) : (
                    <Card style={styles.noMealsCard}>
                      <Text style={styles.noMealsTitle}>Sin menu asignado</Text>
                      <Text style={styles.noMealsText}>
                        No tienes un menu cargado para {formatLongDate(selectedDay.assignedDate)}.
                      </Text>
                    </Card>
                  )}
                </View>
              </Animated.View>

              {visibleMenu ? (
                <Animated.View
                  entering={getEntryAnimation(300)}
                  style={[styles.sourcesSection, { paddingHorizontal: horizontalPadding }]}
                >
                  <DietSourcesCard
                    exchangeSystemName={visibleMenuExchangeSystem?.name}
                    citations={visibleMenuSourceCitations}
                    isExpanded={isSourcesExpanded}
                    onToggleExpanded={handleToggleSources}
                    onOpenCitation={handleOpenCitation}
                  />
                </Animated.View>
              ) : null}
            </>
          ) : (
            <Animated.View
              entering={getEntryAnimation(80)}
              style={[styles.emptyStateWrapper, { paddingHorizontal: horizontalPadding }]}
            >
              <Card style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name={error ? 'alert-circle-outline' : 'restaurant-outline'} size={30} color={nutritionTheme.accentStrong} />
                </View>
                <Text style={styles.emptyTitle}>
                  {error ? 'No pudimos cargar tu dieta' : 'Todavia no tienes una dieta asignada'}
                </Text>
                <Text style={styles.emptyText}>
                  {error
                    ? error
                    : 'Cuando tu nutriologo publique un plan, aparecera aqui con sus comidas y recetas.'}
                </Text>
                <Button
                  title="Reintentar"
                  onPress={() => void loadDiet({
                    anchorDate,
                    selectedDate,
                  })}
                  variant="primary"
                  style={styles.retryButton}
                />
              </Card>
            </Animated.View>
          )}
        </ScrollView>

        <CalendarDatePickerModal
          visible={isDatePickerVisible}
          title="Ir a fecha"
          subtitle="Salta a cualquier dia para revisar semanas anteriores o futuras."
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
                <Text style={styles.previewActionEyebrow}>Previsualizacion</Text>
                <Text style={styles.previewActionTitle}>{previewMenu.title}</Text>
                <Text style={styles.previewActionText}>
                  Revisa lo que comerias el {previewBannerDateLabel} y confirma si quieres cambiar a este menu.
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
      </SafeAreaView>
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
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingTop: spacing.md,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: nutritionTheme.accentStrong,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    title: {
      marginTop: spacing.xs,
      color: theme.colors.textPrimary,
      fontSize: 32,
      fontWeight: '800',
    },
    subtitle: {
      marginTop: spacing.sm,
      color: theme.colors.textMuted,
      fontSize: fontSize.base,
      lineHeight: 22,
    },
    heroSection: {
      marginTop: spacing.lg,
    },
    sourcesSection: {
      marginTop: spacing.md,
    },
    sectionHeader: {
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.xl,
      fontWeight: '800',
    },
    sectionSubtitle: {
      marginTop: spacing.xs,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
    },
    selectorSection: {
      marginTop: spacing.md,
    },
    selectorCardShell: {
      borderRadius: borderRadius.md,
    },
    selectorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.md,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      borderColor: theme.isDark ? 'rgba(36, 50, 71, 0.72)' : theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    selectorCardDisabled: {
      opacity: 0.65,
    },
    selectorCopy: {
      flex: 1,
      paddingRight: spacing.md,
    },
    selectorEyebrow: {
      color: nutritionTheme.accentStrong,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    selectorTitle: {
      marginTop: 4,
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    selectorSubtitle: {
      marginTop: 4,
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      lineHeight: 18,
    },
    selectorAction: {
      width: 30,
      height: 30,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      borderColor: theme.colors.border,
    },
    mealsSection: {
      marginTop: spacing.lg,
    },
    mealList: {
      gap: spacing.md,
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
    emptyStateWrapper: {
      flex: 1,
      paddingTop: spacing.xxl,
    },
    emptyCard: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: nutritionTheme.accentSoft,
    },
    emptyTitle: {
      marginTop: spacing.lg,
      color: theme.colors.textPrimary,
      fontSize: fontSize.xl,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      marginTop: spacing.sm,
      color: theme.colors.textMuted,
      fontSize: fontSize.base,
      lineHeight: 22,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: spacing.lg,
      minWidth: 180,
    },
    noMealsCard: {
      paddingVertical: spacing.xl,
    },
    noMealsTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
      textAlign: 'center',
    },
    noMealsText: {
      marginTop: spacing.sm,
      color: theme.colors.textMuted,
      fontSize: fontSize.base,
      lineHeight: 22,
      textAlign: 'center',
    },
  });
