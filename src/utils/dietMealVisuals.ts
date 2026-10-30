export type DietMealKind = 'desayuno' | 'colacion' | 'comida' | 'cena' | 'otra';

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const getDietMealKind = (mealName: string): DietMealKind => {
  const name = normalize(mealName);

  if (/desayun|breakfast|almuerzo temprano/.test(name)) {
    return 'desayuno';
  }
  if (/colacion|snack|merienda|refrigerio|tentempie/.test(name)) {
    return 'colacion';
  }
  if (/cena|dinner/.test(name)) {
    return 'cena';
  }
  if (/comida|almuerzo|lunch/.test(name)) {
    return 'comida';
  }
  return 'otra';
};

const isAlmuerzo = (mealName: string) => {
  const name = normalize(mealName);
  return name.includes('almuerzo') && !name.includes('comida') && getDietMealKind(mealName) === 'comida';
};

/**
 * The kind of each meal of a day. «Almuerzo» is the main meal unless the day also has a «comida»;
 * then it is the Mexican mid-morning meal and looks like breakfast.
 */
export const getDietMealKinds = (mealNames: string[]): DietMealKind[] => {
  const kinds = mealNames.map(getDietMealKind);
  const hasComida = mealNames.some((name, index) => kinds[index] === 'comida' && !isAlmuerzo(name));

  return kinds.map((kind, index) => (hasComida && isAlmuerzo(mealNames[index]) ? 'desayuno' : kind));
};

// Usual hour of the meals that anchor a day, to tell which one comes next today. Snacks and
// unknown meals fall between their neighbours.
const ANCHOR_HOUR: Record<Exclude<DietMealKind, 'colacion' | 'otra'>, number> = {
  desayuno: 8,
  comida: 14,
  cena: 20,
};
const MID_MORNING_HOUR = 11;
const HOURS_BETWEEN_MEALS = 2.5;

const getNominalHours = (mealNames: string[]) => {
  const kinds = getDietMealKinds(mealNames);
  const anchors = kinds.flatMap((kind, index) => {
    if (kind === 'colacion' || kind === 'otra') {
      return [];
    }
    const hour = kind === 'desayuno' && isAlmuerzo(mealNames[index]) ? MID_MORNING_HOUR : ANCHOR_HOUR[kind];
    return [{ index, hour }];
  });

  if (!anchors.length) {
    // Nothing to go by: spread the meals across the day.
    return kinds.map((_, index) => 8 + (index / Math.max(1, kinds.length - 1)) * 12);
  }

  return kinds.map((_, index) => {
    const before = [...anchors].reverse().find((anchor) => anchor.index <= index);
    const after = anchors.find((anchor) => anchor.index >= index);

    if (before && after) {
      return before.index === after.index
        ? before.hour
        : before.hour + ((after.hour - before.hour) * (index - before.index)) / (after.index - before.index);
    }

    // Before the first anchored meal or after the last one.
    const nearest = before ?? after ?? anchors[0];
    return nearest.hour + HOURS_BETWEEN_MEALS * (index - nearest.index);
  });
};

/**
 * Index of the next meal for a day that is today, given the current hour; null when every
 * meal's usual time has passed.
 */
export const getNextDietMealIndex = (mealNames: string[], currentHour: number): number | null => {
  const hours = getNominalHours(mealNames);
  const index = hours.findIndex((hour) => hour > currentHour);
  return index === -1 ? null : index;
};
