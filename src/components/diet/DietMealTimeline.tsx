import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { AuroraIconName } from '../aurora';
import { ExchangeGroupIcon } from './ExchangeGroupIcon';
import { DishHalo, RecipeDish } from './RecipeDish';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import type {
  ClientDietFoodRow,
  ClientDietIngredientRow,
  ClientDietMeal,
  ClientDietRecipeCard,
} from '../../types';
import { buildDietCourseSections } from '../../utils/dietCourseSections';
import { groupIngredientsByRelevance, sumIngredientKcal } from '../../utils/dietIngredientEmphasis';
import { getDietMealKinds, type DietMealKind } from '../../utils/dietMealVisuals';
import {
  getDietPortionDisplayItems,
  getDietPortionEquivalentsValue,
  sumDietPortionEquivalents,
} from '../../utils/dietPortions';
import { buildDietRecipeDetailRoute } from '../../utils/dietRecipeRoute';
import { getExchangeGroupKey, type ExchangeGroupKey } from '../../utils/exchangeGroups';
import { getRecipeCutoutUri } from '../../utils/recipeImage';

type MealLook = {
  colors: readonly [string, string];
  /** A paler tile for a dish photo without background to sit on, in light and dark. */
  tile: readonly [string, string];
  tileDark: readonly [string, string];
  ink: string;
  icon: AuroraIconName;
};

// Thumb colours from the proposal: sunrise for breakfast, pink for snacks, green for the main
// meal and indigo for dinner.
export const MEAL_LOOKS: Record<DietMealKind, MealLook> = {
  desayuno: {
    colors: ['#fde68a', '#fb923c'],
    tile: ['#fef3c7', '#fdba74'],
    tileDark: ['rgba(251, 191, 36, 0.2)', 'rgba(251, 146, 60, 0.34)'],
    ink: '#7c2d12',
    icon: 'sunny-outline',
  },
  colacion: {
    colors: ['#fbcfe8', '#f472b6'],
    tile: ['#fce7f3', '#f9a8d4'],
    tileDark: ['rgba(244, 114, 182, 0.18)', 'rgba(236, 72, 153, 0.32)'],
    ink: '#831843',
    icon: 'nutrition-outline',
  },
  comida: {
    colors: ['#a7f3d0', '#10b981'],
    tile: ['#d1fae5', '#6ee7b7'],
    tileDark: ['rgba(52, 211, 153, 0.16)', 'rgba(16, 185, 129, 0.32)'],
    ink: '#064e3b',
    icon: 'leaf-outline',
  },
  cena: {
    colors: ['#c7d2fe', '#6366f1'],
    tile: ['#e0e7ff', '#a5b4fc'],
    tileDark: ['rgba(165, 180, 252, 0.16)', 'rgba(99, 102, 241, 0.34)'],
    ink: '#1e1b4b',
    icon: 'moon-outline',
  },
  otra: {
    colors: ['#e2e8f0', '#94a3b8'],
    tile: ['#f1f5f9', '#cbd5e1'],
    tileDark: ['rgba(148, 163, 184, 0.14)', 'rgba(148, 163, 184, 0.28)'],
    ink: '#1e293b',
    icon: 'restaurant-outline',
  },
};

// Each group takes the colour of the macro it mostly brings: protein blue, carbohydrates amber,
// fat rose.
const GROUP_TONES: Record<ExchangeGroupKey, AuroraTone> = {
  alimentos_origen_animal: 'blue',
  leche: 'blue',
  cereales_tuberculos: 'amber',
  leguminosas: 'amber',
  frutas: 'amber',
  azucares: 'amber',
  grasas: 'rose',
  verduras: 'emerald',
  unknown: 'slate',
};

const PORTION_ORDER = { grams: 0, household: 1, equivalents: 2 } as const;

// Grams and household measure; the equivalents get a chip of their own.
const getPortionAmounts = (ingredient: ClientDietIngredientRow) =>
  getDietPortionDisplayItems(ingredient.portion)
    .filter((item) => item.key !== 'equivalents' && item.value && item.value !== '--')
    .sort((left, right) => PORTION_ORDER[left.key] - PORTION_ORDER[right.key])
    .map((item) => item.value);

