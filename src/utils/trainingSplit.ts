import type {
  DashboardBootstrap,
  DayExercise,
  ExercisePhase,
  Macrocycle,
  Microcycle,
  MicrocycleSessionProgress,
  TrainingDay,
} from '../types';
import { getWorkoutSetTypeDefinition } from '../constants/workoutSetTypes';
import {
  formatDurationSeconds,
  getCardioEffectiveSets,
  getCardioSummaryLabel,
  getExerciseName,
  getMovementSummaryLabel,
  isCardioExercise,
  isMovementExercise,
  isTimedStrengthExercise,
} from './formatters';

export type SplitDayStatus = 'rest' | 'completed' | 'in_progress' | 'abandoned' | 'pending';

export interface SplitExerciseRow {
  id: string;
  order: number;
  name: string;
  prescription: string;
  setTypeShortLabel: string | null;
  phase: ExercisePhase;
  isCardio: boolean;
  isMovement: boolean;
}

export interface SplitDay {
  trainingDayId: string;
  dayNumber: number;
  sessionIndex: number;
  sessionLabel: string | null;
  date: string;
  name: string;
  focus: string | null;
  isRestDay: boolean;
  isToday: boolean;
  status: SplitDayStatus;
  workoutLogId: string | null;
  actionLabel: string;
  locked: boolean;
  exercises: SplitExerciseRow[];
  exerciseCount: number;
  totalSets: number;
}

export interface TrainingSplitView {
  microcycleId: string;
  microcycleName: string | null;
  weekNumber: number | null;
  startDate: string | null;
  endDate: string | null;
  days: SplitDay[];
  trainingDayCount: number;
  completedCount: number;
  totalExercises: number;
  totalSets: number;
}

/**
 * Locate the microcycle that the dashboard considers "current" inside the full
 * macrocycle tree. The id comes from the bootstrap (microcycle_progress) and is
 * the authoritative anchor for "the current microcycle's days" — NOT a calendar
 * week, since a microcycle can span more than 7 days.
 */
export const findMicrocycleById = (
  macrocycle: Macrocycle | null | undefined,
  microcycleId: string | null | undefined,
): Microcycle | null => {
  if (!macrocycle || !microcycleId) {
    return null;
  }

  for (const mesocycle of macrocycle.mesocycles ?? []) {
    for (const microcycle of mesocycle.microcycles ?? []) {
      if (microcycle.id === microcycleId) {
        return microcycle;
      }
    }
  }

  return null;
};

/**
 * Build a lookup of live session status keyed by training_day_id. Rescheduled
 * sessions can appear under both their planned date and performed date in
 * microcycle_progress.days, so the same id may be seen twice — last write wins
 * (the objects are identical, so this is harmless).
 */
export const buildSessionStatusMap = (
  bootstrap: DashboardBootstrap | null | undefined,
): Map<string, MicrocycleSessionProgress> => {
  const map = new Map<string, MicrocycleSessionProgress>();
  for (const day of bootstrap?.microcycle_progress?.days ?? []) {
    for (const session of day.sessions ?? []) {
      map.set(session.training_day_id, session);
    }
  }
  return map;
};

const formatRepRange = (repsMin: number | null, repsMax: number | null): string | null => {
  if (repsMin != null && repsMax != null) {
    return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
  }
  if (repsMin != null) {
    return `${repsMin}`;
  }
  if (repsMax != null) {
    return `${repsMax}`;
  }
  return null;
};

const formatSetsLabel = (sets: number): string => `${sets} ${sets === 1 ? 'serie' : 'series'}`;

/**
 * Human-readable prescription for one planned exercise. Strength shows
 * "sets × reps"; cardio and movement use their own summaries (never sets×reps).
 */
export const formatExercisePrescription = (exercise: DayExercise): string => {
  if (isCardioExercise(exercise)) {
    const blocks = getCardioEffectiveSets(exercise);
    const summary = getCardioSummaryLabel(exercise);
    return blocks > 1 ? `${blocks} × ${summary}` : summary;
  }

  if (isMovementExercise(exercise)) {
    const summary = getMovementSummaryLabel(exercise);
    const sets = exercise.sets ?? 0;
    return sets > 1 ? `${sets} × ${summary}` : summary;
  }

  if (isTimedStrengthExercise(exercise)) {
    return `${exercise.sets} × ${formatDurationSeconds(exercise.duration_seconds ?? 0)}`;
  }

  const reps = formatRepRange(exercise.reps_min, exercise.reps_max);
  return reps ? `${exercise.sets} × ${reps}` : formatSetsLabel(exercise.sets);
};

