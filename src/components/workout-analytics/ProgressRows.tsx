import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseTrendSummary, RecentWorkoutHistoryItem } from '../../types';
import { auroraFont, auroraRadius, useAurora, type AuroraTone } from '../../theme/aurora';
import { AuroraCard, AuroraPill, Sparkline, type AuroraIconName } from '../aurora';
import { formatLocalDate } from '../../utils/date';
import { formatCalories, formatDistance } from '../../utils/workoutAnalytics';
import { formatMetricValue, getProfileConfig, getSummaryMetricContext } from '../../utils/analyticsProfiles';

const GROUP_RADIUS = 24;
const GROUP_PADDING = 6;

const getTrendTone = (status: ExerciseTrendSummary['trend_status']): AuroraTone =>
  status === 'rising' ? 'emerald' : status === 'declining' ? 'amber' : 'slate';

const formatTons = (kilograms: number) =>
  `${(kilograms / 1000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;

/** Lo que la fila dice del ejercicio: la mejor marca y su cambio en el periodo. */
const describeExercise = (exercise: ExerciseTrendSummary) => {
  const profile = getProfileConfig(exercise.analytics_profile);
  const unit = exercise.primary_metric_unit ?? profile.primaryUnit;
  const isWeight = unit === 'kg';
  const isEstimate = profile.primaryMetric === 'e1rm';
  const metric =
    exercise.primary_metric_value ??
    (isWeight ? (exercise.best_recent_weight_kg ?? exercise.latest_best_weight_kg) : null);
  const reps = getSummaryMetricContext(exercise)?.reps_exact;
  const delta = exercise.primary_metric_delta ?? (isWeight ? exercise.best_weight_delta_kg : null);

  return {
    label: isEstimate ? '1RM estimado' : isWeight ? 'Mejor serie' : 'Mejor registro',
    value:
      metric == null
        ? 'Sin datos'
        : `${formatMetricValue(metric, unit)}${isWeight && !isEstimate && reps ? ` × ${reps}` : ''}`,
    change:
      delta != null && delta !== 0
        ? `${delta > 0 ? '+' : '−'}${formatMetricValue(Math.abs(delta), unit)}`
        : exercise.trend_status === 'insufficient' || delta == null
          ? 'Sin comparar'
          : 'Estable',
    isCardio: profile.id === 'cardio_progression',
  };
};

export function ProgressExerciseRow({
  exercise,
  onPress,
  showDetails = false,
}: {
  exercise: ExerciseTrendSummary;
  onPress: () => void;
  /** En la lista completa: sesiones y último día, además de la mejor marca. */
  showDetails?: boolean;
}) {
  const aurora = useAurora();
  const { label, value, change, isCardio } = describeExercise(exercise);
  const tone = getTrendTone(exercise.trend_status);
  const details = showDetails
    ? [
        `${exercise.sessions_count} ${exercise.sessions_count === 1 ? 'sesión' : 'sesiones'}`,
        exercise.last_performed_on
          ? `última ${formatLocalDate(exercise.last_performed_on, { day: 'numeric', month: 'short' }).replace('.', '')}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const lineColor =
    exercise.trend_status === 'rising'
      ? aurora.tones.blue.tone
      : exercise.trend_status === 'declining'
        ? aurora.tones.amber.tone
        : aurora.faint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.exercise_name}. ${label}: ${value}. ${change}.`}
      accessibilityHint="Abre el progreso del ejercicio"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: aurora.surface2 } : null]}
    >
      <View style={[styles.iconTile, { backgroundColor: aurora.tones.blue.soft }]}>
        <Ionicons name={isCardio ? 'heart-outline' : 'barbell-outline'} size={19} color={aurora.tones.blue.ink} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, auroraFont('bold'), { color: aurora.text }]}>
          {exercise.exercise_name}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, auroraFont('medium'), { color: aurora.faint }]}>
          {label}: {value}
        </Text>
        {details ? (
          <Text numberOfLines={1} style={[styles.meta, auroraFont('medium'), { color: aurora.faint }]}>
            {details}
          </Text>
        ) : null}
      </View>
      {exercise.sparkline_points.length > 1 ? (
        <Sparkline
          values={exercise.sparkline_points}
          color={lineColor}
          width={56}
          height={24}
          area={false}
          dot={false}
          showFlat
        />
      ) : null}
      <AuroraPill label={change} tone={tone} />
    </Pressable>
  );
}

const SESSION_STATUS: Record<
  RecentWorkoutHistoryItem['status'],
  { label: string; tone: AuroraTone; icon: AuroraIconName }
> = {
  completed: { label: 'Completada', tone: 'emerald', icon: 'checkmark' },
  in_progress: { label: 'En curso', tone: 'blue', icon: 'play' },
  abandoned: { label: 'Abandonada', tone: 'amber', icon: 'remove' },
};

/** Duración y carga de la sesión; sin carga (peso corporal) no se muestra «0 t». */
export const getSessionMetrics = (workout: RecentWorkoutHistoryItem, showDetails = false) => {
  const minutes = workout.duration_minutes ?? workout.cardio_duration_minutes;
  const parts = [minutes != null && minutes > 0 ? `${Math.max(1, Math.round(minutes))} min` : null];
  if (workout.session_kind === 'cardio') {
    parts.push(
      workout.cardio_distance_meters != null && workout.cardio_distance_meters > 0
        ? formatDistance(workout.cardio_distance_meters)
        : null,
    );
  } else if (workout.volume_kg > 0) {
    parts.push(formatTons(workout.volume_kg));
  }
  if (showDetails) {
    if (workout.cardio_calories_burned != null && workout.cardio_calories_burned > 0) {
      parts.push(formatCalories(workout.cardio_calories_burned));
    }
    if (workout.exercises_count > 0) {
      parts.push(`${workout.exercises_count} ${workout.exercises_count === 1 ? 'ejercicio' : 'ejercicios'}`);
    }
  }
  return parts.filter((part): part is string => part != null);
};

export function ProgressSessionRow({
  workout,
  onPress,
  showDetails = false,
}: {
  workout: RecentWorkoutHistoryItem;
  onPress: () => void;
  /** En el historial completo: calorías de cardio y número de ejercicios. */
  showDetails?: boolean;
}) {
  const aurora = useAurora();
  const status = SESSION_STATUS[workout.status] ?? SESSION_STATUS.completed;
  const metrics = getSessionMetrics(workout, showDetails);
  const longDate = formatLocalDate(workout.performed_on_date, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${workout.training_day_name}, ${longDate}. ${[...metrics, status.label].join(', ')}.`}
      accessibilityHint="Abre la sesión"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: aurora.surface2 } : null]}
    >
      <View style={[styles.dateTile, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}>
        <Text style={[styles.weekday, auroraFont('extrabold'), { color: aurora.tones.blue.ink }]}>
          {formatLocalDate(workout.performed_on_date, { weekday: 'short' }).replace('.', '')}
        </Text>
        <Text style={[styles.dayNumber, auroraFont('extrabold'), { color: aurora.text }]}>
          {formatLocalDate(workout.performed_on_date, { day: 'numeric' })}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, auroraFont('bold'), { color: aurora.text }]}>
          {workout.training_day_name}
        </Text>
        {metrics.length ? (
          <View style={styles.metrics}>
            {metrics.map((metric) => (
              <Text key={metric} style={[styles.meta, auroraFont('medium'), { color: aurora.faint }]}>
                {metric}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <AuroraPill label={status.label} tone={status.tone} icon={status.icon} />
    </Pressable>
  );
}

/** Tarjeta que agrupa filas, como «Ejercicios clave» y «Sesiones recientes». */
export const ProgressListGroup = ({ children }: { children: React.ReactNode }) => (
  <AuroraCard padding={GROUP_PADDING} radius={GROUP_RADIUS}>
    {children}
  </AuroraCard>
);

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export const getGroupPosition = (index: number, count: number): GroupPosition =>
  count <= 1 ? 'single' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

/**
 * Un tramo de la misma tarjeta para listas virtualizadas, donde cada fila es un elemento: la
 * primera y la última cierran las esquinas.
 */
export const ProgressGroupItem = ({
  position,
  children,
  style,
}: {
  position: GroupPosition;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const aurora = useAurora();
  const isFirst = position === 'first' || position === 'single';
  const isLast = position === 'last' || position === 'single';

  return (
    <View
      style={[
        styles.groupItem,
        {
          backgroundColor: aurora.surface,
          borderColor: aurora.border,
          borderTopWidth: isFirst ? 1 : 0,
          borderBottomWidth: isLast ? 1 : 0,
          borderTopLeftRadius: isFirst ? GROUP_RADIUS : 0,
          borderTopRightRadius: isFirst ? GROUP_RADIUS : 0,
          borderBottomLeftRadius: isLast ? GROUP_RADIUS : 0,
          borderBottomRightRadius: isLast ? GROUP_RADIUS : 0,
          paddingTop: isFirst ? GROUP_PADDING : 0,
          paddingBottom: isLast ? GROUP_PADDING : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: auroraRadius.chip + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    marginTop: 1,
  },
  dateTile: {
    width: 46,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 18,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
  },
  groupItem: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: GROUP_PADDING,
  },
});
