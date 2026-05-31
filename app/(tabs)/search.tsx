import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LoadingSpinner,
  SegmentedControl,
  TabScreenWrapper,
} from '../../src/components/common';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../src/constants/colors';
import { useBottomTabBarContentInset } from '../../src/hooks/useBottomTabBarVisibility';
import {
  listPublicProfessionals,
  type PublicProfessionalCard,
  type PublicProfessionalRole,
  type PublicProfessionalServiceMode,
  type ServiceType,
} from '../../src/services/professionalDiscovery';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import { getPrimaryScreenHorizontalPadding } from '../../src/utils/layout';

type ServiceTypeFilter = 'all' | ServiceType;
type ServiceModeFilter = 'all' | PublicProfessionalServiceMode;
type PriceFilter = 'all' | 'under_500' | '500_1000' | '1000_plus';

const SERVICE_TYPE_OPTIONS = [
  { key: 'all', label: 'Todos' },
  { key: 'NUTRITION', label: 'Nutricion' },
  { key: 'TRAINING', label: 'Entreno' },
  { key: 'BOTH', label: 'Ambas' },
] satisfies { key: ServiceTypeFilter; label: string }[];

const SERVICE_MODE_OPTIONS = [
  { key: 'all', label: 'Todo' },
  { key: 'online', label: 'En linea' },
  { key: 'in_person', label: 'Presencial' },
  { key: 'hybrid', label: 'Hibrido' },
] satisfies { key: ServiceModeFilter; label: string }[];

const PRICE_OPTIONS = [
  { key: 'all', label: 'Cualquiera' },
  { key: 'under_500', label: '< $500' },
  { key: '500_1000', label: '$500-$1,000' },
  { key: '1000_plus', label: '$1,000+' },
] satisfies { key: PriceFilter; label: string }[];

const ROLE_LABELS: Record<PublicProfessionalRole, string> = {
  nutritionist: 'Nutriologo',
  trainer: 'Entrenador',
};

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  NUTRITION: 'Nutricion',
  TRAINING: 'Entrenamiento',
  BOTH: 'Ambas',
};

const SERVICE_MODE_LABELS: Record<PublicProfessionalServiceMode, string> = {
  online: 'En linea',
  in_person: 'Presencial',
  hybrid: 'Hibrido',
};

const getInitials = (profile: PublicProfessionalCard) =>
  `${profile.name?.[0] ?? ''}${profile.lastname?.[0] ?? ''}`.toUpperCase() || 'FP';

const getFullName = (profile: PublicProfessionalCard) =>
  [profile.name, profile.lastname].filter(Boolean).join(' ');

