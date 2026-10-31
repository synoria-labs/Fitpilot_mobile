import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkoutAnalyticsModules, WorkoutAnalyticsMetricCard } from '../../types';
import { useAppTheme } from '../../theme';
import { getWorkoutAnalyticsModules } from '../../services/workoutAnalytics';
import { addDaysToDateKey, getCalendarDayDiff } from '../../utils/date';
import { getMetricChange } from '../../utils/trainingProgress';
import { progressColors, progressShadow } from './progressTheme';

export function ProgressSummaryGrid({
  modules,
  repBucketId,
}: {
  modules: WorkoutAnalyticsModules;
  repBucketId?: string | null;
}) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const cards = modules.sections.find((section) => section.kind === 'summary_cards')?.cards ?? [];
  const periodDays =
    modules.time_scope?.start_date && modules.time_scope.end_date
      ? getCalendarDayDiff(modules.time_scope.start_date, modules.time_scope.end_date) + 1
      : null;
  const [previous, setPrevious] = useState<WorkoutAnalyticsMetricCard[]>([]);

  useEffect(() => {
    let current = true;
    setPrevious([]);
    const scope = modules.time_scope;
    if (
      modules.context.scope_kind === 'range' &&
      scope?.range_key &&
      scope.range_key !== 'all' &&
      scope.start_date
    ) {
      void getWorkoutAnalyticsModules({
        scopeKind: 'range',
        range: scope.range_key,
        repBucketId,
        anchorDate: addDaysToDateKey(scope.start_date, -1) ?? undefined,
      })
        .then((result) => {
          if (current)
            setPrevious(
              result.sections.find((section) => section.kind === 'summary_cards')?.cards ?? [],
            );
        })
        .catch(() => {
          /* Comparisons are optional; current metrics remain usable offline. */
        });
    }
    return () => {
      current = false;
    };
  }, [modules, repBucketId]);

  if (!cards.length) return null;

  return (
    <View style={[styles.grid, { backgroundColor: colors.soft, borderColor: colors.border }]}>
      {cards.map((card) => {
        const before = previous.find((item) => item.id === card.id);
        const change = getMetricChange(card, before);
        const value =
          card.id === 'volume' && card.value != null
            ? (card.value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })
            : card.id === 'avg_duration' && card.value != null
              ? Math.round(card.value).toLocaleString('es-MX')
              : card.display_value;
        const unit =
          card.id === 'volume'
            ? ' t'
            : card.id === 'avg_duration'
              ? ' min'
              : card.id === 'active_days' && periodDays
                ? ` / ${periodDays}`
                : '';
        const previousDisplay =
          before?.id === 'volume' && before.value != null
            ? `${(before.value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} t`
            : before?.display_value;
        return (
          <View key={card.id} style={[styles.cell, { backgroundColor: colors.surface }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {card.id === 'avg_duration'
                  ? 'Duración'
                  : card.id === 'active_days'
                    ? 'Días activos'
                    : card.label}
              </Text>
              {change ? (
                <Text
                  style={[
                    styles.badge,
                    {
                      color:
                        card.id === 'avg_duration' || change.value === 0
                          ? colors.muted
                          : change.value > 0
                            ? colors.green
                            : colors.amber,
                      backgroundColor: colors.soft,
                    },
                  ]}
                >
                  {change.label}
                </Text>
              ) : null}
            </View>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[styles.value, { color: colors.text }]}
            >
              {value}
              {unit ? <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text> : null}
            </Text>
            <Text style={[styles.helper, { color: colors.muted }]}>
              {before && change
                ? `vs. ${previousDisplay} en el periodo anterior`
                : (card.helper_text ??
                  (card.id === 'avg_duration'
                    ? 'media por sesión'
                    : card.id === 'active_days'
                      ? 'días con actividad'
                      : 'en el periodo seleccionado'))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 6,
    borderRadius: 26,
    borderWidth: 1,
    ...progressShadow,
  },
  cell: { flexBasis: '47%', flexGrow: 1, minWidth: 120, padding: 14, borderRadius: 20, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  value: { fontSize: 29, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  helper: { fontSize: 11, lineHeight: 16 },
});
