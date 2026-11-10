import { describe, expect, it } from 'vitest';
import type { DayExercise, ExerciseProgress } from '../types';
import { formatPrescribedEffort, getEffortSeed } from './formatters';
import { createNextSegmentDraft, getStrengthDraftValues } from './workoutSession';

const strengthExercise = (overrides: Partial<DayExercise> = {}): DayExercise => ({
  id: 'de-1',
  training_day_id: 'td-1',
  exercise_id: 'ex-1',
  exercise: { exercise_class: 'strength' } as DayExercise['exercise'],
  order_index: 0,
  phase: 'main',
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  rest_seconds: 90,
  effort_type: 'RIR',
  effort_value: 2,
  effort_value_min: 1,
  effort_value_max: 2,
  set_type: 'straight',
  ...overrides,
} as DayExercise);

const progressWithFirstSet = (effort: number | null): ExerciseProgress => ({
  day_exercise_id: 'de-1',
  exercise_name: 'Press',
  total_sets: 3,
  completed_sets: 1,
  is_completed: false,
  sets_data: [
    {
      day_exercise_id: 'de-1',
      set_number: 1,
      segment_count: 1,
      total_reps_completed: 10,
      segments: [
        {
          id: 'log-1',
          workout_log_id: 'wl-1',
          day_exercise_id: 'de-1',
          set_number: 1,
          segment_index: 1,
          reps_completed: 10,
          weight_kg: 60,
          effort_value: effort,
          completed_at: '2026-11-10T10:00:00Z',
        },
      ],
    },
  ],
} as ExerciseProgress);

describe('perceived effort is never prefilled', () => {
  it('starts a new set without effort, whatever the prescription', () => {
    const { currentSegments } = getStrengthDraftValues(strengthExercise(), undefined, 1);
    expect(currentSegments[0].effort_value).toBeNull();
    expect(currentSegments[0].reps_completed).toBe(8);
  });

  it('copies the load of the previous set but not how hard it felt', () => {
    const { currentSegments } = getStrengthDraftValues(strengthExercise(), progressWithFirstSet(1), 2, {
      strengthPrefillStrategy: 'previousCompletedSet',
    });
    expect(currentSegments[0].weight_kg).toBe(60);
    expect(currentSegments[0].effort_value).toBeNull();
  });

  it('keeps the logged effort when a set is reopened', () => {
    const { currentSegments } = getStrengthDraftValues(strengthExercise(), progressWithFirstSet(1), 1);
    expect(currentSegments[0].effort_value).toBe(1);
  });

  it('adds a segment without the effort of the previous one', () => {
    const next = createNextSegmentDraft(strengthExercise(), [
      { segment_index: 1, reps_completed: 8, duration_seconds: null, weight_kg: 60, effort_value: 0 },
    ]);
    expect(next.weight_kg).toBe(60);
    expect(next.effort_value).toBeNull();
  });
});

describe('prescribed effort', () => {
  it('shows the range as the target', () => {
    expect(formatPrescribedEffort(strengthExercise())).toBe('RIR 1–2');
    expect(formatPrescribedEffort(strengthExercise({ effort_value_min: 2, effort_value_max: 2 }))).toBe('RIR 2');
  });

  it('reads an exercise from an older backend as its fixed value', () => {
    expect(formatPrescribedEffort(strengthExercise({ effort_value_min: undefined, effort_value_max: undefined }))).toBe(
      'RIR 2',
    );
  });

  it('seeds the first tap on the edge of the target', () => {
    expect(getEffortSeed(strengthExercise(), 0.5)).toBe(2);
    expect(getEffortSeed(strengthExercise(), -0.5)).toBe(1);
  });
});
