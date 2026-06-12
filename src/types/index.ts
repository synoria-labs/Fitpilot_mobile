// User types
export type UserRole = 'admin' | 'trainer' | 'client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  phoneNumber: string | null;
  isPhoneVerified: boolean;
  onboardingStatus: string | null;
  connectedHealthSetupStatus: string | null;
  profilePictureUrl: string | null;
  professionalRoles: string[];
  currentSubscription: Record<string, unknown> | null;
  hasSubscription: boolean;
  hasActiveSubscription: boolean;
  subscriptionVigency: Record<string, unknown> | null;
}

export interface NutritionAuthUserResponse {
  id: string | number;
  email: string;
  name?: string | null;
  lastname?: string | null;
  role: string;
  phone_number?: string | null;
  is_phone_verified?: boolean;
  onboarding_status?: string | null;
  connected_health_setup_status?: string | null;
  profile_picture?: string | null;
  professional_role?: string[] | string | null;
  current_subscription?: Record<string, unknown> | null;
  has_subscription?: boolean;
  has_active_subscription?: boolean;
  subscription_vigency?: Record<string, unknown> | null;
}

export interface Citation {
  sortOrder: number;
  title: string;
  url: string;
  publisher?: string | null;
}

export interface ClientDietExchangeSystem {
  id: number;
  name: string;
  countryCode?: string | null;
  citations: Citation[];
}

