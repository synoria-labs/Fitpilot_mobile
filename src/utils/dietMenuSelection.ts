import type { ClientDietMenu, ClientDietWeekDay } from '../types';
import { getCalendarDayDiff, getStartOfLocalWeekDateKey } from './date';

const hasSwappableRecipeIngredients = (menu: ClientDietMenu) =>
  menu.meals.some((meal) =>
    meal.recipes.some((recipe) =>
      recipe.ingredients.some((ingredient) => (
        Boolean((ingredient.menuItemId || ingredient.recipeIngredientId) && ingredient.exchangeGroupId)
      )),
    ),
  );

const selectPreferredDietMenu = (
  currentMenu: ClientDietMenu,
  incomingMenu: ClientDietMenu,
) => {
  const currentHasSwappableRecipeIngredients = hasSwappableRecipeIngredients(currentMenu);
  const incomingHasSwappableRecipeIngredients = hasSwappableRecipeIngredients(incomingMenu);

  if (currentHasSwappableRecipeIngredients && !incomingHasSwappableRecipeIngredients) {
    return currentMenu;
  }

  return incomingMenu;
};

export const dedupeDietMenus = (menus: ClientDietMenu[]) =>
  Array.from(
    menus.reduce((menuMap, menu) => {
      const currentMenu = menuMap.get(menu.menuId);
      if (!currentMenu) {
        menuMap.set(menu.menuId, menu);
        return menuMap;
      }

      menuMap.set(menu.menuId, selectPreferredDietMenu(currentMenu, menu));
      return menuMap;
    }, new Map<number, ClientDietMenu>()).values(),
  );

export const mergeDietMenuOptions = (
  currentMenus: ClientDietMenu[],
  incomingMenus: ClientDietMenu[],
) => dedupeDietMenus([...currentMenus, ...incomingMenus]);

export const applyDietRotationMenuOptions = (
  days: ClientDietWeekDay[],
  rotationMenus: ClientDietMenu[],
) => {
  const nextRotationMenus = dedupeDietMenus(rotationMenus);

  return days.map((day) => {
    const nextMenuOptions = mergeDietMenuOptions(nextRotationMenus, day.menuOptions);
    const didChange =
      nextMenuOptions.length !== day.menuOptions.length ||
      nextMenuOptions.some((menu, index) => menu !== day.menuOptions[index]) ||
      nextRotationMenus.length !== day.rotationMenuOptions.length ||
      nextRotationMenus.some((menu, index) => menu !== day.rotationMenuOptions[index]);

    return !didChange
      ? day
      : {
          ...day,
          rotationMenuOptions: nextRotationMenus,
          menuOptions: nextMenuOptions,
        };
  });
};

export const mergeDietMenuOptionsByDate = (
  days: ClientDietWeekDay[],
  menusByDate: Record<string, ClientDietMenu[]>,
) =>
  days.map((day) => {
    const incomingMenus = menusByDate[day.assignedDate];
    if (!incomingMenus || incomingMenus.length === 0) {
      return day;
    }

    const nextMenuOptions = mergeDietMenuOptions(day.menuOptions, incomingMenus);
    const didChange =
      nextMenuOptions.length !== day.menuOptions.length ||
      nextMenuOptions.some((menu, index) => menu !== day.menuOptions[index]);

    return !didChange
      ? day
      : {
          ...day,
          menuOptions: nextMenuOptions,
        };
  });

export const getDietSelectableMenus = (
  day: ClientDietWeekDay | null | undefined,
): ClientDietMenu[] => {
  if (!day || day.menuOptions.length === 0) {
    return [];
  }

  return dedupeDietMenus(day.menuOptions);
};

export const getDietMenuRotationOrder = (
  day: ClientDietWeekDay | null | undefined,
): ClientDietMenu[] => {
  if (!day) {
    return [];
  }

  const rotationMenus = dedupeDietMenus(day.rotationMenuOptions);
  return rotationMenus.length > 0 ? rotationMenus : getDietSelectableMenus(day);
};

export const resolveRotatedDietMenu = (
  day: ClientDietWeekDay | null | undefined,
): ClientDietMenu | null => {
  const rotationOrder = getDietMenuRotationOrder(day);
  if (rotationOrder.length === 0 || !day) {
    return null;
  }

  const weekStartDate = getStartOfLocalWeekDateKey(day.assignedDate);
  const dayOffset = weekStartDate ? getCalendarDayDiff(weekStartDate, day.assignedDate) : 0;
  const normalizedOffset = Math.max(0, dayOffset) % rotationOrder.length;

  return rotationOrder[normalizedOffset] ?? rotationOrder[0] ?? null;
};

export const resolveRotatedDietMenuId = (day: ClientDietWeekDay | null | undefined) =>
  resolveRotatedDietMenu(day)?.menuId ?? null;

export const resolveDietSelectableMenuById = (
  day: ClientDietWeekDay | null | undefined,
  menuId: number | null,
) => {
  if (!day || menuId === null) {
    return null;
  }

  return getDietSelectableMenus(day).find((menu) => menu.menuId === menuId) ?? null;
};

export const resolveVisibleDietMenu = (
  day: ClientDietWeekDay | null | undefined,
  previewMenuId: number | null = null,
) => {
  if (!day) {
    return null;
  }

  const previewMenu = resolveDietSelectableMenuById(day, previewMenuId);
  if (previewMenu) {
    return previewMenu;
  }

  const rotatedMenu = resolveRotatedDietMenu(day);
  const persistedMenu = resolveDietSelectableMenuById(day, day.backendPrimaryMenuId);

  if (persistedMenu && (!rotatedMenu || persistedMenu.menuId !== rotatedMenu.menuId)) {
    return persistedMenu;
  }

  return rotatedMenu ?? persistedMenu ?? getDietSelectableMenus(day)[0] ?? null;
};
