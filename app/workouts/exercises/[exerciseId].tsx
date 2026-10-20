import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, LoadingSpinner } from '../../../src/components/common';
import { VideoPlayerModal, YouTubePlayerModal } from '../../../src/components/video';
import { AnalyticsRangeSelector } from '../../../src/components/workout-analytics/AnalyticsRangeSelector';
import { ExerciseTrendChart } from '../../../src/components/workout-analytics/ExerciseTrendChart';
import { WorkoutAnalyticsPillSelector } from '../../../src/components/workout-analytics/WorkoutAnalyticsPillSelector';
import { DEFAULT_WORKOUT_ANALYTICS_RANGE } from '../../../src/constants/workoutAnalytics';
import { borderRadius, fontSize, shadows, spacing } from '../../../src/constants/colors';
import { getWorkoutAnalyticsExerciseDetail } from '../../../src/services/workoutAnalytics';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../../src/theme';
import type {
  ApiError,
  ExerciseDetailMetric,
  ExerciseTrendDetail,
  RepRangeBucket,
  WorkoutAnalyticsRange,
  WorkoutAnalyticsScopeKind,
} from '../../../src/types';
import { formatLocalDate } from '../../../src/utils/date';
import {
  formatCalories,
  formatDistance,
  formatVolumeKg,
  formatWeightKg,
  normalizeWorkoutAnalyticsRange,
} from '../../../src/utils/workoutAnalytics';
import {
  formatMetricValue,
  formatMetricContext,
  getAvailableMetrics,
  getDefaultMetric,
  getMetricChartSubtitle,
  getMetricLabel,
  getMetricValue,
  getPointMetricContext,
  getPrimaryMetricPersonalBest,
  getProfileConfig,
  getProfileContextCopy,
  getProfilePrimaryMetricLabel,
} from '../../../src/utils/analyticsProfiles';
import { resolveTechniqueMedia } from '../../../src/utils/exerciseTechnique';

// METRIC_CHART_SUBTITLES removed (now in analyticsProfiles.ts)
const YOUTUBE_RED = '#FF0000';

const getPointBucketEntries = (
  bucketTotals: Record<string, number> | null | undefined,
  repRangeMap: Record<string, string>,
) =>
  Object.entries(bucketTotals ?? {})
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([bucketId, value]) => ({
      bucketId,
      label: repRangeMap[bucketId] ?? bucketId,
      value,
    }));

type SummaryCardItem = {
  label: string;
  value: string;
  context: string | null;
};

type RecordMetricItem = {
  key: string;
  label: string;
  value: string;
  context: string | null;
};

const isPresent = <T,>(value: T | null): value is T => value !== null;

