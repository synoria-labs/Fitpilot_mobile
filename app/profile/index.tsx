import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { toast } from '../../src/store/toastStore';
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
  spacing,
} from '../../src/constants/colors';
import {
  ProfileImagePreviewModal,
} from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { AuroraCard, AuroraPill, IconBadge } from '../../src/components/aurora';
import { auroraFont, getAuroraTokens, type AuroraTone } from '../../src/theme/aurora';
import { hapticError, hapticSuccess } from '../../src/utils/haptics';
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
  tone?: AuroraTone;
};

const MenuItem = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  danger = false,
  tone = 'blue',
}: MenuItemProps) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
    >
      <IconBadge icon={icon} tone={danger ? 'rose' : tone} size={40} />
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
        hapticError();
        toast.error(
          'Permiso requerido',
          'Necesitamos acceso a tu galería para actualizar tu foto de perfil.',
        );
        return;
      }

      if (result.status !== 'selected') {
        return;
      }

      await handleAvatarChange(result.uri);
    } catch {
      hapticError();
      toast.error(
        'No se pudo cambiar la foto',
        'Intenta de nuevo en un momento.',
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
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
        formatAccountDeletionDate(nextStatus.scheduled_deletion_at) || '30 días';
      hapticSuccess();
      toast.success(
        'Eliminación programada',
        `Tu cuenta se eliminará automáticamente el ${scheduledLabel}. Puedes cancelar la solicitud desde Perfil antes de esa fecha.`,
      );
    } catch {
      hapticError();
      toast.error(
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
      hapticSuccess();
      toast.success(
        'Solicitud cancelada',
        'Tu cuenta seguirá activa y no se eliminará automáticamente.',
      );
    } catch {
      hapticError();
      toast.error(
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
        'Eliminación programada',
        scheduledLabel
          ? `Tu cuenta está programada para eliminarse automáticamente el ${scheduledLabel}.`
          : 'Tu cuenta está programada para eliminarse automáticamente.',
        [
          { text: 'Cerrar', style: 'cancel' },
          {
            text: 'Cancelar eliminación',
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
      'Tu cuenta de cliente y los datos asociados se programarán para eliminarse automáticamente en 30 días. Podrás cancelar la solicitud desde Perfil antes de esa fecha.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Programar eliminación',
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
      hapticError();
      toast.error('No se pudo guardar tu preferencia de unidades.');
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
          text: 'México',
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
        ? `${accountDeletionStatus.days_until_deletion} días restantes`
        : 'Programada'
      : 'Automática en 30 días';

  const professionalsValue =
    !hasLoadedCareTeam && isLoadingCareTeam
      ? 'Cargando'
      : assignedCount > 0
        ? `${assignedCount} asignado${assignedCount > 1 ? 's' : ''}`
        : 'Sin asignación';

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
        <Ionicons name="person" size={40} color={getAuroraTokens(theme.isDark).tones.violet.ink} />
      )}
    </View>
  );

  return (
    <>
      <ProfileDetailScreen title="Perfil" subtitle="Tu cuenta, tus preferencias y tu equipo.">
          <AuroraCard style={styles.userCard} padding={24}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setIsProfileImagePreviewVisible(true)}
                style={styles.avatarPressable}
                accessibilityRole="button"
                accessibilityLabel="Ver foto de perfil"
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
                accessibilityRole="button"
                accessibilityLabel="Cambiar foto de perfil"
                accessibilityState={{ disabled: isProfileImageUploading, busy: isProfileImageUploading }}
              >
                <Ionicons name="camera" size={18} color={getAuroraTokens(theme.isDark).onTone} />
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{user?.displayName || 'Usuario'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <AuroraPill label="Cliente" tone="violet" icon="person-outline" />
            </View>
          </AuroraCard>

          <Text style={styles.sectionTitle}>Cuenta</Text>
          <AuroraCard padding={0} style={styles.menuSection}>
            <MenuItem
              icon="people-outline"
              label="Tus profesionales"
              value={professionalsValue}
              onPress={() => router.push('/profile/professionals')}
            />
            <MenuItem
              icon="person-outline"
              label="Información personal"
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
          </AuroraCard>

          <Text style={styles.sectionTitle}>Preferencias</Text>
          <AuroraCard padding={0} style={styles.menuSection}>
            <MenuItem
              icon="moon-outline"
              label="Tema"
              tone="violet"
              value={getThemePreferenceLabel(preference)}
              onPress={() => router.push('/profile/theme-settings')}
            />
            <MenuItem
              icon="fitness-outline"
              label="Unidades de medida"
              tone="violet"
              value={MEASUREMENT_PREFERENCE_LABELS[measurementPreference]}
              onPress={handleMeasurementPreferencePress}
            />
            <MenuItem
              icon="heart-outline"
              label="Salud conectada"
              tone="violet"
              onPress={() => router.push('/profile/connected-health' as never)}
            />
          </AuroraCard>

          <Text style={styles.sectionTitle}>Soporte</Text>
          <AuroraCard padding={0} style={styles.menuSection}>
            <MenuItem
              icon="help-circle-outline"
              label="Ayuda"
              tone="slate"
              onPress={() => router.push('/profile/help')}
            />
            <MenuItem
              icon="chatbubble-outline"
              label="Contactar soporte"
              tone="slate"
              onPress={() => router.push('/profile/contact-support')}
            />
            <MenuItem
              icon="document-text-outline"
              label="Términos y condiciones"
              tone="slate"
              onPress={() => {
                const url =
                  process.env.EXPO_PUBLIC_TERMS_URL ||
                  'https://pro.fitpilot.fit/es/terms';
                if (url) {
                  Linking.openURL(url);
                } else {
                  hapticError();
                  toast.error('Enlace no disponible.');
                }
              }}
            />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Política de privacidad"
              tone="slate"
              onPress={() => {
                const url =
                  process.env.EXPO_PUBLIC_PRIVACY_URL ||
                  'https://pro.fitpilot.fit/es/privacy';
                if (url) {
                  Linking.openURL(url);
                } else {
                  hapticError();
                  toast.error('Enlace no disponible.');
                }
              }}
            />
          </AuroraCard>

          <AuroraCard padding={0} style={styles.menuSection}>
            <MenuItem
              icon="log-out-outline"
              label="Cerrar sesión"
              onPress={handleLogout}
              showChevron={false}
              danger
            />
          </AuroraCard>

          <Text style={styles.versionText}>FitPilot v1.0.0</Text>
      </ProfileDetailScreen>

        <ProfileImagePreviewModal
          visible={isProfileImagePreviewVisible}
          imageUrl={profileImageUrl}
          title={user?.displayName || 'Foto de perfil'}
          onClose={() => setIsProfileImagePreviewVisible(false)}
          onChangeImage={handleAvatarChange}
          isUploading={isProfileImageUploading}
        />
    </>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) => {
  const aurora = getAuroraTokens(theme.isDark);
  return StyleSheet.create({
    userCard: { alignItems: 'center', marginBottom: spacing.xl },
    avatarContainer: { position: 'relative', marginBottom: spacing.md },
    avatar: {
      width: 96, height: 96, borderRadius: 48, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: aurora.tones.violet.soft,
      borderWidth: 3, borderColor: aurora.tones.violet.line,
    },
    avatarPressable: { borderRadius: 48 },
    avatarImage: { width: '100%', height: '100%' },
    editAvatarButton: {
      position: 'absolute', right: -8, bottom: -4, width: 44, height: 44,
      borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      backgroundColor: aurora.tones.blue.gradient[0], borderWidth: 3, borderColor: aurora.surface,
    },
    editAvatarButtonDisabled: { opacity: 0.6 },
    userName: { ...auroraFont('extrabold'), fontSize: 24, color: aurora.text, textAlign: 'center' },
    userEmail: { ...auroraFont('medium'), fontSize: 13, color: aurora.faint, marginTop: 6, textAlign: 'center' },
    roleBadge: { marginTop: 12 },
    sectionTitle: {
      ...auroraFont('bold'), fontSize: 11, color: aurora.faint,
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, marginLeft: 4,
    },
    menuSection: { marginBottom: spacing.lg, overflow: 'hidden' },
    menuItem: {
      minHeight: 72, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14, gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: aurora.border,
    },
    menuContent: { flex: 1, minWidth: 0 },
    menuLabel: { ...auroraFont('semibold'), fontSize: 14, color: aurora.text },
    menuLabelDanger: { color: theme.colors.error },
    menuValue: { ...auroraFont('medium'), marginTop: 4, fontSize: 12, color: aurora.faint },
    versionText: { ...auroraFont('medium'), fontSize: 11, color: aurora.faint, textAlign: 'center', marginTop: spacing.sm },
  });
};
