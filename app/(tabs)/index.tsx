import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '../../src/store/authStore';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { LoadingSpinner, TabScreenWrapper } from '../../src/components/common';
import {
  CalendarDatePickerModal,
  type SharedWeeklyCalendarDay,
} from '../../src/components/calendar';
import {
  MetricsSummary,
  ScienceTips,
  SessionPickerModal,
  TodayInNumbers,
  TodayWorkoutCard,
  HomeHero,
  type ReadinessNumbers,
  type SessionsNumbers,
} from '../../src/components/dashboard';
import { ActivityGridCard } from '../../src/components/activity';
import { AuroraBackdrop, AuroraTopScrim } from '../../src/components/aurora';
import { useDailyActivity } from '../../src/hooks/useDailyActivity';
import { buildActivityGrid, getCurrentDailyStreak, meetsTwoGoals } from '../../src/utils/activityGrid';
import { ConnectedHealthSetupBanner } from '../../src/components/connected-health';
import { useConnectedHealthFeedback } from '../../src/hooks/useConnectedHealthFeedback';
import { getConnectedHealthStateCopy } from '../../src/utils/connectedHealthFeedback';
import { buildWeeklyAdherence, summarizeAdherence, summarizeSteps } from '../../src/utils/homeNumbers';
import { getChatConversations } from '../../src/services/chat';
import { CareTeamSection } from '../../src/components/care-team';
import type { ScienceTip } from '../../src/constants/scienceTips';
import { spacing } from '../../src/constants/colors';
import { useBottomTabBarContentInset, useBottomTabBarScroll } from '../../src/hooks/useBottomTabBarVisibility';
import { useCareTeam } from '../../src/hooks/useCareTeam';
import { getMuscleVolume } from '../../src/services/api';
import {
  calculateWeeklyVisibleDietCaloriesAverage,
  getClientEffectiveDietWeek,
  getTodayDietDateKey,
} from '../../src/services/diet';
import type { TipContext } from '../../src/utils/contextualTips';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import type {
  AssignedProfessionalDomain,
  AssignedProfessionalSummary,
  MicrocycleMode,
  MicrocycleSessionProgress,
  MuscleVolumeResponse,
} from '../../src/types';
import { formatLocalDate, getTodayDateKey, toLocalDateKey } from '../../src/utils/date';
import {
  getDashboardContentWidth,
  getPrimaryScreenHorizontalPadding,
  isTabletLayout,
} from '../../src/utils/layout';
import {
  buildProgramTimelineModel,
  buildProgramTimelineView,
  getProgramTimelineCalendarDayLabel,
  getProgramTimelineDefaultFocusDateKey,
  getProgramTimelineWeekLabel,
  isSessionActionable,
  shiftProgramTimelineFocusByWeek,
  type ProgramTimelineSession,
} from '../../src/utils/programTimeline';
import { toast } from '../../src/store/toastStore';

const stripExistingClientContextPrefix = (value: string) =>
  value
    .trim()
    .replace(/^tu\s+(plan|promedio semanal|nutrición|nutricion):\s*/i, '')
    .replace(/^promedio semanal:\s*/i, '')
    .trim();

const getClientContextPrefix = (
  domain: AssignedProfessionalDomain,
  contextLabel: string,
) => {
  if (domain === 'training') {
    return 'Tu plan';
  }

  return /kcal|promedio/i.test(contextLabel)
    ? 'Tu promedio semanal'
    : 'Tu nutrición';
};

const formatClientContextLabel = (
  contextLabel: string | null,
  domain: AssignedProfessionalDomain,
) => {
  const trimmedContext = contextLabel?.trim();

  if (!trimmedContext) {
    return null;
  }

  if (/^tu\s+(plan|promedio semanal|nutrición|nutricion):/i.test(trimmedContext)) {
    return trimmedContext;
  }

  const value = stripExistingClientContextPrefix(trimmedContext);
  return `${getClientContextPrefix(domain, trimmedContext)}: ${value}`;
};

