import type { DayExercise, EffortType } from '../types';

/**
 * Round a number and group its thousands the Mexican way: 2150 → "2,150"
 */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('es-MX');
}

/**
 * Lowercase text without accents, to compare names people write by hand
 */
export function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Format seconds to MM:SS string
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins} min` : `${hours}h`;
}

/**
 * Get exercise name in user's preferred language
 */
export function getExerciseName(
  exercise: { name_es?: string | null; name_en: string },
  language: 'es' | 'en' = 'es'
): string {
  if (language === 'es' && exercise.name_es) {
    return exercise.name_es;
  }
  return exercise.name_en;
}

/**
 * Format weight with unit
 */
export function formatWeight(kg: number): string {
  return `${kg} kg`;
}

/**
 * Get day name in Spanish
 */
export function getDayNameEs(dayIndex: number): string {
  const days = ['Dom', 'Lun', 'Mar', 'Mier', 'Jue', 'Vie', 'Sab'];
  return days[dayIndex % 7];
}

/**
 * Calculate workout completion percentage
 */
export function calculateCompletionPercentage(
  completedSets: number,
  totalSets: number
): number {
  if (totalSets === 0) return 0;
  return Math.round((completedSets / totalSets) * 100);
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
}

export function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  if (seconds % 60 === 0) {
    return formatDuration(seconds / 60);
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')} min`;
}

export function formatDistanceMeters(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    const km = distanceMeters / 1000;
    return `${formatCompactNumber(km)} km`;
  }

  return `${formatCompactNumber(distanceMeters)} m`;
}

export function isEditableEffortType(effortType: EffortType): boolean {
  return effortType === 'RIR' || effortType === 'RPE';
}

export function clampEffortValue(value: number): number {
  return Math.min(10, Math.max(0, Math.round(value * 2) / 2));
}

export function formatEffortValue(
  effortType: EffortType,
  effortValue: number | null | undefined,
): string {
  if (effortValue == null || Number.isNaN(effortValue)) {
    return effortType === 'percentage' ? '--%' : `${effortType} --`;
  }

  const formattedValue = formatCompactNumber(effortValue);
  return effortType === 'percentage'
    ? `${formattedValue}%`
    : `${effortType} ${formattedValue}`;
}

export function formatZoneLabel(zone: number | null | undefined): string | null {
  if (zone == null || Number.isNaN(zone)) {
    return null;
  }

  return `Z${zone}`;
}

const getExerciseClass = (dayExercise: Partial<DayExercise> | null | undefined) =>
  dayExercise?.exercise?.exercise_class ?? null;

export function isCardioExercise(dayExercise: Partial<DayExercise> | null | undefined): boolean {
  if (!dayExercise) {
    return false;
  }

  return ['cardio', 'conditioning'].includes(getExerciseClass(dayExercise) ?? '') || !!dayExercise.cardio_subclass;
}

export function isMovementExercise(dayExercise: Partial<DayExercise> | null | undefined): boolean {
  const exerciseClass = getExerciseClass(dayExercise);
  return (
    exerciseClass === 'plyometric' ||
    exerciseClass === 'mobility' ||
    exerciseClass === 'warmup' ||
    exerciseClass === 'flexibility' ||
    exerciseClass === 'balance'
  );
}

export function isPlyometricExercise(dayExercise: Partial<DayExercise> | null | undefined): boolean {
  return getExerciseClass(dayExercise) === 'plyometric';
}

export function isMobilityOrWarmupExercise(
  dayExercise: Partial<DayExercise> | null | undefined,
): boolean {
  const exerciseClass = getExerciseClass(dayExercise);
  return (
    exerciseClass === 'mobility' ||
    exerciseClass === 'warmup' ||
    exerciseClass === 'flexibility' ||
    exerciseClass === 'balance'
  );
}

export function isTimedMovementExercise(
  dayExercise: Partial<DayExercise> | null | undefined,
  fallbackDurationSeconds?: number | null,
): boolean {
  if (!isMobilityOrWarmupExercise(dayExercise)) {
    return false;
  }

  return (dayExercise?.duration_seconds ?? fallbackDurationSeconds ?? 0) > 0;
}

/**
 * Strength exercise prescribed in seconds per set (plank, dead hang): a duration with no
 * repetition window. Cardio and movement classes keep their own timed flows.
 */
export function isTimedStrengthExercise(
  dayExercise: Partial<DayExercise> | null | undefined,
): boolean {
  if (!dayExercise || isCardioExercise(dayExercise) || isMovementExercise(dayExercise)) {
    return false;
  }

  return (
    (dayExercise.duration_seconds ?? 0) > 0 &&
    dayExercise.reps_min == null &&
    dayExercise.reps_max == null
  );
}

export function isHiitCardioExercise(
  dayExercise: Partial<DayExercise> | null | undefined,
): boolean {
  if (!isCardioExercise(dayExercise)) {
    return false;
  }

  return (
    dayExercise?.cardio_subclass === 'hiit' ||
    ((dayExercise?.intervals ?? 0) > 0 && (dayExercise?.work_seconds ?? 0) > 0)
  );
}

export function usesSteadyStateCardioTimer(
  dayExercise: Partial<DayExercise> | null | undefined,
  fallbackDurationSeconds?: number | null,
): boolean {
  if (!isCardioExercise(dayExercise) || isHiitCardioExercise(dayExercise)) {
    return false;
  }

  return (dayExercise?.duration_seconds ?? fallbackDurationSeconds ?? 0) > 0;
}

