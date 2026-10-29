import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

type BrandWordmarkProps = {
  width: number;
  color: string;
};

// Same geometry as assets/logo-wordmark-dark.svg, drawn here so the fill can follow the theme.
const VIEW_BOX = { x: 245, y: 580, width: 610, height: 135 };

/** The «FitPilot» lettering in a single colour; the height follows the width. */
export const BrandWordmark = ({ width, color }: BrandWordmarkProps) => (
  <Svg
    width={width}
    height={(width * VIEW_BOX.height) / VIEW_BOX.width}
    viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
  >
    <G fill={color}>
      <Path d="M277.5 617.92v29.97h52.49v21.06H277.5v41.31h-26.24v-113.4h85.7v21.06H277.5z" />
      <Path d="M348.3 596.86c0-7.94 6.32-14.09 15.71-14.09s15.71 5.83 15.71 13.61c0 8.42-6.32 14.58-15.71 14.58s-15.71-6.16-15.71-14.09Zm3.08 26.24h25.27v87.16h-25.27z" />
      <Path d="M456.35 706.05c-5.18 3.73-12.8 5.51-20.57 5.51-20.57 0-32.56-10.53-32.56-31.27v-35.8h-13.45v-19.44h13.45v-21.22h25.27v21.22h21.71v19.44h-21.71v35.48c0 7.45 4.05 11.5 10.85 11.5 3.73 0 7.45-1.13 10.21-3.24l6.8 17.82Z" />
      <Path d="M570.72 638c0 25.27-18.95 40.99-49.25 40.99h-22.84v31.27h-26.24v-113.4h49.09c30.29 0 49.25 15.71 49.25 41.15Zm-26.56 0c0-12.47-8.1-19.76-24.14-19.76h-21.38v39.37h21.38c16.04 0 24.14-7.29 24.14-19.6Z" />
      <Path d="M584.49 596.86c0-7.94 6.32-14.09 15.71-14.09s15.71 5.83 15.71 13.61c0 8.42-6.32 14.58-15.71 14.58s-15.71-6.16-15.71-14.09Zm3.08 26.24h25.27v87.16h-25.27z" />
      <Path d="M636.33 590.05h25.27v120.21h-25.27z" />
      <Path d="M678.61 666.68c0-26.24 20.25-44.88 47.95-44.88s47.79 18.63 47.79 44.88-20.09 44.88-47.79 44.88-47.95-18.63-47.95-44.88Zm70.15 0c0-15.07-9.56-24.14-22.19-24.14s-22.36 9.07-22.36 24.14 9.72 24.14 22.36 24.14 22.19-9.07 22.19-24.14Z" />
      <Path d="M847.42 706.05c-5.18 3.73-12.8 5.51-20.57 5.51-20.57 0-32.56-10.53-32.56-31.27v-35.8h-13.45v-19.44h13.45v-21.22h25.27v21.22h21.71v19.44h-21.71v35.48c0 7.45 4.05 11.5 10.85 11.5 3.73 0 7.45-1.13 10.21-3.24l6.8 17.82Z" />
    </G>
  </Svg>
);
