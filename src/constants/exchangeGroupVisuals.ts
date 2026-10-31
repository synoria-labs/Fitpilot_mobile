import type { ReactNode } from 'react';
import {
  Apple,
  Bean,
  Beef,
  CandyCane,
  Carrot,
  CookingPot,
  Droplets,
  Milk,
  Wheat,
} from '../vendor/lucide';
import type { LucideIcon, LucideIconProps } from '../vendor/lucide';
import { brandColors } from './colors';
import { getExchangeGroupKey, type ExchangeGroupKey } from '../utils/exchangeGroups';

export type ExchangeGroupVisualKey = ExchangeGroupKey;

type ExchangeGroupVisualDefinition = {
  label: string;
  icon: LucideIcon;
  renderIcon?: (props: LucideIconProps) => ReactNode;
  iconColor: string;
  backgroundColor: string;
  borderColor: string;
};

export type ExchangeGroupVisual = ExchangeGroupVisualDefinition & {
  key: ExchangeGroupVisualKey;
};

export const EXCHANGE_GROUP_VISUALS = {
  verduras: {
    label: 'Verduras',
    icon: Carrot,
    iconColor: '#15803D',
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  frutas: {
    label: 'Frutas',
    icon: Apple,
    iconColor: '#EA580C',
    backgroundColor: '#FFEDD5',
    borderColor: '#FED7AA',
  },
  cereales_tuberculos: {
    label: 'Cereales y tuberculos',
    icon: Wheat,
    iconColor: '#92400E',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  leguminosas: {
    label: 'Leguminosas',
    icon: Bean,
    iconColor: '#7C3AED',
    backgroundColor: '#EDE9FE',
    borderColor: '#DDD6FE',
  },
  alimentos_origen_animal: {
    label: 'Alimentos de origen animal',
    icon: Beef,
    iconColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  leche: {
    label: 'Leche',
    icon: Milk,
    iconColor: '#0891B2',
    backgroundColor: '#CFFAFE',
    borderColor: '#A5F3FC',
  },
  grasas: {
    label: 'Grasas',
    icon: Droplets,
    iconColor: '#D97706',
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  azucares: {
    label: 'Azucares',
    icon: CandyCane,
    iconColor: '#DB2777',
    backgroundColor: '#FCE7F3',
    borderColor: '#FBCFE8',
  },
  unknown: {
    label: 'Grupo alimenticio',
    icon: CookingPot,
    iconColor: brandColors.navy,
    backgroundColor: '#E8F0F8',
    borderColor: '#D8E7F4',
  },
} as const satisfies Record<ExchangeGroupVisualKey, ExchangeGroupVisualDefinition>;

export const getExchangeGroupVisualKey = (
  groupName: string | null | undefined,
): ExchangeGroupVisualKey => getExchangeGroupKey(groupName);

export const getExchangeGroupVisual = (
  groupName: string | null | undefined,
): ExchangeGroupVisual => {
  const key = getExchangeGroupVisualKey(groupName);
  return {
    key,
    ...EXCHANGE_GROUP_VISUALS[key],
  };
};
