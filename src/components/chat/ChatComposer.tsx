import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles } from '../../theme';
import { auroraFont, getAuroraTokens, useAurora } from '../../theme/aurora';

export type ChatComposerFile = {
  id: string;
  name: string;
  type: string;
  durationMillis?: number;
};

type ChatComposerProps = {
  draft: string;
  pendingFiles: ChatComposerFile[];
  disabled: boolean;
  canSend: boolean;
  isSending: boolean;
  isRecording: boolean;
  recordingDuration: number;
  recordingLevel: number;
  bottomPadding: number;
  showSuggestions?: boolean;
  onChangeDraft: (value: string) => void;
  onPickImage: () => void;
  onPickDocument: () => void;
  onRemoveFile: (fileId: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onSend: () => void;
};

const RECORDING_WAVE_BARS = [
  0.42, 0.76, 0.36, 0.92, 0.58, 1, 0.48, 0.84, 0.52, 0.88, 0.34, 0.72,
];

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const getFileDisplayName = (file: ChatComposerFile) =>
  file.type.startsWith('audio/') ? 'Nota de voz' : file.name;

export function ChatComposer({
  draft,
  pendingFiles,
  disabled,
  canSend,
  isSending,
  isRecording,
  recordingDuration,
  recordingLevel,
  bottomPadding,
  showSuggestions = true,
  onChangeDraft,
  onPickImage,
  onPickDocument,
  onRemoveFile,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onSend,
}: ChatComposerProps) {
  const { theme } = useAppTheme();
  const aurora = useAurora();
  const styles = useThemedStyles(createStyles);
  const inputRef = useRef<TextInput>(null);
  const [isAttachmentMenuVisible, setIsAttachmentMenuVisible] = useState(false);
  const showSendButton = canSend || isSending;

  const openAttachmentMenu = () => {
    if (disabled) {
      return;
    }

    Keyboard.dismiss();
    setIsAttachmentMenuVisible(true);
  };

  const selectAttachmentOption = (callback: () => void) => {
    setIsAttachmentMenuVisible(false);
    requestAnimationFrame(callback);
  };

  return (
    <>
      {showSuggestions && !disabled && !isRecording && !draft.trim() && !pendingFiles.length ? (
        <ScrollView
          horizontal
          style={styles.suggestionsScroll}
          contentContainerStyle={styles.suggestions}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Sugerencias de mensaje"
        >
          {[
            { label: '¿Puedo cambiar un ejercicio?', draft: '¿Puedo cambiar un ejercicio?' },
            { label: 'Enviar foto de progreso', draft: null },
            { label: 'Dudas del menú', draft: 'Tengo una duda sobre mi menú.' },
          ].map((suggestion) => (
            <Pressable
              key={suggestion.label}
              accessibilityRole="button"
              accessibilityLabel={suggestion.label}
              accessibilityHint={suggestion.draft
                ? 'Prepara un borrador para que lo revises antes de enviarlo'
                : 'Abre el selector de imágenes'}
              onPress={() => {
                if (suggestion.draft) {
                  onChangeDraft(suggestion.draft);
                  inputRef.current?.focus();
                } else {
                  onPickImage();
                }
              }}
              style={({ pressed }) => [styles.suggestion, pressed && styles.buttonPressed]}
            >
              <Text style={styles.suggestionText}>{suggestion.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {pendingFiles.length ? (
        <ScrollView
          horizontal
          style={styles.pendingFilesScroller}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pendingFiles}
          keyboardShouldPersistTaps="handled"
        >
          {pendingFiles.map((file) => {
            const isAudio = file.type.startsWith('audio/');

            return (
              <View
                key={file.id}
                style={[
                  styles.pendingFileChip,
                  isAudio ? styles.pendingAudioFileChip : null,
                ]}
              >
                <View style={styles.pendingFileIcon}>
                  <Ionicons
                    name={
                      file.type.startsWith('image/')
                        ? 'image'
                        : isAudio
                          ? 'mic-outline'
                          : 'document-text'
                    }
                    size={17}
                    color={aurora.tones.blue.ink}
                  />
                </View>
                <View style={styles.pendingFileCopy}>
                  <Text style={styles.pendingFileText} numberOfLines={1}>
                    {getFileDisplayName(file)}
                  </Text>
                  {file.durationMillis ? (
                    <Text style={styles.pendingFileMeta}>
                      {formatDuration(file.durationMillis)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar ${getFileDisplayName(file)}`}
                  hitSlop={4}
                  onPress={() => onRemoveFile(file.id)}
                  style={({ pressed }) => [
                    styles.pendingFileRemoveButton,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Ionicons name="close" size={18} color={theme.colors.icon} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {isRecording ? (
        <View style={[styles.recordingComposer, { paddingBottom: bottomPadding }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar grabación"
            onPress={onCancelRecording}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Ionicons name="trash-outline" size={21} color={theme.colors.error} />
          </Pressable>

          <View style={styles.recordingStatus}>
            <View style={styles.recordingDot} />
            <View style={styles.recordingWaveBars}>
              {RECORDING_WAVE_BARS.map((bar, index) => {
                const pulse =
                  0.62 + Math.sin(index + recordingDuration / 220) * 0.28;
                const height =
                  8 + recordingLevel * 26 * Math.max(0.25, bar + pulse);

                return (
                  <View
                    key={index}
                    style={[
                      styles.recordingWaveBar,
                      { height: Math.min(30, height) },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={styles.recordingTime}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detener grabación"
            onPress={onStopRecording}
            style={({ pressed }) => [
              styles.stopButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Ionicons name="stop" size={18} color="#ffffff" />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: bottomPadding }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adjuntar archivo"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={openAttachmentMenu}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.buttonPressed : null,
              disabled ? styles.buttonDisabled : null,
            ]}
          >
            <Ionicons
              name="add"
              size={25}
              color={disabled ? theme.colors.iconMuted : theme.colors.icon}
            />
          </Pressable>

          <View style={styles.inputShell}>
            <TextInput
              ref={inputRef}
              accessibilityLabel="Mensaje"
              value={draft}
              editable={!disabled}
              onChangeText={onChangeDraft}
              placeholder="Mensaje"
              placeholderTextColor={aurora.faint}
              style={styles.input}
              multiline
              maxLength={4000}
            />
          </View>

          {showSendButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensaje"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => [
                styles.sendButton,
                canSend ? styles.sendButtonEnabled : null,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={aurora.tones.blue.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.actionGradient]}
              />
              {isSending ? (
                <ActivityIndicator size="small" color={aurora.onTone} />
              ) : (
                <Ionicons
                  name="send"
                  size={19}
                  color={aurora.onTone}
                />
              )}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Grabar nota de voz"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onStartRecording}
              style={({ pressed }) => [
                styles.sendButton,
                pressed ? styles.buttonPressed : null,
                disabled ? styles.buttonDisabled : null,
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={aurora.tones.blue.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.actionGradient]}
              />
              <Ionicons
                name="mic-outline"
                size={22}
                color={aurora.onTone}
              />
            </Pressable>
          )}
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={isAttachmentMenuVisible}
        onRequestClose={() => setIsAttachmentMenuVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar opciones de adjuntos"
            onPress={() => setIsAttachmentMenuVisible(false)}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.modalBackdrop} />
          </Pressable>
          <View
            accessibilityRole="menu"
            style={[styles.attachmentSheet, { paddingBottom: bottomPadding }]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Adjuntar</Text>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => selectAttachmentOption(onPickImage)}
              style={({ pressed }) => [
                styles.attachmentOption,
                pressed ? styles.attachmentOptionPressed : null,
              ]}
            >
              <View style={styles.attachmentOptionIcon}>
                <Ionicons
                  name="image-outline"
                  size={22}
                  color={aurora.tones.blue.ink}
                />
              </View>
              <View style={styles.attachmentOptionCopy}>
                <Text style={styles.attachmentOptionTitle}>Foto o imagen</Text>
                <Text style={styles.attachmentOptionText}>
                  Selecciona una o varias imágenes
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => selectAttachmentOption(onPickDocument)}
              style={({ pressed }) => [
                styles.attachmentOption,
                pressed ? styles.attachmentOptionPressed : null,
              ]}
            >
              <View style={styles.attachmentOptionIcon}>
                <Ionicons
                  name="document-attach-outline"
                  size={22}
                  color={aurora.tones.blue.ink}
                />
              </View>
              <View style={styles.attachmentOptionCopy}>
                <Text style={styles.attachmentOptionTitle}>PDF o audio</Text>
                <Text style={styles.attachmentOptionText}>
                  Adjunta un documento o archivo de audio
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsAttachmentMenuVisible(false)}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed ? styles.attachmentOptionPressed : null,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) => {
  const aurora = getAuroraTokens(theme.isDark);
  return StyleSheet.create({
    suggestionsScroll: { flexGrow: 0, flexShrink: 0 },
    suggestions: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10, gap: 8 },
    suggestion: {
      minHeight: 44,
      paddingHorizontal: 13,
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: aurora.glass,
      borderWidth: 1,
      borderColor: aurora.tones.blue.line,
    },
    suggestionText: { ...auroraFont('bold'), fontSize: 12, color: aurora.tones.blue.ink },
    actionGradient: { borderRadius: 999 },
    pendingFilesScroller: {
      minHeight: 58,
      maxHeight: 68,
      flexGrow: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: aurora.border,
    },
    pendingFiles: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    pendingFileChip: {
      maxWidth: 220,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.lg,
      backgroundColor: aurora.surface,
      paddingLeft: spacing.xs,
      paddingRight: 2,
    },
    pendingAudioFileChip: {
      borderColor: aurora.tones.blue.line,
      backgroundColor: aurora.tones.blue.soft,
    },
    pendingFileIcon: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.soft,
    },
    pendingFileCopy: {
      minWidth: 0,
      flex: 1,
    },
    pendingFileText: {
      color: aurora.text,
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
    },
    pendingFileMeta: {
      marginTop: 1,
      color: aurora.tones.blue.ink,
      fontSize: 10,
      ...auroraFont('extrabold'),
    },
    pendingFileRemoveButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: aurora.border,
      backgroundColor: aurora.glass,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    recordingComposer: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: aurora.border,
      backgroundColor: aurora.glass,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    iconButton: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.full,
      backgroundColor: aurora.surface,
    },
    buttonPressed: {
      opacity: 0.66,
    },
    buttonDisabled: {
      opacity: 0.52,
    },
    inputShell: {
      minHeight: 44,
      maxHeight: 112,
      flex: 1,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: aurora.borderStrong,
      borderRadius: 22,
      backgroundColor: aurora.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    },
    input: {
      ...auroraFont('medium'),
      minHeight: 40,
      maxHeight: 96,
      color: aurora.text,
      fontSize: fontSize.base,
      padding: 0,
      textAlignVertical: 'center',
    },
    sendButton: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.full,
      backgroundColor: aurora.surface,
    },
    sendButtonEnabled: {
      borderColor: aurora.tones.blue.ink,
      backgroundColor: aurora.tones.blue.ink,
    },
    recordingStatus: {
      minWidth: 0,
      minHeight: 46,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: aurora.tones.blue.line,
      borderRadius: 23,
      backgroundColor: aurora.tones.blue.soft,
      paddingHorizontal: spacing.sm,
    },
    recordingDot: {
      width: 9,
      height: 9,
      flexShrink: 0,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.error,
    },
    recordingWaveBars: {
      minWidth: 0,
      height: 34,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    recordingWaveBar: {
      width: 4,
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.ink,
    },
    recordingTime: {
      minWidth: 42,
      color: aurora.tones.blue.ink,
      fontSize: fontSize.xs,
      ...auroraFont('extrabold'),
      textAlign: 'right',
    },
    stopButton: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.error,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
    },
    attachmentSheet: {
      gap: spacing.sm,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      backgroundColor: aurora.surface,
      padding: spacing.md,
      paddingTop: spacing.sm,
    },
    sheetHandle: {
      width: 42,
      height: 4,
      alignSelf: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.borderStrong,
    },
    sheetTitle: {
      marginVertical: spacing.xs,
      color: aurora.text,
      fontSize: fontSize.lg,
      ...auroraFont('extrabold'),
    },
    attachmentOption: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: aurora.border,
      borderRadius: borderRadius.lg,
      backgroundColor: aurora.surface2,
      padding: spacing.sm,
    },
    attachmentOptionPressed: {
      backgroundColor: aurora.tones.blue.soft,
    },
    attachmentOptionIcon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: aurora.tones.blue.soft,
    },
    attachmentOptionCopy: {
      minWidth: 0,
      flex: 1,
    },
    attachmentOptionTitle: {
      color: aurora.text,
      fontSize: fontSize.sm,
      ...auroraFont('extrabold'),
    },
    attachmentOptionText: {
      marginTop: 2,
      color: aurora.faint,
      fontSize: fontSize.xs,
    },
    cancelButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.lg,
    },
    cancelButtonText: {
      color: aurora.muted,
      fontSize: fontSize.sm,
      ...auroraFont('bold'),
    },
  });
};
