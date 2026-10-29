import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAurora } from '../../theme/aurora';

type AuthGlassCardProps = {
  children: React.ReactNode;
  radius?: number;
  padding?: number;
  /**
   * Frost what lies behind with a real blur. Each blurred card costs a native pass, so small
   * cards can skip it and keep only the glass tint.
   */
  blur?: boolean;
  /** The main card floats higher than the notes around it. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Frosted-glass surface that lets the aurora show through, used for the sign-in form. */
export const AuthGlassCard = ({
  children,
  radius = 28,
  padding = 20,
  blur = true,
  elevated = true,
  style,
}: AuthGlassCardProps) => {
  const aurora = useAurora();

  return (
    <View style={[{ borderRadius: radius, boxShadow: elevated ? aurora.shadowLg : aurora.shadow }, style]}>
      <View style={[styles.clip, { borderRadius: radius, borderColor: aurora.glassBorder }]}>
        {blur ? (
          <BlurView
            intensity={aurora.isDark ? 40 : 30}
            tint={aurora.isDark ? 'dark' : 'light'}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
            // Android's blur view ignores its parent's rounded clip, so it gets the corners too.
            style={[StyleSheet.absoluteFill, { borderRadius: radius - 1 }]}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: aurora.glass }]} />
        <View style={{ padding }}>{children}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    borderWidth: 1,
  },
});
