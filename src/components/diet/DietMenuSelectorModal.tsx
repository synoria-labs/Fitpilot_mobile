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
import { Button, LoadingSpinner } from '../common';
import { borderRadius, brandColors, colors, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { ClientDietMenu } from '../../types';

interface DietMenuSelectorModalProps {
  visible: boolean;
  dateLabel: string;
  menus: ClientDietMenu[];
  getMenuLabel: (menu: ClientDietMenu, index: number) => string;
  visibleMenuId: number | null;
  persistedMenuId: number | null;
  suggestedMenuId: number | null;
  previewMenuId: number | null;
  isLoading: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry?: () => void;
  onSelect: (menu: ClientDietMenu) => void;
}

export const DietMenuSelectorModal: React.FC<DietMenuSelectorModalProps> = ({
  visible,
  dateLabel,
  menus,
  getMenuLabel,
  visibleMenuId,
  persistedMenuId,
  suggestedMenuId,
  previewMenuId,
  isLoading,
  error = null,
  onClose,
  onRetry,
  onSelect,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const availableHeight = Math.max(240, height - spacing.lg);
  const sheetHeight = Math.min(Math.max(height * 0.82, 320), availableHeight);

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
              <Text style={styles.title}>Menus del pool</Text>
              <Text style={styles.subtitle}>{dateLabel}</Text>
              <Text style={styles.supportingText}>
                Toca un menu para ver sus recetas y alimentos antes de confirmar.
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close-outline" size={24} color={theme.colors.icon} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingState}>
              <LoadingSpinner text="Cargando menus..." />
            </View>
          ) : error && menus.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={36} color={theme.colors.iconMuted} />
              <Text style={styles.emptyTitle}>No pudimos cargar el pool</Text>
              <Text style={styles.emptyText}>{error}</Text>
              {onRetry ? (
                <Button
                  title="Reintentar"
                  onPress={onRetry}
                  variant="primary"
                  style={styles.retryButton}
                />
              ) : null}
            </View>
          ) : menus.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={36} color={theme.colors.iconMuted} />
              <Text style={styles.emptyTitle}>Sin menus disponibles</Text>
              <Text style={styles.emptyText}>
                Esta fecha no tiene menus visibles para mostrar.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {menus.map((menu, index) => {
                const isVisible = menu.menuId === visibleMenuId;
                const isPersisted = menu.menuId === persistedMenuId;
                const isSuggested = menu.menuId === suggestedMenuId;
                const isPreview = menu.menuId === previewMenuId;

                return (
                  <TouchableOpacity
                    key={menu.id}
                    style={[styles.optionCard, isVisible && styles.optionCardSelected]}
                    onPress={() => onSelect(menu)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.optionHeader}>
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>{getMenuLabel(menu, index)}</Text>
                        <Text style={styles.optionSubtitle} numberOfLines={2}>
                          {menu.description || 'Sin descripcion adicional.'}
                        </Text>
                      </View>
                      <View style={[styles.checkCircle, isVisible && styles.checkCircleSelected]}>
                        <Ionicons
                          name={isVisible ? 'checkmark' : 'ellipse-outline'}
                          size={18}
                          color={isVisible ? (theme.isDark ? theme.colors.background : colors.white) : theme.colors.iconMuted}
                        />
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{menu.totalMeals} comidas</Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{menu.totalItems} items</Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{menu.totalRecipes} recetas</Text>
                      </View>
                    </View>

                    <View style={styles.badgeRow}>
                      {isPersisted ? (
                        <View style={[styles.badge, styles.assignedBadge]}>
                          <Text style={[styles.badgeText, styles.assignedBadgeText]}>Elegido</Text>
                        </View>
                      ) : null}
                      {isSuggested ? (
                        <View style={[styles.badge, styles.primaryBadge]}>
                          <Text style={[styles.badgeText, styles.primaryBadgeText]}>Sugerido</Text>
                        </View>
                      ) : null}
                      {isPreview ? (
                        <View style={[styles.badge, styles.previewBadge]}>
                          <Text style={[styles.badgeText, styles.previewBadgeText]}>Previsualizando</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerCopy: {
      flex: 1,
      paddingRight: spacing.md,
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
    supportingText: {
      marginTop: spacing.xs,
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    loadingState: {
      flex: 1,
      minHeight: 220,
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
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
    retryButton: {
      marginTop: spacing.lg,
      minWidth: 160,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    optionCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      padding: spacing.md,
    },
    optionCardSelected: {
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
    },
    optionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    optionCopy: {
      flex: 1,
    },
    optionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
    },
    optionSubtitle: {
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    checkCircle: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    checkCircleSelected: {
      backgroundColor: theme.colors.primary,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    metaChip: {
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      backgroundColor: theme.colors.surfaceAlt,
    },
    metaChipText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    badge: {
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    assignedBadge: {
      backgroundColor: theme.isDark ? 'rgba(96, 165, 250, 0.16)' : `${brandColors.navy}12`,
    },
    primaryBadge: {
      backgroundColor: theme.isDark ? 'rgba(37, 99, 235, 0.18)' : `${brandColors.navy}16`,
    },
    previewBadge: {
      backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.18)' : `${brandColors.sky}16`,
    },
    badgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    assignedBadgeText: {
      color: theme.isDark ? theme.colors.primary : brandColors.navy,
    },
    primaryBadgeText: {
      color: theme.isDark ? colors.white : brandColors.navy,
    },
    previewBadgeText: {
      color: theme.isDark ? colors.white : brandColors.sky,
    },
  });

export default DietMenuSelectorModal;
