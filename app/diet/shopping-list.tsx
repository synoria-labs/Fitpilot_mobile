import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/common';
import { DietMenuPreviewModal } from '../../src/components/diet';
import {
  borderRadius,
  brandColors,
  fontSize,
  spacing,
} from '../../src/constants/colors';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import {
  addShoppingListItem,
  deleteShoppingListItem,
  getCurrentShoppingList,
  getShoppingListById,
  groupShoppingListItemsByCategory,
  updateShoppingListItem,
  type CreateShoppingListItemInput,
  type ShoppingList,
  type ShoppingListDay,
  type ShoppingListItem,
  type UpdateShoppingListItemInput,
} from '../../src/services/shoppingList';
import { getClientDietMenuCalendar } from '../../src/services/diet';
import { printShoppingList } from '../../src/utils/shoppingListPrint';
import { formatLocalDate } from '../../src/utils/date';
import type { ClientDietMenu } from '../../src/types';

type ItemFormState = {
  name: string;
  category: string;
  quantity_label: string;
  grams: string;
  note: string;
};

type MenuPreviewState = {
  date: string;
  menu: ClientDietMenu;
} | null;

const EMPTY_FORM: ItemFormState = {
  name: '',
  category: '',
  quantity_label: '',
  grams: '',
  note: '',
};

const getDayPreviewKey = (day: ShoppingListDay) => `${day.date}:${day.menu_id}`;

const itemToForm = (item: ShoppingListItem): ItemFormState => ({
  name: item.name,
  category: item.category ?? '',
  quantity_label: item.quantity_label ?? '',
  grams: item.grams != null ? String(item.grams) : '',
  note: item.note ?? '',
});

const formToCreateInput = (form: ItemFormState): CreateShoppingListItemInput => {
  const grams = form.grams.trim() ? Number(form.grams) : null;
  return {
    name: form.name.trim(),
    category: form.category.trim() || null,
    quantity_label: form.quantity_label.trim() || null,
    grams: grams != null && Number.isFinite(grams) ? grams : null,
    note: form.note.trim() || null,
  };
};

const formToUpdateInput = (form: ItemFormState): UpdateShoppingListItemInput => {
  const grams = form.grams.trim() ? Number(form.grams) : null;
  return {
    name: form.name.trim(),
    category: form.category.trim() || null,
    quantity_label: form.quantity_label.trim() || null,
    grams: grams != null && Number.isFinite(grams) ? grams : null,
    note: form.note.trim() || null,
  };
};

