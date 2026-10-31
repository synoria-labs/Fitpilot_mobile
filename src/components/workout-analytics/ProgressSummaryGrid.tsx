import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkoutAnalyticsMetricCard, WorkoutAnalyticsModules } from '../../types';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import { AuroraGlass, AuroraPill } from '../aurora';
import { Skeleton } from '../common/Skeleton';
import { useCountUp } from '../../hooks/useCountUp';
import { getWorkoutAnalyticsModules, peekWorkoutAnalyticsModules } from '../../services/workoutAnalytics';
import { addDaysToDateKey, getCalendarDayDiff } from '../../utils/date';
import { formatCount, formatDecimal, formatInteger } from '../../utils/formatters';
import { getMetricChange } from '../../utils/trainingProgress';
import { formatTons, getWorkoutAnalyticsRangeOption } from '../../utils/workoutAnalytics';

const COUNTED_CARDS = new Set(['sessions', 'volume', 'active_days', 'avg_duration']);
const LABELS: Record<string, string> = {
  sessions: 'Sesiones',
  volume: 'Volumen',
  active_days: 'Días activos',
  avg_duration: 'Duración',
};

const getSummaryCards = (modules: WorkoutAnalyticsModules | null | undefined) =>
  modules?.sections.find((section) => section.kind === 'summary_cards')?.cards ?? [];

/**
 * Los mismos indicadores en la ventana de igual largo que termina justo antes de la actual. Ese
 * periodo ya pasó: lo que guarda la memoria del servicio basta y no se escribe en el teléfono.
 */
const usePreviousPeriod = (
  modules: WorkoutAnalyticsModules,
  repBucketId: string | null,
  cacheUserId: string | number | null,
) => {
  const scope = modules.time_scope;
  const range = scope?.range_key;
  const anchorDate =
    modules.context.scope_kind === 'range' && range && range !== 'all' && scope?.start_date
      ? addDaysToDateKey(scope.start_date, -1)
      : null;
  const params = useMemo(
    () =>
      range && anchorDate
        ? { scopeKind: 'range' as const, range, repBucketId, anchorDate, cacheUserId, persist: false }
        : null,
    [anchorDate, cacheUserId, range, repBucketId],
  );
  const [state, setState] = useState(() => ({
    params,
    cards: params ? getSummaryCards(peekWorkoutAnalyticsModules(params)) : null,
  }));

  useEffect(() => {
    if (!params) {
      setState({ params, cards: null });
      return undefined;
    }
    const remembered = peekWorkoutAnalyticsModules(params);
    if (remembered) {
      setState({ params, cards: getSummaryCards(remembered) });
      return undefined;
    }
    let active = true;
    setState({ params, cards: null });
    getWorkoutAnalyticsModules(params)
      .then((result) => {
        if (active) {
          setState({ params, cards: getSummaryCards(result) });
        }
      })
      .catch(() => {
        // La comparación es opcional: sin ella los indicadores actuales siguen sirviendo.
      });
    return () => {
      active = false;
    };
  }, [params]);

  return state.params === params && state.cards?.length ? state.cards : null;
};

type SummaryCellProps = {
  card: WorkoutAnalyticsMetricCard;
  previous?: WorkoutAnalyticsMetricCard;
  weeks?: number;
  periodDays: number | null;
  plannedSessions: number | null;
  sessions: number | null;
};

