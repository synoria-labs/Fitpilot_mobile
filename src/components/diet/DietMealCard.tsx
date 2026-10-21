import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Card } from '../common';
import {
  borderRadius,
  brandColors,
  colors,
  fontSize,
  spacing,
} from '../../constants/colors';
import type {
  ClientDietFoodRow,
  ClientDietIngredientRow,
  ClientDietMeal,
  ClientDietRecipeCard,
} from '../../types';
import { getExchangeGroupVisual } from '../../constants/exchangeGroupVisuals';
import { getDietPortionDisplayItems } from '../../utils/dietPortions';
import { buildDietRecipeDetailRoute } from '../../utils/dietRecipeRoute';
import { ExchangeGroupIcon } from './ExchangeGroupIcon';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

interface DietMealCardProps {
  meal: ClientDietMeal;
  /** Menu and day the meal belongs to, so the recipe screen shows these portions. */
  menuId?: number;
  assignedDate?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRecipeIngredientPress?: (
    recipe: ClientDietRecipeCard,
    ingredient: ClientDietIngredientRow,
  ) => void;
  onStandaloneFoodPress?: (food: ClientDietFoodRow) => void;
  onRecipePress?: (recipe: ClientDietRecipeCard, meal: ClientDietMeal) => void;
}

type DietMealCardStyles = ReturnType<typeof createStyles>;
type IngredientAccent = 'recipe' | 'food';

const LIGHT_RECIPE_PLACEHOLDER_COLORS = ['#E8EFF7', '#D8E7F4', '#C5DCF0'] as const;
const DARK_RECIPE_PLACEHOLDER_COLORS = ['#23344C', '#1B2A42', '#152338'] as const;
const DARK_RECIPE_CARD_BACKGROUND = '#192841';
const DARK_RECIPE_CARD_BORDER = 'rgba(103, 182, 223, 0.26)';
const DARK_RECIPE_TITLE = '#F8FAFC';
const DARK_RECIPE_META = '#9CAEC4';
const DARK_RECIPE_ACCENT = '#4FD1C5';
const DARK_RECIPE_INGREDIENT_ROW_BACKGROUND = 'rgba(255,255,255,0.04)';
const DARK_RECIPE_INGREDIENT_ROW_BORDER = 'rgba(103, 182, 223, 0.16)';
const DARK_RECIPE_INGREDIENT_CHIP_BACKGROUND = 'rgba(255,255,255,0.06)';
const DARK_RECIPE_INGREDIENT_CHIP_BORDER = 'rgba(103, 182, 223, 0.14)';
const DARK_RECIPE_INGREDIENT_CHIP_VALUE = '#F3F4F6';

const formatCalories = (value: number | null) => {
  if (value === null || value <= 0) {
    return null;
  }

  return `${Math.round(value)} kcal`;
};

