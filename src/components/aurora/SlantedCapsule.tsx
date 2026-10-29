import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AURORA_SIGNATURE_ANGLE } from '../../theme/aurora';
import { toSvgId } from './AuroraBackdrop';

const GLOW_WIDTH = 6;

type SlantedCapsuleProps = {
  width: number;
  height: number;
  colors: readonly [string, string];
  angle?: number;
  stroke?: string;
  strokeWidth?: number;
  /** A soft halo around the outline. */
  glow?: string;
  /** A blurred-looking copy below the capsule, for light surfaces. */
  shadow?: string;
};

/** Size of the canvas a slanted capsule needs, so callers can centre it on a point. */
export const getSlantedCapsuleBox = (width: number, height: number, angle = AURORA_SIGNATURE_ANGLE) => {
  const lean = Math.tan((angle * Math.PI) / 180) * (height / 2);
  const margin = Math.ceil(lean) + GLOW_WIDTH;
  return { width: width + margin * 2, height: height + GLOW_WIDTH * 2 + 8 };
};

/**
 * A capsule leaning from top-left to bottom-right. Android ignores `skewX` on views, so the
 * slant is drawn in SVG, where the skew is part of the shape itself.
 */
export const SlantedCapsule = ({
  width,
  height,
  colors,
  angle = AURORA_SIGNATURE_ANGLE,
  stroke,
  strokeWidth = 0,
  glow,
  shadow,
}: SlantedCapsuleProps) => {
  const gradientId = toSvgId(useId());
  const box = getSlantedCapsuleBox(width, height, angle);
  const x = (box.width - width) / 2;
  const y = (box.height - height) / 2;
  const cx = box.width / 2;
  const cy = box.height / 2;
  const slant = `translate(${cx} ${cy}) skewX(${angle}) translate(${-cx} ${-cy})`;
  const radius = width / 2;

  return (
    <Svg width={box.width} height={box.height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      {shadow ? (
        <Rect
          x={x + 2}
          y={y + 6}
          width={width - 4}
          height={height - 2}
          rx={radius}
          fill={shadow}
          opacity={0.28}
          transform={slant}
        />
      ) : null}
      {glow ? (
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={radius}
          fill="none"
          stroke={glow}
          strokeWidth={GLOW_WIDTH}
          opacity={0.45}
          transform={slant}
        />
      ) : null}
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={`url(#${gradientId})`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        transform={slant}
      />
    </Svg>
  );
};
