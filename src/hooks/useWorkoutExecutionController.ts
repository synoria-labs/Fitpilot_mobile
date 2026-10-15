import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { ToastConfig } from '../components/workout';
import type {
  CurrentWorkoutState,
  DayExercise,
  ExerciseProgress,
  WorkoutScreenMode,
  WorkoutStatus,
} from '../types';
import {
  isCardioExercise,
  isMovementExercise,
  isTimedMovementExercise,
  isTimedStrengthExercise,
  usesSteadyStateCardioTimer,
} from '../utils/formatters';
import {
  adjustWorkoutMetricValue,
  normalizeWorkoutMetricValue,
} from '../utils/workoutMetricInputs';
import {
  createNextSegmentDraft,
  createWorkoutExecutionDraft,
  findNextIncompleteExerciseIndex,
  getCardioBlockByNumber,
  getDayExerciseByProgress,
  getExecutionKeyString,
  getExerciseTargetSetNumber,
  hasCompletedCardioExecution,
  hasCompletedMovementExecution,
  getMovementBlockByNumber,
  getSetGroupByNumber,
  hydrateWorkoutExecutionDraft,
  isCardioExecutionDraft,
  isMovementExecutionDraft,
  isStrengthExecutionDraft,
  normalizeWorkoutSetDraft,
  toWorkoutCardioBlockInput,
  toWorkoutMovementBlockInput,
  toWorkoutSetSegmentInputs,
  validateWorkoutSetDraft,
  type CardioExecutionDraft,
  type MovementExecutionDraft,
  type StrengthExecutionDraft,
  type WorkoutExecutionDraft,
  type WorkoutExecutionDraftOptions,
} from '../utils/workoutSession';
import type { WorkoutMutationResult } from '../store/workoutStore';
import { hapticError, hapticSuccess } from '../utils/haptics';

type StrengthMetricField = 'reps' | 'seconds' | 'weight' | 'effort';
type CardioMetricField = 'duration' | 'calories' | 'distance' | 'effort';
type MovementMetricField = 'duration' | 'contacts' | 'height_cm' | 'distance_cm';

type ExerciseContext = {
  exerciseIndex: number;
  exercise: DayExercise;
  progress: ExerciseProgress;
};

type ResolvedExecution = {
  context: ExerciseContext;
  draft: WorkoutExecutionDraft;
  keyString: string;
};

type WorkoutModeCapabilities = {
  canStart: boolean;
  canSave: boolean;
  canDelete: boolean;
  canEditCompleted: boolean;
};

type CardioTimerState = {
  visible: boolean;
  keyString: string | null;
  exerciseIndex: number | null;
  setNumber: number | null;
  exerciseName: string;
  plannedDurationSeconds: number;
  startedAtMs: number | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  isComplete: boolean;
};

type MovementTimerState = {
  visible: boolean;
  /** 'hold' times a strength set prescribed in seconds (plank); 'movement' a mobility block. */
  kind: 'movement' | 'hold';
  keyString: string | null;
  exerciseIndex: number | null;
  setNumber: number | null;
  exerciseName: string;
  plannedDurationSeconds: number;
  startedAtMs: number | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  isComplete: boolean;
};

type UseWorkoutExecutionControllerParams = {
  workoutState: CurrentWorkoutState | null;
  isSavingSet: boolean;
  saveStrengthSet: (data: {
    dayExerciseId: string;
    setNumber: number;
    segments: ReturnType<typeof toWorkoutSetSegmentInputs>;
  }) => Promise<WorkoutMutationResult>;
  saveCardioBlock: (data: ReturnType<typeof toWorkoutCardioBlockInput>) => Promise<WorkoutMutationResult>;
  saveMovementBlock: (data: ReturnType<typeof toWorkoutMovementBlockInput>) => Promise<WorkoutMutationResult>;
  deleteStrengthSet: (dayExerciseId: string, setNumber: number) => Promise<WorkoutMutationResult>;
  deleteCardioBlock: (cardioLogId: string) => Promise<WorkoutMutationResult>;
  deleteMovementBlock: (movementLogId: string) => Promise<WorkoutMutationResult>;
};

type ExecutionDraftTarget = {
  dayExerciseId?: string;
  exerciseIndex?: number;
  setNumber?: number;
};

const getWorkoutScreenMode = (
  status: WorkoutStatus | undefined,
  openedFromStatus: WorkoutStatus | null,
): WorkoutScreenMode => {
  if (status !== 'in_progress') {
    return 'review';
  }

  return openedFromStatus && openedFromStatus !== 'in_progress' ? 'historicalEdit' : 'live';
};

const getCardioMetricValue = (draft: CardioExecutionDraft, field: CardioMetricField) => {
  switch (field) {
    case 'duration':
      return draft.durationSeconds / 60;
    case 'calories':
      return draft.caloriesBurned;
    case 'distance':
      return draft.distanceMeters;
    case 'effort':
      return draft.effortValue;
    default:
      return null;
  }
};

const applyCardioMetricValue = (
  draft: CardioExecutionDraft,
  field: CardioMetricField,
  value: number | null,
): CardioExecutionDraft => {
  switch (field) {
    case 'duration':
      return {
        ...draft,
        durationSeconds: Math.max(1, Math.round((value ?? 0.1) * 60)),
      };
    case 'calories':
      return {
        ...draft,
        caloriesBurned: value,
      };
    case 'distance':
      return {
        ...draft,
        distanceMeters: value,
      };
    case 'effort':
      return {
        ...draft,
        effortValue: value,
      };
    default:
      return draft;
  }
};

