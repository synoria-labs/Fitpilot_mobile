import React, { useCallback, useEffect, useId } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { spacing } from '../../constants/colors';
import { AuroraCard, AuroraPill, IconBadge, type AuroraIconName } from '../aurora';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { useConnectedHealthFeedback } from '../../hooks/useConnectedHealthFeedback';
import { getConnectedHealthStateCopy } from '../../utils/connectedHealthFeedback';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import type {
  ConnectedHealthFeedbackModel,
  ConnectedHealthMetricCard,
  ConnectedHealthMetricKey,
  ConnectedHealthReadinessStatus,
} from '../../types/connectedHealthFeedback';
import { ConnectedHealthCardSkeleton } from './ConnectedHealthFeedbackParts';

interface ConnectedHealthFeedbackSummaryCardProps {
  contentWidth?: number;
  horizontalPadding?: number;
  variant?: 'card' | 'compact';
}

type HealthAction = {
  label: string;
  icon: AuroraIconName;
  onPress: () => void;
  loading?: boolean;
};

const SUMMARY_METRICS: ConnectedHealthMetricKey[] = [
  'recovery',
  'sleep',
  'active_energy',
  'steps',
];

const COMPACT_CHIP_ORDER: ConnectedHealthMetricKey[] = [
  'steps',
  'sleep',
  'recovery',
  'active_energy',
];

// Each signal keeps the tone it has across the app: steps green, sleep violet, recovery rose.
const METRIC_TONES: Record<ConnectedHealthMetricKey, AuroraTone> = {
  steps: 'emerald',
  distance: 'emerald',
  sleep: 'violet',
  recovery: 'rose',
  hrv: 'rose',
  resting_hr: 'rose',
  active_energy: 'amber',
  total_energy: 'amber',
};

const READINESS_TONES: Record<ConnectedHealthReadinessStatus, AuroraTone> = {
  good: 'emerald',
  watch: 'amber',
  low: 'rose',
  unknown: 'slate',
};

const EMPTY_VALUE = '--';
const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Readiness score as a ring that fills on appear, coloured by how ready the body is. */
const ReadinessRing: React.FC<{ score: number | null; tone: AuroraTone }> = ({ score, tone }) => {
  const aurora = useAurora();
  const reduceMotion = useReducedMotion();
  const gradientId = toSvgId(useId());
  const colors = aurora.tones[tone];
  const target = score == null ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const progress = useSharedValue(reduceMotion ? target : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion, target]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.tone} />
            <Stop offset="1" stopColor={colors.tone2} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={aurora.surface3}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {score != null ? (
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={`url(#${gradientId})`}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            fill="none"
            animatedProps={arcProps}
          />
        ) : null}
      </Svg>
      <Text style={[styles.ringValue, auroraFont('extrabold'), { color: score == null ? aurora.faint : aurora.text }]}>
        {score == null ? '—' : Math.round(score)}
      </Text>
    </View>
  );
};

const HealthMetricTile: React.FC<{ metric: ConnectedHealthMetricCard }> = ({ metric }) => {
  const aurora = useAurora();
  const hasValue = metric.value !== EMPTY_VALUE;

  return (
    <View style={[styles.metricTile, { backgroundColor: aurora.surface2 }]}>
      <IconBadge icon={metric.icon} tone={METRIC_TONES[metric.key]} size={32} />
      <View style={styles.metricCopy}>
        <Text
          style={[styles.metricValue, auroraFont('extrabold'), { color: hasValue ? aurora.text : aurora.faint }]}
          numberOfLines={1}
        >
          {hasValue ? metric.value : '—'}
        </Text>
        <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={2}>
          {metric.label}
        </Text>
      </View>
      {metric.tone === 'warning' ? (
        <View
          accessibilityLabel="Requiere atención"
          style={[styles.warningDot, { backgroundColor: aurora.tones.amber.tone, borderColor: aurora.surface2 }]}
        />
      ) : null}
    </View>
  );
};

