import type { AppTheme } from '../../theme';
import type { WorkoutAnalyticsColorToken } from '../../types';

export const progressRepColors: Record<WorkoutAnalyticsColorToken, string> = {
  navy: '#2563eb',
  sky: '#0d9488',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#db2777',
  violet: '#7c3aed',
};

// Aurora tokens from the Entreno reference, scoped to training progress.
export const progressColors = (theme: AppTheme) => ({
  background: theme.isDark ? '#060c18' : '#f2f5fa',
  surface: theme.isDark ? '#0f1a2b' : '#ffffff',
  soft: theme.isDark ? '#172438' : '#f6f8fc',
  text: theme.isDark ? '#e7edf6' : '#0b1220',
  muted: theme.isDark ? '#a3b1c4' : '#5e6e84',
  border: theme.isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.07)',
  accent: theme.isDark ? '#93c5fd' : '#1d4ed8',
  accentSoft: theme.isDark ? 'rgba(96,165,250,0.13)' : 'rgba(37,99,235,0.09)',
  green: theme.isDark ? '#6ee7b7' : '#047857',
  greenSoft: theme.isDark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.10)',
  amber: theme.isDark ? '#fcd34d' : '#b45309',
  heat: theme.isDark
    ? ['#16233a', '#1b3866', '#22529f', '#3b7bea', '#93c5fd']
    : ['#e9eef5', '#c9dcff', '#93b9ff', '#5089f6', '#1e4fd8'],
});

export const progressShadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};
