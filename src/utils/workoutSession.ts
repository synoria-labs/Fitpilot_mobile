import { getWorkoutSetTypeDefinition, validateSegmentedWeightFlow } from '../constants/workoutSetTypes';
import type {
  CardioBlockLog,
  CurrentWorkoutState,
  DayExercise,
  ExerciseProgress,
  MovementBlockLog,
  TrainingDay,
  WorkoutSetGroup,
  WorkoutSetSegmentInput,
} from '../types';
import {
  clampEffortValue,
  getCardioEffectiveSets,
  isCardioExercise,
  isMovementExercise,
  isPlyometricExercise,
  isEditableEffortType,
  isMobilityOrWarmupExercise,
  isTimedStrengthExercise,
  shouldShowStrengthEffort,
} from './formatters';

export type WorkoutSetSegmentDraft = {
  segment_index: number;
  reps_completed: number;
  /** Seconds held; set only for a strength exercise prescribed by time, which ignores reps. */
  duration_seconds: number | null;
  weight_kg: number;
  effort_value: number | null;
};

type SourceSegment = {
  segment_index?: number | null;
  reps_completed?: number | null;
  duration_seconds?: number | null;
  weight_kg?: number | null;
  effort_value?: number | null;
};

const getHoldSecondsDefault = (
  dayExercise: DayExercise | undefined,
  sourceSegment?: SourceSegment | null,
): number | null =>
  isTimedStrengthExercise(dayExercise)
    ? (sourceSegment?.duration_seconds ?? dayExercise?.duration_seconds ?? null)
    : null;

export type WorkoutExecutionKey = {
  dayExerciseId: string;
  setNumber: number;
};

type WorkoutExecutionDraftBase = {
  key: WorkoutExecutionKey;
  currentExerciseIndex: number;
  currentSetNumber: number;
  restSeconds: number;
};

export type StrengthExecutionDraft = WorkoutExecutionDraftBase & {
  kind: 'strength';
  currentSegments: WorkoutSetSegmentDraft[];
};

export type CardioExecutionDraft = WorkoutExecutionDraftBase & {
  kind: 'cardio';
  durationSeconds: number;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  effortValue: number | null;
};

export type MovementExecutionDraft = WorkoutExecutionDraftBase & {
  kind: 'movement';
  durationSeconds: number | null;
  contactsCompleted: number | null;
  heightCm: number | null;
  distanceCm: number | null;
  metricType: 'height_cm' | 'distance_cm' | null;
};

export type WorkoutExecutionDraft = StrengthExecutionDraft | CardioExecutionDraft | MovementExecutionDraft;

type StrengthDraftValues = {
  currentSegments: WorkoutSetSegmentDraft[];
  restSeconds: number;
};

type CardioDraftValues = {
  durationSeconds: number;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  effortValue: number | null;
  restSeconds: number;
};

type MovementDraftValues = {
  durationSeconds: number | null;
  contactsCompleted: number | null;
  heightCm: number | null;
  distanceCm: number | null;
  metricType: 'height_cm' | 'distance_cm' | null;
  restSeconds: number;
};

export type WorkoutExecutionDraftOptions = {
  strengthPrefillStrategy?: 'none' | 'previousCompletedSet';
};

export type WorkoutCardioBlockInput = {
  dayExerciseId: string;
  setNumber: number;
  durationSeconds: number;
  caloriesBurned?: number | null;
  distanceMeters?: number | null;
  effortValue?: number | null;
};

export type WorkoutMovementBlockInput = {
  dayExerciseId: string;
  setNumber: number;
  durationSeconds?: number | null;
  contactsCompleted?: number | null;
  heightCm?: number | null;
  distanceCm?: number | null;
};

export type WorkoutExecutionTarget = {
  dayExerciseId?: string;
  exerciseIndex?: number;
  setNumber?: number;
};

const getPlannedCardioDurationSeconds = (dayExercise: DayExercise | undefined): number => {
  if (!dayExercise) {
    return 60;
  }

  if (dayExercise.duration_seconds != null && dayExercise.duration_seconds > 0) {
    return dayExercise.duration_seconds;
  }

  if ((dayExercise.intervals ?? 0) > 0 && (dayExercise.work_seconds ?? 0) > 0) {
    return (dayExercise.intervals ?? 0) * (dayExercise.work_seconds ?? 0);
  }

  return 60;
};

