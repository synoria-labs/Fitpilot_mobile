import { create, type StateCreator } from 'zustand';
import { trainingClient } from '../services/api';
import type {
  AbandonReason,
  CardioBlockLog,
  CurrentWorkoutState,
  DashboardBootstrap,
  DayExercise,
  ExerciseProgress,
  MissedWorkout,
  MovementBlockLog,
  WorkoutLog,
  WorkoutSetGroup,
  WorkoutSetSegmentInput,
} from '../types';
import { getCardioEffectiveSets, isCardioExercise, isMovementExercise } from '../utils/formatters';

export type WorkoutMutationResult =
  | { ok: true; state: CurrentWorkoutState }
  | { ok: false };

interface WorkoutState {
  dashboardBootstrap: DashboardBootstrap | null;
  currentWorkout: CurrentWorkoutState | null;
  missedWorkouts: MissedWorkout[];
  dashboardDataVersion: number;
  workoutLogsVersion: number;

  isLoading: boolean;
  isStartingWorkout: boolean;
  isSavingSet: boolean;
  isLoadingMissed: boolean;
  error: string | null;

  loadDashboardData: () => Promise<void>;
  loadMissedWorkouts: (daysBack?: number) => Promise<void>;
  startWorkout: (trainingDayId: string) => Promise<string | null>;
  loadWorkoutState: (workoutLogId: string) => Promise<void>;
  reopenWorkout: (workoutLogId?: string) => Promise<boolean>;
  saveSet: (data: {
    dayExerciseId: string;
    setNumber: number;
    segments: WorkoutSetSegmentInput[];
  }) => Promise<WorkoutMutationResult>;
  saveCardioBlock: (data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds: number;
    caloriesBurned?: number | null;
    distanceMeters?: number | null;
    effortValue?: number | null;
  }) => Promise<WorkoutMutationResult>;
  saveMovementBlock: (data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds?: number | null;
    contactsCompleted?: number | null;
    heightCm?: number | null;
    distanceCm?: number | null;
  }) => Promise<WorkoutMutationResult>;
  deleteSetGroup: (dayExerciseId: string, setNumber: number) => Promise<WorkoutMutationResult>;
  deleteCardioBlock: (cardioLogId: string) => Promise<WorkoutMutationResult>;
  deleteMovementBlock: (movementLogId: string) => Promise<WorkoutMutationResult>;
  closeWorkout: () => Promise<boolean>;
  abandonWorkout: (reason?: AbandonReason, notes?: string) => Promise<boolean>;
  dismissMissedWorkouts: () => void;
  clearError: () => void;
  reset: () => void;
}

type WorkoutStoreSet = Parameters<StateCreator<WorkoutState>>[0];
type WorkoutStoreGet = Parameters<StateCreator<WorkoutState>>[1];
type CardioMutationResponse =
  | { kind: 'cardio-block'; cardioBlock: CardioBlockLog }
  | { kind: 'legacy-set'; setGroup: WorkoutSetGroup };

const CLOSED_WORKOUT_ERROR_MARKERS = [
  'workout must be reopened before editing sets',
  'workout must be reopened before editing cardio blocks',
  'workout must be reopened before editing movement blocks',
];
const CLOSED_WORKOUT_CLIENT_MESSAGE = 'El entrenamiento esta cerrado. Reabrelo para editar.';

let latestWorkoutMutationRevision = 0;
let cardioBlockRouteSupport: 'unknown' | 'supported' | 'unsupported' = 'unknown';

const fetchWorkoutState = async (workoutLogId: string) =>
  trainingClient.get<CurrentWorkoutState>(`/workout-logs/${workoutLogId}/state`);

const reloadWorkoutState = async (workoutLogId: string) => fetchWorkoutState(workoutLogId);

const isClosedWorkoutEditError = (error: { status?: number; message?: string } | null | undefined) =>
  error?.status === 409 &&
  typeof error.message === 'string' &&
  CLOSED_WORKOUT_ERROR_MARKERS.some((marker) => error.message!.toLowerCase().includes(marker));