const getMovementMetricValue = (draft: MovementExecutionDraft, field: MovementMetricField) => {
  switch (field) {
    case 'duration':
      return draft.durationSeconds != null ? draft.durationSeconds / 60 : null;
    case 'contacts':
      return draft.contactsCompleted;
    case 'height_cm':
      return draft.heightCm;
    case 'distance_cm':
      return draft.distanceCm;
    default:
      return null;
  }
};

const applyMovementMetricValue = (
  draft: MovementExecutionDraft,
  field: MovementMetricField,
  value: number | null,
): MovementExecutionDraft => {
  switch (field) {
    case 'duration':
      return {
        ...draft,
        durationSeconds: value != null ? Math.max(1, Math.round(value * 60)) : null,
      };
    case 'contacts':
      return {
        ...draft,
        contactsCompleted: value,
      };
    case 'height_cm':
      return {
        ...draft,
        heightCm: value,
      };
    case 'distance_cm':
      return {
        ...draft,
        distanceCm: value,
      };
    default:
      return draft;
  }
};

const HIDDEN_CARDIO_TIMER_STATE: CardioTimerState = {
  visible: false,
  keyString: null,
  exerciseIndex: null,
  setNumber: null,
  exerciseName: '',
  plannedDurationSeconds: 0,
  startedAtMs: null,
  remainingSeconds: 0,
  elapsedSeconds: 0,
  isComplete: false,
};

const HIDDEN_MOVEMENT_TIMER_STATE: MovementTimerState = {
  visible: false,
  kind: 'movement',
  keyString: null,
  exerciseIndex: null,
  setNumber: null,
  exerciseName: '',
  plannedDurationSeconds: 0,
  startedAtMs: null,
  remainingSeconds: 0,
  elapsedSeconds: 0,
  isComplete: false,
};

const getExerciseDisplayName = (exercise: DayExercise | undefined, fallbackName?: string) =>
  exercise?.exercise?.name_es || exercise?.exercise?.name_en || fallbackName || 'Ejercicio';

const getExecutionUnitLabel = (draft: WorkoutExecutionDraft) =>
  draft.kind === 'strength' ? 'Serie' : 'Bloque';

