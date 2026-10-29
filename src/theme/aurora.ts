import type { TextStyle } from 'react-native';
import { useAppTheme } from './index';

/**
 * «Aurora», el sistema visual del rediseño. Sigue los tokens del panel profesional
 * (`--dash-*` / `--tone-*` en FitPilot-frontend) adaptados al teléfono: una tierra fría,
 * tarjetas blancas con sombra larga, un tono por módulo y escalas de un solo tono para la
 * cuadrícula de actividad. El modo oscuro tiene sus propios valores, no una inversión.
 */

export const auroraFontFiles = {
  'PlusJakartaSans-Regular': require('../../assets/fonts/plus-jakarta-sans/PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-Medium': require('../../assets/fonts/plus-jakarta-sans/PlusJakartaSans-Medium.ttf'),
  'PlusJakartaSans-SemiBold': require('../../assets/fonts/plus-jakarta-sans/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('../../assets/fonts/plus-jakarta-sans/PlusJakartaSans-Bold.ttf'),
  'PlusJakartaSans-ExtraBold': require('../../assets/fonts/plus-jakarta-sans/PlusJakartaSans-ExtraBold.ttf'),
};

export type AuroraWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

const FONT_FAMILIES: Record<AuroraWeight, string> = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
};

// Each weight is its own font file, so the family carries the weight; also setting
// fontWeight would make Android synthesize a heavier face on top.
export const auroraFont = (weight: AuroraWeight): TextStyle => ({ fontFamily: FONT_FAMILIES[weight] });

export const auroraType = {
  display: { ...auroraFont('extrabold'), fontSize: 31, lineHeight: 35, letterSpacing: -0.8 },
  title: { ...auroraFont('extrabold'), fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  headline: { ...auroraFont('extrabold'), fontSize: 16, lineHeight: 21 },
  body: { ...auroraFont('medium'), fontSize: 15, lineHeight: 23 },
  caption: { ...auroraFont('medium'), fontSize: 12, lineHeight: 16 },
  label: { ...auroraFont('bold'), fontSize: 10.5, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  number: { ...auroraFont('extrabold'), fontSize: 28, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type AuroraTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate';
export type AuroraHeatMode = 'todo' | 'entreno' | 'pasos';
export type AuroraHeatRamp = readonly [string, string, string, string, string];

export type AuroraToneSet = {
  tone: string;
  tone2: string;
  soft: string;
  line: string;
  ink: string;
  /** Solid fill that keeps 4.5:1 with `onTone` text. */
  gradient: readonly [string, string];
};

export type AuroraTokens = {
  isDark: boolean;
  ground: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  onTone: string;
  glass: string;
  glassBorder: string;
  shadow: string;
  shadowLg: string;
  heroShadow: string;
  gridLine: string;
  auroraOpacity: number;
  tones: Record<AuroraTone, AuroraToneSet>;
  heat: Record<AuroraHeatMode, AuroraHeatRamp>;
};

/** The brand's diagonal: the today card's chamfer and the selected day share this angle. */
export const AURORA_SIGNATURE_ANGLE = 14;

export const auroraRadius = { chip: 12, button: 16, card: 22, hero: 28 } as const;

/** The "Sesión de hoy" card stays navy in both themes; it is the screen's focal point. */
export const auroraHeroGradient = ['#0a1630', '#13284a', '#0b2b3c'] as const;

const LIGHT: AuroraTokens = {
  isDark: false,
  ground: '#f2f5fa',
  surface: '#ffffff',
  surface2: '#f6f8fc',
  surface3: '#e9eef5',
  border: 'rgba(15, 23, 42, 0.07)',
  borderStrong: 'rgba(15, 23, 42, 0.13)',
  text: '#0b1220',
  muted: '#475569',
  faint: '#5e6e84',
  onTone: '#ffffff',
  glass: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.9)',
  shadow: '0px 1px 2px 0px rgba(15, 23, 42, 0.04), 0px 14px 34px -22px rgba(15, 23, 42, 0.3)',
  shadowLg: '0px 1px 2px 0px rgba(15, 23, 42, 0.05), 0px 28px 56px -28px rgba(15, 23, 42, 0.45)',
  heroShadow: '0px 26px 44px -26px rgba(10, 22, 48, 0.6)',
  gridLine: 'rgba(15, 23, 42, 0.05)',
  auroraOpacity: 0.55,
  tones: {
    blue: { tone: '#2563eb', tone2: '#4f46e5', soft: 'rgba(37, 99, 235, 0.09)', line: 'rgba(37, 99, 235, 0.22)', ink: '#1d4ed8', gradient: ['#2563eb', '#4f46e5'] },
    emerald: { tone: '#059669', tone2: '#0d9488', soft: 'rgba(5, 150, 105, 0.1)', line: 'rgba(5, 150, 105, 0.24)', ink: '#047857', gradient: ['#047857', '#0f766e'] },
    violet: { tone: '#7c3aed', tone2: '#c026d3', soft: 'rgba(124, 58, 237, 0.09)', line: 'rgba(124, 58, 237, 0.22)', ink: '#6d28d9', gradient: ['#7c3aed', '#c026d3'] },
    amber: { tone: '#ea580c', tone2: '#f59e0b', soft: 'rgba(234, 88, 12, 0.09)', line: 'rgba(234, 88, 12, 0.24)', ink: '#b45309', gradient: ['#c2410c', '#ea580c'] },
    rose: { tone: '#e11d48', tone2: '#f43f5e', soft: 'rgba(225, 29, 72, 0.08)', line: 'rgba(225, 29, 72, 0.22)', ink: '#be123c', gradient: ['#be123c', '#e11d48'] },
    slate: { tone: '#475569', tone2: '#64748b', soft: 'rgba(71, 85, 105, 0.09)', line: 'rgba(71, 85, 105, 0.2)', ink: '#475569', gradient: ['#475569', '#334155'] },
  },
  heat: {
    todo: ['#e9eef5', '#ddd3fd', '#bba3f8', '#8b5cf6', '#5b21b6'],
    entreno: ['#e9eef5', '#c9dcff', '#93b9ff', '#5089f6', '#1e4fd8'],
    pasos: ['#e9eef5', '#c6f0dc', '#86dcb4', '#34b984', '#0b7a55'],
  },
};

const DARK: AuroraTokens = {
  isDark: true,
  ground: '#060c18',
  surface: '#0f1a2b',
  surface2: '#0c1524',
  surface3: '#172438',
  border: 'rgba(148, 163, 184, 0.1)',
  borderStrong: 'rgba(148, 163, 184, 0.18)',
  text: '#e7edf6',
  muted: '#a3b1c4',
  faint: '#8796ab',
  onTone: '#06101f',
  glass: 'rgba(10, 18, 34, 0.55)',
  glassBorder: 'rgba(148, 163, 184, 0.16)',
  shadow: '0px 18px 40px -28px rgba(0, 0, 0, 0.8)',
  shadowLg: '0px 28px 56px -28px rgba(0, 0, 0, 0.9)',
  heroShadow: '0px 26px 44px -26px rgba(0, 0, 0, 0.75)',
  gridLine: 'rgba(148, 163, 184, 0.07)',
  auroraOpacity: 0.62,
  tones: {
    blue: { tone: '#60a5fa', tone2: '#818cf8', soft: 'rgba(96, 165, 250, 0.13)', line: 'rgba(96, 165, 250, 0.3)', ink: '#93c5fd', gradient: ['#60a5fa', '#818cf8'] },
    emerald: { tone: '#34d399', tone2: '#2dd4bf', soft: 'rgba(52, 211, 153, 0.12)', line: 'rgba(52, 211, 153, 0.28)', ink: '#6ee7b7', gradient: ['#34d399', '#2dd4bf'] },
    violet: { tone: '#a78bfa', tone2: '#e879f9', soft: 'rgba(167, 139, 250, 0.13)', line: 'rgba(167, 139, 250, 0.3)', ink: '#c4b5fd', gradient: ['#a78bfa', '#e879f9'] },
    amber: { tone: '#fbbf24', tone2: '#fb923c', soft: 'rgba(251, 191, 36, 0.12)', line: 'rgba(251, 191, 36, 0.28)', ink: '#fcd34d', gradient: ['#fbbf24', '#fb923c'] },
    rose: { tone: '#fb7185', tone2: '#f472b6', soft: 'rgba(251, 113, 133, 0.12)', line: 'rgba(251, 113, 133, 0.28)', ink: '#fda4af', gradient: ['#fb7185', '#f472b6'] },
    slate: { tone: '#a3b1c4', tone2: '#7b8aa0', soft: 'rgba(148, 163, 184, 0.11)', line: 'rgba(148, 163, 184, 0.24)', ink: '#a3b1c4', gradient: ['#a3b1c4', '#7b8aa0'] },
  },
  heat: {
    todo: ['#16233a', '#2e2560', '#4a3699', '#7c5cf0', '#c4b5fd'],
    entreno: ['#16233a', '#1b3866', '#22529f', '#3b7bea', '#93c5fd'],
    pasos: ['#16233a', '#0f3b33', '#13624f', '#1fa37a', '#6ee7b7'],
  },
};

export const getAuroraTokens = (isDark: boolean): AuroraTokens => (isDark ? DARK : LIGHT);

export const useAurora = (): AuroraTokens => {
  const { theme } = useAppTheme();
  return getAuroraTokens(theme.isDark);
};
