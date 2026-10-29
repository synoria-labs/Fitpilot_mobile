import type {
  MeasurementCalculationStatus,
  MeasurementHistoryFieldKey,
  MeasurementHistoryItem,
} from '../types/measurements';
import { getCalendarDayDiff, getTodayDateKey } from './date';

/** A partir de aquí la última medición ya no sirve bien para ver progreso. */
export const STALE_MEASUREMENT_DAYS = 30;

export type MeasurementChangePreference = 'decrease' | 'increase' | 'neutral';

/**
 * El peso no es bueno ni malo por sí solo: depende del objetivo del programa. Antes bajar se
 * pintaba siempre en verde, también a quien busca ganar masa muscular.
 */
export const getWeightChangePreference = (
  programObjective?: string | null,
): MeasurementChangePreference => {
  if (programObjective === 'fat_loss') {
    return 'decrease';
  }

  if (programObjective === 'hypertrophy') {
    return 'increase';
  }

  return 'neutral';
};

const longDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const parseDateValue = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalizedValue = value.includes('T') ? value : `${value}T00:00:00`;
  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const parseMeasurementNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const formatMeasurementNumber = (
  value: unknown,
  decimals = 1,
  fallback = '--',
) => {
  const parsedValue = parseMeasurementNumber(value);

  if (parsedValue === null) {
    return fallback;
  }

  if (Number.isInteger(parsedValue)) {
    return parsedValue.toString();
  }

  return parsedValue.toFixed(decimals).replace(/\.?0+$/, '');
};

export const getMeasurementDisplayDate = (measurement?: {
  date?: string | null;
  logged_at?: string | null;
}) => measurement?.date ?? measurement?.logged_at ?? null;

export const formatMeasurementDate = (
  value?: string | null,
  variant: 'long' | 'short' = 'long',
) => {
  const parsedDate = parseDateValue(value);

  if (!parsedDate) {
    return 'Sin fecha';
  }

  return variant === 'long'
    ? longDateFormatter.format(parsedDate)
    : shortDateFormatter.format(parsedDate);
};

/**
 * "Hace 2 meses": la fecha absoluta sola no dice si la última medición sigue sirviendo, y
 * `isStale` permite invitar a registrar otra.
 */
export const describeMeasurementAge = (
  value?: string | null,
  today: Date = new Date(),
): { label: string; isStale: boolean } | null => {
  if (!parseDateValue(value)) {
    return null;
  }

  const days = Math.max(0, getCalendarDayDiff(value, today));
  const isStale = days >= STALE_MEASUREMENT_DAYS;

  if (days === 0) {
    return { label: 'Hoy', isStale };
  }

  if (days === 1) {
    return { label: 'Ayer', isStale };
  }

  if (days < 7) {
    return { label: `Hace ${days} días`, isStale };
  }

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return { label: weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`, isStale };
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    return { label: months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`, isStale };
  }

  return { label: 'Hace más de un año', isStale };
};

/**
 * La medición anterior a la más reciente que sí trae `fieldKey`: contra ella se calcula el
 * cambio, y su fecha dice desde cuándo ("vs. 10 abr").
 */
export const findPreviousMeasurementWithValue = (
  measurements: MeasurementHistoryItem[],
  fieldKey: MeasurementHistoryFieldKey,
) =>
  measurements
    .slice(1)
    .find((measurement) => parseMeasurementNumber(measurement[fieldKey]) !== null) ?? null;

export const calculateMeasurementChange = (
  measurements: MeasurementHistoryItem[],
  fieldKey: MeasurementHistoryFieldKey,
) => {
  if (measurements.length < 2) {
    return null;
  }

  const currentValue = parseMeasurementNumber(measurements[0]?.[fieldKey]);
  if (currentValue === null) {
    return null;
  }

  const previousMeasurement = findPreviousMeasurementWithValue(measurements, fieldKey);

  if (!previousMeasurement) {
    return null;
  }

  const previousValue = parseMeasurementNumber(previousMeasurement[fieldKey]);
  if (previousValue === null) {
    return null;
  }

  return roundTo(currentValue - previousValue, 2);
};

export const isValidMeasurementDateInput = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return parseDateValue(value) !== null;
};

export const getTodayDateInput = () => {
  return getTodayDateKey();
};

export const getCalculationStatusLabel = (status: MeasurementCalculationStatus) => {
  if (status === 'computed') {
    return 'Calculado';
  }

  if (status === 'error') {
    return 'Error';
  }

  return 'Pendiente';
};
