import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '../../src/store/authStore';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { LoadingSpinner, TabScreenWrapper } from '../../src/components/common';
import {
  CalendarDatePickerModal,
  HistoricalNavigator,
  type SharedWeeklyCalendarDay,
} from '../../src/components/calendar';
import {
  ActivityChart,
  MetricsSummary,
  MicrocycleStats,
  ScienceTips,
  SessionPickerModal,
  TodayWorkoutCard,
  UserHeader,
} from '../../src/components/dashboard';
import {
  ConnectedHealthFeedbackSummaryCard,
  ConnectedHealthSetupBanner,
} from '../../src/components/connected-health';
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
import { formatLocalDate, toLocalDateKey } from '../../src/utils/date';
import {
  getDashboardContentWidth,
  getPrimaryScreenHorizontalPadding,
  isTabletLayout,
} from '../../src/utils/layout';
import {
  buildProgramTimelineModel,
  buildProgramTimelineView,
  getProgramTimelineCalendarDayLabel,
  getProgramTimelineWeekLabel,
  shiftProgramTimelineFocusByWeek,
} from '../../src/utils/programTimeline';

const stripExistingClientContextPrefix = (value: string) =>
  value
    .trim()
    .replace(/^tu\s+(plan|promedio semanal|nutricion):\s*/i, '')
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
    : 'Tu nutricion';
};

