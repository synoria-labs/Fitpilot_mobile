import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auroraFont, useAurora } from '../../theme/aurora';

type AuthTextFieldProps = TextInputProps & {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

/**
 * Labelled input for the sign-in form: a solid field on the glass card that lights up in blue
 * with a soft ring while focused. Passing `secureTextEntry` (even `false`) adds the show/hide
 * toggle, like the shared Input.
 */
export const AuthTextField = ({
  label,
  icon,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...rest
}: AuthTextFieldProps) => {
  const aurora = useAurora();
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const blue = aurora.tones.blue;
  const isPassword = secureTextEntry !== undefined;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: aurora.text }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: aurora.surface,
            borderColor: isFocused ? blue.tone : aurora.borderStrong,
            boxShadow: isFocused ? `0px 0px 0px 4px ${blue.soft}` : undefined,
          },
        ]}
      >
        <Ionicons name={icon} size={19} color={isFocused ? blue.tone : aurora.faint} />
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={aurora.faint}
          selectionColor={blue.tone}
          cursorColor={blue.tone}
          secureTextEntry={isPassword && !isRevealed}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: aurora.text }, style]}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setIsRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={styles.reveal}
          >
            <Ionicons name={isRevealed ? 'eye-off-outline' : 'eye-outline'} size={19} color={aurora.faint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    ...auroraFont('bold'),
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingLeft: 14,
    paddingRight: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  input: {
    ...auroraFont('medium'),
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 16,
    ...Platform.select({ android: { includeFontPadding: false, textAlignVertical: 'center' as const } }),
  },
  reveal: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
