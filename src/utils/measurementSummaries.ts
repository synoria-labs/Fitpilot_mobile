import { SUMMARY_METRICS } from '../constants/measurements';
import type { MeasurementHistoryItem } from '../types/measurements';

type SummaryMetricKey = (typeof SUMMARY_METRICS)[number]['key'];

export interface MeasurementSummaryItem {
  key: SummaryMetricKey;
  label: string;
  icon: string;
  latestValue: number;
  latestDate: string;
  unit: string;
  changeFromPrevious: number | null;
  previousDate: string | null;
  /** Últimos valores registrados, del más antiguo al más reciente, para la tendencia. */
  history: number[];
  emphasizeDecrease: boolean;
}

const HISTORY_POINTS = 8;

const toFiniteNumber = (value: MeasurementHistoryItem[SummaryMetricKey]): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const buildMeasurementSummaries = (
  measurements: MeasurementHistoryItem[],
): MeasurementSummaryItem[] =>
  SUMMARY_METRICS.flatMap((metric) => {
    const latestIndex = measurements.findIndex(
      (measurement) => toFiniteNumber(measurement[metric.key]) !== null,
    );

    if (latestIndex === -1) {
      return [];
    }

    const latestMeasurement = measurements[latestIndex];
    const latestValue = toFiniteNumber(latestMeasurement[metric.key]);

    if (latestValue === null) {
      return [];
    }

    const previousMeasurement = measurements
      .slice(latestIndex + 1)
      .find((measurement) => toFiniteNumber(measurement[metric.key]) !== null);
    const previousValue = previousMeasurement
      ? toFiniteNumber(previousMeasurement[metric.key])
      : null;
    const history = measurements
      .map((measurement) => toFiniteNumber(measurement[metric.key]))
      .filter((value): value is number => value !== null)
      .slice(0, HISTORY_POINTS)
      .reverse();

    return [{
      key: metric.key,
      label: metric.label,
      icon: metric.icon ?? 'analytics-outline',
      latestValue,
      latestDate: latestMeasurement.date ?? latestMeasurement.logged_at ?? '',
      unit: metric.unit ?? '',
      changeFromPrevious: previousValue === null ? null : latestValue - previousValue,
      previousDate: previousMeasurement ? previousMeasurement.date ?? previousMeasurement.logged_at ?? null : null,
      history,
      emphasizeDecrease: metric.emphasizeDecrease ?? false,
    }];
  });
