import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { auroraRadius, useAurora } from '../../theme/aurora';

type AuroraGlassProps = ViewProps & {
  radius?: number;
  padding?: number;
  /** Each blurred surface costs a native pass; small ones can keep only the glass tint. */
  blur?: boolean;
  elevated?: boolean;
};

/** The glass itself (blur, tint and edge), clipped to its radius and laid behind what sits on it. */
export const AuroraGlassLayer = ({ radius, blur = true }: { radius: number; blur?: boolean }) => {
  const aurora = useAurora();

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius, borderColor: aurora.glassBorder }]}
    >
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
    </View>
  );
};

/**
 * Frosted surface that lets the aurora show through. The glass lives in a clipped layer behind
 * the children, so a child's own shadow (a selected tab, say) is not cut at the edge.
 */
export const AuroraGlass = ({
  radius = auroraRadius.card,
  padding = 0,
  blur = true,
  elevated = false,
  style,
  children,
  ...rest
}: AuroraGlassProps) => {
  const aurora = useAurora();

  return (
    <View {...rest} style={[{ borderRadius: radius, boxShadow: elevated ? aurora.shadowLg : aurora.shadow }, style]}>
      <AuroraGlassLayer radius={radius} blur={blur} />
      <View style={{ padding }}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    borderWidth: 1,
  },
});
