const DATE_KEY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LocalDateInput = Date | string | null | undefined;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

const toLocalDateParts = (value: LocalDateInput): LocalDateParts | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const keyMatch = trimmedValue.slice(0, 10).match(DATE_KEY_REGEX);
  if (keyMatch) {
    const [, rawYear, rawMonth, rawDay] = keyMatch;
    const year = Number.parseInt(rawYear, 10);
    const month = Number.parseInt(rawMonth, 10);
    const day = Number.parseInt(rawDay, 10);
    const probe = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (
      probe.getFullYear() === year &&
      probe.getMonth() === month - 1 &&
      probe.getDate() === day
    ) {
      return { year, month, day };
    }
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    year: parsedDate.getFullYear(),
    month: parsedDate.getMonth() + 1,
    day: parsedDate.getDate(),
  };
};

const buildFormatterKey = (
  locale: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions,
) => JSON.stringify([locale, options ?? {}]);

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (
  locale: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions,
) => {
  const key = buildFormatterKey(locale, options);
  const cachedFormatter = formatterCache.get(key);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
};

const padNumber = (value: number) => value.toString().padStart(2, '0');

export const toLocalDateKey = (value: LocalDateInput): string | null => {
  const parts = toLocalDateParts(value);
  if (!parts) {
    return null;
  }

  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`;
};

export const getTodayDateKey = () => toLocalDateKey(new Date()) ?? '';

export const parseLocalDate = (value: LocalDateInput): Date | null => {
  const parts = toLocalDateParts(value);
  if (!parts) {
    return null;
  }

  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
};

export const formatLocalDate = (
  value: LocalDateInput,
  options?: Intl.DateTimeFormatOptions,
  locale: Intl.LocalesArgument = 'es-MX',
) => {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) {
    return '';
  }

  return getFormatter(locale, options).format(parsedDate);
};

export const getLocalDayNumber = (value: LocalDateInput) => {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) {
    return '';
  }

  return String(parsedDate.getDate());
};

export const formatLocalShortWeekday = (
  value: LocalDateInput,
  locale: Intl.LocalesArgument = 'es-MX',
) => {
  const formattedValue = formatLocalDate(value, { weekday: 'short' }, locale)
    .replace('.', '')
    .trim()
    .toLowerCase();

  if (!formattedValue) {
    return '';
  }

  return formattedValue.charAt(0).toUpperCase() + formattedValue.slice(1);
};

/** Day and short month without the abbreviation's dot: "28 oct". */
export const formatLocalShortDate = (value: LocalDateInput, locale: Intl.LocalesArgument = 'es-MX') =>
  formatLocalDate(value, { day: 'numeric', month: 'short' }, locale).replace('.', '');

export const addDaysToDateKey = (value: LocalDateInput, days: number) => {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) {
    return null;
  }

  const shiftedDate = new Date(parsedDate);
  shiftedDate.setDate(shiftedDate.getDate() + days);
  return toLocalDateKey(shiftedDate);
};

export const getStartOfLocalWeekDateKey = (value: LocalDateInput = new Date()) => {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) {
    return null;
  }

  const mondayOffset = (parsedDate.getDay() + 6) % 7;
  return addDaysToDateKey(parsedDate, -mondayOffset);
};

export const getLocalWeekDateKeys = (value: LocalDateInput = new Date()) => {
  const startOfWeekKey = getStartOfLocalWeekDateKey(value);
  if (!startOfWeekKey) {
    return [];
  }

  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(startOfWeekKey, index) ?? startOfWeekKey);
};

export const getLocalWeekKey = (value: LocalDateInput = new Date()) => {
  const weekDateKeys = getLocalWeekDateKeys(value);
  if (weekDateKeys.length === 0) {
    return '';
  }

  return `${weekDateKeys[0]}:${weekDateKeys[weekDateKeys.length - 1]}`;
};

export const getTomorrowDateKey = (value: LocalDateInput = new Date()) =>
  addDaysToDateKey(value, 1) ?? '';

export const compareDateKeys = (left: LocalDateInput, right: LocalDateInput) => {
  const leftKey = toLocalDateKey(left);
  const rightKey = toLocalDateKey(right);

  if (!leftKey || !rightKey) {
    return 0;
  }

  return leftKey.localeCompare(rightKey);
};

export const getCalendarDayDiff = (from: LocalDateInput, to: LocalDateInput) => {
  const fromParts = toLocalDateParts(from);
  const toParts = toLocalDateParts(to);

  if (!fromParts || !toParts) {
    return 0;
  }

  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
};
