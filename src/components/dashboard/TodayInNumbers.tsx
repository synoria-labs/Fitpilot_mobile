import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuroraPill, IconBadge, ReadinessRing, Sparkline, type AuroraIconName } from '../aurora';
import { useCountUp } from '../../hooks/useCountUp';
import { auroraFont, auroraRadius, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import type { ConnectedHealthReadinessStatus } from '../../types/connectedHealthFeedback';
import { formatInteger } from '../../utils/formatters';
import type { AdherenceSummary, StepsSummary } from '../../utils/homeNumbers';

const GAP = 12;
const TILE_PADDING = 16;
const MAX_SEGMENTS = 10;

export type SessionsNumbers = {
  done: number;
  total: number;
  /** 1-based position of the next session, when there is one. */
  nextPosition: number | null;
  nextName: string | null;
  label: string | null;
};

export type ReadinessNumbers = {
  score: number | null;
  status: ConnectedHealthReadinessStatus;
  title: string;
  message: string;
  freshnessLabel: string;
  isStale: boolean;
  isSyncing: boolean;
};

type TodayInNumbersProps = {
  sessions: SessionsNumbers | null;
  adherence: AdherenceSummary;
  steps: StepsSummary;
  readiness: ReadinessNumbers;
  onReadinessPress: () => void;
  contentWidth: number;
  horizontalPadding: number;
};

const READINESS_TONES: Record<ConnectedHealthReadinessStatus, AuroraTone> = {
  good: 'emerald',
  watch: 'amber',
  low: 'rose',
  unknown: 'slate',
};

const signed = (value: number, text: string) => `${value >= 0 ? '+' : '−'}${text}`;

/** «Hoy en números»: the week's sessions, adherence, steps and readiness, counting up on arrival. */
export const TodayInNumbers = ({
  sessions,
  adherence,
  steps,
  readiness,
  onReadinessPress,
  contentWidth,
  horizontalPadding,
}: TodayInNumbersProps) => {
  const aurora = useAurora();
  const tileWidth = (contentWidth - horizontalPadding * 2 - GAP) / 2;
  const plotWidth = tileWidth - TILE_PADDING * 2 - 2;

  const sessionsDone = useCountUp(sessions ? sessions.done : null);
  const adherenceValue = useCountUp(adherence.value);
  const stepsToday = useCountUp(steps.today);
  const readinessScore = useCountUp(readiness.score);

  const segmentCount = sessions ? Math.min(sessions.total, MAX_SEGMENTS) : 0;
  const readinessTone = READINESS_TONES[readiness.status];

  return (
    <View style={[styles.section, { paddingHorizontal: horizontalPadding }]}>
      <Text style={[auroraType.title, styles.heading, { color: aurora.text }]}>Hoy en números</Text>

      <View style={styles.row}>
        <Tile index={0} width={tileWidth}>
          <TileHeader icon="barbell-outline" tone="blue">
            {sessions?.label ? <AuroraPill label={sessions.label} tone="blue" /> : null}
          </TileHeader>
          <Text style={[auroraType.label, styles.label, { color: aurora.faint }]}>Sesiones</Text>
          <Text style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}>
            {sessions && sessionsDone != null ? Math.round(sessionsDone) : '—'}
            {sessions ? (
              <Text style={[styles.unit, auroraFont('bold'), { color: aurora.faint }]}> / {sessions.total}</Text>
            ) : null}
          </Text>
          {sessions && segmentCount > 0 ? (
            sessions.total <= MAX_SEGMENTS ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.segments}>
                {Array.from({ length: segmentCount }, (_, index) => {
                  if (index < sessions.done) {
                    return (
                      <LinearGradient
                        key={index}
                        colors={aurora.tones.blue.gradient}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.segment}
                      />
                    );
                  }
                  const isNext = sessions.nextPosition === index + 1;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.segment,
                        isNext
                          ? { backgroundColor: aurora.tones.blue.soft, borderWidth: 1.5, borderColor: aurora.tones.blue.tone }
                          : { backgroundColor: aurora.surface3 },
                      ]}
                    />
                  );
                })}
              </View>
            ) : (
              <View style={[styles.track, { backgroundColor: aurora.surface3 }]}>
                <LinearGradient
                  colors={aurora.tones.blue.gradient}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.segment, { width: `${Math.round((sessions.done / sessions.total) * 100)}%` }]}
                />
              </View>
            )
          ) : null}
          <Text style={[auroraType.caption, styles.caption, { color: aurora.faint }]} numberOfLines={1}>
            {!sessions
              ? 'Sin programa activo'
              : sessions.nextName
                ? `Sigue: ${sessions.nextName}`
                : 'Microciclo completado'}
          </Text>
        </Tile>

        <Tile index={1} width={tileWidth}>
          <TileHeader icon="trending-up" tone="violet">
            {adherence.delta != null ? (
              <AuroraPill
                label={signed(adherence.delta, `${Math.abs(adherence.delta)} pts`)}
                tone={adherence.delta >= 0 ? 'emerald' : 'rose'}
              />
            ) : null}
          </TileHeader>
          <Text style={[auroraType.label, styles.label, { color: aurora.faint }]}>Adherencia</Text>
          <Text style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}>
            {adherenceValue != null ? Math.round(adherenceValue) : '—'}
            {adherence.value != null ? (
              <Text style={[styles.unit, auroraFont('bold'), { color: aurora.faint }]}>%</Text>
            ) : null}
          </Text>
          {adherence.series.length > 1 ? (
            <View style={styles.spark}>
              <Sparkline values={adherence.series} color={aurora.tones.violet.tone} width={plotWidth} height={34} />
            </View>
          ) : null}
          <Text style={[auroraType.caption, styles.caption, { color: aurora.faint }]} numberOfLines={1}>
            {adherence.value != null ? 'Últimas 4 semanas' : 'Aún sin semanas planificadas'}
          </Text>
        </Tile>
      </View>

      <View style={styles.row}>
        <Tile index={2} width={tileWidth}>
          <TileHeader icon="footsteps-outline" tone="emerald">
            {steps.delta != null ? (
              <AuroraPill
                label={signed(steps.delta, formatInteger(Math.abs(steps.delta)))}
                tone={steps.delta >= 0 ? 'emerald' : 'amber'}
              />
            ) : null}
          </TileHeader>
          <Text style={[auroraType.label, styles.label, { color: aurora.faint }]}>Pasos</Text>
          <Text style={[styles.value, auroraFont('extrabold'), { color: aurora.text }]}>
            {stepsToday != null ? formatInteger(stepsToday) : '—'}
          </Text>
          {steps.today != null && steps.series.some((value) => value > 0) ? (
            <View style={styles.spark}>
              <Sparkline values={steps.series} color={aurora.tones.emerald.tone} width={plotWidth} height={34} />
            </View>
          ) : null}
          <Text style={[auroraType.caption, styles.caption, { color: aurora.faint }]} numberOfLines={2}>
            {steps.today == null
              ? 'Tu reloj o teléfono aún no envía pasos'
              : steps.delta != null
                ? 'vs. promedio de 30 días'
                : 'Hoy'}
          </Text>
        </Tile>

        <Tile index={3} width={tileWidth} onPress={onReadinessPress} accessibilityLabel="Ver tu salud conectada">
          <TileHeader icon="pulse-outline" tone="rose">
            <AuroraPill
              label={readiness.isSyncing ? 'Sincronizando' : readiness.freshnessLabel}
              tone={readiness.isStale ? 'amber' : 'rose'}
            />
          </TileHeader>
          <Text style={[auroraType.label, styles.label, { color: aurora.faint }]} numberOfLines={1}>
            Preparación
          </Text>
          <View style={styles.readinessRow}>
            <ReadinessRing
              score={readiness.score}
              tone={readinessTone}
              size={58}
              label={readinessScore != null ? `${Math.round(readinessScore)}` : undefined}
            />
            <Text
              style={[styles.readinessTitle, auroraFont('extrabold'), { color: aurora.text }]}
              numberOfLines={3}
            >
              {readiness.title}
            </Text>
          </View>
          <Text style={[auroraType.caption, styles.caption, { color: aurora.faint }]} numberOfLines={3}>
            {readiness.message}
          </Text>
        </Tile>
      </View>
    </View>
  );
};

