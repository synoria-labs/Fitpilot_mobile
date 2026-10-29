import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FitpilotHealthAvailability,
  FitpilotHealthPermissionStatus,
  FitpilotHealthSnapshot,
} from '../../modules/fitpilot-health';
import {
  connectedHealthService,
  type ConnectedHealthSyncResponse,
  type ConnectedHealthSummaryResponse,
} from '../services/connectedHealth';
import {
  readCachedConnectedHealthSummary,
  writeCachedConnectedHealthSummary,
} from '../services/connectedHealthCache';
import { useAuthStore } from '../store/authStore';
import type {
  ConnectedHealthConnectionState,
  ConnectedHealthFeedbackRange,
} from '../types/connectedHealthFeedback';
import {
  describeMissingConnectedHealthPermissions,
  getConnectedHealthAuthorizationRecoveryMessage,
  getConnectedHealthPermissionState,
  isConnectedHealthAuthorizationNotApplied,
  isConnectedHealthAuthorizationPending,
} from '../utils/connectedHealthAuthorization';
import { mergeDeviceSnapshotIntoSummary } from '../utils/connectedHealthDeviceMerge';
import {
  buildConnectedHealthHistory,
  buildConnectedHealthFeedback,
  isConnectedHealthSyncOlderThan,
  shouldAutoSyncConnectedHealth,
} from '../utils/connectedHealthFeedback';

type UseConnectedHealthFeedbackOptions = {
  days?: ConnectedHealthFeedbackRange;
  autoSync?: boolean;
  autoSyncThrottleMs?: number;
  enabled?: boolean;
  foregroundSyncMaxAgeMs?: number;
};

const DEFAULT_SYNC_THROTTLE_MS = 60_000;
const FRESHNESS_TICK_MS = 60_000;

type LoadOptions = {
  allowAutoSync?: boolean;
  silent?: boolean;
  /**
   * Salta la lectura del dispositivo. Lo usa quien acaba de leerlo por su cuenta: en
   * Android cada snapshot son varias llamadas IPC a Health Connect y no tiene sentido
   * repetirlas dos veces en el mismo gesto.
   */
  skipDevice?: boolean;
};

type DeviceReading = {
  snapshot: FitpilotHealthSnapshot;
  readAtMs: number;
};

/**
 * Instante del último sync al backend, compartido por todas las instancias del hook.
 *
 * Antes era un `Set` con una clave constante, de modo que el auto-sync corría UNA sola vez
 * por sesión de JS: si ese único intento fallaba, no se reintentaba hasta reiniciar la app.
 * Ahora que la pantalla se pinta desde el dispositivo, el sync deja de ser urgente y basta
 * con no repetirlo entre instancias dentro de la ventana de throttle.
 */
