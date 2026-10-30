import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, LoadingSpinner } from '../../src/components/common';
import { RecipeIngredientSwapModal } from '../../src/components/diet';
import { VideoPlayerModal } from '../../src/components/video/VideoPlayerModal';
import { YouTubePlayerModal } from '../../src/components/video/YouTubePlayerModal';
import {
  borderRadius,
  brandColors,
  colors,
  fontSize,
  nutritionTheme,
  spacing,
} from '../../src/constants/colors';
import {
  getClientDietRecipeInMenu,
  getDietRecipeDetail,
  swapDietStandaloneFood,
  resetDietStandaloneFoodSwap,
  getFoodsByExchangeGroup,
} from '../../src/services/diet';
import { useAuthStore } from '../../src/store/authStore';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import type {
  ApiError,
  ClientDietIngredientRow,
  ClientDietRecipeCard,
  ClientDietRecipeDetail,
  ClientFoodSwapCandidate,
} from '../../src/types';
import { parseDietRecipeMenuContext } from '../../src/utils/dietRecipeRoute';
import { getRecipeRichTextBlocks } from '../../src/utils/recipeRichText';
import { isYouTubeUrl } from '../../src/utils/exerciseTechnique';

type RecipeTab = 'description' | 'ingredients';

const tabOptions: { key: RecipeTab; label: string }[] = [
  { key: 'description', label: 'Descripción' },
  { key: 'ingredients', label: 'Ingredientes' },
];

const LIGHT_PLACEHOLDER_COLORS = ['#E8EFF7', '#D8E7F4', '#F5FBF7'] as const;
const DARK_PLACEHOLDER_COLORS = ['#23344C', '#1B2A42', '#152338'] as const;

