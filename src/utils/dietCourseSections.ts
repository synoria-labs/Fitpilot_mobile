import type {
  ClientDietCourseCategory,
  ClientDietFoodRow,
  ClientDietIngredientRow,
  ClientDietRecipeCard,
} from '../types';

// Raw response shape used by both the menu-item mapper and the recipe-detail
// mapper. The backend embeds the catalog summary via the menu_course_categories
// include, so older payloads that predate the feature simply omit the field.
type RawCourseCategory = {
  id?: number | null;
  code?: string | null;
  name?: string | null;
  emoji?: string | null;
  sort_order?: number | null;
};

export type RawDietCourseCategoryRef = {
  course_category_id?: number | null;
  course_category?: RawCourseCategory | null;
};

const toFiniteNumber = (
  value: number | string | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const buildCourseCategory = (
  source: RawCourseCategory | null | undefined,
): ClientDietCourseCategory | null => {
  if (!source) {
    return null;
  }

  const id = toFiniteNumber(source.id);
  const code = source.code?.trim() ?? '';
  const name = source.name?.trim() ?? '';
  const emoji = source.emoji?.trim() ?? '';
  const sortOrder = toFiniteNumber(source.sort_order);

  if (id === null || !code || !name || !emoji || sortOrder === null) {
    return null;
  }

  return { id, code, name, emoji, sortOrder };
};

export type NormalizedDietCourseCategory = {
  courseCategoryId: number | null;
  courseCategory: ClientDietCourseCategory | null;
};

/**
 * Normalize a raw backend payload that may carry an embedded course category
 * summary. Legacy responses that omit the field (or any of its sub-fields)
 * collapse to `null`/`null` so the UI can render them under "Sin clasificar"
 * without runtime errors.
 */
export const normalizeDietCourseCategory = (
  source: RawDietCourseCategoryRef | null | undefined,
): NormalizedDietCourseCategory => {
  if (!source) {
    return { courseCategoryId: null, courseCategory: null };
  }

  const category = buildCourseCategory(source.course_category);
  if (category) {
    return { courseCategoryId: category.id, courseCategory: category };
  }

  const rawId = toFiniteNumber(source.course_category_id);
  if (rawId === null) {
    return { courseCategoryId: null, courseCategory: null };
  }

  // The ID is present but the embedded summary is missing or invalid. We keep
  // the numeric reference so the UI can decide how to render the orphan, but
  // we expose a null summary to avoid presenting a partial label.
  return { courseCategoryId: rawId, courseCategory: null };
};

export type DietCourseSection = {
  category: ClientDietCourseCategory | null;
  categoryId: number | null;
  isUnclassified: boolean;
  recipes: ClientDietRecipeCard[];
  standaloneFoods: ClientDietFoodRow[];
  totalEntries: number;
};

const UNCLASSIFIED_SORT_FLOOR = Number.MAX_SAFE_INTEGER;

const buildSectionKey = (categoryId: number | null) =>
  categoryId === null ? 'unclassified' : `category:${categoryId}`;

/**
 * Group recipes and standalone foods into course-category sections.
 *
 * Semantics (mirrors `groupSelectionsByCourseCategory()` in
 * `FitPilot-frontend/src/features/menus/menuBuilderCourseCategories.ts`):
 *
 *  - Sections are ordered by the embedded catalog `sortOrder`, ties broken by
 *    `id` for determinism.
 *  - The "Sin clasificar" bucket (null category) is placed LAST regardless of
 *    input ordering.
 *  - Recipes stay together as a single card inside the section that matches
 *    their first categorized item; the helper does not split them.
 *  - Standalone foods are grouped by their own category.
 *  - Empty sections are omitted from the output.
 *  - Input arrays are not mutated.
 */
export const buildDietCourseSections = (
  recipes: ClientDietRecipeCard[],
  standaloneFoods: ClientDietFoodRow[],
): DietCourseSection[] => {
  const sectionMap = new Map<string, DietCourseSection>();

  const ensureSection = (
    categoryId: number | null,
    category: ClientDietCourseCategory | null,
  ): DietCourseSection => {
    const key = buildSectionKey(categoryId);
    const existing = sectionMap.get(key);
    if (existing) {
      return existing;
    }

    const isUnclassified = categoryId === null;
    const section: DietCourseSection = {
      category,
      categoryId,
      isUnclassified,
      recipes: [],
      standaloneFoods: [],
      totalEntries: 0,
    };
    sectionMap.set(key, section);
    return section;
  };

  for (const recipe of recipes) {
    const section = ensureSection(recipe.courseCategoryId, recipe.courseCategory);
    section.recipes.push(recipe);
    section.totalEntries += 1 + recipe.ingredients.length;
  }

  for (const food of standaloneFoods) {
    const section = ensureSection(food.courseCategoryId, food.courseCategory);
    section.standaloneFoods.push(food);
    section.totalEntries += 1;
  }

  return Array.from(sectionMap.values())
    .filter((section) => section.totalEntries > 0)
    .sort((left, right) => {
      if (left.isUnclassified && !right.isUnclassified) return 1;
      if (!left.isUnclassified && right.isUnclassified) return -1;
      if (left.isUnclassified && right.isUnclassified) return 0;
      const leftSort = left.category?.sortOrder ?? UNCLASSIFIED_SORT_FLOOR;
      const rightSort = right.category?.sortOrder ?? UNCLASSIFIED_SORT_FLOOR;
      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      const leftId = left.category?.id ?? 0;
      const rightId = right.category?.id ?? 0;
      return leftId - rightId;
    });
};

/**
 * Convenience helper used by tests and by the swap paths to assert that a
 * recipe group still resolves to a single course category after re-mapping.
 */
export const resolveRecipeCourseCategory = (
  ingredients: ClientDietIngredientRow[],
): NormalizedDietCourseCategory => {
  for (const ingredient of ingredients) {
    if (ingredient.courseCategoryId !== null) {
      return {
        courseCategoryId: ingredient.courseCategoryId,
        courseCategory: ingredient.courseCategory,
      };
    }
  }

  return { courseCategoryId: null, courseCategory: null };
};
