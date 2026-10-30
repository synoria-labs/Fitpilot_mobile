import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MEAL_LOOKS } from './DietMealTimeline';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { ClientDietRecipeCard } from '../../types';
import type { DietMealKind } from '../../utils/dietMealVisuals';

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

/** The day's recipes as covers to swipe through; each opens with this menu's portions. */
export const DietRecipesCarousel = ({ entries, horizontalPadding, onOpenRecipe }: DietRecipesCarouselProps) => {
  const aurora = useAurora();

  if (!entries.length) {
    return null;
  }

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
        contentContainerStyle={[styles.row, { paddingHorizontal: horizontalPadding }]}
      >
        {entries.map((entry) => {
          const look = MEAL_LOOKS[entry.mealKind];
          const count = entry.recipe.ingredientCount;

          return (
            <Pressable
              key={`${entry.mealId}-${entry.recipe.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Abrir la receta ${entry.recipe.title}`}
              onPress={() => onOpenRecipe(entry)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: aurora.surface,
                  borderColor: aurora.border,
                  boxShadow: aurora.shadow,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              {entry.recipe.imageUrl ? (
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
        })}
      </ScrollView>
    </View>
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
  card: {
    width: CARD_WIDTH,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cover: {
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
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
