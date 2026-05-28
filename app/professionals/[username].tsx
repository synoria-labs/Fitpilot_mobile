import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, LoadingSpinner } from '../../src/components/common';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../src/constants/colors';
import {
  createProfessionalContactRequest,
  getPublicProfessionalByUsername,
  type PublicProfessionalDetail,
  type PublicProfessionalRole,
  type PublicProfessionalServiceMode,
} from '../../src/services/professionalDiscovery';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';

const ROLE_LABELS: Record<PublicProfessionalRole, string> = {
  nutritionist: 'Nutriólogo',
  trainer: 'Entrenador',
};

const SERVICE_MODE_LABELS: Record<PublicProfessionalServiceMode, string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrido',
};

const getFullName = (profile: PublicProfessionalDetail) =>
  [profile.name, profile.lastname].filter(Boolean).join(' ');

const getInitials = (profile: PublicProfessionalDetail) =>
  `${profile.name?.[0] ?? ''}${profile.lastname?.[0] ?? ''}`.toUpperCase() || 'FP';

const formatPrice = (profile: PublicProfessionalDetail | null) => {
  const amount = Number(profile?.consultation_price_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return `$${amount.toLocaleString('es-MX')} ${profile?.consultation_price_currency ?? 'MXN'}`;
};

const toSocialUrl = (platform: string, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (platform === 'instagram') return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
  if (platform === 'facebook') return `https://facebook.com/${trimmed.replace(/^@/, '')}`;
  if (platform === 'linkedin') {
    return trimmed.startsWith('linkedin.com')
      ? `https://${trimmed}`
      : `https://linkedin.com/in/${trimmed.replace(/^@/, '')}`;
  }
  return `https://${trimmed.replace(/^\/+/, '')}`;
};

export default function ProfessionalDetailScreen() {
  const params = useLocalSearchParams<{ username?: string; role?: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const [profile, setProfile] = useState<PublicProfessionalDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isContactModalVisible, setIsContactModalVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [shareContact, setShareContact] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);

  const requestedRole = useMemo<PublicProfessionalRole>(() => {
    if (roleParam === 'nutritionist' || roleParam === 'trainer') {
      return roleParam;
    }

    if (profile?.roles.includes('nutritionist')) {
      return 'nutritionist';
    }

    return profile?.roles[0] ?? 'trainer';
  }, [profile?.roles, roleParam]);

  const price = formatPrice(profile);
  const location = [profile?.public_city, profile?.public_state].filter(Boolean).join(', ');
  const socialLinks = profile
    ? Object.entries(profile.social_media)
        .map(([platform, value]) => ({
          platform,
          url: value ? toSocialUrl(platform, value) : null,
        }))
        .filter((item): item is { platform: string; url: string } => Boolean(item.url))
    : [];

  const loadProfile = useCallback(async () => {
    if (!username) {
      setError('Perfil no disponible.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getPublicProfessionalByUsername(username);
      setProfile(response);
    } catch (loadError) {
      setProfile(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar este perfil.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const sendContactRequest = async () => {
    if (!username || !shareContact) {
      return;
    }

    setIsSending(true);

    try {
      await createProfessionalContactRequest(username, {
        role: requestedRole,
        message: message.trim() || null,
        share_contact: true,
      });
      setHasSentRequest(true);
      setIsContactModalVisible(false);
      setMessage('');
      setShareContact(false);
      Alert.alert('Solicitud enviada', 'El profesional recibirá tus datos de contacto.');
    } catch (sendError: any) {
      if (sendError?.status === 409) {
        setHasSentRequest(true);
        setIsContactModalVisible(false);
        Alert.alert('Solicitud activa', 'Ya existe una solicitud pendiente con este profesional.');
        return;
      }

      Alert.alert(
        'No se pudo enviar',
        sendError instanceof Error
          ? sendError.message
          : 'Intenta de nuevo en unos momentos.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const openSocialLink = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Cargando perfil..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle}>Perfil</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        {error || !profile ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={34} color={theme.colors.error} />
            <Text style={styles.emptyTitle}>Perfil no disponible</Text>
            <Text style={styles.emptyText}>{error ?? 'Intenta con otro profesional.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              {profile.profile_picture ? (
                <Image source={{ uri: profile.profile_picture }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{getInitials(profile)}</Text>
                </View>
              )}
              <Text style={styles.name}>{getFullName(profile)}</Text>
              <Text style={styles.title}>{profile.title ?? 'Profesional FitPilot'}</Text>
              <View style={styles.badgeRow}>
                {profile.roles.map((role) => (
                  <View key={role} style={styles.badge}>
                    <Text style={styles.badgeText}>{ROLE_LABELS[role]}</Text>
                  </View>
                ))}
                {profile.public_service_mode ? (
                  <View style={styles.badgeMuted}>
                    <Text style={styles.badgeMutedText}>
                      {SERVICE_MODE_LABELS[profile.public_service_mode]}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Ionicons name="location-outline" size={18} color={theme.colors.iconMuted} />
                <Text style={styles.summaryLabel}>Ubicación</Text>
                <Text style={styles.summaryValue}>{location || 'No disponible'}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="card-outline" size={18} color={theme.colors.iconMuted} />
                <Text style={styles.summaryLabel}>Consulta</Text>
                <Text style={styles.summaryValue}>{price ?? 'No disponible'}</Text>
              </View>
            </View>

            {profile.specialties.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Especialidades</Text>
                <View style={styles.chips}>
                  {profile.specialties.map((specialty) => (
                    <View key={specialty} style={styles.specialtyChip}>
                      <Text style={styles.specialtyText}>{specialty}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {profile.biography ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Biografía</Text>
                <Text style={styles.bodyText}>{profile.biography}</Text>
              </View>
            ) : null}

            {socialLinks.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Links</Text>
                <View style={styles.socialRow}>
                  {socialLinks.map((link) => (
                    <Pressable
                      key={link.platform}
                      style={styles.socialButton}
                      onPress={() => void openSocialLink(link.url)}
                    >
                      <Text style={styles.socialText}>{link.platform}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Button
              title={hasSentRequest ? 'Solicitud enviada' : 'Me interesa'}
              onPress={() => setIsContactModalVisible(true)}
              disabled={hasSentRequest}
              fullWidth
              icon={<Ionicons name="send-outline" size={18} color="#fff" />}
              style={styles.cta}
            />
          </>
        )}
      </ScrollView>

      <Modal
        visible={isContactModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsContactModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enviar solicitud</Text>
              <Pressable onPress={() => setIsContactModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={styles.modalText}>
              Compartiremos tu nombre, correo y teléfono con {profile ? getFullName(profile) : 'este profesional'}.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Mensaje opcional"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.messageInput}
              multiline
              maxLength={1000}
            />
            <Pressable
              style={styles.consentRow}
              onPress={() => setShareContact((currentValue) => !currentValue)}
            >
              <View style={[styles.checkbox, shareContact ? styles.checkboxActive : null]}>
                {shareContact ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
              <Text style={styles.consentText}>
                Acepto compartir mis datos de contacto para que me respondan.
              </Text>
            </Pressable>
            <Button
              title="Enviar"
              onPress={sendContactRequest}
              disabled={!shareContact}
              isLoading={isSending}
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flexGrow: 1,
      padding: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    topBar: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    iconButtonPlaceholder: {
      width: 42,
      height: 42,
    },
    topBarTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    hero: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
    },
    avatarFallback: {
      width: 96,
      height: 96,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: '900',
      color: theme.colors.primary,
    },
    name: {
      marginTop: spacing.sm,
      textAlign: 'center',
      fontSize: fontSize['2xl'],
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    title: {
      textAlign: 'center',
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
    },
    badgeText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    badgeMuted: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    badgeMutedText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    summaryGrid: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    summaryItem: {
      flex: 1,
      gap: 4,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    summaryLabel: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    summaryValue: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    section: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sectionTitle: {
      fontSize: fontSize.base,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    specialtyChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    specialtyText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    bodyText: {
      fontSize: fontSize.sm,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },
    socialRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    socialButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
    },
    socialText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
      textTransform: 'capitalize',
    },
    cta: {
      marginTop: spacing.sm,
    },
    emptyState: {
      flex: 1,
      minHeight: 360,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    emptyText: {
      textAlign: 'center',
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    modalCard: {
      gap: spacing.md,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalTitle: {
      fontSize: fontSize.xl,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    modalText: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    messageInput: {
      minHeight: 110,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      color: theme.colors.textPrimary,
      textAlignVertical: 'top',
    },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    checkboxActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    consentText: {
      flex: 1,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
  });