const getPlannedMovementDurationSeconds = (dayExercise: DayExercise | undefined): number | null => {
  if (!dayExercise || !isMobilityOrWarmupExercise(dayExercise)) {
    return null;
  }

  if (dayExercise.duration_seconds != null && dayExercise.duration_seconds > 0) {
    return dayExercise.duration_seconds;
  }

  return null;
};

export const isStrengthExecutionDraft = (
  draft: WorkoutExecutionDraft | null | undefined,
): draft is StrengthExecutionDraft => draft?.kind === 'strength';

export const isCardioExecutionDraft = (
  draft: WorkoutExecutionDraft | null | undefined,
): draft is CardioExecutionDraft => draft?.kind === 'cardio';

export const isMovementExecutionDraft = (
  draft: WorkoutExecutionDraft | null | undefined,
): draft is MovementExecutionDraft => draft?.kind === 'movement';

export const getExecutionKeyString = (key: WorkoutExecutionKey) => `${key.dayExerciseId}:${key.setNumber}`;

export const getExerciseEffortDefault = (dayExercise?: DayExercise): number | null => {
  if (!shouldShowStrengthEffort(dayExercise) || dayExercise?.effort_value == null) {
    return null;
  }

  if (isEditableEffortType(dayExercise.effort_type)) {
    return clampEffortValue(dayExercise.effort_value);
  }

  return dayExercise.effort_value;
};

export const getDayExerciseByProgress = (
  trainingDay: TrainingDay | null | undefined,
  progress?: ExerciseProgress,
): DayExercise | undefined =>
  trainingDay?.exercises.find((exercise) => exercise.id === progress?.day_exercise_id);

export const findExerciseIndexByDayExerciseId = (
  workoutState: CurrentWorkoutState,
  dayExerciseId: string,
) => workoutState.exercises_progress.findIndex((exercise) => exercise.day_exercise_id === dayExerciseId);

export const getExerciseTargetSetNumber = (
  dayExercise?: DayExercise,
  _progress?: ExerciseProgress,
  targetSetNumber?: number,
) => {
  const maxSets = dayExercise && isCardioExercise(dayExercise)
    ? getCardioEffectiveSets(dayExercise)
    : (dayExercise?.sets || 1);
  if (targetSetNumber != null) {
    return Math.max(1, Math.min(targetSetNumber, maxSets));
  }

  return 1;
};

const cloneSegmentDraft = (segment: WorkoutSetSegmentDraft, segmentIndex: number): WorkoutSetSegmentDraft => ({
  segment_index: segmentIndex,
  reps_completed: segment.reps_completed,
  duration_seconds: segment.duration_seconds,
  weight_kg: segment.weight_kg,
  effort_value: segment.effort_value,
});

const buildBaseSegmentDraft = (
  dayExercise?: DayExercise,
  sourceSegment?: SourceSegment | null,
  suggestedWeightKg?: number | null,
): WorkoutSetSegmentDraft => ({
  segment_index: 1,
  reps_completed: sourceSegment?.reps_completed ?? (dayExercise?.reps_min ?? 12),
  duration_seconds: getHoldSecondsDefault(dayExercise, sourceSegment),
  weight_kg: sourceSegment?.weight_kg ?? suggestedWeightKg ?? 0,
  effort_value: sourceSegment?.effort_value ?? getExerciseEffortDefault(dayExercise),
});

const getAdaptiveSuggestedWeight = (
  dayExercise?: DayExercise,
  targetSetNumber: number = 1,
): number | null => {
  const guidance = dayExercise?.adaptive_guidance;
  if (!guidance?.applies_on_first_exposure_only || targetSetNumber !== 1) {
    return null;
  }

  return guidance.suggested_start_weight_kg ?? null;
};

