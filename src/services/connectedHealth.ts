import { AppState } from 'react-native';
import FitpilotHealth, {
  type FitpilotHealthAvailability,
  type FitpilotHealthSnapshot,
  type FitpilotHealthPermissionStatus,
  type FitpilotHealthSyncPayload,
} from '../../modules/fitpilot-health';
import { ConnectedHealthPermissionsError } from '../utils/connectedHealthAuthorization';
import { addDaysToDateKey, getTodayDateKey } from '../utils/date';
import { nutritionClient } from './api';

export type ConnectedHealthConnection = {
  platform: 'healthkit' | 'health_connect';
  status: string;
  permissions: string[];
  sharing_enabled: boolean;
  last_sync_at: string | null;
  updated_at: string | null;
};

export type ConnectedHealthDailySummary = {
  date: string;
  active_energy_kcal: number | null;
  basal_energy_kcal: number | null;
  total_energy_kcal: number | null;
  steps: number | null;
  distance_m: number | null;
  exercise_minutes: number | null;
  sleep_minutes: number | null;
  sleep_efficiency_pct: number | null;
  resting_hr_bpm: number | null;
  avg_hr_bpm: number | null;
  hrv_ms: number | null;
  systolic_avg_mmhg: number | null;
  diastolic_avg_mmhg: number | null;
  glucose_avg_mg_dl: number | null;
  recovery_score: number | null;
  flags: string[];
  sources: string[];
};

export type ConnectedHealthRecommendation = {
  observed_tdee_kcal: {
    days_7: number | null;
    days_14: number | null;
    days_30: number | null;
  };
  current_tdee_kcal: number | null;
  current_target_calories: number | null;
  suggested_tdee_kcal: number | null;
  delta_from_current_kcal: number | null;
  confidence: 'low' | 'medium' | 'high';
  application_mode: 'recommendation_only';
};

export type ConnectedHealthSummaryResponse = {
  connections: ConnectedHealthConnection[];
  range: {
    start_date: string;
    end_date: string;
  };
  summaries: ConnectedHealthDailySummary[];
  recommendations: ConnectedHealthRecommendation;
  latest_sync: {
    platform: string;
    status: string;
    completed_at: string | null;
    records_received: number;
    records_upserted: number;
    error_message?: string | null;
  } | null;
};

export type ConnectedHealthSyncResponse = {
  platform: 'healthkit' | 'health_connect';
  records_received: number;
  daily_summaries_processed: number;
  synced_at: string;
};

const buildSyncRange = (days: number) => {
  const endAt = new Date();
  const startAt = new Date(endAt);
  startAt.setDate(startAt.getDate() - Math.max(1, days) + 1);
  startAt.setHours(0, 0, 0, 0);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
};

// Desfase de la zona horaria del dispositivo, en minutos a SUMAR a un instante UTC para
// obtener la hora local (UTC-6 -> -360). El backend lo necesita para agrupar los registros
// por el día que el usuario vivió: agruparlos en UTC mandaba todo lo posterior a las 18:00
// al día siguiente y creaba resúmenes fantasma.
const timezoneOffsetMinutes = () => -new Date().getTimezoneOffset();

const withSharingEnabled = (
  payload: FitpilotHealthSyncPayload,
): FitpilotHealthSyncPayload & { sharing_enabled: boolean } => ({
  ...payload,
  sharing_enabled: true,
  metadata: {
    ...(payload.metadata ?? {}),
    timezone_offset_minutes: timezoneOffsetMinutes(),
  },
});

// --- Observación de cambios ------------------------------------------------
// iOS empuja los cambios de HealthKit (HKObserverQuery); Health Connect no tiene nada
// equivalente y hay que preguntarle con un token. Ambos caminos se encapsulan aquí para que
// el hook no tenga que saber en qué plataforma está.

type HealthDataChangedListener = (event: { types?: string[] }) => void;

const changeListeners = new Set<HealthDataChangedListener>();
let nativeSubscription: { remove: () => void } | null = null;
let observerStartPromise: Promise<boolean> | null = null;
// Un stop que llegara a iOS después del siguiente start dejaría la app sin observadores
// mientras JS cree que siguen activos: cada start espera a que termine el último stop.
let observerStopPromise: Promise<void> = Promise.resolve();

// Los avisos de HealthKit llegan en ráfagas: uno por tipo y, con un Apple Watch, frecuencia
// cardiaca cada pocos minutos (más durante un entrenamiento). Cada aviso releía todo el rango
// del dispositivo en cada pantalla suscrita; ahora se agrupan en una ventana fija. Fija y no
// debounce: con un flujo continuo de avisos un debounce no dispararía nunca.
const HEALTH_CHANGE_COALESCE_MS = 5_000;
const pendingChangeTypes = new Set<string>();
let pendingChangeTimer: ReturnType<typeof setTimeout> | null = null;

