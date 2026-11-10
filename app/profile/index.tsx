import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
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
  type MeasurementPreference,
  useMeasurementPreferenceStore,
} from '../../src/store/measurementPreferenceStore';
import {
  ProfileImagePreviewModal,
} from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { AuroraCard, AuroraSegmented, IconBadge } from '../../src/components/aurora';
import { auroraFont, getAuroraTokens, type AuroraTone } from '../../src/theme/aurora';
import { hapticError, hapticSuccess } from '../../src/utils/haptics';
import { useDailyActivity } from '../../src/hooks/useDailyActivity';
import { ProfileActivityOverview } from '../../src/components/profile/ProfileActivityOverview';
import { getConnectedHealthPlatformLabel } from '../../src/utils/connectedHealthAuthorization';
import type { ThemePreference } from '../../src/store/themeStore';
import {
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
  type AccountDeletionStatus,
} from '../../src/services/account';

const THEME_OPTIONS = (['light', 'dark', 'system'] as const).map(key => ({ key, label: getThemePreferenceLabel(key) }));

type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  tone?: AuroraTone;
  variant?: 'solid' | 'soft';
  inlineValue?: boolean;
  last?: boolean;
};

const MenuItem = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  danger = false,
  tone = 'blue',
  variant = 'solid',
  inlineValue = false,
  last = false,
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
      <IconBadge icon={icon} tone={danger ? 'rose' : tone} variant={danger ? 'soft' : variant} size={36} />
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, danger ? styles.menuLabelDanger : null]}>
          {label}
        </Text>
        {value && !inlineValue ? <Text style={styles.menuValue}>{value}</Text> : null}
      </View>
      {value && inlineValue ? <Text style={styles.inlineValue}>{value}</Text> : null}
      {!last ? <View style={styles.separator} /> : null}
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={17}
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
    summaries,
    hasLoaded: hasLoadedCareTeam,
    isLoading: isLoadingCareTeam,
  } = useCareTeam(user?.id ?? null);
  const { preference, setPreference } = useAppTheme();
  const activity = useDailyActivity({ weeks: 53, enabled: Boolean(user?.id) });
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
  const [isProfileImagePreviewVisible, setIsProfileImagePreviewVisible] = useState(false);
  const [isProfileImageUploading, setIsProfileImageUploading] = useState(false);
  const [accountDeletionStatus, setAccountDeletionStatus] =
    useState<AccountDeletionStatus | null>(null);
  const [isAccountDeletionLoading, setIsAccountDeletionLoading] = useState(false);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

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

  const handleEdit = () => {
    Alert.alert('Editar perfil', 'Elige qué quieres actualizar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Información personal', onPress: () => router.push('/profile/personal-info') },
      { text: 'Foto de perfil', onPress: () => setIsProfileImagePreviewVisible(true) },
    ]);
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
      : 'Se borra todo 30 días después de pedirlo';

  const professionalName = summaries.training?.fullName || summaries.nutrition?.fullName;
  const professionalsValue =
    !hasLoadedCareTeam && isLoadingCareTeam
      ? 'Cargando'
      : assignedCount > 0
        ? `${assignedCount} asignado${assignedCount > 1 ? 's' : ''}${assignedCount === 1 && professionalName ? ` · ${professionalName}` : ''}`
        : 'Sin asignación';

  const connection = activity.healthConnection;
  const healthValue = connection
    ? `${getConnectedHealthPlatformLabel(connection.platform)} · ${connection.status === 'active' ? 'conectado' : 'revisar conexión'}`
    : activity.healthFailed ? 'No disponible' : !activity.hasLoaded ? 'Cargando' : 'Conecta tu app de salud';

  const profileImageUrl = user?.profilePictureUrl ?? undefined;

  return (
    <>
      <ProfileDetailScreen
        overview
        headerRight={(
          <TouchableOpacity style={styles.editButton} accessibilityRole="button" accessibilityLabel="Editar perfil" onPress={handleEdit}>
            <Ionicons name="pencil-outline" size={16} color={styles.menuLabel.color} />
            <Text style={styles.editLabel}>Editar</Text>
          </TouchableOpacity>
        )}
      >
          <ProfileActivityOverview {...activity} />

          <Text style={styles.sectionTitle}>Cuenta</Text>
          <AuroraCard padding={0} radius={22} style={styles.menuSection}>
            <MenuItem
              icon="people-outline"
              label="Tus profesionales"
              value={professionalsValue}
              onPress={() => router.push('/profile/professionals')}
            />
            <MenuItem
              icon="person-outline"
              label="Información personal"
              tone="violet"
              onPress={() => router.push('/profile/personal-info')}
            />
            <MenuItem
              icon="lock-closed-outline"
              label="Seguridad y contraseña"
              tone="slate"
              onPress={() => router.push('/profile/change-password')}
            />
            <MenuItem
              icon="notifications-outline"
              label="Notificaciones"
              tone="amber"
              last
              onPress={() => router.push('/profile/notifications-settings')}
            />
          </AuroraCard>

          <Text style={styles.sectionTitle}>Preferencias</Text>
          <AuroraCard padding={0} radius={22} style={styles.menuSection}>
            <View style={styles.themeSection}>
              <View style={styles.themeTitle}>
                <IconBadge icon="moon-outline" tone="violet" variant="solid" />
                <Text style={styles.menuLabel}>Tema</Text>
              </View>
              <AuroraSegmented<ThemePreference> options={THEME_OPTIONS} value={preference} onChange={value => void setPreference(value)} accessibilityLabel="Tema de la app" />
            </View>
            <MenuItem
              icon="fitness-outline"
              label="Unidades"
              tone="emerald"
              inlineValue
              value={measurementPreference === 'mx' ? 'kg · cm' : 'lb · in'}
              onPress={handleMeasurementPreferencePress}
            />
            <MenuItem
              icon="heart-outline"
              label="Salud conectada"
              tone="rose"
              last
              value={healthValue}
              onPress={() => router.push('/profile/connected-health' as never)}
            />
          </AuroraCard>

          <Text style={styles.sectionTitle}>Soporte</Text>
          <AuroraCard padding={0} radius={22} style={styles.menuSection}>
            <MenuItem
              icon="help-circle-outline"
              label="Ayuda"
              tone="slate"
              variant="soft"
              onPress={() => router.push('/profile/help')}
            />
            <MenuItem
              icon="chatbubble-outline"
              label="Contactar soporte"
              tone="slate"
              variant="soft"
              onPress={() => router.push('/profile/contact-support')}
            />
            <MenuItem
              icon="document-text-outline"
              label="Términos y condiciones"
              tone="slate"
              variant="soft"
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
              last
              tone="slate"
              variant="soft"
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

          <Text style={[styles.sectionTitle, styles.menuLabelDanger]}>Zona sensible</Text>
          <AuroraCard padding={0} radius={22} style={styles.dangerSection}>
            <MenuItem
              icon="trash-outline"
              label="Eliminar cuenta y datos"
              value={accountDeletionValue}
              onPress={handleAccountDeletionPress}
              danger
              last
            />
          </AuroraCard>
          <TouchableOpacity style={styles.logoutButton} accessibilityRole="button" onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={styles.menuLabelDanger.color} />
            <Text style={styles.logoutLabel}>Cerrar sesión</Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>FitPilot {Constants.expoConfig?.version}</Text>
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
    editButton: {
      height: 44, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center',
      borderRadius: 14, backgroundColor: aurora.glass, borderWidth: 1, borderColor: aurora.glassBorder,
    },
    editLabel: { ...auroraFont('bold'), fontSize: 14, color: aurora.text },
    sectionTitle: {
      ...auroraFont('extrabold'), fontSize: 11, color: aurora.faint,
      textTransform: 'uppercase', letterSpacing: 1.54, marginTop: 24, marginBottom: 10, marginLeft: 6,
    },
    menuSection: { paddingVertical: 4, overflow: 'hidden' },
    menuItem: {
      minHeight: 60, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 8, gap: 14,
    },
    separator: { position: 'absolute', bottom: 0, left: 64, right: 0, height: 1, backgroundColor: aurora.border },
    menuContent: { flex: 1, minWidth: 0 },
    menuLabel: { ...auroraFont('bold'), fontSize: 15, color: aurora.text },
    menuLabelDanger: { color: aurora.tones.rose.ink },
    menuValue: { ...auroraFont('medium'), marginTop: 1, fontSize: 12, color: aurora.faint },
    inlineValue: { ...auroraFont('medium'), fontSize: 13, color: aurora.faint },
    themeSection: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
    themeTitle: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    dangerSection: { borderColor: aurora.tones.rose.line, overflow: 'hidden' },
    logoutButton: {
      marginTop: 24, padding: 16, borderRadius: 16, flexDirection: 'row', gap: 8,
      justifyContent: 'center', alignItems: 'center', backgroundColor: aurora.tones.rose.soft,
      borderWidth: 1, borderColor: aurora.tones.rose.line,
    },
    logoutLabel: { ...auroraFont('bold'), fontSize: 14, color: aurora.tones.rose.ink },
    versionText: { ...auroraFont('medium'), fontSize: 11, color: aurora.faint, textAlign: 'center', marginTop: 16 },
  });
};
