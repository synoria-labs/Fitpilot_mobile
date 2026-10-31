import { addDaysToDateKey, compareDateKeys, parseLocalDate } from './date';

/**
 * Modelo de la cuadrícula de actividad estilo GitHub: una columna por semana (lunes a domingo)
 * y un cuadro por día, cuyo nivel 0–4 depende del modo.
 */

export type ActivityMode = 'todo' | 'entreno' | 'pasos';
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type DailyActivity = {
  sessions: number;
  volumeKg: number;
  minutes: number;
  trainingNames: string[];
  steps: number | null;
  sleepMinutes: number | null;
  activeKcal: number | null;
};

/** Las cuatro metas del modo «Todo». */
export const ACTIVITY_GOALS = { steps: 8000, sleepMinutes: 7 * 60, activeKcal: 450 } as const;

export const createEmptyDailyActivity = (): DailyActivity => ({
  sessions: 0,
  volumeKg: 0,
  minutes: 0,
  trainingNames: [],
  steps: null,
  sleepMinutes: null,
  activeKcal: null,
});

export const countDailyGoals = (day: DailyActivity | null | undefined): number => {
  if (!day) {
    return 0;
  }
  return (
    (day.sessions > 0 ? 1 : 0) +
    ((day.steps ?? 0) >= ACTIVITY_GOALS.steps ? 1 : 0) +
    ((day.sleepMinutes ?? 0) >= ACTIVITY_GOALS.sleepMinutes ? 1 : 0) +
    ((day.activeKcal ?? 0) >= ACTIVITY_GOALS.activeKcal ? 1 : 0)
  );
};

export type VolumeCuts = readonly [number, number, number];

const FIXED_VOLUME_CUTS_KG: VolumeCuts = [5600, 7200, 9000];

