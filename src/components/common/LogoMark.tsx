import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { brandColors } from '../../constants/colors';

type LogoMarkProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  wingColor?: string;
  pColor?: string;
  dotColor?: string;
  showDot?: boolean;
  showP?: boolean;
  showWings?: boolean;
};

const MARK_TRANSFORM = 'matrix(1.3297593 0 0 1.3297593 -137.48577 13.947221)';

/** Share of the square box the mark itself covers; the transform above centres it in the box. */
export const LOGO_MARK_SPAN = { width: 0.4947, height: 0.3664 } as const;

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 80,
  style,
  wingColor = brandColors.navy,
  pColor = brandColors.sky,
  dotColor = brandColors.accent,
  showDot = true,
  showP = true,
  showWings = true,
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 1080 1080"
    style={style}
  >
    <G transform={MARK_TRANSFORM}>
      {showDot ? <Circle cx={551.23} cy={326.53} r={22.67} fill={dotColor} /> : null}
      {showWings ? (
        <Path
          fill={wingColor}
          d="m353.3 317.15 129 64.2c9.22 5.82 12.63 17.52 13.5 31.8-4.04-11.79-12.3-17.7-32.1-26.85l-119.85-57.15c5.7 26.55 19.69 45.45 43.35 62.1 7.35 6.9 53.65 24.87 88.05 37.95 10 4.86 15.73 14.37 16.95 28.8-2.25-5.7-13.96-12.47-29.25-17.55-33.97-11.98-59.92-22.98-73.35-30.15 8.47 30.77 30.46 50.93 66.15 60.3 33.95 7.85 45.4 27.78 42.88 55.2l45.52-99c9.9-35.5 1.19-61.96-29.76-77.6L308.59 246.8c4.37 30.32 15.2 51.28 44.7 70.35Z"
        />
      ) : null}
      {showP ? (
        <Path
          fill={pColor}
          d="M710.3 413.9c-.22-30.36-18.45-49.05-49.5-51.6H550.85c10.88 15.67 13.5 34.65 9.9 58.2 9.19-5.08 27.6-5.61 50.76-4.4l7.44-27.74c.79-3.18 3.16-4.79 6.91-5.06h6.83c6.15 1.28 6.83 6 5.92 10.05l-16.71 64.26c-1.82 6.84-4.28 9.6-9.69 10.74h-4.5c-2.73-.62-5.14-1.49-6.38-3.43-1.17-1.83-1.27-4.64-.78-7.92l6.16-23H574.7c-8.1.9-13.57 4.43-18.6 8.55-6.18 5.49-10.99 12.4-14.2 20.95l-37.1 80.9h48.6l25.24-52.93.67-1.37h63.19c40.05-3.49 69.5-40.69 67.8-76.2Zm-67.35 44.7h-6.9c-4-.48-5.61-3.1-4.21-8.4l12.86-48.16c.3-3.04 2.23-3.93 4.85-3.94h7.5c3.16 1.11 3.89 2.9 3.5 6.37l-13.26 49.67c-.51 2.81-2.1 4.09-4.34 4.46Zm30.64-35.16-4.09 17.31c-.59 2.67-1.84 3.71-3.47 3.79h-4.33c-2.58-.12-4.21-1.46-3.2-6.13l4.28-16.37c.61-3.2 2.12-4.51 4.32-4.38l2.55.1c3.57.6 4.81 2.54 3.94 5.67Z"
        />
      ) : null}
    </G>
  </Svg>
);

export default LogoMark;
