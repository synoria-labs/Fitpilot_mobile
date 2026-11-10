import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuroraCard, ReadinessRing, Sparkline } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { GlucoseRecord, MeasurementHistoryItem, MeasurementPagination } from '../../types';
import {
  PERIMETER_CARD_FIELDS,
  type MeasurementProgressMetricKey,
} from '../../constants/measurements';
import { GLUCOSE_CONTEXT_LABELS } from '../../constants/healthMetrics';
import type { MeasurementPreference } from '../../store/measurementPreferenceStore';
import { listMyMeasurements } from '../../services/measurements';
import {
  buildMeasurementOverviewSeries,
  type MeasurementOverviewPoint,
} from '../../utils/measurementOverview';
import {
  formatMeasurementDate,
  formatMeasurementNumber,
  type MeasurementChangePreference,
} from '../../utils/measurements';
import { formatGlucoseRecordedAt } from '../../utils/healthMetrics';
import { MeasurementWeightHero } from './MeasurementWeightHero';
import { MeasurementHealthPreview } from './MeasurementHealthPreview';

const COMPOSITION = [
  { key: 'body_fat_pct', label: 'Grasa corporal', unit: '%', preference: 'decrease' },
  { key: 'muscle_mass_kg', label: 'Masa muscular', unit: 'kg', preference: 'increase' },
  { key: 'visceral_fat', label: 'Grasa visceral', unit: null, preference: 'decrease' },
  { key: 'bmi', label: 'IMC', unit: null, preference: 'neutral' },
] as const;
const PERIMETER_PRIORITY = [
  'waist_cm',
  'hip_cm',
  'relaxed_arm_midpoint_right_cm',
  'mid_thigh_right_cm',
  'relaxed_arm_midpoint_left_cm',
  'mid_thigh_left_cm',
];

function ChangeBadge({
  series,
  preference = 'neutral',
  percentage = false,
}: {
  series: MeasurementOverviewPoint[];
  preference?: MeasurementChangePreference;
  percentage?: boolean;
}) {
  const aurora = useAurora();
  const current = series.at(-1);
  const previous = series.at(-2);
  if (!current || !previous)
    return <Text style={[styles.small, { color: aurora.faint }]}>Sin comparativo</Text>;
  const change = current.value - previous.value;
  const neutral = Math.abs(change) < 0.05 || preference === 'neutral';
  const good = preference === 'increase' ? change > 0 : change < 0;
  const tone = neutral ? aurora.tones.slate : good ? aurora.tones.emerald : aurora.tones.amber;
  return (
    <Text style={[styles.change, { backgroundColor: tone.soft, color: tone.ink }]}>
      {change > 0 ? '+' : ''}
      {formatMeasurementNumber(change, 1)}
      {percentage ? ' pts' : current.unit && current.unit !== 'kg/m2' ? ` ${current.unit}` : ''}
    </Text>
  );
}

