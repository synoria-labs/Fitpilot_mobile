import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ProfileShortcutButton, Skeleton, TabScreenWrapper } from '../../src/components/common';
import {
  AuroraBackdrop,
  AuroraCard,
  AuroraSegmented,
  AuroraTopScrim,
  IconBadge,
  type AuroraIconName,
  type AuroraSegmentOption,
} from '../../src/components/aurora';
import { ActivityChart } from '../../src/components/dashboard/ActivityChart';
import { RepRangeEditorModal } from '../../src/components/workout-analytics/RepRangeEditorModal';
import { RepRangeVolumeChart } from '../../src/components/workout-analytics/RepRangeVolumeChart';
import { WorkoutAnalyticsComparisonGroup } from '../../src/components/workout-analytics/WorkoutAnalyticsComparisonGroup';
import { WorkoutAnalyticsContextNavigator } from '../../src/components/workout-analytics/WorkoutAnalyticsContextNavigator';
import { DayTypeProgressSection } from '../../src/components/workout-analytics/DayTypeProgressSection';
import { WorkoutAnalyticsContextPickerModal } from '../../src/components/workout-analytics/WorkoutAnalyticsContextPickerModal';
import { WorkoutAnalyticsDailySessionComparisonChart } from '../../src/components/workout-analytics/WorkoutAnalyticsDailySessionComparisonChart';
import { ProgressChips, ProgressFilters } from '../../src/components/workout-analytics/ProgressFilters';
import { ProgressSummaryGrid, ProgressSummarySkeleton } from '../../src/components/workout-analytics/ProgressSummaryGrid';
import {
  ProgressExerciseRow,
  ProgressGroupItem,
  ProgressListGroup,
  ProgressSessionRow,
  getGroupPosition,
} from '../../src/components/workout-analytics/ProgressRows';
import {
  CONSISTENCY_WEEKS,
  TrainingConsistencyCard,
} from '../../src/components/workout-analytics/TrainingConsistencyCard';
import { WorkoutAnalyticsLineTrendChart } from '../../src/components/workout-analytics/WorkoutAnalyticsLineTrendChart';
import { WorkoutAnalyticsSnapshotCard } from '../../src/components/workout-analytics/WorkoutAnalyticsSnapshotCard';
import { spacing } from '../../src/constants/colors';
import { useAuthStore } from '../../src/store/authStore';
import { useWorkoutStore } from '../../src/store/workoutStore';
import {
  getCachedWorkoutAnalyticsModules,
  getWorkoutMacrocycleDetail,
  getWorkoutAnalyticsHistory,
  getWorkoutAnalyticsModules,
  listWorkoutMacrocycles,
  updateWorkoutAnalyticsPreferences,
} from '../../src/services/workoutAnalytics';
import { useBottomTabBarContentInset, useBottomTabBarScroll } from '../../src/hooks/useBottomTabBarVisibility';
import { useDailyActivity } from '../../src/hooks/useDailyActivity';
import { useWeeklyMuscleVolume } from '../../src/hooks/useWeeklyMuscleVolume';
import { auroraFont, auroraType, useAurora } from '../../src/theme/aurora';
import type {
  ApiError,
  ExerciseTrendSummary,
  Macrocycle,
  MacrocycleListItem,
  RecentWorkoutHistoryItem,
  RepRangeBucket,
  WorkoutAnalyticsComparisonGroupSection,
  WorkoutAnalyticsExerciseHighlightsSection,
  WorkoutAnalyticsHistoryPage,
  WorkoutAnalyticsHistoryStatusFilter,
  WorkoutAnalyticsModules,
  WorkoutAnalyticsProgramScope,
  WorkoutAnalyticsRange,
  WorkoutAnalyticsRecentSessionsSection,
  WorkoutAnalyticsScopeKind,
  WorkoutAnalyticsSection,
  WorkoutAnalyticsTrendSeriesSection,
} from '../../src/types';
import { formatLocalDate } from '../../src/utils/date';
import {
  getDashboardContentWidth,
  getPrimaryScreenHorizontalPadding,
  isTabletLayout,
} from '../../src/utils/layout';
import { countPlannedSessions } from '../../src/utils/trainingProgress';
import {
  areSelectionsEqual,
  buildHistoricalProgramsCatalog,
  getAdjacentSelectionForScope,
  getContextItemsForScope,
  getPickerSectionsForScope,
  getRequestParamsForSelection,
  getSelectedContextItemForScope,
  getSelectionFromProgramScope,
  isCurrentSelectionForScope,
  synchronizeSelectionForScope,
  type HistoricalWorkoutAnalyticsScopeKind,
  type WorkoutAnalyticsContextItem,
} from '../../src/utils/workoutAnalyticsContext';

type WorkoutAnalyticsTab = 'overview' | 'exercises' | 'history';
type ExerciseSortOption = 'recent' | 'progress' | 'frequency';

type HistorySection = {
  title: string;
  data: RecentWorkoutHistoryItem[];
};

type ModulesRequest = {
  scopeKind: WorkoutAnalyticsScopeKind;
  range: WorkoutAnalyticsRange;
  repBucketId: string | null;
  macrocycleId: string | null;
  mesocycleId: string | null;
  microcycleId: string | null;
};

const TREND_STATUS_SORT_PRIORITY: Record<string, number> = {
  rising: 4,
  stable: 3,
  declining: 2,
  insufficient: 1,
};

const HISTORY_PAGE_SIZE = 20;
const BACKDROP_HEIGHT = 560;
// Una semana con carga de sobra para llenar una barra de «Series por músculo».
const WEEKLY_LANDMARK_SETS = 20;

const TAB_OPTIONS: readonly AuroraSegmentOption<WorkoutAnalyticsTab>[] = [
  { key: 'overview', label: 'Resumen' },
  { key: 'exercises', label: 'Ejercicios' },
  { key: 'history', label: 'Historial' },
];

const EXERCISE_SORT_OPTIONS: readonly AuroraSegmentOption<ExerciseSortOption>[] = [
  { key: 'recent', label: 'Recientes' },
  { key: 'progress', label: 'Mayor progreso' },
  { key: 'frequency', label: 'Más frecuentes' },
];

const HISTORY_STATUS_OPTIONS: readonly { value: WorkoutAnalyticsHistoryStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'completed', label: 'Completadas' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'abandoned', label: 'Abandonadas' },
];

const buildModulesKey = (userId: string | number | null, request: ModulesRequest) =>
  [
    userId ?? 'anon',
    request.scopeKind,
    request.scopeKind === 'range' ? request.range : '-',
    request.repBucketId ?? '-',
    request.macrocycleId ?? '-',
    request.mesocycleId ?? '-',
    request.microcycleId ?? '-',
  ].join('|');

