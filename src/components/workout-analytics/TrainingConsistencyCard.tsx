import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import { AuroraCard, IconBadge } from '../aurora';
import { ActivityHeatGrid, type ActivityWeekdayLabel } from '../activity';
import {
  buildActivityGrid,
  describeTrainingCell,
  getCurrentWeeklyStreak,
  getWeeklySessionCounts,
  type DailyActivity,
} from '../../utils/activityGrid';
import { getTodayDateKey } from '../../utils/date';

export const CONSISTENCY_WEEKS = 12;
const MIN_WEEK_SESSIONS = 3;
const CARD_PADDING = 18;
const LABEL_COLUMN = 24;
const LABEL_GAP = 6;
const GAP = 4;
const BAR_WIDTH = 12;
const WEEKDAY_LABELS: readonly ActivityWeekdayLabel[] = [
  { row: 0, label: 'L' },
  { row: 2, label: 'X' },
  { row: 4, label: 'V' },
  { row: 6, label: 'D' },
];

type TrainingConsistencyCardProps = {
  days: Record<string, DailyActivity>;
  hasLoaded: boolean;
  hasFailed: boolean;
  onRetry: () => void;
  /** Ancho de la tarjeta, sin el margen de la pantalla. */
  width: number;
};

/** Constancia de entreno: 12 semanas, la racha de semanas con 3+ sesiones y el volumen por día. */
export function TrainingConsistencyCard({ days, hasLoaded, hasFailed, onRetry, width }: TrainingConsistencyCardProps) {
  const aurora = useAurora();
  const todayKey = getTodayDateKey();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const model = useMemo(
    () => buildActivityGrid({ todayKey, weeks: CONSISTENCY_WEEKS, days, mode: 'entreno' }),
    [days, todayKey],
  );
  const weekCounts = useMemo(() => getWeeklySessionCounts(model), [model]);
  const streak = hasLoaded ? getCurrentWeeklyStreak(model, MIN_WEEK_SESSIONS) : 0;
  const gridWidth = Math.max(0, width - CARD_PADDING * 2 - 2 - LABEL_COLUMN - LABEL_GAP);
  const cellSize = Math.max(12, Math.min(24, Math.floor((gridWidth - GAP * (CONSISTENCY_WEEKS - 1)) / CONSISTENCY_WEEKS)));
  const step = cellSize + GAP;
  const selected = selectedIndex == null ? null : model.cells[selectedIndex];
  const selectedDetail = selected ? describeTrainingCell(selected) : null;
  const heat = aurora.heat.entreno;
  const showError = hasFailed && !Object.keys(days).length;

  const title = !hasLoaded
    ? 'Tu constancia'
    : streak > 0
      ? `${streak} ${streak === 1 ? 'semana seguida' : 'semanas seguidas'}`
      : 'Tu constancia';
  const subtitle =
    hasLoaded && streak === 0
      ? 'Haz 3 sesiones en una semana para empezar tu racha'
      : `con ${MIN_WEEK_SESSIONS} o más sesiones · últimas ${CONSISTENCY_WEEKS} semanas`;

  return (
    <AuroraCard padding={CARD_PADDING} radius={24}>
      <View style={styles.header}>
        <IconBadge icon="flame-outline" tone="blue" variant="solid" size={40} />
        <View style={styles.headerText}>
          <Text style={[auroraType.headline, { color: aurora.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[auroraType.caption, styles.subtitle, { color: aurora.faint }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>

      {showError ? (
        <View style={[styles.errorBox, { backgroundColor: aurora.surface2 }]}>
          <Text style={[auroraType.caption, styles.errorText, { color: aurora.muted }]}>
            No pudimos cargar tus sesiones.
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
            <Text style={[styles.retry, auroraFont('bold'), { color: aurora.tones.blue.ink }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ActivityHeatGrid
            model={model}
            mode="entreno"
            heat={heat}
            cellSize={cellSize}
            gap={GAP}
            labelColumn={LABEL_COLUMN}
            labelGap={LABEL_GAP}
            weekdayLabels={WEEKDAY_LABELS}
            hasLoaded={hasLoaded}
            activeIndex={selectedIndex}
            onSelect={setSelectedIndex}
            accessibilityLabel={`Entrenamientos de las últimas ${CONSISTENCY_WEEKS} semanas`}
            style={styles.grid}
          />

          <View
            accessible
            accessibilityLabel={`Sesiones por semana: ${weekCounts.join(', ')}`}
            style={[styles.weekBars, { marginLeft: LABEL_COLUMN + LABEL_GAP, width: step * CONSISTENCY_WEEKS - GAP }]}
          >
            {weekCounts.map((count, week) => {
              const counts = count >= MIN_WEEK_SESSIONS;
              const height = Math.max(3, Math.min(14, Math.round((count / 6) * 16)));
              return (
                <View key={week} style={[styles.weekSlot, { left: week * step, width: cellSize }]}>
                  {counts ? (
                    <LinearGradient
                      colors={aurora.tones.blue.gradient}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={[styles.weekBar, { height }]}
                    />
                  ) : (
                    <View style={[styles.weekBar, { height, backgroundColor: aurora.surface3 }]} />
                  )}
                  <Text style={[styles.weekCount, auroraFont('bold'), { color: aurora.faint }]}>
                    {hasLoaded ? count : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <Text style={[styles.legendText, auroraFont('semibold'), { color: aurora.faint }]} numberOfLines={1}>
              Sesiones por semana
            </Text>
            <View style={styles.scale}>
              <Text style={[styles.legendText, auroraFont('semibold'), { color: aurora.faint }]}>Menos</Text>
              {heat.map((color, level) => (
                <View key={level} style={[styles.swatch, { backgroundColor: color }]} />
              ))}
              <Text style={[styles.legendText, auroraFont('semibold'), { color: aurora.faint }]}>Más volumen</Text>
            </View>
          </View>

          {selectedDetail ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.detail, { backgroundColor: aurora.surface2, borderColor: aurora.border }]}
            >
              <Text style={[styles.detailTitle, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
                {selectedDetail.title}
              </Text>
              <Text style={[auroraType.caption, { color: aurora.muted }]} numberOfLines={2}>
                {selectedDetail.detail}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </AuroraCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 2,
  },
  grid: {
    marginTop: 16,
  },
  weekBars: {
    height: 28,
    marginTop: 8,
  },
  weekSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  weekBar: {
    width: BAR_WIDTH,
    borderRadius: 3,
  },
  weekCount: {
    fontSize: 10,
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  legendText: {
    fontSize: 11,
  },
  scale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },
  detail: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
  },
  detailTitle: {
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
  },
  errorText: {
    flex: 1,
  },
  retry: {
    fontSize: 13,
  },
});
