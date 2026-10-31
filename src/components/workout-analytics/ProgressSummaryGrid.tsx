import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkoutAnalyticsMetricCard, WorkoutAnalyticsModules, WorkoutAnalyticsRange } from '../../types';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import { AuroraGlass, AuroraPill } from '../aurora';
import { Skeleton } from '../common/Skeleton';
import { useCountUp } from '../../hooks/useCountUp';
import { getWorkoutAnalyticsModules } from '../../services/workoutAnalytics';
import { addDaysToDateKey, getCalendarDayDiff } from '../../utils/date';
import { getMetricChange } from '../../utils/trainingProgress';

const RANGE_WEEKS: Partial<Record<WorkoutAnalyticsRange, number>> = { '2w': 2, '4w': 4, '8w': 8, '12w': 12 };
const COUNTED_CARDS = new Set(['sessions', 'volume', 'active_days', 'avg_duration']);
const LABELS: Record<string, string> = {
  sessions: 'Sesiones',
  volume: 'Volumen',
  active_days: 'Días activos',
  avg_duration: 'Duración',
};

// El periodo anterior ya pasó: lo pedido una vez sirve para toda la sesión de la app.
const previousCache = new Map<string, WorkoutAnalyticsMetricCard[]>();

const formatTons = (kilograms: number) =>
  (kilograms / 1000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const getSummaryCards = (modules: WorkoutAnalyticsModules | null | undefined) =>
  modules?.sections.find((section) => section.kind === 'summary_cards')?.cards ?? [];

/** Los mismos indicadores en la ventana de igual largo que termina justo antes de la actual. */
const usePreviousPeriod = (modules: WorkoutAnalyticsModules, repBucketId: string | null) => {
  const scope = modules.time_scope;
  const range = scope?.range_key;
  const canCompare =
    modules.context.scope_kind === 'range' && range != null && range !== 'all' && Boolean(scope?.start_date);
  const key = canCompare ? `${range}:${scope?.start_date}:${repBucketId ?? 'todos'}` : null;
  const [state, setState] = useState(() => ({ key, cards: key ? previousCache.get(key) ?? null : null }));

  useEffect(() => {
    if (!key || !range || !scope?.start_date) {
      setState({ key, cards: null });
      return undefined;
    }
    const cached = previousCache.get(key);
    if (cached) {
      setState({ key, cards: cached });
      return undefined;
    }
    let active = true;
    setState({ key, cards: null });
    getWorkoutAnalyticsModules({
      scopeKind: 'range',
      range,
      repBucketId,
      anchorDate: addDaysToDateKey(scope.start_date, -1) ?? undefined,
    })
      .then((result) => {
        const cards = getSummaryCards(result);
        previousCache.set(key, cards);
        if (active) {
          setState({ key, cards });
        }
      })
      .catch(() => {
        // La comparación es opcional: sin ella los indicadores actuales siguen sirviendo.
      });
    return () => {
      active = false;
    };
  }, [key, range, repBucketId, scope?.start_date]);

  return state.key === key ? state.cards : null;
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
        ? shown.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : Math.round(shown).toLocaleString('es-MX')
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
        ? `vs. ${Math.round(previous.value)} las ${weeks} previas`
        : 'en el periodo'
      : card.id === 'volume'
        ? previous?.value != null
          ? `vs. ${formatTons(previous.value)} t`
          : 'levantado en el periodo'
        : card.id === 'active_days'
          ? plannedSessions
            ? `del plan: ${plannedSessions} ${plannedSessions === 1 ? 'sesión' : 'sesiones'}`
            : previous?.value != null
              ? `vs. ${Math.round(previous.value)} antes`
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
}: {
  modules: WorkoutAnalyticsModules;
  /** El rango de repeticiones con el que se pidió `modules`, para comparar igual. */
  repBucketId: string | null;
  /** Sesiones que el plan tenía en el periodo, si se conocen. */
  plannedSessions: number | null;
}) {
  const cards = getSummaryCards(modules);
  const previous = usePreviousPeriod(modules, repBucketId);
  const scope = modules.time_scope;
  const periodDays =
    scope?.start_date && scope.end_date ? getCalendarDayDiff(scope.start_date, scope.end_date) + 1 : null;
  const weeks = scope?.range_key ? RANGE_WEEKS[scope.range_key] : undefined;
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
