import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileDetailScreen } from '../../src/components/profile/ProfileDetailScreen';
import { Button } from '../../src/components/common';
import {
  connectedHealthService,
  type ConnectedHealthConnection,
  type ConnectedHealthDailySummary,
  type ConnectedHealthSummaryResponse,
} from '../../src/services/connectedHealth';
import {
  borderRadius,
  colors,
  fontSize,
  spacing,
} from '../../src/constants/colors';
import {
  describeMissingConnectedHealthPermissions,
  getConnectedHealthAuthorizationRecoveryMessage,
  getConnectedHealthAvailabilityCopy,
  getConnectedHealthPermissionLabel,
  getConnectedHealthPermissionState,
  getConnectedHealthPlatformLabel,
  isConnectedHealthAuthorizationNotApplied,
} from '../../src/utils/connectedHealthAuthorization';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import type {
  FitpilotHealthAvailability,
  FitpilotHealthPermissionStatus,
} from '../../modules/fitpilot-health';

type LoadState = {
  availability: FitpilotHealthAvailability | null;
  permissions: FitpilotHealthPermissionStatus | null;
  summary: ConnectedHealthSummaryResponse | null;
};

const metricFormatters = {
  kcal: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : `${Math.round(value).toLocaleString('es-MX')} kcal`,
  count: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : Math.round(value).toLocaleString('es-MX'),
  minutes: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : `${Math.round(value / 60)} h ${Math.round(value % 60)} min`,
  bpm: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : `${Math.round(value)} bpm`,
  ms: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : `${Math.round(value)} ms`,
  score: (value: number | null | undefined) =>
    value == null ? 'Sin dato' : `${Math.round(value)}/100`,
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Sin sincronizar';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin sincronizar';
  }

  return parsed.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getLatestSummary = (
  summary: ConnectedHealthSummaryResponse | null,
): ConnectedHealthDailySummary | null => summary?.summaries?.[0] ?? null;

const getPrimaryConnection = (
  summary: ConnectedHealthSummaryResponse | null,
): ConnectedHealthConnection | null => summary?.connections?.[0] ?? null;

