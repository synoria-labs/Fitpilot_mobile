// Colores de marca del logo FitPilot
export const brandColors = {
  navy: '#182f50',      // Azul oscuro (alas, texto "FitPilot")
  sky: '#67b6df',       // Azul claro (letra P)
  accent: '#6bb7e1',    // Azul acento (circulo)
};

export const buttonGradients = {
  primary: {
    light: ['#2b628d', '#53abd5', '#8bd8ee'],
    dark: ['#1f3d62', '#3e88b8', '#67b6df'],
  },
} as const;

// Paleta verde especifica para Nutricion
export const nutritionTheme = {
  heroGradientStart: '#14532D',
  heroGradientMiddle: '#15803D',
  heroGradientEnd: '#6EE7B7',
  accentStrong: '#166534',
  accentSoft: '#DCFCE7',
  accentSurface: '#ECFDF5',
  accentBorder: '#BBF7D0',
};

export const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',  // Azul principal
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  background: '#faf8f5',  // Beige claro del diseno Adobe XD
  white: '#ffffff',
  black: '#000000',
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
};