let lastBackgroundSyncAtMs = 0;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const pickLatestIsoString = (
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null => {
  const candidateMs = candidate ? Date.parse(candidate) : Number.NaN;
  if (Number.isNaN(candidateMs)) {
    return current ?? null;
  }

  const currentMs = current ? Date.parse(current) : Number.NaN;
  if (!Number.isNaN(currentMs) && currentMs > candidateMs) {
    return current ?? null;
  }

  return candidate ?? null;
};

const withSuccessfulSyncTimestamp = (
  summary: ConnectedHealthSummaryResponse,
  syncResult: ConnectedHealthSyncResponse,
): ConnectedHealthSummaryResponse => {
  const syncedAt = pickLatestIsoString(null, syncResult.synced_at);
  if (!syncedAt) {
    return summary;
  }

  let updatedPlatformConnection = false;
  const connections = summary.connections.map((connection) => {
    if (connection.platform !== syncResult.platform) {
      return connection;
    }

    updatedPlatformConnection = true;
    return {
      ...connection,
      last_sync_at: pickLatestIsoString(connection.last_sync_at, syncedAt),
    };
  });

  const nextConnections =
    updatedPlatformConnection || connections.length !== 1
      ? connections
      : connections.map((connection) => ({
          ...connection,
          last_sync_at: pickLatestIsoString(connection.last_sync_at, syncedAt),
        }));

  return {
    ...summary,
    connections: nextConnections,
    latest_sync: summary.latest_sync
      ? {
          ...summary.latest_sync,
          platform: syncResult.platform,
          status: 'completed',
          completed_at: pickLatestIsoString(summary.latest_sync.completed_at, syncedAt),
          records_received: Math.max(
            summary.latest_sync.records_received,
            syncResult.records_received,
          ),
        }
      : {
          platform: syncResult.platform,
          status: 'completed',
          completed_at: syncedAt,
          records_received: syncResult.records_received,
          records_upserted: 0,
        },
  };
};

const availabilityStateOf = (
  status: FitpilotHealthAvailability['status'] | undefined,
): ConnectedHealthConnectionState => {
  if (status === 'needs_update' || status === 'needs_install') {
    return status;
  }
  return 'unavailable';
};

export function useConnectedHealthFeedback({
  days = 7,
  autoSync = false,
  autoSyncThrottleMs = DEFAULT_SYNC_THROTTLE_MS,
  enabled = true,
  foregroundSyncMaxAgeMs,
}: UseConnectedHealthFeedbackOptions = {}) {
  const userId = useAuthStore((state) => state.user?.id);
  // Lo que dice el backend y lo que dice el teléfono se guardan por separado: fusionarlos
  // al vuelo evita que un refresco de red borre la lectura local recién hecha (o al revés).
  const [backendSummary, setBackendSummary] = useState<ConnectedHealthSummaryResponse | null>(null);
  const [deviceReading, setDeviceReading] = useState<DeviceReading | null>(null);
  const [availability, setAvailability] = useState<FitpilotHealthAvailability | null>(null);
  const [permissions, setPermissions] = useState<FitpilotHealthPermissionStatus | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isMountedRef = useRef(true);
  const summaryRef = useRef<ConnectedHealthSummaryResponse | null>(null);
  const hasHydratedRef = useRef(false);
  const isSyncingRef = useRef(false);

  // El resumen visible es la superposición de ambas fuentes. `readAtMs` va en la clave del
  // memo (y no `nowMs`) para que la marca de "última lectura" quede fija en el instante en
  // que se leyó del dispositivo, en vez de avanzar sola con el tick de frescura.
  const summary = useMemo(
    () =>
      mergeDeviceSnapshotIntoSummary(
        backendSummary,
        deviceReading?.snapshot ?? null,
        deviceReading?.readAtMs ?? Date.now(),
      ),
    [backendSummary, deviceReading],
  );

  const markHydrated = useCallback(() => {
    if (hasHydratedRef.current) {
      return;
    }
    hasHydratedRef.current = true;
    if (isMountedRef.current) {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setNowMs(Date.now());
    const intervalId = setInterval(() => {
      if (isMountedRef.current) {
        setNowMs(Date.now());
      }
    }, FRESHNESS_TICK_MS);

    return () => clearInterval(intervalId);
  }, [enabled]);

  /**
   * Sube al backend lo que hay en el dispositivo y recoge lo que el backend deriva.
   *
   * `silent` es la diferencia entre "lo pidió el usuario" y "se está poniendo al día solo".
   * Un refresco de fondo no pinta spinner ni banner de error: la pantalla ya está mostrando
   * datos reales del teléfono y no hay nada que el usuario tenga que esperar ni que hacer.
   *
   * `ensureAuthorization` sigue siendo true solo en acciones explícitas: presentar la hoja
   * de permisos de HealthKit desde segundo plano o de forma concurrente cuelga a iOS.
   */
  const performSync = useCallback(
    async ({
      ensureAuthorization,
      silent = false,
    }: {
      ensureAuthorization: boolean;
      silent?: boolean;
    }) => {
      if (!enabled || isSyncingRef.current) {
        return;
      }

      isSyncingRef.current = true;
      const syncStartedAtMs = Date.now();
      lastBackgroundSyncAtMs = syncStartedAtMs;

      if (!silent) {
        setIsSyncing(true);
        setSyncError(null);
        setNowMs(syncStartedAtMs);
      }

      try {
        const syncResult = await connectedHealthService.sync(30, { ensureAuthorization });
        const refreshedSummary = await connectedHealthService.getSummary(days);
        const nextSyncedSummary = withSuccessfulSyncTimestamp(refreshedSummary, syncResult);

        if (isMountedRef.current) {
          setBackendSummary(nextSyncedSummary);
          markHydrated();
          setNowMs(Date.now());
        }

        if (userId) {
          void writeCachedConnectedHealthSummary(String(userId), days, nextSyncedSummary);
        }

        // Si este sync presentó el diálogo de permisos, lo que tenemos en estado quedó
        // obsoleto en cuanto el usuario respondió. Sin esto el aviso de permisos seguía
        // visible hasta el siguiente load().
        if (ensureAuthorization) {
          try {
            const refreshedPermissions =
              await connectedHealthService.getGrantedPermissions();
            if (isMountedRef.current) {
              setPermissions(refreshedPermissions);
            }
          } catch {
            // El sync ya fue bien: no merece la pena degradar la pantalla por esto.
          }
        }
      } catch (syncFailure) {
        // En un sync de fondo no se dice nada: el estado de conexión ya explica lo que
        // falte, y la pantalla sigue enseñando la lectura del dispositivo.
        if (isMountedRef.current && !silent) {
          if (!isConnectedHealthAuthorizationPending(syncFailure)) {
            setSyncError(
              getErrorMessage(syncFailure, 'No se pudo sincronizar salud conectada.'),
            );
          } else if (ensureAuthorization) {
            // Sync explícito: ya pedimos autorización y la plataforma aun así no la aplicó
            // (hoja que se cierra sola; estado corrupto tras reinstalar). No hay nada más
            // que la app pueda hacer: guiamos al usuario a arreglarlo en el sistema.
            setSyncError(getConnectedHealthAuthorizationRecoveryMessage());
          }
        }
      } finally {
        isSyncingRef.current = false;
        if (isMountedRef.current && !silent) {
          setIsSyncing(false);
        }
      }
    },
    [days, enabled, markHydrated, userId],
  );

  const load = useCallback(
    async ({ allowAutoSync = false, silent = false, skipDevice = false }: LoadOptions = {}) => {
      if (!enabled) {
        return;
      }

      if (!silent) {
        setIsRefreshing(true);
      }
      setError(null);

      // (a) Lo último que se vio, desde disco. Da un primer frame con datos reales sin
      //     esperar a nada: antes la pantalla siempre empezaba por un skeleton porque
      //     getSummary pega a la red en cada montaje.
      if (!hasHydratedRef.current && userId) {
        const cached = await readCachedConnectedHealthSummary(String(userId), days);
        if (cached && isMountedRef.current && !hasHydratedRef.current) {
          setBackendSummary(cached);
          markHydrated();
        }
      }

      // (b) Dispositivo y red, en paralelo. El teléfono casi siempre gana, así que se pinta
      //     en cuanto llega sin esperar al backend.
      if (!skipDevice) {
        void connectedHealthService.readSnapshot(days).then((snapshot) => {
          if (snapshot && isMountedRef.current) {
            setDeviceReading({ snapshot, readAtMs: Date.now() });
            markHydrated();
            setNowMs(Date.now());
          }
        });
      }

      const [summaryResult, availabilityResult, permissionResult] = await Promise.allSettled([
        connectedHealthService.getSummary(days),
        connectedHealthService.isAvailable(),
        connectedHealthService.getGrantedPermissions(),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const loadedAtMs = Date.now();
      const nextAvailability =
        availabilityResult.status === 'fulfilled' ? availabilityResult.value : null;
      const nextPermissions =
        permissionResult.status === 'fulfilled' ? permissionResult.value : null;

      setNowMs(loadedAtMs);

      if (summaryResult.status === 'fulfilled') {
        setBackendSummary(summaryResult.value);
        markHydrated();
        if (userId) {
          void writeCachedConnectedHealthSummary(String(userId), days, summaryResult.value);
        }
      } else if (!hasHydratedRef.current) {
        // Solo es un error visible si no hay NADA que enseñar. Si ya hay caché o lectura
        // del dispositivo, que la red falle es irrelevante para el usuario.
        setError(
          getErrorMessage(
            summaryResult.reason,
            'No fue posible cargar tus datos de salud conectada.',
          ),
        );
      }

      if (nextAvailability) {
        setAvailability(nextAvailability);
      }

      if (nextPermissions) {
        setPermissions(nextPermissions);
      }

      if (isMountedRef.current && !silent) {
        setIsRefreshing(false);
      }

      // (c) Y por último, poner al día el backend en segundo plano. Nadie está esperando
      //     esto: la pantalla lleva rato pintada.
      const shouldSyncQuietly =
        allowAutoSync &&
        autoSync &&
        nextAvailability?.available === true &&
        (nextPermissions?.granted.length ?? 0) > 0 &&
        loadedAtMs - lastBackgroundSyncAtMs >= autoSyncThrottleMs &&
        shouldAutoSyncConnectedHealth(summaryRef.current, loadedAtMs);

      if (shouldSyncQuietly) {
        await performSync({ ensureAuthorization: false, silent: true });
      }
    },
    [autoSync, autoSyncThrottleMs, days, enabled, markHydrated, performSync, userId],
  );

  /**
   * Relee el dispositivo, sin red y sin spinner. Es lo que se dispara al ganar foco: el
   * coste es una lectura local, así que puede correr siempre que la pantalla aparezca.
   */
  const refreshFromDevice = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const snapshot = await connectedHealthService.readSnapshot(days);
    if (snapshot && isMountedRef.current) {
      setDeviceReading({ snapshot, readAtMs: Date.now() });
      markHydrated();
      setNowMs(Date.now());
    }
  }, [days, enabled, markHydrated]);

  // iOS empuja los cambios de HealthKit: en cuanto el reloj escribe una muestra, la
  // pantalla se relee sola. No hay polling ni espera; en Android esto no engancha nada
  // (Health Connect no notifica) y el trabajo lo hace el chequeo de cambios al ganar foco.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void connectedHealthService
      .subscribeToHealthDataChanges(() => {
        void refreshFromDevice();
      })
      .then((dispose) => {
        if (cancelled) {
          dispose?.();
          return;
        }
        unsubscribe = dispose;
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, refreshFromDevice]);

  const refresh = useCallback(async () => {
    await load({ allowAutoSync: false });
  }, [load]);

  const sync = useCallback(async () => {
    // Acción explícita del usuario: aquí SÍ pedimos autorización (idempotente y en primer
    // plano, contexto seguro para presentar la hoja de permisos).
    await performSync({ ensureAuthorization: true });
  }, [performSync]);

  // Pedir permisos y, si el usuario concede algo, sincronizar acto seguido. Antes el CTA
  // del dashboard solo navegaba a Perfil > Salud conectada, donde había que dar un segundo
  // toque en "Conectar permisos": tres toques para algo que debería ser uno.
  const requestPermissions = useCallback(async () => {
    if (!enabled || isSyncingRef.current) {
      return;
    }

    setSyncError(null);
    try {
      const nextPermissions = await connectedHealthService.requestPermissions();
      if (isMountedRef.current) {
        setPermissions(nextPermissions);
      }
      if (nextPermissions.granted.length) {
        await refreshFromDevice();
        await performSync({ ensureAuthorization: false });
      }
      // Sin un solo permiso, o con la hoja sin aplicar (iOS), volver a pedirlo no basta: se
      // explica cómo recuperarlo. Va después del sync, que limpia el error al empezar, y lo
      // que sí se pudo leer ya quedó subido.
      if (
        isMountedRef.current &&
        (!nextPermissions.granted.length ||
          isConnectedHealthAuthorizationNotApplied(nextPermissions))
      ) {
        setSyncError(getConnectedHealthAuthorizationRecoveryMessage());
      }
    } catch (permissionFailure) {
      if (isMountedRef.current) {
        setSyncError(
          getErrorMessage(permissionFailure, 'No se pudieron solicitar permisos.'),
        );
      }
    }
  }, [enabled, performSync, refreshFromDevice]);

  const openSettings = useCallback(async () => {
    try {
      await connectedHealthService.openSettings();
    } catch (settingsFailure) {
      if (isMountedRef.current) {
        setSyncError(
          getErrorMessage(settingsFailure, 'No se pudo abrir la app de salud.'),
        );
      }
    }
  }, []);

  const syncIfStale = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const checkedAtMs = Date.now();
    setNowMs(checkedAtMs);

    if (availability?.available !== true) {
      return;
    }

    if (!shouldAutoSyncConnectedHealth(summaryRef.current, checkedAtMs)) {
      return;
    }

    if (checkedAtMs - lastBackgroundSyncAtMs < autoSyncThrottleMs) {
      return;
    }

    await performSync({ ensureAuthorization: false, silent: true });
  }, [autoSyncThrottleMs, availability?.available, enabled, performSync]);

  /**
   * Foco de pantalla / vuelta a primer plano.
   *
   * Siempre relee el dispositivo —es local y barato, y es lo que hace que al volver a la
   * app la cifra ya esté al día—. La subida al backend solo se encola si toca, y siempre en
   * silencio. Antes esto disparaba un sync completo con spinner en cada foco.
   */
  const refreshOnFocus = useCallback(async () => {
    if (!enabled) {
      return;
    }

    await refreshFromDevice();

    const checkedAtMs = Date.now();
    const isAvailable = availability?.available === true;
    const isStale =
      foregroundSyncMaxAgeMs != null
        ? isConnectedHealthSyncOlderThan(summaryRef.current, foregroundSyncMaxAgeMs, checkedAtMs)
        : shouldAutoSyncConnectedHealth(summaryRef.current, checkedAtMs);
    const isThrottled = checkedAtMs - lastBackgroundSyncAtMs < autoSyncThrottleMs;

    // Preguntar por cambios cuesta una llamada; subir treinta días cuesta unas cuantas. Si
    // el dispositivo dice que no hay nada nuevo, no hay por qué sincronizar aunque el
    // umbral de antigüedad ya haya vencido.
    const hasChanges =
      isAvailable && isStale && !isThrottled
        ? await connectedHealthService.hasPendingHealthChanges()
        : false;

    if (isAvailable && isStale && !isThrottled && hasChanges) {
      await performSync({ ensureAuthorization: false, silent: true });
    } else {
      // El dispositivo ya se acaba de leer arriba: aquí solo falta refrescar el backend.
      await load({ allowAutoSync: false, silent: true, skipDevice: true });
    }
  }, [
    autoSyncThrottleMs,
    availability?.available,
    enabled,
    foregroundSyncMaxAgeMs,
    load,
    performSync,
    refreshFromDevice,
  ]);

  useEffect(() => {
    if (!enabled) {
      setIsRefreshing(false);
      return;
    }

    void load({ allowAutoSync: autoSync });
  }, [autoSync, enabled, load]);

  const feedback = useMemo(
    () => buildConnectedHealthFeedback(summary, days, nowMs),
    [days, nowMs, summary],
  );
  const history = useMemo(
    () => buildConnectedHealthHistory(summary, days),
    [days, summary],
  );

  const permissionState = getConnectedHealthPermissionState(permissions);

  // Bloqueante: sin un solo permiso no hay nada que sincronizar. NO depende de
  // `feedback.hasData`, porque un día de solo energía basal sintética contaba como "hay
  // datos" y suprimía el aviso para siempre; y porque si el usuario revoca los permisos,
  // la app seguía mostrando lo cacheado sin avisar de nada.
  const needsPermissionCta =
    availability?.available === true && permissionState === 'none';

  // No bloqueante: hay datos, pero faltan permisos que alimentan tarjetas visibles. Antes
  // se comprobaba solo `granted.length > 0`, así que conceder uno de quince bastaba para
  // que la app se declarara conectada y no volviera a ofrecer completar permisos jamás.
  const needsPermissionUpgradeCta =
    availability?.available === true && permissionState === 'partial';

  const missingPermissionsLabel = needsPermissionUpgradeCta
    ? describeMissingConnectedHealthPermissions(permissions)
    : '';

  // Los tres estados que hasta ahora eran indistinguibles en la UI (sin permisos, con
  // permisos pero con la plataforma de salud vacía, y funcionando) más los de disponibilidad.
  const connectionState: ConnectedHealthConnectionState =
    availability?.available !== true
      ? availabilityStateOf(availability?.status)
      : permissionState === 'none'
        ? 'no_permissions'
        : !feedback.hasRealData
          ? 'no_source_data'
          : permissionState === 'partial'
            ? 'partial_permissions'
            : 'ok';

  return {
    availability,
    permissions,
    permissionState,
    connectionState,
    summary,
    feedback,
    history,
    // Solo hay "cargando" mientras no haya absolutamente nada que enseñar. Con caché o con
    // lectura del dispositivo, el skeleton no llega a verse.
    isLoading: enabled && !hasHydrated,
    isRefreshing,
    isSyncing,
    error,
    syncError,
    needsPermissionCta,
    needsPermissionUpgradeCta,
    missingPermissionsLabel,
    refresh,
    refreshFromDevice,
    sync,
    requestPermissions,
    openSettings,
    syncIfStale,
    refreshOnFocus,
  };
}