export function MeasurementOverview({
  measurements,
  pagination,
  preference,
  weightPreference,
  measurementError,
  glucose,
  glucoseRecords,
  glucoseLoading,
  glucoseError,
  onRetryGlucose,
  onCreateBody,
  onCreateGlucose,
  onOpenMetric,
  onBody,
  onGlucose,
  onHealth,
}: {
  measurements: MeasurementHistoryItem[];
  pagination: MeasurementPagination | null;
  preference: MeasurementPreference;
  weightPreference: MeasurementChangePreference;
  measurementError: string | null;
  glucose: GlucoseRecord | null;
  glucoseRecords: GlucoseRecord[];
  glucoseLoading: boolean;
  glucoseError: string | null;
  onRetryGlucose: () => void;
  onCreateBody: () => void;
  onCreateGlucose: () => void;
  onOpenMetric: (key: MeasurementProgressMetricKey) => void;
  onBody: () => void;
  onGlucose: () => void;
  onHealth: () => void;
}) {
  const aurora = useAurora();
  const [history, setHistory] = useState(measurements);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setHistory(measurements);
    setHistoryFailed(false);
    const totalPages = pagination?.totalPages ?? 1;
    const currentPage = pagination?.page ?? 1;
    setLoadingHistory(currentPage < totalPages);
    const load = async () => {
      const remaining: MeasurementHistoryItem[] = [];
      for (let page = currentPage + 1; page <= totalPages && active; page += 1) {
        const response = await listMyMeasurements(page, pagination?.limit ?? 20);
        remaining.push(...response.data);
      }
      if (active) setHistory([...measurements, ...remaining]);
    };
    void load()
      .catch(() => {
        if (active) setHistoryFailed(true);
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [measurements, pagination, retry]);
  const series = useMemo(() => {
    const keys = [
      'weight_kg',
      ...COMPOSITION.map((metric) => metric.key),
      ...PERIMETER_CARD_FIELDS.map((field) => field.key),
    ] as MeasurementProgressMetricKey[];
    return Object.fromEntries(
      keys.map((key) => [key, buildMeasurementOverviewSeries(history, key, preference)]),
    ) as Record<MeasurementProgressMetricKey, MeasurementOverviewPoint[]>;
  }, [history, preference]);
  const composition = COMPOSITION.filter((metric) => series[metric.key].length > 0);
  const perimeters = PERIMETER_CARD_FIELDS.filter((field) => series[field.key].length > 0)
    .sort((a, b) => {
      const priority = (key: string) =>
        PERIMETER_PRIORITY.includes(key) ? PERIMETER_PRIORITY.indexOf(key) : 99;
      return priority(a.key) - priority(b.key);
    })
    .slice(0, 4);
  const glucoseHistory = glucoseRecords
    .filter(
      (record) =>
        record.glucose_mg_dl != null &&
        record.glucose_context === glucose?.glucose_context &&
        record.recorded_at &&
        new Date(record.recorded_at).getTime() <= Date.now(),
    )
    .slice(0, 8)
    .reverse();

  return (
    <View style={styles.stack}>
      {!measurementError || history.length ? (
        <>
          <MeasurementWeightHero
            series={series.weight_kg}
            preference={weightPreference}
            onCreate={onCreateBody}
            onOpen={() => onOpenMetric('weight_kg')}
          />
          {loadingHistory ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={aurora.tones.violet.tone} />
              <Text style={[styles.caption, { color: aurora.faint }]}>
                Cargando historial completo…
              </Text>
            </View>
          ) : null}
          {historyFailed ? (
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
              <Text style={[styles.caption, { color: aurora.tones.amber.ink }]}>
                Mostrando los registros cargados. Reintentar historial
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.section}>
            <Text style={[auroraType.headline, { color: aurora.text }]}>Composición</Text>
            {composition.length ? (
              <View style={styles.grid}>
                {composition.map((metric) => {
                  const points = series[metric.key];
                  const latest = points.at(-1)!;
                  const previous = points.at(-2);
                  return (
                    <Pressable
                      key={metric.key}
                      style={styles.tile}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver progreso de ${metric.label.toLowerCase()}`}
                      onPress={() => onOpenMetric(metric.key)}
                    >
                      <AuroraCard padding={14} radius={18} style={styles.tileCard}>
                        <Text style={[styles.label, { color: aurora.faint }]}>{metric.label}</Text>
                        <View style={styles.metricBody}>
                          {metric.key === 'body_fat_pct' ? (
                            <ReadinessRing
                              score={latest.value}
                              label={`${formatMeasurementNumber(latest.value, 1)}%`}
                              tone="violet"
                              size={56}
                              stroke={4}
                            />
                          ) : (
                            <Text
                              adjustsFontSizeToFit
                              numberOfLines={1}
                              style={[styles.metricValue, { color: aurora.text }]}
                            >
                              {formatMeasurementNumber(latest.value, 1)}
                              <Text style={[styles.unit, { color: aurora.faint }]}>
                                {metric.unit ? ` ${latest.unit}` : ''}
                              </Text>
                            </Text>
                          )}
                          {metric.key === 'body_fat_pct' ? (
                            <ChangeBadge
                              series={points}
                              preference={metric.preference}
                              percentage
                            />
                          ) : null}
                        </View>
                        {metric.key !== 'body_fat_pct' ? (
                          <ChangeBadge series={points} preference={metric.preference} />
                        ) : null}
                        <Text style={[styles.small, { color: aurora.faint }]}>
                          {previous
                            ? `vs. ${formatMeasurementDate(previous.date, 'short')}`
                            : formatMeasurementDate(latest.date, 'short')}
                        </Text>
                        {previous && history[0]?.id !== latest.id ? (
                          <Text style={[styles.small, { color: aurora.faint }]}>
                            Dato del {formatMeasurementDate(latest.date, 'short')}
                          </Text>
                        ) : null}
                      </AuroraCard>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <AuroraCard>
                <Text style={[styles.caption, { color: aurora.faint }]}>
                  Añade grasa corporal, masa muscular o estatura a una medición para ver tu
                  composición.
                </Text>
              </AuroraCard>
            )}
          </View>
          <View style={styles.section}>
            <View style={styles.heading}>
              <Text style={[auroraType.headline, { color: aurora.text }]}>Perímetros</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver todos los perímetros"
                onPress={onBody}
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: aurora.tones.violet.ink }]}>Ver todos</Text>
              </Pressable>
            </View>
            <AuroraCard padding={0} radius={20}>
              {perimeters.length ? (
                perimeters.map((field, index) => {
                  const points = series[field.key];
                  const latest = points.at(-1)!;
                  return (
                    <Pressable
                      key={field.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver progreso de ${field.label.toLowerCase()}`}
                      onPress={() => onOpenMetric(field.key)}
                      style={[
                        styles.perimeter,
                        {
                          borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
                          borderColor: aurora.border,
                        },
                      ]}
                    >
                      <View style={styles.perimeterCopy}>
                        <Text style={[styles.name, { color: aurora.text }]}>{field.label}</Text>
                        <Text style={[styles.caption, { color: aurora.faint }]}>
                          {latest.value.toFixed(1)} {latest.unit}
                        </Text>
                        <Text style={[styles.small, { color: aurora.faint }]}>
                          {formatMeasurementDate(latest.date, 'short')}
                        </Text>
                      </View>
                      <Sparkline
                        values={points.slice(-8).map((point) => point.value)}
                        width={50}
                        height={24}
                        area={false}
                        color={aurora.tones.violet.tone}
                      />
                      <ChangeBadge series={points} />
                      <Ionicons name="chevron-forward" size={14} color={aurora.faint} />
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.caption, styles.empty, { color: aurora.faint }]}>
                  Registra tus perímetros para comparar su evolución.
                </Text>
              )}
            </AuroraCard>
          </View>
        </>
      ) : null}
      <AuroraCard style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver historial de glucosa"
          onPress={onGlucose}
          style={styles.heading}
        >
          <View style={[styles.icon, { backgroundColor: aurora.tones.amber.soft }]}>
            <Ionicons name="water-outline" color={aurora.tones.amber.ink} size={18} />
          </View>
          <View style={styles.perimeterCopy}>
            <Text style={[auroraType.headline, { color: aurora.text }]}>Glucosa</Text>
            <Text style={[styles.small, { color: aurora.faint }]}>
              {glucose?.glucose_context
                ? GLUCOSE_CONTEXT_LABELS[glucose.glucose_context]
                : 'Última lectura'}
            </Text>
          </View>
          {glucose?.glucose_mg_dl != null ? (
            <Text style={[styles.glucoseValue, { color: aurora.text }]}>
              {glucose.glucose_mg_dl}
              <Text style={[styles.small, { color: aurora.faint }]}> mg/dL</Text>
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={14} color={aurora.faint} />
        </Pressable>
        {glucoseLoading && !glucose ? (
          <ActivityIndicator color={aurora.tones.amber.tone} />
        ) : glucose ? (
          <>
            <Text style={[styles.caption, { color: aurora.faint }]}>
              {formatGlucoseRecordedAt(glucose.recorded_at, 'short')}
            </Text>
            {glucoseHistory.length > 1 ? (
              <View style={styles.glucoseTrend}>
                <Sparkline
                  values={glucoseHistory.map((record) => record.glucose_mg_dl!)}
                  width={130}
                  height={28}
                  area={false}
                  color={aurora.tones.amber.tone}
                />
                <Text style={[styles.small, { color: aurora.faint }]}>
                  Últimas {glucoseHistory.length} lecturas · mismo contexto
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.caption, { color: aurora.faint }]}>
            {glucoseError ?? 'Todavía no tienes lecturas de glucosa.'}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={glucoseError ? onRetryGlucose : onCreateGlucose}
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: aurora.tones.amber.ink }]}>
            {glucoseError ? 'Reintentar glucosa' : 'Registrar glucosa'}
          </Text>
        </Pressable>
      </AuroraCard>
      <MeasurementHealthPreview onOpen={onHealth} refreshKey={measurements} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 22 },
  section: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '46%', flexGrow: 1 },
  tileCard: { flex: 1, gap: 9 },
  label: { ...auroraFont('bold'), fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  metricBody: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metricValue: { ...auroraFont('extrabold'), fontSize: 25, letterSpacing: -0.7 },
  unit: { ...auroraFont('semibold'), fontSize: 11 },
  change: {
    ...auroraFont('bold'),
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  small: { ...auroraFont('medium'), fontSize: 9, lineHeight: 14 },
  caption: { ...auroraType.caption, fontSize: 11 },
  link: { paddingVertical: 8 },
  linkText: { ...auroraFont('bold'), fontSize: 11 },
  perimeter: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14 },
  perimeterCopy: { flex: 1, gap: 3 },
  name: { ...auroraFont('bold'), fontSize: 12 },
  empty: { padding: 18 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  glucoseValue: { ...auroraFont('extrabold'), fontSize: 23 },
  glucoseTrend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