const formatClientContextLabel = (
  contextLabel: string | null,
  domain: AssignedProfessionalDomain,
) => {
  const trimmedContext = contextLabel?.trim();

  if (!trimmedContext) {
    return null;
  }

  if (/^tu\s+(plan|promedio semanal|nutricion):/i.test(trimmedContext)) {
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

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTablet = isTabletLayout(width, height);
  const contentWidth = getDashboardContentWidth(width);
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const calendarContentWidth = Math.max(0, contentWidth - horizontalPadding * 2);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const tabBarScroll = useBottomTabBarScroll();
  const contentInsetBottom = useBottomTabBarContentInset();
  const isFocused = useIsFocused();
  const { user } = useAuthStore();
  const {
    summaries: careTeamSummaries,
    errors: careTeamErrors,
    isLoading: isLoadingCareTeam,
    refreshCareTeam,
  } = useCareTeam(user?.id ?? null);
  const {
    dashboardBootstrap,
    dashboardDataVersion,
    workoutLogsVersion,
    isLoading,
    isStartingWorkout,
    error,
    loadDashboardData,
    startWorkout,
    clearError,
  } = useWorkoutStore();

  const [refreshing, setRefreshing] = useState(false);
  const [currentWeekDietCaloriesAverage, setCurrentWeekDietCaloriesAverage] = useState<number | null>(null);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeResponse | null>(null);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const [countSecondaryMuscles, setCountSecondaryMuscles] = useState(true);
  const [microcycleMode, setMicrocycleMode] = useState<MicrocycleMode>('planned');
  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(null);
  const [isSessionPickerVisible, setIsSessionPickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [hasPlayedEntryAnimation, setHasPlayedEntryAnimation] = useState(false);
  const [shouldLoadDeferredContent, setShouldLoadDeferredContent] = useState(false);
  const lastLoadedWorkoutLogsVersionRef = useRef<number | null>(null);
  const program = dashboardBootstrap?.program ?? null;
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
  const focusedDateLabel = useMemo(
    () => (
      programTimelineView.effectiveFocusedDateKey
        ? formatLocalDate(programTimelineView.effectiveFocusedDateKey, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })
        : 'Semana visible'
    ),
    [programTimelineView.effectiveFocusedDateKey],
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
    setFocusedDateKey((currentDateKey) => (
      currentDateKey === programTimelineModel.initialFocusedDateKey
        ? currentDateKey
        : programTimelineModel.initialFocusedDateKey
    ));
    setIsSessionPickerVisible(false);
    setIsDatePickerVisible(false);
  }, [dashboardDataVersion, programTimelineModel.initialFocusedDateKey]);

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
          countSecondaryMuscles,
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
    countSecondaryMuscles,
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
    ]);
    lastLoadedWorkoutLogsVersionRef.current = workoutLogsVersion;
    setRefreshing(false);
  }, [
    loadCurrentWeekDietCaloriesAverage,
    loadDashboardData,
    refreshCareTeam,
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

    await openWorkoutSession(programTimelineView.cardState.session);
  }, [openWorkoutSession, programTimelineView.cardState]);

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
      return 'Sesiones del dia';
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

  if (!user) {
    return null;
  }

  if (showInitialLoadingState) {
    return <LoadingSpinner fullScreen text="Cargando tu programa..." />;
  }

  return (
    <TabScreenWrapper>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: contentInsetBottom },
            isTablet ? styles.scrollContentTablet : null,
          ]}
          onScroll={tabBarScroll.onScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          scrollEventThrottle={tabBarScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.contentColumn, { maxWidth: contentWidth }]}>
            <Animated.View entering={getEntryAnimation(0)}>
              <UserHeader
                user={user}
                program={program}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(80)}>
              <View style={{ paddingHorizontal: horizontalPadding }}>
                <HistoricalNavigator
                  eyebrow="Entrenamiento"
                  title={microcycleProgress?.microcycle_name || program?.name || 'Programa activo'}
                  subtitle={focusedDateLabel}
                  weekLabel={currentWeekLabel}
                  days={navigatorDays}
                  contentWidth={calendarContentWidth}
                  canGoToPreviousWeek={programTimelineView.canGoToPreviousWeek}
                  canGoToNextWeek={programTimelineView.canGoToNextWeek}
                  showWeekButtons={isTablet}
                  onShiftWeek={handleShiftWeek}
                  onOpenDatePicker={canOpenDatePicker ? handleOpenDatePicker : undefined}
                />
              </View>
            </Animated.View>

            <Animated.View entering={getEntryAnimation(160)}>
              <TodayWorkoutCard
                cardState={programTimelineView.cardState}
                onStartPress={handleStartHighlightedSession}
                onOpenSessions={handleOpenSessions}
                isLoading={isStartingWorkout || (isLoading && !refreshing)}
                muscleVolume={muscleVolume}
                isMuscleVolumeLoading={!shouldLoadDeferredContent || isLoadingVolume}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
                compact={!isTablet}
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(220)}>
              <MicrocycleStats
                microcycleProgress={microcycleProgress}
                actualAdherenceMetrics={programTimelineModel.actualAdherenceMetrics}
                mode={microcycleMode}
                onModeChange={setMicrocycleMode}
                isLoading={isLoading && !refreshing}
                horizontalPadding={horizontalPadding}
                variant="strip"
              />
            </Animated.View>

            {user?.connectedHealthSetupStatus !== 'completed' ? (
              <Animated.View entering={getEntryAnimation(280)}>
                <ConnectedHealthSetupBanner horizontalPadding={horizontalPadding} />
              </Animated.View>
            ) : null}

            <Animated.View entering={getEntryAnimation(280)}>
              <ConnectedHealthFeedbackSummaryCard
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
                variant="compact"
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(340)}>
              <ActivityChart
                muscleVolume={muscleVolume}
                isLoading={!shouldLoadDeferredContent || isLoadingVolume || (isLoading && !refreshing)}
                countSecondaryMuscles={countSecondaryMuscles}
                onToggleSecondary={setCountSecondaryMuscles}
                contentWidth={contentWidth}
                horizontalPadding={horizontalPadding}
                maxRows={2}
                collapsible
                compact
              />
            </Animated.View>

            <Animated.View entering={getEntryAnimation(400)}>
              <CareTeamSection
                summaries={homeCareTeamSummaries}
                errors={careTeamErrors}
                isLoading={isLoadingCareTeam}
                compact
                variant="summary"
                emptyPresentation="combined-summary"
                horizontalPadding={horizontalPadding}
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

        <SessionPickerModal
          visible={isSessionPickerVisible}
          title={sessionPickerTitle}
          subtitle={
            programTimelineView.focusedDay
              ? `${programTimelineView.focusedDay.sessions.length} sesion${programTimelineView.focusedDay.sessions.length > 1 ? 'es' : ''} disponible${programTimelineView.focusedDay.sessions.length > 1 ? 's' : ''}`
              : null
          }
          sessions={programTimelineView.focusedDay?.sessions ?? []}
          onClose={() => {
            setIsSessionPickerVisible(false);
          }}
          onSelectSession={async (session) => {
            setIsSessionPickerVisible(false);
            await openWorkoutSession(session);
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
      </SafeAreaView>
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
  });