const buildExerciseRow = (exercise: DayExercise): SplitExerciseRow => {
  const isCardio = isCardioExercise(exercise);
  const isMovement = !isCardio && isMovementExercise(exercise);
  const setTypeShortLabel =
    !isCardio && !isMovement && exercise.set_type && exercise.set_type !== 'straight'
      ? getWorkoutSetTypeDefinition(exercise.set_type).shortLabel
      : null;

  return {
    id: exercise.id,
    order: exercise.order_index,
    name: exercise.exercise ? getExerciseName(exercise.exercise) : 'Ejercicio',
    prescription: formatExercisePrescription(exercise),
    setTypeShortLabel,
    phase: exercise.phase,
    isCardio,
    isMovement,
  };
};

const getDayStatus = (
  trainingDay: TrainingDay,
  session: MicrocycleSessionProgress | undefined,
): SplitDayStatus => {
  if (trainingDay.rest_day) {
    return 'rest';
  }
  switch (session?.actual_status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'abandoned':
      return 'abandoned';
    default:
      return 'pending';
  }
};

/**
 * Capitalized action label for the day's primary button. Mirrors the semantics
 * of programTimeline.getSessionActionLabel but with the casing this screen uses.
 */
const getDayActionLabel = (
  status: SplitDayStatus,
  session: MicrocycleSessionProgress | undefined,
): string => {
  if (status === 'completed') {
    return 'Ver registro';
  }
  if (status === 'abandoned') {
    return 'Retomar';
  }
  if (status === 'in_progress' || session?.workout_log_id) {
    return 'Continuar';
  }
  return 'Empezar';
};

const sortTrainingDays = (days: TrainingDay[]): TrainingDay[] =>
  days
    .slice()
    .sort((left, right) =>
      left.day_number !== right.day_number
        ? left.day_number - right.day_number
        : left.session_index - right.session_index,
    );

const sortExercises = (exercises: DayExercise[]): DayExercise[] =>
  exercises.slice().sort((left, right) => left.order_index - right.order_index);

/**
 * Assemble the full split view-model for the current microcycle. Renders EVERY
 * training day (all session variants such as Push A / Push B / Push C, double
 * sessions, and rest days) regardless of how many calendar weeks the microcycle
 * spans. Returns null when there is no resolvable current microcycle.
 */
export const buildTrainingSplitView = (
  bootstrap: DashboardBootstrap | null | undefined,
  macrocycle: Macrocycle | null | undefined,
  todayDateKey: string,
  actionableTrainingDayId: string | null = null,
): TrainingSplitView | null => {
  const microcycleId = bootstrap?.microcycle_progress?.microcycle_id ?? null;
  const microcycle = findMicrocycleById(macrocycle, microcycleId);

  if (!microcycle || !microcycleId) {
    return null;
  }

  const sessionByTrainingDayId = buildSessionStatusMap(bootstrap);

  const days: SplitDay[] = sortTrainingDays(microcycle.training_days ?? []).map((trainingDay) => {
    const session = sessionByTrainingDayId.get(trainingDay.id);
    const status = getDayStatus(trainingDay, session);
    const actionLabel = getDayActionLabel(status, session);
    // Cola estricta: solo el frente de cola (actionableTrainingDayId) puede
    // iniciarse en frío. Si el frente vive en un microciclo previo (no está en
    // este split), todos los "Empezar" quedan bloqueados.
    const locked =
      actionLabel === 'Empezar' &&
      actionableTrainingDayId != null &&
      trainingDay.id !== actionableTrainingDayId;
    const exercises = trainingDay.rest_day
      ? []
      : sortExercises(trainingDay.exercises ?? []).map(buildExerciseRow);
    const totalSets = (trainingDay.exercises ?? []).reduce(
      (sum, exercise) => sum + (exercise.sets ?? 0),
      0,
    );

    return {
      trainingDayId: trainingDay.id,
      dayNumber: trainingDay.day_number,
      sessionIndex: trainingDay.session_index,
      sessionLabel: trainingDay.session_label ?? null,
      date: trainingDay.date,
      name: trainingDay.name,
      focus: trainingDay.focus ?? null,
      isRestDay: trainingDay.rest_day,
      isToday: trainingDay.date === todayDateKey,
      status,
      workoutLogId: session?.workout_log_id ?? null,
      actionLabel,
      locked,
      exercises,
      exerciseCount: exercises.length,
      totalSets,
    };
  });

  const trainingDays = days.filter((day) => !day.isRestDay);

  return {
    microcycleId,
    microcycleName: microcycle.name ?? bootstrap?.microcycle_progress?.microcycle_name ?? null,
    weekNumber: microcycle.week_number ?? null,
    startDate: microcycle.start_date ?? bootstrap?.microcycle_progress?.start_date ?? null,
    endDate: microcycle.end_date ?? bootstrap?.microcycle_progress?.end_date ?? null,
    days,
    trainingDayCount: trainingDays.length,
    completedCount: trainingDays.filter((day) => day.status === 'completed').length,
    totalExercises: trainingDays.reduce((sum, day) => sum + day.exerciseCount, 0),
    totalSets: trainingDays.reduce((sum, day) => sum + day.totalSets, 0),
  };
};
