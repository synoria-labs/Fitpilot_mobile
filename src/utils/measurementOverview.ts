import {
  getMeasurementProgressMetricConfig,
  type MeasurementProgressMetricKey,
} from '../constants/measurements';
import type { MeasurementHistoryItem } from '../types/measurements';
import type { MeasurementPreference } from '../store/measurementPreferenceStore';
import { getMeasurementDisplayDate, parseMeasurementNumber } from './measurements';
import { convertMeasurementUnitValue } from './measurementUnits';
import { getTodayDateKey, parseLocalDate } from './date';

export type MeasurementOverviewRange = '3m' | '6m' | '1y' | 'all';
export type MeasurementOverviewPoint = {
  id: string;
  date: string;
  timestamp: number;
  value: number;
  unit: string | null;
};

/** Resolve each metric independently: a newer weight-only entry must not erase composition. */
export function buildMeasurementOverviewSeries(
  measurements: MeasurementHistoryItem[],
  key: MeasurementProgressMetricKey,
  preference: MeasurementPreference,
  today = getTodayDateKey(),
): MeasurementOverviewPoint[] {
  const config = getMeasurementProgressMetricConfig(key);
  if (!config) return [];
  const seen = new Set<string>();
  return measurements
    .flatMap((measurement) => {
      if (seen.has(measurement.id)) return [];
      seen.add(measurement.id);
      const date = getMeasurementDisplayDate(measurement);
      const parsed = parseLocalDate(date);
      if (!date || !parsed || date.slice(0, 10) > today) return [];
      const value =
        config.source === 'derived'
          ? config.getValue(measurement)
          : parseMeasurementNumber(measurement[config.fieldKey]);
      if (value == null) return [];
      const converted = convertMeasurementUnitValue(value, config.unit, preference);
      return [
        {
          id: measurement.id,
          date,
          timestamp: parsed.getTime(),
          value: converted.value,
          unit: converted.unit ?? null,
        },
      ];
    })
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/** Calendar months, anchored to today rather than the last (possibly stale) measurement. */
export function selectMeasurementOverviewRange(
  points: MeasurementOverviewPoint[],
  range: MeasurementOverviewRange,
  today = getTodayDateKey(),
) {
  if (range === 'all') return points;
  const start = parseLocalDate(today);
  if (!start) return [];
  const day = start.getDate();
  start.setDate(1);
  start.setMonth(start.getMonth() - (range === '3m' ? 3 : range === '6m' ? 6 : 12));
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(day, lastDay));
  start.setHours(0, 0, 0, 0);
  return points.filter((point) => point.timestamp >= start.getTime());
}
