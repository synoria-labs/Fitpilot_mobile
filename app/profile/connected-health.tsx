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

const permissionLabels: Record<string, string> = {
  active_energy: 'Kcal activas',
  basal_energy: 'Kcal basales',
  steps: 'Pasos',
  distance: 'Distancia',
  exercise_minutes: 'Minutos de ejercicio',
  workouts: 'Entrenamientos',
  sleep: 'Sueno',
  heart_rate: 'Frecuencia cardiaca',
  resting_heart_rate: 'FC reposo',
  heart_rate_variability: 'HRV',
  glucose: 'Glucosa',
  blood_pressure_systolic: 'Presion sistolica',
  blood_pressure_diastolic: 'Presion diastolica',
  weight: 'Peso',
  body_fat: 'Grasa corporal',
  lean_body_mass: 'Masa magra',
};

const healthConnectPermissionLabels: [string, string][] = [
  ['READ_ACTIVE_CALORIES_BURNED', 'Kcal activas'],
  ['READ_BASAL_METABOLIC_RATE', 'Kcal basales'],
  ['READ_TOTAL_CALORIES_BURNED', 'Kcal totales'],
  ['READ_STEPS', 'Pasos'],
  ['READ_DISTANCE', 'Distancia'],
  ['READ_EXERCISE', 'Entrenamientos'],
  ['READ_SLEEP', 'Sueno'],
  ['READ_HEART_RATE_VARIABILITY', 'HRV'],
  ['READ_RESTING_HEART_RATE', 'FC reposo'],
  ['READ_HEART_RATE', 'Frecuencia cardiaca'],
  ['READ_BLOOD_GLUCOSE', 'Glucosa'],
  ['READ_BLOOD_PRESSURE', 'Presion arterial'],
  ['READ_WEIGHT', 'Peso'],
  ['READ_BODY_FAT', 'Grasa corporal'],
  ['READ_LEAN_BODY_MASS', 'Masa magra'],
];

const getPermissionLabel = (permission: string) => {
  if (permissionLabels[permission]) {
    return permissionLabels[permission];
  }

  const matched = healthConnectPermissionLabels.find(([token]) =>
    permission.includes(token),
  );
  return matched?.[1] ?? permission.replace(/^android\.permission\.health\./, '');
};

const getPlatformLabel = (platform?: string | null) => {
  if (platform === 'healthkit') {
    return 'Apple Health';
  }
  if (platform === 'health_connect') {
    return 'Health Connect';
  }
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
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
      label: getPermissionLabel(permission),
      granted: granted.includes(permission),
    }));
  }, [state.permissions]);

  const handleRequestPermissions = async () => {
    setIsRequesting(true);
    setError(null);
    try {
      const permissions = await connectedHealthService.requestPermissions();
      setState((current) => ({ ...current, permissions }));
      Alert.alert(
        'Permisos',
        Platform.OS === 'android'
          ? 'Revisa Health Connect y vuelve a sincronizar cuando termines de conceder permisos.'
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
      await connectedHealthService.sync(30);
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
      subtitle="Datos de solo lectura para kcal, entrenamiento y recuperacion."
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
                  {isAvailable ? getPlatformLabel(state.availability?.platform) : 'No disponible'}
                </Text>
                <Text style={styles.statusDescription}>
                  Ultima lectura: {formatDateTime(latestSyncAt)}
                </Text>
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
                title="Sincronizar 30 dias"
                onPress={handleSync}
                isLoading={isSyncing}
                disabled={!isAvailable || isRequesting}
                appearance="profile"
                fullWidth
                icon={<Ionicons name="sync-outline" size={18} color="#ffffff" />}
              />
              <Button
                title="Abrir ajustes"
                onPress={() => {
                  void connectedHealthService.openSettings();
                }}
                disabled={!isAvailable}
                appearance="profile"
                variant="ghost"
                fullWidth
                icon={<Ionicons name="settings-outline" size={18} color={theme.colors.primary} />}
              />
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
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
              Tu entrenador solo vera agregados diarios y sesiones resumidas con fuente y frescura.
            </Text>
          </View>

          <View style={styles.metricsGrid}>
            <MetricTile label="Kcal totales" value={metricFormatters.kcal(latestSummary?.total_energy_kcal)} />
            <MetricTile label="Kcal activas" value={metricFormatters.kcal(latestSummary?.active_energy_kcal)} />
            <MetricTile label="Pasos" value={metricFormatters.count(latestSummary?.steps)} />
            <MetricTile label="Ejercicio" value={metricFormatters.minutes(latestSummary?.exercise_minutes)} />
            <MetricTile label="Sueno" value={metricFormatters.minutes(latestSummary?.sleep_minutes)} />
            <MetricTile label="Recuperacion" value={metricFormatters.score(latestSummary?.recovery_score)} />
            <MetricTile label="FC reposo" value={metricFormatters.bpm(latestSummary?.resting_hr_bpm)} />
            <MetricTile label="HRV" value={metricFormatters.ms(latestSummary?.hrv_ms)} />
          </View>

          {state.summary?.recommendations.suggested_tdee_kcal ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Senal de kcal</Text>
              <Text style={styles.recommendationValue}>
                {state.summary.recommendations.suggested_tdee_kcal.toLocaleString('es-MX')} kcal TDEE observado
              </Text>
              <Text style={styles.sectionCopy}>
                Se muestra como recomendacion para el profesional; no cambia tu plan automaticamente.
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
                <Text style={styles.emptyText}>Sin permisos registrados todavia.</Text>
              )}
            </View>
          </View>

          <Text style={styles.sourceText}>
            Fuente: {getPlatformLabel(primaryConnection?.platform)}. Rango visible: {state.summary?.range.start_date ?? '--'} a {state.summary?.range.end_date ?? '--'}.
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
