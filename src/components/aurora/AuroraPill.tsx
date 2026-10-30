import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auroraFont, useAurora, type AuroraTone } from '../../theme/aurora';
import type { AuroraIconName } from './IconBadge';

type AuroraPillProps = {
  label: string;
  tone?: AuroraTone;
  icon?: AuroraIconName;
  /** `glass` floats over the aurora; `soft` sits on cards. */
  variant?: 'soft' | 'glass';
  size?: 'sm' | 'md';
};

export const AuroraPill = ({ label, tone = 'slate', icon, variant = 'soft', size = 'sm' }: AuroraPillProps) => {
  const aurora = useAurora();
  const colors = aurora.tones[tone];
  const isLarge = size === 'md';

  return (
    <View
      style={[
        styles.pill,
        isLarge ? styles.pillLarge : null,
        variant === 'glass'
          ? { backgroundColor: aurora.glass, borderColor: colors.line, borderWidth: 1 }
          : { backgroundColor: colors.soft },
      ]}
    >
      {icon ? <Ionicons name={icon} size={isLarge ? 15 : 12} color={colors.tone} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.label, isLarge ? styles.labelLarge : null, auroraFont(isLarge ? 'bold' : 'extrabold'), { color: colors.ink }]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  pillLarge: {
    gap: 6,
    height: 36,
    paddingHorizontal: 13,
  },
  label: {
    fontSize: 11,
  },
  labelLarge: {
    fontSize: 12.5,
  },
});
