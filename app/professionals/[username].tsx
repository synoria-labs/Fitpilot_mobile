import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CalendarDatePickerPanel } from '../../src/components/calendar';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../src/constants/colors';
import {
  createProfessionalAppointment,
  createProfessionalContactRequest,
  getPublicProfessionalAvailability,
  getPublicProfessionalByUsername,
  recordProfessionalProfileView,
  type PublicProfessionalDetail,
  type ProfessionalAvailabilitySlot,
  type PublicProfessionalAvailabilityDay,
  type PublicProfessionalRole,
  type PublicProfessionalServiceMode,
  type ServiceType,
} from '../../src/services/professionalDiscovery';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import {
  addDaysToDateKey,
  formatLocalDate,
  toLocalDateKey,
} from '../../src/utils/date';

const ROLE_LABELS: Record<PublicProfessionalRole, string> = {
  nutritionist: 'Nutriólogo',
  trainer: 'Entrenador',
};

const SERVICE_MODE_LABELS: Record<PublicProfessionalServiceMode, string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrido',
};
const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  NUTRITION: 'Nutrición',
  TRAINING: 'Entrenamiento',
  BOTH: 'Ambas',
};
const DAY_LABELS: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};
const DEFAULT_REQUEST_DURATION_MINUTES = 60;
const AVAILABILITY_LOOKAHEAD_DAYS = 30;
const DEFAULT_CONTACT_REQUEST_MESSAGE =
  'Hola, me interesa agendar una primera cita. Me gustaría recibir más información para comenzar.';
type RequestModalMode = 'interest' | 'booking';

const getFullName = (profile: PublicProfessionalDetail) =>
  [profile.name, profile.lastname].filter(Boolean).join(' ');

const getInitials = (profile: PublicProfessionalDetail) =>
  `${profile.name?.[0] ?? ''}${profile.lastname?.[0] ?? ''}`.toUpperCase() || 'FP';

const getServicePriceAmount = (
  profile: PublicProfessionalDetail | null,
  serviceType?: ServiceType | null,
) => {
  const amount = Number(
    serviceType ? profile?.service_prices?.[serviceType] : profile?.consultation_price_amount,
  );

  if (Number.isFinite(amount) && amount > 0) {
    return amount;
  }

  if (serviceType === 'BOTH') {
    const nutritionAmount = Number(profile?.service_prices?.NUTRITION);
    const trainingAmount = Number(profile?.service_prices?.TRAINING);

    return Number.isFinite(nutritionAmount) &&
      nutritionAmount > 0 &&
      Number.isFinite(trainingAmount) &&
      trainingAmount > 0
      ? nutritionAmount + trainingAmount
      : null;
  }

  return null;
};

const formatPrice = (
  profile: PublicProfessionalDetail | null,
  serviceType?: ServiceType | null,
) => {
  const amount = getServicePriceAmount(profile, serviceType);
  if (amount === null) {
    return null;
  }

  const prefix =
    serviceType || (profile?.available_service_types?.length ?? 0) <= 1 ? '' : 'Desde ';

  return `${prefix}$${amount.toLocaleString('es-MX')} ${profile?.consultation_price_currency ?? 'MXN'}`;
};

const getFallbackRoleForService = (serviceType: ServiceType | null): PublicProfessionalRole =>
  serviceType === 'TRAINING' ? 'trainer' : 'nutritionist';

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

