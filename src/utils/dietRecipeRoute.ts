type RouteParamValue = string | string[] | undefined;

export type DietRecipeRouteContext = {
  menuId?: number | null;
  assignedDate?: string | null;
  mealId?: string | null;
};

export type DietRecipeMenuContext = {
  menuId: number;
  date: string;
  mealId: string | null;
};

const firstParam = (value: RouteParamValue) => (Array.isArray(value) ? value[0] : value);

// Tells the recipe screen which menu, day and meal it was opened from, so it can
// show the client's own portions instead of the recipe's base quantities.
export const buildDietRecipeDetailRoute = (
  recipeId: number,
  context: DietRecipeRouteContext = {},
) => {
  const hasMenuContext =
    typeof context.menuId === 'number' &&
    Number.isInteger(context.menuId) &&
    Boolean(context.assignedDate);

  return {
    pathname: '/recipes/[recipeId]' as const,
    params: {
      recipeId: String(recipeId),
      ...(hasMenuContext
        ? {
            menuId: String(context.menuId),
            date: String(context.assignedDate),
            ...(context.mealId ? { mealId: context.mealId } : {}),
          }
        : {}),
    },
  };
};

export const parseDietRecipeMenuContext = (params: {
  menuId?: RouteParamValue;
  date?: RouteParamValue;
  mealId?: RouteParamValue;
}): DietRecipeMenuContext | null => {
  const menuId = Number.parseInt(firstParam(params.menuId) ?? '', 10);
  const date = firstParam(params.date)?.trim();

  if (!Number.isInteger(menuId) || !date) {
    return null;
  }

  return {
    menuId,
    date,
    mealId: firstParam(params.mealId)?.trim() || null,
  };
};
