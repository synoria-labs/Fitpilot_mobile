import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  LoadingSpinner,
  ProfileShortcutButton,
  SegmentedControl,
  TabScreenWrapper,
} from '../../src/components/common';
import { AnalyticsRangeSelector } from '../../src/components/workout-analytics/AnalyticsRangeSelector';
import { ExerciseHighlightCard } from '../../src/components/workout-analytics/ExerciseHighlightCard';
import { RepRangeEditorModal } from '../../src/components/workout-analytics/RepRangeEditorModal';
import { RepRangeVolumeChart } from '../../src/components/workout-analytics/RepRangeVolumeChart';
import { WorkoutAnalyticsComparisonGroup } from '../../src/components/workout-analytics/WorkoutAnalyticsComparisonGroup';
import { WorkoutAnalyticsContextNavigator } from '../../src/components/workout-analytics/WorkoutAnalyticsContextNavigator';
import { WorkoutAnalyticsContextPickerModal } from '../../src/components/workout-analytics/WorkoutAnalyticsContextPickerModal';
import { WorkoutAnalyticsDailySessionComparisonChart } from '../../src/components/workout-analytics/WorkoutAnalyticsDailySessionComparisonChart';
import { WorkoutAnalyticsHero, type WorkoutAnalyticsHeroMetric } from '../../src/components/workout-analytics/WorkoutAnalyticsHero';
import { WorkoutAnalyticsLineTrendChart } from '../../src/components/workout-analytics/WorkoutAnalyticsLineTrendChart';
import { WorkoutAnalyticsPillSelector } from '../../src/components/workout-analytics/WorkoutAnalyticsPillSelector';
import { WorkoutAnalyticsSnapshotCard } from '../../src/components/workout-analytics/WorkoutAnalyticsSnapshotCard';
import { DEFAULT_WORKOUT_ANALYTICS_RANGE } from '../../src/constants/workoutAnalytics';
import { borderRadius, fontSize, spacing } from '../../src/constants/colors';
import {
  getWorkoutMacrocycleDetail,
  getWorkoutAnalyticsHistory,
  getWorkoutAnalyticsModules,
  listWorkoutMacrocycles,
  updateWorkoutAnalyticsPreferences,
} from '../../src/services/workoutAnalytics';
import { useBottomTabBarContentInset, useBottomTabBarScroll } from '../../src/hooks/useBottomTabBarVisibility';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
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
  WorkoutAnalyticsSummaryCardsSection,
  WorkoutAnalyticsTrendSeriesSection,
} from '../../src/types';
import { formatLocalDate } from '../../src/utils/date';
import { formatDuration } from '../../src/utils/formatters';
import {
  getDashboardContentWidth,
  getPrimaryScreenHorizontalPadding,
  isTabletLayout,
} from '../../src/utils/layout';
import { formatCalories, formatDistance, formatVolumeKg } from '../../src/utils/workoutAnalytics';
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

const TREND_STATUS_SORT_PRIORITY: Record<string, number> = {
  rising: 4,
  stable: 3,
  declining: 2,
  insufficient: 1,
};

const HISTORY_PAGE_SIZE = 20;

const TAB_OPTIONS = [
  { value: 'overview', label: 'Resumen' },
  { value: 'exercises', label: 'Ejercicios' },
  { value: 'history', label: 'Historial' },
] as const;

const EXERCISE_SORT_OPTIONS = [
  { value: 'recent', label: 'Recientes' },
  { value: 'progress', label: 'Mayor progreso' },
  { value: 'frequency', label: 'Mas frecuentes' },
] as const;

const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completados' },
  { value: 'abandoned', label: 'Abandonados' },
] as const;

const ANALYTICS_SCOPE_OPTIONS: { value: WorkoutAnalyticsScopeKind; label: string }[] = [
  { value: 'range', label: 'Ventana' },
  { value: 'microcycle', label: 'Microciclo' },
  { value: 'mesocycle', label: 'Bloque' },
  { value: 'program', label: 'Programa' },
];

const HERO_METRIC_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sessions: 'barbell-outline',
  volume: 'trending-up-outline',
  active_days: 'flash-outline',
  avg_duration: 'time-outline',
  planned_sessions: 'calendar-outline',
  completed_sessions: 'checkmark-done-outline',
  double_sessions: 'copy-outline',
  weeks: 'calendar-clear-outline',
  completed_weeks: 'layers-outline',
  current_block: 'layers-outline',
  current_week: 'calendar-outline',
  completion: 'stats-chart-outline',
};

const getHistoryStatusMeta = (
  status: RecentWorkoutHistoryItem['status'],
  theme: AppTheme,
) => {
  switch (status) {
    case 'completed':
      return { icon: 'checkmark-circle', color: theme.colors.success, label: 'Completado' };
    case 'in_progress':
      return { icon: 'play-circle', color: theme.colors.primary, label: 'En progreso' };
    case 'abandoned':
      return { icon: 'warning', color: theme.colors.warning, label: 'Abandonado' };
    default:
      return { icon: 'barbell', color: theme.colors.iconMuted, label: status };
  }
};

const getSessionKindMeta = (
  sessionKind: RecentWorkoutHistoryItem['session_kind'],
  theme: AppTheme,
) => {
  switch (sessionKind) {
    case 'cardio':
      return {
        icon: 'heart-outline',
        label: 'Cardio',
        color: theme.colors.warning,
        background: theme.isDark ? 'rgba(245, 158, 11, 0.16)' : '#fef3c7',
      };
    case 'mixed':
      return {
        icon: 'swap-horizontal-outline',
        label: 'Mixta',
        color: theme.colors.primary,
        background: theme.isDark ? 'rgba(59, 130, 246, 0.16)' : '#dbeafe',
      };
    default:
      return {
        icon: 'barbell-outline',
        label: 'Fuerza',
        color: theme.colors.iconMuted,
        background: theme.isDark ? 'rgba(148, 163, 184, 0.16)' : '#f1f5f9',
      };
  }
};

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

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