export const useWorkoutExecutionController = ({
  workoutState,
  isSavingSet,
  saveStrengthSet,
  saveCardioBlock,
  saveMovementBlock,
  deleteStrengthSet,
  deleteCardioBlock,
  deleteMovementBlock,
}: UseWorkoutExecutionControllerParams) => {
  const [openedFromStatus, setOpenedFromStatus] = useState<WorkoutStatus | null>(null);
  const [activeExecution, setActiveExecution] = useState<WorkoutExecutionDraft | null>(null);
  const [executionInProgress, setExecutionInProgress] = useState<Record<string, boolean>>({});
  const [toastVisible, setToastVisible] = useState(false);
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [restTimerVisible, setRestTimerVisible] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [cardioTimerState, setCardioTimerState] = useState<CardioTimerState>(HIDDEN_CARDIO_TIMER_STATE);
  const [movementTimerState, setMovementTimerState] = useState<MovementTimerState>(HIDDEN_MOVEMENT_TIMER_STATE);
  const loadedWorkoutIdRef = useRef<string | null>(null);

  const screenMode = useMemo(
    () => getWorkoutScreenMode(workoutState?.workout_log.status, openedFromStatus),
    [openedFromStatus, workoutState?.workout_log.status],
  );
  const isReviewMode = screenMode === 'review';
  const isLiveMode = screenMode === 'live';
  const isHistoricalEditMode = screenMode === 'historicalEdit';

  const capabilities = useMemo<WorkoutModeCapabilities>(
    () => ({
      canStart: isLiveMode,
      canSave: !isReviewMode,
      canDelete: isHistoricalEditMode,
      canEditCompleted: !isReviewMode,
    }),
    [isHistoricalEditMode, isLiveMode, isReviewMode],
  );

  const showToast = useCallback((config: ToastConfig) => {
    setToastVisible(false);
    setTimeout(() => {
      setToastConfig(config);
      setToastVisible(true);
    }, 50);
  }, []);

  const resetCardioTimer = useCallback(() => {
    setCardioTimerState(HIDDEN_CARDIO_TIMER_STATE);
  }, []);

  const resetMovementTimer = useCallback(() => {
    setMovementTimerState(HIDDEN_MOVEMENT_TIMER_STATE);
  }, []);

  const createExecutionDraft = useCallback(
    (
      nextWorkoutState: CurrentWorkoutState,
      target?: ExecutionDraftTarget,
      options?: WorkoutExecutionDraftOptions,
    ) => createWorkoutExecutionDraft(nextWorkoutState, target, options),
    [],
  );

  const hydrateExecutionDraft = useCallback(
    (
      nextWorkoutState: CurrentWorkoutState,
      draft: WorkoutExecutionDraft | null | undefined,
      options?: WorkoutExecutionDraftOptions,
    ) => hydrateWorkoutExecutionDraft(nextWorkoutState, draft, options),
    [],
  );

  useEffect(() => {
    if (!workoutState) {
      loadedWorkoutIdRef.current = null;
      setOpenedFromStatus(null);
      setActiveExecution(null);
      setExecutionInProgress({});
      setToastVisible(false);
      setToastConfig(null);
      setRestTimerVisible(false);
      resetCardioTimer();
      resetMovementTimer();
      return;
    }

    const isNewWorkout = loadedWorkoutIdRef.current !== workoutState.workout_log.id;
    if (isNewWorkout) {
      loadedWorkoutIdRef.current = workoutState.workout_log.id;
      setOpenedFromStatus(workoutState.workout_log.status);
      setExecutionInProgress({});
      setToastVisible(false);
      setToastConfig(null);
      setRestTimerVisible(false);
      resetCardioTimer();
      resetMovementTimer();
      setActiveExecution(createExecutionDraft(workoutState));
      return;
    }

    setActiveExecution((currentDraft) => hydrateExecutionDraft(workoutState, currentDraft));
  }, [createExecutionDraft, hydrateExecutionDraft, resetCardioTimer, resetMovementTimer, workoutState]);

  useEffect(() => {
    if (isLiveMode) {
      return;
    }

    setExecutionInProgress({});
    setToastVisible(false);
    setToastConfig(null);
    setRestTimerVisible(false);
    resetCardioTimer();
    resetMovementTimer();
  }, [isLiveMode, resetCardioTimer, resetMovementTimer]);

  useEffect(() => {
    if (!cardioTimerState.visible || cardioTimerState.startedAtMs == null) {
      return;
    }

    const startedAtMs = cardioTimerState.startedAtMs;

    const syncTimerState = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const remainingSeconds = Math.max(0, cardioTimerState.plannedDurationSeconds - elapsedSeconds);

      setCardioTimerState((currentState) => {
        if (!currentState.visible || currentState.startedAtMs !== startedAtMs) {
          return currentState;
        }

        const isComplete = remainingSeconds <= 0;
        if (
          currentState.elapsedSeconds === elapsedSeconds &&
          currentState.remainingSeconds === remainingSeconds &&
          currentState.isComplete === isComplete
        ) {
          return currentState;
        }

        return {
          ...currentState,
          elapsedSeconds,
          remainingSeconds,
          isComplete,
        };
      });
    };

    syncTimerState();
    const interval = setInterval(syncTimerState, 1000);
    return () => clearInterval(interval);
  }, [
    cardioTimerState.plannedDurationSeconds,
      cardioTimerState.startedAtMs,
      cardioTimerState.visible,
  ]);

  useEffect(() => {
    if (!movementTimerState.visible || movementTimerState.startedAtMs == null) {
      return;
    }

    const startedAtMs = movementTimerState.startedAtMs;

    const syncTimerState = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const remainingSeconds = Math.max(0, movementTimerState.plannedDurationSeconds - elapsedSeconds);

      setMovementTimerState((currentState) => {
        if (!currentState.visible || currentState.startedAtMs !== startedAtMs) {
          return currentState;
        }

        const isComplete = remainingSeconds <= 0;
        if (
          currentState.elapsedSeconds === elapsedSeconds &&
          currentState.remainingSeconds === remainingSeconds &&
          currentState.isComplete === isComplete
        ) {
          return currentState;
        }

        return {
          ...currentState,
          elapsedSeconds,
          remainingSeconds,
          isComplete,
        };
      });
    };

    syncTimerState();
    const interval = setInterval(syncTimerState, 1000);
    return () => clearInterval(interval);
  }, [
    movementTimerState.plannedDurationSeconds,
    movementTimerState.startedAtMs,
    movementTimerState.visible,
  ]);

  // Buzz once when a block or hold reaches its target, so a client holding a plank need not
  // watch the screen.
  useEffect(() => {
    if (movementTimerState.visible && movementTimerState.isComplete) {
      hapticSuccess();
    }
  }, [movementTimerState.isComplete, movementTimerState.visible]);

  const currentExerciseIndex = activeExecution?.currentExerciseIndex ?? 0;
  const currentSetNumber = activeExecution?.currentSetNumber ?? 1;

  const getExerciseContext = useCallback(
    (exerciseIndex: number): ExerciseContext | null => {
      if (!workoutState) {
        return null;
      }

      const progress = workoutState.exercises_progress[exerciseIndex];
      if (!progress) {
        return null;
      }

      const exercise = getDayExerciseByProgress(workoutState.training_day, progress);
      if (!exercise) {
        return null;
      }

      return {
        exerciseIndex,
        exercise,
        progress,
      };
    },
    [workoutState],
  );

  const resolveExecution = useCallback(
    (exerciseIndex: number, targetSetNumber?: number): ResolvedExecution | null => {
      const context = getExerciseContext(exerciseIndex);
      if (!context || !workoutState) {
        return null;
      }

      const setNumber = getExerciseTargetSetNumber(
        context.exercise,
        context.progress,
        targetSetNumber,
      );
      const isCurrentExecution =
        activeExecution?.key.dayExerciseId === context.progress.day_exercise_id &&
        activeExecution.currentSetNumber === setNumber;
      const draft = isCurrentExecution
        ? activeExecution
        : createExecutionDraft(workoutState, {
            dayExerciseId: context.progress.day_exercise_id,
            setNumber,
          });

      if (!draft) {
        return null;
      }

      return {
        context,
        draft,
        keyString: getExecutionKeyString(draft.key),
      };
    },
    [activeExecution, createExecutionDraft, getExerciseContext, workoutState],
  );

  const startCardioTimer = useCallback((resolvedExecution: ResolvedExecution) => {
    if (!isCardioExecutionDraft(resolvedExecution.draft)) {
      return;
    }

    setCardioTimerState({
      visible: true,
      keyString: resolvedExecution.keyString,
      exerciseIndex: resolvedExecution.context.exerciseIndex,
      setNumber: resolvedExecution.draft.currentSetNumber,
      exerciseName: getExerciseDisplayName(
        resolvedExecution.context.exercise,
        resolvedExecution.context.progress.exercise_name,
      ),
      plannedDurationSeconds: resolvedExecution.draft.durationSeconds,
      startedAtMs: Date.now(),
      remainingSeconds: resolvedExecution.draft.durationSeconds,
      elapsedSeconds: 0,
      isComplete: false,
    });
  }, []);

  const startMovementTimer = useCallback((resolvedExecution: ResolvedExecution) => {
    const { draft } = resolvedExecution;
    // A strength hold times its first segment's target; a mobility block its own duration.
    const plannedDurationSeconds = isMovementExecutionDraft(draft)
      ? draft.durationSeconds
      : isStrengthExecutionDraft(draft)
        ? (draft.currentSegments[0]?.duration_seconds ?? null)
        : null;
    if (plannedDurationSeconds == null || plannedDurationSeconds <= 0) {
      return;
    }

    setMovementTimerState({
      visible: true,
      kind: isStrengthExecutionDraft(draft) ? 'hold' : 'movement',
      keyString: resolvedExecution.keyString,
      exerciseIndex: resolvedExecution.context.exerciseIndex,
      setNumber: draft.currentSetNumber,
      exerciseName: getExerciseDisplayName(
        resolvedExecution.context.exercise,
        resolvedExecution.context.progress.exercise_name,
      ),
      plannedDurationSeconds,
      startedAtMs: Date.now(),
      remainingSeconds: plannedDurationSeconds,
      elapsedSeconds: 0,
      isComplete: false,
    });
  }, []);

  const syncActiveExecution = useCallback(
    (
      nextWorkoutState: CurrentWorkoutState,
      target?: ExecutionDraftTarget,
      options?: WorkoutExecutionDraftOptions,
    ) => {
      const nextDraft = createExecutionDraft(nextWorkoutState, target, options);
      if (nextDraft) {
        setActiveExecution(nextDraft);
      }
    },
    [createExecutionDraft],
  );

  const activateExercise = useCallback(
    (exerciseIndex: number) => {
      if (isReviewMode || !workoutState) {
        return;
      }

      const nextDraft = createExecutionDraft(workoutState, { exerciseIndex });
      if (!nextDraft) {
        return;
      }

      setActiveExecution(nextDraft);
    },
    [createExecutionDraft, isReviewMode, workoutState],
  );

  const selectSet = useCallback(
    (exerciseIndex: number, setNumber: number) => {
      if (isReviewMode || !workoutState) {
        return;
      }

      const nextDraft = createExecutionDraft(workoutState, { exerciseIndex, setNumber });
      if (!nextDraft) {
        return;
      }

      setActiveExecution(nextDraft);
      setExecutionInProgress((previous) => ({
        ...previous,
        [getExecutionKeyString(nextDraft.key)]: false,
      }));
    },
    [createExecutionDraft, isReviewMode, workoutState],
  );

  const updateStrengthDraft = useCallback(
    (
      exerciseIndex: number,
      updater: (draft: StrengthExecutionDraft) => StrengthExecutionDraft,
    ) => {
      if (isReviewMode) {
        return;
      }

      setActiveExecution((currentDraft) => {
        if (!isStrengthExecutionDraft(currentDraft) || currentDraft.currentExerciseIndex !== exerciseIndex) {
          return currentDraft;
        }

        const nextDraft = updater(currentDraft);
        return {
          ...nextDraft,
          currentSegments: normalizeWorkoutSetDraft(
            getExerciseContext(exerciseIndex)?.exercise,
            nextDraft.currentSegments,
          ),
        };
      });
    },
    [getExerciseContext, isReviewMode],
  );

  const changeStrengthMetric = useCallback(
    (
      exerciseIndex: number,
      segmentIndex: number,
      field: StrengthMetricField,
      delta: number,
    ) => {
      updateStrengthDraft(exerciseIndex, (draft) => ({
        ...draft,
        currentSegments: draft.currentSegments.map((segment, index) =>
          index === segmentIndex
            ? {
                ...segment,
                reps_completed:
                  field === 'reps'
                    ? adjustWorkoutMetricValue('reps', segment.reps_completed, delta) ?? segment.reps_completed
                    : segment.reps_completed,
                duration_seconds:
                  field === 'seconds'
                    ? adjustWorkoutMetricValue('seconds', segment.duration_seconds, delta) ?? segment.duration_seconds
                    : segment.duration_seconds,
                weight_kg:
                  field === 'weight'
                    ? adjustWorkoutMetricValue('weight', segment.weight_kg ?? 0, delta) ?? segment.weight_kg
                    : segment.weight_kg,
                effort_value:
                  field === 'effort'
                    ? adjustWorkoutMetricValue('effort', segment.effort_value ?? 0, delta) ?? segment.effort_value
                    : segment.effort_value,
              }
            : segment,
        ),
      }));
    },
    [updateStrengthDraft],
  );

  const commitStrengthMetric = useCallback(
    (
      exerciseIndex: number,
      segmentIndex: number,
      field: StrengthMetricField,
      nextValue: number,
    ) => {
      const normalizedValue = normalizeWorkoutMetricValue(field, nextValue);
      if (normalizedValue == null) {
        return;
      }

      updateStrengthDraft(exerciseIndex, (draft) => ({
        ...draft,
        currentSegments: draft.currentSegments.map((segment, index) =>
          index === segmentIndex
            ? {
                ...segment,
                reps_completed: field === 'reps' ? normalizedValue : segment.reps_completed,
                duration_seconds: field === 'seconds' ? normalizedValue : segment.duration_seconds,
                weight_kg: field === 'weight' ? normalizedValue : segment.weight_kg,
                effort_value: field === 'effort' ? normalizedValue : segment.effort_value,
              }
            : segment,
        ),
      }));
    },
    [updateStrengthDraft],
  );

  const addStrengthSegment = useCallback(
    (exerciseIndex: number) => {
      const context = getExerciseContext(exerciseIndex);
      if (!context) {
        return;
      }

      updateStrengthDraft(exerciseIndex, (draft) => ({
        ...draft,
        currentSegments: [
          ...draft.currentSegments,
          createNextSegmentDraft(context.exercise, draft.currentSegments),
        ],
      }));
    },
    [getExerciseContext, updateStrengthDraft],
  );

  const removeStrengthSegment = useCallback(
    (exerciseIndex: number, segmentIndex: number) => {
      const context = getExerciseContext(exerciseIndex);
      if (!context) {
        return;
      }

      updateStrengthDraft(exerciseIndex, (draft) => {
        const nextSegments = draft.currentSegments.filter((_, index) => index !== segmentIndex);
        const validationMessage = validateWorkoutSetDraft(context.exercise, nextSegments);
        if (validationMessage) {
          hapticError();
          Alert.alert('Segmentos insuficientes', validationMessage);
          return draft;
        }

        return {
          ...draft,
          currentSegments: nextSegments,
        };
      });
    },
    [getExerciseContext, updateStrengthDraft],
  );

  const updateCardioDraft = useCallback(
    (
      exerciseIndex: number,
      updater: (draft: CardioExecutionDraft) => CardioExecutionDraft,
    ) => {
      if (isReviewMode) {
        return;
      }

      setActiveExecution((currentDraft) => {
        if (!isCardioExecutionDraft(currentDraft) || currentDraft.currentExerciseIndex !== exerciseIndex) {
          return currentDraft;
        }

        return updater(currentDraft);
      });
    },
    [isReviewMode],
  );

  const updateMovementDraft = useCallback(
    (
      exerciseIndex: number,
      updater: (draft: MovementExecutionDraft) => MovementExecutionDraft,
    ) => {
      if (isReviewMode) {
        return;
      }

      setActiveExecution((currentDraft) => {
        if (!isMovementExecutionDraft(currentDraft) || currentDraft.currentExerciseIndex !== exerciseIndex) {
          return currentDraft;
        }

        return updater(currentDraft);
      });
    },
    [isReviewMode],
  );

  const changeCardioMetric = useCallback(
    (exerciseIndex: number, field: CardioMetricField, delta: number) => {
      updateCardioDraft(exerciseIndex, (draft) => {
        const currentValue = getCardioMetricValue(draft, field);
        const nextValue = adjustWorkoutMetricValue(field, currentValue, delta);
        if (nextValue == null) {
          return draft;
        }

        return applyCardioMetricValue(draft, field, nextValue);
      });
    },
    [updateCardioDraft],
  );

  const commitCardioMetric = useCallback(
    (exerciseIndex: number, field: CardioMetricField, nextValue: number) => {
      const normalizedValue = normalizeWorkoutMetricValue(field, nextValue);
      if (normalizedValue == null) {
        return;
      }

      updateCardioDraft(exerciseIndex, (draft) => applyCardioMetricValue(draft, field, normalizedValue));
    },
    [updateCardioDraft],
  );

  const changeMovementMetric = useCallback(
    (exerciseIndex: number, field: MovementMetricField, delta: number) => {
      updateMovementDraft(exerciseIndex, (draft) => {
        const currentValue = getMovementMetricValue(draft, field);
        const nextValue = adjustWorkoutMetricValue(field, currentValue, delta);
        if (nextValue == null) {
          return draft;
        }

        return applyMovementMetricValue(draft, field, nextValue);
      });
    },
    [updateMovementDraft],
  );

  const commitMovementMetric = useCallback(
    (exerciseIndex: number, field: MovementMetricField, nextValue: number) => {
      const normalizedValue = normalizeWorkoutMetricValue(field, nextValue);
      if (normalizedValue == null) {
        return;
      }

      updateMovementDraft(exerciseIndex, (draft) => applyMovementMetricValue(draft, field, normalizedValue));
    },
    [updateMovementDraft],
  );

  const persistExecution = useCallback(
    async (
      resolvedExecution: ResolvedExecution,
      options?: {
        nextExerciseIndex?: number;
        nextSetNumber?: number;
        cardioDurationSeconds?: number;
        movementDurationSeconds?: number;
        holdDurationSeconds?: number;
        draftOptions?: WorkoutExecutionDraftOptions;
      },
    ) => {
      const { draft } = resolvedExecution;
      const holdDurationSeconds = options?.holdDurationSeconds;
      const mutationResult = isStrengthExecutionDraft(draft)
        ? await saveStrengthSet({
            dayExerciseId: draft.key.dayExerciseId,
            setNumber: draft.currentSetNumber,
            segments: toWorkoutSetSegmentInputs(
              holdDurationSeconds != null
                ? draft.currentSegments.map((segment) => ({ ...segment, duration_seconds: holdDurationSeconds }))
                : draft.currentSegments,
            ),
          })
        : isCardioExecutionDraft(draft)
          ? await saveCardioBlock(
              toWorkoutCardioBlockInput(
                options?.cardioDurationSeconds != null
                  ? {
                      ...draft,
                      durationSeconds: options.cardioDurationSeconds,
                    }
                  : draft,
              ),
            )
          : await saveMovementBlock(
              toWorkoutMovementBlockInput(
                options?.movementDurationSeconds != null
                  ? {
                      ...draft,
                      durationSeconds: options.movementDurationSeconds,
                    }
                  : draft,
              ),
            );

      if (!mutationResult.ok) {
        return null;
      }

      const isChangingExercise =
        options?.nextExerciseIndex !== undefined &&
        options.nextExerciseIndex !== resolvedExecution.context.exerciseIndex;
      syncActiveExecution(mutationResult.state, {
        exerciseIndex: options?.nextExerciseIndex ?? resolvedExecution.context.exerciseIndex,
        // When changing to a different exercise, do NOT fall back to the current set number —
        // let createWorkoutExecutionDraft default to set 1 for the new exercise.
        setNumber: isChangingExercise ? options?.nextSetNumber : (options?.nextSetNumber ?? resolvedExecution.draft.currentSetNumber),
      }, options?.draftOptions);

      return mutationResult.state;
    },
    [saveCardioBlock, saveMovementBlock, saveStrengthSet, syncActiveExecution],
  );

  const finalizeLiveExecution = useCallback(
    async (
      resolvedExecution: ResolvedExecution,
      totalSets: number,
      options?: {
        cardioDurationSeconds?: number;
        movementDurationSeconds?: number;
        holdDurationSeconds?: number;
        clearCardioTimer?: boolean;
        clearMovementTimer?: boolean;
      },
    ) => {
      if (!workoutState) {
        return;
      }

      const executionKey = getExecutionKeyString(resolvedExecution.draft.key);
      const unitLabel = getExecutionUnitLabel(resolvedExecution.draft);
      const nextIncompleteIndex = findNextIncompleteExerciseIndex(
        workoutState.exercises_progress,
        resolvedExecution.context.exerciseIndex,
      );
      const shouldPrefillNextStrengthSet =
        isStrengthExecutionDraft(resolvedExecution.draft) &&
        resolvedExecution.draft.currentSetNumber < totalSets;
      const nextWorkoutState = await persistExecution(resolvedExecution, {
        nextExerciseIndex:
          resolvedExecution.draft.currentSetNumber >= totalSets
            ? nextIncompleteIndex
            : resolvedExecution.context.exerciseIndex,
        nextSetNumber:
          resolvedExecution.draft.currentSetNumber >= totalSets
            ? undefined
            : Math.min(resolvedExecution.draft.currentSetNumber + 1, totalSets),
        cardioDurationSeconds: options?.cardioDurationSeconds,
        movementDurationSeconds: options?.movementDurationSeconds,
        holdDurationSeconds: options?.holdDurationSeconds,
        draftOptions: shouldPrefillNextStrengthSet
          ? { strengthPrefillStrategy: 'previousCompletedSet' }
          : undefined,
      });

      setExecutionInProgress((previous) => ({ ...previous, [executionKey]: false }));
      if (!nextWorkoutState) {
        return;
      }

      if (options?.clearCardioTimer) {
        resetCardioTimer();
      }
      if (options?.clearMovementTimer) {
        resetMovementTimer();
      }

      const refreshedProgress = nextWorkoutState.exercises_progress[resolvedExecution.context.exerciseIndex];
      const isExerciseCompleted = refreshedProgress?.is_completed ?? false;

      if (isExerciseCompleted) {
        hapticSuccess();
        showToast({
          message: 'Ejercicio completado',
          subtitle: 'Excelente trabajo',
          icon: 'trophy-outline',
          iconColor: '#3B82F6',
        });
        return;
      }

      showToast({
        message: `${unitLabel} completado`,
        subtitle: `${unitLabel} ${resolvedExecution.draft.currentSetNumber} de ${totalSets}`,
        icon: 'checkmark-circle',
        iconColor: '#10B981',
      });
      hapticSuccess();
      setRestTimerSeconds(resolvedExecution.draft.restSeconds);
      setRestTimerVisible(true);
    },
    [persistExecution, resetCardioTimer, resetMovementTimer, showToast, workoutState],
  );

  const saveHistoricalExecution = useCallback(
    async (exerciseIndex: number, setNumber: number) => {
      if (isSavingSet || !isHistoricalEditMode) {
        return;
      }

      const resolvedExecution = resolveExecution(exerciseIndex, setNumber);
      if (!resolvedExecution) {
        return;
      }

      if (isStrengthExecutionDraft(resolvedExecution.draft)) {
        const validationMessage = validateWorkoutSetDraft(
          resolvedExecution.context.exercise,
          resolvedExecution.draft.currentSegments,
        );
        if (validationMessage) {
          hapticError();
          Alert.alert('No se pudo guardar la serie', validationMessage);
          return;
        }
      }

      const hasExistingSet = isCardioExecutionDraft(resolvedExecution.draft)
        ? hasCompletedCardioExecution(resolvedExecution.context.progress, setNumber)
        : isMovementExecutionDraft(resolvedExecution.draft)
          ? hasCompletedMovementExecution(resolvedExecution.context.progress, setNumber)
          : (resolvedExecution.context.progress.sets_data ?? []).some(
              (setGroup) => setGroup.set_number === setNumber,
            );
      const totalSets = isCardioExercise(resolvedExecution.context.exercise)
        ? resolvedExecution.context.progress.total_sets
        : resolvedExecution.context.exercise.sets;
      const nextPendingSetNumber = Math.min(
        resolvedExecution.context.progress.completed_sets + 1,
        totalSets,
      );

      if (!hasExistingSet && setNumber !== nextPendingSetNumber) {
        const unitLabel = getExecutionUnitLabel(resolvedExecution.draft).toLowerCase();
        hapticError();
        Alert.alert(
          `${getExecutionUnitLabel(resolvedExecution.draft)} no disponible`,
          `Solo puedes editar ${unitLabel === 'bloque' ? 'un bloque' : 'una serie'} existente o registrar ${unitLabel === 'bloque' ? 'el siguiente bloque' : 'la siguiente serie'} pendiente.`,
        );
        return;
      }

      await persistExecution(resolvedExecution);
    },
    [isHistoricalEditMode, isSavingSet, persistExecution, resolveExecution],
  );

  const advanceLiveExecution = useCallback(
    async (exerciseIndex: number, setNumber: number, totalSets: number) => {
      if (isSavingSet || !isLiveMode || !workoutState) {
        return;
      }

      const resolvedExecution = resolveExecution(exerciseIndex, setNumber);
      if (!resolvedExecution) {
        return;
      }

      if (activeExecution?.currentExerciseIndex !== exerciseIndex) {
        const nextDraft = createExecutionDraft(workoutState, {
          dayExerciseId: resolvedExecution.context.progress.day_exercise_id,
          setNumber,
        });
        if (nextDraft) {
          setActiveExecution(nextDraft);
        }
      }

      if (isStrengthExecutionDraft(resolvedExecution.draft)) {
        const validationMessage = validateWorkoutSetDraft(
          resolvedExecution.context.exercise,
          resolvedExecution.draft.currentSegments,
        );
        if (validationMessage) {
          hapticError();
          Alert.alert('No se pudo guardar la serie', validationMessage);
          return;
        }
      }

      const executionKey = getExecutionKeyString(resolvedExecution.draft.key);
      const isInProgress = executionInProgress[executionKey] || false;
      const unitLabel = getExecutionUnitLabel(resolvedExecution.draft);
      const shouldUseCardioTimer =
        isCardioExecutionDraft(resolvedExecution.draft) &&
        usesSteadyStateCardioTimer(
          resolvedExecution.context.exercise,
          resolvedExecution.draft.durationSeconds,
        );
      const shouldUseMovementTimer =
        (isMovementExecutionDraft(resolvedExecution.draft) &&
          isTimedMovementExercise(
            resolvedExecution.context.exercise,
            resolvedExecution.draft.durationSeconds,
          )) ||
        // A strength hold (plank) runs the same countdown and saves the seconds actually held.
        (isStrengthExecutionDraft(resolvedExecution.draft) &&
          isTimedStrengthExercise(resolvedExecution.context.exercise) &&
          (resolvedExecution.draft.currentSegments[0]?.duration_seconds ?? 0) > 0);

      if (!isInProgress) {
        setExecutionInProgress((previous) => ({ ...previous, [executionKey]: true }));

        if (shouldUseCardioTimer) {
          startCardioTimer(resolvedExecution);
          return;
        }
        if (shouldUseMovementTimer) {
          startMovementTimer(resolvedExecution);
          return;
        }

        showToast({
          message:
            setNumber === 1 && resolvedExecution.context.progress.completed_sets === 0
              ? 'Empieza'
              : `${unitLabel} ${setNumber} en marcha`,
          subtitle:
            setNumber === 1 && resolvedExecution.context.progress.completed_sets === 0
              ? 'Manten buena forma'
              : 'Tu puedes',
          icon: 'flame-outline',
          iconColor: '#F97316',
        });
        return;
      }

      if (shouldUseCardioTimer) {
        return;
      }
      if (shouldUseMovementTimer) {
        return;
      }

      await finalizeLiveExecution(resolvedExecution, totalSets);
    },
    [
      activeExecution?.currentExerciseIndex,
      executionInProgress,
      finalizeLiveExecution,
      isLiveMode,
      isSavingSet,
      resolveExecution,
      showToast,
      startCardioTimer,
      startMovementTimer,
      createExecutionDraft,
      workoutState,
    ],
  );

  const finishCardioExecutionFromTimer = useCallback(async () => {
    if (
      isSavingSet ||
      !isLiveMode ||
      !workoutState ||
      !cardioTimerState.visible ||
      cardioTimerState.exerciseIndex == null ||
      cardioTimerState.setNumber == null
    ) {
      return;
    }

    const resolvedExecution = resolveExecution(cardioTimerState.exerciseIndex, cardioTimerState.setNumber);
    if (!resolvedExecution || !isCardioExecutionDraft(resolvedExecution.draft)) {
      return;
    }

    const totalSets = isCardioExercise(resolvedExecution.context.exercise)
      ? resolvedExecution.context.progress.total_sets
      : resolvedExecution.context.exercise.sets;
    const elapsedSeconds = Math.max(1, cardioTimerState.elapsedSeconds);

    await finalizeLiveExecution(resolvedExecution, totalSets, {
      cardioDurationSeconds: elapsedSeconds,
      clearCardioTimer: true,
    });
  }, [
    cardioTimerState.elapsedSeconds,
    cardioTimerState.exerciseIndex,
    cardioTimerState.setNumber,
    cardioTimerState.visible,
    finalizeLiveExecution,
    isLiveMode,
    isSavingSet,
    resolveExecution,
    workoutState,
  ]);

  const finishMovementExecutionFromTimer = useCallback(async () => {
    if (
      isSavingSet ||
      !isLiveMode ||
      !workoutState ||
      !movementTimerState.visible ||
      movementTimerState.exerciseIndex == null ||
      movementTimerState.setNumber == null
    ) {
      return;
    }

    const resolvedExecution = resolveExecution(movementTimerState.exerciseIndex, movementTimerState.setNumber);
    if (!resolvedExecution) {
      return;
    }

    const totalSets = resolvedExecution.context.exercise.sets;
    const elapsedSeconds = Math.max(1, movementTimerState.elapsedSeconds);

    if (isStrengthExecutionDraft(resolvedExecution.draft)) {
      await finalizeLiveExecution(resolvedExecution, totalSets, {
        holdDurationSeconds: elapsedSeconds,
        clearMovementTimer: true,
      });
      return;
    }

    if (!isMovementExecutionDraft(resolvedExecution.draft)) {
      return;
    }

    await finalizeLiveExecution(resolvedExecution, totalSets, {
      movementDurationSeconds: elapsedSeconds,
      clearMovementTimer: true,
    });
  }, [
    finalizeLiveExecution,
    isLiveMode,
    isSavingSet,
    movementTimerState.elapsedSeconds,
    movementTimerState.exerciseIndex,
    movementTimerState.setNumber,
    movementTimerState.visible,
    resolveExecution,
    workoutState,
  ]);

  const deleteExecution = useCallback(
    async (exerciseIndex: number, setNumber: number) => {
      if (isSavingSet || !isHistoricalEditMode) {
        return false;
      }

      const context = getExerciseContext(exerciseIndex);
      if (!context) {
        return false;
      }

      if (isCardioExercise(context.exercise)) {
        const cardioBlock = getCardioBlockByNumber(context.progress, setNumber);
        if (cardioBlock) {
          const result = await deleteCardioBlock(cardioBlock.id);
          if (result.ok) {
            syncActiveExecution(result.state, {
              dayExerciseId: context.progress.day_exercise_id,
              setNumber,
            });
            return true;
          }

          return false;
        }

        const legacySetGroup = getSetGroupByNumber(context.progress, setNumber);
        if (!legacySetGroup) {
          return false;
        }

        const result = await deleteStrengthSet(legacySetGroup.day_exercise_id, setNumber);
        if (result.ok) {
          syncActiveExecution(result.state, {
            dayExerciseId: context.progress.day_exercise_id,
            setNumber,
          });
          return true;
        }

        return false;
      }

      if (isMovementExercise(context.exercise)) {
        const movementBlock = getMovementBlockByNumber(context.progress, setNumber);
        if (!movementBlock) {
          return false;
        }

        const result = await deleteMovementBlock(movementBlock.id);
        if (result.ok) {
          syncActiveExecution(result.state, {
            dayExerciseId: context.progress.day_exercise_id,
            setNumber,
          });
          return true;
        }

        return false;
      }

      const setGroup = getSetGroupByNumber(context.progress, setNumber);
      if (!setGroup) {
        return false;
      }

      const result = await deleteStrengthSet(setGroup.day_exercise_id, setNumber);
      if (result.ok) {
        syncActiveExecution(result.state, {
          dayExerciseId: context.progress.day_exercise_id,
          setNumber,
        });
        return true;
      }

      return false;
    },
    [
      deleteCardioBlock,
      deleteMovementBlock,
      deleteStrengthSet,
      getExerciseContext,
      isHistoricalEditMode,
      isSavingSet,
      syncActiveExecution,
    ],
  );

  return {
    activeExecution,
    capabilities,
    currentExerciseIndex,
    currentSetNumber,
    screenMode,
    isReviewMode,
    isLiveMode,
    isHistoricalEditMode,
    toastState: {
      visible: toastVisible,
      config: toastConfig,
    },
    restTimerState: {
      visible: restTimerVisible,
      initialSeconds: restTimerSeconds,
    },
    cardioTimerState,
    movementTimerState,
    executionInProgress,
    resolveExecution,
    actions: {
      activateExercise,
      selectSet,
      changeStrengthMetric,
      commitStrengthMetric,
      addStrengthSegment,
      removeStrengthSegment,
      changeCardioMetric,
      commitCardioMetric,
      changeMovementMetric,
      commitMovementMetric,
      saveHistoricalExecution,
      advanceLiveExecution,
      finishCardioExecutionFromTimer,
      finishMovementExecutionFromTimer,
      deleteExecution,
      hideToast: () => setToastVisible(false),
      dismissRestTimer: () => setRestTimerVisible(false),
      dismissCardioTimer: resetCardioTimer,
      dismissMovementTimer: resetMovementTimer,
    },
  };
};