const formatMeasureValue = (value: number | null, suffix: string) => {
  if (value === null) {
    return null;
  }

  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))} ${suffix}`;
};

const METRIC_MEASURE_PATTERN = /(^|\s)(g|gr|gramo|gramos|kg|kilo|kilos|ml|mililitro|mililitros|l|litro|litros)$/i;

// The recipe endpoint carries the description and the recipe's base quantities;
// when the screen was opened from a menu, the ingredients come from that menu.
const mergeMenuRecipe = (
  recipeDetail: ClientDietRecipeDetail,
  menuRecipe: ClientDietRecipeCard | null,
): ClientDietRecipeDetail =>
  menuRecipe
    ? {
        ...recipeDetail,
        ingredientCount: menuRecipe.ingredientCount,
        ingredients: menuRecipe.ingredients,
      }
    : recipeDetail;

const getIngredientMeasure = (ingredient: ClientDietIngredientRow) => {
  if (ingredient.portion.grams !== null) {
    return formatMeasureValue(ingredient.portion.grams, 'g');
  }

  const householdLabel = ingredient.portion.householdLabel?.trim();
  if (!householdLabel) {
    return null;
  }

  return METRIC_MEASURE_PATTERN.test(householdLabel) ? householdLabel : null;
};

const IngredientCard = ({
  ingredient,
  index,
  onPress,
}: {
  ingredient: ClientDietIngredientRow;
  index: number;
  onPress: () => void;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const measure = useMemo(() => getIngredientMeasure(ingredient), [ingredient]);
  const hasPortionData = Boolean(ingredient.portion.householdLabel || measure);
  const isSwappable = Boolean(ingredient.exchangeGroupId && ingredient.menuItemId);

  const content = (
    <>
      <View style={styles.ingredientHeader}>
        <View style={styles.ingredientIndex}>
          <Text style={styles.ingredientIndexText}>{index + 1}</Text>
        </View>
        <View style={styles.ingredientCopy}>
          <Text style={styles.ingredientLabel}>{ingredient.label}</Text>
          {ingredient.exchangeGroupName ? (
            <Text style={styles.ingredientSubtitle}>{ingredient.exchangeGroupName}</Text>
          ) : null}
          {ingredient.isClientSwap && ingredient.originalLabel ? (
            <Text style={styles.ingredientOriginalLabel}>Original: {ingredient.originalLabel}</Text>
          ) : null}
        </View>
      </View>

      {hasPortionData ? (
        <View style={styles.ingredientMetaRow}>
          <View style={styles.ingredientMetaItem}>
            <Text style={styles.ingredientMetaLabel}>Unidad casera</Text>
            <Text numberOfLines={1} style={styles.ingredientMetaValue}>
              {ingredient.portion.householdLabel || '--'}
            </Text>
          </View>
          <View style={styles.ingredientMetaItem}>
            <Text style={styles.ingredientMetaLabel}>Medida</Text>
            <Text
              numberOfLines={1}
              style={[styles.ingredientMetaValue, styles.ingredientMetaValueRight]}
            >
              {measure || '--'}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.ingredientEmptyMeta, theme.isDark ? styles.ingredientEmptyMetaDark : null]}>
          Sin porcion detallada.
        </Text>
      )}

      {isSwappable ? (
        <View style={styles.ingredientActionRow}>
          <View
            style={[
              styles.ingredientActionBadge,
              ingredient.isClientSwap ? styles.ingredientActionBadgeActive : null,
            ]}
          >
            <Ionicons
              name="swap-horizontal-outline"
              size={16}
              color={ingredient.isClientSwap ? colors.white : theme.colors.primary}
            />
          </View>
          <View style={styles.ingredientActionCopy}>
            <Text style={styles.ingredientActionTitle}>
              {ingredient.isClientSwap ? 'Cambio guardado' : 'Cambiar por equivalente'}
            </Text>
            <Text style={styles.ingredientActionText}>
              {ingredient.isClientSwap && ingredient.originalLabel
                ? `Actualmente personalizado desde ${ingredient.originalLabel}.`
                : 'Toca para elegir otro alimento del mismo grupo.'}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.ingredientUnavailableText}>
          Este ingrediente no tiene equivalentes disponibles.
        </Text>
      )}
    </>
  );

  if (isSwappable) {
    return (
      <TouchableOpacity
        style={[styles.ingredientCard, styles.ingredientCardInteractive]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.ingredientCard}>{content}</View>;
};

export default function RecipeDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { user, isInitialized } = useAuthStore();
  const { recipeId, menuId, date, mealId } = useLocalSearchParams<{
    recipeId?: string | string[];
    menuId?: string | string[];
    date?: string | string[];
    mealId?: string | string[];
  }>();
  const parsedRecipeId = useMemo(() => {
    const rawRecipeId = Array.isArray(recipeId) ? recipeId[0] : recipeId;
    const nextValue = Number.parseInt(rawRecipeId ?? '', 10);
    return Number.isFinite(nextValue) ? nextValue : null;
  }, [recipeId]);
  const menuContext = useMemo(
    () => parseDietRecipeMenuContext({ menuId, date, mealId }),
    [date, mealId, menuId],
  );
  const [activeTab, setActiveTab] = useState<RecipeTab>('description');
  const [detail, setDetail] = useState<ClientDietRecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [isSwapModalVisible, setIsSwapModalVisible] = useState(false);
  const [swapFoods, setSwapFoods] = useState<ClientFoodSwapCandidate[]>([]);
  const [swapFoodsLoading, setSwapFoodsLoading] = useState(false);
  const [swapFoodsError, setSwapFoodsError] = useState<string | null>(null);
  const [isSavingSwap, setIsSavingSwap] = useState(false);
  const [isVideoModalVisible, setIsVideoModalVisible] = useState(false);

  const videoUrl = detail?.videoUrl ?? null;
  const useYouTubePlayer = isYouTubeUrl(videoUrl);

  const selectedIngredient = useMemo(
    () => detail?.ingredients.find((ingredient) => ingredient.id === selectedIngredientId) ?? null,
    [detail?.ingredients, selectedIngredientId],
  );

  // Without a resolvable menu the screen keeps the recipe's base quantities.
  const loadMenuRecipe = useCallback(async () => {
    if (!menuContext || !user || !parsedRecipeId) {
      return null;
    }

    try {
      return await getClientDietRecipeInMenu(
        user.id,
        menuContext.menuId,
        menuContext.date,
        parsedRecipeId,
        menuContext.mealId,
      );
    } catch {
      return null;
    }
  }, [menuContext, parsedRecipeId, user]);

  const loadDetail = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!isInitialized || !user) {
        return;
      }

      if (!parsedRecipeId) {
        setError('No encontramos esta receta.');
        setIsLoading(false);
        return;
      }

      const isRefresh = options?.refresh ?? false;
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [response, menuRecipe] = await Promise.all([
          getDietRecipeDetail(parsedRecipeId),
          loadMenuRecipe(),
        ]);
        setDetail(mergeMenuRecipe(response, menuRecipe));
        setError(null);
      } catch (loadError) {
        const apiError = loadError as ApiError;
        setError(apiError.message || 'No fue posible cargar esta receta.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isInitialized, loadMenuRecipe, parsedRecipeId, user],
  );

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    if (!user) {
      return;
    }

    void loadDetail();
  }, [isInitialized, loadDetail, user]);

  useEffect(() => {
    setActiveTab('description');
  }, [detail?.recipeId]);

  const loadSwapFoods = useCallback(async (ingredient: ClientDietIngredientRow | null) => {
    if (!ingredient?.exchangeGroupId) {
      setSwapFoods([]);
      setSwapFoodsError('Este ingrediente no tiene equivalentes disponibles.');
      return;
    }

    setSwapFoodsLoading(true);
    setSwapFoodsError(null);

    try {
      const response = await getFoodsByExchangeGroup(
        ingredient.exchangeGroupId,
        ingredient.portion.equivalents,
      );
      setSwapFoods(response);
    } catch (loadError) {
      const apiError = loadError as ApiError;
      setSwapFoods([]);
      setSwapFoodsError(apiError.message || 'No fue posible cargar los equivalentes.');
    } finally {
      setSwapFoodsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSwapModalVisible || !selectedIngredient) {
      return;
    }

    void loadSwapFoods(selectedIngredient);
  }, [isSwapModalVisible, loadSwapFoods, selectedIngredient]);

  const handleOpenSwapModal = useCallback((ingredient: ClientDietIngredientRow) => {
    if (!ingredient.exchangeGroupId || !ingredient.menuItemId) {
      return;
    }

    setSelectedIngredientId(ingredient.id);
    setSwapFoods([]);
    setSwapFoodsError(null);
    setIsSwapModalVisible(true);
  }, []);

  const handleCloseSwapModal = useCallback(() => {
    if (isSavingSwap) {
      return;
    }

    setIsSwapModalVisible(false);
    setSelectedIngredientId(null);
    setSwapFoodsError(null);
  }, [isSavingSwap]);

  const handleRetrySwapFoods = useCallback(() => {
    if (!selectedIngredient) {
      return;
    }

    void loadSwapFoods(selectedIngredient);
  }, [loadSwapFoods, selectedIngredient]);

  const handleSelectSwapFood = useCallback(async (food: ClientFoodSwapCandidate) => {
    if (!menuContext || !selectedIngredient?.menuItemId) return;
    setIsSavingSwap(true);
    setSwapFoodsError(null);
    try {
      await swapDietStandaloneFood(menuContext.menuId, selectedIngredient.menuItemId, food.id, menuContext.date);
      await loadDetail({ refresh: true });
      setIsSwapModalVisible(false);
      setSelectedIngredientId(null);
    } catch (error) {
      setSwapFoodsError((error as ApiError).message || 'No fue posible guardar el cambio.');
    } finally { setIsSavingSwap(false); }
  }, [loadDetail, menuContext, selectedIngredient]);

  const handleResetSwap = useCallback(async () => {
    if (!menuContext || !selectedIngredient?.menuItemId) return;
    setIsSavingSwap(true);
    setSwapFoodsError(null);
    try {
      await resetDietStandaloneFoodSwap(menuContext.menuId, selectedIngredient.menuItemId, menuContext.date);
      await loadDetail({ refresh: true });
      setIsSwapModalVisible(false);
      setSelectedIngredientId(null);
    } catch (error) {
      setSwapFoodsError((error as ApiError).message || 'No fue posible restaurar el ingrediente original.');
    } finally { setIsSavingSwap(false); }
  }, [loadDetail, menuContext, selectedIngredient]);

  if (!isInitialized) {
    return <LoadingSpinner fullScreen text="Validando sesión..." />;
  }

  if (!user) {
    return null;
  }

  if (isLoading && !detail) {
    return <LoadingSpinner fullScreen text="Cargando receta..." />;
  }

  const descriptionBlocks = getRecipeRichTextBlocks(
    detail?.descriptionRich,
    detail?.description,
  );
  const placeholderColors = theme.isDark ? DARK_PLACEHOLDER_COLORS : LIGHT_PLACEHOLDER_COLORS;
  const recipeCountLabel = detail
    ? `${detail.ingredientCount} ingrediente${detail.ingredientCount === 1 ? '' : 's'}`
    : 'Consulta descripción e ingredientes';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Receta</Text>
          <Text style={styles.title}>{detail?.title || 'Detalle de receta'}</Text>
          <Text style={styles.subtitle}>{recipeCountLabel}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadDetail({ refresh: true })}
            tintColor={theme.colors.primary}
          />
        }
      >
        {detail?.imageUrl ? (
          <Image source={{ uri: detail.imageUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={placeholderColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroPlaceholder}
          >
            <Ionicons
              name="restaurant-outline"
              size={34}
              color={theme.isDark ? brandColors.sky : nutritionTheme.accentStrong}
            />
            <Text style={styles.heroPlaceholderText}>Sin imagen disponible</Text>
          </LinearGradient>
        )}

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="layers-outline" size={15} color={theme.colors.primary} />
            <Text style={styles.metaChipText}>{recipeCountLabel}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="document-text-outline" size={15} color={theme.colors.primary} />
            <Text style={styles.metaChipText}>Detalle completo</Text>
          </View>
        </View>

        <View style={styles.tabsRow}>
          {tabOptions.map((tab) => {
            const isActive = tab.key === activeTab;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
                activeOpacity={0.85}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>No fue posible cargar la receta</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Reintentar" onPress={() => void loadDetail()} />
          </Card>
        ) : null}

        {!error && activeTab === 'description' ? (
          <Card style={styles.contentCard}>
            <Text style={styles.sectionTitle}>Preparacion</Text>
            {videoUrl ? (
              <TouchableOpacity
                style={styles.videoButton}
                activeOpacity={0.85}
                onPress={() => setIsVideoModalVisible(true)}
              >
                <Ionicons name="play-circle-outline" size={22} color="#FFFFFF" />
                <Text style={styles.videoButtonText}>Ver video de preparación</Text>
              </TouchableOpacity>
            ) : null}
            {descriptionBlocks.length > 0 ? (
              <View style={styles.descriptionContent}>
                {descriptionBlocks.map((block, blockIndex) => {
                  switch (block.type) {
                    case 'heading':
                      return (
                        <Text key={`heading-${blockIndex}`} style={styles.descriptionHeading}>
                          {block.text}
                        </Text>
                      );
                    case 'bulletList':
                    case 'orderedList':
                      return (
                        <View key={`list-${blockIndex}`} style={styles.descriptionList}>
                          {block.items.map((item, itemIndex) => (
                            <View key={`list-${blockIndex}-${itemIndex}`} style={styles.descriptionListItem}>
                              <Text style={styles.descriptionListMarker}>
                                {block.type === 'orderedList' ? `${itemIndex + 1}.` : '\u2022'}
                              </Text>
                              <Text style={styles.descriptionListText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    case 'paragraph':
                    default:
                      return (
                        <Text key={`paragraph-${blockIndex}`} style={styles.descriptionText}>
                          {block.text}
                        </Text>
                      );
                  }
                })}
              </View>
            ) : (
              <Text style={styles.descriptionText}>
                Esta receta no tiene descripción disponible.
              </Text>
            )}
          </Card>
        ) : null}

        {!error && activeTab === 'ingredients' ? (
          <View style={styles.ingredientsSection}>
            {detail?.ingredients.length ? (
              detail.ingredients.map((ingredient, index) => (
                <IngredientCard
                  key={ingredient.id}
                  ingredient={ingredient}
                  index={index}
                  onPress={() => handleOpenSwapModal(ingredient)}
                />
              ))
            ) : (
              <Card style={styles.contentCard}>
                <Text style={styles.emptyTitle}>Sin ingredientes visibles</Text>
                <Text style={styles.emptyText}>
                  Esta receta no trae ingredientes detallados para mostrar aquí.
                </Text>
              </Card>
            )}
          </View>
        ) : null}
      </ScrollView>

      <RecipeIngredientSwapModal
        visible={isSwapModalVisible}
        ingredient={selectedIngredient}
        foods={swapFoods}
        isLoading={swapFoodsLoading}
        isSaving={isSavingSwap}
        error={swapFoodsError}
        onClose={handleCloseSwapModal}
        onRetry={handleRetrySwapFoods}
        onSelectFood={handleSelectSwapFood}
        onReset={handleResetSwap}
      />

      {videoUrl && !useYouTubePlayer ? (
        <VideoPlayerModal
          visible={isVideoModalVisible}
          videoUri={videoUrl}
          exerciseName={detail?.title ?? 'Receta'}
          onClose={() => setIsVideoModalVisible(false)}
        />
      ) : null}

      {videoUrl && useYouTubePlayer ? (
        <YouTubePlayerModal
          visible={isVideoModalVisible}
          exerciseName={detail?.title ?? 'Receta'}
          youtubeUrl={videoUrl}
          onClose={() => setIsVideoModalVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerCopy: {
      flex: 1,
    },
    eyebrow: {
      color: theme.isDark ? brandColors.sky : nutritionTheme.accentStrong,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    title: {
      marginTop: spacing.xs,
      color: theme.colors.textPrimary,
      fontSize: fontSize['2xl'],
      fontWeight: '800',
    },
    subtitle: {
      marginTop: spacing.xs,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl + spacing.lg,
      gap: spacing.md,
    },
    heroImage: {
      width: '100%',
      height: 232,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surfaceAlt,
    },
    heroPlaceholder: {
      width: '100%',
      height: 232,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderStrong : nutritionTheme.accentBorder,
    },
    heroPlaceholderText: {
      color: theme.isDark ? theme.colors.textSecondary : nutritionTheme.accentStrong,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    metaChipText: {
      color: theme.colors.primary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    tabsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surfaceAlt,
      padding: spacing.xs,
    },
    tabButton: {
      flex: 1,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabButtonActive: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabLabel: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    tabLabelActive: {
      color: theme.colors.textPrimary,
    },
    contentCard: {
      gap: spacing.md,
      backgroundColor: theme.colors.surface,
    },
    videoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: theme.colors.primary,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    videoButtonText: {
      color: '#FFFFFF',
      fontSize: fontSize.base,
      fontWeight: '700',
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
    },
    descriptionContent: {
      gap: spacing.sm,
    },
    descriptionHeading: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
      lineHeight: 24,
    },
    descriptionText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.base,
      lineHeight: 24,
    },
    descriptionList: {
      gap: spacing.sm,
    },
    descriptionListItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    descriptionListMarker: {
      width: 18,
      color: theme.colors.primary,
      fontSize: fontSize.base,
      fontWeight: '800',
      lineHeight: 24,
    },
    descriptionListText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: fontSize.base,
      lineHeight: 24,
    },
    ingredientsSection: {
      gap: spacing.md,
    },
    ingredientCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: spacing.md,
      gap: spacing.md,
    },
    ingredientCardInteractive: {
      borderColor: theme.colors.primaryBorder,
    },
    ingredientHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    ingredientIndex: {
      width: 30,
      height: 30,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    ingredientIndexText: {
      color: theme.colors.primary,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    ingredientCopy: {
      flex: 1,
    },
    ingredientLabel: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '700',
    },
    ingredientSubtitle: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
    },
    ingredientOriginalLabel: {
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '600',
    },
    ingredientMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    ingredientMetaItem: {
      flex: 1,
      minWidth: 132,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    ingredientMetaLabel: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    ingredientMetaValue: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '700',
      flexShrink: 1,
      marginLeft: spacing.sm,
    },
    ingredientMetaValueRight: {
      textAlign: 'right',
    },
    ingredientEmptyMeta: {
      color: colors.gray[500],
      fontSize: fontSize.sm,
    },
    ingredientEmptyMetaDark: {
      color: theme.colors.textMuted,
    },
    ingredientActionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
      padding: spacing.sm,
    },
    ingredientActionBadge: {
      width: 30,
      height: 30,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    ingredientActionBadgeActive: {
      backgroundColor: theme.colors.primary,
    },
    ingredientActionCopy: {
      flex: 1,
      gap: 2,
    },
    ingredientActionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    ingredientActionText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    ingredientUnavailableText: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    errorCard: {
      gap: spacing.md,
      borderColor: theme.colors.error,
    },
    errorTitle: {
      color: theme.colors.error,
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    errorText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    emptyText: {
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
  });