const PortionChip: React.FC<{
  label: string;
  value: string;
  isDarkRecipe: boolean;
  styles: DietMealCardStyles;
}> = ({
  label,
  value,
  isDarkRecipe,
  styles,
}) => {
  const chipRef = useRef<View>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, width: 0 });

  if (!value || value === '--') {
    return null;
  }

  const handlePress = () => {
    chipRef.current?.measureInWindow((x, y, width) => {
      setPosition({ x, y, width });
      setTooltipVisible(true);
    });
  };

  return (
    <>
      <View ref={chipRef} collapsable={false}>
        <Pressable
          onPress={handlePress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}`}
          style={({ pressed }) => [
            styles.portionChip,
            isDarkRecipe ? styles.recipePortionChip : null,
            pressed ? styles.portionChipPressed : null,
          ]}
        >
          <Text style={[styles.portionChipText, isDarkRecipe ? styles.recipePortionChipText : null]}>
            {value}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setTooltipVisible(false)}>
          <View style={styles.tooltipOverlay}>
            <View
              style={[
                styles.tooltipContent,
                {
                  position: 'absolute',
                  top: Math.max(16, position.y - 72),
                  left: Math.max(16, position.x + position.width / 2 - 80),
                },
              ]}
            >
              <Text style={styles.tooltipLabel}>{label}</Text>
              <Text style={styles.tooltipValue}>{value}</Text>
              <View style={styles.tooltipArrow} />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

const PortionChips: React.FC<{
  ingredient: ClientDietIngredientRow | ClientDietFoodRow;
  accent: IngredientAccent;
  styles: DietMealCardStyles;
  theme: AppTheme;
}> = ({
  ingredient,
  accent,
  styles,
  theme,
}) => {
  const isDarkRecipe = theme.isDark && accent === 'recipe';
  const displayItems = getDietPortionDisplayItems(ingredient.portion);

  return (
    <View style={styles.portionRow}>
      {displayItems.map((item) => (
        <PortionChip
          key={item.key}
          label={item.label}
          value={item.value}
          isDarkRecipe={isDarkRecipe}
          styles={styles}
        />
      ))}
    </View>
  );
};

const IngredientRow: React.FC<{
  ingredient: ClientDietIngredientRow | ClientDietFoodRow;
  accent?: IngredientAccent;
  styles: DietMealCardStyles;
  theme: AppTheme;
  onPress?: () => void;
}> = ({
  ingredient,
  accent = 'food',
  styles,
  theme,
  onPress,
}) => {
  const foodGroupVisual = getExchangeGroupVisual(ingredient.exchangeGroupName);
  const isDarkRecipe = theme.isDark && accent === 'recipe';
  const borderColor = accent === 'recipe'
    ? undefined
    : theme.isDark
      ? theme.colors.border
      : foodGroupVisual.borderColor;
  const isSwappableIngredient = Boolean(
    onPress &&
    ingredient.exchangeGroupId &&
    (ingredient.recipeIngredientId || ingredient.menuItemId),
  );

  const content = (
    <>
      <View style={[styles.foodIcon, { backgroundColor: foodGroupVisual.backgroundColor }]}>
        <ExchangeGroupIcon
          groupName={ingredient.exchangeGroupName}
          size={17}
          strokeWidth={2}
          withContainer={false}
        />
      </View>

      <View style={styles.foodBody}>
        <View style={styles.foodHeader}>
          <View style={styles.foodText}>
            <Text
              numberOfLines={2}
              style={[styles.foodLabel, isDarkRecipe ? styles.recipeFoodLabel : null]}
            >
              {ingredient.label}
            </Text>
            {ingredient.exchangeGroupName ? (
              <Text
                numberOfLines={1}
                style={[styles.foodSubtitle, isDarkRecipe ? styles.recipeFoodSubtitle : null]}
              >
                {ingredient.exchangeGroupName}
              </Text>
            ) : null}
            {ingredient.isClientSwap && ingredient.originalLabel ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.foodOriginalLabel,
                  isDarkRecipe ? styles.recipeFoodOriginalLabel : null,
                ]}
              >
                Original: {ingredient.originalLabel}
              </Text>
            ) : null}
          </View>

          {isSwappableIngredient ? (
            <View
              style={[
                styles.swapBadge,
                ingredient.isClientSwap ? styles.swapBadgeActive : null,
              ]}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={16}
                color={
                  ingredient.isClientSwap
                    ? colors.white
                    : isDarkRecipe
                      ? DARK_RECIPE_ACCENT
                      : theme.colors.primary
                }
              />
            </View>
          ) : null}
        </View>

        <PortionChips ingredient={ingredient} accent={accent} styles={styles} theme={theme} />
      </View>
    </>
  );

  const containerStyle = [
    styles.foodRow,
    isDarkRecipe ? styles.recipeFoodRow : null,
    accent === 'food' ? { borderColor } : null,
  ];

  if (isSwappableIngredient && onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Cambiar ${accent === 'recipe' ? 'ingrediente' : 'alimento'} ${ingredient.label}`}
        accessibilityHint="Abre la lista de equivalentes disponibles"
        style={({ pressed }) => [
          ...containerStyle,
          pressed ? styles.foodRowPressed : null,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{content}</View>;
};

const SectionHeader: React.FC<{
  title: string;
  count: number;
  styles: DietMealCardStyles;
}> = ({
  title,
  count,
  styles,
}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionCount}>{count}</Text>
  </View>
);