const SummaryCell = ({ card, previous, weeks, periodDays, plannedSessions, sessions }: SummaryCellProps) => {
  const aurora = useAurora();
  const isVolume = card.id === 'volume';
  const counts = COUNTED_CARDS.has(card.id) && card.value != null;
  const shown = useCountUp(counts && card.value != null ? (isVolume ? card.value / 1000 : card.value) : null);
  const value =
    counts && shown != null
      ? isVolume
        ? formatDecimal(shown)
        : formatInteger(shown)
      : card.display_value;
  const unit =
    card.id === 'volume'
      ? ' t'
      : card.id === 'avg_duration'
        ? ' min'
        : card.id === 'active_days' && periodDays
          ? ` / ${periodDays}`
          : '';

  // «Días activos» se mide contra el plan cuando el plan dice cuántas sesiones tocaban.
  const planShare =
    card.id === 'active_days' && plannedSessions && sessions != null
      ? Math.round((sessions / plannedSessions) * 100)
      : null;
  const change = planShare == null ? getMetricChange(card, previous) : null;
  const pill: { label: string; tone: AuroraTone } | null =
    planShare != null
      ? { label: `${planShare}%`, tone: 'blue' }
      : change
        ? {
            label: change.label,
            tone:
              card.id === 'avg_duration' || change.value === 0 ? 'slate' : change.value > 0 ? 'emerald' : 'amber',
          }
        : null;

  const caption =
    card.id === 'sessions'
      ? previous?.value != null && weeks
        ? `vs. ${formatInteger(previous.value)} las ${weeks} previas`
        : 'en el periodo'
      : card.id === 'volume'
        ? previous?.value != null
          ? `vs. ${formatTons(previous.value)}`
          : 'levantado en el periodo'
        : card.id === 'active_days'
          ? plannedSessions
            ? `del plan: ${formatCount(plannedSessions, 'sesión', 'sesiones')}`
            : previous?.value != null
              ? `vs. ${formatInteger(previous.value)} antes`
              : 'con al menos una sesión'
          : card.id === 'avg_duration'
            ? 'media por sesión'
            : card.helper_text ?? '';

  return (
    <View
      accessible
      accessibilityLabel={`${LABELS[card.id] ?? card.label}: ${card.display_value}${pill ? `, ${pill.label}` : ''}. ${caption}`}
      style={[styles.cell, { backgroundColor: aurora.surface }]}
    >
      <View style={styles.cellHeader}>
        <Text numberOfLines={1} style={[auroraType.label, styles.label, { color: aurora.faint }]}>
          {LABELS[card.id] ?? card.label}
        </Text>
        {pill ? <AuroraPill label={pill.label} tone={pill.tone} /> : null}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}>
        {value}
        {unit ? <Text style={[styles.unit, auroraFont('bold'), { color: aurora.faint }]}>{unit}</Text> : null}
      </Text>
      {caption ? (
        <Text numberOfLines={1} style={[styles.caption, auroraFont('medium'), { color: aurora.faint }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
};

/** Resumen del periodo: cuatro indicadores en vidrio, comparados con el periodo anterior. */
export function ProgressSummaryGrid({
  modules,
  repBucketId,
  plannedSessions,
  cacheUserId,
}: {
  modules: WorkoutAnalyticsModules;
  /** El rango de repeticiones con el que se pidió `modules`, para comparar igual. */
  repBucketId: string | null;
  /** Sesiones que el plan tenía en el periodo, si se conocen. */
  plannedSessions: number | null;
  cacheUserId: string | number | null;
}) {
  const cards = getSummaryCards(modules);
  const previous = usePreviousPeriod(modules, repBucketId, cacheUserId);
  const scope = modules.time_scope;
  const periodDays =
    scope?.start_date && scope.end_date ? getCalendarDayDiff(scope.start_date, scope.end_date) + 1 : null;
  const weeks = scope?.range_key ? getWorkoutAnalyticsRangeOption(scope.range_key).weeks ?? undefined : undefined;
  const sessions = cards.find((card) => card.id === 'sessions')?.value ?? null;

  if (!cards.length) {
    return null;
  }

  return (
    <AuroraGlass radius={26} padding={6} elevated>
      <View style={styles.grid}>
        {cards.map((card) => (
          <SummaryCell
            key={card.id}
            card={card}
            previous={previous?.find((item) => item.id === card.id)}
            weeks={weeks}
            periodDays={periodDays}
            plannedSessions={modules.context.scope_kind === 'range' ? plannedSessions : null}
            sessions={sessions}
          />
        ))}
      </View>
    </AuroraGlass>
  );
}

/** Mismo contenedor mientras llega el primer resumen. */
export function ProgressSummarySkeleton() {
  const aurora = useAurora();

  return (
    <AuroraGlass radius={26} padding={6} elevated>
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((item) => (
          <View key={item} style={[styles.cell, { backgroundColor: aurora.surface }]}>
            <Skeleton width="55%" height={10} borderRadius={5} />
            <Skeleton width="45%" height={26} borderRadius={8} style={styles.skeletonValue} />
            <Skeleton width="70%" height={10} borderRadius={5} />
          </View>
        ))}
      </View>
    </AuroraGlass>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 20,
  },
  cellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  label: {
    flexShrink: 1,
  },
  value: {
    marginTop: 8,
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
    letterSpacing: 0,
  },
  caption: {
    marginTop: 4,
    fontSize: 11.5,
    lineHeight: 15,
  },
  skeletonValue: {
    marginVertical: 10,
  },
});
