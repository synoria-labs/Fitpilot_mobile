import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAurora, type AuroraTone } from '../../theme/aurora';

export type AuroraIconName = React.ComponentProps<typeof Ionicons>['name'];

type IconBadgeProps = {
  icon: AuroraIconName;
  tone: AuroraTone;
  variant?: 'solid' | 'soft';
  size?: number;
};

export const IconBadge = ({ icon, tone, variant = 'soft', size = 36 }: IconBadgeProps) => {
  const aurora = useAurora();
  const colors = aurora.tones[tone];
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size / 3),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const iconSize = Math.round(size * 0.5);

  if (variant === 'solid') {
    return (
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[box, { boxShadow: `0px 10px 20px -12px ${colors.tone}` }]}
      >
        <Ionicons name={icon} size={iconSize} color={aurora.onTone} />
      </LinearGradient>
    );
  }

  return (
    <View style={[box, { backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line }]}>
      <Ionicons name={icon} size={iconSize} color={colors.ink} />
    </View>
  );
};
