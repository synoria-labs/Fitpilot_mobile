import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import type { ExerciseTrendSummary, RecentWorkoutHistoryItem } from '../../types';
import { useAppTheme } from '../../theme';
import { formatLocalDate } from '../../utils/date';
import {
  buildLineCoordinates,
  buildPolylinePoints,
  formatDistance,
} from '../../utils/workoutAnalytics';
import {
  formatMetricValue,
  getProfileConfig,
  getSummaryMetricContext,
} from '../../utils/analyticsProfiles';
import { progressColors } from './progressTheme';

export function ProgressExerciseRow({
  exercise,
  onPress,
}: {
  exercise: ExerciseTrendSummary;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const profile = getProfileConfig(exercise.analytics_profile);
  const unit = exercise.primary_metric_unit ?? profile.primaryUnit;
  const isWeightMetric = unit === 'kg';
  const metric =
    exercise.primary_metric_value ??
    (isWeightMetric ? (exercise.best_recent_weight_kg ?? exercise.latest_best_weight_kg) : null);
  const context = getSummaryMetricContext(exercise);
  const delta =
    exercise.primary_metric_delta ?? (isWeightMetric ? exercise.best_weight_delta_kg : null);
  const trendColor =
    exercise.trend_status === 'declining'
      ? colors.amber
      : exercise.trend_status === 'rising'
        ? colors.green
        : colors.muted;
  const points = buildLineCoordinates(exercise.sparkline_points, 52, 26, {
    top: 3,
    right: 2,
    bottom: 3,
    left: 2,
  });
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Ver progreso de ${exercise.exercise_name}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons
          name={profile.id === 'cardio_progression' ? 'heart-outline' : 'barbell-outline'}
          size={17}
          color={colors.accent}
        />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>
          {exercise.exercise_name}
        </Text>
        <Text numberOfLines={2} style={[styles.meta, { color: colors.muted }]}>
          {profile.primaryMetric === 'e1rm' ? '1RM estimado' : 'Mejor registro'}:{' '}
          {metric == null ? 'Sin datos' : formatMetricValue(metric, unit)}
          {unit === 'kg' && profile.primaryMetric !== 'e1rm' && context?.reps_exact
            ? ` × ${context.reps_exact}`
            : ''}
        </Text>
      </View>
      {points.length > 1 ? (
        <Svg width={52} height={26} accessibilityLabel="Tendencia del ejercicio">
          <Polyline
            points={buildPolylinePoints(points)}
            fill="none"
            stroke={colors.accent}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
      <Text
        style={[
          styles.badge,
          {
            color: trendColor,
            backgroundColor: exercise.trend_status === 'rising' ? colors.greenSoft : colors.soft,
          },
        ]}
      >
        {delta != null && delta !== 0
          ? `${delta > 0 ? '+' : ''}${formatMetricValue(delta, unit)}`
          : exercise.trend_status === 'insufficient' || delta == null
            ? 'Sin comparar'
            : 'Estable'}
      </Text>
    </TouchableOpacity>
  );
}

export function ProgressSessionRow({
  workout,
  onPress,
}: {
  workout: RecentWorkoutHistoryItem;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const status =
    workout.status === 'completed'
      ? 'Completada'
      : workout.status === 'in_progress'
        ? 'En progreso'
        : 'Abandonada';
  const statusColor =
    workout.status === 'completed'
      ? colors.green
      : workout.status === 'in_progress'
        ? colors.accent
        : colors.amber;
  const metrics = [
    workout.duration_minutes != null ? `${Math.round(workout.duration_minutes)} min` : null,
    workout.session_kind === 'cardio'
      ? workout.cardio_distance_meters != null
        ? formatDistance(workout.cardio_distance_meters)
        : null
      : `${(workout.volume_kg / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} t`,
  ].filter(Boolean);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Ver sesión ${workout.training_day_name}, ${formatLocalDate(workout.performed_on_date, { day: 'numeric', month: 'long' })}, ${status}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <View style={[styles.date, { backgroundColor: colors.soft }]}>
        <Text style={[styles.weekday, { color: colors.accent }]}>
          {formatLocalDate(workout.performed_on_date, { weekday: 'short' }).replace('.', '')}
        </Text>
        <Text style={[styles.dayNumber, { color: colors.text }]}>
          {formatLocalDate(workout.performed_on_date, { day: 'numeric' })}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>
          {workout.training_day_name}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>{metrics.join('   ·   ')}</Text>
      </View>
      <View
        style={[
          styles.status,
          { backgroundColor: workout.status === 'completed' ? colors.greenSoft : colors.soft },
        ]}
      >
        <Ionicons
          name={
            workout.status === 'completed'
              ? 'checkmark'
              : workout.status === 'in_progress'
                ? 'play'
                : 'remove'
          }
          size={11}
          color={statusColor}
        />
        <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 76,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  meta: { fontSize: 10, lineHeight: 15 },
  badge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: 72,
  },
  date: { width: 35, paddingVertical: 4, borderRadius: 9, alignItems: 'center' },
  weekday: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  dayNumber: { fontSize: 19, fontWeight: '800' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  statusText: { fontSize: 9, fontWeight: '700' },
});
