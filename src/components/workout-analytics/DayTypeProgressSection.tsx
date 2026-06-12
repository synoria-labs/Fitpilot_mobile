import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type {
  DayTypeExerciseProgress,
  DayTypeSeriesDetail,
  DayTypeSeriesSummary,
  ExerciseTrendStatus,
} from '../../types';
import { getDayTypeSeriesDetail, getDayTypeSeriesList } from '../../services/workoutAnalytics';
import { buildLineCoordinates, buildPolylinePoints } from '../../utils/workoutAnalytics';

const SPARK_HEIGHT = 90;
const SPARK_PADDING = { top: 12, right: 12, bottom: 12, left: 12 };
const ROTATION_LIMIT = 8;

const TREND_LABEL: Record<ExerciseTrendStatus, string> = {
  rising: '▲ Mejora',
  declining: '▼ Cae',
  stable: '→ Estable',
  insufficient: 'Sin datos',
};

function trendColor(theme: AppTheme, status: ExerciseTrendStatus | null): string {
  if (status === 'rising') return theme.colors.success;
  if (status === 'declining') return theme.colors.error;
  return theme.colors.textMuted;
}

interface SelectedSeries {
  dayType: string;
  variant: string | null;
}

interface ExerciseCardProps {
  exercise: DayTypeExerciseProgress;
  width: number;
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({ exercise, width }) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const values = useMemo(
    () =>
      exercise.points
        .filter((point) => point.performed && point.primary_metric_value != null)
        .map((point) => point.primary_metric_value as number),
    [exercise.points],
  );

  const coordinates = useMemo(
    () => buildLineCoordinates(values, width, SPARK_HEIGHT, SPARK_PADDING),
    [values, width],
  );
  const polyline = useMemo(() => buildPolylinePoints(coordinates), [coordinates]);

  const delta = exercise.delta_vs_prev;
  const unit = exercise.primary_unit ?? '';
  const color = trendColor(theme, exercise.trend_status);

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {exercise.exercise_name}
        </Text>
        <Text style={[styles.trendBadge, { color }]}>
          {TREND_LABEL[exercise.trend_status]}
        </Text>
      </View>
      {values.length >= 2 ? (
        <>
          <Svg width={width} height={SPARK_HEIGHT}>
            <Polyline
              points={polyline}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={2}
            />
            {coordinates.map((coordinate, index) => (
              <Circle
                key={index}
                cx={coordinate.x}
                cy={coordinate.y}
                r={3}
                fill={theme.colors.primary}
              />
            ))}
          </Svg>
          <View style={styles.exerciseFooter}>
            <Text style={styles.metricLabel}>
              {exercise.primary_metric ?? 'métrica'} · {values.length} rotaciones
            </Text>
            {delta != null && delta !== 0 ? (
              <Text style={[styles.delta, { color: delta > 0 ? theme.colors.success : theme.colors.error }]}>
                {delta > 0 ? '+' : ''}
                {delta} {unit}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <Text style={styles.emptyText}>Se necesitan al menos 2 rotaciones.</Text>
      )}
    </View>
  );
};

export const DayTypeProgressSection: React.FC = () => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const [series, setSeries] = useState<DayTypeSeriesSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedSeries | null>(null);
  const [detail, setDetail] = useState<DayTypeSeriesDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const cardWidth = Math.min(Dimensions.get('window').width - spacing.lg * 2 - spacing.md * 2, 520);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    getDayTypeSeriesList({ scopeKind: 'program' })
      .then((response) => {
        if (!active) return;
        setSeries(response.series ?? []);
        if (response.series?.length && !selected) {
          setSelected({
            dayType: response.series[0].day_type ?? '',
            variant: response.series[0].variant,
          });
        }
      })
      .catch(() => active && setSeries([]))
      .finally(() => active && setListLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected?.dayType) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    getDayTypeSeriesDetail(selected.dayType, {
      scopeKind: 'program',
      variant: selected.variant ?? undefined,
      limit: ROTATION_LIMIT,
    })
      .then((response) => active && setDetail(response))
      .catch(() => active && setDetail(null))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [selected?.dayType, selected?.variant]);

  const isSelected = (item: DayTypeSeriesSummary) =>
    selected?.dayType === (item.day_type ?? '') &&
    (selected?.variant ?? null) === (item.variant ?? null);

  if (listLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (series.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          Aún no hay rotaciones clasificadas en tu programa activo.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Progreso por tipo de día</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {series.map((item) => (
          <Pressable
            key={`${item.day_type}-${item.variant ?? ''}`}
            onPress={() => setSelected({ dayType: item.day_type ?? '', variant: item.variant })}
            style={[styles.chip, isSelected(item) && styles.chipActive]}
          >
            <Text style={[styles.chipText, isSelected(item) && styles.chipTextActive]}>
              {item.display_name}
            </Text>
            <Text style={styles.chipCount}>×{item.rotations_count}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {detailLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : detail ? (
        <View style={styles.detail}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{detail.display_name}</Text>
            <Text style={[styles.trendBadge, { color: trendColor(theme, detail.trend_status) }]}>
              {TREND_LABEL[detail.trend_status ?? 'insufficient']}
            </Text>
          </View>
          <Text style={styles.detailSubtitle}>
            {detail.rotations_count} rotaciones · volumen de sesión
          </Text>
          {detail.exercises.map((exercise) => (
            <ExerciseCard key={exercise.exercise_id} exercise={exercise} width={cardWidth} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Selecciona un tipo de día.</Text>
      )}
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    centered: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    chipsRow: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    chipActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    chipText: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    chipTextActive: {
      color: theme.colors.primary,
    },
    chipCount: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    detail: {
      gap: spacing.md,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    detailTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    detailSubtitle: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      marginTop: -spacing.xs,
    },
    exerciseCard: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: spacing.xs,
    },
    exerciseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    exerciseName: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    exerciseFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metricLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    delta: {
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    trendBadge: {
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    emptyCard: {
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });

export default DayTypeProgressSection;
