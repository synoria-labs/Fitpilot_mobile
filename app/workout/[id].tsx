import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LoadingSpinner } from '../../src/components/common';
import { CardioTimerModal, ExerciseCard, MovementTimerModal, PhaseSeparator, RestTimer, WorkoutToast } from '../../src/components/workout';
import { borderRadius, colors, fontSize, spacing } from '../../src/constants/colors';
import { useWorkoutExecutionController } from '../../src/hooks/useWorkoutExecutionController';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import type { DayExercise, ExercisePhase, ExerciseProgress } from '../../src/types';
import { getCardioEffectiveSets } from '../../src/utils/formatters';
import { formatLocalShortWeekday, getLocalDayNumber } from '../../src/utils/date';
import { getDayExerciseByProgress, getExerciseTargetSetNumber } from '../../src/utils/workoutSession';

type ListItem =
  | { type: 'separator'; data: { phase: ExercisePhase } }
  | {
      type: 'exercise';
      data: {
        exercise: DayExercise;
        progress: ExerciseProgress;
        originalIndex: number;
        indexInPhase: number;
        totalInPhase: number;
      };
    };

type ExerciseCardLayout = {
  y: number;
  height: number;
};

const PHASE_ORDER: Record<ExercisePhase, number> = { warmup: 0, main: 1, cooldown: 2 };

const areExerciseIdListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export default function WorkoutSessionScreen() {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id: workoutLogId } = useLocalSearchParams<{ id: string }>();
  const {
    currentWorkout,
    isLoading,
    isSavingSet,
    error,
    loadWorkoutState,
    reopenWorkout,
    saveSet,
    saveCardioBlock,
    saveMovementBlock,
    deleteSetGroup,
    deleteCardioBlock,
    deleteMovementBlock,
    closeWorkout,
    abandonWorkout,
    clearError,
  } = useWorkoutStore();

  const workoutTrainingDay = currentWorkout?.training_day ?? null;
  const [collapsedPhases, setCollapsedPhases] = useState<Set<ExercisePhase>>(new Set());
  const [cardLayouts, setCardLayouts] = useState<Record<string, ExerciseCardLayout>>({});
  const [visibleExerciseIds, setVisibleExerciseIds] = useState<string[]>([]);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollOffsetY, setScrollOffsetY] = useState(0);
  const [autoplayExerciseId, setAutoplayExerciseId] = useState<string | null>(null);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 45 });

  const controller = useWorkoutExecutionController({
    workoutState: currentWorkout,
    isSavingSet,
    saveStrengthSet: saveSet,
    saveCardioBlock,
    saveMovementBlock,
    deleteStrengthSet: deleteSetGroup,
    deleteCardioBlock,
    deleteMovementBlock,
  });

  const {
    currentExerciseIndex,
    currentSetNumber,
    screenMode,
    isReviewMode,
    isLiveMode,
    isHistoricalEditMode,
    restTimerState,
    cardioTimerState,
    movementTimerState,
    toastState,
    executionInProgress,
    resolveExecution,
    actions,
  } = controller;

  useEffect(() => {
    setCollapsedPhases(new Set());
    setCardLayouts({});
    setVisibleExerciseIds([]);
    setViewportHeight(0);
    setScrollOffsetY(0);
    setAutoplayExerciseId(null);

    if (workoutLogId) {
      void loadWorkoutState(workoutLogId);
    }
  }, [loadWorkoutState, workoutLogId]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [clearError, error]);

  const navigateToOrigin = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)');
  }, []);

  const togglePhaseCollapse = useCallback((phase: ExercisePhase) => {
    setCollapsedPhases((previous) => {
      const next = new Set(previous);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, []);

  const groupedExercises = useMemo((): ListItem[] => {
    if (!currentWorkout || !workoutTrainingDay) {
      return [];
    }

    const exerciseWithProgress = currentWorkout.exercises_progress
      .map((progress, originalIndex) => {
        const exercise = getDayExerciseByProgress(workoutTrainingDay, progress);
        return exercise ? { exercise, progress, originalIndex } : null;
      })
      .filter((item): item is { exercise: DayExercise; progress: ExerciseProgress; originalIndex: number } => item !== null)
      .sort((left, right) => {
        const phaseCompare = PHASE_ORDER[left.exercise.phase] - PHASE_ORDER[right.exercise.phase];
        if (phaseCompare !== 0) {
          return phaseCompare;
        }

        return left.exercise.order_index - right.exercise.order_index;
      });

    const phaseCounts: Record<ExercisePhase, number> = { warmup: 0, main: 0, cooldown: 0 };
    exerciseWithProgress.forEach((item) => {
      phaseCounts[item.exercise.phase] += 1;
    });

    const phaseCounters: Record<ExercisePhase, number> = { warmup: 0, main: 0, cooldown: 0 };
    const result: ListItem[] = [];
    let currentPhase: ExercisePhase | null = null;

    exerciseWithProgress.forEach((item) => {
      if (item.exercise.phase !== currentPhase) {
        currentPhase = item.exercise.phase;
        result.push({ type: 'separator', data: { phase: currentPhase } });
      }

      phaseCounters[item.exercise.phase] += 1;
      result.push({
        type: 'exercise',
        data: {
          ...item,
          indexInPhase: phaseCounters[item.exercise.phase],
          totalInPhase: phaseCounts[item.exercise.phase],
        },
      });
    });

    return result;
  }, [currentWorkout, workoutTrainingDay]);

  const recalculateAutoplayExercise = useCallback((
    nextVisibleExerciseIds: string[] = visibleExerciseIds,
    nextCardLayouts: Record<string, ExerciseCardLayout> = cardLayouts,
    nextViewportHeight: number = viewportHeight,
    nextScrollOffsetY: number = scrollOffsetY,
  ) => {
    if (!nextVisibleExerciseIds.length || nextViewportHeight <= 0) {
      setAutoplayExerciseId(null);
      return;
    }

    const viewportCenter = nextScrollOffsetY + nextViewportHeight / 2;
    let bestExerciseId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    nextVisibleExerciseIds.forEach((exerciseId) => {
      const layout = nextCardLayouts[exerciseId];
      if (!layout) {
        return;
      }

      const cardCenter = layout.y + layout.height / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestExerciseId = exerciseId;
      }
    });

    setAutoplayExerciseId((previous) => (previous === bestExerciseId ? previous : bestExerciseId));
  }, [cardLayouts, scrollOffsetY, viewportHeight, visibleExerciseIds]);

  useEffect(() => {
    recalculateAutoplayExercise();
  }, [recalculateAutoplayExercise]);

  useEffect(() => {
    const validExerciseIds = new Set(
      groupedExercises
        .filter((item): item is Extract<ListItem, { type: 'exercise' }> => item.type === 'exercise')
        .map((item) => item.data.exercise.id),
    );

    setVisibleExerciseIds((previous) => {
      const next = previous.filter((exerciseId) => validExerciseIds.has(exerciseId));
      return areExerciseIdListsEqual(previous, next) ? previous : next;
    });
    setAutoplayExerciseId((previous) => (previous && validExerciseIds.has(previous) ? previous : null));
    setCardLayouts((previous) => {
      const nextEntries = Object.entries(previous).filter(([exerciseId]) => validExerciseIds.has(exerciseId));
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [groupedExercises]);

  const handleExerciseCardLayout = useCallback((exerciseId: string, y: number, height: number) => {
    setCardLayouts((previous) => {
      const currentLayout = previous[exerciseId];
      if (currentLayout && currentLayout.y === y && currentLayout.height === height) {
        return previous;
      }

      return {
        ...previous,
        [exerciseId]: { y, height },
      };
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    setScrollOffsetY((previous) => (Math.abs(previous - nextOffset) < 1 ? previous : nextOffset));
  }, []);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setViewportHeight((previous) => (Math.abs(previous - nextHeight) < 1 ? previous : nextHeight));
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<ListItem>[] }) => {
    const nextVisibleExerciseIds = viewableItems.flatMap((viewableItem) =>
      viewableItem.item?.type === 'exercise' ? [viewableItem.item.data.exercise.id] : [],
    );

    setVisibleExerciseIds((previous) =>
      areExerciseIdListsEqual(previous, nextVisibleExerciseIds) ? previous : nextVisibleExerciseIds,
    );
  });

  const phaseCompletionStatus = useMemo(() => {
    const status: Record<ExercisePhase, boolean> = { warmup: true, main: true, cooldown: true };

    groupedExercises.forEach((item) => {
      if (item.type === 'exercise' && !item.data.progress.is_completed) {
        status[item.data.exercise.phase] = false;
      }
    });

    return status;
  }, [groupedExercises]);

  const currentExercisePhase = useMemo(() => {
    if (!currentWorkout || !workoutTrainingDay) {
      return null;
    }

    const currentExercise = currentWorkout.exercises_progress[currentExerciseIndex];
    const dayExercise = getDayExerciseByProgress(workoutTrainingDay, currentExercise);
    return dayExercise?.phase || null;
  }, [currentExerciseIndex, currentWorkout, workoutTrainingDay]);

  useEffect(() => {
    if (!groupedExercises.length) {
      return;
    }

    const nextCollapsed = new Set<ExercisePhase>();
    (Object.entries(phaseCompletionStatus) as [ExercisePhase, boolean][]).forEach(([phase, completed]) => {
      if (completed && phase !== currentExercisePhase) {
        nextCollapsed.add(phase);
      }
    });

    setCollapsedPhases(nextCollapsed);
  }, [currentExercisePhase, groupedExercises.length, phaseCompletionStatus]);

  const handleDeleteSet = useCallback((exerciseIndex: number, setNumber: number) => {
    if (!isHistoricalEditMode) {
      return;
    }

    const resolvedExecution = resolveExecution(exerciseIndex, setNumber);
    if (!resolvedExecution) {
      return;
    }

    const unitLabel = resolvedExecution.draft.kind === 'strength' ? 'serie' : 'bloque';
    Alert.alert(
      `Eliminar ${unitLabel}`,
      `Quieres eliminar ${unitLabel} ${setNumber}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void actions.deleteExecution(exerciseIndex, setNumber);
          },
        },
      ],
    );
  }, [actions, isHistoricalEditMode, resolveExecution]);

  const handleReopen = useCallback(async () => {
    if (!workoutLogId || !isReviewMode) {
      return;
    }

    await reopenWorkout(workoutLogId);
  }, [isReviewMode, reopenWorkout, workoutLogId]);

  const handleCloseHistoricalWorkout = useCallback(async () => {
    if (isSavingSet || isLoading || !isHistoricalEditMode) {
      return;
    }

    const didCloseWorkout = await closeWorkout();
    if (didCloseWorkout) {
      navigateToOrigin();
    }
  }, [closeWorkout, isHistoricalEditMode, isLoading, isSavingSet, navigateToOrigin]);

  const handleFinishLiveWorkout = useCallback(() => {
    Alert.alert('Finalizar entrenamiento', '¿Estás seguro de que quieres finalizar el entrenamiento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          const didCloseWorkout = await closeWorkout();
          if (didCloseWorkout) {
            navigateToOrigin();
          }
        },
      },
    ]);
  }, [closeWorkout, navigateToOrigin]);

  const handlePrimaryFooterAction = useCallback(() => {
    if (isReviewMode) {
      void handleReopen();
      return;
    }

    if (isHistoricalEditMode) {
      void handleCloseHistoricalWorkout();
      return;
    }

    handleFinishLiveWorkout();
  }, [handleCloseHistoricalWorkout, handleFinishLiveWorkout, handleReopen, isHistoricalEditMode, isReviewMode]);

  const handleGoBack = useCallback(() => {
    if (isReviewMode) {
      navigateToOrigin();
      return;
    }

    if (isHistoricalEditMode) {
      void handleCloseHistoricalWorkout();
      return;
    }

    Alert.alert('Salir del entrenamiento', '¿Quieres guardar tu progreso y salir, o abandonar el entrenamiento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar y salir', onPress: navigateToOrigin },
      {
        text: 'Abandonar',
        style: 'destructive',
        onPress: async () => {
          const didAbandonWorkout = await abandonWorkout();
          if (didAbandonWorkout) {
            navigateToOrigin();
          }
        },
      },
    ]);
  }, [abandonWorkout, handleCloseHistoricalWorkout, isHistoricalEditMode, isReviewMode, navigateToOrigin]);

  if (isLoading || !currentWorkout || !workoutTrainingDay) {
    return <LoadingSpinner fullScreen text="Cargando entrenamiento..." />;
  }

  const workoutDate = currentWorkout.workout_log.performed_on_date || workoutTrainingDay.date || new Date();
  const weekdayLabel = formatLocalShortWeekday(workoutDate);
  const dayNumberLabel = getLocalDayNumber(workoutDate);

  const modeBanner = isReviewMode
    ? {
        title: 'Ver registro',
        subtitle: 'Este entrenamiento está cerrado. Reábrelo solo si necesitas corregir series.',
        buttonLabel: 'Editar registro',
      }
    : isHistoricalEditMode
      ? {
          title: 'Edición histórica',
          subtitle: 'Los cambios se guardan en este log y se cerrará al salir.',
          buttonLabel: null,
        }
      : null;

  const footerConfig = isReviewMode
    ? { label: 'Editar registro', iconName: 'create-outline' as const, colors: ['#0f766e', '#34d399'] as const, iconColor: '#0f766e' }
    : isHistoricalEditMode
      ? { label: 'Guardar cambios y cerrar', iconName: 'checkmark-outline' as const, colors: ['#0f766e', '#34d399'] as const, iconColor: '#0f766e' }
      : { label: 'Finalizar entrenamiento', iconName: 'arrow-forward' as const, colors: ['#182f50', '#67b6df'] as const, iconColor: theme.isDark ? theme.colors.primary : '#182f50' };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={theme.isDark ? [theme.colors.surface, theme.colors.background] : [colors.white, colors.background]}
        style={styles.header}
      >
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.workoutTitle}>{currentWorkout.training_day_name}</Text>
          {currentWorkout.training_day_focus ? <Text style={styles.workoutFocus}>{currentWorkout.training_day_focus}</Text> : null}
        </View>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeDay}>{weekdayLabel}</Text>
          <Text style={styles.dateBadgeNumber}>{dayNumberLabel}</Text>
        </View>
      </LinearGradient>

      {modeBanner ? (
        <View style={styles.modeBanner}>
          <View style={styles.modeBannerCopy}>
            <Text style={styles.modeBannerTitle}>{modeBanner.title}</Text>
            <Text style={styles.modeBannerSubtitle}>{modeBanner.subtitle}</Text>
          </View>
          {modeBanner.buttonLabel ? (
            <TouchableOpacity style={styles.modeBannerButton} onPress={handleReopen}>
              <Text style={styles.modeBannerButtonText}>{modeBanner.buttonLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={groupedExercises}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={handleListLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfigRef.current}
        keyExtractor={(item) => item.type === 'separator' ? `separator-${item.data.phase}` : `exercise-${item.data.exercise.id}`}
        renderItem={({ item }) => {
          if (item.type === 'separator') {
            const phaseExercises = groupedExercises.filter((entry) => entry.type === 'exercise' && entry.data.exercise.phase === item.data.phase);
            const completedCount = phaseExercises.filter((entry) => entry.type === 'exercise' && entry.data.progress.is_completed).length;

            return (
              <PhaseSeparator
                phase={item.data.phase}
                isCollapsed={collapsedPhases.has(item.data.phase)}
                isCompleted={phaseCompletionStatus[item.data.phase]}
                onToggle={() => togglePhaseCollapse(item.data.phase)}
                completedCount={completedCount}
                totalCount={phaseExercises.length}
              />
            );
          }

          const { exercise, progress, originalIndex, indexInPhase, totalInPhase } = item.data;
          if (collapsedPhases.has(exercise.phase)) {
            return null;
          }

          const isActive = originalIndex === currentExerciseIndex;
          const displaySetNumber = isActive ? currentSetNumber : getExerciseTargetSetNumber(exercise, progress);
          const resolvedExecution = resolveExecution(originalIndex, displaySetNumber);
          if (!resolvedExecution) {
            return null;
          }

          return (
            <View onLayout={(event) => handleExerciseCardLayout(exercise.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}>
              {resolvedExecution.draft.kind === 'strength' ? (
                <ExerciseCard
                  kind="strength"
                  mode={screenMode}
                  dayExercise={exercise}
                  progress={progress}
                  draft={resolvedExecution.draft}
                  currentSetNumber={displaySetNumber}
                  isActive={isActive}
                  exerciseNumber={indexInPhase}
                  totalExercises={totalInPhase}
                  setInProgress={executionInProgress[resolvedExecution.keyString] || false}
                  isSavingSet={isSavingSet}
                  shouldAutoplayPreview={exercise.id === autoplayExerciseId}
                  onActivateExercise={isReviewMode ? undefined : () => actions.activateExercise(originalIndex)}
                  onStrengthMetricChange={(segmentIndex, field, delta) => actions.changeStrengthMetric(originalIndex, segmentIndex, field, delta)}
                  onStrengthMetricCommit={(segmentIndex, field, value) => actions.commitStrengthMetric(originalIndex, segmentIndex, field, value)}
                  onAddSegment={() => actions.addStrengthSegment(originalIndex)}
                  onRemoveSegment={(segmentIndex) => actions.removeStrengthSegment(originalIndex, segmentIndex)}
                  onAdvanceSet={isLiveMode ? () => void actions.advanceLiveExecution(originalIndex, displaySetNumber, exercise.sets) : undefined}
                  onSaveSet={isHistoricalEditMode ? () => void actions.saveHistoricalExecution(originalIndex, displaySetNumber) : undefined}
                  onSelectSet={isReviewMode ? undefined : (setNumber) => actions.selectSet(originalIndex, setNumber)}
                  onDeleteSet={isHistoricalEditMode ? (setNumber) => handleDeleteSet(originalIndex, setNumber) : undefined}
                />
              ) : resolvedExecution.draft.kind === 'cardio' ? (
                <ExerciseCard
                  kind="cardio"
                  mode={screenMode}
                  dayExercise={exercise}
                  progress={progress}
                  draft={resolvedExecution.draft}
                  currentSetNumber={displaySetNumber}
                  isActive={isActive}
                  exerciseNumber={indexInPhase}
                  totalExercises={totalInPhase}
                  setInProgress={executionInProgress[resolvedExecution.keyString] || false}
                  isSavingSet={isSavingSet}
                  shouldAutoplayPreview={exercise.id === autoplayExerciseId}
                  onActivateExercise={isReviewMode ? undefined : () => actions.activateExercise(originalIndex)}
                  onCardioMetricChange={(field, delta) => actions.changeCardioMetric(originalIndex, field, delta)}
                  onCardioMetricCommit={(field, value) => actions.commitCardioMetric(originalIndex, field, value)}
                  onAdvanceSet={isLiveMode ? () => void actions.advanceLiveExecution(originalIndex, displaySetNumber, getCardioEffectiveSets(exercise)) : undefined}
                  onSaveSet={isHistoricalEditMode ? () => void actions.saveHistoricalExecution(originalIndex, displaySetNumber) : undefined}
                  onSelectSet={isReviewMode ? undefined : (setNumber) => actions.selectSet(originalIndex, setNumber)}
                  onDeleteSet={isHistoricalEditMode ? (setNumber) => handleDeleteSet(originalIndex, setNumber) : undefined}
                />
              ) : (
                <ExerciseCard
                  kind="movement"
                  mode={screenMode}
                  dayExercise={exercise}
                  progress={progress}
                  draft={resolvedExecution.draft}
                  currentSetNumber={displaySetNumber}
                  isActive={isActive}
                  exerciseNumber={indexInPhase}
                  totalExercises={totalInPhase}
                  setInProgress={executionInProgress[resolvedExecution.keyString] || false}
                  isSavingSet={isSavingSet}
                  shouldAutoplayPreview={exercise.id === autoplayExerciseId}
                  onActivateExercise={isReviewMode ? undefined : () => actions.activateExercise(originalIndex)}
                  onMovementMetricChange={(field, delta) => actions.changeMovementMetric(originalIndex, field, delta)}
                  onMovementMetricCommit={(field, value) => actions.commitMovementMetric(originalIndex, field, value)}
                  onAdvanceSet={isLiveMode ? () => void actions.advanceLiveExecution(originalIndex, displaySetNumber, exercise.sets) : undefined}
                  onSaveSet={isHistoricalEditMode ? () => void actions.saveHistoricalExecution(originalIndex, displaySetNumber) : undefined}
                  onSelectSet={isReviewMode ? undefined : (setNumber) => actions.selectSet(originalIndex, setNumber)}
                  onDeleteSet={isHistoricalEditMode ? (setNumber) => handleDeleteSet(originalIndex, setNumber) : undefined}
                />
              )}
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.finishButtonWrapper} onPress={handlePrimaryFooterAction} activeOpacity={0.82}>
          <LinearGradient colors={footerConfig.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.finishButton}>
            <Text style={styles.finishButtonTextActive}>{footerConfig.label}</Text>
            <View style={styles.finishArrowActive}>
              <Ionicons name={footerConfig.iconName} size={16} color={footerConfig.iconColor} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <RestTimer
        visible={restTimerState.visible}
        initialSeconds={restTimerState.initialSeconds}
        onComplete={actions.dismissRestTimer}
        onSkip={actions.dismissRestTimer}
      />

      <CardioTimerModal
        visible={cardioTimerState.visible}
        exerciseName={cardioTimerState.exerciseName}
        plannedDurationSeconds={cardioTimerState.plannedDurationSeconds}
        remainingSeconds={cardioTimerState.remainingSeconds}
        elapsedSeconds={cardioTimerState.elapsedSeconds}
        isComplete={cardioTimerState.isComplete}
        onFinish={() => void actions.finishCardioExecutionFromTimer()}
      />

      <MovementTimerModal
        visible={movementTimerState.visible}
        kind={movementTimerState.kind}
        exerciseName={movementTimerState.exerciseName}
        plannedDurationSeconds={movementTimerState.plannedDurationSeconds}
        remainingSeconds={movementTimerState.remainingSeconds}
        elapsedSeconds={movementTimerState.elapsedSeconds}
        isComplete={movementTimerState.isComplete}
        onFinish={() => void actions.finishMovementExecutionFromTimer()}
      />

      <WorkoutToast visible={toastState.visible} config={toastState.config} onHide={actions.hideToast} />
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backButton: { padding: spacing.sm },
  headerCenter: { flex: 1, marginLeft: spacing.sm },
  workoutTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: theme.colors.textPrimary },
  workoutFocus: { fontSize: fontSize.sm, color: theme.colors.textMuted },
  dateBadge: { backgroundColor: colors.primary[500], borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', transform: [{ rotate: '-5deg' }] },
  dateBadgeDay: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  dateBadgeNumber: { fontSize: fontSize.xl, color: colors.white, fontWeight: '700' },
  modeBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: borderRadius.xl, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeBannerCopy: { flex: 1 },
  modeBannerTitle: { fontSize: fontSize.base, fontWeight: '700', color: theme.colors.textPrimary },
  modeBannerSubtitle: { marginTop: spacing.xs, fontSize: fontSize.sm, color: theme.colors.textMuted },
  modeBannerButton: { borderRadius: borderRadius.full, backgroundColor: '#0f766e', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modeBannerButtonText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: theme.colors.background },
  finishButtonWrapper: { shadowColor: '#182f50', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5 },
  finishButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.full, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  finishButtonTextActive: { fontSize: fontSize.base, fontWeight: '700', color: colors.white, marginRight: spacing.sm, letterSpacing: 0.4 },
  finishArrowActive: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.isDark ? theme.colors.surface : colors.white, alignItems: 'center', justifyContent: 'center' },
});
