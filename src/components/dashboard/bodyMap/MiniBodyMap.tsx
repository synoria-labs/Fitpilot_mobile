import React, { useMemo } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { brandColors, colors } from '../../../constants/colors';
import type { MuscleVolumeItem } from '../../../types';
import { BODY_MAP_MUSCLE_PATHS, BODY_MAP_OUTLINES, BODY_MAP_VIEWBOX, type BodyMapView } from './bodyMapAtlas';
import { clamp } from '../../../utils/math';

const SESSION_REFERENCE_MAX = 12;

const withAlpha = (hexColor: string, alpha: number) => {
  const normalized = hexColor.replace('#', '');
  const safeAlpha = clamp(alpha, 0, 1);

  if (normalized.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
};

const getHighlightAlpha = (ratio: number) => {
  if (ratio >= 0.85) {
    return 0.82;
  }

  if (ratio >= 0.6) {
    return 0.62;
  }

  if (ratio >= 0.3) {
    return 0.45;
  }

  if (ratio > 0) {
    return 0.28;
  }

  return 0;
};

export interface MiniBodyMapProps {
  muscles: MuscleVolumeItem[];
  view: BodyMapView;
  width: number;
  height: number;
}

export const MiniBodyMap: React.FC<MiniBodyMapProps> = ({
  muscles,
  view,
  width,
  height,
}) => {
  const intensityByMuscle = useMemo(() => {
    const map = new Map<string, number>();

    muscles.forEach((muscle) => {
      map.set(
        muscle.muscle_name,
        clamp(muscle.effective_sets / SESSION_REFERENCE_MAX, 0, 1),
      );
    });

    return map;
  }, [muscles]);

  const highlightEntries = useMemo(
    () =>
      Object.entries(BODY_MAP_MUSCLE_PATHS[view]).filter(([muscleName]) => {
        const ratio = intensityByMuscle.get(muscleName) ?? 0;
        return ratio > 0;
      }),
    [intensityByMuscle, view],
  );

  const silhouetteFill = withAlpha(colors.white, 0.08);
  const silhouetteStroke = withAlpha(colors.white, 0.2);
  const contourGlowOuterStroke = withAlpha(brandColors.sky, 0.08);
  const contourGlowInnerStroke = withAlpha(brandColors.sky, 0.16);
  const contourStroke = withAlpha(colors.white, 0.3);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={BODY_MAP_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
    >
      <Path
        d={BODY_MAP_OUTLINES[view]}
        fill={silhouetteFill}
        stroke={silhouetteStroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {highlightEntries.map(([muscleName, paths]) => {
        const ratio = intensityByMuscle.get(muscleName) ?? 0;
        const highlightFill = withAlpha(brandColors.sky, getHighlightAlpha(ratio));

        return (
          <G key={`${view}-${muscleName}`}>
            {paths.map((d, index) => (
              <Path
                key={`${muscleName}-${index}`}
                d={d}
                fill={highlightFill}
                stroke={withAlpha(colors.white, 0.08)}
                strokeWidth={0.45}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </G>
        );
      })}

      <Path
        d={BODY_MAP_OUTLINES[view]}
        fill="none"
        stroke={contourGlowOuterStroke}
        strokeWidth={5.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Path
        d={BODY_MAP_OUTLINES[view]}
        fill="none"
        stroke={contourGlowInnerStroke}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Path
        d={BODY_MAP_OUTLINES[view]}
        fill="none"
        stroke={contourStroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export type { BodyMapView } from './bodyMapAtlas';
