import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { auroraFont, useAurora } from '../../theme/aurora';

type PillSelectorItem = {
  value: string;
  label: string;
};

interface WorkoutAnalyticsPillSelectorProps {
  items: readonly PillSelectorItem[];
  value: string;
  onChange: (nextValue: string) => void;
  accessibilityLabel?: string;
}

/** Fila deslizable de opciones excluyentes, con el estilo Aurora. */
export const WorkoutAnalyticsPillSelector: React.FC<WorkoutAnalyticsPillSelectorProps> = ({
  items,
  value,
  onChange,
  accessibilityLabel,
}) => {
  const aurora = useAurora();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.content}
    >
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            onPress={() => onChange(item.value)}
            style={[
              styles.pill,
              {
                backgroundColor: isActive ? aurora.tones.blue.soft : aurora.surface,
                borderColor: isActive ? aurora.tones.blue.line : aurora.border,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                auroraFont(isActive ? 'extrabold' : 'bold'),
                { color: isActive ? aurora.tones.blue.ink : aurora.muted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 8,
  },
  pill: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
  },
});

export default WorkoutAnalyticsPillSelector;