export default function ShoppingListScreen() {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ listId?: string }>();
  const listId = useMemo(() => {
    const raw = params.listId;
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }, [params.listId]);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [formMode, setFormMode] = useState<
    { kind: 'add' } | { kind: 'edit'; item: ShoppingListItem } | null
  >(null);
  const [formState, setFormState] = useState<ItemFormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuPreviewState, setMenuPreviewState] = useState<MenuPreviewState>(null);
  const [menuPreviewCache, setMenuPreviewCache] = useState<Record<string, ClientDietMenu>>({});
  const [loadingPreviewKey, setLoadingPreviewKey] = useState<string | null>(null);
  const [previewErrorByKey, setPreviewErrorByKey] = useState<Record<string, string | null>>({});

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = listId
        ? await getShoppingListById(listId)
        : await getCurrentShoppingList();
      setList(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar tu lista del súper.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setMenuPreviewState(null);
    setMenuPreviewCache({});
    setLoadingPreviewKey(null);
    setPreviewErrorByKey({});
  }, [list?.id]);

  const handleToggleChecked = useCallback(
    async (item: ShoppingListItem) => {
      if (!list) return;
      const nextChecked = !item.checked;
      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.map((existing) =>
                existing.id === item.id ? { ...existing, checked: nextChecked } : existing,
              ),
            }
          : current,
      );
      try {
        await updateShoppingListItem(list.id, item.id, { checked: nextChecked });
      } catch (error) {
        setList((current) =>
          current
            ? {
                ...current,
                items: current.items.map((existing) =>
                  existing.id === item.id
                    ? { ...existing, checked: item.checked }
                    : existing,
                ),
              }
            : current,
        );
        const message =
          error instanceof Error ? error.message : 'No se pudo actualizar el item.';
        Alert.alert('Error', message);
      }
    },
    [list],
  );

  const openAddForm = useCallback(() => {
    setFormState(EMPTY_FORM);
    setFormMode({ kind: 'add' });
  }, []);

  const openEditForm = useCallback((item: ShoppingListItem) => {
    setFormState(itemToForm(item));
    setFormMode({ kind: 'edit', item });
  }, []);

  const closeForm = useCallback(() => {
    if (isSubmitting) return;
    setFormMode(null);
    setFormState(EMPTY_FORM);
  }, [isSubmitting]);

  const handleSubmitForm = useCallback(async () => {
    if (!list || !formMode) return;
    if (!formState.name.trim()) {
      Alert.alert('Falta el nombre', 'Escribe un nombre para el item.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (formMode.kind === 'add') {
        const created = await addShoppingListItem(list.id, formToCreateInput(formState));
        setList((current) =>
          current ? { ...current, items: [...current.items, created] } : current,
        );
      } else {
        const updated = await updateShoppingListItem(
          list.id,
          formMode.item.id,
          formToUpdateInput(formState),
        );
        setList((current) =>
          current
            ? {
                ...current,
                items: current.items.map((existing) =>
                  existing.id === updated.id ? updated : existing,
                ),
              }
            : current,
        );
      }
      setFormMode(null);
      setFormState(EMPTY_FORM);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo guardar el item.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [formMode, formState, list]);

  const handleDeleteItem = useCallback(
    (item: ShoppingListItem) => {
      if (!list) return;
      Alert.alert('Borrar item', `¿Borrar "${item.name}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteShoppingListItem(list.id, item.id);
              setList((current) =>
                current
                  ? {
                      ...current,
                      items: current.items.filter((existing) => existing.id !== item.id),
                    }
                  : current,
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'No se pudo borrar el item.';
              Alert.alert('Error', message);
            }
          },
        },
      ]);
    },
    [list],
  );

  const handlePrint = useCallback(async () => {
    if (!list) return;
    setIsPrinting(true);
    try {
      await printShoppingList(list);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo imprimir la lista.';
      Alert.alert('Error', message);
    } finally {
      setIsPrinting(false);
    }
  }, [list]);

  const handleRegenerate = useCallback(() => {
    router.replace('/diet/weekly-plan');
  }, []);

  const handlePreviewDayMenu = useCallback(
    async (day: ShoppingListDay) => {
      if (!list || loadingPreviewKey === getDayPreviewKey(day)) {
        return;
      }

      const previewKey = getDayPreviewKey(day);
      const cachedMenu = menuPreviewCache[previewKey];
      if (cachedMenu) {
        setMenuPreviewState({ date: day.date, menu: cachedMenu });
        return;
      }

      setLoadingPreviewKey(previewKey);
      setPreviewErrorByKey((current) => ({ ...current, [previewKey]: null }));

      try {
        const menusByDate = await getClientDietMenuCalendar(String(list.client_id), day.date);
        const dateMenus = menusByDate[day.date] ?? Object.values(menusByDate).flat();
        const menu = dateMenus.find((candidate) => candidate.menuId === day.menu_id) ?? null;

        if (!menu) {
          throw new Error('No pudimos cargar el detalle de este menu.');
        }

        setMenuPreviewCache((current) => ({ ...current, [previewKey]: menu }));
        setMenuPreviewState({ date: day.date, menu });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'No pudimos cargar el detalle de este menu.';
        setPreviewErrorByKey((current) => ({ ...current, [previewKey]: message }));
      } finally {
        setLoadingPreviewKey((current) => (current === previewKey ? null : current));
      }
    },
    [list, loadingPreviewKey, menuPreviewCache],
  );

  const sortedListDays = useMemo(
    () => (list ? [...list.days].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [list],
  );

  const grouped = useMemo(
    () => (list ? groupShoppingListItemsByCategory(list.items) : []),
    [list],
  );

  const subtitle = useMemo(() => {
    if (!list) return '';
    const first = formatLocalDate(list.start_date, { day: 'numeric', month: 'short' });
    const last = formatLocalDate(list.end_date, { day: 'numeric', month: 'short' });
    return `${first} – ${last}`;
  }, [list]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.9}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.icon} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Lista del súper</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity
          style={[styles.headerAction, !list && styles.headerActionDisabled]}
          activeOpacity={0.85}
          onPress={handlePrint}
          disabled={!list || isPrinting}
        >
          {isPrinting ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : (
            <Ionicons name="print-outline" size={20} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.centerLabel}>Cargando tu lista…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.colors.warning} />
          <Text style={styles.centerLabel}>{loadError}</Text>
          <Pressable onPress={loadList} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : !list ? (
        <View style={styles.centerState}>
          <Ionicons
            name="basket-outline"
            size={36}
            color={theme.colors.iconMuted}
          />
          <Text style={styles.emptyTitle}>Aún no tienes una lista</Text>
          <Text style={styles.emptyBody}>
            Genera una desde el Plan semanal eligiendo el menú de cada día.
          </Text>
          <Button
            title="Ir al plan semanal"
            onPress={() => router.replace('/diet/weekly-plan')}
            style={styles.emptyAction}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {list.needs_regeneration ? (
            <View style={styles.regenBanner}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.colors.warning}
              />
              <Text style={styles.regenBannerText}>
                La lista no coincide con tus selecciones actuales.
              </Text>
              <TouchableOpacity onPress={handleRegenerate} style={styles.regenButton}>
                <Text style={styles.regenButtonText}>Regenerar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {sortedListDays.length > 0 ? (
            <View style={styles.menuPreviewSection}>
              <View style={styles.menuPreviewHeader}>
                <Text style={styles.sectionTitle}>Menus de la semana</Text>
                <View style={styles.menuPreviewCountBadge}>
                  <Text style={styles.menuPreviewCountText}>
                    {sortedListDays.length} dias
                  </Text>
                </View>
              </View>
              <View style={styles.menuPreviewCard}>
                {sortedListDays.map((day, index) => {
                  const previewKey = getDayPreviewKey(day);
                  const isPreviewLoading = loadingPreviewKey === previewKey;
                  const previewError = previewErrorByKey[previewKey] ?? null;
                  const dayLabel = formatLocalDate(day.date, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });

                  return (
                    <View
                      key={previewKey}
                      style={[
                        styles.menuPreviewRow,
                        index === sortedListDays.length - 1
                          ? styles.menuPreviewRowLast
                          : null,
                      ]}
                    >
                      <View style={styles.menuPreviewCopy}>
                        <Text style={styles.menuPreviewDate}>{dayLabel}</Text>
                        <Text style={styles.menuPreviewTitle} numberOfLines={2}>
                          {day.menu_title || `Menu #${day.menu_id}`}
                        </Text>
                        {previewError ? (
                          <Text style={styles.menuPreviewError} numberOfLines={2}>
                            {previewError}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.menuPreviewButton,
                          isPreviewLoading ? styles.menuPreviewButtonDisabled : null,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => void handlePreviewDayMenu(day)}
                        disabled={isPreviewLoading}
                        accessibilityRole="button"
                        accessibilityLabel={`Previsualizar ${day.menu_title || `menu ${day.menu_id}`}`}
                      >
                        {isPreviewLoading ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <>
                            <Ionicons
                              name="eye-outline"
                              size={17}
                              color={theme.colors.primary}
                            />
                            <Text style={styles.menuPreviewButtonText}>Ver</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {grouped.length === 0 ? (
            <View style={styles.emptyItemsState}>
              <Text style={styles.emptyTitle}>Sin items</Text>
              <Text style={styles.emptyBody}>
                Agrega items manuales o regenera desde el plan semanal.
              </Text>
            </View>
          ) : (
            grouped.map((section) => (
              <View key={section.category} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.category}</Text>
                <View style={styles.sectionItems}>
                  {section.items.map((item) => {
                    const isManual = item.source_type === 'manual';
                    return (
                      <View key={item.id} style={styles.itemRow}>
                        <TouchableOpacity
                          onPress={() => void handleToggleChecked(item)}
                          style={[
                            styles.checkbox,
                            item.checked && styles.checkboxChecked,
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: item.checked }}
                          accessibilityLabel={`Marcar ${item.name}`}
                        >
                          {item.checked ? (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color={theme.colors.surface}
                            />
                          ) : null}
                        </TouchableOpacity>
                        <View style={styles.itemCopy}>
                          <View style={styles.itemHeader}>
                            <Text
                              style={[
                                styles.itemName,
                                item.checked && styles.itemNameChecked,
                              ]}
                              numberOfLines={2}
                            >
                              {item.name}
                            </Text>
                            {isManual ? (
                              <View style={styles.manualBadge}>
                                <Text style={styles.manualBadgeText}>Manual</Text>
                              </View>
                            ) : null}
                          </View>
                          {item.quantity_label ? (
                            <Text style={styles.itemMeta} numberOfLines={1}>
                              {item.quantity_label}
                            </Text>
                          ) : null}
                          {item.raw_quantity_label ? (
                            <Text style={styles.itemRawMeta} numberOfLines={1}>
                              Crudo: {item.raw_quantity_label}
                            </Text>
                          ) : null}
                          {item.note ? (
                            <Text style={styles.itemNote} numberOfLines={2}>
                              {item.note}
                            </Text>
                          ) : null}
                        </View>
                        {isManual ? (
                          <View style={styles.itemActions}>
                            <TouchableOpacity
                              onPress={() => openEditForm(item)}
                              style={styles.itemActionButton}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={18}
                                color={theme.colors.iconMuted}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteItem(item)}
                              style={styles.itemActionButton}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color={theme.colors.error}
                              />
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.addItemButton}
            onPress={openAddForm}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.addItemButtonText}>Agregar item manual</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <DietMenuPreviewModal
        visible={menuPreviewState !== null}
        menu={menuPreviewState?.menu ?? null}
        dateLabel={
          menuPreviewState
            ? formatLocalDate(menuPreviewState.date, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
        mode="readonly"
        onClose={() => setMenuPreviewState(null)}
      />

      <Modal
        visible={formMode !== null}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {formMode?.kind === 'edit' ? 'Editar item' : 'Agregar item'}
              </Text>
              <TouchableOpacity
                onPress={closeForm}
                style={styles.modalClose}
              >
                <Ionicons name="close-outline" size={22} color={theme.colors.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalForm}
            >
              <Text style={styles.formLabel}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={formState.name}
                onChangeText={(name) => setFormState((s) => ({ ...s, name }))}
                placeholder="Manzanas"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.formLabel}>Categoría</Text>
              <TextInput
                style={styles.input}
                value={formState.category}
                onChangeText={(category) => setFormState((s) => ({ ...s, category }))}
                placeholder="Frutas"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.formLabel}>Cantidad</Text>
              <TextInput
                style={styles.input}
                value={formState.quantity_label}
                onChangeText={(quantity_label) =>
                  setFormState((s) => ({ ...s, quantity_label }))
                }
                placeholder="1 kg"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.formLabel}>Gramos (opcional)</Text>
              <TextInput
                style={styles.input}
                value={formState.grams}
                onChangeText={(grams) => setFormState((s) => ({ ...s, grams }))}
                placeholder="1000"
                keyboardType="numeric"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.formLabel}>Nota</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={formState.note}
                onChangeText={(note) => setFormState((s) => ({ ...s, note }))}
                placeholder="Marca preferida, observación..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={closeForm}
                disabled={isSubmitting}
                fullWidth
                style={styles.modalFooterButton}
              />
              <Button
                title="Guardar"
                onPress={handleSubmitForm}
                isLoading={isSubmitting}
                fullWidth
                style={styles.modalFooterButton}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.md,
    },
    backButton: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.94)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(24,47,80,0.12)',
    },
    headerCopy: {
      flex: 1,
      paddingTop: spacing.xs,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    headerAction: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    headerActionDisabled: {
      opacity: 0.4,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
    },
    centerLabel: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    emptyTitle: {
      marginTop: spacing.md,
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyBody: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyAction: {
      marginTop: spacing.lg,
      minWidth: 220,
    },
    emptyItemsState: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    retryButton: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    retryButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    regenBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.isDark
        ? 'rgba(245,158,11,0.18)'
        : 'rgba(245,158,11,0.12)',
      borderWidth: 1,
      borderColor: theme.colors.warning,
    },
    regenBannerText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    regenButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.warning,
    },
    regenButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.surface,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    menuPreviewSection: {
      gap: spacing.sm,
    },
    menuPreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    menuPreviewCountBadge: {
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    menuPreviewCountText: {
      color: theme.colors.primary,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    menuPreviewCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    menuPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    menuPreviewRowLast: {
      borderBottomWidth: 0,
    },
    menuPreviewCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    menuPreviewDate: {
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    menuPreviewTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '700',
      lineHeight: 19,
    },
    menuPreviewError: {
      marginTop: spacing.xs,
      color: theme.colors.error,
      fontSize: fontSize.xs,
      fontWeight: '600',
      lineHeight: 16,
    },
    menuPreviewButton: {
      minWidth: 72,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    menuPreviewButtonDisabled: {
      opacity: 0.65,
    },
    menuPreviewButtonText: {
      color: theme.colors.primary,
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionItems: {
      gap: spacing.xs,
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: spacing.xs,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    checkboxChecked: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    itemCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    itemName: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    itemNameChecked: {
      textDecorationLine: 'line-through',
      color: theme.colors.textMuted,
    },
    manualBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      backgroundColor: theme.isDark
        ? 'rgba(56,189,248,0.2)'
        : `${brandColors.sky}1F`,
    },
    manualBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.isDark ? theme.colors.surface : brandColors.sky,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    itemMeta: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    itemRawMeta: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    itemNote: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      fontStyle: 'italic',
    },
    itemActions: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    itemActionButton: {
      width: 32,
      height: 32,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    addItemButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
    },
    addItemButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    modalClose: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    modalForm: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    formLabel: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.inputBackground,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    modalFooter: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    modalFooterButton: {
      flex: 1,
    },
  });