const formatHomeCareTeamSummary = (
  summary: AssignedProfessionalSummary | null,
  domain: AssignedProfessionalDomain,
  contextOverride?: string | null,
) => {
  if (!summary || summary.status !== 'assigned') {
    return summary;
  }

  const contextLabel = formatClientContextLabel(
    contextOverride ?? summary.contextLabel,
    domain,
  );

  if (summary.contextLabel === contextLabel) {
    return summary;
  }

  return {
    ...summary,
    contextLabel,
  };
};

const ACTIVITY_WEEKS = 16;
// The volume behind the body map counts synergists at half, as the volume chart did by default.
const COUNT_SECONDARY_MUSCLES = true;

type UnreadMessages = { count: number; from: string | null };

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTablet = isTabletLayout(width, height);
  const contentWidth = getDashboardContentWidth(width);
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { onScroll: onTabBarScroll, scrollEventThrottle } = useBottomTabBarScroll();
  const contentInsetBottom = useBottomTabBarContentInset();
  const insets = useSafeAreaInsets();
  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onTabBarScroll(event);
      const scrolled = event.nativeEvent.contentOffset.y > 4;
      setIsScrolled((current) => (current === scrolled ? current : scrolled));
    },
    [onTabBarScroll],
  );
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);
  const {
    summaries: careTeamSummaries,
    errors: careTeamErrors,
    isLoading: isLoadingCareTeam,
    refreshCareTeam,
  } = useCareTeam(user?.id ?? null);
  const dashboardBootstrap = useWorkoutStore((state) => state.dashboardBootstrap);
  const dashboardDataVersion = useWorkoutStore((state) => state.dashboardDataVersion);
  const workoutLogsVersion = useWorkoutStore((state) => state.workoutLogsVersion);
  const dailyActivity = useDailyActivity({ weeks: ACTIVITY_WEEKS, enabled: false });
  const reloadDailyActivity = dailyActivity.reload;
  const homeStreakDays = useMemo(() => {
    const model = buildActivityGrid({
      todayKey: getTodayDateKey(),
      weeks: ACTIVITY_WEEKS,
      days: dailyActivity.days,
      mode: 'todo',
      startKey: dailyActivity.startKey,
    });
    return getCurrentDailyStreak(model.cells, model.todayIndex, meetsTwoGoals);
  }, [dailyActivity.days, dailyActivity.startKey]);

  // Salud conectada vive aquí y no en una tarjeta: alimenta el chip y la casilla de preparación,
  // y conserva la sincronización al enfocar Inicio y al volver la app al frente.
  const {
    feedback: healthFeedback,
    isSyncing: isHealthSyncing,
    needsPermissionCta: healthNeedsPermission,
    connectionState: healthConnectionState,
    refreshOnFocus: refreshHealthOnFocus,
  } = useConnectedHealthFeedback({
    days: 7,
    autoSync: true,
    foregroundSyncMaxAgeMs: 20 * 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      void refreshHealthOnFocus();
    }, [refreshHealthOnFocus]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshHealthOnFocus();
      }
    });
    return () => subscription.remove();
  }, [refreshHealthOnFocus]);

  // Mensajes sin leer para el chip del saludo; solo lectura.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return undefined;
      }

      let cancelled = false;
      getChatConversations()
        .then((conversations) => {
          if (cancelled) {
            return;
          }
          const unread = conversations.filter((conversation) => conversation.unread_count > 0);
          const count = unread.reduce((total, conversation) => total + conversation.unread_count, 0);
          setUnreadMessages(count > 0 ? { count, from: unread[0]?.participant?.name ?? null } : null);
        })
        .catch(() => {
          if (!cancelled) {
            setUnreadMessages(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [user?.id]),
  );

  // Se recarga al volver a Inicio y cuando se registra un entreno nuevo.
  useEffect(() => {
    if (isFocused && user?.id) {
      void reloadDailyActivity();
    }
  }, [isFocused, reloadDailyActivity, user?.id, workoutLogsVersion]);
  const isLoading = useWorkoutStore((state) => state.isLoading);
  const isStartingWorkout = useWorkoutStore((state) => state.isStartingWorkout);
  const error = useWorkoutStore((state) => state.error);
  const loadDashboardData = useWorkoutStore((state) => state.loadDashboardData);
  const startWorkout = useWorkoutStore((state) => state.startWorkout);
  const clearError = useWorkoutStore((state) => state.clearError);

  const [refreshing, setRefreshing] = useState(false);
  const [currentWeekDietCaloriesAverage, setCurrentWeekDietCaloriesAverage] = useState<number | null>(null);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeResponse | null>(null);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessages | null>(null);
  const [microcycleMode, setMicrocycleMode] = useState<MicrocycleMode>('planned');
  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(null);
  const [isSessionPickerVisible, setIsSessionPickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [hasPlayedEntryAnimation, setHasPlayedEntryAnimation] = useState(false);
  const [shouldLoadDeferredContent, setShouldLoadDeferredContent] = useState(false);
  const lastLoadedWorkoutLogsVersionRef = useRef<number | null>(null);
  const microcycleProgress = dashboardBootstrap?.microcycle_progress ?? null;
  const timeline = dashboardBootstrap?.timeline ?? null;

  const programTimelineModel = useMemo(
    () => buildProgramTimelineModel(timeline),
    [timeline],
  );
  const programTimelineView = useMemo(
    () => buildProgramTimelineView(programTimelineModel, focusedDateKey, microcycleMode),
    [focusedDateKey, microcycleMode, programTimelineModel],
  );
  const currentWeekLabel = useMemo(
    () => getProgramTimelineWeekLabel(programTimelineView.currentWeekStartDateKey),
    [programTimelineView.currentWeekStartDateKey],
  );
  const navigatorDays = useMemo<SharedWeeklyCalendarDay[]>(
    () =>
      programTimelineView.days.map((day) => {
        const { dayLabel, dateNumber } = getProgramTimelineCalendarDayLabel(day.dateKey);

        return {
          id: `${day.dateKey}-${microcycleMode}`,
          dateKey: day.dateKey,
          dayLabel,
          dateNumber,
          isSelected: day.isSelected,
          isToday: day.isToday,
          isDisabled: false,
          statusText: day.statusText,
          variant: day.variant,
          showHero: day.showHero,
          onPress: () => {
            setFocusedDateKey(day.dateKey);
            setIsSessionPickerVisible(false);
          },
        };
      }),
    [microcycleMode, programTimelineView.days],
  );
  const canOpenDatePicker = Boolean(
    programTimelineModel.calendarStartDateKey && programTimelineModel.calendarEndDateKey,
  );
  const showInitialLoadingState = isLoading && !refreshing && dashboardDataVersion === 0;
  const shouldAnimateEntry = !hasPlayedEntryAnimation && !showInitialLoadingState;
  const getEntryAnimation = useCallback(
    (delay: number) => (shouldAnimateEntry ? FadeInDown.delay(delay).duration(400) : undefined),
    [shouldAnimateEntry],
  );

  const syncDashboardData = useCallback(
    async (version = workoutLogsVersion) => {
      if (!user?.id) {
        return;
      }

      await loadDashboardData();
      lastLoadedWorkoutLogsVersionRef.current = version;
    },
    [loadDashboardData, user?.id, workoutLogsVersion],
  );
  const loadCurrentWeekDietCaloriesAverage = useCallback(async () => {
    if (!user?.id) {
      setCurrentWeekDietCaloriesAverage(null);
      return;
    }

    try {
      const currentWeekDays = await getClientEffectiveDietWeek(
        user.id,
        getTodayDietDateKey(),
      );
      setCurrentWeekDietCaloriesAverage(
        calculateWeeklyVisibleDietCaloriesAverage(currentWeekDays),
      );
    } catch (loadError) {
      console.error(
        'Error loading current week diet calories average:',
        loadError,
      );
      setCurrentWeekDietCaloriesAverage(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isFocused || !user?.id) {
      return;
    }

    void refreshCareTeam();
  }, [isFocused, refreshCareTeam, user?.id]);

  useEffect(() => {
    if (!isFocused || !user?.id) {
      return;
    }

    if (
      dashboardDataVersion !== 0 &&
      lastLoadedWorkoutLogsVersionRef.current === workoutLogsVersion
    ) {
      return;
    }

    void syncDashboardData(workoutLogsVersion);
  }, [dashboardDataVersion, isFocused, syncDashboardData, user?.id, workoutLogsVersion]);

  useEffect(() => {
    if (!user?.id) {
      setCurrentWeekDietCaloriesAverage(null);
      return;
    }

    if (!isFocused) {
      return;
    }

    void loadCurrentWeekDietCaloriesAverage();
  }, [isFocused, loadCurrentWeekDietCaloriesAverage, user?.id]);

  useEffect(() => {
    if (!shouldAnimateEntry) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHasPlayedEntryAnimation(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldAnimateEntry]);

  useEffect(() => {
    if (dashboardDataVersion === 0 || showInitialLoadingState) {
      setShouldLoadDeferredContent(false);
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      setShouldLoadDeferredContent(true);
    });

    return () => {
      task.cancel();
    };
  }, [dashboardDataVersion, showInitialLoadingState]);

  useEffect(() => {
    const defaultFocusDateKey = getProgramTimelineDefaultFocusDateKey(programTimelineModel);
    setFocusedDateKey((currentDateKey) => (
      currentDateKey === defaultFocusDateKey ? currentDateKey : defaultFocusDateKey
    ));
    setIsSessionPickerVisible(false);
    setIsDatePickerVisible(false);
  }, [dashboardDataVersion, programTimelineModel]);

  useEffect(() => {
    const loadMuscleVolume = async () => {
      if (
        !shouldLoadDeferredContent ||
        !programTimelineView.highlightedTrainingDay?.id ||
        programTimelineView.highlightedTrainingDay.rest_day
      ) {
        setMuscleVolume(null);
        setIsLoadingVolume(false);
        return;
      }

      setIsLoadingVolume(true);
      try {
        const data = await getMuscleVolume(
          programTimelineView.highlightedTrainingDay.id,
          COUNT_SECONDARY_MUSCLES,
        );
        setMuscleVolume(data);
      } catch (err) {
        console.error('Error loading muscle volume:', err);
        setMuscleVolume(null);
      } finally {
        setIsLoadingVolume(false);
      }
    };

    void loadMuscleVolume();
  }, [
    programTimelineView.highlightedTrainingDay?.id,
    programTimelineView.highlightedTrainingDay?.rest_day,
    shouldLoadDeferredContent,
  ]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [clearError, error]);

  const onRefresh = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    setRefreshing(true);
    await Promise.all([
      loadDashboardData(),
      refreshCareTeam(),
      loadCurrentWeekDietCaloriesAverage(),
      reloadDailyActivity(),
    ]);
    lastLoadedWorkoutLogsVersionRef.current = workoutLogsVersion;
    setRefreshing(false);
  }, [
    loadCurrentWeekDietCaloriesAverage,
    loadDashboardData,
    refreshCareTeam,
    reloadDailyActivity,
    user?.id,
    workoutLogsVersion,
  ]);

  const openWorkoutSession = useCallback(
    async (session: MicrocycleSessionProgress) => {
      if (session.workout_log_id) {
        router.push({
          pathname: '/workout/[id]',
          params: { id: session.workout_log_id },
        });
        return;
      }

      const workoutLogId = await startWorkout(session.training_day_id);
      if (workoutLogId) {
        router.push({
          pathname: '/workout/[id]',
          params: { id: workoutLogId },
        });
      }
    },
    [startWorkout],
  );

  const handleGoToActionable = useCallback(() => {
    const actionableDateKey = programTimelineView.actionableDateKey;
    if (actionableDateKey) {
      setFocusedDateKey(actionableDateKey);
      setIsSessionPickerVisible(false);
    }
  }, [programTimelineView.actionableDateKey]);

  // Puerta de entrada al inicio de una sesión: si no es el frente de cola,
  // avisa y redirige al pendiente en vez de iniciarla.
  const attemptOpenSession = useCallback(
    async (session: MicrocycleSessionProgress) => {
      const actionableSession = programTimelineView.actionableSession;
      if (!isSessionActionable(session as ProgramTimelineSession, actionableSession)) {
        const actionableDateKey = programTimelineView.actionableDateKey;
        toast.info(
          'Termina primero tu entrenamiento pendiente',
          actionableDateKey
            ? `Completa tu sesión del ${formatLocalDate(actionableDateKey, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}`
            : undefined,
        );
        handleGoToActionable();
        return;
      }
      await openWorkoutSession(session);
    },
    [
      handleGoToActionable,
      openWorkoutSession,
      programTimelineView.actionableDateKey,
      programTimelineView.actionableSession,
    ],
  );

  const handleShiftWeek = useCallback(
    (direction: -1 | 1) => {
      const nextDateKey = shiftProgramTimelineFocusByWeek(
        programTimelineModel,
        programTimelineView.effectiveFocusedDateKey,
        direction,
      );

      if (nextDateKey) {
        setFocusedDateKey(nextDateKey);
        setIsSessionPickerVisible(false);
      }
    },
    [programTimelineModel, programTimelineView.effectiveFocusedDateKey],
  );

  const handleStartHighlightedSession = useCallback(async () => {
    if (programTimelineView.cardState.kind !== 'session') {
      return;
    }

    await attemptOpenSession(programTimelineView.cardState.session);
  }, [attemptOpenSession, programTimelineView.cardState]);

  const handleOpenSessions = useCallback(() => {
    if ((programTimelineView.focusedDay?.sessions.length ?? 0) > 1) {
      setIsSessionPickerVisible(true);
    }
  }, [programTimelineView.focusedDay?.sessions.length]);

  const handleOpenDatePicker = useCallback(() => {
    if (!canOpenDatePicker) {
      return;
    }

    setIsDatePickerVisible(true);
  }, [canOpenDatePicker]);

  const handleCloseDatePicker = useCallback(() => {
    setIsDatePickerVisible(false);
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    const nextDateKey = toLocalDateKey(date);

    if (!nextDateKey) {
      return;
    }

    setFocusedDateKey(nextDateKey);
    setIsDatePickerVisible(false);
    setIsSessionPickerVisible(false);
  }, []);

  const sessionPickerTitle = useMemo(() => {
    if (!programTimelineView.focusedDay) {
      return 'Sesiones del día';
    }

    return formatLocalDate(programTimelineView.focusedDay.dateKey, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }, [programTimelineView.focusedDay]);

  const tipContext = useMemo<TipContext>(
    () => ({
      nextSession: programTimelineView.highlightedTrainingDay,
      microcycleProgress,
      muscleVolume,
      allCompleted: programTimelineView.allCompleted,
      workoutPosition: programTimelineView.workoutPosition,
      workoutTotal: programTimelineView.workoutTotal,
      currentHour: new Date().getHours(),
    }),
    [
      programTimelineView.highlightedTrainingDay,
      microcycleProgress,
      muscleVolume,
      programTimelineView.allCompleted,
      programTimelineView.workoutPosition,
      programTimelineView.workoutTotal,
    ],
  );
  const nutritionContextOverride = useMemo(
    () => (
      currentWeekDietCaloriesAverage === null
        ? null
        : `Tu promedio semanal: ${currentWeekDietCaloriesAverage} kcal/dia`
    ),
    [currentWeekDietCaloriesAverage],
  );
  const homeCareTeamSummaries = useMemo(() => {
    return {
      training: formatHomeCareTeamSummary(
        careTeamSummaries.training,
        'training',
      ),
      nutrition: formatHomeCareTeamSummary(
        careTeamSummaries.nutrition,
        'nutrition',
        nutritionContextOverride,
      ),
    };
  }, [careTeamSummaries, nutritionContextOverride]);
  const handleOpenScienceTip = useCallback((tip: ScienceTip) => {
    router.push({
      pathname: '/recommendations/[tipId]',
      params: { tipId: tip.id },
    });
  }, []);
  const handleOpenMeasurements = useCallback(() => {
    router.push('/(tabs)/measurements');
  }, []);
  const handleOpenProfile = useCallback(() => {
    router.push('/profile');
  }, []);
  const handleOpenProfessionals = useCallback(() => {
    router.push('/professionals');
  }, []);
  const handleOpenSplit = useCallback(() => {
    router.push('/workouts/split');
  }, []);
  const handleOpenChat = useCallback(() => {
    router.push('/(tabs)/chat');
  }, []);
  const handleViewPlan = useCallback((domains: AssignedProfessionalDomain[]) => {
    router.push(domains.includes('training') ? '/(tabs)/workouts' : '/(tabs)/diet');
  }, []);
  const handleOpenHealth = useCallback(() => {
    if (healthNeedsPermission || !healthFeedback.hasRealData) {
      router.push('/profile/connected-health' as never);
      return;
    }
    router.push({
      pathname: '/(tabs)/measurements',
      params: { initialTab: 'health' },
    } as never);
  }, [healthFeedback.hasRealData, healthNeedsPermission]);

  const stepsSummary = useMemo(
    () => summarizeSteps(dailyActivity.days, getTodayDateKey()),
    [dailyActivity.days],
  );
  const adherenceSummary = useMemo(
    () => summarizeAdherence(buildWeeklyAdherence(programTimelineModel.orderedPlannedSessions, getTodayDateKey())),
    [programTimelineModel],
  );
  const sessionsNumbers = useMemo<SessionsNumbers | null>(() => {
    const planned = microcycleProgress?.planned_metrics;
    if (!planned?.total_planned_sessions) {
      return null;
    }

    return {
      done: planned.completed_planned_sessions,
      total: planned.total_planned_sessions,
      nextPosition: planned.next_session_position ?? null,
      nextName: programTimelineView.actionableSession?.name ?? null,
      label: microcycleProgress?.microcycle_name ?? null,
    };
  }, [microcycleProgress, programTimelineView.actionableSession]);
  const readinessNumbers = useMemo<ReadinessNumbers>(() => {
    const base = {
      freshnessLabel: healthFeedback.freshnessLabel,
      isStale: healthFeedback.isStale,
      isSyncing: isHealthSyncing,
    };

    if (healthFeedback.hasRealData) {
      return {
        ...base,
        score: healthFeedback.readiness.score,
        status: healthFeedback.readiness.status,
        title: healthFeedback.readiness.title,
        message: healthFeedback.readiness.message,
      };
    }

    const stateCopy = getConnectedHealthStateCopy(healthConnectionState, healthFeedback.sourceLabel);
    return { ...base, score: null, status: 'unknown', title: stateCopy.title, message: stateCopy.compactMessage };
  }, [healthConnectionState, healthFeedback, isHealthSyncing]);
  const cardState = programTimelineView.cardState;
  const cardProgressLabel =
    cardState.kind === 'session'
      ? [`Sesión ${cardState.position} de ${cardState.total}`, microcycleProgress?.microcycle_name]
          .filter(Boolean)
          .join(' · ')
      : null;

  if (!user) {
    return null;
  }

  if (showInitialLoadingState) {
    return <LoadingSpinner fullScreen text="Cargando tu programa..." />;
  }

  return (
    <TabScreenWrapper>
      {/* The backdrop runs under the status bar; the scrim takes over once content scrolls there. */}
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: contentInsetBottom },
            isTablet ? styles.scrollContentTablet : null,
          ]}
          onScroll={handleScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              progressViewOffset={insets.top}
            />
          }
          scrollEventThrottle={scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        >
          <AuroraBackdrop width={width} height={520 + insets.top} palette="home" />
          <View style={[styles.contentColumn, { maxWidth: contentWidth }]}>
            <Animated.View entering={getEntryAnimation(0)}>
              <HomeHero
                user={user}
                sessionName={
                  programTimelineView.cardState.kind === 'session'
                    ? programTimelineView.cardState.trainingDay.name
                    : null
                }
                sessionIsToday={
                  programTimelineView.cardState.kind === 'session' &&
                  programTimelineView.cardState.dateKey === getTodayDateKey()
                }
                streakDays={homeStreakDays}
                steps={stepsSummary.today}
                readinessScore={healthFeedback.hasRealData ? healthFeedback.readiness.score : null}
                messages={unreadMessages}
                onMessagesPress={handleOpenChat}
                onProfilePress={handleOpenProfile}
                horizontalPadding={horizontalPadding}
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(80)}>
              <TodayWorkoutCard
                cardState={cardState}
                onStartPress={handleStartHighlightedSession}
                onGoToActionable={handleGoToActionable}
                onOpenSessions={handleOpenSessions}
                onOpenSplit={microcycleProgress?.microcycle_id ? handleOpenSplit : undefined}
                isLoading={isStartingWorkout || (isLoading && !refreshing)}
                muscleVolume={muscleVolume}
                isMuscleVolumeLoading={!shouldLoadDeferredContent || isLoadingVolume}
                progressLabel={cardProgressLabel}
                weekDays={navigatorDays}
                weekLabel={currentWeekLabel}
                canGoToPreviousWeek={programTimelineView.canGoToPreviousWeek}
                canGoToNextWeek={programTimelineView.canGoToNextWeek}
                showWeekButtons={isTablet}
                onShiftWeek={handleShiftWeek}
                onOpenDatePicker={canOpenDatePicker ? handleOpenDatePicker : undefined}
                mode={microcycleMode}
                onModeChange={setMicrocycleMode}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
              />
            </Animated.View>

            <TodayInNumbers
              sessions={sessionsNumbers}
              adherence={adherenceSummary}
              steps={stepsSummary}
              readiness={readinessNumbers}
              onReadinessPress={handleOpenHealth}
              contentWidth={contentWidth}
              horizontalPadding={horizontalPadding}
            />

            {user?.connectedHealthSetupStatus !== 'completed' ? (
              <Animated.View entering={getEntryAnimation(200)}>
                <ConnectedHealthSetupBanner horizontalPadding={horizontalPadding} />
              </Animated.View>
            ) : null}

            <Animated.View entering={getEntryAnimation(250)} style={styles.activitySection}>
              <ActivityGridCard
                days={dailyActivity.days}
                startKey={dailyActivity.startKey}
                hasLoaded={dailyActivity.hasLoaded}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
                weeks={ACTIVITY_WEEKS}
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(400)}>
              <CareTeamSection
                title="Tu equipo"
                summaries={homeCareTeamSummaries}
                errors={careTeamErrors}
                isLoading={isLoadingCareTeam}
                compact
                variant="summary"
                emptyPresentation="combined-summary"
                horizontalPadding={horizontalPadding}
                actionLabel="Buscar"
                actionAccessibilityLabel="Buscar profesionales"
                onActionPress={handleOpenProfessionals}
                onMessagePress={handleOpenChat}
                onViewPlanPress={handleViewPlan}
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(460)}>
              <ScienceTips
                context={tipContext}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
                onTipPress={handleOpenScienceTip}
              />
            </Animated.View>

            {shouldLoadDeferredContent ? (
              <Animated.View entering={getEntryAnimation(520)}>
                <MetricsSummary
                  onPress={handleOpenMeasurements}
                  contentWidth={contentWidth}
                  horizontalPadding={horizontalPadding}
                />
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>
        <AuroraTopScrim height={insets.top} visible={isScrolled} />

        <SessionPickerModal
          visible={isSessionPickerVisible}
          title={sessionPickerTitle}
          subtitle={
            programTimelineView.focusedDay
              ? `${programTimelineView.focusedDay.sessions.length} sesión${programTimelineView.focusedDay.sessions.length > 1 ? 'es' : ''} disponible${programTimelineView.focusedDay.sessions.length > 1 ? 's' : ''}`
              : null
          }
          sessions={programTimelineView.focusedDay?.sessions ?? []}
          onClose={() => {
            setIsSessionPickerVisible(false);
          }}
          onSelectSession={async (session) => {
            setIsSessionPickerVisible(false);
            await attemptOpenSession(session);
          }}
        />

        <CalendarDatePickerModal
          visible={isDatePickerVisible}
          title="Ir a fecha"
          subtitle="Revisa cualquier semana de tu programa sin recorrer toda la vista."
          selectedDate={programTimelineView.effectiveFocusedDateKey ?? programTimelineModel.initialFocusedDateKey}
          minDate={programTimelineModel.calendarStartDateKey}
          maxDate={programTimelineModel.calendarEndDateKey}
          onClose={handleCloseDatePicker}
          onSelect={handleSelectDate}
        />
      </View>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    scrollContentTablet: {
      paddingBottom: spacing.xl,
    },
    contentColumn: {
      width: '100%',
      alignSelf: 'center',
    },
    activitySection: {
      marginVertical: spacing.sm,
    },
  });