export interface LoginCredentials {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export type LoginResult =
  | { status: 'success' }
  | { status: 'captcha_required' }
  | { status: 'failure' };

export interface UpdateCurrentUserPayload {
  name?: string;
  lastname?: string;
  phone_number?: string;
  onboarding_status?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ApiMessageResponse {
  message: string;
  sessions_closed?: number;
}

// Training hierarchy types
export type MesocycleStatus = 'draft' | 'active' | 'completed' | 'archived';
export type IntensityLevel = 'low' | 'medium' | 'high' | 'deload';
export type EffortType = 'RIR' | 'RPE' | 'percentage';
export type ExercisePhase = 'warmup' | 'main' | 'cooldown';
export type ExerciseClass =
  | 'strength'
  | 'cardio'
  | 'plyometric'
  | 'flexibility'
  | 'mobility'
  | 'warmup'
  | 'conditioning'
  | 'balance';
export type CardioSubclass = 'liss' | 'hiit' | 'miss';
export type PlyometricMetricType = 'height_cm' | 'distance_cm';
export type ExerciseType = 'multiarticular' | 'monoarticular';
export type ResistanceProfile = 'ascending' | 'descending' | 'flat' | 'bell_shaped';
export type AdaptiveGuidanceAction = 'increase' | 'maintain' | 'decrease';
export type AdaptiveContextPhase = 'bulk' | 'cut' | 'maintenance';

export interface AdaptiveGuidance {
  strategy: 'double_progression';
  recommended_action: AdaptiveGuidanceAction;
  suggested_start_weight_kg?: number | null;
  delta_kg?: number | null;
  reason_code: string;
  reason_text: string;
  applies_on_first_exposure_only: boolean;
}

export interface MacrocycleAdaptiveConfig {
  generation_strategy: string;
  planned_total_weeks: number;
  planned_total_days: number;
  generated_microcycles: number;
  generated_blocks: number;
  decision_block_microcycles: number;
  context_phase: AdaptiveContextPhase;
  goal_profile_version: string;
  last_completed_microcycle: number;
}

export interface ExerciseMechanics {
  type: ExerciseType;
  resistance_profile: ResistanceProfile;
}

export interface Exercise {
  id: string;
  name_en: string;
  name_es?: string | null;
  description_en?: string | null;
  description_es?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  image_url?: string | null;
  anatomy_image_url?: string | null;
  equipment_needed?: string | null;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | null;
  mechanics?: ExerciseMechanics | null;
  exercise_class?: ExerciseClass | null;
}

export type ExerciseMedia = Pick<Exercise, 'video_url' | 'thumbnail_url' | 'image_url' | 'anatomy_image_url'>;

export interface DayExercise {
  id: string;
  training_day_id: string;
  exercise_id: string;
  exercise?: Exercise;
  order_index: number;
  phase: ExercisePhase;
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  rest_seconds: number;
  effort_type: EffortType;
  effort_value: number;
  tempo?: string | null;
  set_type?: WorkoutSetType | null;
  cardio_subclass?: CardioSubclass | null;
  duration_seconds?: number | null;
  intensity_zone?: number | null;
  distance_meters?: number | null;
  target_calories?: number | null;
  intervals?: number | null;
  work_seconds?: number | null;
  interval_rest_seconds?: number | null;
  plyometric_metric_type?: PlyometricMetricType | null;
  analytics_profile_override?: string | null;
  adaptive_guidance?: AdaptiveGuidance | null;
  notes?: string | null;
}

export interface TrainingDay {
  id: string;
  microcycle_id: string;
  day_number: number;
  date: string;
  session_index: number;
  session_label?: string | null;
  name: string;
  focus?: string | null;
  rest_day: boolean;
  notes?: string | null;
  exercises: DayExercise[];
}

export interface Microcycle {
  id: string;
  mesocycle_id: string;
  week_number: number;
  name: string;
  start_date: string;
  end_date: string;
  intensity_level: IntensityLevel;
  training_days: TrainingDay[];
}

export interface Mesocycle {
  id: string;
  macrocycle_id: string;
  block_number: number;
  name: string;
  start_date: string;
  end_date: string;
  focus?: string | null;
  microcycles: Microcycle[];
}

export interface Macrocycle {
  id: string;
  name: string;
  description?: string | null;
  objective: string;
  status: MesocycleStatus;
  client_id?: string | null;
  trainer_id: string;
  start_date: string;
  end_date: string;
  adaptive_config?: MacrocycleAdaptiveConfig | null;
  mesocycles: Mesocycle[];
}

export interface MacrocycleListItem {
  id: string;
  name: string;
  description?: string | null;
  objective: string;
  status: MesocycleStatus;
  client_id?: string | null;
  trainer_id: string;
  start_date: string;
  end_date: string;
  mesocycles_count: number;
  created_at: string;
  updated_at: string;
}

export interface MacrocycleListResponse {
  total: number;
  macrocycles: MacrocycleListItem[];
}

// Workout tracking types
export type WorkoutStatus = 'in_progress' | 'completed' | 'abandoned';
export type WorkoutScreenMode = 'review' | 'live' | 'historicalEdit';
export type AbandonReason = 'time' | 'injury' | 'fatigue' | 'motivation' | 'schedule' | 'other';
export type WorkoutSetType =
  | 'straight'
  | 'rest_pause'
  | 'drop_set'
  | 'top_set'
  | 'backoff'
  | 'myo_reps'
  | 'cluster';

export interface ExerciseSetLog {
  id: string;
  workout_log_id: string;
  day_exercise_id: string;
  set_number: number;
  segment_index: number;
  reps_completed: number;
  weight_kg?: number | null;
  effort_value?: number | null;
  completed_at: string;
}

export interface WorkoutSetGroup {
  day_exercise_id: string;
  set_number: number;
  segment_count: number;
  total_reps_completed: number;
  best_weight_kg?: number | null;
  completed_at?: string | null;
  segments: ExerciseSetLog[];
}

export interface CardioBlockLog {
  id: string;
  workout_log_id: string;
  day_exercise_id: string;
  set_number: number;
  duration_seconds: number;
  calories_burned?: number | null;
  distance_meters?: number | null;
  effort_value?: number | null;
  completed_at?: string | null;
}

export interface MovementBlockLog {
  id: string;
  workout_log_id: string;
  day_exercise_id: string;
  set_number: number;
  duration_seconds?: number | null;
  contacts_completed?: number | null;
  height_cm?: number | null;
  distance_cm?: number | null;
  completed_at?: string | null;
}

export interface WorkoutSetSegmentInput {
  segment_index: number;
  reps_completed: number;
  weight_kg?: number | null;
  effort_value?: number | null;
}

export interface WorkoutLog {
  id: string;
  client_id: string;
  training_day_id: string;
  started_at: string;
  completed_at?: string | null;
  performed_on_date: string;
  is_authoritative: boolean;
  status: WorkoutStatus;
  notes?: string | null;
  abandon_reason?: AbandonReason | null;
  abandon_notes?: string | null;
  rescheduled_to_date?: string | null;
  exercise_sets: ExerciseSetLog[];
  cardio_blocks: CardioBlockLog[];
  movement_blocks: MovementBlockLog[];
}

// Missed workout types
export interface MissedWorkout {
  training_day_id: string;
  training_day_name: string;
  scheduled_date: string;
  days_overdue: number;
  status: 'never_started' | 'abandoned';
  abandon_reason?: AbandonReason | null;
  can_reschedule: boolean;
  training_day_focus?: string | null;
  exercises_count?: number;
}

export interface ExerciseProgress {
  day_exercise_id: string;
  exercise_name: string;
  total_sets: number;
  completed_sets: number;
  is_completed: boolean;
  sets_data: WorkoutSetGroup[];
  cardio_blocks_data: CardioBlockLog[];
  movement_blocks_data: MovementBlockLog[];
}

export interface CurrentWorkoutState {
  workout_log: WorkoutLog;
  training_day: TrainingDay;
  training_day_name: string;
  training_day_focus?: string | null;
  total_exercises: number;
  completed_exercises: number;
  exercises_progress: ExerciseProgress[];
}

// Next Workout (Sistema Secuencial)
export interface NextWorkoutTrainingDay {
  id: string;
  microcycle_id: string;
  date: string;
  session_index: number;
  session_label?: string | null;
  name: string;
  focus?: string | null;
  day_number: number;
  rest_day: boolean;
}

export type NextWorkoutReason =
  | 'no_active_macrocycle'
  | 'no_training_days'
  | 'all_completed';

export interface NextWorkoutResponse {
  training_day: NextWorkoutTrainingDay | null;
  position: number | null;  // Posición actual (ej: 5 de 24)
  total: number | null;     // Total de entrenamientos en el programa
  all_completed: boolean;   // True si completó todo el programa
  reason?: NextWorkoutReason | null;
}

export type PlannedSessionStatus = 'pending' | 'partial' | 'completed' | 'rest';
export type ActualSessionStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned';
export type MicrocycleMode = 'planned' | 'actual';

export interface MicrocycleSessionProgress {
  training_day_id: string;
  workout_log_id?: string | null;
  session_index: number;
  session_label?: string | null;
  name: string;
  focus?: string | null;
  planned_status: PlannedSessionStatus;
  actual_status: ActualSessionStatus;
  completion_percentage: number;
  performed_on_date?: string | null;
}

export interface MicrocycleDayProgress {
  date: string;
  day_number?: number | null;
  planned_sessions: number;
  completed_planned_sessions: number;
  actual_logs_count: number;
  has_partial_session: boolean;
  is_rest_day: boolean;
  is_planned_date: boolean;
  sessions: MicrocycleSessionProgress[];
}

export interface PlannedMicrocycleMetrics {
  total_planned_sessions: number;
  completed_planned_sessions: number;
  next_session_position?: number | null;
  completion_percentage: number;
}

export interface ActualMicrocycleMetrics {
  executed_sessions: number;
  active_days: number;
  double_session_days: number;
}

export interface MicrocycleProgress {
  microcycle_id?: string | null;
  microcycle_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_metrics: PlannedMicrocycleMetrics;
  actual_metrics: ActualMicrocycleMetrics;
  days: MicrocycleDayProgress[];
}

export interface DashboardProgramSummary {
  id: string;
  name: string;
  objective?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface DashboardTrainingDaySummary {
  id: string;
  date: string;
  session_index: number;
  session_label?: string | null;
  name: string;
  focus?: string | null;
  rest_day: boolean;
  total_sets: number;
  exercise_count: number;
}

export interface DashboardTimelineSession extends MicrocycleSessionProgress {
  position: number;
  total_sessions: number;
  scheduled_date_key: string;
  performed_date_key?: string | null;
  training_day: DashboardTrainingDaySummary;
}

export interface DashboardTimelineDay {
  date_key: string;
  is_in_program_range: boolean;
  has_rest_marker: boolean;
  sessions: DashboardTimelineSession[];
}

export interface DashboardActualAdherenceMetrics {
  on_schedule: number;
  rescheduled: number;
  overdue: number;
}

export interface DashboardTimeline {
  calendar_start_date_key: string;
  calendar_end_date_key: string;
  first_week_start_date_key: string;
  last_week_start_date_key: string;
  initial_focused_date_key: string;
  total_sessions: number;
  all_completed: boolean;
  actual_adherence_metrics: DashboardActualAdherenceMetrics;
  planned_days: DashboardTimelineDay[];
  actual_days: DashboardTimelineDay[];
}

export interface DashboardBootstrap {
  program?: DashboardProgramSummary | null;
  microcycle_progress: MicrocycleProgress;
  timeline?: DashboardTimeline | null;
}

export type AssignedProfessionalDomain = 'training' | 'nutrition';
export type AssignedProfessionalStatus = 'assigned' | 'unassigned';

export interface AssignedProfessionalSummary {
  id: string | null;
  fullName: string | null;
  roleLabel: string | null;
  avatarUrl: string | null;
  domain: AssignedProfessionalDomain;
  contextLabel: string | null;
  status: AssignedProfessionalStatus;
}

export type WorkoutAnalyticsRange = '2w' | '4w' | '8w' | '12w' | 'all';
export type WorkoutAnalyticsColorToken = 'navy' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';
export type WorkoutAnalyticsHistoryStatusFilter = 'all' | WorkoutStatus;
export type WorkoutAnalyticsCalendarWeekStatus = 'none' | WorkoutStatus;
export type ExerciseTrendStatus = 'rising' | 'stable' | 'declining' | 'insufficient';
export type WorkoutAnalyticsScopeKind = 'range' | 'microcycle' | 'mesocycle' | 'program';
export type WorkoutAnalyticsAvailability = 'available' | 'partial' | 'unavailable';
export type WorkoutAnalyticsOrigin = 'measured' | 'derived';
export type WorkoutAnalyticsTrendVariant = 'stacked_rep_ranges' | 'line';
export type WorkoutAnalyticsTrendSemanticKind = 'daily_session_comparison';
export type WorkoutSessionKind = 'strength' | 'cardio' | 'mixed';
export type ExerciseDetailMetric =
  | 'best_weight'
  | 'volume'
  | 'best_reps'
  | 'effort'
  | 'e1rm'
  | 'top_set_weight'
  | 'total_reps'
  | 'duration'
  | 'calories'
  | 'distance';
export type AnalyticsProfileId =
  | 'double_progression_hypertrophy'
  | 'percentage_1rm_strength'
  | 'rpe_strength'
  | 'bodyweight_progression'
  | 'cardio_progression';

export interface RepRangeBucket {
  id: string;
  label: string;
  min_reps: number;
  max_reps: number | null;
  color_token: WorkoutAnalyticsColorToken;
}

export interface WorkoutAnalyticsPreferences {
  rep_ranges: RepRangeBucket[];
}

export interface WorkoutAnalyticsSummary {
  total_sessions: number;
  sessions_in_range: number;
  active_days: number;
  total_volume_kg: number;
  avg_duration_minutes: number;
}

export interface RepRangeChartPoint {
  week_start: string;
  totals: Record<string, number>;
}

export interface WorkoutAnalyticsMetricContext {
  reps_exact: number;
  weight_kg?: number | null;
  rep_bucket_id?: string | null;
  rep_bucket_label?: string | null;
}

export interface ExerciseTrendSummary {
  exercise_id: string;
  exercise_name: string;
  sessions_count: number;
  last_performed_on?: string | null;
  latest_best_weight_kg?: number | null;
  best_weight_delta_kg?: number | null;
  sparkline_points: number[];
  trend_status?: ExerciseTrendStatus | null;
  best_recent_weight_kg?: number | null;
  total_volume_kg?: number | null;
  // Phase 2
  analytics_profile?: AnalyticsProfileId | null;
  primary_metric_value?: number | null;
  primary_metric_delta?: number | null;
  primary_metric_unit?: string | null;
  progress_score?: number | null;
  total_calories_burned?: number | null;
  total_distance_meters?: number | null;
  primary_metric_context?: WorkoutAnalyticsMetricContext | null;
  personal_best_context?: WorkoutAnalyticsMetricContext | null;
}

export interface RecentWorkoutHistoryItem {
  workout_log_id: string;
  training_day_name: string;
  performed_on_date: string;
  session_kind: WorkoutSessionKind;
  duration_minutes?: number | null;
  cardio_duration_minutes?: number | null;
  cardio_calories_burned?: number | null;
  cardio_distance_meters?: number | null;
  exercises_count: number;
  volume_kg: number;
  status: WorkoutStatus;
}

export interface WorkoutAnalyticsCalendarDay {
  date: string;
  status: WorkoutAnalyticsCalendarWeekStatus;
  sessions_count: number;
  is_today: boolean;
}

export interface WorkoutAnalyticsDashboard {
  summary: WorkoutAnalyticsSummary;
  calendar_week: WorkoutAnalyticsCalendarDay[];
  rep_range_chart: RepRangeChartPoint[];
  exercise_summaries: ExerciseTrendSummary[];
  recent_history: RecentWorkoutHistoryItem[];
  preferences: WorkoutAnalyticsPreferences;
}

export interface WorkoutAnalyticsContext {
  scope_kind: WorkoutAnalyticsScopeKind;
  title: string;
  subtitle: string;
  scope_label: string;
  empty_message?: string | null;
}

export interface WorkoutAnalyticsTimeScope {
  range_key?: WorkoutAnalyticsRange | null;
  anchor_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  label?: string | null;
}

export interface WorkoutAnalyticsProgramScope {
  macrocycle_id?: string | null;
  macrocycle_name?: string | null;
  objective?: string | null;
  mesocycle_id?: string | null;
  mesocycle_name?: string | null;
  block_number?: number | null;
  microcycle_id?: string | null;
  microcycle_name?: string | null;
  week_number?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface WorkoutAnalyticsMetricCard {
  id: string;
  label: string;
  value?: number | null;
  display_value: string;
  unit?: string | null;
  helper_text?: string | null;
  tone?: string | null;
}

export interface WorkoutAnalyticsSummaryCardsSection {
  kind: 'summary_cards';
  title: string;
  subtitle?: string | null;
  cards: WorkoutAnalyticsMetricCard[];
}

export interface WorkoutAnalyticsSnapshotSection {
  kind: 'snapshot';
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  metrics: WorkoutAnalyticsMetricCard[];
}

export interface WorkoutAnalyticsTrendLinePoint {
  label: string;
  value?: number | null;
  secondary_value?: number | null;
  tooltip_label?: string | null;
}

export interface WorkoutAnalyticsTrendSeriesSection {
  kind: 'trend_series';
  title: string;
  subtitle?: string | null;
  chart_variant: WorkoutAnalyticsTrendVariant;
  semantic_kind?: WorkoutAnalyticsTrendSemanticKind | null;
  unit?: string | null;
  primary_label?: string | null;
  secondary_label?: string | null;
  points: WorkoutAnalyticsTrendLinePoint[];
  rep_range_points: RepRangeChartPoint[];
  rep_ranges: RepRangeBucket[];
}

export interface WorkoutAnalyticsComparisonItem {
  id: string;
  label: string;
  planned_value?: number | null;
  actual_value?: number | null;
  planned_display: string;
  actual_display: string;
  unit?: string | null;
  availability: WorkoutAnalyticsAvailability;
  origin: WorkoutAnalyticsOrigin;
  helper_text?: string | null;
}

export interface WorkoutAnalyticsComparisonGroupSection {
  kind: 'comparison_group';
  title: string;
  subtitle?: string | null;
  items: WorkoutAnalyticsComparisonItem[];
}

export interface WorkoutAnalyticsExerciseHighlightsSection {
  kind: 'exercise_highlights';
  title: string;
  subtitle?: string | null;
  items: ExerciseTrendSummary[];
}

export interface WorkoutAnalyticsRecentSessionsSection {
  kind: 'recent_sessions';
  title: string;
  subtitle?: string | null;
  items: RecentWorkoutHistoryItem[];
}

export type WorkoutAnalyticsSection =
  | WorkoutAnalyticsSummaryCardsSection
  | WorkoutAnalyticsSnapshotSection
  | WorkoutAnalyticsTrendSeriesSection
  | WorkoutAnalyticsComparisonGroupSection
  | WorkoutAnalyticsExerciseHighlightsSection
  | WorkoutAnalyticsRecentSessionsSection;

export interface WorkoutAnalyticsModules {
  context: WorkoutAnalyticsContext;
  time_scope?: WorkoutAnalyticsTimeScope | null;
  program_scope?: WorkoutAnalyticsProgramScope | null;
  preferences: WorkoutAnalyticsPreferences;
  sections: WorkoutAnalyticsSection[];
}

export interface WorkoutAnalyticsHistoryPage {
  total: number;
  items: RecentWorkoutHistoryItem[];
}

export interface ExerciseTrendPoint {
  performed_on_date: string;
  best_weight_kg?: number | null;
  volume_kg: number;
  duration_minutes?: number | null;
  calories_burned?: number | null;
  distance_meters?: number | null;
  reps_bucket_id?: string | null;
  rep_bucket_totals: Record<string, number>;
  best_reps?: number | null;
  avg_effort?: number | null;
  // Phase 2
  e1rm_kg?: number | null;
  top_set_weight_kg?: number | null;
  top_set_reps?: number | null;
  total_reps?: number | null;
  planned_effort_value?: number | null;
  planned_effort_type?: string | null;
  relative_intensity_pct?: number | null;
  adherence_ratio?: number | null;
  top_set_backoff_delta_kg?: number | null;
  backoff_volume_kg?: number | null;
  metric_contexts?: Partial<Record<ExerciseDetailMetric, WorkoutAnalyticsMetricContext>>;
}

export interface AvailableMetric {
  key: ExerciseDetailMetric;
  label: string;
  unit: string;
  available: boolean;
}

export interface DisplayHints {
  show_volume_bars: boolean;
  show_rep_range_buckets: boolean;
  show_effort_comparison: boolean;
  recommended_chart_type: string;
}

export interface ExerciseTrendDetailSummary {
  personal_best_kg?: number | null;
  personal_best_value?: number | null;
  personal_best_unit?: string | null;
  personal_best_label?: string | null;
  total_sessions: number;
  total_duration_minutes?: number | null;
  total_calories_burned?: number | null;
  total_distance_meters?: number | null;
  first_logged_at?: string | null;
  last_logged_at?: string | null;
}

export interface ExerciseTrendDetail {
  exercise_id: string;
  exercise_name: string;
  summary: ExerciseTrendDetailSummary;
  series: ExerciseTrendPoint[];
  preferences: WorkoutAnalyticsPreferences;
  exercise_media?: ExerciseMedia | null;
  // Phase 2
  analytics_profile?: AnalyticsProfileId | null;
  available_metrics?: AvailableMetric[];
  default_metric?: ExerciseDetailMetric | null;
  display_hints?: DisplayHints | null;
}

// Day-type progress types (compare rotations of the same day, e.g. push-A)
// from GET /workout-analytics/me/day-types[/series]
export type DayTypeScopeKind = 'program' | 'mesocycle';

export interface DayTypeSeriesSummary {
  day_type: string | null;
  variant: string | null;
  label: string | null;
  display_name: string;
  rotations_count: number;
  last_performed_on: string | null;
  trend_status: ExerciseTrendStatus | null;
}

export interface DayTypeSeriesListResponse {
  scope_kind: string;
  macrocycle_id: string | null;
  mesocycle_id: string | null;
  series: DayTypeSeriesSummary[];
}

export interface DayTypeExercisePoint {
  rotation_index: number;
  performed_on_date: string | null;
  microcycle_number: number | null;
  performed: boolean;
  best_weight_kg?: number | null;
  e1rm_kg?: number | null;
  volume_kg?: number | null;
  top_set_weight_kg?: number | null;
  top_set_reps?: number | null;
  avg_effort?: number | null;
  total_reps?: number | null;
  primary_metric_value?: number | null;
}

export interface DayTypeExerciseProgress {
  exercise_id: string;
  exercise_name: string;
  analytics_profile?: AnalyticsProfileId | null;
  primary_metric?: string | null;
  primary_unit?: string | null;
  points: DayTypeExercisePoint[];
  delta_vs_prev?: number | null;
  delta_pct_vs_prev?: number | null;
  trend_status: ExerciseTrendStatus;
}

export interface DayTypeRotation {
  rotation_index: number;
  workout_log_id: string;
  performed_on_date: string | null;
  microcycle_number: number | null;
  microcycle_name: string | null;
  status: string;
  session_volume_kg: number;
  total_sets: number;
  exercises_count: number;
  avg_effort: number | null;
}

export interface DayTypeSeriesDetail {
  day_type: string | null;
  variant: string | null;
  label: string | null;
  display_name: string;
  scope_kind: string;
  rotations_count: number;
  trend_status: ExerciseTrendStatus | null;
  rotations: DayTypeRotation[];
  exercises: DayTypeExerciseProgress[];
}

// Muscle Volume types (from GET /api/training-days/{id}/muscle-volume)
export interface MuscleVolumeItem {
  muscle_name: string;
  display_name: string;
  effective_sets: number;
  total_sets: number;
}

export interface MuscleVolumeResponse {
  training_day_id: string;
  training_day_name: string;
  total_effective_sets: number;
  muscles: MuscleVolumeItem[];
}

export interface ClientRecipeSummary {
  id: number;
  title: string;
  imageUrl: string | null;
  ingredientCount?: number;
}

export interface ClientDietPortion {
  householdLabel: string | null;
  equivalents: number | null;
  grams: number | null;
}

export interface ClientDietIngredientRow {
  id: string;
  menuItemId?: number;
  recipeIngredientId?: number;
  foodId?: number | null;
  exchangeGroupId?: number | null;
  label: string;
  exchangeGroupName: string | null;
  isClientSwap?: boolean;
  originalFoodId?: number | null;
  originalLabel?: string | null;
  portion: ClientDietPortion;
}

export type ClientDietFoodRow = ClientDietIngredientRow;

export interface ClientFoodSwapCandidate {
  id: number;
  name: string;
  brand: string | null;
  exchangeGroupId: number | null;
  baseServingSize: number | null;
  baseUnit: string | null;
  caloriesKcal: number | null;
  servingUnitsCount: number;
}

export interface ClientDietRecipeCard {
  id: string;
  recipeId: number;
  title: string;
  imageUrl: string | null;
  ingredientCount: number;
  ingredients: ClientDietIngredientRow[];
}

export interface ClientDietRecipeDetail {
  id: string;
  recipeId: number;
  title: string;
  imageUrl: string | null;
  description: string | null;
  descriptionRich: unknown | null;
  ingredientCount: number;
  ingredients: ClientDietIngredientRow[];
}

export interface ClientDietMeal {
  id: string;
  name: string;
  totalCalories: number | null;
  recipes: ClientDietRecipeCard[];
  standaloneFoods: ClientDietFoodRow[];
  totalEntries: number;
}

export interface ClientDietMenu {
  id: string;
  menuId: number;
  assignedDate: string;
  title: string;
  description: string | null;
  exchangeSystem: ClientDietExchangeSystem | null;
  meals: ClientDietMeal[];
  totalMeals: number;
  totalCalories: number | null;
  totalItems: number;
  totalRecipes: number;
}

export type ClientDietDay = ClientDietMenu;

export interface ClientDietWeekDay {
  id: string;
  assignedDate: string;
  isToday: boolean;
  backendPrimaryMenuId: number | null;
  rotationMenuOptions: ClientDietMenu[];
  menuOptions: ClientDietMenu[];
}

// API types
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export * from './healthMetrics';
export * from './measurements';