// The household measure reads best in a chip; grams or equivalents when there is none.
const getShortAmount = (ingredient: ClientDietIngredientRow) => {
  const items = getDietPortionDisplayItems(ingredient.portion).filter(
    (item) => item.value && item.value !== '--',
  );
  return (items.find((item) => item.key === 'household') ?? items[0])?.value ?? null;
};

// Swaps go through the menu item, so a food without one can't be changed here.
const canSwap = (ingredient: ClientDietIngredientRow, onPress?: () => void) =>
  Boolean(onPress && ingredient.exchangeGroupId && ingredient.menuItemId);

const formatKcal = (value: number) => `${Math.round(value).toLocaleString('es-MX')}`;

const getMealTitle = (meal: ClientDietMeal) => {
  const names = meal.recipes.length
    ? meal.recipes.map((recipe) => recipe.title)
    : groupIngredientsByRelevance(meal.standaloneFoods).main.map((food) => food.label);
  if (!names.length) {
    return meal.name;
  }
  const shown = names.slice(0, 2).join(' · ');
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
};

const getMacroLine = (meal: ClientDietMeal) => {
  const nutrients = meal.nutrients;
  if (!nutrients || nutrients.proteinG === null || nutrients.carbsG === null || nutrients.fatG === null) {
    return null;
  }
  return `P ${Math.round(nutrients.proteinG)} g · C ${Math.round(nutrients.carbsG)} g · G ${Math.round(nutrients.fatG)} g`;
};

type DietMealTimelineProps = {
  meals: ClientDietMeal[];
  title: string;
  /** Index of the meal that comes next today, or null. */
  nextMealIndex: number | null;
  expandedMealId: string | null;
  onToggleMeal: (mealId: string) => void;
  menuId?: number;
  assignedDate?: string;
  onRecipeIngredientPress?: (recipe: ClientDietRecipeCard, ingredient: ClientDietIngredientRow) => void;
  onStandaloneFoodPress?: (food: ClientDietFoodRow) => void;
  showHungerHint: boolean;
};

/** The day's meals as a timeline; a meal opens to its foods, ordered by how much they matter. */
export const DietMealTimeline = ({
  meals,
  title,
  nextMealIndex,
  expandedMealId,
  onToggleMeal,
  menuId,
  assignedDate,
  onRecipeIngredientPress,
  onStandaloneFoodPress,
  showHungerHint,
}: DietMealTimelineProps) => {
  const aurora = useAurora();
  const nextMeal = nextMealIndex !== null ? meals[nextMealIndex] : null;
  const kinds = useMemo(() => getDietMealKinds(meals.map((meal) => meal.name)), [meals]);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[auroraType.title, { color: aurora.text }]}>{title}</Text>
        <Text style={[styles.sectionHint, auroraFont('bold'), { color: aurora.faint }]} numberOfLines={1}>
          {nextMeal ? `Siguiente: ${nextMeal.name.toLowerCase()}` : `${meals.length} ${meals.length === 1 ? 'comida' : 'comidas'}`}
        </Text>
      </View>

      <View style={styles.list}>
        {meals.length > 1 ? (
          <LinearGradient
            pointerEvents="none"
            colors={[aurora.borderStrong, aurora.tones.emerald.line]}
            style={styles.connector}
          />
        ) : null}
        {meals.map((meal, index) => (
          <MealRow
            key={meal.id}
            meal={meal}
            look={MEAL_LOOKS[kinds[index]]}
            isNext={index === nextMealIndex}
            expanded={expandedMealId === meal.id}
            onToggle={() => onToggleMeal(meal.id)}
            onOpenRecipe={(recipe) =>
              router.push(buildDietRecipeDetailRoute(recipe.recipeId, { menuId, assignedDate, mealId: meal.id }))
            }
            onRecipeIngredientPress={onRecipeIngredientPress}
            onStandaloneFoodPress={onStandaloneFoodPress}
            showHungerHint={showHungerHint}
          />
        ))}
      </View>
    </View>
  );
};

type MealRowProps = {
  meal: ClientDietMeal;
  look: MealLook;
  isNext: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpenRecipe: (recipe: ClientDietRecipeCard) => void;
  onRecipeIngredientPress?: (recipe: ClientDietRecipeCard, ingredient: ClientDietIngredientRow) => void;
  onStandaloneFoodPress?: (food: ClientDietFoodRow) => void;
  showHungerHint: boolean;
};

