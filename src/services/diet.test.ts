import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClientDietCalendar,
  getClientDietRecipeInMenu,
  getDietRecipeDetail,
  mapDietMenuResponse,
  resetDietRecipeIngredientSwap,
  swapDietRecipeIngredient,
} from './diet';
import { buildDietCourseSections } from '../utils/dietCourseSections';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  isApiNetworkError: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('./api', () => ({
  nutritionClient: { get: mocks.get, put: mocks.put, delete: mocks.delete },
  isApiNetworkError: mocks.isApiNetworkError,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
  },
}));
vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true }) },
}));
vi.mock('../store/connectivityStore', () => ({
  useConnectivityStore: { getState: () => ({ isOffline: false }) },
}));

type MenuResponse = Parameters<typeof mapDietMenuResponse>[0];
const assignedDate = '2026-10-19';
const category = {
  id: 7, code: 'principal', name: 'Principal', emoji: '🍽️', sort_order: 1,
};

const buildMenu = (): MenuResponse => ({
  id: 816,
  title: 'Menú del cliente',
  menu_meals: [{
    id: 10,
    name: 'Comida',
    menu_items_menu_items_menu_meal_idTomenu_meals: [{
      id: 1001,
      recipe_id: 42,
      recipe_food_id: 501,
      food_id: 202,
      exchange_group_id: 1,
      foods: { id: 202, name: 'Alegría natural' },
      is_client_swap: true,
      original_food_id: 101,
      original_food_name: 'Pan thin',
      portion_detail: { household_label: '2 piezas', equivalents: 2, grams: 42 },
      course_category_id: category.id,
      course_category: category,
      recipe_detail: {
        id: 42,
        title: 'Receta base',
        image_url: 'https://example.com/recipe.jpg',
        ingredients: [{
          id: 501,
          food_id: 101,
          food: { id: 101, name: 'Pan thin' },
          quantity: 0.75,
          serving_unit: { unit_name: 'equivalente', gram_equivalent: 20 },
        }],
      },
    }, {
      id: 1002,
      recipe_id: 42,
      recipe_summary: { id: 42, title: 'Receta base', image_url: null },
      recipe_food_id: 502,
      foods: { id: 303, name: 'Pechuga' },
      portion_detail: { equivalents: 4, grams: 120 },
      course_category_id: category.id,
      course_category: category,
    }, {
      id: 1003,
      foods: { id: 404, name: 'Aguacate' },
      portion_detail: { equivalents: 1.5, grams: 46 },
      course_category_id: category.id,
      course_category: category,
    }],
  }],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isApiNetworkError.mockReturnValue(false);
});

