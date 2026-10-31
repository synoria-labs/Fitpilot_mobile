import type { ClientDietPortion } from '../types';

export type DietPortionDisplayItem = {
  key: 'grams' | 'household' | 'equivalents';
  label: string;
  value: string;
};

const GRAM_ONLY_PATTERN = /(^|\s)(g|gr|gramo|gramos)$/i;

const formatPortionNumber = (value: number | null) => {
  if (value === null) {
    return null;
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
};

const getGramsDisplayValue = (portion: ClientDietPortion) => {
  const formattedValue = formatPortionNumber(portion.grams);
  return formattedValue ? `${formattedValue} gr` : null;
};

const getHouseholdDisplayValue = (portion: ClientDietPortion) => {
  const householdLabel = portion.householdLabel?.trim();
  if (!householdLabel) {
    return null;
  }

  return GRAM_ONLY_PATTERN.test(householdLabel) && portion.grams !== null
    ? null
    : householdLabel;
};

const getEquivalentsDisplayValue = (portion: ClientDietPortion) => {
  const formattedValue = formatPortionNumber(portion.equivalents);
  return formattedValue ? `${formattedValue} eq` : null;
};

/**
 * The portion's equivalents as the client sees them, also when the backend's display leaves them
 * out: plans are built in equivalents, so they stay next to grams and household measures.
 */
export const getDietPortionEquivalentsValue = (portion: ClientDietPortion): string | null => {
  const shown = portion.display?.find((item) => item.key === 'equivalents');
  if (shown) {
    const value = /eq/i.test(shown.value) ? shown.value : `${shown.value} eq`;
    return `${shown.approximate ? '≈ ' : ''}${value}`;
  }

  return portion.equivalents !== null && portion.equivalents > 0 ? getEquivalentsDisplayValue(portion) : null;
};

/** Equivalents of several portions together, or null when any of them lacks them. */
export const sumDietPortionEquivalents = (portions: ClientDietPortion[]): string | null => {
  let total = 0;
  for (const portion of portions) {
    if (portion.equivalents === null || portion.equivalents <= 0) {
      return null;
    }
    total += portion.equivalents;
  }

  return portions.length ? `${formatPortionNumber(total)} eq` : null;
};

export const getDietPortionDisplayItems = (
  portion: ClientDietPortion,
): DietPortionDisplayItem[] => {
  if (portion.display) return portion.display.map(d=>({key:d.key,label:d.key==='grams'?'Gramos':d.key==='household'?'Unidad casera':'Alimentos equivalentes',value:`${d.approximate?'≈ ':''}${d.value}`}));
  const gramsValue = getGramsDisplayValue(portion);
  const householdValue = getHouseholdDisplayValue(portion);
  const equivalentsValue = getEquivalentsDisplayValue(portion);

  return [
    gramsValue
      ? {
          key: 'grams',
          label: 'Gramos',
          value: gramsValue,
        }
      : null,
    householdValue
      ? {
          key: 'household',
          label: 'Unidad casera',
          value: householdValue,
        }
      : null,
    equivalentsValue
      ? {
          key: 'equivalents',
          label: 'Alimentos equivalentes',
          value: equivalentsValue,
        }
      : null,
  ].filter((item): item is DietPortionDisplayItem => item !== null);
};