const TileHeader = ({
  icon,
  tone,
  children,
}: {
  icon: AuroraIconName;
  tone: AuroraTone;
  children?: React.ReactNode;
}) => (
  <View style={styles.tileHeader}>
    <IconBadge icon={icon} tone={tone} variant="solid" size={36} />
    {children}
  </View>
);

const Tile = ({
  index,
  width,
  onPress,
  accessibilityLabel,
  children,
}: {
  index: number;
  width: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) => {
  const aurora = useAurora();
  const surface = {
    width,
    backgroundColor: aurora.surface,
    borderColor: aurora.border,
    boxShadow: aurora.shadow,
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 70).duration(420)}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [styles.tile, surface, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          {children}
        </Pressable>
      ) : (
        <View style={[styles.tile, surface]}>{children}</View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 26,
    gap: GAP,
  },
  heading: {
    marginHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: GAP,
  },
  tile: {
    flexGrow: 1,
    padding: TILE_PADDING,
    borderRadius: auroraRadius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  label: {
    marginTop: 14,
  },
  value: {
    marginTop: 4,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 16,
    letterSpacing: 0,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  track: {
    height: 8,
    marginTop: 14,
    borderRadius: 4,
    overflow: 'hidden',
  },
  spark: {
    marginTop: 8,
  },
  caption: {
    marginTop: 8,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  readinessTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
  },
});
