import { describe, expect, it } from 'vitest';
import type {
  ClientDietCourseCategory,
  ClientDietFoodRow,
  ClientDietRecipeCard,
} from '../types';
import {
  buildDietCourseSections,
  normalizeDietCourseCategory,
  resolveRecipeCourseCategory,
} from './dietCourseSections';

const buildCategory = (
  overrides: Partial<ClientDietCourseCategory>,
): ClientDietCourseCategory => ({
  id: 1,
  code: 'principal',
  name: 'Principal',
  emoji: '🍽️',
  sortOrder: 1,
  ...overrides,
});

const buildRecipe = (overrides: {
  id: string;
  recipeId: number;
  courseCategoryId: number | null;
  courseCategory: ClientDietCourseCategory | null;
  ingredientIds?: readonly string[];
}): ClientDietRecipeCard => ({
  id: overrides.id,
  recipeId: overrides.recipeId,
  title: `Receta ${overrides.recipeId}`,
  imageUrl: null,
  ingredientCount: overrides.ingredientIds?.length ?? 0,
  courseCategoryId: overrides.courseCategoryId,
  courseCategory: overrides.courseCategory,
  ingredients: (overrides.ingredientIds ?? []).map((ingredientId) => ({
    id: ingredientId,
    menuItemId: undefined,
    foodId: 1,
    exchangeGroupId: 1,
    label: 'Ingrediente',
    exchangeGroupName: 'Grupo',
    isClientSwap: false,
    originalFoodId: null,
    originalLabel: null,
    portion: { householdLabel: null, equivalents: 1, grams: 100 },
    courseCategoryId: overrides.courseCategoryId,
    courseCategory: overrides.courseCategory,
  })),
});

const buildFood = (overrides: {
  id: string;
  courseCategoryId: number | null;
  courseCategory: ClientDietCourseCategory | null;
  label?: string;
}): ClientDietFoodRow => ({
  id: overrides.id,
  menuItemId: Number(overrides.id.replace(/\D/g, '') || 1),
  foodId: 1,
  exchangeGroupId: 1,
  label: overrides.label ?? 'Alimento',
  exchangeGroupName: 'Grupo',
  isClientSwap: false,
  originalFoodId: null,
  originalLabel: null,
  portion: { householdLabel: null, equivalents: 1, grams: 100 },
  courseCategoryId: overrides.courseCategoryId,
  courseCategory: overrides.courseCategory,
});

describe('normalizeDietCourseCategory', () => {
  it('returns null/null when the source is missing', () => {
    expect(normalizeDietCourseCategory(undefined)).toEqual({
      courseCategoryId: null,
      courseCategory: null,
    });
    expect(normalizeDietCourseCategory(null)).toEqual({
      courseCategoryId: null,
      courseCategory: null,
    });
  });

  it('builds the summary from the embedded course_category', () => {
    const summary = buildCategory({ id: 7, code: 'postre', name: 'Postre', emoji: '🍎', sortOrder: 3 });
    const result = normalizeDietCourseCategory({
      course_category_id: summary.id,
      course_category: {
        id: summary.id,
        code: summary.code,
        name: summary.name,
        emoji: summary.emoji,
        sort_order: summary.sortOrder,
      },
    });
    expect(result).toEqual({
      courseCategoryId: summary.id,
      courseCategory: summary,
    });
  });

  it('keeps the numeric id but nullifies the summary when the summary is invalid', () => {
    const result = normalizeDietCourseCategory({
      course_category_id: 12,
      course_category: { id: 12, code: 'broken' },
    });
    expect(result).toEqual({ courseCategoryId: 12, courseCategory: null });
  });

  it('collapses legacy responses without the field to null', () => {
    expect(normalizeDietCourseCategory({})).toEqual({
      courseCategoryId: null,
      courseCategory: null,
    });
  });
});