export default function ConnectedHealthScreen() {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [state, setState] = useState<LoadState>({
    availability: null,
    permissions: null,
    summary: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSharingSaving, setIsSharingSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryConnection = getPrimaryConnection(state.summary);
  const latestSummary = getLatestSummary(state.summary);
  const latestSyncAt =
    primaryConnection?.last_sync_at ?? state.summary?.latest_sync?.completed_at ?? null;
  const isAvailable = state.availability?.available ?? false;
  const availabilityCopy = getConnectedHealthAvailabilityCopy(state.availability);
  const permissionState = getConnectedHealthPermissionState(state.permissions);
  const lastSyncError =
    state.summary?.latest_sync?.status === 'failed'
      ? (state.summary.latest_sync.error_message ?? null)
      : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const availability = await connectedHealthService.isAvailable();
      const [permissions, summary] = await Promise.all([
        connectedHealthService.getGrantedPermissions().catch(() => null),
        connectedHealthService.getSummary(30).catch(() => null),
      ]);
      setState({ availability, permissions, summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar salud conectada.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const permissionRows = useMemo(() => {
    const granted = state.permissions?.granted ?? [];
    const missing = state.permissions?.missing ?? [];
    const all = Array.from(new Set([...granted, ...missing]));

    return all.map((permission) => ({
      label: getConnectedHealthPermissionLabel(permission),
      granted: granted.includes(permission),
    }));
  }, [state.permissions]);

  const handleRequestPermissions = async () => {
    setIsRequesting(true);
    setError(null);
    try {
      const previousGranted = state.permissions?.granted.length ?? 0;
      const permissions = await connectedHealthService.requestPermissions();
      setState((current) => ({ ...current, permissions }));

      if (isConnectedHealthAuthorizationNotApplied(permissions)) {
        // iOS: la hoja de Salud no se aplicó. Los avisos de abajo hablan de Health Connect o
        // dan por buena la petición; aquí lo que sirve son los pasos de recuperación, junto
        // al botón "Abrir ajustes" de esta misma pantalla.
        setError(getConnectedHealthAuthorizationRecoveryMessage());
        return;
      }

      if (!permissions.granted.length) {
        // Health Connect deja de presentar el diálogo tras dos rechazos del mismo
        // conjunto de permisos: a partir de ahí la única vía es la propia app de Health
        // Connect, así que ofrecemos abrirla en lugar de repetir el intento.
        Alert.alert(
          'Sin permisos',
          Platform.OS === 'android'
            ? 'No se activó ningún permiso. Si el diálogo ya no aparece, ábrelos directamente en Health Connect.'
            : 'No se activó ningún permiso. Revisa los ajustes de salud y vuelve a intentar.',
          Platform.OS === 'android'
            ? [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Abrir Health Connect',
                  onPress: () => {
                    void connectedHealthService.openSettings();
                  },
                },
              ]
            : undefined,
        );
        return;
      }

      if (permissions.missing.length && permissions.granted.length === previousGranted) {
        // Se pidieron los que faltaban y no cambió nada: mismo callejón, con datos.
        Alert.alert(
          'Permisos sin cambios',
          'Los permisos que faltan no se activaron. Concédelos en Health Connect para completar tus métricas.',
          [
            { text: 'Ahora no', style: 'cancel' },
            {
              text: 'Abrir Health Connect',
              onPress: () => {
                void connectedHealthService.openSettings();
              },
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Permisos',
        permissions.missing.length
          ? 'Permisos actualizados. Aún faltan algunos: puedes completarlos cuando quieras.'
          : 'Permisos actualizados. Ya puedes sincronizar tus datos.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron solicitar permisos.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      // Botón explícito: pide permisos (iOS) antes de sincronizar si aún no se concedieron.
      await connectedHealthService.sync(30, { ensureAuthorization: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sincronizar.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSharingChange = async (enabled: boolean) => {
    if (!primaryConnection) {
      return;
    }

    setIsSharingSaving(true);
    setError(null);
    try {
      await connectedHealthService.setSharing(enabled, primaryConnection.platform);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el consentimiento.');
    } finally {
      setIsSharingSaving(false);
    }
  };

  return (
    <ProfileDetailScreen
      title="Salud conectada"
      subtitle="Datos de solo lectura para kcal, entrenamiento y recuperación."
    >
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.statusPanel}>
            <View style={styles.statusHeader}>
              <View style={styles.statusIcon}>
                <Ionicons
                  name={isAvailable ? 'pulse' : 'alert-circle-outline'}
                  size={22}
                  color={isAvailable ? colors.success : theme.colors.warning}
                />
              </View>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>
                  {isAvailable
                    ? getConnectedHealthPlatformLabel(state.availability?.platform)
                    : availabilityCopy.title}
                </Text>
                <Text style={styles.statusDescription}>
                  {isAvailable
                    ? `Última lectura: ${formatDateTime(latestSyncAt)}`
                    : availabilityCopy.message}
                </Text>
                {isAvailable && permissionState === 'partial' ? (
                  <Text style={styles.statusWarning}>
                    Permisos incompletos: faltan{' '}
                    {describeMissingConnectedHealthPermissions(state.permissions)}.
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.actions}>
              <Button
                title="Conectar permisos"
                onPress={handleRequestPermissions}
                isLoading={isRequesting}
                disabled={!isAvailable || isSyncing}
                appearance="profile"
                variant="secondary"
                fullWidth
                icon={<Ionicons name="key-outline" size={18} color={theme.colors.textPrimary} />}
              />
              <Button
                title="Sincronizar 30 días"
                onPress={handleSync}
                isLoading={isSyncing}
                disabled={!isAvailable || isRequesting}
                appearance="profile"
                fullWidth
                icon={<Ionicons name="sync-outline" size={18} color="#ffffff" />}
              />
              <Button
                // Sin `disabled`: cuando Health Connect está desactualizado o desactivado
                // este botón es la única salida del callejón, y era precisamente cuando se
                // deshabilitaba.
                title={
                  availabilityCopy.actionLabel ??
                  (Platform.OS === 'android' ? 'Abrir Health Connect' : 'Abrir ajustes')
                }
                onPress={() => {
                  void connectedHealthService.openSettings();
                }}
                appearance="profile"
                variant="ghost"
                fullWidth
                icon={<Ionicons name="settings-outline" size={18} color={theme.colors.primary} />}
              />
            </View>
          </View>

          {error || lastSyncError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error ?? lastSyncError}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Consentimiento entrenador</Text>
              <Switch
                value={primaryConnection?.sharing_enabled ?? false}
                onValueChange={(value) => {
                  void handleSharingChange(value);
                }}
                disabled={!primaryConnection || isSharingSaving}
                trackColor={{
                  true: theme.colors.primaryBorder,
                  false: theme.colors.border,
                }}
                thumbColor={
                  primaryConnection?.sharing_enabled ? theme.colors.primary : theme.colors.surfaceAlt
                }
              />
            </View>
            <Text style={styles.sectionCopy}>
              Tu entrenador solo verá agregados diarios y sesiones resumidas con fuente y frescura.
            </Text>
          </View>

          <View style={styles.metricsGrid}>
            <MetricTile label="Kcal totales" value={metricFormatters.kcal(latestSummary?.total_energy_kcal)} />
            <MetricTile label="Kcal activas" value={metricFormatters.kcal(latestSummary?.active_energy_kcal)} />
            <MetricTile label="Pasos" value={metricFormatters.count(latestSummary?.steps)} />
            <MetricTile label="Ejercicio" value={metricFormatters.minutes(latestSummary?.exercise_minutes)} />
            <MetricTile label="Sueño" value={metricFormatters.minutes(latestSummary?.sleep_minutes)} />
            <MetricTile label="Recuperación" value={metricFormatters.score(latestSummary?.recovery_score)} />
            <MetricTile label="FC reposo" value={metricFormatters.bpm(latestSummary?.resting_hr_bpm)} />
            <MetricTile label="HRV" value={metricFormatters.ms(latestSummary?.hrv_ms)} />
          </View>

          {state.summary?.recommendations.suggested_tdee_kcal ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Señal de kcal</Text>
              <Text style={styles.recommendationValue}>
                {state.summary.recommendations.suggested_tdee_kcal.toLocaleString('es-MX')} kcal TDEE observado
              </Text>
              <Text style={styles.sectionCopy}>
                Se muestra como recomendación para el profesional; no cambia tu plan automáticamente.
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permisos</Text>
            <View style={styles.permissionList}>
              {permissionRows.length > 0 ? (
                permissionRows.map((permission) => (
                  <View key={permission.label} style={styles.permissionRow}>
                    <Text style={styles.permissionLabel}>{permission.label}</Text>
                    <Ionicons
                      name={permission.granted ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={permission.granted ? colors.success : theme.colors.iconMuted}
                    />
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Sin permisos registrados todavía.</Text>
              )}
            </View>
          </View>

          <Text style={styles.sourceText}>
            Fuente: {getConnectedHealthPlatformLabel(primaryConnection?.platform)}. Rango visible: {state.summary?.range.start_date ?? '--'} a {state.summary?.range.end_date ?? '--'}.
          </Text>
        </View>
      )}
    </ProfileDetailScreen>
  );
}

const MetricTile = ({ label, value }: { label: string; value: string }) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    loadingState: {
      minHeight: 240,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      gap: spacing.lg,
    },
    statusPanel: {
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    statusIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    statusText: {
      flex: 1,
    },
    statusTitle: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    statusDescription: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    statusWarning: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.warning,
    },
    actions: {
      marginTop: spacing.lg,
      gap: spacing.sm,
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
    section: {
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    sectionTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    sectionCopy: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    recommendationValue: {
      marginTop: spacing.sm,
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    metricTile: {
      width: '48%',
      minHeight: 84,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'space-between',
    },
    metricLabel: {
      fontSize: fontSize.xs,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    metricValue: {
      marginTop: spacing.sm,
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    permissionList: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    permissionRow: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    permissionLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textPrimary,
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    sourceText: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      lineHeight: 18,
      marginBottom: spacing.lg,
    },
  });
