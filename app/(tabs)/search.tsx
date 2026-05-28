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
} from '../../src/services/professionalDiscovery';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import { getPrimaryScreenHorizontalPadding } from '../../src/utils/layout';

type RoleFilter = 'all' | PublicProfessionalRole;
type ServiceModeFilter = 'all' | PublicProfessionalServiceMode;
type PriceFilter = 'all' | 'under_500' | '500_1000' | '1000_plus';

const ROLE_OPTIONS = [
  { key: 'all', label: 'Todos' },
  { key: 'nutritionist', label: 'Nutrición' },
  { key: 'trainer', label: 'Entreno' },
] satisfies { key: RoleFilter; label: string }[];

const SERVICE_MODE_OPTIONS = [
  { key: 'all', label: 'Todo' },
  { key: 'online', label: 'En línea' },
  { key: 'in_person', label: 'Presencial' },
  { key: 'hybrid', label: 'Híbrido' },
] satisfies { key: ServiceModeFilter; label: string }[];

const PRICE_OPTIONS = [
  { key: 'all', label: 'Cualquier precio' },
  { key: 'under_500', label: '< $500' },
  { key: '500_1000', label: '$500-$1,000' },
  { key: '1000_plus', label: '$1,000+' },
] satisfies { key: PriceFilter; label: string }[];

const ROLE_LABELS: Record<PublicProfessionalRole, string> = {
  nutritionist: 'Nutriólogo',
  trainer: 'Entrenador',
};

const SERVICE_MODE_LABELS: Record<PublicProfessionalServiceMode, string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrido',
};

const getInitials = (profile: PublicProfessionalCard) =>
  `${profile.name?.[0] ?? ''}${profile.lastname?.[0] ?? ''}`.toUpperCase() || 'FP';

const getFullName = (profile: PublicProfessionalCard) =>
  [profile.name, profile.lastname].filter(Boolean).join(' ');

const formatPrice = (profile: PublicProfessionalCard) => {
  const amount = Number(profile.consultation_price_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return `$${amount.toLocaleString('es-MX')} ${profile.consultation_price_currency ?? 'MXN'}`;
};

const getPriceRange = (priceFilter: PriceFilter) => {
  if (priceFilter === 'under_500') return { max_price: 499 };
  if (priceFilter === '500_1000') return { min_price: 500, max_price: 1000 };
  if (priceFilter === '1000_plus') return { min_price: 1000 };
  return {};
};

export default function SearchProfessionalsScreen() {
  const { width, height } = useWindowDimensions();
  const contentInsetBottom = useBottomTabBarContentInset();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [serviceModeFilter, setServiceModeFilter] = useState<ServiceModeFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [professionals, setProfessionals] = useState<PublicProfessionalCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestParams = useMemo(
    () => ({
      q: searchQuery.trim() || undefined,
      role: roleFilter === 'all' ? undefined : roleFilter,
      service_mode: serviceModeFilter === 'all' ? undefined : serviceModeFilter,
      page: 1,
      limit: 30,
      ...getPriceRange(priceFilter),
    }),
    [priceFilter, roleFilter, searchQuery, serviceModeFilter],
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

  const openProfessional = (profile: PublicProfessionalCard) => {
    const requestedRole =
      roleFilter !== 'all'
        ? roleFilter
        : profile.roles.includes('nutritionist')
          ? 'nutritionist'
          : profile.roles[0] ?? 'trainer';

    router.push({
      pathname: '/professionals/[username]' as never,
      params: {
        username: profile.username,
        role: requestedRole,
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
            <View>
              <Text style={styles.eyebrow}>Buscar</Text>
              <Text style={styles.title}>Profesionales</Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="search" size={24} color={theme.colors.primary} />
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={theme.colors.iconMuted} />
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
                <Ionicons name="close-circle" size={20} color={theme.colors.iconMuted} />
              </Pressable>
            ) : null}
          </View>

          <SegmentedControl
            options={ROLE_OPTIONS}
            value={roleFilter}
            onChange={setRoleFilter}
          />

          <FilterRow
            options={SERVICE_MODE_OPTIONS}
            value={serviceModeFilter}
            onChange={setServiceModeFilter}
          />
          <FilterRow
            options={PRICE_OPTIONS}
            value={priceFilter}
            onChange={setPriceFilter}
          />

          {isLoading ? (
            <View style={styles.centerState}>
              <LoadingSpinner text="Cargando profesionales..." />
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={28} color={theme.colors.error} />
              <Text style={styles.emptyTitle}>No pudimos cargar el catálogo</Text>
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
  onPress: () => void;
}

function ProfessionalCard({ profile, onPress }: ProfessionalCardProps) {
  const styles = useThemedStyles(createStyles);
  const price = formatPrice(profile);
  const location = [profile.public_city, profile.public_state].filter(Boolean).join(', ');

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        {profile.profile_picture ? (
          <Image source={{ uri: profile.profile_picture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(profile)}</Text>
          </View>
        )}
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {getFullName(profile)}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {profile.title ?? 'Profesional FitPilot'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      </View>

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

      {profile.specialties.length > 0 ? (
        <Text style={styles.specialties} numberOfLines={2}>
          {profile.specialties.slice(0, 4).join(' · ')}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.location} numberOfLines={1}>
          {location || 'Ubicación no disponible'}
        </Text>
        {price ? <Text style={styles.price}>{price}</Text> : null}
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
      paddingTop: spacing.md,
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      fontSize: 30,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    headerIcon: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    searchBox: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
      paddingVertical: spacing.md,
    },
    filterRow: {
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    filterChip: {
      minHeight: 38,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
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
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    filterChipTextActive: {
      color: theme.colors.primary,
    },
    centerState: {
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      minHeight: 260,
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
      gap: spacing.md,
    },
    card: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: {
      width: 58,
      height: 58,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
    },
    avatarFallback: {
      width: 58,
      height: 58,
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
    },
    cardName: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    cardTitle: {
      marginTop: 2,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
    specialties: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    location: {
      minWidth: 0,
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    price: {
      fontSize: fontSize.base,
      fontWeight: '900',
      color: theme.colors.textPrimary,
    },
  });
