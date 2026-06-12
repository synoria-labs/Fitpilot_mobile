import { trainingClient } from './api';
import type {
  DayTypeScopeKind,
  DayTypeSeriesDetail,
  DayTypeSeriesListResponse,
  ExerciseTrendDetail,
  Macrocycle,
  MacrocycleListResponse,
  WorkoutAnalyticsDashboard,
  WorkoutAnalyticsHistoryPage,
  WorkoutAnalyticsHistoryStatusFilter,
  WorkoutAnalyticsModules,
  WorkoutAnalyticsPreferences,
  WorkoutAnalyticsRange,
  WorkoutAnalyticsScopeKind,
} from '../types';

export const getWorkoutAnalyticsDashboard = (
  range: WorkoutAnalyticsRange,
  anchorDate?: string,
) =>
  trainingClient.get<WorkoutAnalyticsDashboard>('/workout-analytics/me/dashboard', {
    params: {
      range,
      ...(anchorDate ? { anchor_date: anchorDate } : {}),
    },
  });

export const getWorkoutAnalyticsModules = ({
  scopeKind,
  range,
  repBucketId,
  anchorDate,
  macrocycleId,
  mesocycleId,
  microcycleId,
}: {
  scopeKind: WorkoutAnalyticsScopeKind;
  range: WorkoutAnalyticsRange;
  repBucketId?: string | null;
  anchorDate?: string;
  macrocycleId?: string | null;
  mesocycleId?: string | null;
  microcycleId?: string | null;
}) =>
  trainingClient.get<WorkoutAnalyticsModules>('/workout-analytics/me/modules', {
    params: {
      scope_kind: scopeKind,
      ...(scopeKind === 'range' ? { range } : {}),
      ...(scopeKind === 'range' && repBucketId ? { rep_bucket_id: repBucketId } : {}),
      ...(anchorDate ? { anchor_date: anchorDate } : {}),
      ...(macrocycleId ? { macrocycle_id: macrocycleId } : {}),
      ...(mesocycleId ? { mesocycle_id: mesocycleId } : {}),
      ...(microcycleId ? { microcycle_id: microcycleId } : {}),
    },
  });

export const listWorkoutMacrocycles = ({
  skip = 0,
  limit = 100,
}: {
  skip?: number;
  limit?: number;
} = {}) =>
  trainingClient.get<MacrocycleListResponse>('/mesocycles', {
    params: {
      skip,
      limit,
    },
  });

export const getWorkoutMacrocycleDetail = (macrocycleId: string) =>
  trainingClient.get<Macrocycle>(`/mesocycles/${macrocycleId}`);

export const getWorkoutAnalyticsExerciseDetail = (
  exerciseId: string,
  range: WorkoutAnalyticsRange,
  anchorDate?: string,
  options?: {
    scopeKind?: WorkoutAnalyticsScopeKind;
    repBucketId?: string | null;
    macrocycleId?: string | null;
    mesocycleId?: string | null;
    microcycleId?: string | null;
  },
) =>
  trainingClient.get<ExerciseTrendDetail>(`/workout-analytics/me/exercises/${exerciseId}`, {
    params: {
      range,
      scope_kind: options?.scopeKind ?? 'range',
      ...(options?.scopeKind === 'range' && options?.repBucketId ? { rep_bucket_id: options.repBucketId } : {}),
      ...(anchorDate ? { anchor_date: anchorDate } : {}),
      ...(options?.macrocycleId ? { macrocycle_id: options.macrocycleId } : {}),
      ...(options?.mesocycleId ? { mesocycle_id: options.mesocycleId } : {}),
      ...(options?.microcycleId ? { microcycle_id: options.microcycleId } : {}),
    },
  });

export const getWorkoutAnalyticsPreferences = () =>
  trainingClient.get<WorkoutAnalyticsPreferences>('/workout-analytics/me/preferences');

export const getWorkoutAnalyticsHistory = ({
  scopeKind = 'range',
  range,
  repBucketId,
  status,
  skip = 0,
  limit = 20,
  anchorDate,
  macrocycleId,
  mesocycleId,
  microcycleId,
}: {
  scopeKind?: WorkoutAnalyticsScopeKind;
  range: WorkoutAnalyticsRange;
  repBucketId?: string | null;
  status: WorkoutAnalyticsHistoryStatusFilter;
  skip?: number;
  limit?: number;
  anchorDate?: string;
  macrocycleId?: string | null;
  mesocycleId?: string | null;
  microcycleId?: string | null;
}) =>
  trainingClient.get<WorkoutAnalyticsHistoryPage>('/workout-analytics/me/history', {
    params: {
      scope_kind: scopeKind,
      range,
      ...(scopeKind === 'range' && repBucketId ? { rep_bucket_id: repBucketId } : {}),
      status,
      skip,
      limit,
      ...(anchorDate ? { anchor_date: anchorDate } : {}),
      ...(macrocycleId ? { macrocycle_id: macrocycleId } : {}),
      ...(mesocycleId ? { mesocycle_id: mesocycleId } : {}),
      ...(microcycleId ? { microcycle_id: microcycleId } : {}),
    },
  });

export const updateWorkoutAnalyticsPreferences = (preferences: WorkoutAnalyticsPreferences) =>
  trainingClient.put<WorkoutAnalyticsPreferences>(
    '/workout-analytics/me/preferences',
    preferences,
  );

export const getDayTypeSeriesList = ({
  scopeKind = 'program',
  macrocycleId,
  mesocycleId,
}: {
  scopeKind?: DayTypeScopeKind;
  macrocycleId?: string | null;
  mesocycleId?: string | null;
} = {}) =>
  trainingClient.get<DayTypeSeriesListResponse>('/workout-analytics/me/day-types', {
    params: {
      scope_kind: scopeKind,
      ...(macrocycleId ? { macrocycle_id: macrocycleId } : {}),
      ...(mesocycleId ? { mesocycle_id: mesocycleId } : {}),
    },
  });

export const getDayTypeSeriesDetail = (
  dayType: string,
  {
    variant,
    limit,
    scopeKind = 'program',
    macrocycleId,
    mesocycleId,
  }: {
    variant?: string | null;
    limit?: number | null;
    scopeKind?: DayTypeScopeKind;
    macrocycleId?: string | null;
    mesocycleId?: string | null;
  } = {},
) =>
  trainingClient.get<DayTypeSeriesDetail>('/workout-analytics/me/day-types/series', {
    params: {
      day_type: dayType,
      scope_kind: scopeKind,
      ...(variant ? { variant } : {}),
      ...(limit ? { limit } : {}),
      ...(macrocycleId ? { macrocycle_id: macrocycleId } : {}),
      ...(mesocycleId ? { mesocycle_id: mesocycleId } : {}),
    },
  });
