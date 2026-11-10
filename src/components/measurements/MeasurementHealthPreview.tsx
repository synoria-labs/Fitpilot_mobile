import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuroraCard, ReadinessRing } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import { useConnectedHealthFeedback } from '../../hooks/useConnectedHealthFeedback';
import { getConnectedHealthStateCopy } from '../../utils/connectedHealthFeedback';

export function MeasurementHealthPreview({
  onOpen,
  refreshKey,
}: {
  onOpen: () => void;
  refreshKey: unknown;
}) {
  const aurora = useAurora();
  const isFocused = useIsFocused();
  const { feedback, connectionState, isLoading, error, refresh } = useConnectedHealthFeedback({
    enabled: isFocused,
    autoSync: false,
    days: 7,
  });
  const previousRefresh = useRef(refreshKey);
  useEffect(() => {
    if (previousRefresh.current !== refreshKey) {
      previousRefresh.current = refreshKey;
      void refresh();
    }
  }, [refresh, refreshKey]);
  const status = getConnectedHealthStateCopy(connectionState, feedback.sourceLabel);
  const freshness = feedback.isStale ? aurora.tones.amber : aurora.tones.emerald;
  const metrics = ['steps', 'sleep', 'active_energy', 'resting_hr']
    .map((key) => feedback.metrics.find((metric) => metric.key === key))
    .filter((metric) => metric !== undefined);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ver salud conectada" onPress={onOpen}>
      <AuroraCard style={styles.card}>
        <View style={styles.heading}>
          <Text style={[auroraType.headline, { color: aurora.text }]}>Salud conectada</Text>
          <Ionicons name="chevron-forward" size={16} color={aurora.faint} />
        </View>
        {isLoading && !feedback.hasRealData ? (
          <ActivityIndicator color={aurora.tones.rose.tone} />
        ) : feedback.hasRealData ? (
          <>
            <View style={[styles.badge, { backgroundColor: freshness.soft }]}>
              <Text style={[styles.caption, { color: freshness.ink }]}>
                {feedback.sourceLabel} · {feedback.freshnessLabel}
              </Text>
            </View>
            <View style={styles.body}>
              <View style={styles.readiness}>
                <ReadinessRing score={feedback.readiness.score} tone="rose" size={64} stroke={6} />
                <Text style={[styles.eyebrow, { color: aurora.faint }]}>PREPARACIÓN</Text>
              </View>
              <View style={styles.metrics}>
                {metrics.map((metric) => (
                  <View key={metric.key} style={styles.metric}>
                    <Text style={[styles.caption, { color: aurora.faint }]}>{metric.label}</Text>
                    <Text style={[styles.value, { color: aurora.text }]}>{metric.value}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={[styles.caption, { color: aurora.faint }]}>
              {feedback.latestDateLabel}
            </Text>
            {connectionState !== 'ok' ? (
              <Text style={[styles.caption, { color: aurora.tones.amber.ink }]}>
                {status.compactMessage}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.caption, { color: aurora.faint }]}>
            {error ?? status.compactMessage}
          </Text>
        )}
      </AuroraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  badge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  caption: { ...auroraType.caption, fontSize: 10, lineHeight: 16 },
  body: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  readiness: { alignItems: 'center', gap: 5 },
  eyebrow: { ...auroraFont('bold'), fontSize: 8, letterSpacing: 0.5 },
  metrics: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexBasis: '44%', flexGrow: 1, gap: 2 },
  value: { ...auroraFont('extrabold'), fontSize: 14 },
});
