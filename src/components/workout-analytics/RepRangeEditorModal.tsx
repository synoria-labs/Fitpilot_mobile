import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../common';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { RepRangeBucket, WorkoutAnalyticsColorToken } from '../../types';
import {
  RepRangeDraft,
  buildNextRepRangeDraft,
  buildRepRangeDraftLabel,
  cloneRepRangeDrafts,
  draftsToRepRanges,
  getRepRangeColor,
  validateRepRangeDrafts,
} from '../../utils/workoutAnalytics';

interface RepRangeEditorModalProps {
  visible: boolean;
  repRanges: RepRangeBucket[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (repRanges: RepRangeBucket[]) => Promise<void>;
  colorsByToken?: Record<WorkoutAnalyticsColorToken, string>;
}

export const RepRangeEditorModal: React.FC<RepRangeEditorModalProps> = ({
  visible,
  repRanges,
  isSaving,
  onClose,
  onSave,
  colorsByToken,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [drafts, setDrafts] = useState<RepRangeDraft[]>(() => cloneRepRangeDrafts(repRanges));

  useEffect(() => {
    if (visible) {
      setDrafts(cloneRepRangeDrafts(repRanges));
    }
  }, [repRanges, visible]);

  const validationError = useMemo(() => validateRepRangeDrafts(drafts), [drafts]);

  const handleChangeDraft = (
    index: number,
    field: 'minReps' | 'maxReps',
    value: string,
  ) => {
    const sanitizedValue = value.replace(/[^\d]/g, '');
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: sanitizedValue } : draft,
      ),
    );
  };

  const handleDeleteDraft = (index: number) => {
    setDrafts((currentDrafts) => currentDrafts.filter((_, draftIndex) => draftIndex !== index));
  };

  const handleAddDraft = () => {
    setDrafts((currentDrafts) => buildNextRepRangeDraft(currentDrafts));
  };

  const handleSave = async () => {
    if (validationError) {
      return;
    }

    await onSave(draftsToRepRanges(drafts));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Editar rangos</Text>
              <Text style={styles.subtitle}>
                Ajusta los buckets de repeticiones que alimentan tus gráficas de carga.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={theme.colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {drafts.map((draft, index) => (
              <View key={`${draft.id}-${index}`} style={styles.rangeCard}>
                <View style={styles.rangeCardHeader}>
                  <View style={styles.labelRow}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: colorsByToken?.[draft.colorToken] ?? getRepRangeColor(draft.colorToken) },
                      ]}
                    />
                    <Text style={styles.rangeLabel}>{buildRepRangeDraftLabel(draft)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteDraft(index)}
                    disabled={drafts.length <= 2}
                    style={styles.deleteButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={drafts.length <= 2 ? theme.colors.iconMuted : theme.colors.error}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputsRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Min</Text>
                    <TextInput
                      value={draft.minReps}
                      onChangeText={(value) => handleChangeDraft(index, 'minReps', value)}
                      keyboardType="number-pad"
                      style={styles.input}
                      placeholder="1"
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Max</Text>
                    <TextInput
                      value={draft.maxReps}
                      onChangeText={(value) => handleChangeDraft(index, 'maxReps', value)}
                      keyboardType="number-pad"
                      style={styles.input}
                      placeholder={index === drafts.length - 1 ? 'Abierto' : '5'}
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={handleAddDraft}
              activeOpacity={0.85}
              disabled={drafts.length >= 6}
              style={[styles.addButton, drafts.length >= 6 ? styles.addButtonDisabled : null]}
            >
              <Ionicons name="add-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>Agregar rango</Text>
            </TouchableOpacity>

            {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}
          </ScrollView>

          <View style={styles.actionsRow}>
            <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.actionButton} />
            <Button
              title="Guardar"
              onPress={() => void handleSave()}
              isLoading={isSaving}
              disabled={!!validationError}
              style={styles.actionButton}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'flex-end',
    },
    card: {
      maxHeight: '88%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    list: {
      marginTop: spacing.lg,
    },
    listContent: {
      gap: spacing.md,
    },
    rangeCard: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
    },
    rangeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    rangeLabel: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    deleteButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    inputGroup: {
      flex: 1,
    },
    inputLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      marginBottom: spacing.xs,
    },
    input: {
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.primarySoft,
      paddingVertical: spacing.md,
    },
    addButtonDisabled: {
      opacity: 0.5,
    },
    addButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    errorText: {
      fontSize: fontSize.sm,
      color: theme.colors.error,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    actionButton: {
      flex: 1,
    },
  });

export default RepRangeEditorModal;
