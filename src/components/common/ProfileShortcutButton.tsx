import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

type ProfileShortcutButtonProps = {
  size?: 'sm' | 'md';
};

export const ProfileShortcutButton = ({ size = 'md' }: ProfileShortcutButtonProps) => {
  const user = useAuthStore((state) => state.user);
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [hasImageError, setHasImageError] = useState(false);
  const isSmall = size === 'sm';

  useEffect(() => {
    setHasImageError(false);
  }, [user?.profilePictureUrl]);

  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || '';
    return source
      .split(' ')
      .map((token) => token[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [user?.displayName, user?.email]);

  const imageUrl = user?.profilePictureUrl ?? undefined;
  const canShowImage = Boolean(imageUrl && !hasImageError);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Abrir perfil"
      activeOpacity={0.86}
      onPress={() => router.push('/profile')}
      style={[styles.button, isSmall ? styles.buttonSmall : null]}
    >
      {canShowImage ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.avatarImage}
          onError={() => setHasImageError(true)}
        />
      ) : initials ? (
        <View style={styles.initialsFallback}>
          <Text style={[styles.initialsText, isSmall ? styles.initialsTextSmall : null]}>
            {initials}
          </Text>
        </View>
      ) : (
        <Ionicons
          name="person-outline"
          size={isSmall ? 18 : 20}
          color={theme.colors.primary}
        />
      )}
    </TouchableOpacity>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      overflow: 'hidden',
    },
    buttonSmall: {
      width: 40,
      height: 40,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    initialsFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: spacing.xs,
    },
    initialsText: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: theme.colors.primary,
    },
    initialsTextSmall: {
      fontSize: fontSize.xs,
    },
  });

export default ProfileShortcutButton;
