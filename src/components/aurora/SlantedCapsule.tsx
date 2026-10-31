import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AURORA_SIGNATURE_ANGLE } from '../../theme/aurora';
import { toSvgId } from './AuroraBackdrop';

// A soft halo without SVG blur: concentric strokes that fade outwards.
const HALO_RINGS = [
  { width: 18, opacity: 0.05 },
  { width: 13, opacity: 0.08 },
  { width: 8, opacity: 0.13 },
  { width: 4, opacity: 0.2 },
] as const;
const HALO_REACH = HALO_RINGS[0].width / 2;

type SlantedCapsuleProps = {
  width: number;
  height: number;
  /** Solid colours; translucency comes from `fillOpacity` (SVG drops the alpha of rgba stops). */
  colors: readonly [string, string];
  fillOpacity?: number;
  angle?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  /** Colour of a soft glow around the outline. */
  halo?: string;
  /** A soft copy below the capsule, for light surfaces. */
  shadow?: string;
};

/** Size of the canvas a slanted capsule needs, so callers can centre it on a point. */
export const getSlantedCapsuleBox = (width: number, height: number, angle = AURORA_SIGNATURE_ANGLE) => {
  const lean = Math.tan((angle * Math.PI) / 180) * (height / 2);
  const margin = Math.ceil(lean + HALO_REACH) + 2;
  return { width: width + margin * 2, height: height + Math.ceil(HALO_REACH) * 2 + 8 };
};

/** Sideways shift that keeps content on the capsule's slant, `dy` px below (or above) its centre. */
export const slantShift = (dy: number, angle = AURORA_SIGNATURE_ANGLE) => ({
  transform: [{ translateX: dy * Math.tan((angle * Math.PI) / 180) }],
});

/**
 * A capsule leaning from top-left to bottom-right. Android ignores `skewX` on views, so the
 * slant is drawn in SVG, where the skew is part of the shape itself.
 */
export const SlantedCapsule = ({
  width,
  height,
  colors,
  fillOpacity = 1,
  angle = AURORA_SIGNATURE_ANGLE,
  stroke,
  strokeOpacity = 1,
  strokeWidth = 0,
  halo,
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
  const shape = { x, y, width, height, rx: radius, transform: slant };

  return (
    <Svg width={box.width} height={box.height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={colors[0]} stopOpacity={fillOpacity} />
          <Stop offset="1" stopColor={colors[1]} stopOpacity={fillOpacity} />
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
      {halo
        ? HALO_RINGS.map((ring) => (
            <Rect
              key={ring.width}
              {...shape}
              fill="none"
              stroke={halo}
              strokeWidth={ring.width}
              strokeOpacity={ring.opacity}
            />
          ))
        : null}
      <Rect
        {...shape}
        fill={`url(#${gradientId})`}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
};
