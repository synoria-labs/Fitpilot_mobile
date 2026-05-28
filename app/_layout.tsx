import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance, View, StyleSheet } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/store/authStore';
import { StartupBrandIntro } from '../src/components/common';
import { buildNavigationTheme, useAppTheme, useThemedStyles } from '../src/theme';
import { useSystemNavigationBarTheme } from '../src/hooks/useSystemNavigationBarTheme';

// Configurar Reanimated logger para suprimir mensajes de strict mode
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { isInitialized, initialize } = useAuthStore();
  const { hydrateTheme, isHydrated, syncWithSystem, theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [showStartupIntro, setShowStartupIntro] = useState(false);
  const [isNativeSplashHidden, setIsNativeSplashHidden] = useState(false);
  const isReady = isInitialized && isHydrated;

  useSystemNavigationBarTheme(theme, isReady && !showStartupIntro);

  useEffect(() => {
    void initialize();
    void hydrateTheme();

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      syncWithSystem(colorScheme);
    });

    return () => {
      subscription.remove();
    };
  }, [hydrateTheme, initialize, syncWithSystem]);

  useEffect(() => {
    if (!isReady || showStartupIntro || isNativeSplashHidden) {
      return;
    }

    setShowStartupIntro(true);
  }, [isNativeSplashHidden, isReady, showStartupIntro]);

  useEffect(() => {
    if (!showStartupIntro || isNativeSplashHidden) {
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync()
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setIsNativeSplashHidden(true);
          }
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isNativeSplashHidden, showStartupIntro]);

  if (!isReady) {
    return null;
  }

  const navigationTheme = buildNavigationTheme(theme);

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
            animation: 'slide_from_right',
          }}
        >
          {/* Tab group - main navigation */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Login screen outside of tabs */}
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="onboarding" />

          <Stack.Screen
            name="profile"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="measurements"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="recipes"
            options={{
              headerShown: false,
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="recommendations/[tipId]"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />

          {/* Workout session as modal over tabs */}
          <Stack.Screen
            name="workout"
            options={{
              headerShown: false,
              presentation: 'card',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="workouts"
            options={{
              headerShown: false,
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
        </Stack>
        {showStartupIntro ? (
          <StartupBrandIntro onComplete={() => setShowStartupIntro(false)} />
        ) : null}
        <StatusBar style={showStartupIntro ? 'light' : theme.statusBarStyle} />
      </View>
    </ThemeProvider>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  });