// Distingue "la ruta no existe en este backend" (404 generico de FastAPI,
// detail "Not Found") de "el recurso no existe" (404 con mensaje propio,
// p. ej. workout log borrado). Solo el primero justifica degradar al endpoint
// legacy: el fallback descarta duracion/calorias/distancia, y un 404 de
// recurso lo fijaba como 'unsupported' para toda la sesion de la app.
const isRouteMissingError = (error: { status?: number; message?: string } | null | undefined) =>
  error?.status === 404 &&
  typeof error.message === 'string' &&
  error.message.trim().toLowerCase() === 'not found';

const saveWorkoutSet = async (
  workoutLogId: string,
  data: {
    dayExerciseId: string;
    setNumber: number;
    segments: WorkoutSetSegmentInput[];
  },
) =>
  trainingClient.post<WorkoutSetGroup>(
    `/workout-logs/${workoutLogId}/sets`,
    {
      day_exercise_id: data.dayExerciseId,
      set_number: data.setNumber,
      segments: data.segments,
    },
  );

const saveWorkoutCardioBlockRoute = async (
  workoutLogId: string,
  data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds: number;
    caloriesBurned?: number | null;
    distanceMeters?: number | null;
    effortValue?: number | null;
  },
) =>
  trainingClient.post<CardioBlockLog>(
    `/workout-logs/${workoutLogId}/cardio-blocks`,
    {
      day_exercise_id: data.dayExerciseId,
      set_number: data.setNumber,
      duration_seconds: data.durationSeconds,
      calories_burned: data.caloriesBurned,
      distance_meters: data.distanceMeters,
      effort_value: data.effortValue,
    },
    {
      skipErrorLogging: cardioBlockRouteSupport === 'unknown',
    },
  );

const saveWorkoutCardioBlockLegacy = async (
  workoutLogId: string,
  data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds: number;
    caloriesBurned?: number | null;
    distanceMeters?: number | null;
    effortValue?: number | null;
  },
) =>
  trainingClient.post<WorkoutSetGroup>(
    `/workout-logs/${workoutLogId}/sets`,
    {
      day_exercise_id: data.dayExerciseId,
      set_number: data.setNumber,
      segments: [
        {
          segment_index: 1,
          reps_completed: 1,
          weight_kg: 0,
          effort_value: data.effortValue,
        },
      ],
    },
    {
      skipErrorLogging: true,
    },
  );

const saveWorkoutCardioBlock = async (
  workoutLogId: string,
  data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds: number;
    caloriesBurned?: number | null;
    distanceMeters?: number | null;
    effortValue?: number | null;
  },
): Promise<CardioMutationResponse> => {
  if (cardioBlockRouteSupport === 'unsupported') {
    return {
      kind: 'legacy-set',
      setGroup: await saveWorkoutCardioBlockLegacy(workoutLogId, data),
    };
  }

  try {
    const cardioBlock = await saveWorkoutCardioBlockRoute(workoutLogId, data);
    cardioBlockRouteSupport = 'supported';
    return {
      kind: 'cardio-block',
      cardioBlock,
    };
  } catch (error: any) {
    if (cardioBlockRouteSupport === 'supported' || !isRouteMissingError(error)) {
      // Errores de recurso/red se propagan tal cual; y si la ruta ya demostro
      // existir en esta sesion, ningun 404 posterior debe degradarla.
      throw error;
    }

    cardioBlockRouteSupport = 'unsupported';
    return {
      kind: 'legacy-set',
      setGroup: await saveWorkoutCardioBlockLegacy(workoutLogId, data),
    };
  }
};