describe('menu portions with course sections', () => {
  it('preserves client quantities, swaps and ingredient IDs despite embedded base ingredients', () => {
    const meal = mapDietMenuResponse(buildMenu(), assignedDate).meals[0];
    const recipe = meal.recipes[0];

    expect(recipe.title).toBe('Receta base');
    expect(recipe.ingredientCount).toBe(2);
    expect(recipe.ingredients[0]).toMatchObject({
      id: '1001',
      recipeIngredientId: 501,
      foodId: 202,
      label: 'Alegría natural',
      isClientSwap: true,
      originalFoodId: 101,
      originalLabel: 'Pan thin',
      portion: { householdLabel: '2 piezas', equivalents: 2, grams: 42 },
      courseCategoryId: category.id,
    });
    expect(recipe.ingredients[0].menuItemId).toBeUndefined();
    expect(recipe.ingredients[1].portion).toMatchObject({ equivalents: 4, grams: 120 });
    expect(meal.standaloneFoods[0]).toMatchObject({
      menuItemId: 1003,
      portion: { equivalents: 1.5, grams: 46 },
      courseCategoryId: category.id,
    });
    const sections = buildDietCourseSections(meal.recipes, meal.standaloneFoods);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      categoryId: category.id,
      recipes: [recipe],
      standaloneFoods: meal.standaloneFoods,
    });
  });

  it('keeps legacy menu portions when category metadata is missing', () => {
    const menu = buildMenu();
    for (const item of menu.menu_meals![0].menu_items_menu_items_menu_meal_idTomenu_meals!) {
      delete item.course_category_id;
      delete item.course_category;
    }

    const meal = mapDietMenuResponse(menu, assignedDate).meals[0];
    expect(meal.recipes[0].ingredients[0].portion.grams).toBe(42);
    expect(buildDietCourseSections(meal.recipes, meal.standaloneFoods)).toMatchObject([
      { categoryId: null, isUnclassified: true },
    ]);
  });

  it('uses the first categorized menu ingredient even when the first row is unclassified', () => {
    const menu = buildMenu();
    const firstItem = menu.menu_meals![0].menu_items_menu_items_menu_meal_idTomenu_meals![0];
    delete firstItem.course_category_id;
    delete firstItem.course_category;

    const recipe = mapDietMenuResponse(menu, assignedDate).meals[0].recipes[0];
    expect(recipe.courseCategoryId).toBe(category.id);
    expect(recipe.ingredients.map((ingredient) => ingredient.courseCategoryId)).toEqual([
      null, category.id,
    ]);
  });

  it('resolves the opened menu recipe with its own portions and category', async () => {
    mocks.get.mockResolvedValue([{ ...buildMenu(), assigned_date: assignedDate }]);

    const recipe = await getClientDietRecipeInMenu('185', 816, assignedDate, 42, '10');
    expect(recipe).toMatchObject({ recipeId: 42, courseCategoryId: category.id });
    expect(recipe?.ingredients[0].portion.grams).toBe(42);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe('recipe video metadata', () => {
  it.each([
    'https://www.youtube.com/watch?v=example',
    'https://example.com/preparation.mp4',
    undefined,
  ])('maps video_url %s without requiring menu categories', async (videoUrl) => {
    mocks.get.mockResolvedValue({
      id: 42, name: 'Receta', image_url: null, video_url: videoUrl,
    });
    const detail = await getDietRecipeDetail(42);
    expect(detail.videoUrl).toBe(videoUrl ?? null);
    expect(detail.ingredients).toEqual([]);
  });

  it('retains the video after swapping and restoring an ingredient', async () => {
    const response = {
      id: 42, name: 'Receta', image_url: null,
      video_url: 'https://example.com/preparation.mp4',
    };
    mocks.put.mockResolvedValue(response);
    mocks.delete.mockResolvedValue(response);

    expect((await swapDietRecipeIngredient(42, 501, 202)).videoUrl).toBe(response.video_url);
    expect((await resetDietRecipeIngredientSwap(42, 501)).videoUrl).toBe(response.video_url);
    expect(mocks.put).toHaveBeenCalledWith('/recipes/42/ingredients/501/client-swap', {
      food_id: 202,
    });
    expect(mocks.delete).toHaveBeenCalledWith('/recipes/42/ingredients/501/client-swap');
  });
});

describe('diet calendar cache migration', () => {
  it.each([2, 3])('only accepts offline calendar entries from version 3 (stored: %s)', async (version) => {
    const networkError = new Error('Offline');
    const days = [{
      id: assignedDate, assignedDate,
      menuOptions: [mapDietMenuResponse(buildMenu(), assignedDate)],
      rotationMenuOptions: [],
    }];
    mocks.get.mockRejectedValue(networkError);
    mocks.isApiNetworkError.mockReturnValue(true);
    mocks.getItem.mockResolvedValue(JSON.stringify({
      version, cachedAt: new Date().toISOString(), value: days,
    }));

    if (version === 2) {
      await expect(getClientDietCalendar('185', assignedDate)).rejects.toBe(networkError);
      expect(mocks.removeItem).toHaveBeenCalledOnce();
    } else {
      const result = await getClientDietCalendar('185', assignedDate);
      expect(result[0].menuOptions[0]).toEqual(days[0].menuOptions[0]);
      expect(mocks.removeItem).not.toHaveBeenCalled();
    }
  });
});