const getServicePriceAmount = (
  profile: PublicProfessionalCard,
  serviceType?: ServiceType | null,
) => {
  if (serviceType) {
    const amount = Number(profile.service_prices?.[serviceType]);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }

    if (serviceType === 'BOTH') {
      const nutritionAmount = Number(profile.service_prices?.NUTRITION);
      const trainingAmount = Number(profile.service_prices?.TRAINING);

      return Number.isFinite(nutritionAmount) &&
        nutritionAmount > 0 &&
        Number.isFinite(trainingAmount) &&
        trainingAmount > 0
        ? nutritionAmount + trainingAmount
        : null;
    }

    return null;
  }

  const amount = Number(profile.consultation_price_amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const formatPrice = (
  profile: PublicProfessionalCard,
  serviceType?: ServiceType | null,
) => {
  const amount = getServicePriceAmount(profile, serviceType);
  if (amount === null || amount <= 0) {
    return null;
  }

  const prefix =
    serviceType || (profile.available_service_types?.length ?? 0) <= 1 ? '' : 'Desde ';

  return `${prefix}$${amount.toLocaleString('es-MX')} ${profile.consultation_price_currency ?? 'MXN'}`;
};

const getPriceRange = (priceFilter: PriceFilter) => {
  if (priceFilter === 'under_500') return { max_price: 499 };
  if (priceFilter === '500_1000') return { min_price: 500, max_price: 1000 };
  if (priceFilter === '1000_plus') return { min_price: 1000 };
  return {};
};

const getOptionLabel = <T extends string>(options: { key: T; label: string }[], value: T) =>
  options.find((option) => option.key === value)?.label ?? '';

const getInitialServiceTypeForProfile = (
  profile: PublicProfessionalCard,
  serviceTypeFilter: ServiceTypeFilter,
) => {
  const relationship = profile.client_relationship;
  const preferredServiceTypes =
    relationship?.status === 'client' && relationship.bookable_service_types.length > 0
      ? relationship.bookable_service_types
      : profile.available_service_types;

  if (
    serviceTypeFilter !== 'all' &&
    preferredServiceTypes.includes(serviceTypeFilter)
  ) {
    return serviceTypeFilter;
  }

  if (
    serviceTypeFilter !== 'all' &&
    profile.available_service_types.includes(serviceTypeFilter)
  ) {
    return serviceTypeFilter;
  }

  return preferredServiceTypes[0] ?? profile.available_service_types?.[0] ?? 'NUTRITION';
};

const getRelationshipActionLabel = (profile: PublicProfessionalCard) => {
  const relationship = profile.client_relationship;

  if (relationship?.status === 'client') {
    return 'Agendar cita';
  }

  if (relationship?.status === 'prospect') {
    return relationship.latest_contact_request_status === 'scheduled'
      ? 'Cita pendiente'
      : 'Solicitud en curso';
  }

  return 'Me interesa';
};

export default function SearchProfessionalsScreen() {
  const { width, height } = useWindowDimensions();
  const contentInsetBottom = useBottomTabBarContentInset();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>('all');
  const [serviceModeFilter, setServiceModeFilter] = useState<ServiceModeFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [professionals, setProfessionals] = useState<PublicProfessionalCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    serviceTypeFilter !== 'all' ||
    serviceModeFilter !== 'all' ||
    priceFilter !== 'all';
  const resultCountLabel = isLoading
    ? 'Buscando...'
    : error
      ? 'Catalogo no disponible'
      : `${professionals.length} resultado${professionals.length === 1 ? '' : 's'}`;
  const secondaryFilterCount = Number(serviceModeFilter !== 'all') + Number(priceFilter !== 'all');
  const serviceModeLabel = getOptionLabel(SERVICE_MODE_OPTIONS, serviceModeFilter);
  const priceLabel = getOptionLabel(PRICE_OPTIONS, priceFilter);
  const filterSummary = secondaryFilterCount > 0
    ? [serviceModeFilter !== 'all' ? serviceModeLabel : null, priceFilter !== 'all' ? priceLabel : null]
        .filter(Boolean)
        .join(' - ')
    : 'Modalidad y precio';

  const requestParams = useMemo(
    () => ({
      q: searchQuery.trim() || undefined,
      service_type: serviceTypeFilter === 'all' ? undefined : serviceTypeFilter,
      service_mode: serviceModeFilter === 'all' ? undefined : serviceModeFilter,
      page: 1,
      limit: 30,
      ...getPriceRange(priceFilter),
    }),
    [priceFilter, searchQuery, serviceModeFilter, serviceTypeFilter],
  );

  const loadProfessionals = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await listPublicProfessionals(requestParams);
        setProfessionals(response.items);
      } catch (loadError) {
        setProfessionals([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar profesionales.',
        );
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [requestParams],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadProfessionals();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadProfessionals]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setServiceTypeFilter('all');
    setServiceModeFilter('all');
    setPriceFilter('all');
    setIsFiltersExpanded(false);
  }, []);

  const openProfessional = (profile: PublicProfessionalCard) => {
    const requestedServiceType = getInitialServiceTypeForProfile(
      profile,
      serviceTypeFilter,
    );

    router.push({
      pathname: '/professionals/[username]' as never,
      params: {
        username: profile.username,
        service_type: requestedServiceType,
      },
    });
  };

  return (
    <TabScreenWrapper>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: horizontalPadding,
              paddingBottom: contentInsetBottom + spacing.xl,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadProfessionals('refresh')}
              tintColor={theme.colors.primary}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Buscar</Text>
              <Text style={styles.title}>Profesionales</Text>
              <Text style={styles.headerSubtitle}>{resultCountLabel}</Text>
            </View>
            {hasActiveFilters ? (
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Ionicons name="close-circle-outline" size={15} color={theme.colors.primary} />
                <Text style={styles.clearButtonText}>Limpiar</Text>
              </Pressable>
            ) : (
              <View style={styles.headerIcon}>
                <Ionicons name="search" size={20} color={theme.colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={theme.colors.iconMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Nombre, ciudad o especialidad"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.iconMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterGroup}>
            <SegmentedControl
              options={SERVICE_TYPE_OPTIONS}
              value={serviceTypeFilter}
              onChange={setServiceTypeFilter}
              size="compact"
            />

            <Pressable
              style={styles.filterSummaryBar}
              onPress={() => setIsFiltersExpanded((currentValue) => !currentValue)}
            >
              <View style={styles.filterSummaryIcon}>
                <Ionicons name="options-outline" size={16} color={theme.colors.primary} />
              </View>
              <View style={styles.filterSummaryCopy}>
                <Text style={styles.filterSummaryTitle}>Filtros</Text>
                <Text style={styles.filterSummaryText} numberOfLines={1}>
                  {filterSummary}
                </Text>
              </View>
              {secondaryFilterCount > 0 ? (
                <View style={styles.filterCountPill}>
                  <Text style={styles.filterCountText}>{secondaryFilterCount}</Text>
                </View>
              ) : null}
              <Ionicons
                name={isFiltersExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={16}
                color={theme.colors.iconMuted}
              />
            </Pressable>

            {isFiltersExpanded ? (
              <View style={styles.filterPanel}>
                <Text style={styles.filterPanelLabel}>Modalidad</Text>
                <FilterRow
                  options={SERVICE_MODE_OPTIONS}
                  value={serviceModeFilter}
                  onChange={setServiceModeFilter}
                />
                <Text style={styles.filterPanelLabel}>Precio</Text>
                <FilterRow
                  options={PRICE_OPTIONS}
                  value={priceFilter}
                  onChange={setPriceFilter}
                />
              </View>
            ) : null}
          </View>

          {isLoading ? (
            <View style={styles.centerState}>
              <LoadingSpinner text="Cargando profesionales..." />
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={28} color={theme.colors.error} />
              <Text style={styles.emptyTitle}>No pudimos cargar el catalogo</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : professionals.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={28} color={theme.colors.iconMuted} />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>
                Prueba con otra especialidad, ciudad o rango de precio.
              </Text>
            </View>
          ) : (
            <View style={styles.results}>
              {professionals.map((profile) => (
                <ProfessionalCard
                  key={profile.username}
                  profile={profile}
                  selectedServiceType={serviceTypeFilter === 'all' ? null : serviceTypeFilter}
                  onPress={() => openProfessional(profile)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </TabScreenWrapper>
  );
}

interface FilterRowProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function FilterRow<T extends string>({ options, value, onChange }: FilterRowProps<T>) {
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {options.map((option) => {
        const isActive = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface ProfessionalCardProps {
  profile: PublicProfessionalCard;
  selectedServiceType: ServiceType | null;
  onPress: () => void;
}

function ProfessionalCard({ profile, selectedServiceType, onPress }: ProfessionalCardProps) {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const price = formatPrice(profile, selectedServiceType);
  const location = [profile.public_city, profile.public_state].filter(Boolean).join(', ');
  const roleSummary = profile.roles.map((role) => ROLE_LABELS[role]).join(' / ');
  const serviceSummary = profile.available_service_types?.length
    ? profile.available_service_types.map((serviceType) => SERVICE_TYPE_LABELS[serviceType]).join(' / ')
    : null;
  const serviceModeSummary = profile.public_service_mode
    ? SERVICE_MODE_LABELS[profile.public_service_mode]
    : null;
  const professionalMeta = [serviceSummary ?? roleSummary, serviceModeSummary].filter(Boolean).join(' - ');
  const actionLabel = getRelationshipActionLabel(profile);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        {profile.profile_picture ? (
          <Image source={{ uri: profile.profile_picture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(profile)}</Text>
          </View>
        )}
        <View style={styles.cardIdentity}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {getFullName(profile)}
            </Text>
            {price ? (
              <View style={styles.pricePill}>
                <Text style={styles.price} numberOfLines={1}>{price}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {profile.title ?? 'Profesional FitPilot'}
          </Text>
          {professionalMeta ? (
            <Text style={styles.professionalMeta} numberOfLines={1}>
              {professionalMeta}
            </Text>
          ) : null}
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={theme.colors.iconMuted} />
            <Text style={styles.location} numberOfLines={1}>
              {location || 'Ubicacion no disponible'}
            </Text>
          </View>
        </View>
        <View style={styles.chevronBubble}>
          <Ionicons name="chevron-forward" size={17} color={theme.colors.primary} />
        </View>
      </View>

      {profile.specialties.length > 0 ? (
        <Text style={styles.specialties} numberOfLines={1}>
          {profile.specialties.slice(0, 4).join(' - ')}
        </Text>
      ) : null}
      <View style={styles.cardActionRow}>
        <View style={styles.cardActionPill}>
          <Text style={styles.cardActionText}>{actionLabel}</Text>
          <Ionicons
            name={profile.client_relationship?.status === 'client' ? 'calendar-outline' : 'send-outline'}
            size={13}
            color={theme.colors.primary}
          />
        </View>
      </View>
    </Pressable>
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
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 0,
      textTransform: 'uppercase',
      color: theme.colors.primary,
    },
    title: {
      marginTop: 2,
      fontSize: 28,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    headerIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    clearButton: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 11,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    clearButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    searchBox: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textPrimary,
      paddingVertical: 10,
    },
    filterGroup: {
      gap: spacing.xs,
    },
    filterSummaryBar: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterSummaryIcon: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    filterSummaryCopy: {
      flex: 1,
      minWidth: 0,
    },
    filterSummaryTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textTransform: 'uppercase',
    },
    filterSummaryText: {
      marginTop: 1,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    filterCountPill: {
      minWidth: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    filterCountText: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.colors.primary,
    },
    filterPanel: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterPanelLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    filterRow: {
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    filterChip: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterChipActive: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    filterChipText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    filterChipTextActive: {
      color: theme.colors.primary,
    },
    centerState: {
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    emptyText: {
      textAlign: 'center',
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    results: {
      gap: spacing.sm,
    },
    card: {
      gap: spacing.sm,
      padding: 12,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    cardPressed: {
      opacity: 0.88,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
    },
    avatarFallback: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    avatarText: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    cardIdentity: {
      minWidth: 0,
      flex: 1,
      gap: 3,
    },
    cardNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    cardName: {
      flex: 1,
      minWidth: 0,
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    cardTitle: {
      marginTop: 2,
      fontSize: fontSize.sm,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    professionalMeta: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
      lineHeight: 16,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    chevronBubble: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    specialties: {
      fontSize: fontSize.xs,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    cardActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    cardActionPill: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    cardActionText: {
      fontSize: fontSize.xs,
      fontWeight: '900',
      color: theme.colors.primary,
    },
    location: {
      minWidth: 0,
      flex: 1,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    pricePill: {
      maxWidth: 116,
      minHeight: 24,
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    price: {
      fontSize: fontSize.xs,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
  });