const saveWorkoutMovementBlock = async (
  workoutLogId: string,
  data: {
    dayExerciseId: string;
    setNumber: number;
    durationSeconds?: number | null;
    contactsCompleted?: number | null;
    heightCm?: number | null;
    distanceCm?: number | null;
  },
) =>
  trainingClient.post<MovementBlockLog>(`/workout-logs/${workoutLogId}/movement-blocks`, {
    day_exercise_id: data.dayExerciseId,
    set_number: data.setNumber,
    duration_seconds: data.durationSeconds,
    contacts_completed: data.contactsCompleted,
    height_cm: data.heightCm,
    distance_cm: data.distanceCm,
  });

const normalizeExerciseProgress = (progress: ExerciseProgress): ExerciseProgress => ({
  ...progress,
  sets_data: Array.isArray(progress.sets_data) ? progress.sets_data : [],
  cardio_blocks_data: Array.isArray(progress.cardio_blocks_data) ? progress.cardio_blocks_data : [],
  movement_blocks_data: Array.isArray(progress.movement_blocks_data) ? progress.movement_blocks_data : [],
});

const normalizeCurrentWorkoutState = (workoutState: CurrentWorkoutState): CurrentWorkoutState => ({
  ...workoutState,
  workout_log: {
    ...workoutState.workout_log,
    exercise_sets: Array.isArray(workoutState.workout_log.exercise_sets)
      ? workoutState.workout_log.exercise_sets
      : [],
    cardio_blocks: Array.isArray(workoutState.workout_log.cardio_blocks)
      ? workoutState.workout_log.cardio_blocks
      : [],
    movement_blocks: Array.isArray(workoutState.workout_log.movement_blocks)
      ? workoutState.workout_log.movement_blocks
      : [],
  },
  training_day: {
    ...workoutState.training_day,
    exercises: Array.isArray(workoutState.training_day.exercises)
      ? workoutState.training_day.exercises
      : [],
  },
  exercises_progress: Array.isArray(workoutState.exercises_progress)
    ? workoutState.exercises_progress.map(normalizeExerciseProgress)
    : [],
});

const prepareWorkoutState = (workoutState: CurrentWorkoutState): CurrentWorkoutState =>
  rebuildWorkoutState(normalizeCurrentWorkoutState(workoutState));

const findDayExercise = (workoutState: CurrentWorkoutState, dayExerciseId: string): DayExercise | undefined =>
  workoutState.training_day.exercises.find((exercise) => exercise.id === dayExerciseId);

const sortWorkoutSetGroups = (groups: WorkoutSetGroup[]) =>
  groups
    .slice()
    .sort((left, right) => left.set_number - right.set_number)
    .map((group) => ({
      ...group,
      segments: group.segments
        .slice()
        .sort((leftSegment, rightSegment) => leftSegment.segment_index - rightSegment.segment_index),
    }));

const sortCardioBlocks = (blocks: CardioBlockLog[]) =>
  blocks.slice().sort((left, right) => left.set_number - right.set_number);

const sortMovementBlocks = (blocks: MovementBlockLog[]) =>
  blocks.slice().sort((left, right) => left.set_number - right.set_number);

const countContiguousCompletedSets = (setNumbers: Set<number>, totalSets: number) => {
  let completedSets = 0;
  for (let setNumber = 1; setNumber <= totalSets; setNumber += 1) {
    if (!setNumbers.has(setNumber)) {
      break;
    }
    completedSets += 1;
  }
  return completedSets;
};

const getProgressTotalSets = (workoutState: CurrentWorkoutState, progress: ExerciseProgress) => {
  const dayExercise = findDayExercise(workoutState, progress.day_exercise_id);
  if (!dayExercise) {
    return progress.total_sets;
  }

  return isCardioExercise(dayExercise)
    ? getCardioEffectiveSets(dayExercise)
    : dayExercise.sets;
};

