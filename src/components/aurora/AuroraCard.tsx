import React from 'react';
import { View, type ViewProps } from 'react-native';
import { auroraRadius, useAurora } from '../../theme/aurora';

type AuroraCardProps = ViewProps & {
  padding?: number;
  radius?: number;
  /** Heroes and sheets float higher than regular cards. */
  elevated?: boolean;
};

export const AuroraCard = ({
  padding = 18,
  radius = auroraRadius.card,
  elevated = false,
  style,
  children,
  ...rest
}: AuroraCardProps) => {
  const aurora = useAurora();

  return (
    <View
      {...rest}
      style={[
        {
          padding,
          borderRadius: radius,
          backgroundColor: aurora.surface,
          borderWidth: 1,
          borderColor: aurora.border,
          boxShadow: elevated ? aurora.shadowLg : aurora.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