const RecipeCard: React.FC<{
  recipe: ClientDietRecipeCard;
  onPress: () => void;
  expanded: boolean;
  onToggle: () => void;
  onIngredientPress?: (ingredient: ClientDietIngredientRow) => void;
  styles: DietMealCardStyles;
  theme: AppTheme;
}> = ({
  recipe,
  onPress,
  expanded,
  onToggle,
  onIngredientPress,
  styles,
  theme,
}) => {
  const placeholderColors = theme.isDark
    ? DARK_RECIPE_PLACEHOLDER_COLORS
    : LIGHT_RECIPE_PLACEHOLDER_COLORS;
  const accentColor = theme.isDark ? DARK_RECIPE_ACCENT : brandColors.navy;

  return (
    <View style={styles.recipeCard}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Abrir receta ${recipe.title}`}
        style={({ pressed }) => [
          styles.recipeMain,
          pressed ? styles.recipeCardPressed : null,
        ]}
      >
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.recipeImage} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={placeholderColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.recipePlaceholder}
          >
            <Ionicons name="restaurant-outline" size={24} color={accentColor} />
          </LinearGradient>
        )}

        <View style={styles.recipeCopy}>
          <Text numberOfLines={2} style={styles.recipeTitle}>
            {recipe.title}
          </Text>
          <Text numberOfLines={1} style={styles.recipeCount}>
            {recipe.ingredientCount} ingrediente{recipe.ingredientCount === 1 ? '' : 's'}
          </Text>
        </View>

        <Ionicons name="chevron-forward-outline" size={19} color={accentColor} />
      </Pressable>

      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Ocultar ingredientes' : 'Ver ingredientes'}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.recipeToggle,
          pressed ? styles.recipeTogglePressed : null,
        ]}
      >
        <Text style={styles.recipeToggleText}>
          {expanded ? 'Ocultar ingredientes' : 'Ver ingredientes'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={accentColor}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.recipeIngredients}>
          {recipe.ingredients.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              accent="recipe"
              styles={styles}
              theme={theme}
              onPress={onIngredientPress ? () => onIngredientPress(ingredient) : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const DietMealCardComponent: React.FC<DietMealCardProps> = ({
  meal,
  menuId,
  assignedDate,
  expanded,
  onToggleExpanded,
  onRecipeIngredientPress,
  onStandaloneFoodPress,
  onRecipePress,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const caloriesLabel = formatCalories(meal.totalCalories);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  const recipeKey = useMemo(
    () => meal.recipes.map((recipe) => recipe.id).join('|'),
    [meal.recipes],
  );

  useEffect(() => {
    setExpandedRecipeId(null);
  }, [meal.id, recipeKey]);

  useEffect(() => {
    if (!expanded) {
      setExpandedRecipeId(null);
    }
  }, [expanded]);

  const handleRecipePress = (recipe: ClientDietRecipeCard) => {
    if (onRecipePress) {
      onRecipePress(recipe, meal);
      return;
    }

    router.push(
      buildDietRecipeDetailRoute(recipe.recipeId, {
        menuId,
        assignedDate,
        mealId: meal.id,
      }),
    );
  };

  const itemLabel = `${meal.totalEntries} ${meal.totalEntries === 1 ? 'elemento' : 'elementos'}`;

  return (
    <Card style={styles.card} padding="none">
      <Pressable
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`${meal.name}, ${itemLabel}${caloriesLabel ? `, ${caloriesLabel}` : ''}`}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.mealHeader,
          pressed ? styles.mealHeaderPressed : null,
        ]}
      >
        <View style={styles.mealHeaderCopy}>
          <Text numberOfLines={1} style={styles.mealName}>
            {meal.name}
          </Text>
          <Text style={styles.mealCount}>{itemLabel}</Text>
        </View>

        <View style={styles.mealHeaderActions}>
          {caloriesLabel ? (
            <View style={styles.calorieBadge}>
              <Text style={styles.calorieBadgeText}>{caloriesLabel}</Text>
            </View>
          ) : null}
          <View style={styles.mealChevron}>
            <Ionicons
              name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={19}
              color={theme.colors.primary}
            />
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.content}>
          {meal.recipes.length > 0 ? (
            <View style={styles.sectionBlock}>
              {meal.recipes.length > 1 ? (
                <SectionHeader title="Recetas" count={meal.recipes.length} styles={styles} />
              ) : null}
              <View style={styles.sectionStack}>
                {meal.recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onPress={() => handleRecipePress(recipe)}
                    expanded={expandedRecipeId === recipe.id}
                    onToggle={() => {
                      setExpandedRecipeId((currentId) => (
                        currentId === recipe.id ? null : recipe.id
                      ));
                    }}
                    onIngredientPress={
                      onRecipeIngredientPress
                        ? (ingredient) => onRecipeIngredientPress(recipe, ingredient)
                        : undefined
                    }
                    styles={styles}
                    theme={theme}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {meal.standaloneFoods.length > 0 ? (
            <View style={styles.sectionBlock}>
              {meal.recipes.length > 0 || meal.standaloneFoods.length > 1 ? (
                <SectionHeader
                  title="Alimentos"
                  count={meal.standaloneFoods.length}
                  styles={styles}
                />
              ) : null}
              <View style={styles.sectionStack}>
                {meal.standaloneFoods.map((food) => (
                  <IngredientRow
                    key={food.id}
                    ingredient={food}
                    styles={styles}
                    theme={theme}
                    onPress={onStandaloneFoodPress ? () => onStandaloneFoodPress(food) : undefined}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
};

export const DietMealCard = React.memo(DietMealCardComponent);

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      overflow: 'hidden',
    },
    mealHeader: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    mealHeaderPressed: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    mealHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    mealName: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
      lineHeight: 21,
    },
    mealCount: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      lineHeight: 16,
    },
    mealHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 0,
    },
    calorieBadge: {
      minHeight: 30,
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      backgroundColor: theme.isDark ? theme.colors.primarySoft : `${brandColors.sky}25`,
    },
    calorieBadgeText: {
      color: theme.isDark ? theme.colors.primary : brandColors.navy,
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    mealChevron: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
    },
    content: {
      gap: spacing.md,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    sectionBlock: {
      gap: spacing.sm,
    },
    sectionStack: {
      gap: spacing.sm,
    },
    sectionHeader: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    sectionTitle: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    sectionCount: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    recipeCard: {
      overflow: 'hidden',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.isDark ? DARK_RECIPE_CARD_BORDER : theme.colors.border,
      backgroundColor: theme.isDark ? DARK_RECIPE_CARD_BACKGROUND : theme.colors.surface,
    },
    recipeMain: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingRight: spacing.sm,
    },
    recipeCardPressed: {
      opacity: 0.78,
    },
    recipeImage: {
      width: 84,
      height: 84,
      alignSelf: 'stretch',
      backgroundColor: theme.colors.surfaceAlt,
    },
    recipePlaceholder: {
      width: 84,
      height: 84,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recipeCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    recipeTitle: {
      color: theme.isDark ? DARK_RECIPE_TITLE : theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '800',
      lineHeight: 19,
    },
    recipeCount: {
      color: theme.isDark ? DARK_RECIPE_META : theme.colors.textMuted,
      fontSize: fontSize.xs,
      lineHeight: 16,
    },
    recipeToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.isDark ? DARK_RECIPE_CARD_BORDER : theme.colors.border,
      backgroundColor: theme.isDark ? 'rgba(12, 22, 38, 0.24)' : theme.colors.surfaceAlt,
    },
    recipeTogglePressed: {
      opacity: 0.72,
    },
    recipeToggleText: {
      color: theme.isDark ? DARK_RECIPE_ACCENT : brandColors.navy,
      fontSize: fontSize.xs,
      fontWeight: '800',
    },
    recipeIngredients: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.isDark ? DARK_RECIPE_CARD_BORDER : theme.colors.border,
    },
    foodRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      padding: spacing.sm,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    recipeFoodRow: {
      backgroundColor: DARK_RECIPE_INGREDIENT_ROW_BACKGROUND,
      borderColor: DARK_RECIPE_INGREDIENT_ROW_BORDER,
    },
    foodRowPressed: {
      opacity: 0.76,
      transform: [{ scale: 0.995 }],
    },
    foodIcon: {
      width: 32,
      height: 32,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    foodBody: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },
    foodHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
    },
    foodText: {
      flex: 1,
      minWidth: 0,
    },
    foodLabel: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '700',
      lineHeight: 18,
    },
    recipeFoodLabel: {
      color: DARK_RECIPE_TITLE,
    },
    foodSubtitle: {
      marginTop: 1,
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
    recipeFoodSubtitle: {
      color: DARK_RECIPE_META,
    },
    foodOriginalLabel: {
      marginTop: 1,
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 14,
    },
    recipeFoodOriginalLabel: {
      color: DARK_RECIPE_ACCENT,
    },
    swapBadge: {
      width: 30,
      height: 30,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    swapBadgeActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    portionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    portionChip: {
      minHeight: 24,
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 8,
    },
    recipePortionChip: {
      borderColor: DARK_RECIPE_INGREDIENT_CHIP_BORDER,
      backgroundColor: DARK_RECIPE_INGREDIENT_CHIP_BACKGROUND,
    },
    portionChipPressed: {
      opacity: 0.7,
    },
    portionChipText: {
      color: theme.colors.textPrimary,
      fontSize: 11,
      fontWeight: '700',
    },
    recipePortionChipText: {
      color: DARK_RECIPE_INGREDIENT_CHIP_VALUE,
    },
    tooltipOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.08)',
    },
    tooltipContent: {
      width: 160,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
    },
    tooltipLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    tooltipValue: {
      marginTop: 3,
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    tooltipArrow: {
      position: 'absolute',
      bottom: -6,
      width: 12,
      height: 12,
      backgroundColor: theme.colors.card,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      transform: [{ rotate: '45deg' }],
    },
  });
}

export default DietMealCard;