const normalizeSegmentDrafts = (
  dayExercise: DayExercise | undefined,
  sourceSegments?: readonly SourceSegment[] | null,
): WorkoutSetSegmentDraft[] => {
  const { captureMode, minimumSegments } = getWorkoutSetTypeDefinition(dayExercise?.set_type);
  let normalizedSegments = (sourceSegments ?? [])
    .slice()
    .sort((left, right) => (left.segment_index ?? 1) - (right.segment_index ?? 1))
    .map((segment, index) => ({
      segment_index: index + 1,
      reps_completed: segment.reps_completed ?? (dayExercise?.reps_min ?? 12),
      duration_seconds: getHoldSecondsDefault(dayExercise, segment),
      weight_kg: segment.weight_kg ?? 0,
      effort_value: segment.effort_value ?? getExerciseEffortDefault(dayExercise),
    }));

  if (!normalizedSegments.length) {
    normalizedSegments = [buildBaseSegmentDraft(dayExercise)];
  }

  if (captureMode === 'single') {
    return [cloneSegmentDraft(normalizedSegments[0], 1)];
  }

  while (normalizedSegments.length < minimumSegments) {
    normalizedSegments.push(
      cloneSegmentDraft(
        normalizedSegments[normalizedSegments.length - 1] ?? buildBaseSegmentDraft(dayExercise),
        normalizedSegments.length + 1,
      ),
    );
  }

  return normalizedSegments.map((segment, index) => cloneSegmentDraft(segment, index + 1));
};

const getPreviousCompletedSet = (
  progress: ExerciseProgress | undefined,
  targetSetNumber: number,
): WorkoutSetGroup | undefined =>
  (progress?.sets_data ?? []).reduce<WorkoutSetGroup | undefined>((closestSet, setGroup) => {
    if (
      setGroup.set_number >= targetSetNumber ||
      (setGroup.segments?.length ?? 0) === 0
    ) {
      return closestSet;
    }

    if (!closestSet || setGroup.set_number > closestSet.set_number) {
      return setGroup;
    }

    return closestSet;
  }, undefined);

export const getStrengthDraftValues = (
  dayExercise?: DayExercise,
  progress?: ExerciseProgress,
  targetSetNumber?: number,
  options?: WorkoutExecutionDraftOptions,
): StrengthDraftValues => {
  const preferredSet = targetSetNumber
    ? progress?.sets_data?.find((setGroup) => setGroup.set_number === targetSetNumber)
    : undefined;
  const shouldPrefillFromPreviousCompletedSet =
    options?.strengthPrefillStrategy === 'previousCompletedSet' &&
    !preferredSet &&
    (targetSetNumber ?? 1) > 1;
  const previousCompletedSet = shouldPrefillFromPreviousCompletedSet && targetSetNumber
    ? getPreviousCompletedSet(progress, targetSetNumber)
    : undefined;
  const adaptiveSuggestedWeight = !preferredSet && !previousCompletedSet
    ? getAdaptiveSuggestedWeight(dayExercise, targetSetNumber ?? 1)
    : null;
  const templateSegments = preferredSet?.segments
    ?? previousCompletedSet?.segments
    ?? (adaptiveSuggestedWeight != null ? [{ weight_kg: adaptiveSuggestedWeight }] : null);
  const currentSegments = normalizeSegmentDrafts(dayExercise, templateSegments);

  return {
    currentSegments,
    restSeconds: dayExercise?.interval_rest_seconds || dayExercise?.rest_seconds || 90,
  };
};

export const getCardioDraftValues = (
  dayExercise?: DayExercise,
  progress?: ExerciseProgress,
  targetSetNumber?: number,
): CardioDraftValues => {
  const cardioBlock = targetSetNumber ? getCardioBlockByNumber(progress, targetSetNumber) : undefined;

  return {
    durationSeconds: Math.max(
      1,
      Math.round(cardioBlock?.duration_seconds ?? getPlannedCardioDurationSeconds(dayExercise)),
    ),
    caloriesBurned: cardioBlock?.calories_burned ?? dayExercise?.target_calories ?? null,
    distanceMeters: cardioBlock?.distance_meters ?? dayExercise?.distance_meters ?? null,
    effortValue: cardioBlock?.effort_value ?? dayExercise?.effort_value ?? null,
    restSeconds: dayExercise?.interval_rest_seconds || dayExercise?.rest_seconds || 90,
  };
};