const getSummarySection = (modules: WorkoutAnalyticsModules | null) =>
  (modules?.sections.find((section) => section.kind === 'summary_cards') as WorkoutAnalyticsSummaryCardsSection | undefined) ??
  undefined;

const getExerciseSection = (modules: WorkoutAnalyticsModules | null) =>
  (modules?.sections.find((section) => section.kind === 'exercise_highlights') as WorkoutAnalyticsExerciseHighlightsSection | undefined) ??
  undefined;

const getRecentSessionsSection = (modules: WorkoutAnalyticsModules | null) =>
  (modules?.sections.find((section) => section.kind === 'recent_sessions') as WorkoutAnalyticsRecentSessionsSection | undefined) ??
  undefined;

const buildHeroMetrics = (
  summarySection: WorkoutAnalyticsSummaryCardsSection | undefined,
): WorkoutAnalyticsHeroMetric[] =>
  (summarySection?.cards ?? []).map((card) => ({
    label: card.label,
    value: card.display_value,
    icon: HERO_METRIC_ICONS[card.id] ?? 'analytics-outline',
  }));

const getTabSubtitle = (activeTab: WorkoutAnalyticsTab) => {
  if (activeTab === 'history') {
    return 'Filtra el historial completo por ventana y estado sin salir de esta vista.';
  }

  if (activeTab === 'exercises') {
    return 'Cambia el contexto y revisa la progresion de cada movimiento sin depender del resumen principal.';
  }

  return 'Cambia el alcance del analisis para revisar tu progreso por ventana, microciclo, bloque o programa.';
};

const buildOverviewEmptyState = (
  scopeKind: WorkoutAnalyticsScopeKind,
  emptyMessage?: string | null,
) => {
  if (scopeKind !== 'range') {
    return {
      icon: 'layers-outline' as const,
      title: 'Sin contexto programatico disponible',
      description:
        emptyMessage ??
        'Aun no hay un programa activo o el cliente no tiene un contexto programatico resoluble.',
    };
  }

  return {
    icon: 'analytics-outline' as const,
    title: 'Sin datos suficientes',
    description:
      emptyMessage ??
      'Todavia no hay suficientes sesiones en la ventana seleccionada para construir analytics utiles.',
  };
};

type HistoryMetricItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
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
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.searchField}>
      <Ionicons name="search-outline" size={18} color={theme.colors.iconMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.searchInput}
      />
      {value ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onClear} style={styles.clearButton}>
          <Ionicons name="close" size={16} color={theme.colors.iconMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const SectionHeading = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity style={styles.sectionAction} activeOpacity={0.86} onPress={onActionPress}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color="#ffffff" />
        </TouchableOpacity>
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
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={26} color={theme.colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
      {actionLabel && onActionPress ? (
        <Button title={actionLabel} onPress={onActionPress} variant="secondary" />
      ) : null}
    </Card>
  );
};

const ExerciseCard = ({
  exercise,
  selectedRepBucketLabel,
  onPress,
}: {
  exercise: ExerciseTrendSummary;
  selectedRepBucketLabel?: string | null;
  onPress: () => void;
}) => {
  return (
    <ExerciseHighlightCard
      exercise={exercise}
      selectedRepBucketLabel={selectedRepBucketLabel}
      onPress={onPress}
    />
  );

  /*
    <TouchableOpacity style={styles.exerciseCard} activeOpacity={0.88} onPress={onPress}>
      <View style={styles.exerciseTopRow}>
        <View style={styles.exerciseCopy}>
          <Text style={styles.exerciseName} numberOfLines={2}>
            {exercise.exercise_name}
          </Text>
          <Text style={styles.exerciseMeta}>
            {exercise.last_performed_on
              ? selectedRepBucketLabel
                ? `Ultima sesion con ${selectedRepBucketLabel} reps · ${formatLocalDate(exercise.last_performed_on, {
                    day: 'numeric',
                    month: 'short',
                  })}`
                : `Ultima sesion ${formatLocalDate(exercise.last_performed_on, {
                    day: 'numeric',
                    month: 'short',
                  })}`
              : 'Sin fecha reciente'}
          </Text>
        </View>

        <View style={styles.exerciseSparklineWrap}>
          <ExerciseSparkline values={exercise.sparkline_points} width={120} />
        </View>
      </View>

      <View style={styles.exerciseFooter}>
        <View style={[styles.trendBadge, { backgroundColor: `${trendMeta.color}14` }]}>
          <Ionicons name={trendMeta.icon as keyof typeof Ionicons.glyphMap} size={14} color={trendMeta.color} />
          <Text style={[styles.trendBadgeText, { color: trendMeta.color }]}>{trendMeta.label}</Text>
        </View>

        <View style={styles.exerciseMetricPill}>
          <Text style={styles.exerciseMetricLabel}>
            {selectedRepBucketLabel ? `Mejor reciente en ${selectedRepBucketLabel}` : 'Mejor reciente'}
          </Text>
          <Text style={styles.exerciseMetricValue}>
            {exercise.primary_metric_value != null
              ? formatMetricValue(exercise.primary_metric_value, exercise.primary_metric_unit ?? '')
              : formatWeightKg(exercise.best_recent_weight_kg ?? exercise.latest_best_weight_kg ?? null)}
          </Text>
          {exercise.primary_metric_value != null && primaryMetricContext ? (
            <Text style={styles.exerciseMetricContext}>{primaryMetricContext}</Text>
          ) : null}
        </View>

        <View style={styles.exerciseMetricPill}>
          <Text style={styles.exerciseMetricLabel}>Sesiones</Text>
          <Text style={styles.exerciseMetricValue}>{exercise.sessions_count}</Text>
        </View>

        {exercise.total_volume_kg != null && exercise.total_volume_kg > 0 ? (
          <View style={styles.exerciseMetricPill}>
            <Text style={styles.exerciseMetricLabel}>Volumen</Text>
            <Text style={styles.exerciseMetricValue}>{formatVolumeKg(exercise.total_volume_kg)}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
  */
};

