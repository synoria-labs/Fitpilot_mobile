import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { buildMonotonePath } from '../../utils/chartScale';
import { toSvgId } from './AuroraBackdrop';

type SparklineProps = {
  values: number[];
  color: string;
  width: number;
  height?: number;
  area?: boolean;
};

const INSET = 4;

/** Smooth trend line with a soft area and a dot on the latest value. Decorative: no axis. */
export const Sparkline = ({ values, color, width, height = 34, area = true }: SparklineProps) => {
  const gradientId = toSvgId(useId());
  const min = Math.min(...values);
  const max = Math.max(...values);

  // A flat or single-point line says nothing; leave the space empty instead.
  if (values.length < 2 || width <= INSET * 2 || max === min) {
    return <View style={{ height }} />;
  }

  const span = max - min;
  const points = values.map((value, index) => ({
    x: INSET + (index / (values.length - 1)) * (width - INSET * 2),
    y: height - INSET - ((value - min) / span) * (height - INSET * 2 - 2),
  }));
  const line = buildMonotonePath(points);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {area ? (
        <Path d={`${line} L ${last.x} ${height} L ${first.x} ${height} Z`} fill={`url(#${gradientId})`} />
      ) : null}
      <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={5.5} fill={color} fillOpacity={0.18} />
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </Svg>
  );
};