export const getMovementDraftValues = (
  dayExercise?: DayExercise,
  progress?: ExerciseProgress,
  targetSetNumber?: number,
): MovementDraftValues => {
  const movementBlock = targetSetNumber ? getMovementBlockByNumber(progress, targetSetNumber) : undefined;
  const metricType = isPlyometricExercise(dayExercise)
    ? (dayExercise?.plyometric_metric_type ?? 'height_cm')
    : null;

  if (isPlyometricExercise(dayExercise)) {
    return {
      durationSeconds: null,
      contactsCompleted: movementBlock?.contacts_completed ?? dayExercise?.reps_min ?? 8,
      heightCm: movementBlock?.height_cm ?? null,
      distanceCm: movementBlock?.distance_cm ?? null,
      metricType,
      restSeconds: dayExercise?.interval_rest_seconds || dayExercise?.rest_seconds || 90,
    };
  }

  return {
    durationSeconds: movementBlock?.duration_seconds ?? getPlannedMovementDurationSeconds(dayExercise),
    contactsCompleted: null,
    heightCm: null,
    distanceCm: null,
    metricType: null,
    restSeconds: dayExercise?.interval_rest_seconds || dayExercise?.rest_seconds || 60,
  };
};

export const createWorkoutExecutionDraft = (
  workoutState: CurrentWorkoutState,
  target?: WorkoutExecutionTarget,
  options?: WorkoutExecutionDraftOptions,
): WorkoutExecutionDraft | null => {
  const safeIndex = target?.dayExerciseId
    ? findExerciseIndexByDayExerciseId(workoutState, target.dayExerciseId)
    : (target?.exerciseIndex ?? workoutState.exercises_progress.findIndex((exercise) => !exercise.is_completed));
  const currentExerciseIndex = Math.max(
    0,
    Math.min(
      safeIndex < 0 ? 0 : safeIndex,
      Math.max(workoutState.exercises_progress.length - 1, 0),
    ),
  );

  const currentProgress = workoutState.exercises_progress[currentExerciseIndex];
  if (!currentProgress) {
    return null;
  }

  const dayExercise = getDayExerciseByProgress(workoutState.training_day, currentProgress);
  if (!dayExercise) {
    return null;
  }

  const currentSetNumber = getExerciseTargetSetNumber(dayExercise, currentProgress, target?.setNumber);
  const key = {
    dayExerciseId: currentProgress.day_exercise_id,
    setNumber: currentSetNumber,
  };

  if (isMovementExercise(dayExercise)) {
    const movementDefaults = getMovementDraftValues(dayExercise, currentProgress, currentSetNumber);
    return {
      kind: 'movement',
      key,
      currentExerciseIndex,
      currentSetNumber,
      restSeconds: movementDefaults.restSeconds,
      durationSeconds: movementDefaults.durationSeconds,
      contactsCompleted: movementDefaults.contactsCompleted,
      heightCm: movementDefaults.heightCm,
      distanceCm: movementDefaults.distanceCm,
      metricType: movementDefaults.metricType,
    };
  }

  if (isCardioExercise(dayExercise)) {
    const cardioDefaults = getCardioDraftValues(dayExercise, currentProgress, currentSetNumber);
    return {
      kind: 'cardio',
      key,
      currentExerciseIndex,
      currentSetNumber,
      restSeconds: cardioDefaults.restSeconds,
      durationSeconds: cardioDefaults.durationSeconds,
      caloriesBurned: cardioDefaults.caloriesBurned,
      distanceMeters: cardioDefaults.distanceMeters,
      effortValue: cardioDefaults.effortValue,
    };
  }

  const strengthDefaults = getStrengthDraftValues(
    dayExercise,
    currentProgress,
    currentSetNumber,
    options,
  );
  return {
    kind: 'strength',
    key,
    currentExerciseIndex,
    currentSetNumber,
    restSeconds: strengthDefaults.restSeconds,
    currentSegments: strengthDefaults.currentSegments,
  };
};

export const hydrateWorkoutExecutionDraft = (
  workoutState: CurrentWorkoutState,
  draft: WorkoutExecutionDraft | null | undefined,
  options?: WorkoutExecutionDraftOptions,
): WorkoutExecutionDraft | null => {
  if (!draft) {
    return createWorkoutExecutionDraft(workoutState, undefined, options);
  }

  return createWorkoutExecutionDraft(
    workoutState,
    {
      dayExerciseId: draft.key.dayExerciseId,
      setNumber: draft.key.setNumber,
    },
    options,
  );
};

