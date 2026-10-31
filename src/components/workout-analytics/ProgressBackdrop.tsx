import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Pattern,
  Path,
} from 'react-native-svg';
import { useAppTheme } from '../../theme';

export function ProgressBackdrop() {
  const { theme } = useAppTheme();
  return (
    <View pointerEvents="none" style={styles.background}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="progressBlue" cx="85%" cy="0%" rx="90%" ry="85%">
            <Stop
              offset="0"
              stopColor={theme.isDark ? '#1d4ed8' : '#93c5fd'}
              stopOpacity={theme.isDark ? 0.26 : 0.5}
            />
            <Stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="progressViolet" cx="0%" cy="55%" rx="75%" ry="65%">
            <Stop offset="0" stopColor="#a78bfa" stopOpacity={theme.isDark ? 0.1 : 0.2} />
            <Stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="progressGridFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.isDark ? '#060c18' : '#f2f5fa'} stopOpacity="0" />
            <Stop offset="1" stopColor={theme.isDark ? '#060c18' : '#f2f5fa'} stopOpacity="1" />
          </LinearGradient>
          <Pattern id="progressGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <Path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke={theme.isDark ? '#94a3b8' : '#0f172a'}
              strokeOpacity="0.045"
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#progressBlue)" />
        <Rect width="100%" height="100%" fill="url(#progressViolet)" />
        <Rect width="100%" height="100%" fill="url(#progressGrid)" />
        <Rect width="100%" height="100%" fill="url(#progressGridFade)" />
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 600 },
});