// Lo último que se vio con cada combinación de filtros mientras la app sigue abierta: al volver
// a ella se pinta al instante y se refresca detrás, sin spinner.
const modulesMemory = new Map<string, WorkoutAnalyticsModules>();

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const compareExercisesBySort = (
  left: ExerciseTrendSummary,
  right: ExerciseTrendSummary,
  sort: ExerciseSortOption,
) => {
  const leftDelta = left.primary_metric_delta ?? left.best_weight_delta_kg ?? Number.NEGATIVE_INFINITY;
  const rightDelta = right.primary_metric_delta ?? right.best_weight_delta_kg ?? Number.NEGATIVE_INFINITY;

  if (sort === 'progress') {
    const leftPriority = TREND_STATUS_SORT_PRIORITY[left.trend_status ?? 'insufficient'] ?? 0;
    const rightPriority = TREND_STATUS_SORT_PRIORITY[right.trend_status ?? 'insufficient'] ?? 0;
    const trendDiff = rightPriority - leftPriority;
    if (trendDiff !== 0) {
      return trendDiff;
    }

    const scoreDiff =
      (right.progress_score ?? Number.NEGATIVE_INFINITY) -
      (left.progress_score ?? Number.NEGATIVE_INFINITY);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const deltaDiff = rightDelta - leftDelta;
    if (deltaDiff !== 0) {
      return deltaDiff;
    }
  }

  if (sort === 'frequency') {
    const sessionsDiff = right.sessions_count - left.sessions_count;
    if (sessionsDiff !== 0) {
      return sessionsDiff;
    }
  }

  const leftDate = left.last_performed_on ?? '';
  const rightDate = right.last_performed_on ?? '';
  const dateDiff = rightDate.localeCompare(leftDate);
  if (dateDiff !== 0) {
    return dateDiff;
  }

  if (sort !== 'frequency') {
    const sessionsDiff = right.sessions_count - left.sessions_count;
    if (sessionsDiff !== 0) {
      return sessionsDiff;
    }
  }

  if (sort !== 'progress') {
    const deltaDiff = rightDelta - leftDelta;
    if (deltaDiff !== 0) {
      return deltaDiff;
    }
  }

  return left.exercise_name.localeCompare(right.exercise_name, 'es-MX');
};

const buildHistorySections = (items: RecentWorkoutHistoryItem[]): HistorySection[] => {
  const sections = new Map<string, HistorySection>();

  items.forEach((item) => {
    const key = item.performed_on_date.slice(0, 7);
    const currentSection = sections.get(key);

    if (currentSection) {
      currentSection.data.push(item);
      return;
    }

    sections.set(key, {
      title: formatLocalDate(item.performed_on_date, { month: 'long', year: 'numeric' }, 'es-MX'),
      data: [item],
    });
  });

  return Array.from(sections.values());
};

const mergeHistoryPages = (
  previousPage: WorkoutAnalyticsHistoryPage | null,
  nextPage: WorkoutAnalyticsHistoryPage,
) => {
  if (!previousPage) {
    return nextPage;
  }

  const seenIds = new Set(previousPage.items.map((item) => item.workout_log_id));
  const mergedItems = [...previousPage.items];

  nextPage.items.forEach((item) => {
    if (seenIds.has(item.workout_log_id)) {
      return;
    }

    seenIds.add(item.workout_log_id);
    mergedItems.push(item);
  });

  return {
    total: nextPage.total,
    items: mergedItems,
  };
};

const getExerciseSection = (modules: WorkoutAnalyticsModules | null) =>
  (modules?.sections.find((section) => section.kind === 'exercise_highlights') as WorkoutAnalyticsExerciseHighlightsSection | undefined) ??
  undefined;

const buildOverviewEmptyState = (
  scopeKind: WorkoutAnalyticsScopeKind,
  emptyMessage?: string | null,
) => {
  if (scopeKind !== 'range') {
    return {
      icon: 'layers-outline' as const,
      title: 'Sin contexto del plan',
      description:
        emptyMessage ??
        'Todavía no hay un programa activo o un bloque del plan que mostrar.',
    };
  }

  return {
    icon: 'analytics-outline' as const,
    title: 'Sin datos suficientes',
    description:
      emptyMessage ??
      'Todavía no hay suficientes sesiones en este periodo. Prueba con uno más amplio.',
  };
};