export default function ExerciseTrendDetailScreen() {
  const {
    exerciseId,
    range: rangeParam,
    scopeKind: scopeKindParam,
    repBucketId,
    macrocycleId,
    mesocycleId,
    microcycleId,
  } = useLocalSearchParams<{
    exerciseId: string;
    range?: string;
    scopeKind?: string;
    repBucketId?: string;
    macrocycleId?: string;
    mesocycleId?: string;
    microcycleId?: string;
  }>();
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<WorkoutAnalyticsRange>(
    normalizeWorkoutAnalyticsRange(rangeParam, DEFAULT_WORKOUT_ANALYTICS_RANGE),
  );
  const scopeKind: WorkoutAnalyticsScopeKind =
    scopeKindParam === 'microcycle' ||
    scopeKindParam === 'mesocycle' ||
    scopeKindParam === 'program'
      ? scopeKindParam
      : 'range';
  const [selectedMetric, setSelectedMetric] = useState<ExerciseDetailMetric>('best_weight');
  const [detail, setDetail] = useState<ExerciseTrendDetail | null>(null);
  const [effectiveRepBucketId, setEffectiveRepBucketId] = useState<string | null>(repBucketId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechniqueVideoModal, setShowTechniqueVideoModal] = useState(false);
  const [showTechniqueYouTubeModal, setShowTechniqueYouTubeModal] = useState(false);

  useEffect(() => {
    setRange(normalizeWorkoutAnalyticsRange(rangeParam, DEFAULT_WORKOUT_ANALYTICS_RANGE));
  }, [rangeParam]);

  useEffect(() => {
    setEffectiveRepBucketId(repBucketId ?? null);
  }, [repBucketId]);

  const loadDetail = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!exerciseId) {
        return;
      }

      const isRefresh = options?.refresh ?? false;
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await getWorkoutAnalyticsExerciseDetail(exerciseId, range, undefined, {
          scopeKind,
          repBucketId: scopeKind === 'range' ? effectiveRepBucketId : null,
          macrocycleId: macrocycleId ?? null,
          mesocycleId: mesocycleId ?? null,
          microcycleId: microcycleId ?? null,
        });
        setDetail(response);
        setError(null);
        setSelectedMetric(getDefaultMetric(response));
      } catch (loadError) {
        const apiError = loadError as ApiError;
        if (apiError.status === 422 && effectiveRepBucketId) {
          setEffectiveRepBucketId(null);
          setError(null);
          return;
        }
        setError(apiError.message || 'No fue posible cargar este ejercicio.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [effectiveRepBucketId, exerciseId, macrocycleId, mesocycleId, microcycleId, range, scopeKind],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const repRangeMap = useMemo(() => {
    const entries = (detail?.preferences.rep_ranges ?? []).map((bucket: RepRangeBucket) => [
      bucket.id,
      bucket.label,
    ]);
    return Object.fromEntries(entries);
  }, [detail?.preferences.rep_ranges]);
  const selectedRepBucketLabel = useMemo(() => {
    if (!effectiveRepBucketId) {
      return null;
    }

    return (detail?.preferences.rep_ranges ?? []).find((bucket) => bucket.id === effectiveRepBucketId)?.label ?? null;
  }, [detail?.preferences.rep_ranges, effectiveRepBucketId]);

  const hasEffortData = useMemo(
    () => (detail?.series ?? []).some((point) => point.avg_effort != null),
    [detail?.series],
  );

  const metricOptions = useMemo(() => {
    return getAvailableMetrics(detail).map((option) => ({
      value: option.key,
      label: option.label,
      disabled: !option.available,
    }));
  }, [detail]);

  const primaryMetricPersonalBest = useMemo(
    () => getPrimaryMetricPersonalBest(detail),
    [detail],
  );
  const profileConfig = getProfileConfig(detail?.analytics_profile);
  const supportsRepRangeBuckets =
    detail?.display_hints?.show_rep_range_buckets ?? profileConfig.showRepRangeBuckets;
  const activeRepBucketLabel = supportsRepRangeBuckets ? selectedRepBucketLabel : null;
  const profileContextCopy = getProfileContextCopy(detail?.analytics_profile);
  const primaryMetricLabel = getProfilePrimaryMetricLabel(detail?.analytics_profile);

  const summaryCards = useMemo(() => {
    if (!detail) {
      return [];
    }

    if (profileConfig.id === 'cardio_progression') {
      const cards: (SummaryCardItem | null)[] = [
        {
          label: `${primaryMetricPersonalBest.label} PR`,
          value: formatMetricValue(primaryMetricPersonalBest.value, primaryMetricPersonalBest.unit),
          context: null,
        },
        { label: 'Sesiones', value: `${detail.summary.total_sessions}`, context: null },
        detail.summary.total_duration_minutes != null && detail.summary.total_duration_minutes > 0
          ? {
              label: 'Duración total',
              value: formatMetricValue(detail.summary.total_duration_minutes, 'min'),
              context: null,
            }
          : null,
        detail.summary.total_calories_burned != null && detail.summary.total_calories_burned > 0
          ? {
              label: 'Calorías',
              value: formatCalories(detail.summary.total_calories_burned),
              context: null,
            }
          : null,
        detail.summary.total_distance_meters != null && detail.summary.total_distance_meters > 0
          ? {
              label: 'Distancia',
              value: formatDistance(detail.summary.total_distance_meters),
              context: null,
            }
          : null,
        {
          label: 'Última',
          value: detail.summary.last_logged_at
            ? formatLocalDate(detail.summary.last_logged_at, { day: 'numeric', month: 'short' })
            : '--',
          context: null,
        },
      ];

      return cards.filter(isPresent);
    }

    const base: SummaryCardItem[] = [
      {
        label: `${primaryMetricPersonalBest.label} PR`,
        value: formatMetricValue(primaryMetricPersonalBest.value, primaryMetricPersonalBest.unit),
        context: formatMetricContext(profileConfig.primaryMetric, primaryMetricPersonalBest.context, {
          variant: 'summary_compact',
        }),
      },
      { label: 'Sesiones', value: `${detail.summary.total_sessions}`, context: null },
      {
        label: 'Primera',
        value: detail.summary.first_logged_at
          ? formatLocalDate(detail.summary.first_logged_at, { day: 'numeric', month: 'short' })
          : '--',
        context: null,
      },
      {
        label: 'Última',
        value: detail.summary.last_logged_at
          ? formatLocalDate(detail.summary.last_logged_at, { day: 'numeric', month: 'short' })
          : '--',
        context: null,
      },
    ];

    return base;
  }, [detail, primaryMetricPersonalBest, profileConfig.id, profileConfig.primaryMetric]);

  const chartSubtitle = getMetricChartSubtitle(selectedMetric);
  const metricLabel = getMetricLabel(selectedMetric);
  const techniqueMedia = useMemo(() => resolveTechniqueMedia(detail?.exercise_media), [detail?.exercise_media]);
  const techniquePreviewUrl = techniqueMedia.gifUrl ?? techniqueMedia.posterUrl;
  const techniqueActionLabel = techniqueMedia.useYouTubeModal
    ? techniqueMedia.videoUrl
      ? 'Abrir en YouTube'
      : 'Buscar en YouTube'
    : 'Reproducir técnica';
  const techniqueCaption = techniqueMedia.useYouTubeModal
    ? techniqueMedia.videoUrl
      ? 'Abre la demostración publicada para este ejercicio.'
      : 'Usa la búsqueda automática en YouTube cuando no exista un video vinculado.'
    : 'Reproduce el video técnico vinculado desde el catálogo.';
  const scopeLabel =
    scopeKind === 'microcycle'
      ? 'Microciclo'
      : scopeKind === 'mesocycle'
        ? 'Bloque'
        : scopeKind === 'program'
          ? 'Programa'
          : 'Ventana';

  if (isLoading && !detail) {
    return <LoadingSpinner fullScreen text="Cargando progreso del ejercicio..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{detail?.exercise_name ?? 'Ejercicio'}</Text>
          <Text style={styles.subtitle}>
            {scopeKind === 'range'
              ? effectiveRepBucketId && activeRepBucketLabel
                ? `Evolución de ${metricLabel.toLowerCase()} en ${activeRepBucketLabel} a lo largo del tiempo`
                : `Evolución de ${metricLabel.toLowerCase()} a lo largo del tiempo`
              : `Evolución de ${metricLabel.toLowerCase()} dentro del ${scopeLabel.toLowerCase()} seleccionado`}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadDetail({ refresh: true })}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        {scopeKind === 'range' ? (
          <AnalyticsRangeSelector value={range} onChange={setRange} />
        ) : (
          <View style={styles.scopeCard}>
            <Text style={styles.scopeEyebrow}>Contexto</Text>
            <Text style={styles.scopeTitle}>{scopeLabel}</Text>
            <Text style={styles.scopeText}>
              Esta vista hereda el contexto programatico seleccionado y no usa selector de ventana.
            </Text>
          </View>
        )}

        {scopeKind === 'range' && effectiveRepBucketId && activeRepBucketLabel ? (
          <View style={styles.scopeCard}>
            <Text style={styles.scopeEyebrow}>Filtro</Text>
            <Text style={styles.scopeTitle}>{activeRepBucketLabel} reps</Text>
            <Text style={styles.scopeText}>
              Tendencia y registros muestran solo matches del rango seleccionado desde Entrenamientos.
            </Text>
          </View>
        ) : null}

        {detail ? (
          <Card style={styles.techniqueCard}>
            <View style={styles.techniqueHeader}>
              <View style={styles.techniqueHeaderCopy}>
                <Text style={styles.techniqueEyebrow}>Técnica</Text>
                <Text style={styles.techniqueTitle}>Video y referencia</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Abrir técnica de ${detail.exercise_name}`}
                activeOpacity={0.88}
                style={[
                  styles.techniqueActionButton,
                  techniqueMedia.useYouTubeModal && styles.techniqueActionButtonYouTube,
                ]}
                testID="exercise-detail-technique-button"
                onPress={() => {
                  if (techniqueMedia.useYouTubeModal) {
                    setShowTechniqueYouTubeModal(true);
                    return;
                  }
                  setShowTechniqueVideoModal(true);
                }}
              >
                <Ionicons
                  name={techniqueMedia.useYouTubeModal ? 'logo-youtube' : 'play'}
                  size={16}
                  color="white"
                />
                <Text style={styles.techniqueActionButtonText}>{techniqueActionLabel}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.techniqueText}>{techniqueCaption}</Text>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.techniquePreview}
              onPress={() => {
                if (techniqueMedia.useYouTubeModal) {
                  setShowTechniqueYouTubeModal(true);
                  return;
                }
                setShowTechniqueVideoModal(true);
              }}
            >
              {techniquePreviewUrl ? (
                <Image source={{ uri: techniquePreviewUrl }} style={styles.techniquePreviewImage} resizeMode="cover" />
              ) : (
                <View style={styles.techniquePreviewPlaceholder}>
                  <Ionicons
                    name={techniqueMedia.useYouTubeModal ? 'logo-youtube' : 'play-circle'}
                    size={34}
                    color={techniqueMedia.useYouTubeModal ? YOUTUBE_RED : theme.colors.primary}
                  />
                  <Text style={styles.techniquePreviewPlaceholderText}>Abrir referencia técnica</Text>
                </View>
              )}
              <View style={styles.techniquePreviewOverlay}>
                <View style={styles.techniquePreviewBadge}>
                  <Ionicons
                    name={techniqueMedia.useYouTubeModal ? 'logo-youtube' : 'play'}
                    size={14}
                    color="white"
                  />
                  <Text style={styles.techniquePreviewBadgeText}>{techniqueActionLabel}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Card>
        ) : null}

        <View style={styles.metricSelectorWrap}>
          <Text style={styles.metricSelectorLabel}>Métrica</Text>
          <WorkoutAnalyticsPillSelector
            items={metricOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={selectedMetric}
            onChange={(value) => setSelectedMetric(value as ExerciseDetailMetric)}
          />
          {selectedMetric === 'effort' && !hasEffortData ? (
            <Text style={styles.metricDisabledHint}>No hay datos de esfuerzo registrados en este rango.</Text>
          ) : null}
        </View>

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>No fue posible cargar el ejercicio</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Reintentar" onPress={() => void loadDetail()} />
          </Card>
        ) : null}

        {summaryCards.length ? (
          <View style={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <View key={card.label} style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{card.value}</Text>
                {card.context ? <Text style={styles.summaryContext}>{card.context}</Text> : null}
                <Text style={styles.summaryLabel}>{card.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Card style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Tendencia de {metricLabel.toLowerCase()}</Text>
          <Text style={styles.sectionSubtitle}>
            {effectiveRepBucketId && activeRepBucketLabel
              ? `${chartSubtitle} Solo considera sets en ${activeRepBucketLabel}.`
              : chartSubtitle}
          </Text>
          <Text style={styles.profileHint}>{profileContextCopy}</Text>
          <ExerciseTrendChart
            series={detail?.series ?? []}
            repRanges={detail?.preferences.rep_ranges ?? []}
            contentWidth={Math.max(width - spacing.lg * 2, 280)}
            metric={selectedMetric}
            displayHints={detail?.display_hints}
          />
        </Card>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Registros</Text>
          <Text style={styles.sectionSubtitleSmall}>
            {effectiveRepBucketId && activeRepBucketLabel
              ? `Historial filtrado por ${activeRepBucketLabel} dentro del periodo seleccionado.`
              : 'Historial detallado de cada sesión en el periodo seleccionado.'}
          </Text>
          {detail?.series.length ? (
            detail.series
              .slice()
              .reverse()
              .map((point) => {
                const bucketEntries = getPointBucketEntries(point.rep_bucket_totals, repRangeMap);
                const recordBucketLabel = supportsRepRangeBuckets
                  ? bucketEntries.length > 1
                    ? 'Mixta'
                    : bucketEntries.length === 1
                      ? bucketEntries[0].label
                      : point.reps_bucket_id
                        ? repRangeMap[point.reps_bucket_id] || 'Sin bucket'
                        : 'Sin bucket'
                  : null;
                const primaryMetricValue = getMetricValue(point, profileConfig.primaryMetric);
                const recordMetricItems: RecordMetricItem[] = (profileConfig.id === 'cardio_progression'
                  ? [
                      {
                        key: 'primary',
                        label: primaryMetricLabel,
                        value: formatMetricValue(primaryMetricValue, profileConfig.primaryUnit),
                        context: null,
                      },
                      point.calories_burned != null &&
                      point.calories_burned > 0 &&
                      profileConfig.primaryMetric !== 'calories'
                        ? {
                            key: 'calories',
              label: 'Calorías',
                            value: formatCalories(point.calories_burned),
                            context: null,
                          }
                        : null,
                      point.distance_meters != null &&
                      point.distance_meters > 0 &&
                      profileConfig.primaryMetric !== 'distance'
                        ? {
                            key: 'distance',
                            label: 'Distancia',
                            value: formatDistance(point.distance_meters),
                            context: null,
                          }
                        : null,
                      point.avg_effort != null
                        ? {
                            key: 'effort',
                            label: 'Esfuerzo',
                            value: point.avg_effort.toFixed(1),
                            context: null,
                          }
                        : null,
                    ].filter(isPresent)
                  : [
                      {
                        key: 'primary',
                        label: primaryMetricLabel,
                        value: formatMetricValue(primaryMetricValue, profileConfig.primaryUnit),
                        context: formatMetricContext(
                          profileConfig.primaryMetric,
                          getPointMetricContext(point, profileConfig.primaryMetric),
                          { variant: 'record_detail' },
                        ),
                      },
                      point.total_hold_seconds != null &&
                      point.total_hold_seconds > 0 &&
                      profileConfig.primaryMetric !== 'total_hold_seconds'
                        ? {
                            key: 'total_hold_seconds',
                            label: 'Tiempo total',
                            value: formatMetricValue(point.total_hold_seconds, 's'),
                            context: null,
                          }
                        : null,
                      profileConfig.id === 'isometric_hold' &&
                      point.best_weight_kg != null &&
                      point.best_weight_kg > 0
                        ? {
                            key: 'hold_weight',
                            label: 'Lastre',
                            value: formatWeightKg(point.best_weight_kg),
                            context: null,
                          }
                        : null,
                      point.volume_kg > 0 && profileConfig.primaryMetric !== 'volume'
                        ? {
                            key: 'volume',
                            label: 'Volumen',
                            value: formatVolumeKg(point.volume_kg),
                            context: null,
                          }
                        : null,
                      point.best_reps != null &&
                      point.best_reps > 0 &&
                      profileConfig.primaryMetric !== 'best_reps'
                        ? {
                            key: 'best_reps',
                            label: 'Mejor reps',
                            value: `${point.best_reps} reps`,
                            context: formatMetricContext(
                              'best_reps',
                              getPointMetricContext(point, 'best_reps'),
                              {
                                variant: 'record_detail',
                              },
                            ),
                          }
                        : null,
                      point.total_reps != null &&
                      point.total_reps > 0 &&
                      profileConfig.primaryMetric !== 'total_reps'
                        ? {
                            key: 'total_reps',
                            label: 'Total reps',
                            value: `${point.total_reps} reps`,
                            context: null,
                          }
                        : null,
                      point.e1rm_kg != null &&
                      point.e1rm_kg > 0 &&
                      profileConfig.primaryMetric !== 'e1rm'
                        ? {
                            key: 'e1rm',
                            label: '1RM est.',
                            value: formatWeightKg(point.e1rm_kg),
                            context: formatMetricContext('e1rm', getPointMetricContext(point, 'e1rm'), {
                              variant: 'record_detail',
                            }),
                          }
                        : null,
                      point.relative_intensity_pct != null
                        ? {
                            key: 'relative_intensity',
                            label: 'Intensidad rel.',
                            value: `${point.relative_intensity_pct.toFixed(1)}%`,
                            context: null,
                          }
                        : null,
                      point.avg_effort != null
                        ? {
                            key: 'effort',
                            label: 'Esfuerzo',
                            value: point.avg_effort.toFixed(1),
                            context: null,
                          }
                        : null,
                      point.adherence_ratio != null
                        ? {
                            key: 'adherence',
                            label: 'Adherencia',
                            value: `${point.adherence_ratio.toFixed(2)}x`,
                            context: null,
                          }
                        : null,
                      point.top_set_backoff_delta_kg != null
                        ? {
                            key: 'top_vs_backoff',
                            label: 'Top vs backoff',
                            value: formatWeightKg(point.top_set_backoff_delta_kg),
                            context: null,
                          }
                        : null,
                      point.backoff_volume_kg != null && point.backoff_volume_kg > 0
                        ? {
                            key: 'backoff_volume',
                            label: 'Vol. backoff',
                            value: formatVolumeKg(point.backoff_volume_kg),
                            context: null,
                          }
                        : null,
                    ].filter(isPresent)) as RecordMetricItem[];

                return (
                  <View key={point.performed_on_date} style={styles.recordCard}>
                    <View style={styles.recordTopRow}>
                      <Text style={styles.recordDate}>
                        {formatLocalDate(point.performed_on_date, {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                      {recordBucketLabel ? (
                        <View style={styles.recordBucket}>
                          <Text style={styles.recordBucketText}>{recordBucketLabel}</Text>
                        </View>
                      ) : null}
                    </View>

                    {supportsRepRangeBuckets && bucketEntries.length ? (
                      <View style={styles.recordBucketsRow}>
                        {bucketEntries.map((bucket) => (
                          <View key={`${point.performed_on_date}-${bucket.bucketId}`} style={styles.recordBucketChip}>
                            <Text style={styles.recordBucketChipText}>
                              {bucket.label} | {formatVolumeKg(bucket.value)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.recordStatsRow}>
                      {recordMetricItems.map((item) => (
                        <View key={`${point.performed_on_date}-${item.key}`} style={styles.recordStatPill}>
                          <Text style={styles.recordStatLabel}>{item.label}</Text>
                          <Text style={styles.recordStatValue}>{item.value}</Text>
                          {item.context ? (
                            <Text style={styles.recordStatContext}>{item.context}</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons name="analytics-outline" size={40} color={theme.colors.iconMuted} />
              <Text style={styles.emptyTitle}>Sin registros en este rango</Text>
              <Text style={styles.emptyText}>
                {activeRepBucketLabel
                  ? `No hay registros de este ejercicio en ${activeRepBucketLabel}. Limpia el filtro o cambia la ventana temporal.`
                  : 'Cambia la ventana temporal para revisar más sesiones de este ejercicio.'}
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>

      {detail && !techniqueMedia.useYouTubeModal && techniqueMedia.videoUrl ? (
        <VideoPlayerModal
          visible={showTechniqueVideoModal}
          exerciseName={detail.exercise_name}
          videoUri={techniqueMedia.videoUrl}
          onClose={() => setShowTechniqueVideoModal(false)}
        />
      ) : null}

      {detail ? (
        <YouTubePlayerModal
          visible={showTechniqueYouTubeModal}
          exerciseName={detail.exercise_name}
          youtubeUrl={techniqueMedia.useYouTubeModal && techniqueMedia.videoUrl ? techniqueMedia.videoUrl : undefined}
          onClose={() => setShowTechniqueYouTubeModal(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl + 80,
      gap: spacing.lg,
    },
    scopeCard: {
      gap: spacing.xs,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
    },
    scopeEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    scopeTitle: {
      fontSize: fontSize.base,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    scopeText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    techniqueCard: {
      gap: spacing.md,
      padding: spacing.lg,
    },
    techniqueHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    techniqueHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    techniqueEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    techniqueTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    techniqueText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    techniqueActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    techniqueActionButtonYouTube: {
      backgroundColor: YOUTUBE_RED,
    },
    techniqueActionButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: 'white',
    },
    techniquePreview: {
      height: 180,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    techniquePreviewImage: {
      width: '100%',
      height: '100%',
    },
    techniquePreviewPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: spacing.lg,
    },
    techniquePreviewPlaceholderText: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    techniquePreviewOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      padding: spacing.md,
    },
    techniquePreviewBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(15, 23, 42, 0.78)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    techniquePreviewBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: 'white',
    },
    metricSelectorWrap: {
      gap: spacing.sm,
    },
    metricSelectorLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    metricDisabledHint: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      fontStyle: 'italic',
    },
    errorCard: {
      gap: spacing.sm,
    },
    errorTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    errorText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    summaryCard: {
      width: '48%',
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      ...shadows.sm,
    },
    summaryValue: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    summaryContext: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    summaryLabel: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    chartCard: {
      padding: spacing.lg,
    },
    profileHint: {
      marginBottom: spacing.md,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    sectionContainer: {
      gap: spacing.md,
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    sectionSubtitle: {
      marginTop: spacing.xs,
      marginBottom: spacing.md,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    sectionSubtitleSmall: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    recordCard: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      ...shadows.sm,
    },
    recordTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      alignItems: 'center',
    },
    recordDate: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textTransform: 'capitalize',
    },
    recordBucket: {
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    recordBucketText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    recordBucketsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    recordBucketChip: {
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    recordBucketChipText: {
      fontSize: fontSize.xs,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    recordStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    recordStatPill: {
      flex: 1,
      minWidth: 70,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.sm,
    },
    recordStatLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    recordStatValue: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    recordStatContext: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    emptyCard: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    emptyTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });
