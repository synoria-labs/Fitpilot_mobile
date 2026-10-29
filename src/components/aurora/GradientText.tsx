import React from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

type GradientTextProps = {
  children: string;
  colors: readonly [string, string, ...string[]];
  style?: StyleProp<TextStyle>;
};

/** Text filled with a horizontal gradient, used for the user's name in the home greeting. */
export const GradientText = ({ children, colors, style }: GradientTextProps) => (
  <View accessible accessibilityRole="text" accessibilityLabel={children}>
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>
        <Text importantForAccessibility="no" style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  </View>
);
