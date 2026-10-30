import React, { useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { auroraFont } from '../../theme/aurora';

type DietShoppingCardProps = {
  onOpenList: () => void;
};

/** The week's shopping list on a deep emerald card, the screen's one dark surface. */
export const DietShoppingCard = ({ onOpenList }: DietShoppingCardProps) => {
  const glowId = toSvgId(useId());

  return (
    <LinearGradient
      colors={['#052e26', '#064e3b', '#0f766e']}
      locations={[0, 0.55, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.card}
    >
      <Svg pointerEvents="none" width={200} height={200} style={styles.glow}>
        <Defs>
          <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#6ee7b7" stopOpacity={0.35} />
            <Stop offset="0.7" stopColor="#6ee7b7" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={100} cy={100} r={100} fill={`url(#${glowId})`} />
      </Svg>

      <View style={styles.row}>
        <LinearGradient colors={['#a7f3d0', '#34d399']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
          <Ionicons name="cart-outline" size={23} color="#052e26" />
        </LinearGradient>
        <View style={styles.copy}>
          <Text style={[styles.title, auroraFont('extrabold')]}>Lista del súper</Text>
          <Text style={[styles.subtitle, auroraFont('medium')]}>Lo que necesitas para los menús de la semana</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver la lista del súper"
        onPress={onOpenList}
        style={({ pressed }) => [styles.buttonPress, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <LinearGradient colors={['#ffffff', '#d1fae5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          <Ionicons name="list-outline" size={17} color="#052e26" />
          <Text style={[styles.buttonText, auroraFont('extrabold')]}>Ver lista y PDF</Text>
        </LinearGradient>
      </Pressable>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 24,
    overflow: 'hidden',
    boxShadow: '0px 30px 50px -30px rgba(4, 47, 38, 0.85)',
  },
  glow: {
    position: 'absolute',
    right: -40,
    bottom: -70,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    color: '#ecfdf5',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#a7d8c6',
  },
  buttonPress: {
    marginTop: 16,
  },
  button: {
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    color: '#052e26',
  },
});
