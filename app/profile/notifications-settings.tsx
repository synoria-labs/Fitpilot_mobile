import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, Text, View, Switch, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { borderRadius, fontSize, shadows, spacing } from '../../src/constants/colors';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import { nutritionClient } from '../../src/services/api';

type NotificationPreferences = {
  push_enabled: boolean;
  meals_enabled: boolean;
  assignments_enabled: boolean;
  subscriptions_enabled: boolean;
  chat_enabled: boolean;
};

export default function NotificationsSettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    push_enabled: true,
    meals_enabled: true,
    assignments_enabled: true,
    subscriptions_enabled: true,
    chat_enabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await nutritionClient.get<{
        push_enabled?: boolean;
        meals_enabled?: boolean;
        assignments_enabled?: boolean;
        subscriptions_enabled?: boolean;
        chat_enabled?: boolean;
      }>('/users/notification-preferences');

      setPreferences({
        push_enabled: response.push_enabled ?? true,
        meals_enabled: response.meals_enabled ?? true,
        assignments_enabled: response.assignments_enabled ?? true,
        subscriptions_enabled: response.subscriptions_enabled ?? true,
        chat_enabled: response.chat_enabled ?? true,
      });
    } catch (error) {
      console.error('Failed to load preferences', error);
      Alert.alert('Error', 'No se pudieron cargar tus preferencias de notificaciones.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await nutritionClient.post('/users/notification-preferences', preferences);
      Alert.alert(
        'Éxito',
        'Tus preferencias de notificaciones se guardaron correctamente.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (error) {
      console.error('Failed to save preferences', error);
      Alert.alert('Error', 'No se pudieron guardar tus preferencias.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSwitch = (key: keyof NotificationPreferences) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const footer = (
    <View style={styles.footerActions}>
      <Button
        title="Cancelar"
        variant="secondary"
        appearance="profile"
        onPress={() => router.back()}
        fullWidth
        style={styles.footerButton}
      />
      <Button
        title="Guardar"
        appearance="profile"
        onPress={handleSave}
        isLoading={isSaving}
        fullWidth
        style={styles.footerButton}
      />
    </View>
  );

  return (
    <ProfileDetailScreen
      title="Notificaciones"
      subtitle="Configura qué tipo de avisos quieres recibir en tu dispositivo."
      footer={footer}
    >
      <View style={styles.card}>
        {isLoading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
        ) : (
          <View>
            <View style={styles.settingRow}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Notificaciones push</Text>
                <Text style={styles.settingDescription}>Activar o desactivar todas las notificaciones push.</Text>
              </View>
              <Switch
                value={preferences.push_enabled}
                onValueChange={() => toggleSwitch('push_enabled')}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={styles.divider} />

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Recordatorios de comidas</Text>
                <Text style={styles.settingDescription}>Avisos para registrar y cumplir con tus comidas.</Text>
              </View>
              <Switch
                value={preferences.meals_enabled}
                onValueChange={() => toggleSwitch('meals_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Planes y rutinas</Text>
                <Text style={styles.settingDescription}>Notificaciones cuando tu profesional te asigne nuevos planes.</Text>
              </View>
              <Switch
                value={preferences.assignments_enabled}
                onValueChange={() => toggleSwitch('assignments_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Chat</Text>
                <Text style={styles.settingDescription}>Mensajes nuevos de tu profesional.</Text>
              </View>
              <Switch
                value={preferences.chat_enabled}
                onValueChange={() => toggleSwitch('chat_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Suscripciones y alertas</Text>
                <Text style={styles.settingDescription}>
                  Avisos sobre pagos y días restantes de tu paquete.
                </Text>
              </View>
              <Switch
                value={preferences.subscriptions_enabled}
                onValueChange={() => toggleSwitch('subscriptions_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>
          </View>
        )}
      </View>
    </ProfileDetailScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    loader: {
      marginVertical: spacing.xl,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    disabledRow: {
      opacity: 0.5,
    },
    textContainer: {
      flex: 1,
      paddingRight: spacing.md,
    },
    settingTitle: {
      fontSize: fontSize.base,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      marginBottom: spacing.xs,
    },
    settingDescription: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: spacing.sm,
    },
    footerActions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    footerButton: {
      flex: 1,
    },
  });
