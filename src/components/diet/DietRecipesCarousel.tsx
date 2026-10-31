import React, { useId, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { MEAL_LOOKS } from './DietMealTimeline';
import { DishContactShadow, RecipeDish } from './RecipeDish';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { ClientDietRecipeCard } from '../../types';
import type { DietMealKind } from '../../utils/dietMealVisuals';
import { getRecipeCutoutUri } from '../../utils/recipeImage';

export type DietRecipeEntry = {
  recipe: ClientDietRecipeCard;
  mealId: string;
  mealName: string;
  mealKind: DietMealKind;
};

type DietRecipesCarouselProps = {
  entries: DietRecipeEntry[];
  horizontalPadding: number;
  onOpenRecipe: (entry: DietRecipeEntry) => void;
};

const CARD_WIDTH = 196;
const COVER_HEIGHT = 104;
// A dish photo without background stands whole on a stage inset in the card, and rises over the
// card's top edge; the row keeps room above the cards for it.
const STAGE_INSET = 6;
const STAGE_WIDTH = CARD_WIDTH - 2 - STAGE_INSET * 2;
const STAGE_HEIGHT = COVER_HEIGHT - STAGE_INSET;
const DISH_SIZE = 110;
const DISH_TOP = STAGE_HEIGHT - 8 - DISH_SIZE;
const CONTACT_WIDTH = 124;
const CONTACT_HEIGHT = 20;

/** The day's recipes as covers to swipe through; each opens with this menu's portions. */
export const DietRecipesCarousel = ({ entries, horizontalPadding, onOpenRecipe }: DietRecipesCarouselProps) => {
  const aurora = useAurora();

  if (!entries.length) {
    return null;
  }

  const hasDishes = entries.some((entry) => getRecipeCutoutUri(entry.recipe.imageUrl));

  return (
    <View>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding + 4 }]}>
        <Text style={[auroraType.title, { color: aurora.text }]}>Recetas de tu plan</Text>
        <Text style={[auroraType.caption, { color: aurora.faint }]}>
          {entries.length} {entries.length === 1 ? 'receta' : 'recetas'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        contentContainerStyle={[
          styles.row,
          hasDishes ? styles.rowWithDishes : null,
          { paddingHorizontal: horizontalPadding },
        ]}
      >
        {entries.map((entry) => (
          <RecipeCard key={`${entry.mealId}-${entry.recipe.id}`} entry={entry} onPress={() => onOpenRecipe(entry)} />
        ))}
      </ScrollView>
    </View>
  );
};

const RecipeCard = ({ entry, onPress }: { entry: DietRecipeEntry; onPress: () => void }) => {
  const aurora = useAurora();
  const look = MEAL_LOOKS[entry.mealKind];
  const [dishFailed, setDishFailed] = useState(false);
  const cutoutUri = getRecipeCutoutUri(entry.recipe.imageUrl);
  const dishUri = dishFailed ? null : cutoutUri;
  const count = entry.recipe.ingredientCount;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir la receta ${entry.recipe.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        dishUri ? null : styles.cardClipped,
        {
          backgroundColor: aurora.surface,
          borderColor: aurora.border,
          boxShadow: aurora.shadow,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {dishUri ? (
        <View style={[styles.stage, { backgroundColor: aurora.surface2 }]}>
          <StageGlow color={look.colors[1]} />
          <DishContactShadow width={CONTACT_WIDTH} height={CONTACT_HEIGHT} style={styles.contactShadow} />
          <RecipeDish uri={dishUri} size={DISH_SIZE} style={styles.dish} onError={() => setDishFailed(true)} />
        </View>
      ) : entry.recipe.imageUrl && !cutoutUri ? (
        <Image source={{ uri: entry.recipe.imageUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
          <Ionicons name="restaurant-outline" size={30} color={look.ink} />
        </LinearGradient>
      )}
      <View style={styles.body}>
        <Text style={[styles.name, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={2}>
          {entry.recipe.title}
        </Text>
        <Text style={[styles.meta, auroraFont('semibold'), { color: aurora.faint }]} numberOfLines={1}>
          {entry.mealName} · {count} {count === 1 ? 'ingrediente' : 'ingredientes'}
        </Text>
      </View>
    </Pressable>
  );
};

/** The meal's colour rising from the bottom of the stage. */
const StageGlow = ({ color }: { color: string }) => {
  const aurora = useAurora();
  const id = toSvgId(useId());

  return (
    <Svg pointerEvents="none" width={STAGE_WIDTH} height={STAGE_HEIGHT} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="115%" r="90%">
          <Stop offset="0" stopColor={color} stopOpacity={aurora.isDark ? 0.38 : 0.32} />
          <Stop offset="0.72" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} rx={17} fill={`url(#${id})`} />
    </Svg>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  row: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  rowWithDishes: {
    paddingTop: 8 - DISH_TOP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 22,
    borderWidth: 1,
  },
  cardClipped: {
    overflow: 'hidden',
  },
  cover: {
    height: COVER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    height: STAGE_HEIGHT,
    marginTop: STAGE_INSET,
    marginHorizontal: STAGE_INSET,
    borderRadius: 17,
  },
  contactShadow: {
    position: 'absolute',
    left: (STAGE_WIDTH - CONTACT_WIDTH) / 2,
    top: STAGE_HEIGHT - 9 - CONTACT_HEIGHT,
  },
  dish: {
    position: 'absolute',
    left: (STAGE_WIDTH - DISH_SIZE) / 2,
    top: DISH_TOP,
  },
  body: {
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
  },
});
