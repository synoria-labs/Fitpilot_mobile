import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing } from '../../constants/colors';
import { AuroraCard, AuroraSegmented, IconBadge, type AuroraIconName, type AuroraSegmentOption } from '../aurora';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import type { MicrocycleMode, MicrocycleProgress } from '../../types';
import type { ProgramTimelineActualAdherenceMetrics } from '../../utils/programTimeline';

interface MicrocycleStatsProps {
  microcycleProgress: MicrocycleProgress | null;
  actualAdherenceMetrics: ProgramTimelineActualAdherenceMetrics;
  mode: MicrocycleMode;
  onModeChange: (mode: MicrocycleMode) => void;
  isLoading?: boolean;
  horizontalPadding?: number;
  variant?: 'cards' | 'strip';
}

type StatTile = {
  key: string;
  label: string;
  value: string;
  icon: AuroraIconName;
  tone: AuroraTone;
  /** Share of the bar under the tiles; omitted tiles take none. */
  share?: number;
};

const MODE_OPTIONS: readonly AuroraSegmentOption<MicrocycleMode>[] = [
  { key: 'planned', label: 'Planificación' },
  { key: 'actual', label: 'Ejecución real' },
];

/** Microcycle numbers in Aurora tiles. The mode switch also drives the week strip and today's card. */
export const MicrocycleStats: React.FC<MicrocycleStatsProps> = ({
  microcycleProgress,
  actualAdherenceMetrics,
  mode,
  onModeChange,
  isLoading = false,
  horizontalPadding = spacing.md,
}) => {
  const aurora = useAurora();
  const planned = microcycleProgress?.planned_metrics;
  const completion = Math.round(planned?.completion_percentage ?? 0);

  const plannedTiles: StatTile[] = [
    {
      key: 'sessions',
      label: 'Sesiones',
      value: planned ? `${planned.completed_planned_sessions}/${planned.total_planned_sessions}` : '—',
      icon: 'checkmark-done-outline',
      tone: 'emerald',
    },
    {
      key: 'progress',
      label: 'Progreso',
      value: planned?.total_planned_sessions
        ? `${planned.next_session_position ?? planned.total_planned_sessions}/${planned.total_planned_sessions}`
        : '—',
      icon: 'barbell-outline',
      tone: 'blue',
    },
    {
      key: 'completion',
      label: 'Cumplimiento',
      value: `${completion}%`,
      icon: 'stats-chart-outline',
      tone: 'violet',
    },
  ];

  const actualTiles: StatTile[] = [
    {
      key: 'on-schedule',
      label: 'En fecha',
      value: `${actualAdherenceMetrics.onSchedule}`,
      icon: 'checkmark-circle-outline',
      tone: 'emerald',
      share: actualAdherenceMetrics.onSchedule,
    },
    {
      key: 'rescheduled',
      label: 'Reprogramadas',
      value: `${actualAdherenceMetrics.rescheduled}`,
      icon: 'swap-horizontal-outline',
      tone: 'blue',
      share: actualAdherenceMetrics.rescheduled,
    },
    {
      key: 'overdue',
      label: 'Atrasadas',
      value: `${actualAdherenceMetrics.overdue}`,
      icon: 'alert-circle-outline',
      tone: 'amber',
      share: actualAdherenceMetrics.overdue,
    },
  ];

  const tiles = mode === 'planned' ? plannedTiles : actualTiles;
  const actualTotal = actualTiles.reduce((total, tile) => total + (tile.share ?? 0), 0);

  return (
    <View style={{ paddingHorizontal: horizontalPadding, marginVertical: spacing.sm }}>
      <AuroraCard padding={16}>
        <View style={styles.header}>
          <Text style={[auroraType.headline, { color: aurora.text }]}>Tu microciclo</Text>
          <Text style={[auroraType.caption, { color: aurora.faint }]}>
            {mode === 'planned' ? `${completion}% completado` : 'Cómo vas contra el plan'}
          </Text>
        </View>

        <View style={styles.segmented}>
          <AuroraSegmented
            options={MODE_OPTIONS}
            value={mode}
            onChange={onModeChange}
            accessibilityLabel="Ver el microciclo planificado o lo que se ejecutó"
          />
        </View>

        <View style={styles.tiles}>
          {tiles.map((tile) => (
            <View key={tile.key} style={[styles.tile, { backgroundColor: aurora.surface2 }]}>
              <IconBadge icon={tile.icon} tone={tile.tone} size={32} />
              <Text
                style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}
                numberOfLines={1}
              >
                {isLoading ? '…' : tile.value}
              </Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
                {tile.label}
              </Text>
            </View>
          ))}
        </View>

        {mode === 'planned' ? (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: completion }}
            style={[styles.track, { backgroundColor: aurora.surface3 }]}
          >
            <LinearGradient
              colors={aurora.tones.blue.gradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fill, { width: `${Math.min(100, Math.max(0, completion))}%` }]}
            />
          </View>
        ) : actualTotal > 0 ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stack}>
            {actualTiles.map((tile) =>
              tile.share ? (
                <View
                  key={tile.key}
                  style={[styles.stackPart, { flex: tile.share, backgroundColor: aurora.tones[tile.tone].tone }]}
                />
              ) : null,
            )}
          </View>
        ) : null}
      </AuroraCard>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  segmented: {
    marginTop: 12,
  },
  tiles: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    padding: 12,
    borderRadius: 16,
  },
  value: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    marginTop: 14,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  stack: {
    flexDirection: 'row',
    gap: 2,
    height: 8,
    marginTop: 14,
    borderRadius: 4,
    overflow: 'hidden',
  },
  stackPart: {
    height: '100%',
  },
});
