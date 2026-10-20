import { clampEffortValue } from './formatters';

export type WorkoutMetricField =
  | 'reps'
  | 'contacts'
  | 'seconds'
  | 'weight'
  | 'effort'
  | 'duration'
  | 'calories'
  | 'distance'
  | 'height_cm'
  | 'distance_cm';

const DECIMAL_FIELDS: ReadonlySet<WorkoutMetricField> = new Set([
  'weight',
  'effort',
  'duration',
  'height_cm',
  'distance_cm',
]);

const roundToDecimals = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const parseFiniteNumber = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue === '.') {
    return null;
  }

  const normalizedValue = trimmedValue.replace(',', '.');
  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export const sanitizeWorkoutMetricDraft = (
  field: WorkoutMetricField,
  rawValue: string,
) => {
  if (!DECIMAL_FIELDS.has(field)) {
    return rawValue.replace(/[^\d]/g, '');
  }

  const normalizedValue = rawValue.replace(/,/g, '.');
  let sanitizedValue = '';
  let hasDecimalSeparator = false;

  for (const character of normalizedValue) {
    if (/\d/.test(character)) {
      sanitizedValue += character;
      continue;
    }

    if (character === '.' && !hasDecimalSeparator) {
      sanitizedValue += character;
      hasDecimalSeparator = true;
    }
  }

  return sanitizedValue;
};

export const normalizeWorkoutMetricValue = (
  field: WorkoutMetricField,
  rawValue: string | number | null | undefined,
) => {
  const parsedValue = parseFiniteNumber(rawValue);
  if (parsedValue == null) {
    return null;
  }

  switch (field) {
    case 'reps':
    case 'contacts':
      return Math.max(1, Math.round(parsedValue));
    case 'seconds':
      // Seconds held in a set; the backend accepts up to two hours.
      return Math.min(7200, Math.max(1, Math.round(parsedValue)));
    case 'weight':
      return Math.max(0, roundToDecimals(parsedValue, 2));
    case 'effort':
      return clampEffortValue(Math.min(10, Math.max(0, parsedValue)));
    case 'duration':
      return Math.max(0.1, roundToDecimals(parsedValue, 1));
    case 'calories':
      return Math.max(0, Math.round(parsedValue));
    case 'distance':
      return Math.max(0, Math.round(parsedValue));
    case 'height_cm':
    case 'distance_cm':
      return Math.max(0, roundToDecimals(parsedValue, 1));
    default:
      return null;
  }
};

export const formatWorkoutMetricValue = (
  field: WorkoutMetricField,
  value: number | null | undefined,
) => {
  const normalizedValue = normalizeWorkoutMetricValue(field, value);
  if (normalizedValue == null) {
    return '';
  }

  if (field === 'reps' || field === 'contacts' || field === 'seconds') {
    return `${normalizedValue}`;
  }

  if (field === 'calories' || field === 'distance') {
    return `${Math.round(normalizedValue)}`;
  }

  return Number.isInteger(normalizedValue)
    ? `${normalizedValue}`
    : normalizedValue.toFixed(field === 'weight' ? 2 : 1).replace(/\.0$/, '').replace(/(\.\d*[1-9])0$/, '$1');
};

export const adjustWorkoutMetricValue = (
  field: WorkoutMetricField,
  value: number | null | undefined,
  delta: number,
) => {
  const normalizedValue = normalizeWorkoutMetricValue(field, value) ?? 0;
  return normalizeWorkoutMetricValue(field, normalizedValue + delta);
};
