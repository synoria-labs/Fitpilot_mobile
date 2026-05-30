import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
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
import { ExchangeGroupIcon } from './ExchangeGroupIcon';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

interface DietMealCardProps {
  meal: ClientDietMeal;
  onRecipeIngredientPress?: (recipe: ClientDietRecipeCard, ingredient: ClientDietIngredientRow) => void;
  onStandaloneFoodPress?: (food: ClientDietFoodRow) => void;
  onRecipePress?: (recipe: ClientDietRecipeCard) => void;
}

type DietMealCardStyles = ReturnType<typeof createStyles>;
type IngredientAccent = 'recipe' | 'food';

const LIGHT_RECIPE_PLACEHOLDER_COLORS = ['#E8EFF7', '#D8E7F4', '#C5DCF0'] as const;
const DARK_RECIPE_PLACEHOLDER_COLORS = ['#23344C', '#1B2A42', '#152338'] as const;
const DARK_RECIPE_CARD_BACKGROUND = '#192841';
const DARK_RECIPE_CARD_BORDER = 'rgba(103, 182, 223, 0.30)';
const DARK_RECIPE_BADGE_BACKGROUND = '#58D6CF';
const DARK_RECIPE_BADGE_TEXT = '#0F4F58';
const DARK_RECIPE_TITLE = '#F8FAFC';
const DARK_RECIPE_META = '#8FA2BC';
const DARK_RECIPE_SUBTITLE = '#B8C7D9';
const DARK_RECIPE_TOGGLE_BACKGROUND = 'rgba(12, 22, 38, 0.28)';
const DARK_RECIPE_TOGGLE_ACCENT = '#4FD1C5';
const DARK_RECIPE_INGREDIENT_ROW_BACKGROUND = 'rgba(255,255,255,0.04)';
const DARK_RECIPE_INGREDIENT_ROW_BORDER = 'rgba(103, 182, 223, 0.18)';
const DARK_RECIPE_INGREDIENT_CHIP_BACKGROUND = 'rgba(255,255,255,0.06)';
const DARK_RECIPE_INGREDIENT_CHIP_BORDER = 'rgba(103, 182, 223, 0.14)';
const DARK_RECIPE_INGREDIENT_CHIP_LABEL = '#8FA2BC';
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
  theme: AppTheme;
}> = ({
  label,
  value,
  isDarkRecipe,
  styles,
  theme,
}) => {
  const chipRef = useRef<View>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

  if (!value || value === '--') return null;

  const handlePress = () => {
    chipRef.current?.measureInWindow((x, y, width, height) => {
      setPosition({ x, y, width, height });
      setTooltipVisible(true);
    });
  };

  return (
    <>
      <View ref={chipRef} collapsable={false}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.portionChip,
            isDarkRecipe ? styles.recipePortionChip : null,
            pressed && styles.portionChipPressed,
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
                  top: position.y - 72,
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
          theme={theme}
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
  const isSwappableIngredient = (
    Boolean(onPress) &&
    Boolean(ingredient.exchangeGroupId && (ingredient.recipeIngredientId || ingredient.menuItemId))
  );

  const content = (
    <>
      <View style={[styles.foodIcon, { backgroundColor: foodGroupVisual.backgroundColor }]}>
        <ExchangeGroupIcon
          groupName={ingredient.exchangeGroupName}
          size={18}
          strokeWidth={2}
          withContainer={false}
        />
      </View>

      <View style={styles.foodBody}>
        <View style={styles.foodHeader}>
          <View style={styles.foodText}>
            <Text style={[styles.foodLabel, isDarkRecipe ? styles.recipeFoodLabel : null]}>
              {ingredient.label}
            </Text>
            {ingredient.exchangeGroupName ? (
              <Text style={[styles.foodSubtitle, isDarkRecipe ? styles.recipeFoodSubtitle : null]}>
                {ingredient.exchangeGroupName}
              </Text>
            ) : null}
            {ingredient.isClientSwap && ingredient.originalLabel ? (
              <Text style={[styles.foodOriginalLabel, isDarkRecipe ? styles.recipeFoodOriginalLabel : null]}>
                Original: {ingredient.originalLabel}
              </Text>
            ) : null}
          </View>

          {isSwappableIngredient ? (
            <View
              style={[
                styles.recipeSwapBadge,
                ingredient.isClientSwap ? styles.recipeSwapBadgeActive : null,
              ]}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={15}
                color={ingredient.isClientSwap ? colors.white : (isDarkRecipe ? DARK_RECIPE_TOGGLE_ACCENT : theme.colors.primary)}
              />
            </View>
          ) : null}
        </View>

        <PortionChips ingredient={ingredient} accent={accent} styles={styles} theme={theme} />

        {isSwappableIngredient ? (
          <View style={styles.recipeSwapHintRow}>
            <Ionicons
              name="sparkles-outline"
              size={14}
              color={isDarkRecipe ? DARK_RECIPE_TOGGLE_ACCENT : theme.colors.primary}
            />
            <Text style={[styles.recipeSwapHintText, isDarkRecipe ? styles.recipeSwapHintTextDark : null]}>
              {ingredient.isClientSwap
                ? 'Personalizado. Toca para cambiarlo de nuevo.'
                : 'Toca para cambiar por un equivalente.'}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const containerStyle = [
    styles.foodRow,
    isDarkRecipe ? styles.recipeFoodRow : null,
    accent === 'food' ? { borderColor } : null,
    isSwappableIngredient ? styles.recipeFoodRowInteractive : null,
  ];

  if (isSwappableIngredient && onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Cambiar ${accent === 'recipe' ? 'ingrediente' : 'alimento'} ${ingredient.label}`}
        style={({ pressed }) => [
          ...containerStyle,
          pressed ? styles.recipeFoodRowPressed : null,
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
  icon: React.ComponentProps<typeof Ionicons>['name'];
  styles: DietMealCardStyles;
  theme: AppTheme;
}> = ({
  title,
  count,
  icon,
  styles,
  theme,
}) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIcon}>
        <Ionicons
          name={icon}
          size={15}
          color={theme.isDark ? theme.colors.primary : brandColors.navy}
        />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
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
  const placeholderColors = theme.isDark ? DARK_RECIPE_PLACEHOLDER_COLORS : LIGHT_RECIPE_PLACEHOLDER_COLORS;
  const toggleIconColor = theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : brandColors.navy;

  return (
    <View style={styles.recipeCard}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Abrir receta ${recipe.title}`}
        style={({ pressed }) => [pressed ? styles.recipeCardPressed : null]}
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
            <Ionicons name="restaurant-outline" size={28} color={toggleIconColor} />
          </LinearGradient>
        )}

        <View style={styles.recipeContent}>
          <View style={styles.recipeTopRow}>
            <View style={styles.recipeBadge}>
              <Text style={styles.recipeBadgeText}>Receta</Text>
            </View>
            <Text style={styles.recipeCount}>
              {recipe.ingredientCount} ingrediente{recipe.ingredientCount === 1 ? '' : 's'}
            </Text>
          </View>

          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          <Text style={styles.recipeSubtitle}>
            Ingredientes y porciones de esta preparacion dentro de tu plan.
          </Text>

          <View style={styles.recipeOpenRow}>
            <Text style={styles.recipeOpenText}>Abrir receta completa</Text>
            <Ionicons
              name="arrow-forward-outline"
              size={18}
              color={theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : brandColors.navy}
            />
          </View>
        </View>
      </Pressable>

      <View style={styles.recipeActions}>
        <Pressable
          style={styles.recipeToggle}
          onPress={onToggle}
        >
          <Text style={styles.recipeToggleText}>
            {expanded ? 'Ocultar ingredientes' : 'Ver ingredientes'}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={toggleIconColor}
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
    </View>
  );
};

export const DietMealCard: React.FC<DietMealCardProps> = ({
  meal,
  onRecipeIngredientPress,
  onStandaloneFoodPress,
  onRecipePress,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const caloriesLabel = formatCalories(meal.totalCalories);
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Record<string, boolean>>({});

  const recipeKey = useMemo(
    () => meal.recipes.map((recipe) => recipe.id).join('|'),
    [meal.recipes],
  );

  useEffect(() => {
    setExpandedRecipeIds({});
  }, [meal.id, meal.totalEntries, recipeKey]);

  const toggleRecipe = (recipeId: string) => {
    setExpandedRecipeIds((currentState) => ({
      ...currentState,
      [recipeId]: !currentState[recipeId],
    }));
  };

  const handleRecipePress = (recipe: ClientDietRecipeCard) => {
    if (onRecipePress) {
      onRecipePress(recipe);
      return;
    }

    router.push({
      pathname: '/recipes/[recipeId]',
      params: {
        recipeId: String(recipe.recipeId),
      },
    });
  };

  return (
    <Card style={styles.card} padding="none">
      <View style={styles.header}>
        <View>
          <Text style={styles.mealName}>{meal.name}</Text>
          <Text style={styles.mealCount}>
            {meal.totalEntries} {meal.totalEntries === 1 ? 'item' : 'items'}
          </Text>
        </View>
        {caloriesLabel ? (
          <View style={styles.calorieBadge}>
            <Text style={styles.calorieBadgeText}>{caloriesLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        {meal.recipes.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionHeader
              title="Recetas"
              count={meal.recipes.length}
              icon="restaurant-outline"
              styles={styles}
              theme={theme}
            />
            <View style={styles.sectionStack}>
              {meal.recipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onPress={() => handleRecipePress(recipe)}
                  expanded={Boolean(expandedRecipeIds[recipe.id])}
                  onToggle={() => toggleRecipe(recipe.id)}
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
            <SectionHeader
              title="Alimentos sueltos"
              count={meal.standaloneFoods.length}
              icon="nutrition-outline"
              styles={styles}
              theme={theme}
            />
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
    </Card>
  );
};

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    mealName: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.xl,
      fontWeight: '800',
    },
    mealCount: {
      marginTop: spacing.xs,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
    },
    calorieBadge: {
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      backgroundColor: theme.isDark ? theme.colors.primarySoft : `${brandColors.sky}25`,
    },
    calorieBadgeText: {
      color: theme.isDark ? theme.colors.primary : brandColors.navy,
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    sectionBlock: {
      gap: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sectionIcon: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? theme.colors.primarySoft : `${brandColors.sky}20`,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    sectionCount: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    sectionStack: {
      gap: spacing.md,
    },
    recipeCard: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.isDark ? DARK_RECIPE_CARD_BACKGROUND : '#F5F8FC',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.isDark ? DARK_RECIPE_CARD_BORDER : '#DDE8F2',
    },
    recipeCardPressed: {
      opacity: 0.94,
    },
    recipeImage: {
      width: '100%',
      height: 152,
    },
    recipePlaceholder: {
      width: '100%',
      height: 152,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recipeContent: {
      padding: spacing.md,
    },
    recipeActions: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    recipeTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    recipeBadge: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      backgroundColor: theme.isDark ? DARK_RECIPE_BADGE_BACKGROUND : brandColors.navy,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    recipeBadgeText: {
      color: theme.isDark ? DARK_RECIPE_BADGE_TEXT : colors.white,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    recipeCount: {
      color: theme.isDark ? DARK_RECIPE_META : theme.colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    recipeTitle: {
      marginTop: spacing.md,
      color: theme.isDark ? DARK_RECIPE_TITLE : colors.gray[900],
      fontSize: fontSize.lg,
      fontWeight: '800',
    },
    recipeSubtitle: {
      marginTop: spacing.xs,
      color: theme.isDark ? DARK_RECIPE_SUBTITLE : theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    recipeOpenRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.isDark ? DARK_RECIPE_CARD_BORDER : '#D8E7F4',
      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : colors.white,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    recipeOpenText: {
      color: theme.isDark ? DARK_RECIPE_TITLE : brandColors.navy,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    recipeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : '#D8E7F4',
      backgroundColor: theme.isDark ? DARK_RECIPE_TOGGLE_BACKGROUND : colors.white,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    recipeToggleText: {
      color: theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : brandColors.navy,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    recipeIngredients: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    foodRow: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.isDark ? theme.colors.surfaceAlt : '#FAFBFD',
      borderWidth: 1,
    },
    recipeFoodRow: {
      backgroundColor: theme.isDark ? DARK_RECIPE_INGREDIENT_ROW_BACKGROUND : '#FAFBFD',
      borderColor: theme.isDark ? DARK_RECIPE_INGREDIENT_ROW_BORDER : '#D8E7F4',
    },
    recipeFoodRowInteractive: {
      borderColor: theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : theme.colors.primaryBorder,
    },
    recipeFoodRowPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.995 }],
    },
    foodIcon: {
      width: 42,
      height: 42,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    foodBody: {
      flex: 1,
    },
    foodHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    foodText: {
      flex: 1,
    },
    foodLabel: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '700',
    },
    recipeFoodLabel: {
      color: DARK_RECIPE_TITLE,
    },
    foodSubtitle: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
    },
    recipeFoodSubtitle: {
      color: DARK_RECIPE_SUBTITLE,
    },
    foodOriginalLabel: {
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '600',
    },
    recipeFoodOriginalLabel: {
      color: DARK_RECIPE_INGREDIENT_CHIP_VALUE,
    },
    recipeSwapBadge: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDarkRecipeColor(theme),
      backgroundColor: theme.isDark ? 'rgba(79, 209, 197, 0.12)' : theme.colors.primarySoft,
      marginLeft: spacing.sm,
    },
    recipeSwapBadgeActive: {
      borderColor: 'transparent',
      backgroundColor: theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : theme.colors.primary,
    },
    portionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    portionInfoItem: {
      flex: 1,
      minWidth: 132,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.md,
      backgroundColor: theme.isDark ? theme.colors.surface : colors.white,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.border : '#E5EDF5',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    recipePortionInfoItem: {
      backgroundColor: DARK_RECIPE_INGREDIENT_CHIP_BACKGROUND,
      borderColor: DARK_RECIPE_INGREDIENT_CHIP_BORDER,
    },
    portionInfoLabel: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    recipePortionInfoLabel: {
      color: DARK_RECIPE_INGREDIENT_CHIP_LABEL,
    },
    portionInfoValue: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '700',
      flexShrink: 1,
      marginLeft: spacing.sm,
    },
    portionInfoValueRight: {
      textAlign: 'right',
    },
    recipePortionInfoValue: {
      color: DARK_RECIPE_INGREDIENT_CHIP_VALUE,
    },
    portionChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.isDark ? theme.colors.surfaceAlt : colors.white,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.border : '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    recipePortionChip: {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderColor: 'rgba(103, 182, 223, 0.2)',
    },
    portionChipPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.96 }],
    },
    portionChipText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    recipePortionChipText: {
      color: DARK_RECIPE_INGREDIENT_CHIP_VALUE,
    },
    tooltipOverlay: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    tooltipContent: {
      backgroundColor: theme.isDark ? '#1E293B' : '#FFFFFF',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 8,
      minWidth: 160,
      maxWidth: 240,
    },
    tooltipLabel: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      color: theme.isDark ? '#94A3B8' : '#64748B',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    tooltipValue: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    tooltipArrow: {
      position: 'absolute',
      bottom: -6,
      left: '50%',
      marginLeft: -6,
      width: 12,
      height: 12,
      backgroundColor: theme.isDark ? '#1E293B' : '#FFFFFF',
      transform: [{ rotate: '45deg' }],
      zIndex: -1,
    },
    recipeSwapHintRow: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    recipeSwapHintText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: fontSize.xs,
      fontWeight: '600',
    },
    recipeSwapHintTextDark: {
      color: DARK_RECIPE_SUBTITLE,
    },
  });
}

const isDarkRecipeColor = (theme: AppTheme) =>
  theme.isDark ? DARK_RECIPE_TOGGLE_ACCENT : theme.colors.primaryBorder;

export default DietMealCard;
