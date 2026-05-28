import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Button, Input, PhoneInput } from '../src/components/common';
import { TurnstileChallengeModal } from '../src/components/auth/TurnstileChallengeModal';
import { brandColors, borderRadius, fontSize, spacing } from '../src/constants/colors';
import { registrationService } from '../src/services/registration';
import { useAuthStore } from '../src/store/authStore';
import { useThemedStyles, type AppTheme } from '../src/theme';
import type { ApiError } from '../src/types';

type PhoneAvailabilityStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'invalid'
  | 'error';

type RegisterStep = 'details' | 'verify-email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

const createSignupSessionId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = character === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function RegisterScreen() {
  const styles = useThemedStyles(createStyles);
  const { completeSignupSession, isAuthenticated, user } = useAuthStore();

  const [step, setStep] = useState<RegisterStep>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [signupSessionId, setSignupSessionId] = useState(() => createSignupSessionId());
  const [phoneAvailability, setPhoneAvailability] =
    useState<PhoneAvailabilityStatus>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [isCaptchaVisible, setIsCaptchaVisible] = useState(false);
  const [captchaSessionKey, setCaptchaSessionKey] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const normalizedEmail = normalizeEmail(email);
  const isPhoneFormatValid = E164_PHONE_PATTERN.test(phoneNumber);
  const isEmailValid = EMAIL_PATTERN.test(normalizedEmail);
  const isPasswordValid = password.length >= 8;
  const doPasswordsMatch = password === confirmPassword;
  const canSendCode = useMemo(
    () =>
      firstName.trim() !== '' &&
      lastName.trim() !== '' &&
      isEmailValid &&
      isPhoneFormatValid &&
      phoneAvailability === 'available' &&
      isPasswordValid &&
      confirmPassword !== '' &&
      doPasswordsMatch &&
      !isSendingCode,
    [
      confirmPassword,
      doPasswordsMatch,
      firstName,
      isEmailValid,
      isPasswordValid,
      isPhoneFormatValid,
      isSendingCode,
      lastName,
      phoneAvailability,
    ],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    router.replace(user?.onboardingStatus === 'completed' ? '/(tabs)' : '/onboarding');
  }, [isAuthenticated, user?.onboardingStatus]);

  useEffect(() => {
    if (!phoneNumber) {
      setPhoneAvailability('idle');
      return;
    }

    if (!isPhoneFormatValid) {
      setPhoneAvailability('invalid');
      return;
    }

    setPhoneAvailability('checking');

    const timer = setTimeout(() => {
      void registrationService
        .checkPhoneAvailability({ phone_number: phoneNumber })
        .then((response) => {
          setPhoneAvailability(response.isAvailable ? 'available' : 'unavailable');
        })
        .catch(() => {
          setPhoneAvailability('error');
        });
    }, 450);

    return () => clearTimeout(timer);
  }, [isPhoneFormatValid, phoneNumber]);

  useEffect(() => {
    if (!resendAvailableAt) {
      setResendCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const nextCountdown = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );
      setResendCountdown(nextCountdown);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const phoneHelperText = (() => {
    if (!phoneNumber) {
      return 'Usaremos este numero para identificar tu cuenta.';
    }

    if (phoneAvailability === 'checking') return 'Validando disponibilidad...';
    if (phoneAvailability === 'available') return 'Telefono disponible.';
    if (phoneAvailability === 'unavailable') return undefined;
    if (phoneAvailability === 'error') return undefined;
    return undefined;
  })();

  const phoneError = (() => {
    if (!phoneNumber || phoneAvailability === 'idle' || phoneAvailability === 'checking') {
      return undefined;
    }

    if (phoneAvailability === 'invalid') return 'Ingresa un telefono valido.';
    if (phoneAvailability === 'unavailable') return 'Este telefono ya esta registrado.';
    if (phoneAvailability === 'error') return 'No pudimos validar el telefono. Intenta de nuevo.';
    return undefined;
  })();

  const validateForm = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Ingresa tu nombre y apellido.');
      return false;
    }

    if (!isEmailValid) {
      setFormError('Ingresa un correo electronico valido.');
      return false;
    }

    if (!isPhoneFormatValid || phoneAvailability !== 'available') {
      setFormError(phoneError || 'Valida tu telefono antes de continuar.');
      return false;
    }

    if (!isPasswordValid) {
      setFormError('Tu contrasena debe tener al menos 8 caracteres.');
      return false;
    }

    if (!doPasswordsMatch) {
      setFormError('Las contrasenas no coinciden.');
      return false;
    }

    return true;
  };

  const openCaptcha = () => {
    if (!validateForm()) {
      return;
    }

    setFormError(null);
    setCaptchaSessionKey((currentValue) => currentValue + 1);
    setIsCaptchaVisible(true);
  };

  const sendVerificationCode = async (captchaToken: string) => {
    setIsCaptchaVisible(false);
    setIsSendingCode(true);
    setFormError(null);
    setVerificationMessage(null);

    try {
      const response = await registrationService.sendEmailVerification({
        name: firstName.trim(),
        lastname: lastName.trim(),
        email: normalizedEmail,
        password,
        role: 'CLIENT',
        phone_number: phoneNumber,
        signup_session_id: signupSessionId,
        captcha_token: captchaToken,
      });

      setStep('verify-email');
      setVerificationCode('');
      setVerificationMessage(`Te enviamos un codigo a ${normalizedEmail}.`);
      setResendAvailableAt(Date.now() + response.nextCooldownSeconds * 1000);
    } catch (error) {
      const apiError = error as ApiError;
      setFormError(apiError.message || 'No pudimos enviar el codigo. Intenta de nuevo.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyAndCreateAccount = async () => {
    if (verificationCode.trim().length !== 6) {
      setFormError('Ingresa el codigo de 6 digitos.');
      return;
    }

    setIsVerifyingCode(true);
    setFormError(null);
    setVerificationMessage(null);

    try {
      const verification = await registrationService.verifyEmail({
        email: normalizedEmail,
        code: verificationCode.trim(),
        signup_session_id: signupSessionId,
      });

      setIsCreatingAccount(true);

      const signupResponse = await registrationService.signup({
        name: firstName.trim(),
        lastname: lastName.trim(),
        email: normalizedEmail,
        password,
        role: 'CLIENT',
        phone_number: phoneNumber,
        signup_session_id: signupSessionId,
        email_verification_proof: verification.verification_proof,
      });

      const accessToken = signupResponse.access_token || signupResponse.token;
      const refreshToken = signupResponse.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error('La respuesta de registro no incluyo una sesion valida.');
      }

      const authResult = await completeSignupSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (authResult.status !== 'success') {
        throw new Error('No fue posible iniciar sesion despues del registro.');
      }

      router.replace('/onboarding');
    } catch (error) {
      const apiError = error as ApiError;
      setFormError(apiError.message || 'No pudimos crear tu cuenta. Intenta de nuevo.');
    } finally {
      setIsVerifyingCode(false);
      setIsCreatingAccount(false);
    }
  };

  const handleBackToDetails = () => {
    setStep('details');
    setVerificationCode('');
    setVerificationMessage(null);
    setFormError(null);
    setSignupSessionId(createSignupSessionId());
  };

  const handleCaptchaClose = () => {
    setIsCaptchaVisible(false);
    setIsSendingCode(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[brandColors.navy, brandColors.sky]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio de sesion"
          onPress={() => router.replace('/login')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </Pressable>

        <Text style={styles.headerTitle}>Crea tu cuenta</Text>
        <Text style={styles.headerSubtitle}>
          Verifica tu correo y completa tu onboarding personalizado.
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>
            {step === 'details' ? '1 de 2 - Datos de cuenta' : '2 de 2 - Verificacion'}
          </Text>
        </View>

        {formError ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={20} color={styles.errorText.color} />
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}

        {step === 'details' ? (
          <View style={styles.card}>
            <Input
              label="Nombre"
              placeholder="Tu nombre"
              value={firstName}
              onChangeText={(value) => {
                setFirstName(value);
                setFormError(null);
              }}
              autoComplete="given-name"
              icon="person-outline"
              compact
            />

            <Input
              label="Apellido"
              placeholder="Tu apellido"
              value={lastName}
              onChangeText={(value) => {
                setLastName(value);
                setFormError(null);
              }}
              autoComplete="family-name"
              icon="person-outline"
              compact
            />

            <Input
              label="Correo electronico"
              placeholder="tu@email.com"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setFormError(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              icon="mail-outline"
              error={email.trim() && !isEmailValid ? 'Correo invalido.' : undefined}
              compact
            />

            <PhoneInput
              label="Telefono"
              value={phoneNumber}
              onChangeValue={(value) => {
                setPhoneNumber(value);
                setFormError(null);
              }}
              error={phoneError}
              helperText={phoneHelperText}
              compact
            />

            <Input
              label="Contrasena"
              placeholder="Minimo 8 caracteres"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFormError(null);
              }}
              secureTextEntry
              autoComplete="new-password"
              icon="lock-closed-outline"
              error={password && !isPasswordValid ? 'Minimo 8 caracteres.' : undefined}
              compact
            />

            <Input
              label="Confirmar contrasena"
              placeholder="Repite tu contrasena"
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setFormError(null);
              }}
              secureTextEntry
              autoComplete="new-password"
              icon="lock-closed-outline"
              error={
                confirmPassword && !doPasswordsMatch
                  ? 'Las contrasenas no coinciden.'
                  : undefined
              }
              compact
            />

            <Button
              title="Enviar codigo de verificacion"
              onPress={openCaptcha}
              isLoading={isSendingCode}
              disabled={!canSendCode}
              fullWidth
              size="sm"
              style={styles.primaryAction}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.verificationHeader}>
              <View style={styles.verificationIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color={brandColors.sky} />
              </View>
              <View style={styles.verificationCopy}>
                <Text style={styles.cardTitle}>Verifica tu correo</Text>
                <Text style={styles.cardSubtitle}>
                  Captura el codigo de 6 digitos que enviamos a {normalizedEmail}.
                </Text>
              </View>
            </View>

            {verificationMessage ? (
              <View style={styles.successCard}>
                <Ionicons name="checkmark-circle-outline" size={18} color={styles.successText.color} />
                <Text style={styles.successText}>{verificationMessage}</Text>
              </View>
            ) : null}

            <TextInput
              value={verificationCode}
              onChangeText={(value) => {
                setVerificationCode(value.replace(/\D/g, '').slice(0, 6));
                setFormError(null);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={styles.codeInputPlaceholder.color}
              style={styles.codeInput}
            />

            <Button
              title={isCreatingAccount ? 'Creando cuenta...' : 'Crear cuenta'}
              onPress={verifyAndCreateAccount}
              isLoading={isVerifyingCode || isCreatingAccount}
              disabled={verificationCode.trim().length !== 6}
              fullWidth
              style={styles.primaryAction}
            />

            <Pressable
              onPress={openCaptcha}
              disabled={resendCountdown > 0 || isSendingCode}
              style={[
                styles.secondaryAction,
                resendCountdown > 0 || isSendingCode ? styles.secondaryActionDisabled : null,
              ]}
            >
              <Text style={styles.secondaryActionText}>
                {resendCountdown > 0
                  ? `Reenviar codigo en ${resendCountdown}s`
                  : 'Reenviar codigo'}
              </Text>
            </Pressable>

            <Pressable onPress={handleBackToDetails} style={styles.backToDetailsButton}>
              <Text style={styles.backToDetailsText}>Editar datos de cuenta</Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.replace('/login')} style={styles.signInLink}>
          <Text style={styles.signInText}>Ya tengo cuenta</Text>
        </Pressable>
      </ScrollView>

      <TurnstileChallengeModal
        key={captchaSessionKey}
        visible={isCaptchaVisible}
        onClose={handleCaptchaClose}
        onToken={sendVerificationCode}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingTop: Platform.OS === 'ios' ? 58 : 42,
      paddingHorizontal: spacing.md,
      paddingBottom: 20,
      borderBottomLeftRadius: 22,
      borderBottomRightRadius: 22,
    },
    backButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
      marginBottom: spacing.sm,
    },
    headerTitle: {
      fontSize: fontSize['2xl'],
      fontWeight: '800',
      color: '#ffffff',
    },
    headerSubtitle: {
      marginTop: spacing.xs,
      maxWidth: 320,
      fontSize: fontSize.xs,
      lineHeight: 17,
      color: 'rgba(255,255,255,0.86)',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
    },
    stepPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      marginBottom: spacing.sm,
    },
    stepPillText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    card: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
    },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: `${theme.colors.error}35`,
      backgroundColor: `${theme.colors.error}12`,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    errorText: {
      flex: 1,
      color: theme.colors.error,
      fontSize: fontSize.sm,
      lineHeight: 20,
      fontWeight: '600',
    },
    primaryAction: {
      marginTop: spacing.xs,
    },
    verificationHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    verificationIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    verificationCopy: {
      flex: 1,
    },
    cardTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    cardSubtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    successCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: `${theme.colors.success}12`,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    successText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.success,
      fontWeight: '700',
    },
    codeInput: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.textPrimary,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: 10,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
    },
    codeInputPlaceholder: {
      color: theme.colors.textMuted,
    },
    secondaryAction: {
      alignItems: 'center',
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
    },
    secondaryActionDisabled: {
      opacity: 0.55,
    },
    secondaryActionText: {
      color: theme.colors.primary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    backToDetailsButton: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    backToDetailsText: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '600',
    },
    signInLink: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    signInText: {
      color: brandColors.sky,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
  });
