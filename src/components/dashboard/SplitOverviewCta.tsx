import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../constants/colors';
import { AuroraCard, IconBadge } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';

interface SplitOverviewCtaProps {
  onPress: () => void;
  horizontalPadding: number;
}

export const SplitOverviewCta: React.FC<SplitOverviewCtaProps> = ({ onPress, horizontalPadding }) => {
  const aurora = useAurora();

  return (
    <View style={[styles.section, { paddingHorizontal: horizontalPadding }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ver el split completo del microciclo"
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
      >
        <AuroraCard padding={14} style={styles.cta}>
          <IconBadge icon="grid-outline" tone="violet" size={40} />
          <View style={styles.copy}>
            <Text style={[styles.title, auroraFont('extrabold'), { color: aurora.text }]}>Ver split completo</Text>
            <Text style={[auroraType.caption, { color: aurora.faint }]} numberOfLines={2}>
              Revisa todos los días y ejercicios de tu microciclo en una sola vista.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={aurora.faint} />
        </AuroraCard>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
  },
});
