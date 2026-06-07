import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/components/common';
import { borderRadius, fontSize, spacing } from '../src/constants/colors';
import { connectedHealthService } from '../src/services/connectedHealth';
import { useAuthStore } from '../src/store/authStore';
import { useThemedStyles, type AppTheme } from '../src/theme';
import type { FitpilotHealthAvailability } from '../modules/fitpilot-health';

const valueProps: { icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }[] = [
  {
    icon: 'pulse-outline',
    title: 'Recuperacion y descanso',
    copy: 'Sueno, HRV y FC en reposo para ajustar tu carga.',
  },
  {
    icon: 'flame-outline',
    title: 'Energia real',
    copy: 'Pasos y kcal activas para afinar tus objetivos.',
  },
  {
    icon: 'bulb-outline',
    title: 'Recomendaciones',
    copy: 'Tu entrenador recibe senales para mejores ajustes.',
  },
];

const getPlatformLabel = (platform?: string | null) => {
  if (platform === 'healthkit') {
    return 'Apple Health';
  }
  if (platform === 'health_connect') {
    return 'Health Connect';
  }
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
};

export default function HealthSetupScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuthStore();
  const [availability, setAvailability] = useState<FitpilotHealthAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [shareWithTrainer, setShareWithTrainer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = availability?.available ?? false;
  const isBusy = isConnecting || isSkipping;

  const load = useCallback(async () => {
    try {
      const result = await connectedHealthService.isAvailable();
      setAvailability(result);
    } catch {
      setAvailability({ available: false, platform: 'unsupported', status: 'unsupported' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const finish = useCallback(async () => {
    await refreshUser();
    router.replace('/(tabs)');
  }, [refreshUser]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectedHealthService.requestPermissions();
      await connectedHealthService.sync(30);
      await connectedHealthService.setSharing(shareWithTrainer).catch(() => undefined);
      await connectedHealthService.setSetupStatus('completed');
      await finish();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo activar salud conectada. Intenta de nuevo.',
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    setError(null);
    try {
      await connectedHealthService.setSetupStatus('skipped');
      await finish();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar tu preferencia. Intenta de nuevo.',
      );
    } finally {
      setIsSkipping(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator color={styles.loadingIndicator.color} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="pulse" size={30} color={styles.heroIconGlyph.color} />
          </View>
          <Text style={styles.title}>Activa salud conectada</Text>
          <Text style={styles.subtitle}>
            Conecta {getPlatformLabel(availability?.platform)} para que tus metricas de
            recuperacion y energia trabajen por ti. Solo lectura, tu mandas.
          </Text>
        </View>

        {isAvailable ? (
          <>
            <View style={styles.propList}>
              {valueProps.map((item) => (
                <View key={item.title} style={styles.propRow}>
                  <View style={styles.propIcon}>
                    <Ionicons name={item.icon} size={20} color={styles.propIconGlyph.color} />
                  </View>
                  <View style={styles.propText}>
                    <Text style={styles.propTitle}>{item.title}</Text>
                    <Text style={styles.propCopy}>{item.copy}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.consentRow}>
              <View style={styles.consentText}>
                <Text style={styles.consentTitle}>Compartir con mi entrenador</Text>
                <Text style={styles.consentCopy}>
                  Solo vera agregados diarios con fuente y frescura. Puedes cambiarlo cuando quieras.
                </Text>
              </View>
              <Switch
                value={shareWithTrainer}
                onValueChange={setShareWithTrainer}
                disabled={isBusy}
                trackColor={{
                  true: styles.switchTrackOn.color,
                  false: styles.switchTrackOff.color,
                }}
                thumbColor={
                  shareWithTrainer ? styles.switchThumbOn.color : styles.switchThumbOff.color
                }
              />
            </View>
          </>
        ) : (
          <View style={styles.unavailableBox}>
            <Ionicons name="alert-circle-outline" size={22} color={styles.unavailableIcon.color} />
            <Text style={styles.unavailableText}>
              {getPlatformLabel(availability?.platform)} no esta disponible en este dispositivo.
              {Platform.OS === 'android'
                ? ' Instala Health Connect para activar tus metricas.'
                : ' Revisa los ajustes de salud para continuar.'}
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.lg) },
        ]}
      >
        {isAvailable ? (
          <Button
            title="Conectar y activar"
            onPress={handleConnect}
            isLoading={isConnecting}
            disabled={isBusy}
            fullWidth
            icon={<Ionicons name="link-outline" size={18} color="#ffffff" />}
          />
        ) : (
          <Button
            title={Platform.OS === 'android' ? 'Abrir Health Connect' : 'Abrir ajustes'}
            onPress={() => {
              void connectedHealthService.openSettings();
            }}
            disabled={isBusy}
            fullWidth
            icon={<Ionicons name="settings-outline" size={18} color="#ffffff" />}
          />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          onPress={() => {
            void handleSkip();
          }}
          disabled={isBusy}
          style={styles.skipButton}
        >
          {isSkipping ? (
            <ActivityIndicator color={styles.skipText.color} />
          ) : (
            <Text style={styles.skipText}>Ahora no</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingState: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingIndicator: {
      color: theme.colors.primary,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: Platform.OS === 'ios' ? 72 : 52,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },
    hero: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      marginBottom: spacing.xs,
    },
    heroIconGlyph: {
      color: theme.colors.primary,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.base,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    propList: {
      gap: spacing.sm,
    },
    propRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    propIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    propIconGlyph: {
      color: theme.colors.primary,
    },
    propText: {
      flex: 1,
    },
    propTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    propCopy: {
      marginTop: 2,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    consentText: {
      flex: 1,
    },
    consentTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    consentCopy: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    switchTrackOn: {
      color: theme.colors.primaryBorder,
    },
    switchTrackOff: {
      color: theme.colors.border,
    },
    switchThumbOn: {
      color: theme.colors.primary,
    },
    switchThumbOff: {
      color: theme.colors.surfaceAlt,
    },
    unavailableBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: `${theme.colors.warning}55`,
      backgroundColor: `${theme.colors.warning}12`,
    },
    unavailableIcon: {
      color: theme.colors.warning,
    },
    unavailableText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textPrimary,
      lineHeight: 20,
    },
    errorBox: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: `${theme.colors.error}55`,
      backgroundColor: `${theme.colors.error}12`,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    skipButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    skipText: {
      fontSize: fontSize.base,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
  });
