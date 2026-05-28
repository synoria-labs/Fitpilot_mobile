import React, { useCallback, useState, useEffect } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View, Switch, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Button } from '../../src/components/common';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { borderRadius, fontSize, shadows, spacing } from '../../src/constants/colors';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import { nutritionClient } from '../../src/services/api';
import { registerDevicePushTokenForUser } from '../../src/services/notifications';
import { useAuthStore } from '../../src/store/authStore';

type NotificationPreferences = {
  push_enabled: boolean;
  meals_enabled: boolean;
  assignments_enabled: boolean;
  subscriptions_enabled: boolean;
  health_insights_enabled: boolean;
  step_reminders_enabled: boolean;
  quiet_hours_start_min: number;
  quiet_hours_end_min: number;
};

type BooleanPrefKey = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean ? K : never;
}[keyof NotificationPreferences];

const DEFAULT_QUIET_START_MIN = 22 * 60;
const DEFAULT_QUIET_END_MIN = 7 * 60;

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

type SystemPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

export default function NotificationsSettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const userId = useAuthStore((state) => state.user?.id);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    push_enabled: true,
    meals_enabled: true,
    assignments_enabled: true,
    subscriptions_enabled: true,
    health_insights_enabled: true,
    step_reminders_enabled: true,
    quiet_hours_start_min: DEFAULT_QUIET_START_MIN,
    quiet_hours_end_min: DEFAULT_QUIET_END_MIN,
  });
  const [systemStatus, setSystemStatus] = useState<SystemPermissionStatus>('unknown');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const refreshSystemStatus = useCallback(async () => {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        setSystemStatus('granted');
      } else if (status === 'denied' && !canAskAgain) {
        setSystemStatus('denied');
      } else {
        setSystemStatus('undetermined');
      }
    } catch {
      setSystemStatus('unknown');
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
    void refreshSystemStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshSystemStatus();
      }
    });
    return () => subscription.remove();
  }, [refreshSystemStatus]);

  const loadPreferences = async () => {
    try {
      const response = await nutritionClient.get<{
        push_enabled?: boolean;
        meals_enabled?: boolean;
        assignments_enabled?: boolean;
        subscriptions_enabled?: boolean;
        health_insights_enabled?: boolean;
        step_reminders_enabled?: boolean;
        quiet_hours_start_min?: number;
        quiet_hours_end_min?: number;
      }>('/users/notification-preferences');

      setPreferences({
        push_enabled: response.push_enabled ?? true,
        meals_enabled: response.meals_enabled ?? true,
        assignments_enabled: response.assignments_enabled ?? true,
        subscriptions_enabled: response.subscriptions_enabled ?? true,
        health_insights_enabled: response.health_insights_enabled ?? true,
        step_reminders_enabled: response.step_reminders_enabled ?? true,
        quiet_hours_start_min: response.quiet_hours_start_min ?? DEFAULT_QUIET_START_MIN,
        quiet_hours_end_min: response.quiet_hours_end_min ?? DEFAULT_QUIET_END_MIN,
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

  const toggleSwitch = (key: BooleanPrefKey) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTogglePushEnabled = async () => {
    const turningOn = !preferences.push_enabled;
    if (!turningOn) {
      toggleSwitch('push_enabled');
      return;
    }
    if (systemStatus === 'granted') {
      toggleSwitch('push_enabled');
      return;
    }
    if (systemStatus === 'denied') {
      Alert.alert(
        'Permiso bloqueado',
        'Has desactivado las notificaciones en los ajustes del sistema. Ábrelos para reactivarlas.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    if (userId) {
      await registerDevicePushTokenForUser(userId);
    }
    await refreshSystemStatus();
    const result = await Notifications.getPermissionsAsync();
    if (result.status === 'granted') {
      toggleSwitch('push_enabled');
    }
  };

  const showDeniedBanner = systemStatus === 'denied';

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
      {showDeniedBanner ? (
        <Pressable
          onPress={() => void Linking.openSettings()}
          style={styles.deniedBanner}
        >
          <Text style={styles.deniedTitle}>Notificaciones bloqueadas</Text>
          <Text style={styles.deniedBody}>
            Has desactivado las notificaciones para Fitpilot en los ajustes del sistema. Toca aquí para abrir los ajustes y reactivarlas.
          </Text>
        </Pressable>
      ) : null}
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
                value={preferences.push_enabled && systemStatus === 'granted'}
                onValueChange={() => void handleTogglePushEnabled()}
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

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Insights de salud</Text>
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Insights personalizados</Text>
                <Text style={styles.settingDescription}>
                  Avisos basados en tu sueño, recuperación y métricas de salud conectadas.
                </Text>
              </View>
              <Switch
                value={preferences.health_insights_enabled}
                onValueChange={() => toggleSwitch('health_insights_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Recordatorios de pasos</Text>
                <Text style={styles.settingDescription}>
                  Avisos cuando vas por debajo de tu meta diaria de pasos.
                </Text>
              </View>
              <Switch
                value={preferences.step_reminders_enabled}
                onValueChange={() => toggleSwitch('step_reminders_enabled')}
                disabled={!preferences.push_enabled}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>

            <View style={[styles.settingRow, !preferences.push_enabled ? styles.disabledRow : null]}>
              <View style={styles.textContainer}>
                <Text style={styles.settingTitle}>Modo no molestar</Text>
                <Text style={styles.settingDescription}>
                  {preferences.quiet_hours_start_min !== preferences.quiet_hours_end_min
                    ? `Silencio de ${formatMinutes(preferences.quiet_hours_start_min)} a ${formatMinutes(preferences.quiet_hours_end_min)}.`
                    : 'No se silenciarán notificaciones por horario.'}
                </Text>
              </View>
              <Switch
                value={preferences.quiet_hours_start_min !== preferences.quiet_hours_end_min}
                onValueChange={(next) =>
                  setPreferences((prev) => ({
                    ...prev,
                    quiet_hours_start_min: next ? DEFAULT_QUIET_START_MIN : 0,
                    quiet_hours_end_min: next ? DEFAULT_QUIET_END_MIN : 0,
                  }))
                }
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
    deniedBanner: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.error,
      marginBottom: spacing.md,
    },
    deniedTitle: {
      fontSize: fontSize.base,
      fontWeight: '600',
      color: theme.colors.error,
      marginBottom: spacing.xs,
    },
    deniedBody: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    sectionHeader: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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