const SearchField = ({
  value,
  placeholder,
  onChangeText,
  onClear,
}: {
  value: string;
  placeholder: string;
  onChangeText: (nextValue: string) => void;
  onClear: () => void;
}) => {
  const aurora = useAurora();

  return (
    <View
      style={[
        styles.searchField,
        { backgroundColor: aurora.surface, borderColor: aurora.borderStrong, boxShadow: aurora.shadow },
      ]}
    >
      <Ionicons name="search-outline" size={17} color={aurora.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={aurora.faint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        style={[styles.searchInput, auroraFont('medium'), { color: aurora.text }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          hitSlop={8}
          onPress={onClear}
          style={[styles.clearButton, { backgroundColor: aurora.surface2 }]}
        >
          <Ionicons name="close" size={15} color={aurora.muted} />
        </Pressable>
      ) : null}
    </View>
  );
};

const SectionHeading = ({
  title,
  actionLabel,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) => {
  const aurora = useAurora();

  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, auroraFont('extrabold'), { color: aurora.text }]}>
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={onActionPress} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const EmptyStateCard = ({
  icon,
  title,
  description,
  actionLabel,
  onActionPress,
}: {
  icon: AuroraIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) => {
  const aurora = useAurora();

  return (
    <AuroraCard padding={22} radius={24} style={styles.emptyCard}>
      <IconBadge icon={icon} tone="blue" size={48} />
      <Text style={[auroraType.headline, styles.emptyTitle, { color: aurora.text }]}>{title}</Text>
      <Text style={[styles.emptyText, auroraFont('medium'), { color: aurora.muted }]}>{description}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={[styles.emptyAction, { backgroundColor: aurora.tones.blue.soft, borderColor: aurora.tones.blue.line }]}
        >
          <Text style={[styles.emptyActionText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </AuroraCard>
  );
};

const NoticeBanner = ({
  tone,
  icon,
  message,
  actionLabel,
  onActionPress,
}: {
  tone: 'blue' | 'amber';
  icon: AuroraIconName;
  message: string;
  actionLabel: string;
  onActionPress: () => void;
}) => {
  const aurora = useAurora();
  const colors = aurora.tones[tone];

  return (
    <View style={[styles.notice, { backgroundColor: colors.soft, borderColor: colors.line }]}>
      <Ionicons name={icon} size={16} color={colors.ink} />
      <Text style={[styles.noticeText, auroraFont('semibold'), { color: aurora.text }]}>{message}</Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onActionPress}>
        <Text style={[styles.noticeAction, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
};

/** Filas de relleno con la forma de la lista mientras llega la primera página. */
const ListSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <ProgressListGroup>
    {Array.from({ length: rows }, (_, index) => (
      <View key={index} style={styles.skeletonRow}>
        <Skeleton width={46} height={46} borderRadius={14} />
        <View style={styles.skeletonCopy}>
          <Skeleton width="62%" height={13} borderRadius={6} />
          <Skeleton width="40%" height={11} borderRadius={5} />
        </View>
      </View>
    ))}
  </ProgressListGroup>
);

export default function WorkoutsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const aurora = useAurora();
  const contentWidth = getDashboardContentWidth(width);
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const cardWidth = Math.min(width, contentWidth) - horizontalPadding * 2;
  const chartWidth = Math.max(cardWidth - 40, 280);
  const tabBarScroll = useBottomTabBarScroll();
  const onTabBarScroll = tabBarScroll.onScroll;
  const contentInsetBottom = useBottomTabBarContentInset();
  const isFocused = useIsFocused();
  const isTablet = isTabletLayout(width, height);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const programName = useWorkoutStore((state) => state.dashboardBootstrap?.program?.name);
  const planTimeline = useWorkoutStore((state) => state.dashboardBootstrap?.timeline);
  const [range, setRange] = useState<WorkoutAnalyticsRange>('4w');
  const [analyticsScopeKind, setAnalyticsScopeKind] = useState<WorkoutAnalyticsScopeKind>('range');
  const [modules, setModules] = useState<WorkoutAnalyticsModules | null>(null);
  // Filtros con los que se pidió lo que está en pantalla, y los de la petición en curso.
  const [modulesView, setModulesView] = useState<{ key: string | null; repBucketId: string | null }>({
    key: null,
    repBucketId: null,
  });
  const [pendingModulesKey, setPendingModulesKey] = useState<string | null>(null);
  const modulesRef = useRef<WorkoutAnalyticsModules | null>(null);
  const modulesRequestId = useRef(0);
  const historyRequestId = useRef(0);
  const [activeTab, setActiveTab] = useState<WorkoutAnalyticsTab>('overview');
  const [exerciseSort, setExerciseSort] = useState<ExerciseSortOption>('recent');
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [historyStatus, setHistoryStatus] = useState<WorkoutAnalyticsHistoryStatusFilter>('all');
  const [historyPage, setHistoryPage] = useState<WorkoutAnalyticsHistoryPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryRefreshing, setIsHistoryRefreshing] = useState(false);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [isSavingRanges, setIsSavingRanges] = useState(false);
  const [isRangeEditorVisible, setIsRangeEditorVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [currentProgramScope, setCurrentProgramScope] = useState<WorkoutAnalyticsProgramScope | null>(null);
  const [selectedMacrocycleId, setSelectedMacrocycleId] = useState<string | null>(null);
  const [selectedMesocycleId, setSelectedMesocycleId] = useState<string | null>(null);
  const [selectedMicrocycleId, setSelectedMicrocycleId] = useState<string | null>(null);
  const [selectedRepBucketId, setSelectedRepBucketId] = useState<string | null>(null);
  const [isContextBootstrapped, setIsContextBootstrapped] = useState(false);
  const [isContextCatalogLoaded, setIsContextCatalogLoaded] = useState(false);
  const [isContextCatalogLoading, setIsContextCatalogLoading] = useState(false);
  const [isContextPickerVisible, setIsContextPickerVisible] = useState(false);
  const [contextCatalogError, setContextCatalogError] = useState<string | null>(null);
  const [macrocycleSummaries, setMacrocycleSummaries] = useState<MacrocycleListItem[]>([]);
  const [macrocycleDetailsById, setMacrocycleDetailsById] = useState<Record<string, Macrocycle>>({});
  const [countSecondaryMuscles, setCountSecondaryMuscles] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [hasPlayedEntryAnimation, setHasPlayedEntryAnimation] = useState(false);
  const [hasPlayedDataEntry, setHasPlayedDataEntry] = useState(false);
  const deferredExerciseSearch = useDeferredValue(exerciseSearchQuery);
  // La constancia y las series se refrescan al volver a la pestaña sin vaciar lo que ya se ve.
  const dailyActivity = useDailyActivity({ weeks: CONSISTENCY_WEEKS, enabled: isFocused, includeHealth: false });
  const weeklyMuscles = useWeeklyMuscleVolume({ countSecondary: countSecondaryMuscles, enabled: isFocused });
  const selectedContext = useMemo(
    () => ({
      macrocycleId: selectedMacrocycleId,
      mesocycleId: selectedMesocycleId,
      microcycleId: selectedMicrocycleId,
    }),
    [selectedMacrocycleId, selectedMesocycleId, selectedMicrocycleId],
  );
  const fallbackProgramScopeSelection = useMemo(
    () => getSelectionFromProgramScope(currentProgramScope ?? modules?.program_scope),
    [currentProgramScope, modules?.program_scope],
  );
  const effectiveHistoricalSelection = useMemo(
    () => (isContextBootstrapped ? selectedContext : fallbackProgramScopeSelection),
    [fallbackProgramScopeSelection, isContextBootstrapped, selectedContext],
  );
  const activeScopeRouteParams = useMemo(
    () =>
      analyticsScopeKind === 'range'
        ? { macrocycleId: null, mesocycleId: null, microcycleId: null }
        : getRequestParamsForSelection(analyticsScopeKind, effectiveHistoricalSelection),
    [analyticsScopeKind, effectiveHistoricalSelection],
  );
  const historicalPrograms = useMemo(
    () => buildHistoricalProgramsCatalog(macrocycleSummaries, macrocycleDetailsById),
    [macrocycleDetailsById, macrocycleSummaries],
  );
  const historicalScopeKind =
    analyticsScopeKind === 'range'
      ? null
      : (analyticsScopeKind as HistoricalWorkoutAnalyticsScopeKind);
  const selectedRepBucketLabel = useMemo(() => {
    if (!selectedRepBucketId) {
      return null;
    }

    const matchingBucket = (modules?.preferences.rep_ranges ?? []).find((bucket) => bucket.id === selectedRepBucketId);
    return matchingBucket?.label ?? null;
  }, [modules?.preferences.rep_ranges, selectedRepBucketId]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onTabBarScroll(event);
      const scrolled = event.nativeEvent.contentOffset.y > 4;
      setIsScrolled((current) => (current === scrolled ? current : scrolled));
    },
    [onTabBarScroll],
  );

  const showModules = useCallback((next: WorkoutAnalyticsModules, key: string, repBucketId: string | null) => {
    modulesRef.current = next;
    setModules(next);
    setModulesView({ key, repBucketId });
  }, []);

  const loadModules = useCallback(
    async (options?: { refresh?: boolean; forceCurrentContext?: boolean }) => {
      const requestId = ++modulesRequestId.current;
      const isRefresh = options?.refresh ?? false;
      const shouldResolveCurrentContext =
        analyticsScopeKind !== 'range' && ((options?.forceCurrentContext ?? false) || !isContextBootstrapped);
      const requestScopeParams =
        analyticsScopeKind === 'range' || shouldResolveCurrentContext
          ? { macrocycleId: null, mesocycleId: null, microcycleId: null }
          : getRequestParamsForSelection(analyticsScopeKind, selectedContext);
      const request: ModulesRequest = {
        scopeKind: analyticsScopeKind,
        range,
        repBucketId: analyticsScopeKind === 'range' ? selectedRepBucketId : null,
        ...requestScopeParams,
      };
      const requestKey = buildModulesKey(userId, request);
      setPendingModulesKey(requestKey);

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Lo ya visto con estos filtros se pinta al instante; en el primer arranque, lo guardado.
      const remembered = modulesMemory.get(requestKey);
      if (remembered) {
        showModules(remembered, requestKey, request.repBucketId);
      } else if (!modulesRef.current) {
        const cached = await getCachedWorkoutAnalyticsModules({ ...request, cacheUserId: userId });
        if (cached && requestId === modulesRequestId.current && !modulesRef.current) {
          showModules(cached, requestKey, request.repBucketId);
        }
      }

      try {
        const nextModules = await getWorkoutAnalyticsModules({ ...request, cacheUserId: userId });
        if (requestId !== modulesRequestId.current) return;
        modulesMemory.set(requestKey, nextModules);
        showModules(nextModules, requestKey, request.repBucketId);
        setError(null);

        if (analyticsScopeKind !== 'range' && nextModules.program_scope && shouldResolveCurrentContext) {
          const nextSelection = getSelectionFromProgramScope(nextModules.program_scope);
          // La petición que sigue, ya con el contexto resuelto, trae lo mismo: que no atenúe la pantalla.
          modulesMemory.set(
            buildModulesKey(userId, {
              ...request,
              ...getRequestParamsForSelection(analyticsScopeKind, nextSelection),
            }),
            nextModules,
          );
          setCurrentProgramScope(nextModules.program_scope);
          setSelectedMacrocycleId(nextSelection.macrocycleId);
          setSelectedMesocycleId(nextSelection.mesocycleId);
          setSelectedMicrocycleId(nextSelection.microcycleId);
          setIsContextBootstrapped(true);
        }
      } catch (loadError) {
        if (requestId !== modulesRequestId.current) return;
        const apiError = loadError as ApiError;
        if (apiError.status === 422 && selectedRepBucketId) {
          setSelectedRepBucketId(null);
          setError(null);
          return;
        }
        setError(apiError.message || 'No fue posible cargar tus entrenamientos.');
      } finally {
        if (requestId === modulesRequestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [analyticsScopeKind, isContextBootstrapped, range, selectedContext, selectedRepBucketId, showModules, userId],
  );

  const loadHistoricalCatalog = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (analyticsScopeKind === 'range') {
        return;
      }

      const isRefresh = options?.refresh ?? false;

      if (!isRefresh && isContextCatalogLoaded) {
        return;
      }

      setIsContextCatalogLoading(true);

      try {
        const nextListResponse = await listWorkoutMacrocycles({ limit: 200 });
        const visibleMacrocycles = nextListResponse.macrocycles.filter(
          (macrocycle) => macrocycle.status === 'active' || macrocycle.status === 'completed',
        );
        const detailEntries = await Promise.all(
          visibleMacrocycles.map(async (macrocycle) => {
            const detail = await getWorkoutMacrocycleDetail(macrocycle.id);
            return [macrocycle.id, detail] as const;
          }),
        );

        setMacrocycleSummaries(visibleMacrocycles);
        setMacrocycleDetailsById(Object.fromEntries(detailEntries));
        setContextCatalogError(null);
      } catch (loadError) {
        const apiError = loadError as ApiError;
        setContextCatalogError(apiError.message || 'No fue posible cargar el histórico del programa.');
      } finally {
        setIsContextCatalogLoaded(true);
        setIsContextCatalogLoading(false);
      }
    },
    [analyticsScopeKind, isContextCatalogLoaded],
  );

  const loadHistoryPage = useCallback(
    async ({
      reset = false,
      refresh = false,
      skip = 0,
    }: {
      reset?: boolean;
      refresh?: boolean;
      skip?: number;
    } = {}) => {
      const requestId = ++historyRequestId.current;
      if (refresh) {
        setIsHistoryRefreshing(true);
      } else if (reset) {
        setIsHistoryLoading(true);
      } else {
        setIsHistoryLoadingMore(true);
      }

      try {
        const nextPage = await getWorkoutAnalyticsHistory({
          scopeKind: analyticsScopeKind,
          range,
          repBucketId: analyticsScopeKind === 'range' ? selectedRepBucketId : null,
          status: historyStatus,
          skip,
          limit: HISTORY_PAGE_SIZE,
          macrocycleId: activeScopeRouteParams.macrocycleId,
          mesocycleId: activeScopeRouteParams.mesocycleId,
          microcycleId: activeScopeRouteParams.microcycleId,
        });
        if (requestId !== historyRequestId.current) return;
        setHistoryPage((currentPage) => (reset ? nextPage : mergeHistoryPages(currentPage, nextPage)));
        setHistoryError(null);
      } catch (loadError) {
        if (requestId !== historyRequestId.current) return;
        const apiError = loadError as ApiError;
        if (apiError.status === 422 && selectedRepBucketId) {
          setSelectedRepBucketId(null);
          setHistoryError(null);
          return;
        }
        setHistoryError(apiError.message || 'No fue posible cargar el historial completo.');
      } finally {
        if (requestId === historyRequestId.current) {
          setIsHistoryLoading(false);
          setIsHistoryRefreshing(false);
          setIsHistoryLoadingMore(false);
        }
      }
    },
    [
      analyticsScopeKind,
      activeScopeRouteParams.macrocycleId,
      activeScopeRouteParams.mesocycleId,
      activeScopeRouteParams.microcycleId,
      historyStatus,
      range,
      selectedRepBucketId,
    ],
  );

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadModules();
    return () => {
      modulesRequestId.current += 1;
    };
  }, [isFocused, loadModules]);

  useEffect(() => {
    if (analyticsScopeKind === 'range' || !isFocused || isContextCatalogLoaded) {
      return;
    }

    void loadHistoricalCatalog();
  }, [analyticsScopeKind, isContextCatalogLoaded, isFocused, loadHistoricalCatalog]);

  useEffect(() => {
    if (!isFocused || activeTab !== 'history') {
      return;
    }

    void loadHistoryPage({ reset: true });
    return () => {
      historyRequestId.current += 1;
    };
  }, [activeTab, isFocused, loadHistoryPage]);

  useEffect(() => {
    if (analyticsScopeKind === 'range' || !isContextBootstrapped || !historicalPrograms.length) {
      return;
    }

    const currentSelectionItem = getSelectedContextItemForScope(
      analyticsScopeKind,
      selectedContext,
      historicalPrograms,
    );
    const fallbackSelection = currentSelectionItem
      ? selectedContext
      : getSelectionFromProgramScope(currentProgramScope ?? modules?.program_scope);
    const nextSelection = synchronizeSelectionForScope(
      analyticsScopeKind,
      fallbackSelection,
      historicalPrograms,
    );

    if (!areSelectionsEqual(selectedContext, nextSelection)) {
      setSelectedMacrocycleId(nextSelection.macrocycleId);
      setSelectedMesocycleId(nextSelection.mesocycleId);
      setSelectedMicrocycleId(nextSelection.microcycleId);
    }
  }, [
    analyticsScopeKind,
    currentProgramScope,
    historicalPrograms,
    isContextBootstrapped,
    modules?.program_scope,
    selectedContext,
  ]);

  useEffect(() => {
    if (analyticsScopeKind === 'range') {
      setIsContextPickerVisible(false);
      return;
    }

    setSelectedRepBucketId(null);
  }, [analyticsScopeKind]);

  useEffect(() => {
    if (!selectedRepBucketId) {
      return;
    }

    const bucketExists = (modules?.preferences.rep_ranges ?? []).some((bucket) => bucket.id === selectedRepBucketId);
    if (!bucketExists) {
      setSelectedRepBucketId(null);
    }
  }, [modules?.preferences.rep_ranges, selectedRepBucketId]);

  // Las entradas escalonadas solo se ven una vez: el encabezado al abrir la pantalla y los datos
  // cuando llegan por primera vez.
  useEffect(() => {
    if (hasPlayedEntryAnimation) {
      return undefined;
    }
    const timeoutId = setTimeout(() => setHasPlayedEntryAnimation(true), 0);
    return () => clearTimeout(timeoutId);
  }, [hasPlayedEntryAnimation]);
  useEffect(() => {
    if (hasPlayedDataEntry || !modules) {
      return undefined;
    }
    const timeoutId = setTimeout(() => setHasPlayedDataEntry(true), 0);
    return () => clearTimeout(timeoutId);
  }, [hasPlayedDataEntry, modules]);
  const getEntryAnimation = useCallback(
    (delay: number) => (hasPlayedEntryAnimation ? undefined : FadeInDown.delay(delay).duration(380)),
    [hasPlayedEntryAnimation],
  );
  const getDataEntryAnimation = useCallback(
    (delay: number) => (hasPlayedDataEntry ? undefined : FadeInDown.delay(delay).duration(380)),
    [hasPlayedDataEntry],
  );

  const handleRefresh = useCallback(async () => {
    const refreshContextCatalog =
      analyticsScopeKind !== 'range'
        ? loadHistoricalCatalog({ refresh: true })
        : Promise.resolve();
    void dailyActivity.reload();
    weeklyMuscles.retry();

    if (activeTab === 'history') {
      await Promise.all([
        loadModules({ refresh: true }),
        loadHistoryPage({ reset: true, refresh: true }),
        refreshContextCatalog,
      ]);
      return;
    }

    await Promise.all([
      loadModules({ refresh: true }),
      refreshContextCatalog,
    ]);
  }, [activeTab, analyticsScopeKind, dailyActivity, loadHistoricalCatalog, loadHistoryPage, loadModules, weeklyMuscles]);

  const handleSaveRepRanges = useCallback(
    async (nextRepRanges: RepRangeBucket[]) => {
      setIsSavingRanges(true);

      try {
        await updateWorkoutAnalyticsPreferences({ rep_ranges: nextRepRanges });
        // Los rangos cambian lo que se ve en cada combinación de filtros.
        modulesMemory.clear();
        const removedActiveBucket =
          selectedRepBucketId != null && !nextRepRanges.some((bucket) => bucket.id === selectedRepBucketId);
        if (removedActiveBucket) {
          setSelectedRepBucketId(null);
          setIsRangeEditorVisible(false);
          return;
        }
        setIsRangeEditorVisible(false);
        await Promise.all([
          loadModules(),
          activeTab === 'history' ? loadHistoryPage({ reset: true }) : Promise.resolve(),
        ]);
      } catch (saveError) {
        const apiError = saveError as ApiError;
        Alert.alert('Error', apiError.message || 'No fue posible guardar tus rangos.');
      } finally {
        setIsSavingRanges(false);
      }
    },
    [activeTab, loadHistoryPage, loadModules, selectedRepBucketId],
  );

  const exerciseSection = useMemo(() => getExerciseSection(modules), [modules]);
  const overviewSections = useMemo(
    () => (modules?.sections ?? []).filter((section) => section.kind !== 'summary_cards'),
    [modules?.sections],
  );
  const exerciseItems = useMemo(() => exerciseSection?.items ?? [], [exerciseSection]);
  const plannedSessions = useMemo(() => {
    const scope = modules?.time_scope;
    if (!scope?.start_date || !scope.end_date) {
      return null;
    }
    const planned = countPlannedSessions(planTimeline, scope.start_date, scope.end_date);
    return planned > 0 ? planned : null;
  }, [modules?.time_scope, planTimeline]);
  const contextItems = useMemo(
    () =>
      historicalScopeKind
        ? getContextItemsForScope(historicalScopeKind, historicalPrograms)
        : [],
    [historicalPrograms, historicalScopeKind],
  );
  const selectedContextItem = useMemo(
    () =>
      historicalScopeKind
        ? getSelectedContextItemForScope(
            historicalScopeKind,
            effectiveHistoricalSelection,
            historicalPrograms,
          )
        : null,
    [effectiveHistoricalSelection, historicalPrograms, historicalScopeKind],
  );
  const contextPickerSections = useMemo(
    () =>
      historicalScopeKind
        ? getPickerSectionsForScope(historicalScopeKind, historicalPrograms)
        : [],
    [historicalPrograms, historicalScopeKind],
  );
  const selectedContextIndex = useMemo(() => {
    if (!historicalScopeKind || !selectedContextItem) {
      return -1;
    }

    return contextItems.findIndex((item) => item.id === selectedContextItem.id);
  }, [contextItems, historicalScopeKind, selectedContextItem]);
  const canGoToPreviousContext =
    historicalScopeKind != null &&
    selectedContextIndex >= 0 &&
    selectedContextIndex < contextItems.length - 1;
  const canGoToNextContext =
    historicalScopeKind != null &&
    selectedContextIndex > 0;
  const isCurrentHistoricalSelection = useMemo(
    () =>
      historicalScopeKind
        ? isCurrentSelectionForScope(
            historicalScopeKind,
            effectiveHistoricalSelection,
            currentProgramScope,
          )
        : true,
    [currentProgramScope, effectiveHistoricalSelection, historicalScopeKind],
  );

  const filteredExercises = useMemo(() => {
    const searchValue = normalizeSearchValue(deferredExerciseSearch);

    return exerciseItems
      .filter((exercise) => {
        if (!searchValue) {
          return true;
        }

        return normalizeSearchValue(exercise.exercise_name).includes(searchValue);
      })
      .sort((left, right) => compareExercisesBySort(left, right, exerciseSort));
  }, [deferredExerciseSearch, exerciseItems, exerciseSort]);

  const historySections = useMemo(
    () => buildHistorySections(historyPage?.items ?? []),
    [historyPage?.items],
  );

  const hasMoreHistory = (historyPage?.items.length ?? 0) < (historyPage?.total ?? 0);
  const showHistorySkeleton = activeTab === 'history' && isHistoryLoading && !historyPage?.items.length;

  // Al cambiar un filtro sin nada guardado para él, lo anterior se atenúa (sin spinner) hasta que llega lo nuevo.
  const isShowingStaleModules = isLoading && modules != null && modulesView.key !== pendingModulesKey;
  const isShowingStaleHistory = isHistoryLoading && (historyPage?.items.length ?? 0) > 0;
  const modulesDim = useSharedValue(1);
  const historyDim = useSharedValue(1);
  useEffect(() => {
    modulesDim.value = withTiming(isShowingStaleModules ? 0.5 : 1, { duration: 180 });
  }, [isShowingStaleModules, modulesDim]);
  useEffect(() => {
    historyDim.value = withTiming(isShowingStaleHistory ? 0.5 : 1, { duration: 180 });
  }, [historyDim, isShowingStaleHistory]);
  const modulesDimStyle = useAnimatedStyle(() => ({ opacity: modulesDim.value }));
  const historyDimStyle = useAnimatedStyle(() => ({ opacity: historyDim.value }));

  const handleHistoryLoadMore = useCallback(() => {
    if (
      isHistoryLoading ||
      isHistoryRefreshing ||
      isHistoryLoadingMore ||
      !historyPage ||
      !hasMoreHistory
    ) {
      return;
    }

    void loadHistoryPage({ skip: historyPage.items.length });
  }, [
    hasMoreHistory,
    historyPage,
    isHistoryLoading,
    isHistoryLoadingMore,
    isHistoryRefreshing,
    loadHistoryPage,
  ]);

  const handleTabChange = useCallback((nextValue: WorkoutAnalyticsTab) => {
    startTransition(() => {
      setActiveTab(nextValue);
    });
  }, []);

  const handleScopeChange = useCallback((nextValue: WorkoutAnalyticsScopeKind) => {
    setAnalyticsScopeKind(nextValue);
  }, []);

  const applyHistoricalSelection = useCallback((nextSelection: {
    macrocycleId: string | null;
    mesocycleId: string | null;
    microcycleId: string | null;
  }) => {
    setSelectedMacrocycleId(nextSelection.macrocycleId);
    setSelectedMesocycleId(nextSelection.mesocycleId);
    setSelectedMicrocycleId(nextSelection.microcycleId);
    setIsContextBootstrapped(true);
  }, []);

  const handleContextStep = useCallback(
    (direction: 'previous' | 'next') => {
      if (!historicalScopeKind) {
        return;
      }

      const nextSelection = getAdjacentSelectionForScope(
        historicalScopeKind,
        effectiveHistoricalSelection,
        historicalPrograms,
        direction,
      );

      if (!nextSelection) {
        return;
      }

      applyHistoricalSelection(nextSelection);
    },
    [applyHistoricalSelection, effectiveHistoricalSelection, historicalPrograms, historicalScopeKind],
  );

  const handleContextItemSelect = useCallback(
    (item: WorkoutAnalyticsContextItem) => {
      applyHistoricalSelection({
        macrocycleId: item.macrocycleId,
        mesocycleId: item.mesocycleId,
        microcycleId: item.microcycleId,
      });
      setIsContextPickerVisible(false);
    },
    [applyHistoricalSelection],
  );

  const handleResetToCurrentContext = useCallback(async () => {
    setIsContextPickerVisible(false);
    await loadModules({ refresh: true, forceCurrentContext: true });
  }, [loadModules]);

  const openExerciseDetail = useCallback(
    (exerciseId: string) => {
      router.push({
        pathname: '/workouts/exercises/[exerciseId]',
        params: {
          exerciseId,
          range,
          scopeKind: analyticsScopeKind,
          ...(analyticsScopeKind === 'range' && selectedRepBucketId ? { repBucketId: selectedRepBucketId } : {}),
          ...(activeScopeRouteParams.macrocycleId ? { macrocycleId: activeScopeRouteParams.macrocycleId } : {}),
          ...(activeScopeRouteParams.mesocycleId ? { mesocycleId: activeScopeRouteParams.mesocycleId } : {}),
          ...(activeScopeRouteParams.microcycleId ? { microcycleId: activeScopeRouteParams.microcycleId } : {}),
        },
      });
    },
    [
      activeScopeRouteParams.macrocycleId,
      activeScopeRouteParams.mesocycleId,
      activeScopeRouteParams.microcycleId,
      analyticsScopeKind,
      range,
      selectedRepBucketId,
    ],
  );

  const overviewEmptyState = useMemo(
    () => buildOverviewEmptyState(analyticsScopeKind, modules?.context.empty_message),
    [analyticsScopeKind, modules?.context.empty_message],
  );
  const historicalScopeLabel =
    analyticsScopeKind === 'microcycle'
      ? 'Microciclo'
      : analyticsScopeKind === 'mesocycle'
        ? 'Bloque'
        : analyticsScopeKind === 'program'
          ? 'Programa'
          : '';
  const historicalContextNavigator =
    historicalScopeKind && selectedContextItem ? (
      <WorkoutAnalyticsContextNavigator
        scopeLabel={historicalScopeLabel}
        title={selectedContextItem.title}
        subtitle={selectedContextItem.subtitle}
        startDate={selectedContextItem.startDate}
        endDate={selectedContextItem.endDate}
        isCurrent={isCurrentHistoricalSelection}
        isLoading={isContextCatalogLoading}
        errorMessage={contextCatalogError}
        canGoPrevious={canGoToPreviousContext}
        canGoNext={canGoToNextContext}
        onPrevious={() => handleContextStep('previous')}
        onNext={() => handleContextStep('next')}
        onResetToCurrent={() => void handleResetToCurrentContext()}
        onOpenPicker={() => setIsContextPickerVisible(true)}
      />
    ) : historicalScopeKind ? (
      <WorkoutAnalyticsContextNavigator
        scopeLabel={historicalScopeLabel}
        title={modules?.context.title ?? 'Contexto del plan'}
        subtitle={modules?.context.scope_label ?? 'Sin contexto resuelto'}
        startDate={modules?.program_scope?.start_date ?? null}
        endDate={modules?.program_scope?.end_date ?? null}
        isCurrent={isCurrentHistoricalSelection}
        isLoading={isContextCatalogLoading}
        errorMessage={contextCatalogError}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={() => undefined}
        onNext={() => undefined}
        onResetToCurrent={() => void handleResetToCurrentContext()}
        onOpenPicker={() => setIsContextPickerVisible(true)}
      />
    ) : null;

  const shell = [styles.sectionShell, { maxWidth: contentWidth, paddingHorizontal: horizontalPadding }];
  const backdropHeight = Math.min(BACKDROP_HEIGHT + insets.top, headerHeight || BACKDROP_HEIGHT + insets.top);

  const pageHeader = (
    <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
      <AuroraBackdrop width={width} height={backdropHeight} palette="training" />
      <View style={{ height: insets.top }} />
      <View style={[shell, isTablet ? styles.headerTablet : null]}>
        <Animated.View entering={getEntryAnimation(0)} style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, auroraFont('extrabold'), { color: aurora.tones.blue.ink }]}>Entrenamiento</Text>
            <Text accessibilityRole="header" style={[styles.title, auroraFont('extrabold'), { color: aurora.text }]}>
              Progreso
            </Text>
            <Text numberOfLines={1} style={[styles.subtitle, auroraFont('medium'), { color: aurora.muted }]}>
              Tu rendimiento, constancia y récords.
            </Text>
          </View>
          <ProfileShortcutButton />
        </Animated.View>

        <Animated.View entering={getEntryAnimation(60)} style={styles.tabs}>
          <AuroraSegmented
            variant="tone"
            tone="blue"
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={handleTabChange}
            accessibilityLabel="Secciones de progreso"
          />
        </Animated.View>

        <Animated.View entering={getEntryAnimation(100)} style={styles.filters}>
          <ProgressFilters
            range={range}
            scope={analyticsScopeKind}
            scopeLabel={modules?.context.scope_label}
            programName={modules?.program_scope?.macrocycle_name ?? programName}
            onRangeChange={setRange}
            onScopeChange={handleScopeChange}
          />
          {historicalContextNavigator}
          {analyticsScopeKind === 'range' && selectedRepBucketId && selectedRepBucketLabel ? (
            <NoticeBanner
              tone="blue"
              icon="funnel-outline"
              message={`Filtrando por ${selectedRepBucketLabel} reps`}
              actionLabel="Quitar"
              onActionPress={() => setSelectedRepBucketId(null)}
            />
          ) : null}
          {error && modules ? (
            <NoticeBanner
              tone="amber"
              icon="alert-circle-outline"
              message="No pudimos actualizar tu progreso."
              actionLabel="Reintentar"
              onActionPress={() => void loadModules()}
            />
          ) : null}
        </Animated.View>

        {activeTab === 'overview' ? (
          <Animated.View style={modulesDimStyle}>
            <View style={styles.block}>
              {modules ? (
                <Animated.View entering={getDataEntryAnimation(0)}>
                  <ProgressSummaryGrid
                    modules={modules}
                    repBucketId={modulesView.repBucketId}
                    plannedSessions={plannedSessions}
                  />
                </Animated.View>
              ) : (
                <Animated.View entering={getEntryAnimation(140)}>
                  <ProgressSummarySkeleton />
                </Animated.View>
              )}
            </View>
            <Animated.View entering={getEntryAnimation(200)} style={styles.block}>
              <TrainingConsistencyCard
                days={dailyActivity.days}
                hasLoaded={dailyActivity.hasLoaded}
                hasFailed={dailyActivity.workoutsFailed}
                onRetry={() => void dailyActivity.reload()}
                width={cardWidth}
              />
            </Animated.View>
          </Animated.View>
        ) : null}

        {activeTab === 'exercises' ? (
          <View style={styles.tabTools}>
            <SearchField
              value={exerciseSearchQuery}
              placeholder="Buscar ejercicio"
              onChangeText={setExerciseSearchQuery}
              onClear={() => setExerciseSearchQuery('')}
            />
            <AuroraSegmented
              options={EXERCISE_SORT_OPTIONS}
              value={exerciseSort}
              onChange={setExerciseSort}
              accessibilityLabel="Ordenar ejercicios"
            />
            <View style={styles.listMeta}>
              <Text style={[styles.sectionTitle, auroraFont('extrabold'), { color: aurora.text }]}>Lista completa</Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]}>
                {selectedRepBucketLabel
                  ? `${filteredExercises.length} de ${exerciseItems.length} con series de ${selectedRepBucketLabel} reps`
                  : `${filteredExercises.length} de ${exerciseItems.length} ejercicios`}
              </Text>
            </View>
          </View>
        ) : null}

        {activeTab === 'history' ? (
          <View style={styles.tabTools}>
            <ProgressChips
              options={HISTORY_STATUS_OPTIONS}
              value={historyStatus}
              onChange={setHistoryStatus}
              accessibilityLabel="Estado de las sesiones"
            />
            <View style={styles.listMeta}>
              <Text style={[styles.sectionTitle, auroraFont('extrabold'), { color: aurora.text }]}>Historial completo</Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]}>
                {historyPage
                  ? `${historyPage.total} ${historyPage.total === 1 ? 'sesión' : 'sesiones'}${selectedRepBucketLabel ? ` con series de ${selectedRepBucketLabel} reps` : ''}`
                  : 'Cargando sesiones…'}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  const refreshControl = (refreshing: boolean) => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={aurora.tones.blue.tone}
      progressViewOffset={insets.top}
    />
  );

  const renderOverviewSection = ({ item, index }: { item: WorkoutAnalyticsSection; index: number }) => {
    const entering = getDataEntryAnimation(120 + index * 70);

    if (item.kind === 'snapshot') {
      return (
        <Animated.View entering={entering} style={[shell, styles.block, modulesDimStyle]}>
          <WorkoutAnalyticsSnapshotCard section={item} />
        </Animated.View>
      );
    }

    if (item.kind === 'trend_series') {
      const trendSection = item as WorkoutAnalyticsTrendSeriesSection;
      return (
        <Animated.View entering={entering} style={[shell, styles.block, modulesDimStyle]}>
          {trendSection.chart_variant === 'stacked_rep_ranges' ? (
            <RepRangeVolumeChart
              points={trendSection.rep_range_points}
              repRanges={trendSection.rep_ranges}
              selectedBucketId={selectedRepBucketId}
              onSelectBucket={analyticsScopeKind === 'range' ? setSelectedRepBucketId : undefined}
              onEditRanges={() => setIsRangeEditorVisible(true)}
            />
          ) : (
            <AuroraCard padding={18} radius={24}>
              <Text style={[auroraType.headline, { color: aurora.text }]}>{trendSection.title}</Text>
              {trendSection.subtitle ? (
                <Text style={[auroraType.caption, styles.cardSubtitle, { color: aurora.faint }]}>
                  {trendSection.subtitle}
                </Text>
              ) : null}
              <View style={styles.cardChart}>
                {trendSection.semantic_kind === 'daily_session_comparison' ? (
                  <WorkoutAnalyticsDailySessionComparisonChart section={trendSection} contentWidth={chartWidth} />
                ) : (
                  <WorkoutAnalyticsLineTrendChart section={trendSection} contentWidth={chartWidth} />
                )}
              </View>
            </AuroraCard>
          )}
        </Animated.View>
      );
    }

    if (item.kind === 'comparison_group') {
      return (
        <Animated.View entering={entering} style={[shell, styles.block, modulesDimStyle]}>
          <WorkoutAnalyticsComparisonGroup section={item as WorkoutAnalyticsComparisonGroupSection} />
        </Animated.View>
      );
    }

    if (item.kind === 'exercise_highlights') {
      const exerciseHighlights = item as WorkoutAnalyticsExerciseHighlightsSection;
      return (
        <Animated.View entering={entering} style={[shell, styles.blockLarge, modulesDimStyle]}>
          <SectionHeading
            title="Ejercicios clave"
            actionLabel={exerciseHighlights.items.length ? 'Ver todos' : undefined}
            onActionPress={exerciseHighlights.items.length ? () => handleTabChange('exercises') : undefined}
          />
          {exerciseHighlights.items.length ? (
            <ProgressListGroup>
              {exerciseHighlights.items.slice(0, 4).map((exercise) => (
                <ProgressExerciseRow
                  key={exercise.exercise_id}
                  exercise={exercise}
                  onPress={() => openExerciseDetail(exercise.exercise_id)}
                />
              ))}
            </ProgressListGroup>
          ) : (
            <EmptyStateCard
              icon="analytics-outline"
              title="Sin ejercicios destacados"
              description={
                analyticsScopeKind === 'range'
                  ? selectedRepBucketLabel
                    ? `Todavía no hay ejercicios con series de ${selectedRepBucketLabel} reps en este periodo.`
                    : 'Completa más sesiones o elige un periodo más amplio.'
                  : modules?.context.empty_message ?? 'Todavía no hay suficientes datos en esta parte del plan.'
              }
            />
          )}
        </Animated.View>
      );
    }

    const recentSection = item as WorkoutAnalyticsRecentSessionsSection;
    return (
      <Animated.View entering={entering} style={[shell, styles.blockLarge, modulesDimStyle]}>
        <SectionHeading
          title="Sesiones recientes"
          actionLabel={analyticsScopeKind === 'range' && recentSection.items.length ? 'Historial' : undefined}
          onActionPress={
            analyticsScopeKind === 'range' && recentSection.items.length
              ? () => handleTabChange('history')
              : undefined
          }
        />
        {recentSection.items.length ? (
          <ProgressListGroup>
            {recentSection.items.slice(0, 3).map((workout) => (
              <ProgressSessionRow
                key={workout.workout_log_id}
                workout={workout}
                onPress={() => router.push(`/workout/${workout.workout_log_id}`)}
              />
            ))}
          </ProgressListGroup>
        ) : (
          <EmptyStateCard
            icon="barbell-outline"
            title="Sin sesiones recientes"
            description={
              selectedRepBucketLabel
                ? `No hay sesiones con series de ${selectedRepBucketLabel} reps en este periodo.`
                : 'Tus sesiones aparecerán aquí en cuanto registres entrenamientos.'
            }
          />
        )}
      </Animated.View>
    );
  };

  const overviewEmpty = modules ? (
    <View style={[shell, styles.block]}>
      <EmptyStateCard
        icon={overviewEmptyState.icon}
        title={overviewEmptyState.title}
        description={overviewEmptyState.description}
      />
    </View>
  ) : error ? (
    <View style={[shell, styles.block]}>
      <EmptyStateCard
        icon="cloud-offline-outline"
        title="No pudimos cargar tu progreso"
        description={error}
        actionLabel="Reintentar"
        onActionPress={() => void loadModules()}
      />
    </View>
  ) : (
    <View style={[shell, styles.block, styles.skeletonStack]}>
      <Skeleton width="100%" height={330} borderRadius={24} />
      <Skeleton width="45%" height={18} borderRadius={8} />
      <ListSkeleton rows={4} />
    </View>
  );

  const muscleSubtitle =
    weeklyMuscles.plannedSets > 0 ? `Esta semana · ${weeklyMuscles.plannedSets} series del plan` : 'Esta semana';

  return (
    <TabScreenWrapper>
      <View style={[styles.container, { backgroundColor: aurora.ground }]}>
        {activeTab === 'overview' ? (
          <FlatList
            data={overviewSections}
            keyExtractor={(item, index) => `${item.kind}-${index}`}
            windowSize={7}
            initialNumToRender={10}
            removeClippedSubviews={Platform.OS === 'android'}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: contentInsetBottom + spacing.lg }}
            ListHeaderComponent={pageHeader}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            refreshControl={refreshControl(isRefreshing)}
            renderItem={renderOverviewSection}
            ListEmptyComponent={overviewEmpty}
            ListFooterComponent={
              <View style={shell}>
                <Animated.View style={[styles.block, modulesDimStyle]}>
                  <ActivityChart
                    muscleVolume={weeklyMuscles.volume}
                    isLoading={!weeklyMuscles.hasLoaded && !weeklyMuscles.hasFailed}
                    countSecondaryMuscles={countSecondaryMuscles}
                    onToggleSecondary={setCountSecondaryMuscles}
                    horizontalPadding={0}
                    maxRows={5}
                    collapsible
                    subtitle={muscleSubtitle}
                    landmarkSets={WEEKLY_LANDMARK_SETS}
                    emptyMessage={
                      weeklyMuscles.hasFailed
                        ? 'No pudimos cargar las series de esta semana.'
                        : 'Tu plan no tiene series de fuerza esta semana.'
                    }
                    onRetry={weeklyMuscles.hasFailed ? weeklyMuscles.retry : undefined}
                  />
                </Animated.View>
                <View style={styles.block}>
                  <DayTypeProgressSection />
                </View>
              </View>
            }
          />
        ) : null}

        {activeTab === 'exercises' ? (
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.exercise_id}
            windowSize={7}
            initialNumToRender={10}
            removeClippedSubviews={Platform.OS === 'android'}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: contentInsetBottom + spacing.lg }}
            ListHeaderComponent={pageHeader}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            refreshControl={refreshControl(isRefreshing)}
            renderItem={({ item, index }) => (
              <Animated.View style={[shell, index === 0 ? styles.listStart : null, modulesDimStyle]}>
                <ProgressGroupItem position={getGroupPosition(index, filteredExercises.length)}>
                  <ProgressExerciseRow exercise={item} showDetails onPress={() => openExerciseDetail(item.exercise_id)} />
                </ProgressGroupItem>
              </Animated.View>
            )}
            ListEmptyComponent={
              <View style={[shell, styles.listStart]}>
                {!modules && isLoading ? (
                  <ListSkeleton rows={5} />
                ) : !exerciseItems.length ? (
                  <EmptyStateCard
                    icon={analyticsScopeKind === 'range' ? 'filter-outline' : 'layers-outline'}
                    title={analyticsScopeKind === 'range' ? 'Sin ejercicios en este periodo' : 'Sin ejercicios en esta parte del plan'}
                    description={
                      analyticsScopeKind === 'range'
                        ? selectedRepBucketLabel
                          ? `No hay ejercicios con series de ${selectedRepBucketLabel} reps. Quita el filtro o elige un periodo más amplio.`
                          : 'Elige un periodo más amplio para ver tu progreso.'
                        : modules?.context.empty_message ??
                          'Todavía no hay suficiente actividad para armar esta lista.'
                    }
                    actionLabel={analyticsScopeKind === 'range' ? 'Ver todo el historial' : undefined}
                    onActionPress={analyticsScopeKind === 'range' ? () => setRange('all') : undefined}
                  />
                ) : (
                  <EmptyStateCard
                    icon="search-outline"
                    title="Sin coincidencias"
                    description="Prueba con otro nombre o cambia el orden."
                    actionLabel="Borrar búsqueda"
                    onActionPress={() => setExerciseSearchQuery('')}
                  />
                )}
              </View>
            }
          />
        ) : null}

        {activeTab === 'history' ? (
          <SectionList
            sections={historySections}
            keyExtractor={(item) => item.workout_log_id}
            windowSize={7}
            initialNumToRender={10}
            removeClippedSubviews={Platform.OS === 'android'}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: contentInsetBottom + spacing.lg }}
            ListHeaderComponent={pageHeader}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            stickySectionHeadersEnabled={false}
            refreshControl={refreshControl(isRefreshing || isHistoryRefreshing)}
            onEndReached={handleHistoryLoadMore}
            onEndReachedThreshold={0.35}
            renderSectionHeader={({ section }) => (
              <View style={[shell, styles.monthHeader]}>
                <Text style={[auroraType.label, { color: aurora.faint }]}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item, index, section }) => (
              <Animated.View style={[shell, historyDimStyle]}>
                <ProgressGroupItem position={getGroupPosition(index, section.data.length)}>
                  <ProgressSessionRow
                    workout={item}
                    showDetails
                    onPress={() => router.push(`/workout/${item.workout_log_id}`)}
                  />
                </ProgressGroupItem>
              </Animated.View>
            )}
            ListEmptyComponent={
              <View style={[shell, styles.listStart]}>
                {showHistorySkeleton ? (
                  <ListSkeleton rows={4} />
                ) : historyError ? (
                  <EmptyStateCard
                    icon="cloud-offline-outline"
                    title="No pudimos cargar el historial"
                    description={historyError}
                    actionLabel="Reintentar"
                    onActionPress={() => void loadHistoryPage({ reset: true })}
                  />
                ) : (
                  <EmptyStateCard
                    icon="calendar-clear-outline"
                    title="Sin sesiones con este filtro"
                    description={
                      analyticsScopeKind === 'range'
                        ? selectedRepBucketLabel
                          ? `No hay sesiones con series de ${selectedRepBucketLabel} reps. Quita el filtro o elige un periodo más amplio.`
                          : 'Prueba otro estado o un periodo más amplio.'
                        : 'Prueba otro estado u otra parte del plan.'
                    }
                    actionLabel={historyStatus !== 'all' ? 'Ver todas' : undefined}
                    onActionPress={historyStatus !== 'all' ? () => setHistoryStatus('all') : undefined}
                  />
                )}
              </View>
            }
            ListFooterComponent={
              <View style={[shell, styles.historyFooter]}>
                {isHistoryLoadingMore ? <ActivityIndicator size="small" color={aurora.tones.blue.tone} /> : null}
                {historyError && (historyPage?.items.length ?? 0) > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadHistoryPage({ skip: historyPage?.items.length ?? 0 })}
                    style={[styles.retryFooterButton, { backgroundColor: aurora.surface, borderColor: aurora.border }]}
                  >
                    <Text style={[styles.retryFooterText, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>
                      Reintentar carga
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        ) : null}

        <AuroraTopScrim height={insets.top} visible={isScrolled} />

        {modules ? (
          <RepRangeEditorModal
            visible={isRangeEditorVisible}
            repRanges={modules.preferences.rep_ranges}
            isSaving={isSavingRanges}
            onClose={() => setIsRangeEditorVisible(false)}
            onSave={handleSaveRepRanges}
          />
        ) : null}
        {historicalScopeKind ? (
          <WorkoutAnalyticsContextPickerModal
            visible={isContextPickerVisible}
            scopeKind={historicalScopeKind}
            sections={contextPickerSections}
            selectedId={selectedContextItem?.id ?? null}
            isLoading={isContextCatalogLoading}
            errorMessage={contextCatalogError}
            onClose={() => setIsContextPickerVisible(false)}
            onRetry={() => void loadHistoricalCatalog({ refresh: true })}
            onSelect={handleContextItemSelect}
          />
        ) : null}
      </View>
    </TabScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  sectionShell: {
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: 26,
    paddingHorizontal: 4,
  },
  headerTablet: {
    paddingTop: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14.5,
    lineHeight: 20,
  },
  tabs: {
    marginTop: 18,
  },
  filters: {
    marginTop: 12,
    gap: 12,
  },
  block: {
    marginTop: 16,
  },
  blockLarge: {
    marginTop: 28,
  },
  tabTools: {
    marginTop: 16,
    gap: 14,
  },
  listMeta: {
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 2,
  },
  listStart: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  sectionAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  sectionActionText: {
    fontSize: 13,
  },
  cardSubtitle: {
    marginTop: 3,
  },
  cardChart: {
    marginTop: 14,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 14.5,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
  },
  noticeAction: {
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 14,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  emptyActionText: {
    fontSize: 13.5,
  },
  skeletonStack: {
    gap: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  monthHeader: {
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  historyFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  retryFooterButton: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  retryFooterText: {
    fontSize: 13,
  },
});
