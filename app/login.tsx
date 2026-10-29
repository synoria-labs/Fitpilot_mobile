import React, { useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { AuthBackdrop } from '../src/components/auth/AuthBackdrop';
import { AuthBrand } from '../src/components/auth/AuthBrand';
import { AuthPrimaryButton, AuthSecondaryButton } from '../src/components/auth/AuthButtons';
import { AuthGlassCard } from '../src/components/auth/AuthGlassCard';
import { AuthErrorBanner, AuthInfoNote } from '../src/components/auth/AuthNotice';
import { AuthTextField } from '../src/components/auth/AuthTextField';
import { TurnstileChallengeModal } from '../src/components/auth/TurnstileChallengeModal';
import { clientForgotPasswordUrl } from '../src/constants/support';
import { auroraFont, useAurora } from '../src/theme/aurora';
import { isSmallScreen, isVerySmallScreen } from '../src/utils/responsive';
import type { LoginCredentials } from '../src/types';

const INFO_PARAGRAPHS = [
  'Crea tu cuenta desde la app y completa el onboarding para que podamos personalizar tu experiencia.',
  'Si ya trabajas con un profesional, usa el mismo correo que compartiste con él.',
] as const;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCaptchaVisible, setIsCaptchaVisible] = useState(false);
  const [captchaSessionKey, setCaptchaSessionKey] = useState(0);
  const [pendingCredentials, setPendingCredentials] = useState<LoginCredentials | null>(null);
  const { login, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();
  const aurora = useAurora();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const smallScreen = isSmallScreen(width);
  const verySmallScreen = isVerySmallScreen(width);

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.onboardingStatus !== 'completed') {
        router.replace('/onboarding');
        return;
      }

      router.replace('/');
    }
  }, [isAuthenticated, user?.onboardingStatus]);

  const handleChangeEmail = (value: string) => {
    if (error) {
      clearError();
    }

    setEmail(value);
  };

  const handleChangePassword = (value: string) => {
    if (error) {
      clearError();
    }

    setPassword(value);
  };

  const submitLogin = async (credentials: LoginCredentials) => {
    const normalizedCredentials = {
      email: credentials.email.trim(),
      password: credentials.password,
      captchaToken: credentials.captchaToken,
    };
    const result = await login(normalizedCredentials);

    if (result.status === 'success') {
      setPendingCredentials(null);
      setIsCaptchaVisible(false);
      router.replace('/');
      return;
    }

    if (result.status === 'captcha_required') {
      setPendingCredentials({
        email: normalizedCredentials.email,
        password: normalizedCredentials.password,
      });
      setCaptchaSessionKey((current) => current + 1);
      setIsCaptchaVisible(true);
      return;
    }

    setPendingCredentials(null);
    setIsCaptchaVisible(false);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return;
    }

    await submitLogin({ email, password });
  };

  const handleCaptchaToken = async (token: string) => {
    if (!pendingCredentials) {
      setIsCaptchaVisible(false);
      return;
    }

    setIsCaptchaVisible(false);
    await submitLogin({
      ...pendingCredentials,
      captchaToken: token,
    });
  };

  const handleForgotPassword = async () => {
    if (!clientForgotPasswordUrl) {
      Alert.alert(
        'Enlace no disponible',
        'Todavía no hay una URL configurada para restablecer la contraseña.',
      );
      return;
    }

    try {
      await Linking.openURL(clientForgotPasswordUrl);
    } catch (forgotPasswordError) {
      if (__DEV__) {
        console.warn('[Auth] forgot password link error', forgotPasswordError);
      }

      Alert.alert(
        'No se pudo abrir el enlace',
        'Intenta de nuevo en unos minutos o contacta a soporte.',
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: aurora.ground }]}>
      <AuthBackdrop width={width} height={height} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + (smallScreen ? 16 : 24),
              paddingBottom: Math.max(insets.bottom + 24, 32),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(560)}>
            <AuthBrand compact={verySmallScreen} />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(560).delay(80)} style={styles.cardSlot}>
            <AuthGlassCard>
              <Text accessibilityRole="header" style={[styles.title, { color: aurora.text }]}>
                Bienvenido
              </Text>
              <Text style={[styles.subtitle, { color: aurora.muted }]}>
                Inicia sesión o crea tu cuenta para comenzar tu programa
              </Text>

              {error ? (
                <AuthErrorBanner
                  title="No se pudo iniciar sesión"
                  message={error}
                  style={styles.banner}
                />
              ) : null}

              <AuthTextField
                label="Correo electrónico"
                icon="mail-outline"
                placeholder="tu@email.com"
                value={email}
                onChangeText={handleChangeEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <AuthTextField
                label="Contraseña"
                icon="lock-closed-outline"
                placeholder="Tu contraseña"
                value={password}
                onChangeText={handleChangePassword}
                secureTextEntry
                autoComplete="password"
              />

              <Pressable
                onPress={handleForgotPassword}
                accessibilityRole="link"
                hitSlop={8}
                style={styles.forgotPassword}
              >
                <Text style={[styles.forgotPasswordText, { color: aurora.tones.blue.ink }]}>
                  Olvidé mi contraseña
                </Text>
              </Pressable>

              <AuthPrimaryButton
                title="Iniciar sesión"
                onPress={handleLogin}
                loading={isLoading}
                disabled={!email.trim() || !password.trim()}
                style={styles.loginButton}
              />

              <AuthSecondaryButton
                title="Crear cuenta nueva"
                icon="person-add-outline"
                onPress={() => router.push('/register')}
                style={styles.createAccount}
              />
            </AuthGlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(560).delay(160)} style={styles.noteSlot}>
            <AuthInfoNote title="Empieza en FitPilot" paragraphs={INFO_PARAGRAPHS} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <TurnstileChallengeModal
        key={captchaSessionKey}
        visible={isCaptchaVisible}
        onClose={() => setIsCaptchaVisible(false)}
        onToken={handleCaptchaToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  cardSlot: {
    marginTop: 18,
  },
  title: {
    ...auroraFont('extrabold'),
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...auroraFont('medium'),
    marginTop: 6,
    fontSize: 14.5,
    lineHeight: 22,
  },
  banner: {
    marginTop: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingVertical: 8,
  },
  forgotPasswordText: {
    ...auroraFont('bold'),
    fontSize: 13.5,
  },
  loginButton: {
    marginTop: 6,
  },
  createAccount: {
    marginTop: 10,
  },
  noteSlot: {
    marginTop: 14,
  },
});