const FreshnessPill: React.FC<{ feedback: ConnectedHealthFeedbackModel; isSyncing: boolean }> = ({
  feedback,
  isSyncing,
}) => {
  if (isSyncing) {
    return <AuroraPill label="Sincronizando" tone="blue" icon="sync-outline" />;
  }

  return (
    <AuroraPill
      label={feedback.freshnessLabel}
      tone={feedback.isStale ? 'amber' : 'emerald'}
      icon={feedback.isStale ? 'time-outline' : 'checkmark-circle'}
    />
  );
};

const HealthActionButton: React.FC<{ action: HealthAction }> = ({ action }) => {
  const aurora = useAurora();
  const blue = aurora.tones.blue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ busy: action.loading }}
      disabled={action.loading}
      onPress={action.onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: blue.soft, borderColor: blue.line, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {action.loading ? (
        <ActivityIndicator color={blue.ink} size="small" />
      ) : (
        <Ionicons name={action.icon} size={15} color={blue.ink} />
      )}
      <Text style={[styles.actionLabel, auroraFont('bold'), { color: blue.ink }]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
};

export const ConnectedHealthFeedbackSummaryCard: React.FC<ConnectedHealthFeedbackSummaryCardProps> = ({
  horizontalPadding = spacing.md,
  variant = 'card',
}) => {
  const aurora = useAurora();
  const isCompact = variant === 'compact';
  const {
    feedback,
    isLoading,
    isSyncing,
    syncError,
    error,
    needsPermissionCta,
    needsPermissionUpgradeCta,
    missingPermissionsLabel,
    connectionState,
    sync,
    requestPermissions,
    openSettings,
    refreshOnFocus,
  } = useConnectedHealthFeedback({
    days: 7,
    autoSync: true,
    foregroundSyncMaxAgeMs: 20 * 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      void refreshOnFocus();
    }, [refreshOnFocus]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshOnFocus();
      }
    });
    return () => subscription.remove();
  }, [refreshOnFocus]);

  const metricsByKey = new Map<ConnectedHealthMetricKey, ConnectedHealthMetricCard>(
    feedback.metrics.map((m) => [m.key, m]),
  );
  const visibleMetrics = isCompact
    ? COMPACT_CHIP_ORDER
        .map((key) => metricsByKey.get(key))
        .filter((m): m is ConnectedHealthMetricCard => Boolean(m))
    : feedback.metrics.filter((metric) => SUMMARY_METRICS.includes(metric.key));

  const primaryInsight = feedback.insights[0] ?? null;
  const showLoading = isLoading && !feedback.hasRealData;

  const stateCopy = getConnectedHealthStateCopy(connectionState, feedback.sourceLabel);

  const syncAction: HealthAction = {
    label: 'Sincronizar',
    icon: 'sync-outline',
    onPress: () => {
      void sync();
    },
    loading: isSyncing,
  };

  // El CTA lleva directamente a la acción que resuelve el estado, en vez de dejar al
  // usuario en la pantalla de perfil buscando qué tocar.
  const emptyStateAction: HealthAction =
    stateCopy.action === 'permissions'
      ? {
          label: 'Conceder permisos',
          icon: 'key-outline',
          onPress: () => {
            void requestPermissions();
          },
          loading: isSyncing,
        }
      : stateCopy.action === 'settings'
        ? {
            label: `Abrir ${feedback.sourceLabel}`,
            icon: 'open-outline',
            onPress: () => {
              void openSettings();
            },
          }
        : syncAction;

  const handlePress = () => {
    if (needsPermissionCta || !feedback.hasRealData) {
      router.push('/profile/connected-health' as never);
      return;
    }
    router.push({
      pathname: '/(tabs)/measurements',
      params: { initialTab: 'health' },
    } as never);
  };

  const errorMessage = syncError ?? error ?? feedback.lastSyncErrorMessage;
  const insightTone = primaryInsight?.tone === 'warning' ? aurora.tones.amber : aurora.tones.blue;

  return (
    <View style={[isCompact ? styles.outerCompact : styles.outer, { paddingHorizontal: horizontalPadding }]}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Ver detalles de salud conectada"
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
      >
        <AuroraCard padding={16} style={styles.card}>
          <View style={styles.header}>
            <IconBadge icon="pulse-outline" tone="rose" variant="solid" size={36} />
            <View style={styles.titleCopy}>
              <Text style={[auroraType.headline, { color: aurora.text }]} numberOfLines={1}>
                Salud conectada
              </Text>
              <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={1}>
                {isCompact ? feedback.sourceLabel : 'Preparación de hoy'}
              </Text>
            </View>
            <FreshnessPill feedback={feedback} isSyncing={isSyncing} />
            {isCompact ? <Ionicons name="chevron-forward" size={18} color={aurora.faint} /> : null}
          </View>

          {showLoading ? (
            <ConnectedHealthCardSkeleton compact={isCompact} />
          ) : feedback.hasRealData ? (
            <>
              <View style={styles.readinessRow}>
                <ReadinessRing
                  score={feedback.readiness.score}
                  tone={READINESS_TONES[feedback.readiness.status]}
                />
                <View style={styles.readinessCopy}>
                  <Text style={[auroraType.label, { color: aurora.faint }]}>Preparación</Text>
                  <Text
                    style={[styles.readinessTitle, auroraFont('extrabold'), { color: aurora.text }]}
                    numberOfLines={1}
                  >
                    {feedback.readiness.title}
                  </Text>
                  <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={isCompact ? 2 : 3}>
                    {feedback.readiness.message}
                  </Text>
                </View>
              </View>

              {visibleMetrics.length > 0 ? (
                <View style={styles.metricsGrid}>
                  {visibleMetrics.map((metric) => (
                    <HealthMetricTile key={metric.key} metric={metric} />
                  ))}
                </View>
              ) : null}

              {!isCompact && primaryInsight ? (
                <View style={[styles.insight, { backgroundColor: insightTone.soft }]}>
                  <Ionicons
                    name={primaryInsight.tone === 'warning' ? 'alert-circle-outline' : 'sparkles-outline'}
                    size={16}
                    color={insightTone.ink}
                  />
                  <Text style={[styles.insightText, auroraFont('medium'), { color: aurora.muted }]} numberOfLines={2}>
                    {primaryInsight.title}: {primaryInsight.message}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={[styles.emptyRow, { backgroundColor: aurora.surface2 }]}>
              <View style={styles.emptyCopy}>
                <Text style={[styles.emptyTitle, auroraFont('extrabold'), { color: aurora.text }]}>
                  {stateCopy.title}
                </Text>
                <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={isCompact ? 2 : 4}>
                  {isCompact ? stateCopy.compactMessage : stateCopy.message}
                </Text>
              </View>
              <HealthActionButton action={emptyStateAction} />
            </View>
          )}

          {!isCompact ? (
            // Sin botón de actualizar: la tarjeta relee el dispositivo en cada foco, así que no
            // hay nada que el usuario pueda pulsar para conseguir un dato más reciente.
            <Text style={[auroraType.caption, { color: aurora.faint }]}>
              Fuente: {feedback.sourceLabel} - {feedback.latestDateLabel}
            </Text>
          ) : null}

          {needsPermissionUpgradeCta && feedback.hasRealData && !isCompact ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Completar permisos de salud conectada"
              onPress={() => {
                void requestPermissions();
              }}
              style={[styles.insight, { backgroundColor: aurora.tones.amber.soft }]}
            >
              <Ionicons name="key-outline" size={16} color={aurora.tones.amber.ink} />
              <Text style={[styles.insightText, auroraFont('medium'), { color: aurora.muted }]} numberOfLines={2}>
                Permisos incompletos
                {missingPermissionsLabel ? `: faltan ${missingPermissionsLabel}` : ''}.
                Actívalos para completar tu recuperación.
              </Text>
            </Pressable>
          ) : null}

          {errorMessage ? (
            <Text style={[auroraType.caption, { color: aurora.tones.rose.ink }]}>{errorMessage}</Text>
          ) : null}
        </AuroraCard>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    marginVertical: spacing.md,
  },
  outerCompact: {
    marginVertical: spacing.sm,
  },
  card: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  ringValue: {
    fontSize: 19,
    fontVariant: ['tabular-nums'],
  },
  readinessCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  readinessTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    flexBasis: '45%',
    flexGrow: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 16,
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  warningDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 13,
  },
});
