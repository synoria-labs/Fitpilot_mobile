import React, { useId } from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { useAurora } from '../../theme/aurora';

type RecipeDishProps = {
  uri: string;
  /** Side of the square the dish is fitted into. */
  size: number;
  style?: StyleProp<ViewStyle>;
  onError?: () => void;
};

/**
 * A recipe photo without background, drawn whole. The dish's own outline casts its shadow: a
 * drop-shadow filter on Android, and on iOS a layer shadow, which follows the image's alpha.
 */
export const RecipeDish = ({ uri, size, style, onError }: RecipeDishProps) => {
  const aurora = useAurora();
  const offset = Math.max(4, Math.round(size * 0.11));
  const shadow: ViewStyle =
    Platform.OS === 'android'
      ? {
          filter: [
            {
              dropShadow: {
                offsetX: 0,
                offsetY: offset,
                standardDeviation: offset / 2,
                color: aurora.isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(15, 23, 42, 0.3)',
              },
            },
          ],
        }
      : {
          shadowColor: aurora.isDark ? '#000000' : '#0f172a',
          shadowOpacity: aurora.isDark ? 0.6 : 0.3,
          shadowRadius: offset / 2,
          shadowOffset: { width: 0, height: offset },
        };

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, shadow, style]}>
      <Image source={{ uri }} resizeMode="contain" onError={onError} style={styles.image} />
    </View>
  );
};

/** The soft ellipse a dish rests on. */
export const DishContactShadow = ({
  width,
  height,
  style,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const aurora = useAurora();
  const id = toSvgId(useId());
  const color = aurora.isDark ? '#000000' : '#0f172a';

  return (
    <Svg pointerEvents="none" width={width} height={height} style={style}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={aurora.isDark ? 0.55 : 0.26} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${id})`} />
    </Svg>
  );
};

/** A round glow of the meal's colour behind a dish. */
export const DishHalo = ({ size, color, style }: { size: number; color: string; style?: StyleProp<ViewStyle> }) => {
  const id = toSvgId(useId());

  return (
    <Svg pointerEvents="none" width={size} height={size} style={style}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.36} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
};

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