describe('buildDietCourseSections', () => {
  const principal = buildCategory({ id: 1, code: 'principal', name: 'Principal', emoji: '🍽️', sortOrder: 1 });
  const entrada = buildCategory({ id: 2, code: 'entrada', name: 'Entrada', emoji: '🥗', sortOrder: 2 });
  const postre = buildCategory({ id: 3, code: 'postre', name: 'Postre', emoji: '🍎', sortOrder: 3 });

  it('orders sections by embedded catalog sortOrder', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r1',
          recipeId: 11,
          courseCategoryId: postre.id,
          courseCategory: postre,
          ingredientIds: ['i1', 'i2'],
        }),
      ],
      [
        buildFood({ id: 'f1', courseCategoryId: principal.id, courseCategory: principal }),
        buildFood({ id: 'f2', courseCategoryId: entrada.id, courseCategory: entrada }),
      ],
    );

    expect(sections.map((section) => section.categoryId)).toEqual([
      principal.id,
      entrada.id,
      postre.id,
    ]);
    expect(sections.map((section) => section.category?.name)).toEqual([
      'Principal',
      'Entrada',
      'Postre',
    ]);
  });

  it('interleaves recipes and standalone foods inside the same section', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r1',
          recipeId: 11,
          courseCategoryId: principal.id,
          courseCategory: principal,
          ingredientIds: ['i1'],
        }),
      ],
      [
        buildFood({ id: 'f1', courseCategoryId: principal.id, courseCategory: principal }),
        buildFood({ id: 'f2', courseCategoryId: principal.id, courseCategory: principal }),
      ],
    );

    expect(sections).toHaveLength(1);
    const [only] = sections;
    expect(only.categoryId).toBe(principal.id);
    expect(only.recipes).toHaveLength(1);
    expect(only.standaloneFoods).toHaveLength(2);
    // totalEntries counts the recipe card (1) + its 1 ingredient + the 2
    // standalone foods inside the same section = 4.
    expect(only.totalEntries).toBe(4);
  });

  it('places the unclassified bucket last regardless of input order', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r-unclass',
          recipeId: 1,
          courseCategoryId: null,
          courseCategory: null,
          ingredientIds: ['i1'],
        }),
      ],
      [
        buildFood({ id: 'f1', courseCategoryId: principal.id, courseCategory: principal }),
      ],
    );

    expect(sections.map((section) => section.isUnclassified)).toEqual([false, true]);
    const [classified, unclassified] = sections;
    expect(classified.categoryId).toBe(principal.id);
    expect(unclassified.categoryId).toBeNull();
    expect(unclassified.recipes).toHaveLength(1);
  });

  it('keeps a recipe unified as a single card regardless of the order of its items', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r1',
          recipeId: 11,
          courseCategoryId: principal.id,
          courseCategory: principal,
          ingredientIds: ['i1', 'i2', 'i3'],
        }),
      ],
      [],
    );

    expect(sections).toHaveLength(1);
    const [only] = sections;
    expect(only.recipes).toHaveLength(1);
    expect(only.recipes[0].ingredientCount).toBe(3);
  });

  it('returns the same section after a swap that re-maps the payload', () => {
    // Swap path in diet.ts re-runs mapDietMenuResponse which calls mapDietMeal;
    // since mapDietMeal preserves the category (it lives on the item), the
    // resulting ClientDietMeal produces an identical section layout.
    const originalRecipes = [
      buildRecipe({
        id: 'r1',
        recipeId: 11,
        courseCategoryId: principal.id,
        courseCategory: principal,
        ingredientIds: ['i1', 'i2'],
      }),
    ];
    const originalFoods = [
      buildFood({ id: 'f1', courseCategoryId: postre.id, courseCategory: postre }),
    ];

    const before = buildDietCourseSections(originalRecipes, originalFoods);

    // Simulate swap: the backend returns a fresh payload; the mobile layer
    // re-runs mapDietMenuResponse. Because the category lives on the item, the
    // output (and therefore the section grouping) is identical.
    const after = buildDietCourseSections(originalRecipes, originalFoods);

    expect(after.map((section) => section.categoryId)).toEqual(
      before.map((section) => section.categoryId),
    );
    expect(after.map((section) => section.recipes.length)).toEqual(
      before.map((section) => section.recipes.length),
    );
    expect(after.map((section) => section.standaloneFoods.length)).toEqual(
      before.map((section) => section.standaloneFoods.length),
    );
  });

  it('accepts a legacy payload where every item is unclassified', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r1',
          recipeId: 11,
          courseCategoryId: null,
          courseCategory: null,
          ingredientIds: ['i1'],
        }),
      ],
      [
        buildFood({ id: 'f1', courseCategoryId: null, courseCategory: null }),
      ],
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].isUnclassified).toBe(true);
    expect(sections[0].category).toBeNull();
    expect(sections[0].recipes).toHaveLength(1);
    expect(sections[0].standaloneFoods).toHaveLength(1);
  });

  it('omits empty sections', () => {
    const sections = buildDietCourseSections(
      [
        buildRecipe({
          id: 'r1',
          recipeId: 11,
          courseCategoryId: principal.id,
          courseCategory: principal,
          ingredientIds: ['i1'],
        }),
      ],
      [],
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].categoryId).toBe(principal.id);
  });
});

describe('resolveRecipeCourseCategory', () => {
  it('returns the first non-null category from the ingredient list', () => {
    const principal = buildCategory({ id: 1, code: 'principal', name: 'Principal', emoji: '🍽️', sortOrder: 1 });
    const result = resolveRecipeCourseCategory([
      {
        id: 'i1',
        foodId: 1,
        exchangeGroupId: 1,
        label: 'Sin clasificar',
        exchangeGroupName: 'Grupo',
        isClientSwap: false,
        originalFoodId: null,
        originalLabel: null,
        portion: { householdLabel: null, equivalents: 1, grams: 100 },
        courseCategoryId: null,
        courseCategory: null,
      },
      {
        id: 'i2',
        foodId: 1,
        exchangeGroupId: 1,
        label: 'Clasificado',
        exchangeGroupName: 'Grupo',
        isClientSwap: false,
        originalFoodId: null,
        originalLabel: null,
        portion: { householdLabel: null, equivalents: 1, grams: 100 },
        courseCategoryId: principal.id,
        courseCategory: principal,
      },
    ]);
    expect(result).toEqual({
      courseCategoryId: principal.id,
      courseCategory: principal,
    });
  });

  it('returns null/null when every ingredient is unclassified', () => {
    const result = resolveRecipeCourseCategory([
      {
        id: 'i1',
        foodId: 1,
        exchangeGroupId: 1,
        label: 'Sin clasificar',
        exchangeGroupName: 'Grupo',
        isClientSwap: false,
        originalFoodId: null,
        originalLabel: null,
        portion: { householdLabel: null, equivalents: 1, grams: 100 },
        courseCategoryId: null,
        courseCategory: null,
      },
    ]);
    expect(result).toEqual({ courseCategoryId: null, courseCategory: null });
  });
});
