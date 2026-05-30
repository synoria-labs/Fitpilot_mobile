import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '../common';
import { borderRadius, colors, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { ClientDietMenu, ClientDietRecipeCard } from '../../types';
import { DietMealCard } from './DietMealCard';

type DietMenuPreviewMode = 'confirm' | 'readonly';

interface DietMenuPreviewModalProps {
  visible: boolean;
  menu: ClientDietMenu | null;
  dateLabel?: string;
  mode: DietMenuPreviewMode;
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

const formatCalories = (value: number | null) =>
  value === null || !Number.isFinite(value) ? '--' : String(Math.round(value));

export const DietMenuPreviewModal: React.FC<DietMenuPreviewModalProps> = ({
  visible,
  menu,
  dateLabel,
  mode,
  isConfirming = false,
  onClose,
  onConfirm,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const availableHeight = Math.max(320, height - spacing.lg);
  const sheetHeight = Math.min(Math.max(height * 0.9, 420), availableHeight);
  const canConfirm = mode === 'confirm' && Boolean(onConfirm) && Boolean(menu);

  const handleRecipePress = (recipe: ClientDietRecipeCard) => {
    onClose();
    router.push({
      pathname: '/recipes/[recipeId]',
      params: {
        recipeId: String(recipe.recipeId),
      },
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { height: sheetHeight }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Previsualizacion del menu</Text>
              {dateLabel ? <Text style={styles.subtitle}>{dateLabel}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              disabled={isConfirming}
              accessibilityRole="button"
              accessibilityLabel="Cerrar previsualizacion"
            >
              <Ionicons name="close-outline" size={24} color={theme.colors.icon} />
            </TouchableOpacity>
          </View>

          {menu ? (
            <>
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.menuSummary}>
                  <Text style={styles.menuTitle}>{menu.title}</Text>
                  {menu.description ? (
                    <Text style={styles.menuDescription}>{menu.description}</Text>
                  ) : null}

                  <View style={styles.statGrid}>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{menu.totalMeals}</Text>
                      <Text style={styles.statLabel}>Comidas</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{menu.totalRecipes}</Text>
                      <Text style={styles.statLabel}>Recetas</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{menu.totalItems}</Text>
                      <Text style={styles.statLabel}>Items</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>
                        {formatCalories(menu.totalCalories)}
                      </Text>
                      <Text style={styles.statLabel}>Kcal</Text>
                    </View>
                  </View>
                </View>

                {menu.meals.length > 0 ? (
                  <View style={styles.mealStack}>
                    {menu.meals.map((meal) => (
                      <DietMealCard
                        key={meal.id}
                        meal={meal}
                        onRecipePress={handleRecipePress}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="restaurant-outline"
                      size={32}
                      color={theme.colors.iconMuted}
                    />
                    <Text style={styles.emptyTitle}>Sin comidas para mostrar</Text>
                    <Text style={styles.emptyText}>
                      Este menu no trae recetas ni alimentos detallados.
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.footer}>
                {mode === 'confirm' ? (
                  <>
                    <Button
                      title="Cancelar"
                      variant="secondary"
                      onPress={onClose}
                      disabled={isConfirming}
                      fullWidth
                      style={styles.footerButton}
                    />
                    <Button
                      title="Confirmar menu"
                      onPress={() => onConfirm?.()}
                      isLoading={isConfirming}
                      disabled={!canConfirm || isConfirming}
                      fullWidth
                      style={styles.footerButton}
                    />
                  </>
                ) : (
                  <Button
                    title="Cerrar"
                    variant="secondary"
                    onPress={onClose}
                    fullWidth
                  />
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="alert-circle-outline"
                size={34}
                color={theme.colors.iconMuted}
              />
              <Text style={styles.emptyTitle}>Menu no disponible</Text>
              <Text style={styles.emptyText}>
                No pudimos cargar el detalle de este menu.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    container: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.xl,
      fontWeight: '800',
    },
    subtitle: {
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.base,
      fontWeight: '600',
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },
    menuSummary: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    menuTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
    },
    menuDescription: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statChip: {
      minWidth: 104,
      flex: 1,
      gap: 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.isDark ? theme.colors.surfaceAlt : colors.gray[50],
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    mealStack: {
      gap: spacing.lg,
    },
    emptyState: {
      flex: 1,
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xl,
    },
    emptyTitle: {
      marginTop: spacing.md,
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      marginTop: spacing.sm,
      color: theme.colors.textMuted,
      fontSize: fontSize.base,
      lineHeight: 22,
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    footerButton: {
      flex: 1,
    },
  });

export default DietMenuPreviewModal;
