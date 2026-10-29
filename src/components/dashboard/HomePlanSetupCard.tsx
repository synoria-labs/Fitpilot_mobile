import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuroraCard, AuroraPill, IconBadge, type AuroraIconName } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';

const PENDING_PLAN_CHIPS: { key: string; label: string; icon: AuroraIconName }[] = [
  {
    key: 'training',
    label: 'Entrenamiento pendiente',
    icon: 'barbell-outline',
  },
  {
    key: 'nutrition',
    label: 'Nutrición pendiente',
    icon: 'restaurant-outline',
  },
];

export const HomePlanSetupCard: React.FC = () => {
  const aurora = useAurora();

  return (
    <AuroraCard padding={16} radius={24} style={styles.card}>
      <View style={styles.headerRow}>
        <IconBadge icon="sparkles-outline" tone="violet" variant="solid" size={40} />
        <View style={styles.headerCopy}>
          <Text style={[auroraType.headline, { color: aurora.text }]}>Completa tus planes</Text>
          <Text style={[styles.description, auroraFont('medium'), { color: aurora.muted }]}>
            Cuando tengas profesionales o planes asignados, verás aquí tu
            entrenamiento y nutrición activos.
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {PENDING_PLAN_CHIPS.map((chip) => (
          <AuroraPill key={chip.key} label={chip.label} icon={chip.icon} tone="slate" />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar profesionales"
        onPress={() => router.push('/professionals')}
        style={({ pressed }) => [styles.ctaPress, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      >
        <LinearGradient
          colors={aurora.tones.blue.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ctaButton, { boxShadow: `0px 12px 24px -14px ${aurora.tones.blue.tone}` }]}
        >
          <Ionicons name="search-outline" size={16} color={aurora.onTone} />
          <Text style={[styles.ctaText, auroraFont('extrabold'), { color: aurora.onTone }]}>
            Buscar profesionales
          </Text>
        </LinearGradient>
      </Pressable>
    </AuroraCard>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ctaPress: {
    alignSelf: 'stretch',
  },
  ctaButton: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 14,
  },
});

export default HomePlanSetupCard;