const rebuildProgress = (workoutState: CurrentWorkoutState, progress: ExerciseProgress): ExerciseProgress => {
  const totalSets = getProgressTotalSets(workoutState, progress);
  const dayExercise = findDayExercise(workoutState, progress.day_exercise_id);
  const completedNumbers = new Set(
    isMovementExercise(dayExercise)
      ? progress.movement_blocks_data.map((block) => block.set_number)
      : progress.cardio_blocks_data.length
      ? progress.cardio_blocks_data.map((block) => block.set_number)
      : progress.sets_data.map((setGroup) => setGroup.set_number),
  );
  const completedSets = countContiguousCompletedSets(completedNumbers, totalSets);

  return {
    ...progress,
    total_sets: totalSets,
    completed_sets: completedSets,
    is_completed: totalSets > 0 && completedSets >= totalSets,
    sets_data: sortWorkoutSetGroups(progress.sets_data),
    cardio_blocks_data: sortCardioBlocks(progress.cardio_blocks_data),
    movement_blocks_data: sortMovementBlocks(progress.movement_blocks_data),
  };
};

const rebuildWorkoutState = (workoutState: CurrentWorkoutState): CurrentWorkoutState => {
  const normalizedWorkoutState = normalizeCurrentWorkoutState(workoutState);
  const exercisesProgress = normalizedWorkoutState.exercises_progress.map((progress) =>
    rebuildProgress(normalizedWorkoutState, progress),
  );

  return {
    ...normalizedWorkoutState,
    total_exercises: exercisesProgress.length,
    completed_exercises: exercisesProgress.filter((progress) => progress.is_completed).length,
    exercises_progress: exercisesProgress,
    workout_log: {
      ...normalizedWorkoutState.workout_log,
      exercise_sets: exercisesProgress.flatMap((progress) =>
        progress.sets_data.flatMap((setGroup) => setGroup.segments),
      ),
      cardio_blocks: exercisesProgress.flatMap((progress) => progress.cardio_blocks_data),
      movement_blocks: exercisesProgress.flatMap((progress) => progress.movement_blocks_data),
    },
  };
};

const replaceExerciseProgress = (
  workoutState: CurrentWorkoutState,
  dayExerciseId: string,
  updater: (progress: ExerciseProgress) => ExerciseProgress,
) => {
  const progressIndex = workoutState.exercises_progress.findIndex(
    (progress) => progress.day_exercise_id === dayExerciseId,
  );
  if (progressIndex < 0) {
    return workoutState;
  }

  const nextExercisesProgress = workoutState.exercises_progress.slice();
  nextExercisesProgress[progressIndex] = updater(nextExercisesProgress[progressIndex]);

  return rebuildWorkoutState({
    ...workoutState,
    exercises_progress: nextExercisesProgress,
  });
};

const patchStrengthSetGroup = (workoutState: CurrentWorkoutState, setGroup: WorkoutSetGroup) =>
  replaceExerciseProgress(workoutState, setGroup.day_exercise_id, (progress) => ({
    ...progress,
    sets_data: sortWorkoutSetGroups([
      ...progress.sets_data.filter((existingGroup) => existingGroup.set_number !== setGroup.set_number),
      setGroup,
    ]),
  }));

const patchCardioBlock = (workoutState: CurrentWorkoutState, cardioBlock: CardioBlockLog) =>
  replaceExerciseProgress(workoutState, cardioBlock.day_exercise_id, (progress) => ({
    ...progress,
    cardio_blocks_data: sortCardioBlocks([
      ...progress.cardio_blocks_data.filter((existingBlock) => existingBlock.set_number !== cardioBlock.set_number),
      cardioBlock,
    ]),
  }));

const patchMovementBlock = (workoutState: CurrentWorkoutState, movementBlock: MovementBlockLog) =>
  replaceExerciseProgress(workoutState, movementBlock.day_exercise_id, (progress) => ({
    ...progress,
    movement_blocks_data: sortMovementBlocks([
      ...progress.movement_blocks_data.filter((existingBlock) => existingBlock.set_number !== movementBlock.set_number),
      movementBlock,
    ]),
  }));

const removeStrengthSetGroup = (
  workoutState: CurrentWorkoutState,
  dayExerciseId: string,
  setNumber: number,
) =>
  replaceExerciseProgress(workoutState, dayExerciseId, (progress) => ({
    ...progress,
    sets_data: progress.sets_data.filter((setGroup) => setGroup.set_number !== setNumber),
  }));

