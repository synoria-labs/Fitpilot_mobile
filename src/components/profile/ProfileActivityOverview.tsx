import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AuroraGlass } from '../aurora';
import { ActivityGridCard } from '../activity/ActivityGridCard';
import { auroraFont, useAurora } from '../../theme/aurora';
import { summarizeAnnualActivity, type DailyActivity } from '../../utils/activityGrid';
import { getTodayDateKey } from '../../utils/date';
import { formatCount, formatInteger } from '../../utils/formatters';

type Props = {
  days: Record<string, DailyActivity>;
  startKey: string | null;
  hasLoaded: boolean;
  workoutsFailed: boolean;
  healthFailed: boolean;
  reload: () => Promise<void>;
};

/** Perfil's year at a glance: three yearly figures over the activity card Inicio also uses. */
export const ProfileActivityOverview = ({ days, startKey, hasLoaded, workoutsFailed, healthFailed, reload }: Props) => {
  const aurora = useAurora();
  const { width } = useWindowDimensions();
  const todayKey = getTodayDateKey();
  const stats = useMemo(() => summarizeAnnualActivity(days, todayKey, startKey), [days, todayKey, startKey]);
  const complete = hasLoaded && !workoutsFailed && !healthFailed;
  const items = [
    { value: hasLoaded && !workoutsFailed ? formatInteger(stats.sessions) : '—', label: 'Entrenos' },
    { value: complete ? formatInteger(stats.active) : '—', label: 'Días activos' },
    { value: complete ? formatCount(stats.best, 'día', 'días') : '—', label: 'Mejor racha' },
  ];
  const subtitle = complete
    ? `${formatCount(stats.active, 'día activo', 'días activos')} en el último año`
    : hasLoaded
      ? 'Historial parcialmente disponible'
      : 'Cargando tu actividad…';

  return (
    <>
      <View
        accessible
        accessibilityLabel={`Último año: ${items.map((item) => `${item.label}, ${item.value === '—' ? 'sin datos' : item.value}`).join('; ')}`}
        style={styles.stats}
      >
        {items.map((item) => (
          <AuroraGlass key={item.label} radius={20} blur={false} style={styles.stat}>
            <View style={styles.statContent}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: aurora.text }]}>
                {item.value}
              </Text>
              <Text style={[styles.caption, { color: aurora.faint }]}>{item.label}</Text>
            </View>
          </AuroraGlass>
        ))}
      </View>
      <ActivityGridCard
        days={days}
        startKey={startKey}
        hasLoaded={hasLoaded}
        contentWidth={width}
        horizontalPadding={0}
        weeks={53}
        title="Tu año en FitPilot"
        subtitle={subtitle}
        showStats={false}
        scrollable
        inspector="compact"
        failed={workoutsFailed || healthFailed}
        onRetry={() => void reload()}
        style={styles.card}
      />
    </>
  );
};

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, minWidth: 0 },
  statContent: { paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  value: { ...auroraFont('extrabold'), fontSize: 22, lineHeight: 28, includeFontPadding: false, letterSpacing: -0.44 },
  caption: { ...auroraFont('semibold'), fontSize: 11.5, lineHeight: 15, includeFontPadding: false, marginTop: 2 },
  card: { marginTop: 20 },
});