export const toWorkoutSetSegmentInputs = (segments: WorkoutSetSegmentDraft[]): WorkoutSetSegmentInput[] =>
  segments.map((segment, index) => ({
    segment_index: index + 1,
    // A hold records the seconds held and no repetitions.
    ...(segment.duration_seconds != null
      ? { duration_seconds: Math.max(1, Math.round(segment.duration_seconds)) }
      : { reps_completed: Math.max(0, Math.round(segment.reps_completed)) }),
    weight_kg: segment.weight_kg > 0 ? segment.weight_kg : 0,
    effort_value: segment.effort_value ?? undefined,
  }));

export const toWorkoutCardioBlockInput = (
  draft: CardioExecutionDraft,
): WorkoutCardioBlockInput => ({
  dayExerciseId: draft.key.dayExerciseId,
  setNumber: draft.key.setNumber,
  durationSeconds: Math.max(1, Math.round(draft.durationSeconds)),
  caloriesBurned: draft.caloriesBurned,
  distanceMeters: draft.distanceMeters,
  effortValue: draft.effortValue,
});

export const toWorkoutMovementBlockInput = (
  draft: MovementExecutionDraft,
): WorkoutMovementBlockInput => ({
  dayExerciseId: draft.key.dayExerciseId,
  setNumber: draft.key.setNumber,
  durationSeconds: draft.durationSeconds,
  contactsCompleted: draft.contactsCompleted,
  heightCm: draft.heightCm,
  distanceCm: draft.distanceCm,
});

export const createNextSegmentDraft = (
  dayExercise: DayExercise | undefined,
  currentSegments: WorkoutSetSegmentDraft[],
): WorkoutSetSegmentDraft => {
  const lastSegment = currentSegments[currentSegments.length - 1] ?? buildBaseSegmentDraft(dayExercise);
  return cloneSegmentDraft(lastSegment, currentSegments.length + 1);
};

export const normalizeWorkoutSetDraft = (
  dayExercise: DayExercise | undefined,
  segments: WorkoutSetSegmentDraft[],
): WorkoutSetSegmentDraft[] => normalizeSegmentDrafts(dayExercise, segments);

export const validateWorkoutSetDraft = (
  dayExercise: DayExercise | undefined,
  segments: WorkoutSetSegmentDraft[],
): string | null => {
  const definition = getWorkoutSetTypeDefinition(dayExercise?.set_type);
  if (segments.length < definition.minimumSegments) {
    return `Este tipo de serie requiere al menos ${definition.minimumSegments} segmentos.`;
  }

  return validateSegmentedWeightFlow(dayExercise?.set_type, toWorkoutSetSegmentInputs(segments));
};

export const getSetGroupByNumber = (
  progress: ExerciseProgress | undefined,
  setNumber: number,
): WorkoutSetGroup | undefined =>
  progress?.sets_data?.find((setGroup) => setGroup.set_number === setNumber);

export const getCardioBlockByNumber = (
  progress: ExerciseProgress | undefined,
  setNumber: number,
): CardioBlockLog | undefined =>
  progress?.cardio_blocks_data?.find((cardioBlock) => cardioBlock.set_number === setNumber);

export const getMovementBlockByNumber = (
  progress: ExerciseProgress | undefined,
  setNumber: number,
): MovementBlockLog | undefined =>
  progress?.movement_blocks_data?.find((movementBlock) => movementBlock.set_number === setNumber);

export const hasCompletedCardioExecution = (
  progress: ExerciseProgress | undefined,
  setNumber: number,
): boolean => {
  if (!progress) {
    return false;
  }

  if ((progress.cardio_blocks_data?.length ?? 0) > 0) {
    return (progress.cardio_blocks_data ?? []).some(
      (cardioBlock) => cardioBlock.set_number === setNumber,
    );
  }

  return (progress.sets_data ?? []).some((setGroup) => setGroup.set_number === setNumber);
};

export const hasCompletedMovementExecution = (
  progress: ExerciseProgress | undefined,
  setNumber: number,
): boolean =>
  (progress?.movement_blocks_data ?? []).some((movementBlock) => movementBlock.set_number === setNumber);

export const findNextIncompleteExerciseIndex = (
  exercisesProgress: ExerciseProgress[],
  currentIndex: number,
): number => {
  const count = exercisesProgress.length;
  if (count === 0) {
    return currentIndex;
  }

  for (let offset = 1; offset < count; offset += 1) {
    const candidateIndex = (currentIndex + offset) % count;
    if (!exercisesProgress[candidateIndex]?.is_completed) {
      return candidateIndex;
    }
  }

  return currentIndex;
};