const removeCardioBlock = (workoutState: CurrentWorkoutState, cardioLogId: string) => {
  const targetProgress = workoutState.exercises_progress.find((progress) =>
    progress.cardio_blocks_data.some((block) => block.id === cardioLogId),
  );
  if (!targetProgress) {
    return workoutState;
  }

  return replaceExerciseProgress(workoutState, targetProgress.day_exercise_id, (progress) => ({
    ...progress,
    cardio_blocks_data: progress.cardio_blocks_data.filter((block) => block.id !== cardioLogId),
  }));
};

const removeMovementBlock = (workoutState: CurrentWorkoutState, movementLogId: string) => {
  const targetProgress = workoutState.exercises_progress.find((progress) =>
    progress.movement_blocks_data.some((block) => block.id === movementLogId),
  );
  if (!targetProgress) {
    return workoutState;
  }

  return replaceExerciseProgress(workoutState, targetProgress.day_exercise_id, (progress) => ({
    ...progress,
    movement_blocks_data: progress.movement_blocks_data.filter((block) => block.id !== movementLogId),
  }));
};

const syncWorkoutStateInBackground = (
  setState: WorkoutStoreSet,
  getState: WorkoutStoreGet,
  workoutLogId: string,
  revision: number,
) => {
  void fetchWorkoutState(workoutLogId)
    .then((state) => {
      if (revision !== latestWorkoutMutationRevision) {
        return;
      }

      const nextState = prepareWorkoutState(state);

      setState((storeState) => {
        if (getState().currentWorkout?.workout_log.id !== workoutLogId) {
          return storeState;
        }

        return {
          currentWorkout: nextState,
        };
      });
    })
    .catch(() => undefined);
};

const resolveMutationError = async (
  setState: WorkoutStoreSet,
  currentWorkout: CurrentWorkoutState,
  error: any,
  fallbackMessage: string,
): Promise<WorkoutMutationResult> => {
  if (isClosedWorkoutEditError(error)) {
    try {
      const refreshedState = prepareWorkoutState(
        await fetchWorkoutState(currentWorkout.workout_log.id),
      );

      setState((state) => ({
        // Guard de identidad: no pisar un workout distinto si el usuario
        // cambio de sesion mientras se refrescaba el estado.
        ...(state.currentWorkout?.workout_log.id === currentWorkout.workout_log.id
          ? { currentWorkout: refreshedState }
          : {}),
        isSavingSet: false,
        error: CLOSED_WORKOUT_CLIENT_MESSAGE,
      }));
    } catch {
      setState({
        isSavingSet: false,
        error: CLOSED_WORKOUT_CLIENT_MESSAGE,
      });
    }

    return { ok: false };
  }

  setState({
    isSavingSet: false,
    error: error.message || fallbackMessage,
  });

  return { ok: false };
};