export function shouldShowStrengthEffort(
  dayExercise: Partial<DayExercise> | null | undefined,
): boolean {
  return !!dayExercise && !isCardioExercise(dayExercise) && !isMovementExercise(dayExercise);
}

export function getCardioSummaryLabel(
  dayExercise: Partial<DayExercise> | null | undefined,
): string {
  if (!dayExercise) {
    return 'Cardio';
  }

  const primaryParts: string[] = [];

  if (dayExercise.duration_seconds != null) {
    primaryParts.push(formatDurationSeconds(dayExercise.duration_seconds));
  } else if (dayExercise.intervals && dayExercise.work_seconds) {
    const restLabel = dayExercise.interval_rest_seconds
      ? `/${formatDurationSeconds(dayExercise.interval_rest_seconds)}`
      : '';
    primaryParts.push(
      `${dayExercise.intervals} x ${formatDurationSeconds(dayExercise.work_seconds)}${restLabel}`,
    );
  } else if (dayExercise.distance_meters != null) {
    primaryParts.push(formatDistanceMeters(dayExercise.distance_meters));
  } else if (dayExercise.target_calories != null) {
    primaryParts.push(`${formatCompactNumber(dayExercise.target_calories)} cal`);
  }

  const zoneLabel = formatZoneLabel(dayExercise.intensity_zone);
  if (zoneLabel) {
    primaryParts.push(zoneLabel);
  }

  if (!primaryParts.length && dayExercise.cardio_subclass) {
    return dayExercise.cardio_subclass.toUpperCase();
  }

  return primaryParts.slice(0, 2).join(' / ') || 'Cardio';
}

/**
 * Determine how many "blocks" (set chips) to show for a cardio exercise.
 *
 * - HIIT with intervals: respect backend `sets` value (they represent rounds).
 * - LISS / MISS (steady-state): always 1 — a single continuous effort.
 * - Cardio with rest_seconds > 0 AND sets > 1: respect sets (trainer intended
 *   multiple rounds with rest between them).
 * - Fallback: 1 block.
 */
export function getCardioEffectiveSets(
  dayExercise: Partial<DayExercise> | null | undefined,
): number {
  if (!dayExercise) {
    return 1;
  }

  const sets = dayExercise.sets ?? 1;
  const hasIntervals = (dayExercise.intervals ?? 0) > 0;

  // HIIT with intervals: each "set" is a round of intervals
  if (hasIntervals && sets > 1) {
    return sets;
  }

  // Steady-state cardio: always 1 continuous block
  return 1;
}

export function getMovementSummaryLabel(
  dayExercise: Partial<DayExercise> | null | undefined,
): string {
  if (isPlyometricExercise(dayExercise)) {
    const minContacts = dayExercise?.reps_min;
    const maxContacts = dayExercise?.reps_max;
    if (minContacts != null && maxContacts != null) {
      return `${minContacts}-${maxContacts} contactos`;
    }
    if (minContacts != null) {
      return `${minContacts} contactos`;
    }
    return 'Contactos explosivos';
  }

  if (isTimedMovementExercise(dayExercise)) {
    return formatDurationSeconds(dayExercise?.duration_seconds ?? 0);
  }

  if (isMobilityOrWarmupExercise(dayExercise)) {
    return `${dayExercise?.sets ?? 1} bloque${(dayExercise?.sets ?? 1) === 1 ? '' : 's'}`;
  }

  return 'Movimiento';
}

export function getMovementMetricLabel(
  dayExercise: Partial<DayExercise> | null | undefined,
): string {
  if (isPlyometricExercise(dayExercise)) {
    return dayExercise?.plyometric_metric_type === 'distance_cm' ? 'Distancia (cm)' : 'Altura (cm)';
  }

  return 'Duración (min)';
}

const ZONE_HR_RANGES: Record<number, string> = {
  1: '50-60%',
  2: '60-70%',
  3: '70-80%',
  4: '80-90%',
  5: '90-100%',
};

/**
 * Build a compact label appropriate for cardio set-chips, replacing
 * the strength-oriented RIR/RPE label.
 *
 * - HIIT  → "8x 30s/30s"
 * - LISS  → "Z2 · 30 min"
 * - MISS  → "Z3 · 25 min"
 * - Generic → zone + duration, or just "Cardio"
 */
export function getCardioIntensityLabel(
  dayExercise: Partial<DayExercise> | null | undefined,
): string {
  if (!dayExercise) {
    return 'Cardio';
  }

  // HIIT with intervals: show interval pattern
  if (dayExercise.intervals && dayExercise.work_seconds) {
    const restPart = dayExercise.interval_rest_seconds
      ? `/${dayExercise.interval_rest_seconds}s`
      : '';
    return `${dayExercise.intervals}x ${dayExercise.work_seconds}s${restPart}`;
  }

  // Steady-state: zone + duration
  const zone = dayExercise.intensity_zone;
  const zonePart = zone ? `Z${zone}` : null;
  const durationPart = dayExercise.duration_seconds
    ? formatDurationSeconds(dayExercise.duration_seconds)
    : null;

  if (zonePart && durationPart) {
    return `${zonePart} · ${durationPart}`;
  }

  return zonePart || durationPart || 'Cardio';
}

/**
 * Get the HR range description for an intensity zone (1-5).
 */
export function getZoneHrRange(zone: number | null | undefined): string | null {
  if (zone == null || !ZONE_HR_RANGES[zone]) {
    return null;
  }
  return ZONE_HR_RANGES[zone];
}