const MealRow = ({
  meal,
  look,
  isNext,
  expanded,
  onToggle,
  onOpenRecipe,
  onRecipeIngredientPress,
  onStandaloneFoodPress,
  showHungerHint,
}: MealRowProps) => {
  const aurora = useAurora();
  const emerald = aurora.tones.emerald;
  const [dishFailed, setDishFailed] = useState(false);
  // The first recipe photo without background stands for the meal.
  const dishUri = dishFailed
    ? null
    : meal.recipes.map((recipe) => getRecipeCutoutUri(recipe.imageUrl)).find(Boolean) ?? null;
  const kcal = meal.nutrients?.kcal ?? meal.totalCalories;
  const macroLine = getMacroLine(meal);
  const mealTitle = getMealTitle(meal);
  const meta = [kcal ? `${formatKcal(kcal)} kcal` : `${meal.totalEntries} ${meal.totalEntries === 1 ? 'elemento' : 'elementos'}`, macroLine]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.mealCard,
        {
          backgroundColor: aurora.surface,
          borderColor: isNext ? emerald.line : aurora.border,
          boxShadow: isNext ? `0px 0px 0px 4px ${emerald.soft}, ${aurora.shadow}` : aurora.shadow,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${meal.name}: ${mealTitle}, ${meta}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.mealHeader, { opacity: pressed ? 0.85 : 1 }]}
      >
        {dishUri ? (
          <View style={styles.thumbBox}>
            <LinearGradient
              colors={aurora.isDark ? look.tileDark : look.tile}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.thumbTile}
            />
            <RecipeDish uri={dishUri} size={54} style={styles.thumbDish} onError={() => setDishFailed(true)} />
          </View>
        ) : (
          <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.thumb}>
            <Ionicons name={look.icon} size={24} color={look.ink} />
          </LinearGradient>
        )}
        <View style={styles.mealCopy}>
          <View style={styles.eyebrowRow}>
            <Text
              style={[auroraType.label, { color: isNext ? emerald.ink : aurora.faint }]}
              numberOfLines={1}
            >
              {meal.name}
            </Text>
            {isNext ? (
              <LinearGradient colors={emerald.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextPill}>
                <Text style={[styles.nextPillText, auroraFont('extrabold'), { color: aurora.onTone }]}>Siguiente</Text>
              </LinearGradient>
            ) : null}
          </View>
          <Text style={[styles.mealTitle, auroraFont('bold'), { color: aurora.text }]} numberOfLines={2}>
            {mealTitle}
          </Text>
          <Text style={[styles.mealMeta, auroraFont('bold'), { color: aurora.faint }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={aurora.faint} />
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(220)} style={[styles.details, { borderTopColor: aurora.border }]}>
          <MealDetails
            meal={meal}
            look={look}
            onOpenRecipe={onOpenRecipe}
            onRecipeIngredientPress={onRecipeIngredientPress}
            onStandaloneFoodPress={onStandaloneFoodPress}
            showHungerHint={showHungerHint}
          />
        </Animated.View>
      ) : null}
    </View>
  );
};

type MealDetailsProps = Omit<MealRowProps, 'isNext' | 'expanded' | 'onToggle'>;