const quantile = (sorted: number[], q: number) => {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/**
 * Cortes de volumen entre los niveles 1 y 4. Con toneladas fijas, quien carga poco vería todo
 * del mismo tono pálido; con suficientes sesiones, los cortes siguen los cuartiles de la persona.
 */
export const getVolumeCuts = (days: Iterable<DailyActivity>): VolumeCuts => {
  const volumes = [...days]
    .filter((day) => day.sessions > 0 && day.volumeKg > 0)
    .map((day) => day.volumeKg)
    .sort((left, right) => left - right);

  if (volumes.length < 4) {
    return FIXED_VOLUME_CUTS_KG;
  }
  return [quantile(volumes, 0.25), quantile(volumes, 0.5), quantile(volumes, 0.75)];
};

export const getActivityLevel = (
  day: DailyActivity | null | undefined,
  mode: ActivityMode,
  volumeCuts: VolumeCuts = FIXED_VOLUME_CUTS_KG,
): ActivityLevel => {
  if (!day) {
    return 0;
  }

  if (mode === 'entreno') {
    if (day.sessions <= 0) {
      return 0;
    }
    // Las sesiones solo de cardio no registran carga: cuenta su duración.
    if (day.volumeKg <= 0) {
      return day.minutes >= 45 ? 2 : 1;
    }
    if (day.volumeKg > volumeCuts[2]) return 4;
    if (day.volumeKg > volumeCuts[1]) return 3;
    if (day.volumeKg > volumeCuts[0]) return 2;
    return 1;
  }

  if (mode === 'pasos') {
    const steps = day.steps ?? 0;
    if (steps >= 12000) return 4;
    if (steps >= 9000) return 3;
    if (steps >= 6000) return 2;
    if (steps >= 2000) return 1;
    return 0;
  }

  return countDailyGoals(day) as ActivityLevel;
};

export type ActivityCell = {
  dateKey: string;
  weekIndex: number;
  /** 0 = lunes … 6 = domingo. */
  dayIndex: number;
  level: ActivityLevel;
  isToday: boolean;
  isFuture: boolean;
  /** Antes del primer dato de la persona: se pinta atenuado y no rompe rachas. */
  isBeforeStart: boolean;
  activity: DailyActivity | null;
};

export type ActivityMonthLabel = { weekIndex: number; label: string };

export type ActivityGridModel = {
  cells: ActivityCell[];
  months: ActivityMonthLabel[];
  todayIndex: number;
  weeks: number;
};

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const monthOf = (dateKey: string) => Number(dateKey.slice(5, 7)) - 1;

export const buildActivityGrid = ({
  todayKey,
  weeks,
  days,
  mode,
  startKey = null,
}: {
  todayKey: string;
  weeks: number;
  days: Record<string, DailyActivity>;
  mode: ActivityMode;
  startKey?: string | null;
}): ActivityGridModel => {
  const today = parseLocalDate(todayKey);
  if (!today || weeks <= 0) {
    return { cells: [], months: [], todayIndex: -1, weeks: 0 };
  }

  const mondayOffset = (today.getDay() + 6) % 7;
  const firstKey = addDaysToDateKey(todayKey, -mondayOffset - (weeks - 1) * 7) ?? todayKey;
  const volumeCuts = mode === 'entreno' ? getVolumeCuts(Object.values(days)) : undefined;
  const cells: ActivityCell[] = [];
  let todayIndex = -1;

  for (let index = 0; index < weeks * 7; index += 1) {
    const dateKey = addDaysToDateKey(firstKey, index) ?? firstKey;
    const isToday = dateKey === todayKey;
    const isFuture = compareDateKeys(dateKey, todayKey) > 0;
    const isBeforeStart = startKey ? compareDateKeys(dateKey, startKey) < 0 : false;
    const activity = days[dateKey] ?? null;
    if (isToday) {
      todayIndex = index;
    }
    cells.push({
      dateKey,
      weekIndex: Math.floor(index / 7),
      dayIndex: index % 7,
      level: isFuture || isBeforeStart ? 0 : getActivityLevel(activity, mode, volumeCuts),
      isToday,
      isFuture,
      isBeforeStart,
      activity,
    });
  }

  const months: ActivityMonthLabel[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const month = monthOf(cells[week * 7].dateKey);
    if (week === 0 || month !== monthOf(cells[(week - 1) * 7].dateKey)) {
      months.push({ weekIndex: week, label: MONTH_SHORT[month] });
    }
  }
  // Un mes que solo asoma en la primera columna se encimaría con el siguiente.
  if (months.length > 1 && months[1].weekIndex - months[0].weekIndex < 3) {
    months.shift();
  }

  return { cells, months, todayIndex, weeks };
};

const isTracked = (cell: ActivityCell) => !cell.isFuture && !cell.isBeforeStart;

export const meetsTwoGoals = (cell: ActivityCell) => countDailyGoals(cell.activity) >= 2;

/** Días seguidos que cumplen hasta hoy. Hoy aún no termina: si no cumple todavía, se cuenta desde ayer. */
export const getCurrentDailyStreak = (
  cells: ActivityCell[],
  todayIndex: number,
  qualifies: (cell: ActivityCell) => boolean,
) => {
  if (todayIndex < 0) {
    return 0;
  }
  let index = todayIndex;
  if (!qualifies(cells[index])) {
    index -= 1;
  }
  let streak = 0;
  while (index >= 0 && isTracked(cells[index]) && qualifies(cells[index])) {
    streak += 1;
    index -= 1;
  }
  return streak;
};

export const getBestDailyStreak = (cells: ActivityCell[], qualifies: (cell: ActivityCell) => boolean) => {
  let best = 0;
  let run = 0;
  for (const cell of cells) {
    if (isTracked(cell) && qualifies(cell)) {
      run += 1;
      best = Math.max(best, run);
    } else if (!cell.isFuture) {
      run = 0;
    }
  }
  return best;
};

/** Sesiones completadas en cada semana (columna) de la cuadrícula, de la más antigua a la actual. */
export const getWeeklySessionCounts = (model: ActivityGridModel) =>
  Array.from({ length: model.weeks }, (_, week) =>
    model.cells
      .slice(week * 7, week * 7 + 7)
      .reduce((total, cell) => total + (isTracked(cell) ? cell.activity?.sessions ?? 0 : 0), 0),
  );

/**
 * Racha de entreno por semanas: los días de descanso no la rompen. La semana en curso solo suma
 * cuando ya llegó al mínimo; mientras tanto no corta la racha.
 */
export const getCurrentWeeklyStreak = (model: ActivityGridModel, minSessions = 3) => {
  const counts = getWeeklySessionCounts(model);
  let week = model.weeks - 1;
  if (week >= 0 && counts[week] < minSessions) {
    week -= 1;
  }
  let streak = 0;
  while (week >= 0 && counts[week] >= minSessions) {
    streak += 1;
    week -= 1;
  }
  return streak;
};

export type ActivityStat = { label: string; value: string; caption: string };

const formatInteger = (value: number) => Math.round(value).toLocaleString('es-MX');
const formatTons = (kilograms: number) =>
  `${(kilograms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} t`;
const formatDays = (count: number) => `${count} ${count === 1 ? 'día' : 'días'}`;

export const summarizeActivity = (model: ActivityGridModel, mode: ActivityMode): ActivityStat[] => {
  const tracked = model.cells.filter(isTracked);

  if (mode === 'entreno') {
    const sessions = tracked.reduce((total, cell) => total + (cell.activity?.sessions ?? 0), 0);
    const volume = tracked.reduce((total, cell) => total + (cell.activity?.volumeKg ?? 0), 0);
    return [
      { label: 'Sesiones', value: formatInteger(sessions), caption: `en ${model.weeks} semanas` },
      { label: 'Racha', value: `${getCurrentWeeklyStreak(model)} sem.`, caption: '3+ sesiones' },
      { label: 'Volumen', value: volume > 0 ? formatTons(volume) : '—', caption: 'levantado' },
    ];
  }

  if (mode === 'pasos') {
    const withSteps = tracked.filter((cell) => cell.activity?.steps != null);
    const total = withSteps.reduce((sum, cell) => sum + (cell.activity?.steps ?? 0), 0);
    const best = withSteps.reduce((max, cell) => Math.max(max, cell.activity?.steps ?? 0), 0);
    const streak = getCurrentDailyStreak(
      model.cells,
      model.todayIndex,
      (cell) => (cell.activity?.steps ?? 0) >= ACTIVITY_GOALS.steps,
    );
    return [
      { label: 'Promedio', value: withSteps.length ? formatInteger(total / withSteps.length) : '—', caption: 'pasos al día' },
      { label: 'Racha 8k', value: formatDays(streak), caption: 'seguidos' },
      { label: 'Mejor día', value: best ? formatInteger(best) : '—', caption: 'pasos' },
    ];
  }

  const active = tracked.filter((cell) => cell.level > 0).length;
  return [
    { label: 'Días activos', value: formatInteger(active), caption: `de ${tracked.length}` },
    {
      label: 'Racha',
      value: formatDays(getCurrentDailyStreak(model.cells, model.todayIndex, meetsTwoGoals)),
      caption: '2+ metas',
    },
    { label: 'Mejor racha', value: formatDays(getBestDailyStreak(model.cells, meetsTwoGoals)), caption: 'en el periodo' },
  ];
};

export const formatActivityDate = (dateKey: string) => {
  const date = parseLocalDate(dateKey);
  if (!date) {
    return dateKey;
  }
  const text = `${WEEKDAY_LONG[(date.getDay() + 6) % 7]} ${date.getDate()} de ${MONTH_LONG[date.getMonth()]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatSleepMinutes = (minutes: number) => {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, '0')} min`;
};

export type ActivityDayDetail = {
  title: string;
  badge: string;
  isToday: boolean;
  rows: { key: string; label: string; value: string }[];
};

export const describeActivityCell = (cell: ActivityCell): ActivityDayDetail => {
  const activity = cell.activity;
  const blank = cell.isFuture || cell.isBeforeStart;
  const goals = countDailyGoals(activity);

  let training = 'Descanso';
  if (blank) {
    training = '—';
  } else if (activity && activity.sessions > 0) {
    training = [
      activity.trainingNames[0] ?? 'Sesión',
      activity.minutes > 0 ? `${Math.round(activity.minutes)} min` : null,
      activity.volumeKg > 0 ? formatTons(activity.volumeKg) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return {
    title: formatActivityDate(cell.dateKey),
    badge: cell.isToday ? 'Hoy' : cell.isFuture ? 'Próximo' : cell.isBeforeStart ? 'Sin datos' : `${goals} de 4 metas`,
    isToday: cell.isToday,
    rows: [
      { key: 'training', label: 'Entreno', value: training },
      {
        key: 'steps',
        label: 'Pasos',
        value: !blank && activity?.steps != null ? formatInteger(activity.steps) : '—',
      },
      {
        key: 'sleep',
        label: 'Sueño',
        value: !blank && activity?.sleepMinutes != null ? formatSleepMinutes(activity.sleepMinutes) : '—',
      },
      {
        key: 'kcal',
        label: 'Kcal activas',
        value: !blank && activity?.activeKcal != null ? formatInteger(activity.activeKcal) : '—',
      },
      { key: 'goals', label: 'Metas', value: blank ? '—' : `${goals} de 4` },
    ],
  };
};

/** El día elegido en la cuadrícula de Entreno: la fecha y la sesión, o descanso. */
export const describeTrainingCell = (cell: ActivityCell) => {
  const title = formatActivityDate(cell.dateKey);
  const activity = cell.activity;
  if (cell.isFuture) {
    return { title, detail: 'Aún no llega' };
  }
  if (!activity || activity.sessions <= 0) {
    return { title, detail: cell.isToday ? 'Sin sesión todavía' : 'Descanso' };
  }
  const name = activity.trainingNames[0] ?? 'Sesión';
  const others = activity.sessions - 1;
  return {
    title,
    detail: [
      others > 0 ? `${name} y ${others} ${others === 1 ? 'sesión más' : 'sesiones más'}` : name,
      activity.minutes > 0 ? `${Math.round(activity.minutes)} min` : null,
      activity.volumeKg > 0 ? formatTons(activity.volumeKg) : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
};

/** Lo que el lector de pantalla dice del día elegido. */
export const describeCellForAccessibility = (cell: ActivityCell, mode: ActivityMode) => {
  const date = formatActivityDate(cell.dateKey);
  if (cell.isFuture) return `${date}, aún no llega`;
  if (cell.isBeforeStart) return `${date}, sin datos`;
  const activity = cell.activity;
  if (mode === 'entreno') {
    return activity && activity.sessions > 0
      ? `${date}, ${activity.trainingNames[0] ?? 'sesión'} completada`
      : `${date}, sin entrenamiento`;
  }
  if (mode === 'pasos') {
    return activity?.steps != null ? `${date}, ${formatInteger(activity.steps)} pasos` : `${date}, sin pasos registrados`;
  }
  return `${date}, ${countDailyGoals(activity)} de 4 metas`;
};
