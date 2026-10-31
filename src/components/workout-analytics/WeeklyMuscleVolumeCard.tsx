import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { getMuscleVolume, trainingClient } from '../../services/api';
import type { DashboardBootstrap, MuscleVolumeItem } from '../../types';
import { getLocalWeekDateKeys } from '../../utils/date';
import { progressColors, progressShadow } from './progressTheme';

export function WeeklyMuscleVolumeCard({ refreshKey }: { refreshKey: unknown }) {
  const { theme } = useAppTheme();
  const colors = progressColors(theme);
  const userId = useAuthStore((state) => state.user?.id);
  const [secondary, setSecondary] = useState(true);
  const [muscles, setMuscles] = useState<MuscleVolumeItem[]>([]);
  const [totalSets, setTotalSets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    const load = async () => {
      const bootstrap = await trainingClient.get<DashboardBootstrap>(
        '/client-app/dashboard-bootstrap',
      );
      const week = new Set(getLocalWeekDateKeys());
      const days = (bootstrap.timeline?.planned_days ?? []).filter((day) => week.has(day.date_key));
      const trainingDays = new Map(
        days
          .flatMap((day) => day.sessions)
          .filter((session) => !session.training_day.rest_day)
          .map((session) => [session.training_day.id, session.training_day]),
      );
      const responses = await Promise.all(
        Array.from(trainingDays.keys(), (id) => getMuscleVolume(id, secondary)),
      );
      const totals = new Map<string, MuscleVolumeItem>();
      responses.forEach((response) =>
        response.muscles.forEach((muscle) => {
          const previous = totals.get(muscle.muscle_name);
          totals.set(muscle.muscle_name, {
            ...muscle,
            effective_sets: muscle.effective_sets + (previous?.effective_sets ?? 0),
            total_sets: muscle.total_sets + (previous?.total_sets ?? 0),
          });
        }),
      );
      if (active) {
        setMuscles(
          Array.from(totals.values())
            .filter((muscle) => muscle.effective_sets > 0)
            .sort((a, b) => b.effective_sets - a.effective_sets),
        );
        setTotalSets(
          Array.from(trainingDays.values()).reduce((sum, day) => sum + day.total_sets, 0),
        );
      }
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
  }, [refreshKey, secondary, retry, userId]);
  const max = Math.max(1, ...muscles.map((muscle) => muscle.effective_sets));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Series por músculo</Text>
      <View style={styles.header}>
        <Text style={[styles.caption, { color: colors.muted }]}>
          Esta semana · {totalSets} series programadas
        </Text>
        <View style={styles.toggle}>
          <Text style={[styles.caption, { color: colors.muted }]}>Sinergistas ×0.5</Text>
          <Switch
            accessibilityLabel="Contar sinergistas a la mitad"
            value={secondary}
            onValueChange={setSecondary}
            trackColor={{ false: colors.soft, true: '#5089f6' }}
            thumbColor="#ffffff"
          />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={styles.state} color={colors.accent} />
      ) : failed ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.state}
          onPress={() => setRetry((value) => value + 1)}
        >
          <Text style={{ color: colors.accent }}>No se pudieron cargar las series. Reintentar</Text>
        </TouchableOpacity>
      ) : !muscles.length ? (
        <Text style={[styles.caption, styles.state, { color: colors.muted }]}>
          No hay series programadas esta semana.
        </Text>
      ) : (
        <View style={styles.bars}>
          {(expanded ? muscles : muscles.slice(0, 5)).map((muscle, index) => (
            <View key={muscle.muscle_name} style={styles.barRow}>
              <Text numberOfLines={2} style={[styles.muscle, { color: colors.muted }]}>
                {muscle.display_name}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.soft }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${(muscle.effective_sets / max) * 100}%`,
                      backgroundColor: index < 3 ? '#5089f6' : '#93b9ff',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.number, { color: colors.text }]}>
                {muscle.effective_sets.toFixed(1)}
              </Text>
            </View>
          ))}
          {muscles.length > 5 ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setExpanded((value) => !value)}
            >
              <Text style={[styles.caption, { color: colors.accent }]}>
                {expanded ? 'Ver menos' : 'Ver todos los músculos'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 8, ...progressShadow },
  title: { fontSize: 16, fontWeight: '800' },
  header: { gap: 6 },
  caption: { fontSize: 11, lineHeight: 17 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bars: { gap: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscle: { width: '39%', fontSize: 11 },
  track: { flex: 1, height: 9, borderRadius: 5, overflow: 'hidden' },
  bar: { height: 9, borderRadius: 5 },
  number: { width: 33, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  state: { paddingVertical: 20 },
});
