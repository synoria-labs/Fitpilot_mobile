import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { getWorkoutAnalyticsHistory } from '../../services/workoutAnalytics';
import type { RecentWorkoutHistoryItem } from '../../types';
import { formatLocalDate, getTodayDateKey } from '../../utils/date';
import { buildTrainingConsistency } from '../../utils/trainingProgress';
import { progressColors, progressShadow } from './progressTheme';

export function TrainingConsistencyCard({ refreshKey }: { refreshKey: unknown }) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const userId = useAuthStore((state) => state.user?.id);
  const today = getTodayDateKey();
  const [sessions, setSessions] = useState<RecentWorkoutHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarWidth, setCalendarWidth] = useState(0);
  const daySize = Math.max(0, (calendarWidth - 22 - 12 * 3) / 12);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    const load = async () => {
      const items: RecentWorkoutHistoryItem[] = [];
      let total = 1;
      while (items.length < total && active) {
        const page = await getWorkoutAnalyticsHistory({
          range: '12w',
          status: 'completed',
          anchorDate: today,
          skip: items.length,
          limit: 100,
        });
        total = page.total;
        if (!page.items.length) break;
        items.push(...page.items);
      }
      if (active) setSessions(items);
    };
    void load()
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, retry, today, userId]);
  const { weeks, streak } = useMemo(
    () => buildTrainingConsistency(sessions, today),
    [sessions, today],
  );
  const selected = weeks.flatMap((week) => week.days).find((day) => day.date === selectedDate);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <LinearGradient colors={['#2563eb', '#4f46e5']} style={styles.icon}>
          <Ionicons name="flame-outline" color="#fff" size={23} />
        </LinearGradient>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>
            {loading || failed || !streak
              ? 'Tu constancia'
              : `${streak === 12 ? '12+' : streak} ${streak === 1 ? 'semana seguida' : 'semanas seguidas'}`}
          </Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {streak && !loading && !failed ? 'con 3 o más sesiones' : 'Sesiones completadas'} ·
            últimas 12 semanas
          </Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : failed ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setRetry((value) => value + 1)}
          style={styles.loading}
        >
          <Text style={{ color: colors.muted }}>No se pudo cargar la constancia.</Text>
          <Text style={{ color: colors.accent }}>Reintentar</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View
            style={styles.calendar}
            onLayout={(event) => setCalendarWidth(event.nativeEvent.layout.width)}
          >
            <View style={styles.days}>
              {['L', '', 'X', '', 'V', '', 'D'].map((day, index) => (
                <View key={index} style={[styles.dayLabel, { height: daySize }]}>
                  <Text style={[styles.small, { color: colors.muted }]}>{day}</Text>
                </View>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week.days[0].date} style={styles.week}>
                {week.days.map((day) => (
                  <TouchableOpacity
                    key={day.date}
                    disabled={day.future}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatLocalDate(day.date, { day: 'numeric', month: 'long' })}: ${day.future ? 'aún no llega' : `${day.count} sesiones completadas, ${(day.volume / 1000).toFixed(1)} toneladas`}`}
                    onPress={() => setSelectedDate(day.date)}
                    style={[
                      styles.day,
                      {
                        backgroundColor: day.future ? 'transparent' : colors.heat[day.level],
                        borderColor:
                          day.date === today || day.date === selectedDate
                            ? colors.accent
                            : day.future
                              ? colors.border
                              : 'transparent',
                      },
                    ]}
                  />
                ))}
                <View style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, Math.min(week.count, 10) * 2.5),
                        backgroundColor: colors.heat[3],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.count, { color: colors.muted }]}>{week.count}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <Text style={[styles.small, { color: colors.muted }]}>Sesiones por semana</Text>
            <View style={styles.scale}>
              <Text style={[styles.small, { color: colors.muted }]}>Menos</Text>
              {colors.heat.map((color) => (
                <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
              ))}
              <Text style={[styles.small, { color: colors.muted }]}>Más volumen</Text>
            </View>
          </View>
          {selected ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.caption, { color: colors.muted, marginTop: 12 }]}
            >
              {formatLocalDate(selected.date, { day: 'numeric', month: 'long' })} · {selected.count}{' '}
              sesiones · {(selected.volume / 1000).toFixed(1)} t
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 24, borderWidth: 1, ...progressShadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  caption: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8 },
  calendar: { flexDirection: 'row', gap: 3 },
  days: { width: 22, gap: 3 },
  dayLabel: { justifyContent: 'center' },
  week: { flex: 1, gap: 3 },
  day: { aspectRatio: 1, borderRadius: 4, borderWidth: 1 },
  barSlot: { height: 28, alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  bar: { width: 9, borderRadius: 2 },
  count: { fontSize: 9, textAlign: 'center' },
  small: { fontSize: 9 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  scale: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
});
