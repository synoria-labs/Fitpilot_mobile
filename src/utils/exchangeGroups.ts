import { normalizeText } from './formatters';

export type ExchangeGroupKey =
  | 'verduras'
  | 'frutas'
  | 'cereales_tuberculos'
  | 'leguminosas'
  | 'alimentos_origen_animal'
  | 'leche'
  | 'grasas'
  | 'azucares'
  | 'unknown';

// Names and SMAE subgroup names the backend sends for each exchange group.
const EXCHANGE_GROUP_ALIASES: Record<Exclude<ExchangeGroupKey, 'unknown'>, readonly string[]> = {
  verduras: ['verdura', 'verduras', 'vegetal', 'vegetales'],
  frutas: ['fruta', 'frutas'],
  cereales_tuberculos: [
    'cereal',
    'cereales',
    'cereales y tuberculos',
    'cereales con grasa',
    'cereales sin grasa',
    'tuberculo',
    'tuberculos',
    'pan',
    'arroz',
  ],
  leguminosas: ['leguminosa', 'leguminosas', 'frijol', 'frijoles'],
  alimentos_origen_animal: [
    'aoa',
    'alimentos de origen animal',
    'alimento de origen animal',
    'animal',
    'carne',
    'pollo',
    'pescado',
    'proteina animal',
  ],
  leche: [
    'leche',
    'lacteo',
    'lacteos',
    'leche descremada',
    'leche semidescremada',
    'leche entera',
    'leche con azucar',
  ],
  grasas: [
    'grasa',
    'grasas',
    'aceite',
    'aceites',
    'aceites y grasas',
    'grasas sin proteina',
    'grasas con proteina',
  ],
  azucares: ['azucar', 'azucares', 'azucares con grasa', 'azucares sin grasa', 'dulce', 'dulces'],
};

const MATCH_ORDER = Object.keys(EXCHANGE_GROUP_ALIASES) as Exclude<ExchangeGroupKey, 'unknown'>[];

export const normalizeExchangeGroupName = (value: string | null | undefined) => normalizeText(value);

export const getExchangeGroupKey = (groupName: string | null | undefined): ExchangeGroupKey => {
  const normalizedGroupName = normalizeExchangeGroupName(groupName);

  if (!normalizedGroupName) {
    return 'unknown';
  }

  for (const key of MATCH_ORDER) {
    if (
      EXCHANGE_GROUP_ALIASES[key].some(
        (alias) => normalizedGroupName === alias || normalizedGroupName.includes(alias),
      )
    ) {
      return key;
    }
  }

  return 'unknown';
};