const parseTimeMinutes = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatSlotTime = (value?: string | null) => {
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`;
};

const buildAvailabilitySummary = (slots?: ProfessionalAvailabilitySlot[]) =>
  (slots ?? [])
    .filter((slot) => slot.is_active !== false && slot.day_of_week)
    .slice(0, 4)
    .map((slot) => {
      const start = formatSlotTime(slot.start_time);
      const end = formatSlotTime(slot.end_time);
      return `${DAY_LABELS[Number(slot.day_of_week)] ?? 'Día'}${
        start && end ? ` ${start}-${end}` : ''
      }`;
    });

const getAvailabilityRange = () => {
  const from = toLocalDateKey(new Date()) ?? '';
  return {
    from,
    to: addDaysToDateKey(from, AVAILABILITY_LOOKAHEAD_DAYS) ?? from,
  };
};

const formatAvailabilityDay = (dateKey: string | null) => {
  if (!dateKey) {
    return 'Elegir día';
  }

  return formatLocalDate(dateKey, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatAvailabilityTime = (value: string) =>
  new Date(value).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ProfessionalDetailScreen() {
  const params = useLocalSearchParams<{ username?: string; role?: string; service_type?: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const serviceTypeParam = Array.isArray(params.service_type)
    ? params.service_type[0]
    : params.service_type;
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const [profile, setProfile] = useState<PublicProfessionalDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isContactModalVisible, setIsContactModalVisible] = useState(false);
  const [requestModalMode, setRequestModalMode] = useState<RequestModalMode>('interest');
  const [message, setMessage] = useState('');
  const [shareContact, setShareContact] = useState(false);
  const [selectedRequestedStartAt, setSelectedRequestedStartAt] = useState<string | null>(null);
  const [selectedDurationMinutes] = useState(DEFAULT_REQUEST_DURATION_MINUTES);
  const [availabilityDays, setAvailabilityDays] = useState<PublicProfessionalAvailabilityDay[]>([]);
  const [selectedAvailabilityDateKey, setSelectedAvailabilityDateKey] = useState<string | null>(null);
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);
  const recordedViewUsernameRef = useRef<string | null>(null);

  const availableServiceTypes = useMemo(
    () => profile?.available_service_types ?? [],
    [profile?.available_service_types],
  );
  const clientRelationship = profile?.client_relationship ?? null;
  const bookableServiceTypes = useMemo(
    () => clientRelationship?.bookable_service_types ?? [],
    [clientRelationship?.bookable_service_types],
  );
  const modalServiceTypes =
    requestModalMode === 'booking' ? bookableServiceTypes : availableServiceTypes;
  const hasActiveClientRelationship = clientRelationship?.status === 'client';
  const hasOpenContactRequest =
    !hasActiveClientRelationship &&
    (hasSentRequest || clientRelationship?.status === 'prospect');
  const primaryCtaTitle = hasActiveClientRelationship
    ? 'Agendar cita'
    : hasOpenContactRequest
      ? clientRelationship?.latest_contact_request_status === 'scheduled'
        ? 'Cita pendiente'
        : 'Solicitud en curso'
      : 'Me interesa';
  const primaryCtaDisabled =
    hasOpenContactRequest ||
    (hasActiveClientRelationship && bookableServiceTypes.length === 0);
  const requestedRole = useMemo<PublicProfessionalRole>(
    () =>
      selectedServiceType
        ? getFallbackRoleForService(selectedServiceType)
        : roleParam === 'trainer' || roleParam === 'nutritionist'
          ? roleParam
          : 'nutritionist',
    [roleParam, selectedServiceType],
  );

  const price = formatPrice(profile);
  const selectedServicePrice = selectedServiceType
    ? formatPrice(profile, selectedServiceType)
    : null;
  const location = [profile?.public_city, profile?.public_state].filter(Boolean).join(', ');
  const availabilitySummary = useMemo(
    () => buildAvailabilitySummary(profile?.availability_slots),
    [profile?.availability_slots],
  );
  const availabilityRange = getAvailabilityRange();
  const selectedAvailabilityDay = useMemo(
    () => availabilityDays.find((day) => day.date === selectedAvailabilityDateKey) ?? null,
    [availabilityDays, selectedAvailabilityDateKey],
  );
  const disabledAvailabilityDateKeys = useMemo(
    () =>
      availabilityDays
        .filter((day) => !day.has_available_slots)
        .map((day) => day.date),
    [availabilityDays],
  );
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

  useEffect(() => {
    if (!profile) {
      setSelectedServiceType(null);
      return;
    }

    const services =
      profile.client_relationship?.status === 'client' &&
      profile.client_relationship.bookable_service_types.length > 0
        ? profile.client_relationship.bookable_service_types
        : profile.available_service_types ?? [];
    const requestedService =
      serviceTypeParam === 'NUTRITION' ||
      serviceTypeParam === 'TRAINING' ||
      serviceTypeParam === 'BOTH'
        ? serviceTypeParam
        : null;
    const legacyRequestedService =
      roleParam === 'trainer'
        ? 'TRAINING'
        : roleParam === 'nutritionist'
          ? 'NUTRITION'
          : null;

    setSelectedServiceType((currentServiceType) => {
      if (currentServiceType && services.includes(currentServiceType)) {
        return currentServiceType;
      }

      if (requestedService && services.includes(requestedService)) {
        return requestedService;
      }

      if (legacyRequestedService && services.includes(legacyRequestedService)) {
        return legacyRequestedService;
      }

      return services[0] ?? null;
    });
  }, [profile, roleParam, serviceTypeParam]);

  useEffect(() => {
    if (!profile || !username || recordedViewUsernameRef.current === username) {
      return;
    }

    recordedViewUsernameRef.current = username;
    void recordProfessionalProfileView(username).catch(() => undefined);
  }, [profile, username]);

  const loadAvailability = useCallback(async (
    options: { resetSelection?: boolean } = {},
  ) => {
    if (!username) {
      setIsLoadingAvailability(false);
      return;
    }

    const range = getAvailabilityRange();
    setIsLoadingAvailability(true);
    setAvailabilityError(null);

    try {
      const response = await getPublicProfessionalAvailability(username, {
        from: range.from,
        to: range.to,
        duration_minutes: selectedDurationMinutes,
      });
      const nextDays = response.items;
      const shouldResetSelection = options.resetSelection === true;

      setAvailabilityDays(nextDays);
      setSelectedAvailabilityDateKey((currentDateKey) => {
        if (
          !shouldResetSelection &&
          currentDateKey &&
          nextDays.some(
            (day) => day.date === currentDateKey && day.has_available_slots,
          )
        ) {
          return currentDateKey;
        }

        return null;
      });
      setSelectedRequestedStartAt((currentStartAt) => {
        if (
          !shouldResetSelection &&
          currentStartAt &&
          nextDays.some((day) =>
            day.slots.some(
              (slot) =>
                slot.start_at === currentStartAt && slot.status === 'available',
            ),
          )
        ) {
          return currentStartAt;
        }

        return null;
      });
    } catch (loadAvailabilityError) {
      setAvailabilityDays([]);
      setSelectedAvailabilityDateKey(null);
      setSelectedRequestedStartAt(null);
      setAvailabilityError(
        loadAvailabilityError instanceof Error
          ? loadAvailabilityError.message
          : 'No fue posible cargar la agenda.',
      );
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [selectedDurationMinutes, username]);

  useEffect(() => {
    if (!isContactModalVisible) {
      return;
    }

    void loadAvailability({ resetSelection: true });
  }, [isContactModalVisible, loadAvailability]);

  const closeContactModal = () => {
    setIsContactModalVisible(false);
  };

  const openContactModal = () => {
    setRequestModalMode('interest');
    if (!selectedServiceType && availableServiceTypes.length > 0) {
      setSelectedServiceType(availableServiceTypes[0]);
    }
    setAvailabilityDays([]);
    setSelectedAvailabilityDateKey(null);
    setSelectedRequestedStartAt(null);
    setAvailabilityError(null);
    setIsLoadingAvailability(true);
    setIsContactModalVisible(true);
  };

  const openBookingModal = () => {
    if (bookableServiceTypes.length === 0) {
      Alert.alert(
        'Sin servicios disponibles',
        'Este profesional no tiene servicios activos para agendar contigo.',
      );
      return;
    }

    setRequestModalMode('booking');
    if (!selectedServiceType || !bookableServiceTypes.includes(selectedServiceType)) {
      setSelectedServiceType(bookableServiceTypes[0]);
    }
    setAvailabilityDays([]);
    setSelectedAvailabilityDateKey(null);
    setSelectedRequestedStartAt(null);
    setAvailabilityError(null);
    setIsLoadingAvailability(true);
    setIsContactModalVisible(true);
  };

  const sendContactRequest = async () => {
    if (!username) {
      return;
    }

    const isBookingMode = requestModalMode === 'booking';

    if (!isBookingMode && !shareContact) {
      return;
    }

    if (!selectedServiceType) {
      Alert.alert('Elige un servicio', 'Selecciona el tipo de servicio que quieres solicitar.');
      return;
    }

    if (isBookingMode && !bookableServiceTypes.includes(selectedServiceType)) {
      Alert.alert('Elige un servicio', 'Selecciona un servicio activo para agendar.');
      return;
    }

    if (!selectedRequestedStartAt) {
      Alert.alert(
        'Elige un horario',
        isBookingMode
          ? 'Selecciona un horario para agendar la cita.'
          : 'Selecciona un horario tentativo para enviar la solicitud.',
      );
      return;
    }

    setIsSending(true);

    try {
      if (isBookingMode) {
        await createProfessionalAppointment(username, {
          service_type: selectedServiceType,
          scheduled_at: selectedRequestedStartAt,
          duration_minutes: selectedDurationMinutes,
        });
        closeContactModal();
        setSelectedRequestedStartAt(null);
        setSelectedAvailabilityDateKey(null);
        Alert.alert('Cita agendada', 'Tu cita quedó confirmada.');
        void loadProfile();
        return;
      }

      const requestMessage = message.trim() || DEFAULT_CONTACT_REQUEST_MESSAGE;
      const contactRequest = await createProfessionalContactRequest(username, {
        role: requestedRole,
        service_type: selectedServiceType,
        message: requestMessage,
        share_contact: true,
        requested_start_at: selectedRequestedStartAt,
        requested_duration_minutes: selectedDurationMinutes,
      });
      setHasSentRequest(true);
      closeContactModal();
      setMessage('');
      setShareContact(false);
      setSelectedRequestedStartAt(null);
      setSelectedAvailabilityDateKey(null);
      if (contactRequest.conversation_id) {
        router.push({
          pathname: '/chat' as never,
          params: { conversationId: String(contactRequest.conversation_id) },
        });
        return;
      }

      void loadProfile();
      Alert.alert('Solicitud enviada', 'El profesional recibirá tus datos de contacto.');
    } catch (sendError: any) {
      if (sendError?.status === 409) {
        setHasSentRequest(true);
        closeContactModal();
        Alert.alert('Solicitud activa', 'Ya existe una solicitud pendiente con este profesional.');
        return;
      }

      const errorMessage =
        sendError instanceof Error
          ? sendError.message
          : 'Intenta de nuevo en unos momentos.';
      if (/requested_start_at|scheduled_at|occupied|availability|horario|disponible/i.test(errorMessage)) {
        Alert.alert(
          'Horario no disponible',
          'Ese horario ya no está libre. Actualizamos la agenda para que elijas otro.',
        );
        setSelectedAvailabilityDateKey(null);
        setSelectedRequestedStartAt(null);
        void loadAvailability({ resetSelection: true });
        return;
      }

      Alert.alert(
        'No se pudo enviar',
        errorMessage,
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

            {availableServiceTypes.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Servicios</Text>
                <View style={styles.servicePriceRow}>
                  {availableServiceTypes.map((serviceType) => {
                    const servicePrice = formatPrice(profile, serviceType);

                    return (
                      <View key={serviceType} style={styles.servicePriceChip}>
                        <Text style={styles.servicePriceLabel}>
                          {SERVICE_TYPE_LABELS[serviceType]}
                        </Text>
                        {servicePrice ? (
                          <Text style={styles.servicePriceValue}>{servicePrice}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Disponibilidad</Text>
              {availabilitySummary.length > 0 ? (
                <View style={styles.availabilityRow}>
                  {availabilitySummary.map((slot) => (
                    <View key={slot} style={styles.availabilityChip}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.primary} />
                      <Text style={styles.availabilityText}>{slot}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.bodyText}>
                  Este profesional todavía no publicó horarios disponibles.
                </Text>
              )}
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
              title={primaryCtaTitle}
              onPress={hasActiveClientRelationship ? openBookingModal : openContactModal}
              disabled={primaryCtaDisabled}
              fullWidth
              icon={
                <Ionicons
                  name={hasActiveClientRelationship ? 'calendar-outline' : 'send-outline'}
                  size={18}
                  color="#fff"
                />
              }
              style={styles.cta}
            />
          </>
        )}
      </ScrollView>

      <Modal
        visible={isContactModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeContactModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {requestModalMode === 'booking' ? 'Agendar cita' : 'Enviar solicitud'}
              </Text>
              <Pressable onPress={closeContactModal}>
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalText}>
                {requestModalMode === 'booking'
                  ? `Agenda una cita con ${profile ? getFullName(profile) : 'este profesional'}.`
                  : `Compartiremos tu nombre, correo y teléfono con ${profile ? getFullName(profile) : 'este profesional'}.`}
              </Text>
              <View style={styles.slotSection}>
                <Text style={styles.slotTitle}>Servicio</Text>
                {modalServiceTypes.length > 0 ? (
                  <View style={styles.serviceGrid}>
                    {modalServiceTypes.map((serviceType) => {
                      const isSelected = selectedServiceType === serviceType;
                      const servicePrice = formatPrice(profile, serviceType);

                      return (
                        <Pressable
                          key={serviceType}
                          style={[
                            styles.serviceButton,
                            isSelected ? styles.serviceButtonActive : null,
                          ]}
                          onPress={() => setSelectedServiceType(serviceType)}
                        >
                          <Text
                            style={[
                              styles.serviceButtonTitle,
                              isSelected ? styles.serviceButtonTitleActive : null,
                            ]}
                          >
                            {SERVICE_TYPE_LABELS[serviceType]}
                          </Text>
                          {servicePrice ? (
                            <Text
                              style={[
                                styles.serviceButtonPrice,
                                isSelected ? styles.serviceButtonPriceActive : null,
                              ]}
                            >
                              {servicePrice}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="card-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>
                      {requestModalMode === 'booking'
                        ? 'No hay servicios activos para agendar.'
                        : 'Este profesional todavía no publicó precios disponibles.'}
                    </Text>
                  </View>
                )}
                {selectedServiceType && selectedServicePrice ? (
                  <Text style={styles.serviceSelectionHint}>
                    {SERVICE_TYPE_LABELS[selectedServiceType]} · {selectedServicePrice}
                  </Text>
                ) : null}
              </View>
              <View style={styles.slotSection}>
                <Text style={styles.slotTitle}>
                  {requestModalMode === 'booking' ? 'Día de la cita' : 'Día de la primera cita'}
                </Text>
                {isLoadingAvailability ? (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>Cargando agenda...</Text>
                  </View>
                ) : availabilityDays.length > 0 ? (
                  <View style={styles.inlineCalendar}>
                    <CalendarDatePickerPanel
                      selectedDate={selectedAvailabilityDateKey}
                      initialVisibleDate={selectedAvailabilityDateKey ?? availabilityRange.from}
                      minDate={availabilityRange.from}
                      maxDate={availabilityRange.to}
                      disabledDateKeys={disabledAvailabilityDateKeys}
                      isActive={isContactModalVisible}
                      onSelect={(date) => {
                        const dateKey = toLocalDateKey(date);
                        const nextDay = availabilityDays.find((day) => day.date === dateKey);
                        if (!dateKey || !nextDay?.has_available_slots) {
                          return;
                        }

                        setSelectedAvailabilityDateKey(dateKey);
                        setSelectedRequestedStartAt(null);
                      }}
                    />
                  </View>
                ) : (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>
                      No hay días disponibles en los próximos 30 días.
                    </Text>
                  </View>
                )}
                {availabilityError ? (
                  <Text style={styles.inlineError}>{availabilityError}</Text>
                ) : null}
              </View>
              <View style={styles.slotSection}>
                <View style={styles.slotHeaderRow}>
                  <Text style={styles.slotTitle}>Hora disponible</Text>
                  {selectedAvailabilityDateKey ? (
                    <Text style={styles.slotDateLabel}>
                      {formatAvailabilityDay(selectedAvailabilityDateKey)}
                    </Text>
                  ) : null}
                </View>
                {isLoadingAvailability ? (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="time-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>Cargando horarios disponibles...</Text>
                  </View>
                ) : !selectedAvailabilityDateKey ? (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>
                      Elige un día disponible para ver horarios.
                    </Text>
                  </View>
                ) : selectedAvailabilityDay?.slots.length ? (
                  <View style={styles.slotGrid}>
                    {selectedAvailabilityDay.slots.map((slot) => {
                      const isSelected = selectedRequestedStartAt === slot.start_at;
                      const isOccupied = slot.status !== 'available';

                      return (
                        <Pressable
                          key={slot.start_at}
                          disabled={isOccupied}
                          style={[
                            styles.slotButton,
                            isSelected ? styles.slotButtonActive : null,
                            isOccupied ? styles.slotButtonDisabled : null,
                          ]}
                          onPress={() => setSelectedRequestedStartAt(slot.start_at)}
                        >
                          <Text
                            style={[
                              styles.slotButtonText,
                              isSelected ? styles.slotButtonTextActive : null,
                              isOccupied ? styles.slotButtonTextDisabled : null,
                            ]}
                          >
                            {formatAvailabilityTime(slot.start_at)}
                          </Text>
                          {isOccupied ? (
                            <Text style={styles.slotStatusText}>Ocupado</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.noSlotsBox}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={styles.noSlotsText}>
                      No hay horarios libres para el día seleccionado.
                    </Text>
                  </View>
                )}
              </View>
              {requestModalMode === 'interest' ? (
                <>
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
                </>
              ) : null}
              <Button
                title={requestModalMode === 'booking' ? 'Agendar cita' : 'Enviar solicitud'}
                onPress={sendContactRequest}
                disabled={
                  (requestModalMode === 'interest' && !shareContact) ||
                  !selectedServiceType ||
                  !selectedRequestedStartAt ||
                  isLoadingAvailability
                }
                isLoading={isSending}
                fullWidth
              />
            </ScrollView>
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
    servicePriceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    servicePriceChip: {
      minWidth: '30%',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    servicePriceLabel: {
      fontSize: fontSize.xs,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    servicePriceValue: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    availabilityRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    availabilityChip: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    availabilityText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
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
      maxHeight: '90%',
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
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollContent: {
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    modalText: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    slotSection: {
      gap: spacing.sm,
    },
    slotTitle: {
      fontSize: fontSize.sm,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    serviceGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    serviceButton: {
      width: '48%',
      minHeight: 58,
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    serviceButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    serviceButtonTitle: {
      fontSize: fontSize.xs,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
    serviceButtonTitleActive: {
      color: '#fff',
    },
    serviceButtonPrice: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textMuted,
    },
    serviceButtonPriceActive: {
      color: '#fff',
    },
    serviceSelectionHint: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    slotHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    slotDateLabel: {
      flex: 1,
      textAlign: 'right',
      textTransform: 'capitalize',
      fontSize: fontSize.xs,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    inlineCalendar: {
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    inlineError: {
      fontSize: fontSize.xs,
      lineHeight: 18,
      color: theme.colors.error,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    slotButton: {
      width: '48%',
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    slotButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    slotButtonDisabled: {
      backgroundColor: theme.colors.inputBackground,
      borderColor: theme.colors.border,
      opacity: 0.7,
    },
    slotButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    slotButtonTextActive: {
      color: '#fff',
    },
    slotButtonTextDisabled: {
      color: theme.colors.textMuted,
    },
    slotStatusText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.textMuted,
    },
    noSlotsBox: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    noSlotsText: {
      flex: 1,
      fontSize: fontSize.xs,
      lineHeight: 18,
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