const commitWorkoutMutation = async <TResponse>(
  setState: WorkoutStoreSet,
  getState: WorkoutStoreGet,
  run: (workoutLogId: string) => Promise<TResponse>,
  patchWorkoutState: (workoutState: CurrentWorkoutState, response: TResponse) => CurrentWorkoutState,
  fallbackMessage: string,
): Promise<WorkoutMutationResult> => {
  const currentWorkout = getState().currentWorkout;
  if (!currentWorkout) {
    return { ok: false };
  }

  const workoutLogId = currentWorkout.workout_log.id;
  setState({ isSavingSet: true, error: null });

  try {
    const response = await run(workoutLogId);
    latestWorkoutMutationRevision += 1;
    const revision = latestWorkoutMutationRevision;

    // El patch se aplica sobre el estado VIVO dentro del updater, no sobre el
    // snapshot capturado al inicio: con mutaciones solapadas (guardar una
    // serie mientras otra esta en vuelo), patchear el snapshot pisaba el
    // patch optimista de la mutacion anterior y la serie "desaparecia" de la
    // UI hasta el siguiente sync.
    let committedWorkoutState: CurrentWorkoutState | null = null;
    setState((state) => {
      const liveWorkout = state.currentWorkout;
      if (!liveWorkout || liveWorkout.workout_log.id !== workoutLogId) {
        // El workout cambio o se cerro mientras la request volaba: no
        // resucitar estado viejo.
        return { isSavingSet: false };
      }

      committedWorkoutState = patchWorkoutState(liveWorkout, response);
      return {
        currentWorkout: committedWorkoutState,
        isSavingSet: false,
        workoutLogsVersion: state.workoutLogsVersion + 1,
      };
    });

    if (!committedWorkoutState) {
      return { ok: false };
    }

    syncWorkoutStateInBackground(setState, getState, workoutLogId, revision);

    return {
      ok: true,
      state: committedWorkoutState,
    };
  } catch (error: any) {
    return resolveMutationError(setState, currentWorkout, error, fallbackMessage);
  }
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  dashboardBootstrap: null,
  currentWorkout: null,
  missedWorkouts: [],
  dashboardDataVersion: 0,
  workoutLogsVersion: 0,

  isLoading: false,
  isStartingWorkout: false,
  isSavingSet: false,
  isLoadingMissed: false,
  error: null,

  loadDashboardData: async () => {
    set({ isLoading: true, error: null });

    try {
      const dashboardBootstrap =
        await trainingClient.get<DashboardBootstrap>('/client-app/dashboard-bootstrap');

      set((state) => ({
        dashboardBootstrap,
        dashboardDataVersion: state.dashboardDataVersion + 1,
        isLoading: false,
      }));
    } catch (error: any) {
      // Conservar el bootstrap previo: un pull-to-refresh fallido por red
      // flaky no debe vaciar el dashboard que ya estaba cargado.
      set({
        isLoading: false,
        error: error.message || 'Error al cargar el dashboard',
      });
    }
  },

  loadMissedWorkouts: async (daysBack = 14) => {
    set({ isLoadingMissed: true });

    try {
      const response = await trainingClient.get<{ missed_workouts: MissedWorkout[]; total: number }>(
        `/workout-logs/missed?days_back=${daysBack}`,
      );

      set({
        missedWorkouts: response.missed_workouts,
        isLoadingMissed: false,
      });
    } catch {
      set({
        missedWorkouts: [],
        isLoadingMissed: false,
      });
    }
  },

  startWorkout: async (trainingDayId: string) => {
    set({ isStartingWorkout: true, error: null });

    try {
      const workoutLog = await trainingClient.post<WorkoutLog>('/workout-logs', {
        training_day_id: trainingDayId,
      });
      const state = prepareWorkoutState(await fetchWorkoutState(workoutLog.id));

      set((previousState) => ({
        currentWorkout: state,
        isStartingWorkout: false,
        workoutLogsVersion: previousState.workoutLogsVersion + 1,
      }));

      return workoutLog.id;
    } catch (error: any) {
      set({
        isStartingWorkout: false,
        error: error.message || 'Error al abrir la sesion',
      });
      return null;
    }
  },

  loadWorkoutState: async (workoutLogId: string) => {
    set({ isLoading: true, error: null });

    try {
      const state = prepareWorkoutState(await fetchWorkoutState(workoutLogId));

      set({
        currentWorkout: state,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Error al cargar la sesion',
      });
    }
  },

  reopenWorkout: async (workoutLogId?: string) => {
    const targetWorkoutLogId = workoutLogId ?? get().currentWorkout?.workout_log.id;
    if (!targetWorkoutLogId) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await trainingClient.post<WorkoutLog>(`/workout-logs/${targetWorkoutLogId}/reopen`);
      const state = prepareWorkoutState(await reloadWorkoutState(targetWorkoutLogId));

      set((previousState) => ({
        currentWorkout: state,
        isLoading: false,
        workoutLogsVersion: previousState.workoutLogsVersion + 1,
      }));

      return true;
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'No fue posible reabrir el entrenamiento',
      });
      return false;
    }
  },

  saveSet: async (data) =>
    commitWorkoutMutation(
      set,
      get,
      (workoutLogId) => saveWorkoutSet(workoutLogId, data),
      (workoutState, response) => patchStrengthSetGroup(workoutState, response),
      'No fue posible guardar la serie',
    ),

  saveCardioBlock: async (data) =>
    commitWorkoutMutation(
      set,
      get,
      (workoutLogId) => saveWorkoutCardioBlock(workoutLogId, data),
      (workoutState, response) =>
        response.kind === 'cardio-block'
          ? patchCardioBlock(workoutState, response.cardioBlock)
          : patchStrengthSetGroup(workoutState, response.setGroup),
      'No fue posible guardar el bloque de cardio',
    ),

  saveMovementBlock: async (data) =>
    commitWorkoutMutation(
      set,
      get,
      (workoutLogId) => saveWorkoutMovementBlock(workoutLogId, data),
      (workoutState, response) => patchMovementBlock(workoutState, response),
      'No fue posible guardar el bloque de movimiento',
    ),

  deleteSetGroup: async (dayExerciseId, setNumber) =>
    commitWorkoutMutation(
      set,
      get,
      async (workoutLogId) => {
        await trainingClient.delete<void>(
          `/workout-logs/${workoutLogId}/day-exercises/${dayExerciseId}/sets/${setNumber}`,
        );
        return null;
      },
      (workoutState) => removeStrengthSetGroup(workoutState, dayExerciseId, setNumber),
      'No fue posible eliminar la serie',
    ),

  deleteCardioBlock: async (cardioLogId) =>
    commitWorkoutMutation(
      set,
      get,
      async (workoutLogId) => {
        await trainingClient.delete<void>(`/workout-logs/${workoutLogId}/cardio-blocks/${cardioLogId}`);
        return null;
      },
      (workoutState) => removeCardioBlock(workoutState, cardioLogId),
      'No fue posible eliminar el bloque de cardio',
    ),

  deleteMovementBlock: async (movementLogId) =>
    commitWorkoutMutation(
      set,
      get,
      async (workoutLogId) => {
        await trainingClient.delete<void>(`/workout-logs/${workoutLogId}/movement-blocks/${movementLogId}`);
        return null;
      },
      (workoutState) => removeMovementBlock(workoutState, movementLogId),
      'No fue posible eliminar el bloque de movimiento',
    ),

  closeWorkout: async () => {
    const { currentWorkout } = get();
    if (!currentWorkout) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await trainingClient.patch(`/workout-logs/${currentWorkout.workout_log.id}`, {
        status: 'completed',
      });

      set((state) => ({
        currentWorkout: null,
        isLoading: false,
        workoutLogsVersion: state.workoutLogsVersion + 1,
      }));

      return true;
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'No fue posible finalizar el entrenamiento',
      });
      return false;
    }
  },

  abandonWorkout: async (reason?: AbandonReason, notes?: string) => {
    const { currentWorkout } = get();
    if (!currentWorkout) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await trainingClient.patch(`/workout-logs/${currentWorkout.workout_log.id}`, {
        status: 'abandoned',
        abandon_reason: reason,
        abandon_notes: notes,
      });

      set((state) => ({
        currentWorkout: null,
        isLoading: false,
        workoutLogsVersion: state.workoutLogsVersion + 1,
      }));

      return true;
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'No fue posible abandonar el entrenamiento',
      });
      return false;
    }
  },

  dismissMissedWorkouts: () => {
    set({ missedWorkouts: [] });
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      dashboardBootstrap: null,
      currentWorkout: null,
      missedWorkouts: [],
      dashboardDataVersion: 0,
      workoutLogsVersion: 0,
      isLoading: false,
      isStartingWorkout: false,
      isSavingSet: false,
      isLoadingMissed: false,
      error: null,
    }),
}));
