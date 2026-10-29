import { DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { brandColors, colors } from '../constants/colors';
import { useThemeStore, type ResolvedTheme, type ThemePreference } from '../store/themeStore';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  icon: string;
  iconMuted: string;
  primary: string;
  primarySoft: string;
  primaryBorder: string;
  success: string;
  error: string;
  warning: string;
  inputBackground: string;
  inputBorder: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActiveBg: string;
  tabBarActiveTint: string;
  tabBarInactiveTint: string;
  phoneNavShellBackground: string;
  phoneNavShellBorder: string;
  phoneNavShellBlurTint: 'light' | 'dark';
  phoneNavIndicatorBackground: string;
  phoneNavLabelActive: string;
  phoneNavLabelInactive: string;
  phoneNavIconActive: string;
  phoneNavIconInactive: string;
  systemNavigationBarBackground: string;
  systemNavigationBarButtonStyle: 'light' | 'dark';
  overlay: string;
  skeletonBase: string;
  skeletonHighlight: string;
  blurTint: 'light' | 'dark';
};

export type AppTheme = {
  id: ResolvedTheme;
  isDark: boolean;
  colors: ThemeColors;
  statusBarStyle: 'light' | 'dark';
};

const lightTheme: AppTheme = {
  id: 'light',
  isDark: false,
  statusBarStyle: 'dark',
  colors: {
    background: '#f2f5fa',
    surface: colors.white,
    surfaceAlt: colors.gray[50],
    card: colors.white,
    border: colors.gray[200],
    borderStrong: colors.gray[300],
    textPrimary: colors.gray[900],
    textSecondary: colors.gray[700],
    textMuted: colors.gray[500],
    icon: colors.gray[600],
    iconMuted: colors.gray[400],
    primary: colors.primary[500],
    primarySoft: colors.primary[50],
    primaryBorder: colors.primary[100],
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    inputBackground: colors.gray[50],
    inputBorder: colors.gray[200],
    tabBarBackground: colors.white,
    tabBarBorder: colors.gray[200],
    tabBarActiveBg: '#E8F0F8',
    tabBarActiveTint: brandColors.navy,
    tabBarInactiveTint: colors.gray[400],
    phoneNavShellBackground: 'rgba(255, 255, 255, 0.86)',
    phoneNavShellBorder: 'rgba(24, 47, 80, 0.12)',
    phoneNavShellBlurTint: 'light',
    phoneNavIndicatorBackground: 'rgba(24, 47, 80, 0.10)',
    phoneNavLabelActive: brandColors.navy,
    phoneNavLabelInactive: colors.gray[500],
    phoneNavIconActive: brandColors.navy,
    phoneNavIconInactive: colors.gray[500],
    systemNavigationBarBackground: '#f2f5fa',
    systemNavigationBarButtonStyle: 'dark',
    overlay: 'rgba(17, 24, 39, 0.45)',
    skeletonBase: colors.gray[200],
    skeletonHighlight: 'rgba(255,255,255,0.4)',
    blurTint: 'light',
  },
};

const darkTheme: AppTheme = {
  id: 'dark',
  isDark: true,
  statusBarStyle: 'light',
  colors: {
    background: '#060c18',
    surface: '#101a2b',
    surfaceAlt: '#152033',
    card: '#101a2b',
    border: '#243247',
    borderStrong: '#334155',
    textPrimary: '#f3f4f6',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    icon: '#dbe4ef',
    iconMuted: '#64748b',
    primary: '#60a5fa',
    primarySoft: 'rgba(96, 165, 250, 0.16)',
    primaryBorder: 'rgba(96, 165, 250, 0.28)',
    success: '#34d399',
    error: '#f87171',
    warning: '#fbbf24',
    inputBackground: '#0b1423',
    inputBorder: '#243247',
    tabBarBackground: '#0b1423',
    tabBarBorder: '#1f2937',
    tabBarActiveBg: 'rgba(103, 182, 223, 0.16)',
    tabBarActiveTint: brandColors.sky,
    tabBarInactiveTint: '#64748b',
    phoneNavShellBackground: 'rgba(11, 20, 35, 0.92)',
    phoneNavShellBorder: 'rgba(255, 255, 255, 0.08)',
    phoneNavShellBlurTint: 'dark',
    phoneNavIndicatorBackground: 'rgba(255, 255, 255, 0.15)',
    phoneNavLabelActive: colors.white,
    phoneNavLabelInactive: '#94a3b8',
    phoneNavIconActive: colors.white,
    phoneNavIconInactive: '#94a3b8',
    systemNavigationBarBackground: '#0b1423',
    systemNavigationBarButtonStyle: 'light',
    overlay: 'rgba(2, 6, 23, 0.72)',
    skeletonBase: '#223042',
    skeletonHighlight: 'rgba(255,255,255,0.12)',
    blurTint: 'dark',
  },
};

export const resolveTheme = (resolvedTheme: ResolvedTheme): AppTheme =>
  resolvedTheme === 'dark' ? darkTheme : lightTheme;

export const buildNavigationTheme = (theme: AppTheme) => ({
  ...(theme.isDark ? NavigationDarkTheme : NavigationDefaultTheme),
  colors: {
    ...(theme.isDark ? NavigationDarkTheme.colors : NavigationDefaultTheme.colors),
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    notification: theme.colors.error,
  },
});

export const getThemePreferenceLabel = (preference: ThemePreference) => {
  switch (preference) {
    case 'system':
      return 'Sistema';
    case 'dark':
      return 'Oscuro';
    default:
      return 'Claro';
  }
};

export const useAppTheme = () => {
  const preference = useThemeStore((state) => state.preference);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isHydrated = useThemeStore((state) => state.isHydrated);
  const setPreference = useThemeStore((state) => state.setPreference);
  const syncWithSystem = useThemeStore((state) => state.syncWithSystem);
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);

  const theme = useMemo(() => resolveTheme(resolvedTheme), [resolvedTheme]);

  return {
    preference,
    resolvedTheme,
    isHydrated,
    setPreference,
    syncWithSystem,
    hydrateTheme,
    theme,
  };
};

export const useThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: AppTheme) => T,
) => {
  const { theme } = useAppTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
};
