import { Platform } from 'react-native';
import type {
  FitpilotHealthAvailability,
  FitpilotHealthPermissionStatus,
} from '../../modules/fitpilot-health';

// Código que emite el módulo nativo de Android cuando el fallo es de permisos. HealthKit
// no produce códigos: en iOS la detección sigue siendo por texto (ver abajo).
const HEALTH_PERMISSIONS_ERROR_CODE = 'ERR_HEALTH_PERMISSIONS';

const getErrorCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
};

// HealthKit lanza "Authorization not determined" cuando la autorización aún no se ha
// resuelto: o el usuario no ha respondido la hoja de permisos, o iOS quedó con el estado
// partido tras reinstalar la app (la base de datos de Salud conserva los grants de la
// instalación anterior, pero el HKHealthStore del binario nuevo los sigue viendo como
// `notDetermined`). En ese segundo caso la hoja se presenta en blanco y se cierra sola,
// `requestAuthorization` resuelve con éxito y la primera query revienta.
//
// Health Connect nunca produce ese texto, así que en Android esta rama era inalcanzable y
// todo fallo de permisos caía en el mensaje genérico. Ahora el módulo Kotlin marca el caso
// con un código explícito, que se comprueba primero.
export const isConnectedHealthAuthorizationPending = (error: unknown): boolean => {
  if (getErrorCode(error) === HEALTH_PERMISSIONS_ERROR_CODE) {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  return /not[\s_]?determined/i.test(message);
};

/**
 * Texto de recuperación para cuando un intento EXPLÍCITO del usuario (Conectar /
 * Sincronizar) ya pidió autorización y aun así la plataforma no la aplicó. La app no
 * puede arreglarlo por su cuenta: hay que resincronizar el estado del sistema.
 */
export const getConnectedHealthAuthorizationRecoveryMessage = (): string =>
  Platform.OS === 'android'
    ? 'Health Connect no aplicó los permisos. Ábrelo con "Abrir Health Connect", concede los permisos de FitPilot y vuelve a intentar.'
    : 'iOS no aplicó los permisos de Salud. Reinicia el iPhone y vuelve a intentar: suele bastar, incluso si en Ajustes > Privacidad y seguridad > Salud > FitPilot los permisos ya aparecen activados.';

/**
 * iOS: después de pedir permiso, HealthKit sigue diciendo que haría falta presentar la hoja.
 * No se aplicó: se presentó en blanco y se cerró sola, o se interrumpió. Repetir la petición
 * rara vez lo arregla, así que quien llama debe mostrar los pasos de recuperación en vez de
 * seguir de largo como si hubiera permisos.
 */
export const isConnectedHealthAuthorizationNotApplied = (
  permissions: FitpilotHealthPermissionStatus | null | undefined,
): boolean => permissions?.requestStatus === 'shouldRequest';

/**
 * Mismo contrato que el error tipado del módulo nativo, para los cortes que hace la propia
 * capa JS. Llevar el código permite que el auto-sync trate "sin permisos" como estado
 * silencioso —la tarjeta ya muestra su propio CTA— en vez de pintar un banner de error rojo
 * en cada foco de pantalla.
 */
export class ConnectedHealthPermissionsError extends Error {
  readonly code = HEALTH_PERMISSIONS_ERROR_CODE;

  constructor(message?: string) {
    super(message ?? getConnectedHealthAuthorizationRecoveryMessage());
    this.name = 'ConnectedHealthPermissionsError';
  }
}

export const getConnectedHealthPlatformLabel = (platform?: string | null): string => {
  if (platform === 'healthkit') {
    return 'Apple Health';
  }
  if (platform === 'health_connect') {
    return 'Health Connect';
  }
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
};

// --- Etiquetas de permisos -------------------------------------------------
// Única fuente de verdad: la usan tanto la pantalla de perfil (lista con checks) como el
// aviso de permisos incompletos del dashboard.

const HEALTHKIT_PERMISSION_LABELS: Record<string, string> = {
  steps: 'Pasos',
  distance: 'Distancia',
  active_energy: 'Kcal activas',
  basal_energy: 'Kcal basales',
  exercise_minutes: 'Minutos de ejercicio',
  workouts: 'Entrenamientos',
  sleep: 'Sueño',
  heart_rate: 'Frecuencia cardíaca',
  resting_heart_rate: 'FC reposo',
  heart_rate_variability: 'HRV',
  glucose: 'Glucosa',
  blood_pressure_systolic: 'Presión sistólica',
  blood_pressure_diastolic: 'Presión diastólica',
  weight: 'Peso',
  body_fat: 'Grasa corporal',
  lean_body_mass: 'Masa magra',
};

// Android manda los permisos como `android.permission.health.READ_*`, así que para la
// etiqueta basta con emparejar por token contenido.
const HEALTH_CONNECT_PERMISSION_LABELS: [string, string][] = [
  ['READ_ACTIVE_CALORIES_BURNED', 'Kcal activas'],
  ['READ_BASAL_METABOLIC_RATE', 'Kcal basales'],
  ['READ_TOTAL_CALORIES_BURNED', 'Kcal totales'],
  ['READ_STEPS', 'Pasos'],
  ['READ_DISTANCE', 'Distancia'],
  ['READ_EXERCISE', 'Entrenamientos'],
  ['READ_SLEEP', 'Sueño'],
  ['READ_HEART_RATE_VARIABILITY', 'HRV'],
  ['READ_RESTING_HEART_RATE', 'FC reposo'],
  ['READ_HEART_RATE', 'Frecuencia cardíaca'],
  ['READ_BLOOD_GLUCOSE', 'Glucosa'],
  ['READ_BLOOD_PRESSURE', 'Presión arterial'],
  ['READ_WEIGHT', 'Peso'],
  ['READ_BODY_FAT', 'Grasa corporal'],
  ['READ_LEAN_BODY_MASS', 'Masa magra'],
  ['READ_HEALTH_DATA_HISTORY', 'Historial anterior a hoy'],
];

export const getConnectedHealthPermissionLabel = (permission: string): string => {
  if (HEALTHKIT_PERMISSION_LABELS[permission]) {
    return HEALTHKIT_PERMISSION_LABELS[permission];
  }

  const matched = HEALTH_CONNECT_PERMISSION_LABELS.find(([token]) =>
    permission.includes(token),
  );
  return matched?.[1] ?? permission.replace(/^android\.permission\.health\./, '');
};

// --- Estado de los permisos ------------------------------------------------

// Permisos que alimentan las tarjetas visibles del dashboard. Solo la ausencia de uno de
// estos justifica pedirle al usuario que complete permisos: molestarle por la glucosa o la
// masa magra, que no se muestran en ninguna parte, sería ruido. READ_HEALTH_DATA_HISTORY
// queda fuera a propósito: denegarlo recorta el histórico, no bloquea nada.
const CORE_PERMISSION_TOKENS = [
  'READ_ACTIVE_CALORIES_BURNED',
  'READ_TOTAL_CALORIES_BURNED',
  'READ_STEPS',
  'READ_DISTANCE',
  'READ_EXERCISE',
  'READ_SLEEP',
  'READ_HEART_RATE',
  'READ_RESTING_HEART_RATE',
  'READ_HEART_RATE_VARIABILITY',
  // HealthKit usa nombres amigables en lugar de constantes de permiso.
  'active_energy',
  'steps',
  'distance',
  'exercise_minutes',
  'workouts',
  'sleep',
  'heart_rate',
  'resting_heart_rate',
  'heart_rate_variability',
];

// `READ_HEART_RATE` es prefijo de `READ_HEART_RATE_VARIABILITY`, y `heart_rate` lo es de
// `heart_rate_variability`: aquí el emparejamiento exige el token completo para no
// confundir un permiso con otro (a diferencia de las etiquetas, donde da igual).
const matchesPermissionToken = (permission: string, token: string) =>
  permission === token || permission.endsWith('.' + token);

export const isCoreConnectedHealthPermission = (permission: string): boolean =>
  CORE_PERMISSION_TOKENS.some((token) => matchesPermissionToken(permission, token));

export type ConnectedHealthPermissionState = 'unknown' | 'none' | 'partial' | 'full';

/**
 * Estado real de los permisos, con la granularidad que la UI necesita.
 *
 * En Android `missing` es información fiable que devuelve Health Connect. En iOS `missing` son
 * los tipos que HealthKit todavía no ha resuelto (la hoja no se aplicó); una lectura negada
 * sigue contando como `granted`, porque HealthKit no revela esa decisión por privacidad.
 */
export const getConnectedHealthPermissionState = (
  permissions: FitpilotHealthPermissionStatus | null | undefined,
): ConnectedHealthPermissionState => {
  if (!permissions) {
    return 'unknown';
  }
  if (permissions.granted.length === 0) {
    return 'none';
  }
  return permissions.missing.some(isCoreConnectedHealthPermission) ? 'partial' : 'full';
};

export const getMissingCoreConnectedHealthPermissions = (
  permissions: FitpilotHealthPermissionStatus | null | undefined,
): string[] => (permissions?.missing ?? []).filter(isCoreConnectedHealthPermission);

/** "HRV, FC reposo y 3 más" — para el aviso de permisos incompletos. */
export const describeMissingConnectedHealthPermissions = (
  permissions: FitpilotHealthPermissionStatus | null | undefined,
  maxNamed = 2,
): string => {
  const labels = getMissingCoreConnectedHealthPermissions(permissions).map(
    getConnectedHealthPermissionLabel,
  );
  if (labels.length === 0) {
    return '';
  }
  const named = labels.slice(0, maxNamed);
  const rest = labels.length - named.length;
  if (rest > 0) {
    return named.join(', ') + ' y ' + rest + ' más';
  }
  if (named.length === 1) {
    return named[0];
  }
  return named.slice(0, -1).join(', ') + ' y ' + named[named.length - 1];
};

// --- Disponibilidad de la plataforma ---------------------------------------

export type ConnectedHealthAvailabilityCopy = {
  title: string;
  message: string;
  actionLabel: string | null;
};

/**
 * Traduce `availability.status` a algo que el usuario pueda accionar.
 *
 * Antes la UI reducía toda la disponibilidad a un booleano y mostraba siempre "no está
 * disponible en este dispositivo. Instala Health Connect", incluso a quien ya lo tenía
 * instalado y solo necesitaba actualizarlo o activarlo.
 */
export const getConnectedHealthAvailabilityCopy = (
  availability: FitpilotHealthAvailability | null | undefined,
): ConnectedHealthAvailabilityCopy => {
  const platformLabel = getConnectedHealthPlatformLabel(availability?.platform);

  switch (availability?.status) {
    case 'needs_update':
      return {
        title: 'Health Connect está desactualizado',
        message:
          availability.message ??
          'Actualiza Health Connect desde Play Store para que FitPilot pueda leer tus métricas.',
        actionLabel: 'Actualizar Health Connect',
      };
    case 'needs_install':
      return {
        title: 'Falta instalar Health Connect',
        message:
          availability.message ??
          'Instala Health Connect desde Play Store para activar tus métricas.',
        actionLabel: 'Instalar Health Connect',
      };
    case 'unavailable':
      return {
        title: platformLabel + ' no está activo',
        message:
          availability.message ??
          (Platform.OS === 'android'
            ? 'Health Connect está desactivado en este dispositivo. Actívalo en Ajustes > Seguridad y privacidad > Más ajustes > Health Connect.'
            : 'Revisa los ajustes de salud del dispositivo para continuar.'),
        actionLabel: Platform.OS === 'android' ? 'Abrir Health Connect' : 'Abrir ajustes',
      };
    case 'unsupported':
    default:
      return {
        title: platformLabel + ' no está disponible',
        message:
          availability?.message ??
          platformLabel + ' no está disponible en este dispositivo.',
        actionLabel: null,
      };
  }
};
