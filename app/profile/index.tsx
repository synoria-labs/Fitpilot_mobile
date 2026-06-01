import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useCareTeam } from '../../src/hooks/useCareTeam';
import {
  getThemePreferenceLabel,
  useAppTheme,
  useThemedStyles,
} from '../../src/theme';
import {
  MEASUREMENT_PREFERENCE_LABELS,
  type MeasurementPreference,
  useMeasurementPreferenceStore,
} from '../../src/store/measurementPreferenceStore';
import {
  borderRadius,
  brandColors,
  fontSize,
  shadows,
  spacing,
} from '../../src/constants/colors';
import {
  ProfileImagePreviewModal,
} from '../../src/components/common';
import { getPrimaryScreenHorizontalPadding } from '../../src/utils/layout';
import { pickProfileImageFromLibrary } from '../../src/utils/profileImagePicker';
import {
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
  type AccountDeletionStatus,
} from '../../src/services/account';

type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
};

const MenuItem = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  danger = false,
}: MenuItemProps) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View
        style={[
          styles.menuIconContainer,
          danger ? styles.menuIconContainerDanger : null,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={danger ? theme.colors.error : theme.colors.icon}
        />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, danger ? styles.menuLabelDanger : null]}>
          {label}
        </Text>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      </View>
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.colors.iconMuted}
        />
      ) : null}
    </TouchableOpacity>
  );
};

const formatAccountDeletionDate = (dateValue: string | null | undefined) => {
  if (!dateValue) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
    }).format(new Date(dateValue));
  } catch {
    return dateValue;
  }
};