const flushPendingHealthChanges = () => {
  pendingChangeTimer = null;
  const types = Array.from(pendingChangeTypes);
  pendingChangeTypes.clear();
  changeListeners.forEach((current) => current({ types }));
};

// Token de la Changes API de Health Connect. Vive en memoria a propósito: al arrancar la
// app siempre se hace una carga completa, así que persistirlo entre sesiones no compraría
// nada y sí añadiría un estado más que puede quedar desincronizado.
let healthConnectChangesToken: string | null = null;

// Solicitud de permisos en vuelo (compartida). Presentar dos hojas de permisos de
// HealthKit a la vez cuelga a iOS (no invoca el completion), así que serializamos.
let permissionRequestInFlight: Promise<FitpilotHealthPermissionStatus> | null = null;

export const connectedHealthService = {
  isAvailable: (): Promise<FitpilotHealthAvailability> =>
    FitpilotHealth.isAvailable(),

  requestPermissions: (): Promise<FitpilotHealthPermissionStatus> => {
    // Serializado: si ya hay una solicitud en vuelo, las llamadas concurrentes comparten
    // la misma promesa en lugar de intentar presentar una segunda hoja de HealthKit.
    if (!permissionRequestInFlight) {
      permissionRequestInFlight = FitpilotHealth.requestPermissions().finally(() => {
        permissionRequestInFlight = null;
      });
    }
    return permissionRequestInFlight;
  },

  getGrantedPermissions: (): Promise<FitpilotHealthPermissionStatus> =>
    FitpilotHealth.getGrantedPermissions(),

  openSettings: (): Promise<void> => FitpilotHealth.openSettings(),

  /**
   * Se suscribe a los cambios que empuje la plataforma. Devuelve la función para darse de
   * baja, y `null` si la plataforma no los empuja (Android).
   *
   * El observador nativo se arranca una sola vez aunque haya varias pantallas suscritas, y
   * se para cuando se va la última: pararlo al desmontar cualquiera de ellas dejaría a las
   * demás sin actualizaciones.
   */
  subscribeToHealthDataChanges: async (
    listener: HealthDataChangedListener,
  ): Promise<(() => void) | null> => {
    try {
      if (!observerStartPromise) {
        observerStartPromise = observerStopPromise
          .then(() => FitpilotHealth.startObservingChanges())
          .catch(() => false);
      }
      const supported = await observerStartPromise;
      if (!supported) {
        return null;
      }

      changeListeners.add(listener);
      if (!nativeSubscription) {
        nativeSubscription = FitpilotHealth.addHealthDataChangedListener((event) => {
          event.types?.forEach((type) => pendingChangeTypes.add(type));
          if (!pendingChangeTimer) {
            pendingChangeTimer = setTimeout(flushPendingHealthChanges, HEALTH_CHANGE_COALESCE_MS);
          }
        });
      }

      return () => {
        changeListeners.delete(listener);
        if (changeListeners.size === 0) {
          nativeSubscription?.remove();
          nativeSubscription = null;
          if (pendingChangeTimer) {
            clearTimeout(pendingChangeTimer);
            pendingChangeTimer = null;
          }
          pendingChangeTypes.clear();
          observerStartPromise = null;
          observerStopPromise = FitpilotHealth.stopObservingChanges().catch(() => undefined);
        }
      };
    } catch {
      return null;
    }
  },

  /**
   * ¿Hay datos nuevos desde la última vez que se preguntó? (Health Connect.)
   *
   * Preguntar cuesta una llamada, frente a releer y reagregar treinta días. Solo devuelve
   * `false` cuando la plataforma afirma que no hay nada nuevo; ante cualquier duda responde
   * `true` y decide el throttle de siempre.
   */
  hasPendingHealthChanges: async (): Promise<boolean> => {
    try {
      if (!healthConnectChangesToken) {
        healthConnectChangesToken = await FitpilotHealth.getChangesToken();
        // Sin token no se puede afirmar que NO haya cambios: puede ser la primera vez, o
        // una plataforma que no usa tokens (iOS). Devolver false aquí desactivaba el sync
        // por foco en iOS por completo.
        return true;
      }

      const changes = await FitpilotHealth.getChanges(healthConnectChangesToken);
      healthConnectChangesToken =
        changes.nextToken ?? (await FitpilotHealth.getChangesToken());

      return changes.requiresFullSync || changes.dates.length > 0;
    } catch {
      // Ante la duda, que decida el throttle de siempre.
      healthConnectChangesToken = null;
      return true;
    }
  },

  /**
   * Lectura directa del dispositivo, sin red. Es lo que permite pintar la cifra que el
   * teléfono ya tiene sin esperar al viaje de ida y vuelta al backend.
   *
   * Es tolerante a propósito: cualquier fallo devuelve `null` y la pantalla sigue su curso
   * con lo que venga del backend. Es una optimización de render, nunca un motivo para
   * romper la pantalla ni para mostrar un error.
   */
  readSnapshot: async (days = 30): Promise<FitpilotHealthSnapshot | null> => {
    try {
      const availability = await FitpilotHealth.isAvailable();
      if (!availability.available) {
        return null;
      }

      const snapshot = await FitpilotHealth.readSnapshot(buildSyncRange(days));
      // Sin permisos el snapshot son días vacíos: no aporta nada y además haría que la
      // pantalla marcara "actualizado ahora" sobre la nada.
      return snapshot.permissions.length ? snapshot : null;
    } catch {
      return null;
    }
  },

  getSummary: (days = 30): Promise<ConnectedHealthSummaryResponse> => {
    // El rango va en días de este teléfono. Sin fechas, el backend lo cierra en el día UTC:
    // desde las 18:00 en México eso ya es mañana, y la app enseñaba como día más reciente uno
    // que aún no llega, con lo que hubiera subido otro dispositivo en otra zona horaria.
    const endDate = getTodayDateKey();
    const startDate = addDaysToDateKey(endDate, -(Math.max(1, days) - 1));
    const query =
      endDate && startDate ? `start_date=${startDate}&end_date=${endDate}` : `days=${days}`;

    return nutritionClient.get<ConnectedHealthSummaryResponse>(
      `/connected-health/me/summary?${query}`,
    );
  },

  sync: async (
    days = 30,
    options: { ensureAuthorization?: boolean } = {},
  ): Promise<ConnectedHealthSyncResponse> => {
    const availability = await FitpilotHealth.isAvailable();
    if (!availability.available) {
      throw new Error(availability.message || 'Salud conectada no está disponible en este dispositivo.');
    }

    // iOS (HealthKit): una query lanzada mientras los tipos están en `notDetermined` lanza
    // HKError.errorAuthorizationNotDetermined. Para evitarlo pedimos autorización antes de
    // consultar, PERO solo cuando el sync nace de una acción EXPLÍCITA del usuario (botón
    // Sincronizar/Conectar), nunca desde el auto-sync ni desde focus/AppState: presentar la
    // hoja de permisos de HealthKit desde un contexto de fondo o de forma concurrente hace
    // que iOS no invoque el completion y la promesa nativa se cuelgue -> "Sincronizando"
    // infinito.
    //
    // Eso lo garantizan `ensureAuthorization` (false en auto-sync/focus/AppState) y el
    // serializador `permissionRequestInFlight`, no la plataforma. Este gate llegó a
    // comprobar `Platform.OS === 'ios'`, lo cual era una tautología en iOS y dejaba a
    // Android SIN pedir permisos nunca desde el botón Sincronizar: el usuario que se saltó
    // el onboarding sincronizaba en vano una y otra vez, con Health Connect devolviendo
    // resúmenes vacíos y el backend respondiendo 200. La comprobación de AppState cubre la
    // carrera real que quedaba: que la app pase a segundo plano mientras isAvailable()
    // resuelve. Si eso ocurre no se pide nada y se sincroniza en modo solo lectura.
    if (options.ensureAuthorization && AppState.currentState === 'active') {
      const status = await connectedHealthService.requestPermissions();
      if (!status.granted.length) {
        throw new ConnectedHealthPermissionsError();
      }
    }

    const payload = await FitpilotHealth.syncRange(buildSyncRange(days));

    // Sin un solo permiso concedido el payload son 30 resúmenes vacíos. Subirlo devolvía
    // 200 y la app pintaba "Actualizado ahora" junto a "Sin datos recientes", en bucle y
    // sin ningún error visible. Cortamos antes del POST: esto también frena al auto-sync y
    // al sync por foco, que son los que más basura generaban.
    if (!payload.permissions.length) {
      throw new ConnectedHealthPermissionsError();
    }

    return nutritionClient.post<ConnectedHealthSyncResponse>(
      '/connected-health/sync',
      withSharingEnabled(payload),
    );
  },

  setSharing: (
    sharingEnabled: boolean,
    platform?: ConnectedHealthConnection['platform'],
  ): Promise<{ sharing_enabled: boolean; platform: string }> =>
    nutritionClient.patch('/connected-health/me/sharing', {
      platform,
      sharing_enabled: sharingEnabled,
    }),

  setSetupStatus: (
    status: 'completed' | 'skipped',
  ): Promise<{ connected_health_setup_status: string }> =>
    nutritionClient.patch('/connected-health/me/setup', { status }),
};
