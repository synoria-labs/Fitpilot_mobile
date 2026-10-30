// One letter per weekday, Sunday first (Date#getDay order): L M X J V S D in the strips.
const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** The weekday's letter for a `YYYY-MM-DD` key, or null when the key doesn't parse. */
export const getWeekdayLetter = (dateKey: string): string | null => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return year && month && day ? WEEKDAY_LETTERS[new Date(year, month - 1, day).getDay()] : null;
};