export default function ProfileScreen() {
  const { width, height } = useWindowDimensions();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const { user, logout, uploadAvatar } = useAuthStore();
  const {
    assignedCount,
    hasLoaded: hasLoadedCareTeam,
    isLoading: isLoadingCareTeam,
  } = useCareTeam(user?.id ?? null);
  const { preference, theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const measurementPreference = useMeasurementPreferenceStore(
    (state) => state.preference,
  );
  const initializeMeasurementPreference = useMeasurementPreferenceStore(
    (state) => state.initialize,
  );
  const setMeasurementPreference = useMeasurementPreferenceStore(
    (state) => state.setPreference,
  );
  const [hasProfileImageError, setHasProfileImageError] = useState(false);
  const [isProfileImagePreviewVisible, setIsProfileImagePreviewVisible] = useState(false);
  const [isProfileImageUploading, setIsProfileImageUploading] = useState(false);
  const [accountDeletionStatus, setAccountDeletionStatus] =
    useState<AccountDeletionStatus | null>(null);
  const [isAccountDeletionLoading, setIsAccountDeletionLoading] = useState(false);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

  useEffect(() => {
    setHasProfileImageError(false);
  }, [user?.profilePictureUrl]);

  useEffect(() => {
    let isMounted = true;

    if (!user?.id) {
      setAccountDeletionStatus(null);
      setIsAccountDeletionLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const loadAccountDeletionStatus = async () => {
      setIsAccountDeletionLoading(true);
      try {
        const nextStatus = await getAccountDeletionStatus();
        if (isMounted) {
          setAccountDeletionStatus(nextStatus);
        }
      } catch {
        if (isMounted) {
          setAccountDeletionStatus(null);
        }
      } finally {
        if (isMounted) {
          setIsAccountDeletionLoading(false);
        }
      }
    };

    void loadAccountDeletionStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const handleAvatarChange = async (uri: string) => {
    setIsProfileImageUploading(true);
    try {
      await uploadAvatar(uri);
    } finally {
      setIsProfileImageUploading(false);
    }
  };

  const handleCameraPress = async () => {
    if (isProfileImageUploading) {
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

      await handleAvatarChange(result.uri);
    } catch {
      Alert.alert(
        'No se pudo cambiar la foto',
        'Intenta de nuevo en un momento.',
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesion',
      'Estas seguro de que deseas cerrar sesion?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesion',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
    );
  };

  const handleRequestAccountDeletion = async () => {
    setIsAccountDeletionLoading(true);
    try {
      const nextStatus = await requestAccountDeletion();
      setAccountDeletionStatus(nextStatus);
      const scheduledLabel =
        formatAccountDeletionDate(nextStatus.scheduled_deletion_at) || '30 dias';
      Alert.alert(
        'Eliminacion programada',
        `Tu cuenta se eliminara automaticamente el ${scheduledLabel}. Puedes cancelar la solicitud desde Perfil antes de esa fecha.`,
      );
    } catch {
      Alert.alert(
        'No se pudo programar',
        'Intenta de nuevo en unos minutos o contacta a soporte.',
      );
    } finally {
      setIsAccountDeletionLoading(false);
    }
  };

  const handleCancelAccountDeletion = async () => {
    setIsAccountDeletionLoading(true);
    try {
      const nextStatus = await cancelAccountDeletion();
      setAccountDeletionStatus(nextStatus);
      Alert.alert(
        'Solicitud cancelada',
        'Tu cuenta seguira activa y no se eliminara automaticamente.',
      );
    } catch {
      Alert.alert(
        'No se pudo cancelar',
        'Intenta de nuevo en unos minutos o contacta a soporte.',
      );
    } finally {
      setIsAccountDeletionLoading(false);
    }
  };

  const handleAccountDeletionPress = () => {
    if (isAccountDeletionLoading) {
      return;
    }

    if (accountDeletionStatus?.requested) {
      const scheduledLabel = formatAccountDeletionDate(
        accountDeletionStatus.scheduled_deletion_at,
      );
      Alert.alert(
        'Eliminacion programada',
        scheduledLabel
          ? `Tu cuenta esta programada para eliminarse automaticamente el ${scheduledLabel}.`
          : 'Tu cuenta esta programada para eliminarse automaticamente.',
        [
          { text: 'Cerrar', style: 'cancel' },
          {
            text: 'Cancelar eliminacion',
            onPress: () => {
              void handleCancelAccountDeletion();
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Eliminar cuenta y datos',
      'Tu cuenta de cliente y los datos asociados se programaran para eliminarse automaticamente en 30 dias. Podras cancelar la solicitud desde Perfil antes de esa fecha.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Programar eliminacion',
          style: 'destructive',
          onPress: () => {
            void handleRequestAccountDeletion();
          },
        },
      ],
    );
  };

  const handleMeasurementPreferenceSelect = async (
    nextPreference: MeasurementPreference,
  ) => {
    try {
      await setMeasurementPreference(nextPreference);
    } catch {
      Alert.alert('Error', 'No se pudo guardar tu preferencia de unidades.');
    }
  };

  const handleMeasurementPreferencePress = () => {
    Alert.alert(
      'Unidades de medida',
      'Selecciona el sistema que quieres usar para mostrar tus medidas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Estados Unidos (USA)',
          onPress: () => {
            void handleMeasurementPreferenceSelect('us');
          },
        },
        {
          text: 'Mexico',
          onPress: () => {
            void handleMeasurementPreferenceSelect('mx');
          },
        },
      ],
    );
  };

  const accountDeletionValue = isAccountDeletionLoading
    ? 'Cargando'
    : accountDeletionStatus?.requested
      ? accountDeletionStatus.days_until_deletion !== null
        ? `${accountDeletionStatus.days_until_deletion} dias restantes`
        : 'Programada'
      : 'Automatica en 30 dias';

  const professionalsValue =
    !hasLoadedCareTeam && isLoadingCareTeam
      ? 'Cargando'
      : assignedCount > 0
        ? `${assignedCount} asignado${assignedCount > 1 ? 's' : ''}`
        : 'Sin asignacion';

  const profileImageUrl = user?.profilePictureUrl ?? undefined;
  const hasProfileImage = Boolean(profileImageUrl && !hasProfileImageError);
  const avatarContent = (
    <View style={styles.avatar}>
      {hasProfileImage ? (
        <Image
          source={{ uri: profileImageUrl }}
          style={styles.avatarImage}
          onError={() => setHasProfileImageError(true)}
        />
      ) : (
        <Ionicons name="person" size={40} color={theme.colors.primary} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Volver"
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.icon} />
          </TouchableOpacity>
          <Text style={styles.title}>Perfil</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: horizontalPadding,
              paddingBottom: spacing.xxl,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.userCard}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setIsProfileImagePreviewVisible(true)}
                style={styles.avatarPressable}
              >
                {avatarContent}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editAvatarButton,
                  isProfileImageUploading ? styles.editAvatarButtonDisabled : null,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  void handleCameraPress();
                }}
                disabled={isProfileImageUploading}
              >
                <Ionicons name="camera" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{user?.displayName || 'Usuario'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>Cliente</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.menuSection}>
            <MenuItem
              icon="people-outline"
              label="Tus profesionales"
              value={professionalsValue}
              onPress={() => router.push('/profile/professionals')}
            />
            <MenuItem
              icon="person-outline"
              label="Informacion personal"
              onPress={() => router.push('/profile/personal-info')}
            />
            <MenuItem
              icon="lock-closed-outline"
              label="Cambiar contraseña"
              onPress={() => router.push('/profile/change-password')}
            />
            <MenuItem
              icon="notifications-outline"
              label="Notificaciones"
              onPress={() => router.push('/profile/notifications-settings')}
            />
            <MenuItem
              icon="trash-outline"
              label="Eliminar cuenta y datos"
              value={accountDeletionValue}
              onPress={handleAccountDeletionPress}
              danger
            />
          </View>

          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.menuSection}>
            <MenuItem
              icon="moon-outline"
              label="Tema"
              value={getThemePreferenceLabel(preference)}
              onPress={() => router.push('/profile/theme-settings')}
            />
            <MenuItem
              icon="fitness-outline"
              label="Unidades de medida"
              value={MEASUREMENT_PREFERENCE_LABELS[measurementPreference]}
              onPress={handleMeasurementPreferencePress}
            />
            <MenuItem
              icon="heart-outline"
              label="Salud conectada"
              onPress={() => router.push('/profile/connected-health' as never)}
            />
          </View>

          <Text style={styles.sectionTitle}>Soporte</Text>
          <View style={styles.menuSection}>
            <MenuItem
              icon="help-circle-outline"
              label="Ayuda"
              onPress={() => router.push('/profile/help')}
            />
            <MenuItem
              icon="chatbubble-outline"
              label="Contactar soporte"
              onPress={() => router.push('/profile/contact-support')}
            />
            <MenuItem
              icon="document-text-outline"
              label="Terminos y condiciones"
              onPress={() => {
                const url =
                  process.env.EXPO_PUBLIC_TERMS_URL ||
                  'https://pro.fitpilot.fit/es/terms';
                if (url) {
                  Linking.openURL(url);
                } else {
                  Alert.alert('No configurado', 'Enlace no disponible.');
                }
              }}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Politica de privacidad"
              onPress={() => {
                const url =
                  process.env.EXPO_PUBLIC_PRIVACY_URL ||
                  'https://pro.fitpilot.fit/es/privacy';
                if (url) {
                  Linking.openURL(url);
                } else {
                  Alert.alert('No configurado', 'Enlace no disponible.');
                }
              }}
            />
          </View>

          <View style={styles.menuSection}>
            <MenuItem
              icon="log-out-outline"
              label="Cerrar sesion"
              onPress={handleLogout}
              showChevron={false}
              danger
            />
          </View>

          <Text style={styles.versionText}>FitPilot v1.0.0</Text>
        </ScrollView>

        <ProfileImagePreviewModal
          visible={isProfileImagePreviewVisible}
          imageUrl={profileImageUrl}
          title={user?.displayName || 'Foto de perfil'}
          onClose={() => setIsProfileImagePreviewVisible(false)}
          onChangeImage={handleAvatarChange}
          isUploading={isProfileImageUploading}
        />
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
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    title: {
      flex: 1,
      fontSize: fontSize['2xl'],
      fontWeight: 'bold',
      color: theme.colors.textPrimary,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    userCard: {
      backgroundColor: theme.isDark ? theme.colors.primarySoft : theme.colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.lg,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      borderColor:
        Platform.OS === 'android' && theme.isDark
          ? 'transparent'
          : theme.isDark
            ? theme.colors.primaryBorder
            : theme.colors.border,
      ...(Platform.OS === 'android' && theme.isDark
        ? {
            shadowColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
            elevation: 0,
          }
        : shadows.md),
    },
    avatarContainer: {
      position: 'relative',
      marginBottom: spacing.md,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.isDark ? theme.colors.surfaceAlt : theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarPressable: {
      borderRadius: 40,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    editAvatarButton: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: brandColors.navy,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.isDark ? theme.colors.primarySoft : theme.colors.surface,
    },
    editAvatarButtonDisabled: {
      opacity: 0.6,
    },
    userName: {
      fontSize: fontSize.xl,
      fontWeight: 'bold',
      color: theme.colors.textPrimary,
    },
    userEmail: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      marginTop: spacing.xs,
    },
    roleBadge: {
      backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.primarySoft,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    roleText: {
      fontSize: fontSize.xs,
      fontWeight: '500',
      color: theme.colors.primary,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    menuSection: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    menuIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    menuIconContainerDanger: {
      backgroundColor: `${theme.colors.error}18`,
    },
    menuContent: {
      flex: 1,
      marginLeft: spacing.md,
    },
    menuLabel: {
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
      fontWeight: '500',
    },
    menuLabelDanger: {
      color: theme.colors.error,
    },
    menuValue: {
      marginTop: 2,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    versionText: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