const MealDetails = ({
  meal,
  look,
  onOpenRecipe,
  onRecipeIngredientPress,
  onStandaloneFoodPress,
  showHungerHint,
}: MealDetailsProps) => {
  const aurora = useAurora();
  const sections = useMemo(
    () => buildDietCourseSections(meal.recipes, meal.standaloneFoods),
    [meal.recipes, meal.standaloneFoods],
  );
  const showSectionHeaders = sections.length > 1;

  return (
    <View style={styles.detailsStack}>
      <EnergyBar meal={meal} />
      {sections.map((section) => (
        <View key={section.categoryId ?? 'unclassified'} style={styles.detailsStack}>
          {showSectionHeaders ? (
            <Text style={[auroraType.label, { color: aurora.faint }]}>
              {section.category?.emoji ? `${section.category.emoji}  ` : ''}
              {section.category?.name ?? 'Otros'}
            </Text>
          ) : null}
          {section.recipes.map((recipe) => (
            <RecipeBlock
              key={recipe.id}
              recipe={recipe}
              mealLook={look}
              onOpen={() => onOpenRecipe(recipe)}
              onIngredientPress={
                onRecipeIngredientPress ? (ingredient) => onRecipeIngredientPress(recipe, ingredient) : undefined
              }
              showHungerHint={showHungerHint}
            />
          ))}
          {section.standaloneFoods.length ? (
            <>
              {/* Foods served next to a recipe get a heading so they don't read as part of it. */}
              {section.recipes.length ? (
                <Text style={[auroraType.label, { color: aurora.faint }]}>Para acompañar</Text>
              ) : null}
              <IngredientGroups
                items={section.standaloneFoods}
                onPress={onStandaloneFoodPress}
                showHungerHint={showHungerHint}
              />
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
};

/** Where the meal's energy comes from; only drawn when every food carries its kcal. */
const EnergyBar = ({ meal }: { meal: ClientDietMeal }) => {
  const aurora = useAurora();
  const foods = useMemo(
    () => [...meal.recipes.flatMap((recipe) => recipe.ingredients), ...meal.standaloneFoods],
    [meal.recipes, meal.standaloneFoods],
  );
  const grouped = useMemo(() => groupIngredientsByRelevance(foods), [foods]);
  const vegetablesKcal = sumIngredientKcal(grouped.vegetables);
  const freeKcal = sumIngredientKcal(grouped.free);
  const mainKcal = sumIngredientKcal(grouped.main);

  if (mainKcal === null || vegetablesKcal === null || freeKcal === null || grouped.main.length === 0) {
    return null;
  }

  const total = mainKcal + vegetablesKcal + freeKcal;
  if (total <= 0) {
    return null;
  }

  const leaders = grouped.main.slice(0, 4);
  const restKcal = sumIngredientKcal(grouped.main.slice(4)) ?? 0;
  const segments = [
    ...leaders.map((food) => ({
      key: food.id,
      label: food.label.split(' ')[0],
      kcal: food.nutrients?.kcal ?? 0,
      color: aurora.tones[GROUP_TONES[getExchangeGroupKey(food.exchangeGroupName)]].tone,
    })),
    ...(restKcal > 0 ? [{ key: 'rest', label: 'Otros', kcal: restKcal, color: aurora.tones.slate.tone }] : []),
    ...(vegetablesKcal > 0 ? [{ key: 'veg', label: 'Verduras', kcal: vegetablesKcal, color: aurora.tones.emerald.tone }] : []),
    ...(freeKcal > 0 ? [{ key: 'free', label: 'Al gusto', kcal: freeKcal, color: aurora.tones.slate.tone2 }] : []),
  ];
  const leadersShare = Math.round((leaders.reduce((sum, food) => sum + (food.nutrients?.kcal ?? 0), 0) / total) * 100);

  return (
    <View>
      <Text style={[styles.energyLead, auroraFont('medium'), { color: aurora.muted }]}>
        {leaders.length} {leaders.length === 1 ? 'alimento aporta' : 'alimentos aportan'}{' '}
        <Text style={[auroraFont('extrabold'), { color: aurora.text }]}>{leadersShare} %</Text> de la energía
      </Text>
      <View
        accessibilityRole="image"
        accessibilityLabel={`Energía de la comida: ${segments.map((segment) => `${segment.label} ${Math.round(segment.kcal)} kilocalorías`).join(', ')}`}
        style={styles.energyBar}
      >
        {segments.map((segment) => (
          <View key={segment.key} style={{ flex: segment.kcal, backgroundColor: segment.color }} />
        ))}
      </View>
      <View style={styles.energyLegend}>
        {segments.map((segment) => (
          <View key={segment.key} style={styles.energyKey}>
            <View style={[styles.energySwatch, { backgroundColor: segment.color }]} />
            <Text style={[styles.energyKeyText, auroraFont('bold'), { color: aurora.muted }]}>
              {segment.label}{' '}
              <Text style={[auroraFont('semibold'), { color: aurora.faint }]}>{formatKcal(segment.kcal)}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const RecipeBlock = ({
  recipe,
  mealLook,
  onOpen,
  onIngredientPress,
  showHungerHint,
}: {
  recipe: ClientDietRecipeCard;
  mealLook: MealLook;
  onOpen: () => void;
  onIngredientPress?: (ingredient: ClientDietIngredientRow) => void;
  showHungerHint: boolean;
}) => {
  const aurora = useAurora();
  const [dishFailed, setDishFailed] = useState(false);
  const cutoutUri = getRecipeCutoutUri(recipe.imageUrl);

  return (
    <View style={styles.detailsStack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir la receta ${recipe.title}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.recipeHeader, { opacity: pressed ? 0.8 : 1 }]}
      >
        {cutoutUri && !dishFailed ? (
          <View style={styles.recipeDishBox}>
            <DishHalo size={76} color={mealLook.colors[1]} style={styles.recipeHalo} />
            <RecipeDish uri={cutoutUri} size={60} style={styles.recipeDish} onError={() => setDishFailed(true)} />
          </View>
        ) : recipe.imageUrl && !cutoutUri ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.recipeThumb} resizeMode="cover" />
        ) : (
          <LinearGradient colors={mealLook.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recipeThumb}>
            <Ionicons name="restaurant-outline" size={18} color={mealLook.ink} />
          </LinearGradient>
        )}
        <View style={styles.recipeCopy}>
          <Text style={[styles.recipeTitle, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text style={[auroraType.caption, { color: aurora.faint }]}>
            {recipe.ingredientCount} {recipe.ingredientCount === 1 ? 'ingrediente' : 'ingredientes'} · ver preparación
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={aurora.tones.emerald.ink} />
      </Pressable>
      <IngredientGroups items={recipe.ingredients} onPress={onIngredientPress} showHungerHint={showHungerHint} />
    </View>
  );
};

const IngredientGroups = ({
  items,
  onPress,
  showHungerHint,
}: {
  items: ClientDietIngredientRow[];
  onPress?: (ingredient: ClientDietIngredientRow) => void;
  showHungerHint: boolean;
}) => {
  const grouped = useMemo(() => groupIngredientsByRelevance(items), [items]);

  return (
    <View style={styles.groups}>
      {grouped.main.map((ingredient) => (
        <MainFoodRow
          key={ingredient.id}
          ingredient={ingredient}
          onPress={onPress ? () => onPress(ingredient) : undefined}
        />
      ))}
      {grouped.vegetables.length ? (
        <VegetablesBlock items={grouped.vegetables} onPress={onPress} showHungerHint={showHungerHint} />
      ) : null}
      {grouped.free.length ? <FreeFoodsBlock items={grouped.free} /> : null}
    </View>
  );
};

const MainFoodRow = ({ ingredient, onPress }: { ingredient: ClientDietIngredientRow; onPress?: () => void }) => {
  const aurora = useAurora();
  const tone = aurora.tones[GROUP_TONES[getExchangeGroupKey(ingredient.exchangeGroupName)]];
  const amounts = getPortionAmounts(ingredient);
  const equivalents = getDietPortionEquivalentsValue(ingredient.portion);
  const portionLabel = [...amounts, equivalents].filter(Boolean).join(', ');
  const kcal = ingredient.nutrients?.kcal ?? null;
  const swappable = canSwap(ingredient, onPress);
  const swapped = Boolean(ingredient.isClientSwap);
  const groupLine = [
    ingredient.exchangeGroupName,
    swapped && ingredient.originalLabel ? `Original: ${ingredient.originalLabel}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const content = (
    <>
      <View style={[styles.foodIcon, { backgroundColor: tone.soft }]}>
        <ExchangeGroupIcon groupName={ingredient.exchangeGroupName} size={19} color={tone.ink} withContainer={false} />
      </View>
      <View style={styles.foodCopy}>
        <Text style={[styles.foodName, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={2}>
          {ingredient.label}
        </Text>
        {amounts.length || equivalents ? (
          <View style={styles.chips}>
            {amounts.map((value, index) => (
              <View
                key={value}
                style={[
                  styles.chip,
                  index === 0
                    ? { backgroundColor: aurora.surface3 }
                    : { backgroundColor: aurora.surface, borderWidth: 1, borderColor: aurora.border },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    auroraFont(index === 0 ? 'extrabold' : 'bold'),
                    { color: index === 0 ? aurora.text : aurora.muted },
                  ]}
                >
                  {value}
                </Text>
              </View>
            ))}
            {equivalents ? (
              <View style={[styles.chip, { backgroundColor: tone.soft }]}>
                <Text style={[styles.chipText, auroraFont('extrabold'), { color: tone.ink }]}>{equivalents}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {groupLine ? (
          <Text style={[styles.groupLine, auroraFont('semibold'), { color: aurora.faint }]} numberOfLines={1}>
            {groupLine}
          </Text>
        ) : null}
      </View>
      <View style={styles.foodSide}>
        {kcal !== null ? (
          <Text style={[styles.foodKcal, auroraFont('extrabold'), { color: aurora.text }]}>
            {formatKcal(kcal)}
            <Text style={[styles.foodKcalUnit, auroraFont('bold'), { color: aurora.faint }]}> kcal</Text>
          </Text>
        ) : null}
        {swappable ? (
          swapped ? (
            <LinearGradient
              colors={aurora.tones.emerald.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.swapBadge}
            >
              <Ionicons name="swap-horizontal" size={15} color={aurora.onTone} />
            </LinearGradient>
          ) : (
            <View style={[styles.swapBadge, { backgroundColor: aurora.tones.emerald.soft }]}>
              <Ionicons name="swap-horizontal" size={15} color={aurora.tones.emerald.ink} />
            </View>
          )
        ) : null}
      </View>
    </>
  );

  const rowStyle = [styles.foodRow, { backgroundColor: aurora.surface2 }];

  return swappable ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ingredient.label}${portionLabel ? `, ${portionLabel}` : ''}${kcal !== null ? `, ${formatKcal(kcal)} kilocalorías` : ''}`}
      accessibilityHint="Cambia este alimento por un equivalente de su grupo"
      onPress={onPress}
      style={({ pressed }) => [...rowStyle, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
};

const VegetablesBlock = ({
  items,
  onPress,
  showHungerHint,
}: {
  items: ClientDietIngredientRow[];
  onPress?: (ingredient: ClientDietIngredientRow) => void;
  showHungerHint: boolean;
}) => {
  const aurora = useAurora();
  const emerald = aurora.tones.emerald;
  const kcal = sumIngredientKcal(items);
  const equivalents = sumDietPortionEquivalents(items.map((item) => item.portion));

  return (
    <View style={[styles.block, { backgroundColor: aurora.surface, borderColor: emerald.line }]}>
      <View style={styles.blockHeader}>
        <View style={[styles.blockIcon, { backgroundColor: emerald.soft }]}>
          <Ionicons name="leaf-outline" size={17} color={emerald.ink} />
        </View>
        <View style={styles.blockCopy}>
          <Text style={[styles.blockTitle, auroraFont('extrabold'), { color: aurora.text }]}>Verduras</Text>
          <Text style={[styles.blockSubtitle, auroraFont('bold'), { color: emerald.ink }]}>
            Cantidad mínima{equivalents ? ` · ${equivalents}` : ''}
          </Text>
        </View>
        {kcal !== null && kcal > 0 ? (
          <Text style={[styles.blockKcal, auroraFont('bold'), { color: aurora.faint }]}>≈ {formatKcal(kcal)} kcal</Text>
        ) : null}
      </View>
      <View style={styles.vegChips}>
        {items.map((item) => {
          const amount = getShortAmount(item);
          const swappable = canSwap(item, onPress ? () => onPress(item) : undefined);
          const chip = (
            <>
              <Text style={[styles.vegName, auroraFont('bold'), { color: aurora.text }]}>{item.label}</Text>
              {amount ? (
                <Text style={[styles.vegAmount, auroraFont('semibold'), { color: aurora.faint }]}>{amount}</Text>
              ) : null}
            </>
          );
          const chipStyle = [styles.vegChip, { backgroundColor: aurora.surface2, borderColor: emerald.line }];

          return swappable && onPress ? (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, mínimo ${amount ?? ''}. Cambiar por otra verdura`}
              onPress={() => onPress(item)}
              style={({ pressed }) => [...chipStyle, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            >
              {chip}
            </Pressable>
          ) : (
            <View key={item.id} style={chipStyle}>
              {chip}
            </View>
          );
        })}
      </View>
      {showHungerHint ? (
        <View style={[styles.hint, { backgroundColor: emerald.soft }]}>
          <Ionicons name="information-circle-outline" size={18} color={emerald.ink} />
          <Text style={[styles.hintText, auroraFont('medium'), { color: aurora.text }]}>
            <Text style={auroraFont('extrabold')}>¿Más hambre hoy?</Text> Esta es la cantidad mínima: puedes servirte
            más verduras.
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const FreeFoodsBlock = ({ items }: { items: ClientDietIngredientRow[] }) => {
  const aurora = useAurora();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.block, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}>
      <View style={styles.blockHeader}>
        <View style={[styles.blockIcon, { backgroundColor: aurora.surface3 }]}>
          <Ionicons name="sparkles-outline" size={16} color={aurora.tones.slate.ink} />
        </View>
        <View style={styles.blockCopy}>
          <Text style={[styles.blockTitle, auroraFont('extrabold'), { color: aurora.text }]}>Al gusto</Text>
          <Text style={[auroraType.caption, { color: aurora.faint }]}>Libres de energía, para dar sabor</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          hitSlop={8}
          style={styles.toggle}
        >
          <Text style={[styles.toggleText, auroraFont('bold'), { color: aurora.tones.emerald.ink }]}>
            {open ? 'Ocultar' : 'Ver cantidades'}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={aurora.tones.emerald.ink} />
        </Pressable>
      </View>
      {open ? (
        <View style={styles.freeGrid}>
          {items.map((item) => (
            <View key={item.id} style={[styles.freeCell, { backgroundColor: aurora.surface, borderColor: aurora.border }]}>
              <Text style={[styles.freeName, auroraFont('bold'), { color: aurora.text }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
                {getShortAmount(item) ?? 'Al gusto'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.freeLine, auroraFont('semibold'), { color: aurora.muted }]}>
          {items.map((item) => item.label).join(' · ')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  sectionHint: {
    flexShrink: 1,
    fontSize: 12.5,
  },
  list: {
    gap: 12,
    marginTop: 14,
  },
  connector: {
    position: 'absolute',
    left: 39,
    top: 30,
    bottom: 30,
    width: 2,
    borderRadius: 1,
  },
  mealCard: {
    borderRadius: 22,
    borderWidth: 1,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 14,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 10px 20px -12px rgba(15, 23, 42, 0.5)',
  },
  // A dish photo without background rises 10 px over its tile.
  thumbBox: {
    width: 56,
    height: 56,
  },
  thumbTile: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    boxShadow: '0px 10px 20px -12px rgba(15, 23, 42, 0.5)',
  },
  thumbDish: {
    position: 'absolute',
    left: 1,
    top: -10,
  },
  mealCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 999,
    justifyContent: 'center',
  },
  nextPillText: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  mealTitle: {
    marginTop: 4,
    fontSize: 14.5,
    lineHeight: 19,
  },
  mealMeta: {
    marginTop: 6,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  details: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14,
  },
  detailsStack: {
    gap: 12,
  },
  energyLead: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  energyBar: {
    flexDirection: 'row',
    gap: 2,
    height: 12,
    marginTop: 10,
    borderRadius: 6,
    overflow: 'hidden',
  },
  energyLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 6,
    marginTop: 10,
  },
  energyKey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  energySwatch: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  energyKeyText: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recipeThumb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recipeDishBox: {
    width: 52,
    height: 52,
  },
  // The halo is wider than the dish so its glow shows around it.
  recipeHalo: {
    position: 'absolute',
    left: -12,
    top: -12,
  },
  recipeDish: {
    position: 'absolute',
    left: -4,
    top: -8,
  },
  recipeCopy: {
    flex: 1,
    minWidth: 0,
  },
  recipeTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  groups: {
    gap: 8,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
  },
  foodIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodCopy: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    fontSize: 14.5,
    lineHeight: 19,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  groupLine: {
    marginTop: 6,
    fontSize: 11.5,
  },
  foodSide: {
    alignItems: 'flex-end',
    gap: 8,
  },
  foodKcal: {
    fontSize: 14.5,
    fontVariant: ['tabular-nums'],
  },
  foodKcalUnit: {
    fontSize: 11,
  },
  swapBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  blockIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockCopy: {
    flex: 1,
    minWidth: 0,
  },
  blockTitle: {
    fontSize: 14.5,
  },
  blockSubtitle: {
    marginTop: 1,
    fontSize: 12,
  },
  blockKcal: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  vegChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  vegChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  vegName: {
    fontSize: 13,
  },
  vegAmount: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
  },
  toggleText: {
    fontSize: 12.5,
  },
  freeLine: {
    marginTop: 10,
    fontSize: 13.5,
    lineHeight: 20,
  },
  freeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  freeCell: {
    flexBasis: '45%',
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  freeName: {
    fontSize: 13,
  },
});
