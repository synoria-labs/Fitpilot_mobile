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
