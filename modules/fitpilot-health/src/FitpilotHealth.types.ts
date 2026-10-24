export type FitpilotHealthPlatform = 'healthkit' | 'health_connect' | 'unsupported';

export type FitpilotHealthAvailability = {
  available: boolean;
  platform: FitpilotHealthPlatform;
  // 'needs_install': Health Connect no está en el dispositivo (Android < 14).
  // 'needs_update': está instalado pero su versión es anterior a la que exige el SDK.
  // 'unavailable': el proveedor existe pero no se puede usar (desactivado, perfil de
  // trabajo, Android 14+ con Health Connect deshabilitado).
  status: 'available' | 'unavailable' | 'needs_install' | 'needs_update' | 'unsupported';
  message?: string;
};

/**
 * Lo que responde HealthKit a "¿haría falta presentar la hoja de permisos?" para los tipos que
 * pide la app (`getRequestStatusForAuthorization`). Solo iOS.
 */
export type FitpilotHealthRequestStatus = 'shouldRequest' | 'unnecessary' | 'unknown';

export type FitpilotHealthPermissionStatus = {
  platform: FitpilotHealthPlatform;
  /**
   * En iOS son los tipos ya respondidos, no los concedidos: HealthKit no revela si el usuario
   * negó una lectura (solo devuelve vacío). `missing` son los que siguen sin resolver.
   */
  granted: string[];
  missing: string[];
  requiresManualGrant?: boolean;
  /**
   * Solo iOS. `shouldRequest` justo después de pedir permiso significa que la hoja no se
   * aplicó: se presentó en blanco y se cerró sola, o se interrumpió.
   */
  requestStatus?: FitpilotHealthRequestStatus;
};

export type FitpilotHealthRecord = {
  type: string;
  start_at: string;
  end_at?: string | null;
  value?: number | null;
  unit?: string | null;
  external_id?: string | null;
  source_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type FitpilotHealthDailySummary = {
  date: string;
  active_energy_kcal?: number | null;
  basal_energy_kcal?: number | null;
  total_energy_kcal?: number | null;
  steps?: number | null;
  distance_m?: number | null;
  exercise_minutes?: number | null;
  sleep_minutes?: number | null;
  sleep_efficiency_pct?: number | null;
  resting_hr_bpm?: number | null;
  avg_hr_bpm?: number | null;
  hrv_ms?: number | null;
  systolic_avg_mmhg?: number | null;
  diastolic_avg_mmhg?: number | null;
  glucose_avg_mg_dl?: number | null;
  recovery_score?: number | null;
  flags?: string[];
  sources?: string[];
  metadata?: Record<string, unknown> | null;
};

export type FitpilotHealthSyncRange = {
  startAt: string;
  endAt: string;
};

/**
 * Lectura ligera y de solo lectura del dispositivo: agrega los días del rango sin subir
 * nada al backend. Existe para que la app pueda pintar la cifra que el teléfono YA tiene
 * antes de que haya red de por medio; el sync completo (`syncRange`) sigue ocurriendo
 * después, en segundo plano.
 */
export type FitpilotHealthSnapshot = {
  platform: Exclude<FitpilotHealthPlatform, 'unsupported'>;
  from_at: string;
  to_at: string;
  permissions: string[];
  daily_summaries: FitpilotHealthDailySummary[];
  metadata?: Record<string, unknown>;
};

export type FitpilotHealthSyncPayload = {
  platform: Exclude<FitpilotHealthPlatform, 'unsupported'>;
  from_at: string;
  to_at: string;
  permissions: string[];
  records: FitpilotHealthRecord[];
  daily_summaries: FitpilotHealthDailySummary[];
  metadata?: Record<string, unknown>;
};

/**
 * Resultado de preguntar por los cambios desde un token.
 *
 * `dates` son fechas locales (YYYY-MM-DD), no registros: lo único que la app necesita saber
 * es qué días hay que volver a agregar. `requiresFullSync` se activa cuando hubo borrados
 * —Health Connect solo entrega el id del registro borrado, no su fecha— o cuando el token
 * caducó.
 */
export type FitpilotHealthChanges = {
  dates: string[];
  nextToken: string | null;
  expired: boolean;
  requiresFullSync: boolean;
};

export type FitpilotHealthDataChangedEvent = {
  /** Identificadores de las métricas que cambiaron, cuando la plataforma los expone. */
  types?: string[];
};

/**
 * iOS entrega los cambios de HealthKit por push (HKObserverQuery), así que la app puede
 * reaccionar en cuanto el reloj escribe algo. Health Connect no tiene equivalente: en
 * Android hay que preguntar con `getChanges`.
 */
export type FitpilotHealthModuleEvents = {
  onHealthDataChanged: (event: FitpilotHealthDataChangedEvent) => void;
};
