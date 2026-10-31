import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RepRangeBucket, RepRangeChartPoint } from '../../types';
import { useAppTheme } from '../../theme';
import { formatLocalDate, getStartOfLocalWeekDateKey } from '../../utils/date';
import { progressColors, progressRepColors } from './progressTheme';

interface RepRangeVolumeChartProps {
  points: RepRangeChartPoint[];
  repRanges: RepRangeBucket[];
  contentWidth?: number;
  selectedBucketId?: string | null;
  onSelectBucket?: (bucketId: string | null) => void;
}

const HEIGHT = 155;

export function RepRangeVolumeChart({
  points,
  repRanges,
  contentWidth = 360,
  selectedBucketId = null,
  onSelectBucket,
}: RepRangeVolumeChartProps) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const totals = points.map((point) =>
    repRanges.reduce((sum, bucket) => sum + Math.max(0, point.totals[bucket.id] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const width = Math.max(measuredWidth || contentWidth - 40, points.length * 48);
  const slot = width / Math.max(1, points.length);
  const currentWeek = getStartOfLocalWeekDateKey();
  const dominant = repRanges
    .map((bucket) => ({
      ...bucket,
      volume: points.reduce((sum, point) => sum + (point.totals[bucket.id] ?? 0), 0),
    }))
    .sort((a, b) => b.volume - a.volume)[0];
  const select = (id: string) => onSelectBucket?.(id === selectedBucketId ? null : id);
  return (
    <View onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      <View style={styles.legend}>
        {repRanges.map((bucket) => (
          <TouchableOpacity
            key={bucket.id}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar por ${bucket.label} repeticiones`}
            accessibilityState={{ selected: bucket.id === selectedBucketId }}
            disabled={!onSelectBucket}
            onPress={() => select(bucket.id)}
            style={[
              styles.legendItem,
              {
                backgroundColor: selectedBucketId === bucket.id ? colors.accentSoft : colors.soft,
                opacity: selectedBucketId && selectedBucketId !== bucket.id ? 0.4 : 1,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: progressRepColors[bucket.color_token] }]} />
            <Text style={[styles.small, { color: colors.muted }]}>{bucket.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {points.length && totals.some((value) => value > 0) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={[styles.chart, { width }]}>
            {points.map((point, index) => (
              <View
                key={point.week_start}
                accessible
                accessibilityLabel={`Semana del ${formatLocalDate(point.week_start, { day: 'numeric', month: 'long' })}: ${(totals[index] / 1000).toFixed(1)} toneladas`}
                style={[styles.column, { width: slot }]}
              >
                <View style={styles.barArea}>
                  <Text style={[styles.total, { color: colors.text }]}>
                    {(totals[index] / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} t
                  </Text>
                  <View
                    style={[
                      styles.stack,
                      {
                        width: Math.min(36, slot * 0.48),
                        opacity: point.week_start === currentWeek ? 0.65 : 1,
                      },
                    ]}
                  >
                    {[...repRanges].reverse().map((bucket) => {
                      const value = Math.max(0, point.totals[bucket.id] ?? 0);
                      return value ? (
                        <TouchableOpacity
                          key={bucket.id}
                          disabled={!onSelectBucket}
                          onPress={() => select(bucket.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`${bucket.label} reps: ${(value / 1000).toFixed(1)} toneladas`}
                          style={{
                            height: (value / max) * HEIGHT,
                            backgroundColor: progressRepColors[bucket.color_token],
                            opacity: selectedBucketId && selectedBucketId !== bucket.id ? 0.2 : 1,
                          }}
                        />
                      ) : null;
                    })}
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.axis, { color: colors.muted }]}>
                  {point.week_start === currentWeek
                    ? 'Esta sem.'
                    : formatLocalDate(point.week_start, { day: 'numeric', month: 'short' }).replace(
                        '.',
                        '',
                      )}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={[styles.empty, { color: colors.muted }]}>
          No hay volumen con carga en este periodo. Completa sesiones con peso para ver la
          distribución semanal.
        </Text>
      )}
      <View style={[styles.hint, { backgroundColor: colors.soft }]}>
        <Text style={[styles.hintText, { color: colors.muted }]}>
          {dominant?.volume > 0
            ? `El rango ${dominant.label} concentra más volumen en este periodo. `
            : ''}
          {onSelectBucket
            ? 'Toca un rango para filtrar ejercicios y sesiones.'
            : 'Volumen semanal con carga, distribuido por rango de repeticiones.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  dot: { width: 7, height: 7, borderRadius: 2 },
  small: { fontSize: 11 },
  chart: { flexDirection: 'row' },
  column: { alignItems: 'center' },
  barArea: { height: HEIGHT + 28, justifyContent: 'flex-end', alignItems: 'center', gap: 5 },
  total: { fontSize: 10, fontWeight: '700' },
  stack: { overflow: 'hidden', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { fontSize: 10, marginTop: 9 },
  hint: { marginTop: 18, padding: 12, borderRadius: 12 },
  hintText: { fontSize: 11, lineHeight: 18 },
  empty: { paddingVertical: 30, textAlign: 'center', fontSize: 12, lineHeight: 19 },
});
export default RepRangeVolumeChart;
