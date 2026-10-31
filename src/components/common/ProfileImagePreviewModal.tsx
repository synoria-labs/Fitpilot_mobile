import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  borderRadius,
  brandColors,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import { pickProfileImageFromLibrary } from '../../utils/profileImagePicker';
import { Button } from './Button';
import { clamp } from '../../utils/math';

interface ProfileImagePreviewModalProps {
  visible: boolean;
  imageUrl?: string | null;
  title?: string | null;
  onClose: () => void;
  onChangeImage?: (uri: string) => Promise<void> | void;
  isUploading?: boolean;
}

export const ProfileImagePreviewModal: React.FC<ProfileImagePreviewModalProps> = ({
  visible,
  imageUrl,
  title,
  onClose,
  onChangeImage,
  isUploading = false,
}) => {
  const { width, height } = useWindowDimensions();
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [hasImageError, setHasImageError] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const resolvedImageUrl = imageUrl ?? undefined;
  const canEditImage = Boolean(onChangeImage);
  const canRenderImage = Boolean(resolvedImageUrl) && !hasImageError;
  const modalWidth = Math.min(width - spacing.md * 2, 560);
  const stageWidth = Math.max(240, modalWidth - spacing.lg * 2);
  const maxStageHeight = Math.min(height * 0.56, 540);
  const minStageHeight = Math.min(maxStageHeight, 220);
  const stageHeight = clamp(
    stageWidth / Math.max(imageAspectRatio, 0.55),
    minStageHeight,
    maxStageHeight,
  );

  const handleDismiss = () => {
    if (isUploading) {
      return;
    }

    onClose();
  };

  const handlePickImage = async () => {
    if (!onChangeImage || isUploading) {
      return;
    }

    try {
      const result = await pickProfileImageFromLibrary();

      if (result.status === 'permission_denied') {
        Alert.alert(
          'Permiso requerido',
          'Necesitamos acceso a tu galeria para actualizar tu foto de perfil.',
        );
        return;
      }

      if (result.status !== 'selected') {
        return;
      }

      await onChangeImage(result.uri);
    } catch (error) {
      if (__DEV__) {
        console.warn('[ProfileImagePreviewModal] change image failed', error);
      }

      Alert.alert(
        'No se pudo cambiar la foto',
        'Intenta de nuevo en un momento.',
      );
    }
  };

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl, visible]);

  useEffect(() => {
    let isCancelled = false;

    if (!visible || !resolvedImageUrl) {
      setImageAspectRatio(1);
      return undefined;
    }

    Image.getSize(
      resolvedImageUrl,
      (remoteWidth, remoteHeight) => {
        if (isCancelled || remoteWidth <= 0 || remoteHeight <= 0) {
          return;
        }

        setImageAspectRatio(remoteWidth / remoteHeight);
      },
      () => {
        if (!isCancelled) {
          setImageAspectRatio(1);
        }
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [resolvedImageUrl, visible]);

  const emptyTitle = hasImageError
    ? 'No pudimos cargar esta foto.'
    : 'Aún no tienes foto de perfil.';
  const emptyText = hasImageError
    ? 'Puedes cerrar esta vista o elegir otra imagen.'
    : 'Agrega una foto para que tu perfil se vea mas personal.';
  const emptyActionLabel = hasImageError ? 'Elegir otra foto' : 'Elegir una foto';
  const subtitle = canEditImage
    ? 'Puedes actualizarla desde aquí.'
    : 'Vista previa de tu foto actual.';
  const headerGlowColors = theme.isDark
    ? (['rgba(103,182,223,0.18)', 'rgba(103,182,223,0.05)', 'rgba(0,0,0,0)'] as const)
    : (['rgba(103,182,223,0.16)', 'rgba(103,182,223,0.04)', 'rgba(255,255,255,0)'] as const);
  const stageColors = theme.isDark
    ? (['rgba(6, 13, 24, 0.98)', 'rgba(16, 26, 43, 0.96)'] as const)
    : (['#ecf5ff', '#f9fbff'] as const);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={handleDismiss}
          disabled={isUploading}
        />

        <View style={[styles.card, { maxWidth: modalWidth }]}>
          <LinearGradient
            colors={headerGlowColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGlow}
          />

          <Pressable
            onPress={handleDismiss}
            style={[
              styles.closeButton,
              isUploading ? styles.actionDisabled : null,
            ]}
            disabled={isUploading}
          >
            <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>Foto de perfil</Text>
            <Text numberOfLines={2} style={styles.title}>
              {title || 'Tu perfil'}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.stageSection}>
            <LinearGradient
              colors={stageColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.stageShell, { height: stageHeight }]}
            >
              <View style={styles.stageChrome}>
                {canRenderImage ? (
                  <Image
                    source={{ uri: resolvedImageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                    onError={() => setHasImageError(true)}
                  />
                ) : (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons
                        name={hasImageError ? 'warning-outline' : 'image-outline'}
                        size={28}
                        color={theme.colors.icon}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                    <Text style={styles.emptyText}>{emptyText}</Text>
                    {canEditImage ? (
                      <Pressable
                        onPress={() => {
                          void handlePickImage();
                        }}
                        style={[
                          styles.inlineAction,
                          isUploading ? styles.actionDisabled : null,
                        ]}
                        disabled={isUploading}
                      >
                        <Ionicons
                          name="camera-outline"
                          size={16}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.inlineActionText}>{emptyActionLabel}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.footer}>
            {canEditImage ? (
              <>
                <Button
                  title="Cerrar"
                  variant="secondary"
                  appearance="profile"
                  onPress={handleDismiss}
                  fullWidth
                  disabled={isUploading}
                  style={styles.footerButton}
                />

                <Button
                  title="Cambiar foto"
                  appearance="profile"
                  onPress={() => {
                    void handlePickImage();
                  }}
                  isLoading={isUploading}
                  fullWidth
                  style={styles.footerButton}
                  icon={
                    isUploading ? undefined : (
                      <Ionicons
                        name="camera-outline"
                        size={18}
                        color="#ffffff"
                      />
                    )
                  }
                />
              </>
            ) : (
              <Button
                title="Cerrar"
                variant="secondary"
                appearance="profile"
                onPress={handleDismiss}
                fullWidth
                disabled={isUploading}
                style={styles.footerButtonSingle}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xl,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.isDark
        ? 'rgba(2, 6, 23, 0.84)'
        : 'rgba(15, 23, 42, 0.62)',
    },
    card: {
      position: 'relative',
      width: '100%',
      maxHeight: '92%',
      alignSelf: 'center',
      borderRadius: 30,
      backgroundColor: theme.isDark ? '#0c1627' : '#f8fbff',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(103, 182, 223, 0.2)'
        : 'rgba(103, 182, 223, 0.24)',
      overflow: 'hidden',
      shadowColor: theme.isDark ? '#000000' : brandColors.navy,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: theme.isDark ? 0.38 : 0.18,
      shadowRadius: 22,
      elevation: 14,
    },
    cardGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 180,
    },
    closeButton: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      zIndex: 3,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.94)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(24, 47, 80, 0.12)',
      shadowColor: theme.isDark ? '#000000' : brandColors.navy,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 16,
      elevation: 4,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.md,
      paddingRight: 88,
    },
    eyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: theme.colors.primary,
      marginBottom: 6,
    },
    title: {
      fontSize: fontSize['2xl'],
      lineHeight: 30,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    stageSection: {
      paddingHorizontal: spacing.lg,
    },
    stageShell: {
      width: '100%',
      borderRadius: 28,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(24, 47, 80, 0.08)',
    },
    stageChrome: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.isDark
        ? 'rgba(3, 8, 16, 0.92)'
        : 'rgba(255,255,255,0.9)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(24, 47, 80, 0.06)',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyText: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
      textAlign: 'center',
      maxWidth: 280,
    },
    inlineAction: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    inlineActionText: {
      marginLeft: spacing.xs,
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    footer: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    footerButton: {
      flex: 1,
    },
    footerButtonSingle: {
      flex: 1,
    },
    actionDisabled: {
      opacity: 0.58,
    },
  });

export default ProfileImagePreviewModal;