const HistoryCard = ({
  workout,
  selectedRepBucketLabel,
  onPress,
}: {
  workout: RecentWorkoutHistoryItem;
  selectedRepBucketLabel?: string | null;
  onPress: () => void;
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const statusMeta = getHistoryStatusMeta(workout.status, theme);
  const sessionKindMeta = getSessionKindMeta(workout.session_kind, theme);
  const cardioStats: HistoryMetricItem[] = [];
  if (workout.cardio_duration_minutes != null && workout.cardio_duration_minutes > 0) {
    cardioStats.push({
      id: 'cardio-duration',
      icon: 'time-outline',
      text: formatDuration(Math.max(1, Math.round(workout.cardio_duration_minutes))),
    });
  }
  if (workout.cardio_calories_burned != null && workout.cardio_calories_burned > 0) {
    cardioStats.push({
      id: 'cardio-calories',
      icon: 'flame-outline',
      text: formatCalories(workout.cardio_calories_burned),
    });
  }
  if (workout.cardio_distance_meters != null && workout.cardio_distance_meters > 0) {
    cardioStats.push({
      id: 'cardio-distance',
      icon: 'walk-outline',
      text: formatDistance(workout.cardio_distance_meters),
    });
  }
  const standardStats: HistoryMetricItem[] = [
    {
      id: 'duration',
      icon: 'time-outline' as const,
      text:
        workout.duration_minutes != null
          ? formatDuration(Math.max(1, Math.round(workout.duration_minutes)))
          : 'Sin duracion',
    },
    {
      id: 'exercises',
      icon: 'fitness-outline' as const,
      text: `${workout.exercises_count} ejercicios`,
    },
    ...(workout.session_kind === 'cardio'
      ? []
      : [
          {
            id: 'volume',
            icon: 'trending-up-outline' as const,
            text: formatVolumeKg(workout.volume_kg),
          },
        ]),
  ];
  const showCardioPrimary = workout.session_kind === 'cardio' && cardioStats.length > 0;
  const showStandardStats = workout.session_kind !== 'cardio' || cardioStats.length === 0;

  return (
    <TouchableOpacity style={styles.historyCard} activeOpacity={0.88} onPress={onPress}>
      <View style={styles.historyTopRow}>
        <View style={styles.historyTitleRow}>
          <View style={[styles.historyIcon, { backgroundColor: `${statusMeta.color}14` }]}>
            <Ionicons name={statusMeta.icon as keyof typeof Ionicons.glyphMap} size={18} color={statusMeta.color} />
          </View>

        <View style={styles.historyCopy}>
          <Text style={styles.historyName}>{workout.training_day_name}</Text>
          <Text style={styles.historyDate}>
            {selectedRepBucketLabel
              ? `Match ${selectedRepBucketLabel} · ${formatLocalDate(
                  workout.performed_on_date,
                  { weekday: 'long', day: 'numeric', month: 'short' },
                  'es-MX',
                )}`
              : formatLocalDate(
                  workout.performed_on_date,
                  { weekday: 'long', day: 'numeric', month: 'short' },
                  'es-MX',
                )}
          </Text>
          <View
            style={[
              styles.historyKindBadge,
              { backgroundColor: sessionKindMeta.background },
            ]}
          >
            <Ionicons
              name={sessionKindMeta.icon as keyof typeof Ionicons.glyphMap}
              size={12}
              color={sessionKindMeta.color}
            />
            <Text style={[styles.historyKindBadgeText, { color: sessionKindMeta.color }]}>
              {sessionKindMeta.label}
            </Text>
          </View>
        </View>
        </View>

        <Text style={[styles.historyStatus, { color: statusMeta.color }]}>{statusMeta.label}</Text>
      </View>

      {showStandardStats ? (
        <View style={styles.historyStatsRow}>
          {standardStats.map((item) => (
            <View key={item.id} style={styles.historyStat}>
              <Ionicons name={item.icon} size={14} color={theme.colors.iconMuted} />
              <Text style={styles.historyStatText}>{item.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {cardioStats.length ? (
        <View
          style={[
            styles.historyCardioBlock,
            showCardioPrimary ? styles.historyCardioBlockPrimary : null,
          ]}
        >
          <View style={styles.historyCardioHeader}>
            <Ionicons name="heart-outline" size={14} color={theme.colors.warning} />
            <Text style={styles.historyCardioTitle}>Cardio ejecutado</Text>
          </View>

          <View style={styles.historyCardioStatsRow}>
            {cardioStats.map((item) => (
              <View key={item.id} style={styles.historyStat}>
                <Ionicons name={item.icon} size={14} color={theme.colors.iconMuted} />
                <Text style={styles.historyStatText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

export default function WorkoutsScreen() {
  const { width, height } = useWindowDimensions();
  const contentWidth = getDashboardContentWidth(width);
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const chartWidth = Math.max(contentWidth - horizontalPadding * 2, 280);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const tabBarScroll = useBottomTabBarScroll();
  const contentInsetBottom = useBottomTabBarContentInset();
  const isFocused = useIsFocused();
  const isTablet = isTabletLayout(width, height);
  const [range, setRange] = useState<WorkoutAnalyticsRange>(DEFAULT_WORKOUT_ANALYTICS_RANGE);
  const [analyticsScopeKind, setAnalyticsScopeKind] = useState<WorkoutAnalyticsScopeKind>('range');
  const [modules, setModules] = useState<WorkoutAnalyticsModules | null>(null);
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
  const deferredExerciseSearch = useDeferredValue(exerciseSearchQuery);
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
  const activeTabSubtitle = useMemo(() => {
    if (analyticsScopeKind === 'range' && selectedRepBucketLabel) {
      if (activeTab === 'history') {
        return `Sesiones con sets en ${selectedRepBucketLabel} dentro de la ventana activa.`;
      }

      if (activeTab === 'exercises') {
        return `Lista filtrada por coincidencias en ${selectedRepBucketLabel} dentro de la ventana activa.`;
      }

      return `Resumen filtrado por sets en ${selectedRepBucketLabel} dentro de la ventana activa.`;
    }

    return getTabSubtitle(activeTab);
  }, [activeTab, analyticsScopeKind, selectedRepBucketLabel]);

  const loadModules = useCallback(
    async (options?: { refresh?: boolean; forceCurrentContext?: boolean }) => {
      const isRefresh = options?.refresh ?? false;
      const shouldResolveCurrentContext =
        analyticsScopeKind !== 'range' && ((options?.forceCurrentContext ?? false) || !isContextBootstrapped);
      const requestScopeParams =
        analyticsScopeKind === 'range' || shouldResolveCurrentContext
          ? { macrocycleId: null, mesocycleId: null, microcycleId: null }
          : getRequestParamsForSelection(analyticsScopeKind, selectedContext);

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const nextModules = await getWorkoutAnalyticsModules({
          scopeKind: analyticsScopeKind,
          range,
          repBucketId: analyticsScopeKind === 'range' ? selectedRepBucketId : null,
          macrocycleId: requestScopeParams.macrocycleId,
          mesocycleId: requestScopeParams.mesocycleId,
          microcycleId: requestScopeParams.microcycleId,
        });
        setModules(nextModules);
        setError(null);

        if (analyticsScopeKind !== 'range' && nextModules.program_scope && shouldResolveCurrentContext) {
          const nextSelection = getSelectionFromProgramScope(nextModules.program_scope);
          setCurrentProgramScope(nextModules.program_scope);
          setSelectedMacrocycleId(nextSelection.macrocycleId);
          setSelectedMesocycleId(nextSelection.mesocycleId);
          setSelectedMicrocycleId(nextSelection.microcycleId);
          setIsContextBootstrapped(true);
        }
      } catch (loadError) {
        const apiError = loadError as ApiError;
        if (apiError.status === 422 && selectedRepBucketId) {
          setSelectedRepBucketId(null);
          setError(null);
          return;
        }
        setError(apiError.message || 'No fue posible cargar tus entrenamientos.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [analyticsScopeKind, isContextBootstrapped, range, selectedContext, selectedRepBucketId],
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
        setContextCatalogError(apiError.message || 'No fue posible cargar el historico del programa.');
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
        setHistoryPage((currentPage) => (reset ? nextPage : mergeHistoryPages(currentPage, nextPage)));
        setHistoryError(null);
      } catch (loadError) {
        const apiError = loadError as ApiError;
        if (apiError.status === 422 && selectedRepBucketId) {
          setSelectedRepBucketId(null);
          setHistoryError(null);
          return;
        }
        setHistoryError(apiError.message || 'No fue posible cargar el historial completo.');
      } finally {
        setIsHistoryLoading(false);
        setIsHistoryRefreshing(false);
        setIsHistoryLoadingMore(false);
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

  const handleRefresh = useCallback(async () => {
    const refreshContextCatalog =
      analyticsScopeKind !== 'range'
        ? loadHistoricalCatalog({ refresh: true })
        : Promise.resolve();

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
  }, [activeTab, analyticsScopeKind, loadHistoricalCatalog, loadHistoryPage, loadModules]);

  const handleSaveRepRanges = useCallback(
    async (nextRepRanges: RepRangeBucket[]) => {
      setIsSavingRanges(true);

      try {
        await updateWorkoutAnalyticsPreferences({ rep_ranges: nextRepRanges });
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

  const summarySection = useMemo(() => getSummarySection(modules), [modules]);
  const exerciseSection = useMemo(() => getExerciseSection(modules), [modules]);
  const recentSessionsSection = useMemo(() => getRecentSessionsSection(modules), [modules]);
  const overviewSections = useMemo(
    () => (modules?.sections ?? []).filter((section) => section.kind !== 'summary_cards'),
    [modules?.sections],
  );
  const heroMetrics = useMemo(() => buildHeroMetrics(summarySection), [summarySection]);
  const exerciseItems = useMemo(() => exerciseSection?.items ?? [], [exerciseSection]);
  const recentSessions = useMemo(() => recentSessionsSection?.items ?? [], [recentSessionsSection]);
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

  const quickAction = useMemo(() => {
    const inProgressWorkout = recentSessions.find((workout) => workout.status === 'in_progress');
    if (inProgressWorkout) {
      return {
        label: 'Continuar',
        hint: inProgressWorkout.training_day_name,
        icon: 'play' as const,
        onPress: () => router.push(`/workout/${inProgressWorkout.workout_log_id}`),
      };
    }

    const latestWorkout = recentSessions[0];
    if (latestWorkout) {
      return {
        label: 'Ultimo registro',
        hint: `${latestWorkout.training_day_name} - ${formatLocalDate(latestWorkout.performed_on_date, {
          day: 'numeric',
          month: 'short',
        })}`,
        icon: 'arrow-forward' as const,
        onPress: () => router.push(`/workout/${latestWorkout.workout_log_id}`),
      };
    }

    return {
      label: 'Abrir programa',
      hint: modules?.context.scope_label ?? 'Revisa tu semana activa desde Inicio',
      icon: 'home-outline' as const,
      onPress: () => router.push('/(tabs)'),
    };
  }, [modules?.context.scope_label, recentSessions]);

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
  const showFullHistorySpinner = activeTab === 'history' && isHistoryLoading && !historyPage?.items.length;

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

  const handleTabChange = useCallback((nextValue: string) => {
    startTransition(() => {
      setActiveTab(nextValue as WorkoutAnalyticsTab);
    });
  }, []);

  const handleScopeChange = useCallback((nextValue: string) => {
    setAnalyticsScopeKind(nextValue as WorkoutAnalyticsScopeKind);
  }, []);

  const handleExerciseSortChange = useCallback((nextValue: string) => {
    setExerciseSort(nextValue as ExerciseSortOption);
  }, []);

  const handleHistoryStatusChange = useCallback((nextValue: string) => {
    setHistoryStatus(nextValue as WorkoutAnalyticsHistoryStatusFilter);
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
        title={modules?.context.title ?? 'Contexto programatico'}
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

  if (isLoading && !modules) {
    return <LoadingSpinner fullScreen text="Cargando tus entrenamientos..." />;
  }

  if (!modules) {
    return (
      <TabScreenWrapper>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={[styles.fullStateShell, { paddingHorizontal: horizontalPadding }]}>
            <EmptyStateCard
              icon="cloud-offline-outline"
              title="No fue posible cargar los datos"
              description={error || 'Intenta de nuevo para recuperar tu resumen de entrenamientos.'}
              actionLabel="Reintentar"
              onActionPress={() => void loadModules()}
            />
          </View>
        </SafeAreaView>
      </TabScreenWrapper>
    );
  }

  const pageHeader = (
    <View style={styles.pageHeaderShell}>
      <View
        style={[
          styles.pageHeader,
          { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
          isTablet ? styles.pageHeaderTablet : null,
        ]}
      >
        <View style={styles.screenIntroRow}>
          <View style={styles.screenIntro}>
            <Text style={styles.screenEyebrow}>Entrenamientos</Text>
            <Text style={styles.screenTitle}>Progreso</Text>
            <Text style={styles.screenSubtitle}>{activeTabSubtitle}</Text>
          </View>
          <ProfileShortcutButton />
        </View>

        <SegmentedControl
          options={TAB_OPTIONS.map((option) => ({
            key: option.value,
            label: option.label,
          }))}
          value={activeTab}
          onChange={(value) => handleTabChange(value)}
        />

        {activeTab === 'overview' ? (
          <>
            <WorkoutAnalyticsHero
              eyebrow={modules.context.scope_kind === 'range' ? 'Resumen' : modules.context.scope_label}
              title={modules.context.title}
              subtitle={modules.context.subtitle}
              rangeLabel={modules.context.scope_label}
              actionLabel={quickAction.label}
              actionHint={quickAction.hint}
              actionIcon={quickAction.icon}
              metrics={heroMetrics}
              onActionPress={quickAction.onPress}
            />

            <Card padding="sm" style={styles.utilityCard}>
              <View style={styles.utilityStack}>
                <View style={styles.utilityGroup}>
                  <Text style={styles.utilityLabel}>Contexto</Text>
                  <WorkoutAnalyticsPillSelector
                    items={ANALYTICS_SCOPE_OPTIONS}
                    value={analyticsScopeKind}
                    onChange={handleScopeChange}
                  />
                </View>

                {analyticsScopeKind === 'range' ? (
                  <View style={styles.utilityGroup}>
                    <Text style={styles.utilityLabel}>Ventana de analisis</Text>
                    <AnalyticsRangeSelector value={range} onChange={setRange} />
                  </View>
                ) : historicalContextNavigator ? (
                  historicalContextNavigator
                ) : null}
              </View>
            </Card>
          </>
        ) : null}

        {activeTab === 'exercises' ? (
          <>
            <Card style={styles.tabContextCard}>
              <Text style={styles.tabContextEyebrow}>Ejercicios</Text>
              <Text style={styles.tabContextTitle}>Lista completa del progreso</Text>
              <Text style={styles.tabContextSubtitle}>
                {analyticsScopeKind === 'range' && selectedRepBucketLabel
                  ? `Busca y ordena ejercicios con sets en ${selectedRepBucketLabel} dentro del contexto activo.`
                  : 'Busca y ordena los ejercicios dentro del contexto activo para detectar avances recientes.'}
              </Text>
            </Card>

            <Card padding="sm" style={styles.utilityCard}>
              <View style={styles.utilityStack}>
                <View style={styles.utilityGroup}>
                  <Text style={styles.utilityLabel}>Contexto</Text>
                  <WorkoutAnalyticsPillSelector
                    items={ANALYTICS_SCOPE_OPTIONS}
                    value={analyticsScopeKind}
                    onChange={handleScopeChange}
                  />
                </View>

                {analyticsScopeKind === 'range' ? (
                  <View style={styles.utilityGroup}>
                    <Text style={styles.utilityLabel}>Ventana de analisis</Text>
                    <AnalyticsRangeSelector value={range} onChange={setRange} />
                  </View>
                ) : historicalContextNavigator ? (
                  historicalContextNavigator
                ) : null}

                <SearchField
                  value={exerciseSearchQuery}
                  placeholder="Buscar ejercicio"
                  onChangeText={setExerciseSearchQuery}
                  onClear={() => setExerciseSearchQuery('')}
                />

                <View style={styles.utilityGroup}>
                  <Text style={styles.utilityLabel}>Orden</Text>
                  <WorkoutAnalyticsPillSelector
                    items={EXERCISE_SORT_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={exerciseSort}
                    onChange={handleExerciseSortChange}
                  />
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {activeTab === 'history' ? (
          <>
            <Card style={styles.tabContextCard}>
              <Text style={styles.tabContextEyebrow}>Historial</Text>
              <Text style={styles.tabContextTitle}>Sesiones registradas</Text>
              <Text style={styles.tabContextSubtitle}>
                {analyticsScopeKind === 'range' && selectedRepBucketLabel
                  ? `Revisa sesiones con sets en ${selectedRepBucketLabel} y filtralas por estado cuando haga falta.`
                  : 'Revisa los registros dentro del mismo contexto activo y filtralos por estado cuando haga falta.'}
              </Text>
            </Card>

            <Card padding="sm" style={styles.utilityCard}>
              <View style={styles.utilityStack}>
                <View style={styles.utilityGroup}>
                  <Text style={styles.utilityLabel}>Contexto</Text>
                  <WorkoutAnalyticsPillSelector
                    items={ANALYTICS_SCOPE_OPTIONS}
                    value={analyticsScopeKind}
                    onChange={handleScopeChange}
                  />
                </View>

                {analyticsScopeKind === 'range' ? (
                  <View style={styles.utilityGroup}>
                    <Text style={styles.utilityLabel}>Ventana de analisis</Text>
                    <AnalyticsRangeSelector value={range} onChange={setRange} />
                  </View>
                ) : historicalContextNavigator ? (
                  historicalContextNavigator
                ) : null}

                <View style={styles.utilityGroup}>
                  <Text style={styles.utilityLabel}>Estado</Text>
                  <WorkoutAnalyticsPillSelector
                    items={HISTORY_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={historyStatus}
                    onChange={handleHistoryStatusChange}
                  />
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {analyticsScopeKind === 'range' && selectedRepBucketId && selectedRepBucketLabel ? (
          <View style={styles.filterBanner}>
            <Ionicons name="funnel-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.filterBannerText}>
              Filtrando todo Entrenamientos por {selectedRepBucketLabel} reps.
            </Text>
            <TouchableOpacity
              style={styles.inlineBannerAction}
              activeOpacity={0.86}
              onPress={() => setSelectedRepBucketId(null)}
            >
              <Text style={styles.inlineBannerActionText}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? (
          <View style={styles.inlineBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.inlineBannerText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <TabScreenWrapper>
      <SafeAreaView style={styles.container} edges={['top']}>
        {activeTab === 'overview' ? (
          <FlatList
            data={overviewSections}
            keyExtractor={(item, index) => `${item.kind}-${index}`}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: contentInsetBottom + spacing.lg },
            ]}
            ListHeaderComponent={pageHeader}
            showsVerticalScrollIndicator={false}
            onScroll={tabBarScroll.onScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            refreshControl={(
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            )}
            renderItem={({ item }) => {
              const shellStyle = [
                styles.sectionShell,
                { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
              ];

              if (item.kind === 'snapshot') {
                return (
                  <View style={shellStyle}>
                    <WorkoutAnalyticsSnapshotCard section={item} />
                  </View>
                );
              }

              if (item.kind === 'trend_series') {
                const trendSection = item as WorkoutAnalyticsTrendSeriesSection;
                return (
                  <View style={shellStyle}>
                    <Card style={styles.featureCard} padding="lg">
                      <View style={styles.featureCardHeader}>
                        <View style={styles.sectionHeaderCopy}>
                          <Text style={styles.sectionTitle}>{trendSection.title}</Text>
                          {trendSection.subtitle ? (
                            <Text style={styles.sectionSubtitle}>{trendSection.subtitle}</Text>
                          ) : null}
                        </View>

                        {trendSection.chart_variant === 'stacked_rep_ranges' ? (
                          <TouchableOpacity
                            style={styles.editButton}
                            activeOpacity={0.86}
                            onPress={() => setIsRangeEditorVisible(true)}
                          >
                            <Ionicons name="options-outline" size={16} color={theme.colors.primary} />
                            <Text style={styles.editButtonText}>Editar</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {trendSection.chart_variant === 'stacked_rep_ranges' ? (
                        <RepRangeVolumeChart
                          points={trendSection.rep_range_points}
                          repRanges={trendSection.rep_ranges}
                          contentWidth={chartWidth}
                          selectedBucketId={selectedRepBucketId}
                          onSelectBucket={analyticsScopeKind === 'range' ? setSelectedRepBucketId : undefined}
                        />
                      ) : trendSection.semantic_kind === 'daily_session_comparison' ? (
                        <WorkoutAnalyticsDailySessionComparisonChart
                          section={trendSection}
                          contentWidth={chartWidth}
                        />
                      ) : (
                        <WorkoutAnalyticsLineTrendChart section={trendSection} contentWidth={chartWidth} />
                      )}
                    </Card>
                  </View>
                );
              }

              if (item.kind === 'comparison_group') {
                return (
                  <View style={shellStyle}>
                    <WorkoutAnalyticsComparisonGroup section={item as WorkoutAnalyticsComparisonGroupSection} />
                  </View>
                );
              }

              if (item.kind === 'exercise_highlights') {
                const exerciseHighlights = item as WorkoutAnalyticsExerciseHighlightsSection;
                return (
                  <View style={[styles.sectionBlock, shellStyle]}>
                    <SectionHeading
                      title={exerciseHighlights.title}
                      subtitle={
                        analyticsScopeKind === 'range' && selectedRepBucketLabel
                          ? `Movimientos con matches en ${selectedRepBucketLabel} dentro del alcance actual.`
                          : exerciseHighlights.subtitle ?? 'Movimientos con mas señal de progreso.'
                      }
                      actionLabel={exerciseHighlights.items.length ? 'Ver todos' : undefined}
                      onActionPress={exerciseHighlights.items.length ? () => handleTabChange('exercises') : undefined}
                    />

                    {exerciseHighlights.items.length ? (
                      <View style={styles.cardsStack}>
                        {exerciseHighlights.items.slice(0, 3).map((exercise) => (
                          <ExerciseCard
                            key={exercise.exercise_id}
                            exercise={exercise}
                            selectedRepBucketLabel={selectedRepBucketLabel}
                            onPress={() => openExerciseDetail(exercise.exercise_id)}
                          />
                        ))}
                      </View>
                    ) : (
                      <EmptyStateCard
                        icon="analytics-outline"
                        title="Sin ejercicios destacados"
                        description={
                          analyticsScopeKind === 'range'
                            ? selectedRepBucketLabel
                              ? `Todavia no hay movimientos con sets en ${selectedRepBucketLabel} dentro de esta ventana.`
                              : 'Completa mas sesiones o cambia la ventana temporal para recuperar progreso.'
                            : modules.context.empty_message ??
                              'Todavia no hay suficiente señal dentro de este contexto programatico.'
                        }
                      />
                    )}
                  </View>
                );
              }

              const recentSection = item as WorkoutAnalyticsRecentSessionsSection;
              return (
                <View style={[styles.sectionBlock, shellStyle]}>
                  <SectionHeading
                    title={recentSection.title}
                    subtitle={
                      analyticsScopeKind === 'range' && selectedRepBucketLabel
                        ? `Sesiones con sets en ${selectedRepBucketLabel} dentro del alcance actual.`
                        : recentSection.subtitle ?? 'Registros recientes dentro del alcance actual.'
                    }
                    actionLabel={
                      analyticsScopeKind === 'range' && recentSection.items.length ? 'Abrir historial' : undefined
                    }
                    onActionPress={
                      analyticsScopeKind === 'range' && recentSection.items.length
                        ? () => handleTabChange('history')
                        : undefined
                    }
                  />

                  {recentSection.items.length ? (
                    <View style={styles.cardsStack}>
                      {recentSection.items.slice(0, 3).map((workout) => (
                        <HistoryCard
                          key={workout.workout_log_id}
                          workout={workout}
                          selectedRepBucketLabel={selectedRepBucketLabel}
                          onPress={() => router.push(`/workout/${workout.workout_log_id}`)}
                        />
                      ))}
                    </View>
                  ) : (
                    <EmptyStateCard
                      icon="barbell-outline"
                      title="Sin sesiones recientes"
                      description={
                        selectedRepBucketLabel
                          ? `No hay sesiones con sets en ${selectedRepBucketLabel} dentro de esta ventana.`
                          : 'Tu historial aparecera aqui en cuanto registres entrenamientos.'
                      }
                    />
                  )}
                </View>
              );
            }}
            ListEmptyComponent={(
              <View
                style={[
                  styles.sectionShell,
                  styles.emptyListWrap,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                <EmptyStateCard
                  icon={overviewEmptyState.icon}
                  title={overviewEmptyState.title}
                  description={overviewEmptyState.description}
                />
              </View>
            )}
          />
        ) : null}

        {activeTab === 'exercises' ? (
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.exercise_id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: contentInsetBottom + spacing.lg },
            ]}
            ListHeaderComponent={(
              <>
                {pageHeader}
                <View
                  style={[
                    styles.listMetaRow,
                    styles.sectionShell,
                    { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                  ]}
                >
                  <Text style={styles.listMetaTitle}>Lista completa</Text>
                  <Text style={styles.listMetaText}>
                    {selectedRepBucketLabel
                      ? `${filteredExercises.length} de ${exerciseItems.length} ejercicios con sets en ${selectedRepBucketLabel}`
                      : `${filteredExercises.length} de ${exerciseItems.length} ejercicios visibles`}
                  </Text>
                </View>
              </>
            )}
            showsVerticalScrollIndicator={false}
            onScroll={tabBarScroll.onScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            refreshControl={(
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            )}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                <ExerciseCard
                  exercise={item}
                  selectedRepBucketLabel={selectedRepBucketLabel}
                  onPress={() => openExerciseDetail(item.exercise_id)}
                />
              </View>
            )}
            ListEmptyComponent={(
              <View
                style={[
                  styles.emptyListWrap,
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                {!exerciseItems.length ? (
                  <EmptyStateCard
                    icon={analyticsScopeKind === 'range' ? 'filter-outline' : 'layers-outline'}
                    title={analyticsScopeKind === 'range' ? 'Sin datos en este rango' : 'Sin ejercicios en este contexto'}
                    description={
                      analyticsScopeKind === 'range'
                        ? selectedRepBucketLabel
                          ? `No hay ejercicios con sets en ${selectedRepBucketLabel}. Limpia el filtro o amplia la ventana.`
                          : 'Prueba con una ventana mas amplia para recuperar progreso.'
                        : modules.context.empty_message ??
                          'Todavia no hay suficiente actividad para construir esta lista en el contexto actual.'
                    }
                    actionLabel={analyticsScopeKind === 'range' ? 'Ver todo' : undefined}
                    onActionPress={analyticsScopeKind === 'range' ? () => setRange('all') : undefined}
                  />
                ) : (
                  <EmptyStateCard
                    icon="search-outline"
                    title="Sin coincidencias"
                    description="Ajusta tu busqueda o cambia el criterio de orden."
                    actionLabel="Limpiar"
                    onActionPress={() => setExerciseSearchQuery('')}
                  />
                )}
              </View>
            )}
          />
        ) : null}

        {activeTab === 'history' ? (
          <SectionList
            sections={historySections}
            keyExtractor={(item) => item.workout_log_id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: contentInsetBottom + spacing.lg },
            ]}
            ListHeaderComponent={(
              <>
                {pageHeader}
                <View
                  style={[
                    styles.listMetaRow,
                    styles.sectionShell,
                    { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                  ]}
                >
                  <Text style={styles.listMetaTitle}>Historial completo</Text>
                  <Text style={styles.listMetaText}>
                    {selectedRepBucketLabel
                      ? `${historyPage?.total ?? 0} sesiones con sets en ${selectedRepBucketLabel}`
                      : `${historyPage?.total ?? 0} sesiones en la consulta actual`}
                  </Text>
                </View>
              </>
            )}
            showsVerticalScrollIndicator={false}
            onScroll={tabBarScroll.onScroll}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            stickySectionHeadersEnabled={false}
            refreshControl={(
              <RefreshControl
                refreshing={isRefreshing || isHistoryRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            )}
            onEndReached={handleHistoryLoadMore}
            onEndReachedThreshold={0.35}
            renderSectionHeader={({ section }) => (
              <View
                style={[
                  styles.monthHeader,
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                <Text style={styles.monthHeaderText}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                <HistoryCard
                  workout={item}
                  selectedRepBucketLabel={selectedRepBucketLabel}
                  onPress={() => router.push(`/workout/${item.workout_log_id}`)}
                />
              </View>
            )}
            ListEmptyComponent={(
              <View
                style={[
                  styles.emptyListWrap,
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                {showFullHistorySpinner ? (
                  <View style={styles.loadingHistoryWrap}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={styles.loadingHistoryText}>Cargando historial...</Text>
                  </View>
                ) : historyError ? (
                  <EmptyStateCard
                    icon="cloud-offline-outline"
                    title="No fue posible cargar el historial"
                    description={historyError}
                    actionLabel="Reintentar"
                    onActionPress={() => void loadHistoryPage({ reset: true })}
                  />
                ) : (
                  <EmptyStateCard
                    icon="calendar-clear-outline"
                    title="Sin sesiones para este filtro"
                    description={
                      analyticsScopeKind === 'range'
                        ? selectedRepBucketLabel
                          ? `No hay sesiones con sets en ${selectedRepBucketLabel}. Limpia el filtro o amplia la ventana temporal.`
                          : 'Prueba otro estado o amplia la ventana temporal.'
                        : 'Prueba otro estado o cambia el contexto historico.'
                    }
                    actionLabel="Ver todos"
                    onActionPress={() => setHistoryStatus('all')}
                  />
                )}
              </View>
            )}
            ListFooterComponent={(
              <View
                style={[
                  styles.historyFooter,
                  styles.sectionShell,
                  { maxWidth: contentWidth, paddingHorizontal: horizontalPadding },
                ]}
              >
                {isHistoryLoadingMore ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : null}
                {historyError && (historyPage?.items.length ?? 0) > 0 ? (
                  <TouchableOpacity
                    style={styles.retryFooterButton}
                    activeOpacity={0.86}
                    onPress={() => void loadHistoryPage({ skip: historyPage?.items.length ?? 0 })}
                  >
                    <Text style={styles.retryFooterText}>Reintentar carga</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          />
        ) : null}

        <RepRangeEditorModal
          visible={isRangeEditorVisible}
          repRanges={modules.preferences.rep_ranges}
          isSaving={isSavingRanges}
          onClose={() => setIsRangeEditorVisible(false)}
          onSave={handleSaveRepRanges}
        />
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
      </SafeAreaView>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    pageHeaderShell: {
      width: '100%',
      alignItems: 'center',
    },
    pageHeader: {
      width: '100%',
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.lg,
    },
    pageHeaderTablet: {
      paddingTop: spacing.lg,
    },
    screenIntro: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    screenIntroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    screenEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    screenTitle: {
      fontSize: fontSize['2xl'],
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    screenSubtitle: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    utilityCard: {
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    utilityStack: {
      gap: spacing.md,
    },
    utilityGroup: {
      gap: spacing.sm,
    },
    utilityLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    tabContextCard: {
      gap: spacing.xs,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    tabContextEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    tabContextTitle: {
      fontSize: fontSize.xl,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    tabContextSubtitle: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: theme.colors.textPrimary,
    },
    clearButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    inlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.12)' : '#fef3c7',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(251, 191, 36, 0.24)' : '#fde68a',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    inlineBannerText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
    },
    filterBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.14)' : '#eff6ff',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(59, 130, 246, 0.24)' : '#bfdbfe',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterBannerText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
    },
    inlineBannerAction: {
      borderRadius: borderRadius.full,
      backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.16)' : '#dbeafe',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    inlineBannerActionText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    list: {
      flex: 1,
    },
    listContent: {
      gap: spacing.lg,
      paddingTop: spacing.xs,
    },
    sectionShell: {
      width: '100%',
      alignSelf: 'center',
    },
    sectionBlock: {
      gap: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    sectionHeaderCopy: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    sectionSubtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    sectionAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    sectionActionText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: '#ffffff',
    },
    cardsStack: {
      gap: spacing.md,
    },
    featureCard: {
      gap: spacing.md,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    featureCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    editButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    historyCard: {
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    historyTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    historyTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      flex: 1,
    },
    historyIcon: {
      width: 42,
      height: 42,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyCopy: {
      flex: 1,
      minWidth: 0,
    },
    historyName: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    historyDate: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      textTransform: 'capitalize',
    },
    historyKindBadge: {
      marginTop: spacing.xs,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    historyKindBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    historyStatus: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    historyStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    historyStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    historyStatText: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    historyCardioBlock: {
      gap: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    historyCardioBlockPrimary: {
      paddingTop: 0,
      borderTopWidth: 0,
    },
    historyCardioHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    historyCardioTitle: {
      fontSize: fontSize.xs,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    historyCardioStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    emptyCard: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    emptyIconWrap: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    listMetaRow: {
      paddingTop: spacing.xs,
      gap: 2,
    },
    listMetaTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    listMetaText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    emptyListWrap: {
      paddingTop: spacing.sm,
    },
    loadingHistoryWrap: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    loadingHistoryText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    monthHeader: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    monthHeaderText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      textTransform: 'capitalize',
    },
    historyFooter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    retryFooterButton: {
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    retryFooterText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    fullStateShell: {
      flex: 1,
      justifyContent: 'center',
    },
  });
