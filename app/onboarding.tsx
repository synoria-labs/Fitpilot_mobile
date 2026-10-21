import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button, LoadingSpinner } from '../src/components/common';
import { CalendarDatePickerModal } from '../src/components/calendar/CalendarDatePickerModal';
import {
  OnboardingChoiceChip,
  OnboardingProgressHeader,
  OnboardingStepTransition,
} from '../src/components/onboarding';
import { borderRadius, brandColors, fontSize, spacing } from '../src/constants/colors';
import { onboardingService } from '../src/services/onboarding';
import {
  readPersistentCache,
  removePersistentCache,
  writePersistentCache,
} from '../src/services/persistentCache';
import { useAuthStore } from '../src/store/authStore';
import { useAppTheme, useThemedStyles, type AppTheme } from '../src/theme';
import {
  formatLocalDate,
  getTodayDateKey,
  toLocalDateKey,
} from '../src/utils/date';
import type {
  Allergen,
  Goal,
  Injury,
  InjuryStatus,
  OnboardingGenre,
  OnboardingPayload,
} from '../src/types/onboarding';
import type { ApiError } from '../src/types';

type DatePickerTarget = 'birth' | 'diagnosis' | 'recovery' | null;

type NewInjuryState = {
  name: string;
  body_part: string;
  severity: number;
  status: InjuryStatus;
  limitations: string;
  diagnosis_date: string;
  recovery_date: string;
};

const stepTitles = [
  'Objetivos',
  'Alergias',
  'Datos personales',
  'Medidas',
  'Preferencias',
  'Detalles médicos',
] as const;

const stepHints = [
  'Esto nos ayuda a personalizar tu plan de entrenamiento y nutrición.',
  'Opcional: puedes saltar este paso si no tienes alergias.',
  'Usamos estos datos para calcular tus metas con precisión.',
  'Tu peso y altura actuales afinan las recomendaciones.',
  'Opcional: mejora las sugerencias de comidas.',
  'Opcional: comparte solo lo que consideres relevante.',
] as const;

const emptyInjury: NewInjuryState = {
  name: '',
  body_part: '',
  severity: 1,
  status: 'active',
  limitations: '',
  diagnosis_date: '',
  recovery_date: '',
};

const statusOptions: { value: InjuryStatus; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'recovering', label: 'En recuperación' },
  { value: 'resolved', label: 'Resuelta' },
  { value: 'chronic', label: 'Crónica' },
];

const genreOptions: { value: OnboardingGenre; label: string }[] = [
  { value: 'man', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
];

type OnboardingDraft = {
  activeStep: number;
  selectedGoalId: number | null;
  selectedAllergenIds: number[];
  dateOfBirth: string;
  genre: OnboardingGenre | null;
  weightKg: string;
  heightCm: string;
  likes: string[];
  dislikes: string[];
  medicalConditions: string;
  notes: string;
  injuries: Injury[];
};

const ONBOARDING_DRAFT_VERSION = 1;

// Prefijo distinto a 'fitpilot:cache:' a propósito: el draft debe sobrevivir
// al logout para que el usuario continúe donde lo dejó al volver a entrar.
const getOnboardingDraftKey = (userId: string | number) =>
  `fitpilot:onboarding-draft:${userId}`;

const formatDateLabel = (value: string, fallback: string) =>
  value ? formatLocalDate(value, { day: '2-digit', month: 'long', year: 'numeric' }) : fallback;

const parsePositiveNumber = (value: string) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

// El teclado decimal de iOS muestra coma si el formato numérico del teléfono la usa.
// Antes se borraba: "79,90" llegaba al backend como 7990 kg.
const sanitizeDecimalInput = (value: string) => {
  const [integerPart, ...decimalParts] = value
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
    .split('.');

  if (decimalParts.length === 0) return integerPart;
  return `${integerPart}.${decimalParts.join('').slice(0, 2)}`;
};

const getMeasurementsError = (weightKg: string, heightCm: string) => {
  const weight = parsePositiveNumber(weightKg);
  const height = parsePositiveNumber(heightCm);

  if (!weight || !height) return 'Ingresa peso y altura válidos.';
  if (weight < 20 || weight > 400) {
    return 'Revisa tu peso: escríbelo en kilogramos, entre 20 y 400 (por ejemplo 79.5).';
  }
  if (height < 3) return 'Escribe tu altura en centímetros: 175 en lugar de 1.75.';
  if (height < 100 || height > 250) {
    return 'Revisa tu altura: escríbela en centímetros, entre 100 y 250.';
  }
  return null;
};

export default function OnboardingScreen() {
  const styles = useThemedStyles(createStyles);
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isInitialized, logout, refreshUser, user } = useAuthStore();

  const [activeStep, setActiveStep] = useState(0);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedAllergenIds, setSelectedAllergenIds] = useState<number[]>([]);
  const [allergenSearch, setAllergenSearch] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [genre, setGenre] = useState<OnboardingGenre | null>(null);
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [currentLike, setCurrentLike] = useState('');
  const [currentDislike, setCurrentDislike] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [newInjury, setNewInjury] = useState<NewInjuryState>(emptyInjury);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const shakeX = useSharedValue(0);

  const todayKey = getTodayDateKey();
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const filteredAllergens = useMemo(() => {
    const normalizedSearch = allergenSearch.trim().toLowerCase();
    if (!normalizedSearch) return allergens;

    return allergens.filter((allergen) =>
      allergen.name.toLowerCase().includes(normalizedSearch),
    );
  }, [allergenSearch, allergens]);

  useEffect(() => {
    if (!isInitialized) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (user?.onboardingStatus === 'completed') {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isInitialized, user?.onboardingStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true);
        setLoadError(null);
        const [nextGoals, nextAllergens] = await Promise.all([
          onboardingService.getGoals(),
          onboardingService.getAllergens(),
        ]);

        if (!isMounted) return;

        setGoals(nextGoals);
        setAllergens(nextAllergens);
      } catch (error) {
        if (__DEV__) {
          console.warn('[Onboarding] options load error', error);
        }

        if (isMounted) {
          setLoadError('No pudimos cargar las opciones. Revisa tu conexión e intenta de nuevo.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingOptions(false);
        }
      }
    };

    if (isAuthenticated) {
      void loadOptions();
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const draftSnapshot = useMemo<OnboardingDraft>(
    () => ({
      activeStep,
      selectedGoalId,
      selectedAllergenIds,
      dateOfBirth,
      genre,
      weightKg,
      heightCm,
      likes,
      dislikes,
      medicalConditions,
      notes,
      injuries,
    }),
    [
      activeStep,
      selectedGoalId,
      selectedAllergenIds,
      dateOfBirth,
      genre,
      weightKg,
      heightCm,
      likes,
      dislikes,
      medicalConditions,
      notes,
      injuries,
    ],
  );

  useEffect(() => {
    if (!user?.id || isLoadingOptions || isDraftHydrated) return;

    // Sin opciones cargadas no podemos validar ids del draft; esperar al retry.
    if (goals.length === 0 && allergens.length === 0) return;

    let cancelled = false;

    const hydrateDraft = async () => {
      const draft = await readPersistentCache<OnboardingDraft>(
        getOnboardingDraftKey(user.id),
        ONBOARDING_DRAFT_VERSION,
      );

      if (cancelled) return;

      if (draft) {
        const goalIds = new Set(goals.map((goal) => goal.id));
        const allergenIds = new Set(allergens.map((allergen) => allergen.id));

        setSelectedGoalId(
          draft.selectedGoalId !== null && goalIds.has(draft.selectedGoalId)
            ? draft.selectedGoalId
            : null,
        );
        setSelectedAllergenIds(
          (draft.selectedAllergenIds ?? []).filter((id) => allergenIds.has(id)),
        );
        setDateOfBirth(draft.dateOfBirth ?? '');
        setGenre(draft.genre ?? null);
        setWeightKg(draft.weightKg ?? '');
        setHeightCm(draft.heightCm ?? '');
        setLikes(draft.likes ?? []);
        setDislikes(draft.dislikes ?? []);
        setMedicalConditions(draft.medicalConditions ?? '');
        setNotes(draft.notes ?? '');
        setInjuries(draft.injuries ?? []);
        setActiveStep(
          Math.min(Math.max(draft.activeStep ?? 0, 0), stepTitles.length - 1),
        );
      }

      setIsDraftHydrated(true);
    };

    void hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, [allergens, goals, isDraftHydrated, isLoadingOptions, user?.id]);

  useEffect(() => {
    if (!isDraftHydrated || isSubmitting || !user?.id) return;

    const timer = setTimeout(() => {
      void writePersistentCache(
        getOnboardingDraftKey(user.id),
        ONBOARDING_DRAFT_VERSION,
        draftSnapshot,
      );
    }, 800);

    return () => clearTimeout(timer);
  }, [draftSnapshot, isDraftHydrated, isSubmitting, user?.id]);

  const canContinue = (() => {
    if (activeStep === 0) return Boolean(selectedGoal);
    if (activeStep === 2) return Boolean(dateOfBirth && genre);
    if (activeStep === 3) return getMeasurementsError(weightKg, heightCm) === null;
    return true;
  })();

  const validateCurrentStep = () => {
    if (activeStep === 0 && !selectedGoal) {
      setStepError('Selecciona un objetivo para continuar.');
      triggerShake();
      return false;
    }

    if (activeStep === 2) {
      if (!dateOfBirth) {
        setStepError('La fecha de nacimiento es obligatoria.');
        triggerShake();
        return false;
      }

      if (dateOfBirth > todayKey) {
        setStepError('La fecha de nacimiento no puede ser futura.');
        triggerShake();
        return false;
      }

      if (!genre) {
        setStepError('El sexo es obligatorio.');
        triggerShake();
        return false;
      }
    }

    if (activeStep === 3) {
      const measurementsError = getMeasurementsError(weightKg, heightCm);
      if (measurementsError) {
        setStepError(measurementsError);
        triggerShake();
        return false;
      }
    }

    setStepError(null);
    return true;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;

    if (activeStep === 4) {
      addPreference('like');
      addPreference('dislike');
    }

    if (activeStep < stepTitles.length - 1) {
      setStepDirection(1);
      setActiveStep((currentStep) => currentStep + 1);
      scrollToTop();
      return;
    }

    void submitOnboarding();
  };

  const goBack = () => {
    setStepError(null);
    setStepDirection(-1);
    setActiveStep((currentStep) => Math.max(0, currentStep - 1));
    scrollToTop();
  };

  const handleExit = () => {
    Alert.alert(
      'Salir del onboarding',
      'Tu progreso queda guardado en este dispositivo. Cuando vuelvas a iniciar sesión continuarás donde lo dejaste.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            // Guardado inmediato: el debounce de 800ms podría no haber corrido.
            if (user?.id) {
              void writePersistentCache(
                getOnboardingDraftKey(user.id),
                ONBOARDING_DRAFT_VERSION,
                draftSnapshot,
              );
            }
            void logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  const toggleAllergen = (allergenId: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAllergenIds((currentIds) =>
      currentIds.includes(allergenId)
        ? currentIds.filter((id) => id !== allergenId)
        : [...currentIds, allergenId],
    );
  };

  const addPreference = (kind: 'like' | 'dislike') => {
    const value = (kind === 'like' ? currentLike : currentDislike).trim();
    if (!value) return;

    if (kind === 'like') {
      setLikes((currentValues) =>
        currentValues.includes(value) ? currentValues : [...currentValues, value],
      );
      setCurrentLike('');
      return;
    }

    setDislikes((currentValues) =>
      currentValues.includes(value) ? currentValues : [...currentValues, value],
    );
    setCurrentDislike('');
  };

  const removePreference = (kind: 'like' | 'dislike', value: string) => {
    if (kind === 'like') {
      setLikes((currentValues) => currentValues.filter((item) => item !== value));
      return;
    }

    setDislikes((currentValues) => currentValues.filter((item) => item !== value));
  };

  const addInjury = () => {
    if (!newInjury.name.trim() || !newInjury.body_part.trim()) {
      setStepError('Agrega nombre y parte del cuerpo para registrar la lesion.');
      return;
    }

    setInjuries((currentInjuries) => [
      ...currentInjuries,
      {
        name: newInjury.name.trim(),
        body_part: newInjury.body_part.trim(),
        severity: newInjury.severity,
        status: newInjury.status,
        limitations: newInjury.limitations.trim(),
        diagnosis_date: newInjury.diagnosis_date || null,
        recovery_date: newInjury.recovery_date || null,
      },
    ]);
    setNewInjury(emptyInjury);
    setStepError(null);
  };

  const submitOnboarding = async () => {
    const measurementsError = getMeasurementsError(weightKg, heightCm);
    if (measurementsError) {
      // Un draft guardado por una versión anterior puede traer un peso imposible:
      // volver a Medidas en lugar de mostrar el error crudo del backend.
      setStepDirection(-1);
      setActiveStep(3);
      scrollToTop();
      setStepError(measurementsError);
      return;
    }

    const userId = Number(user?.id);
    const parsedWeight = parsePositiveNumber(weightKg);
    const parsedHeight = parsePositiveNumber(heightCm);

    if (!Number.isFinite(userId) || !dateOfBirth || !genre || !parsedWeight || !parsedHeight) {
      setStepError('Faltan datos requeridos para completar tu onboarding.');
      return;
    }

    const payload: OnboardingPayload = {
      user_id: userId,
      form_version: 'v1',
      date_of_birth: dateOfBirth,
      genre,
      goals: selectedGoal ? [selectedGoal] : [],
      allergens: allergens.filter((allergen) => selectedAllergenIds.includes(allergen.id)),
      metrics: {
        weight_kg: parsedWeight,
        height_cm: parsedHeight,
      },
      preferences: {
        likes,
        dislikes,
      },
      injuries,
      medical_conditions: medicalConditions.trim(),
      notes: notes.trim(),
    };

    try {
      setIsSubmitting(true);
      setStepError(null);
      await onboardingService.submitOnboarding(payload);
      void removePersistentCache(getOnboardingDraftKey(userId));
      const refreshedUser = await refreshUser();

      if (refreshedUser?.onboardingStatus !== 'completed') {
        Alert.alert(
          'Onboarding guardado',
          'Guardamos tus datos, pero aún no pudimos confirmar el estado actualizado. Intenta abrir la app de nuevo.',
        );
        return;
      }

      router.replace('/health-setup');
    } catch (error) {
      const apiError = error as ApiError;
      setStepError(apiError.message || 'No pudimos guardar tu onboarding. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    const dateKey = toLocalDateKey(date);
    if (!dateKey) {
      setDatePickerTarget(null);
      return;
    }

    if (datePickerTarget === 'birth') {
      setDateOfBirth(dateKey);
    } else if (datePickerTarget === 'diagnosis') {
      setNewInjury((currentInjury) => ({ ...currentInjury, diagnosis_date: dateKey }));
    } else if (datePickerTarget === 'recovery') {
      setNewInjury((currentInjury) => ({ ...currentInjury, recovery_date: dateKey }));
    }

    setDatePickerTarget(null);
  };

  const datePickerSelectedDate = (() => {
    if (datePickerTarget === 'birth') return dateOfBirth;
    if (datePickerTarget === 'diagnosis') return newInjury.diagnosis_date;
    if (datePickerTarget === 'recovery') return newInjury.recovery_date;
    return undefined;
  })();

  const datePickerTitle = (() => {
    if (datePickerTarget === 'birth') return 'Fecha de nacimiento';
    if (datePickerTarget === 'diagnosis') return 'Fecha de diagnostico';
    return 'Fecha de recuperación';
  })();

  if (!isInitialized || (isAuthenticated && isLoadingOptions)) {
    return <LoadingSpinner fullScreen text="Preparando onboarding..." />;
  }

  if (loadError) {
    return (
      <View style={styles.centeredState}>
        <Ionicons name="alert-circle-outline" size={36} color={styles.centeredError.color} />
        <Text style={styles.centeredTitle}>No pudimos cargar el onboarding</Text>
        <Text style={styles.centeredError}>{loadError}</Text>
        <Button
          title="Reintentar"
          onPress={() => {
            setLoadError(null);
            setIsLoadingOptions(true);
            void Promise.all([onboardingService.getGoals(), onboardingService.getAllergens()])
              .then(([nextGoals, nextAllergens]) => {
                setGoals(nextGoals);
                setAllergens(nextAllergens);
              })
              .catch(() => {
          setLoadError('No pudimos cargar las opciones. Revisa tu conexión e intenta de nuevo.');
              })
              .finally(() => setIsLoadingOptions(false));
          }}
          style={styles.retryButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerCopy}>
            <Text style={styles.stepLabel}>
              Paso {activeStep + 1} de {stepTitles.length}
            </Text>
            <OnboardingProgressHeader
              stepIndex={activeStep}
              totalSteps={stepTitles.length}
              title={stepTitles[activeStep]}
              theme={theme}
            />
            <Text style={styles.stepHint}>{stepHints[activeStep]}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salir del onboarding"
            onPress={handleExit}
            style={styles.exitButton}
          >
            <Ionicons name="log-out-outline" size={18} color={styles.exitText.color} />
            <Text style={styles.exitText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <OnboardingStepTransition stepKey={activeStep} direction={stepDirection}>
          <Animated.View style={shakeStyle}>
            <View style={styles.card}>
              {activeStep === 0 ? (
                <View>
                  <Text style={styles.cardTitle}>¿Cuál es tu objetivo principal?</Text>
                  <Text style={styles.cardSubtitle}>
                    Selecciona el objetivo que mejor te describe.
                  </Text>
                  <View style={styles.chipGrid}>
                    {goals.map((goal) => (
                      <OnboardingChoiceChip
                        key={goal.id}
                        label={goal.name}
                        isSelected={selectedGoalId === goal.id}
                        onPress={() => {
                          setSelectedGoalId(goal.id);
                          setStepError(null);
                        }}
                        theme={theme}
                      />
                    ))}
                  </View>
                  {selectedGoal?.description ? (
                    <Text style={styles.goalDescription}>{selectedGoal.description}</Text>
                  ) : null}
                </View>
              ) : null}

          {activeStep === 1 ? (
            <View>
              <Text style={styles.cardTitle}>Tienes alergias o intolerancias?</Text>
              <Text style={styles.cardSubtitle}>Puedes elegir varias o continuar sin seleccionar.</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color={styles.searchIcon.color} />
                <TextInput
                  value={allergenSearch}
                  onChangeText={setAllergenSearch}
                  placeholder="Buscar alergias..."
                  placeholderTextColor={styles.searchPlaceholder.color}
                  style={styles.searchInput}
                />
              </View>
              <View style={styles.chipGrid}>
                {filteredAllergens.map((allergen) => (
                  <OnboardingChoiceChip
                    key={allergen.id}
                    label={allergen.name}
                    isSelected={selectedAllergenIds.includes(allergen.id)}
                    onPress={() => toggleAllergen(allergen.id)}
                    theme={theme}
                  />
                ))}
              </View>
              {filteredAllergens.length === 0 ? (
                <Text style={styles.emptyText}>No encontramos resultados.</Text>
              ) : null}
            </View>
          ) : null}

          {activeStep === 2 ? (
            <View>
              <Text style={styles.cardTitle}>Confirma tus datos</Text>
              <Text style={styles.cardSubtitle}>Necesitamos estos datos para personalizar calculos.</Text>

              <Text style={styles.fieldLabel}>Fecha de nacimiento</Text>
              <Pressable
                onPress={() => setDatePickerTarget('birth')}
                style={styles.dateButton}
              >
                <Ionicons name="calendar-outline" size={20} color={brandColors.sky} />
                <Text style={dateOfBirth ? styles.dateButtonText : styles.datePlaceholder}>
                  {formatDateLabel(dateOfBirth, 'Seleccionar fecha')}
                </Text>
              </Pressable>

              <Text style={styles.fieldLabel}>Sexo</Text>
              <View style={styles.segmentRow}>
                {genreOptions.map((option) => {
                  const isSelected = genre === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setGenre(option.value);
                        setStepError(null);
                      }}
                      style={[
                        styles.segmentButton,
                        isSelected ? styles.segmentButtonSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          isSelected ? styles.segmentTextSelected : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {activeStep === 3 ? (
            <View>
              <Text style={styles.cardTitle}>Medidas actuales</Text>
              <Text style={styles.cardSubtitle}>Ingresa peso y altura para ajustar tus metas.</Text>
              <View style={styles.twoColumn}>
                <View style={styles.metricField}>
                  <Text style={styles.fieldLabel}>Peso (kg)</Text>
                  <TextInput
                    value={weightKg}
                    onChangeText={(value) => {
                      setWeightKg(sanitizeDecimalInput(value));
                      setStepError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="78.5"
                    placeholderTextColor={styles.searchPlaceholder.color}
                    style={styles.textField}
                  />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.fieldLabel}>Altura (cm)</Text>
                  <TextInput
                    value={heightCm}
                    onChangeText={(value) => {
                      setHeightCm(sanitizeDecimalInput(value));
                      setStepError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="175"
                    placeholderTextColor={styles.searchPlaceholder.color}
                    style={styles.textField}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {activeStep === 4 ? (
            <View>
              <Text style={styles.cardTitle}>Preferencias de alimentos</Text>
              <Text style={styles.cardSubtitle}>Agrega lo que te gusta y lo que prefieres evitar.</Text>

              <PreferenceEditor
                label="Alimentos que te gustan"
                value={currentLike}
                onChange={setCurrentLike}
                onAdd={() => addPreference('like')}
                items={likes}
                onRemove={(item) => removePreference('like', item)}
                positive
                styles={styles}
              />

              <PreferenceEditor
                label="Alimentos que no te gustan"
                value={currentDislike}
                onChange={setCurrentDislike}
                onAdd={() => addPreference('dislike')}
                items={dislikes}
                onRemove={(item) => removePreference('dislike', item)}
                styles={styles}
              />
            </View>
          ) : null}

          {activeStep === 5 ? (
            <View>
              <Text style={styles.cardTitle}>Historial medico</Text>
              <Text style={styles.cardSubtitle}>Comparte lesiones, cirugias o notas relevantes.</Text>

              <Text style={styles.fieldLabel}>Condiciones medicas</Text>
              <TextInput
                value={medicalConditions}
                onChangeText={setMedicalConditions}
                placeholder="Ej. diabetes, hipertension..."
                placeholderTextColor={styles.searchPlaceholder.color}
                multiline
                style={[styles.textField, styles.multilineField]}
              />

              <View style={styles.injuryBox}>
                <Text style={styles.sectionTitle}>Lesiones / cirugias</Text>
                <TextInput
                  value={newInjury.body_part}
                  onChangeText={(value) =>
                    setNewInjury((currentInjury) => ({ ...currentInjury, body_part: value }))
                  }
                  placeholder="Parte del cuerpo"
                  placeholderTextColor={styles.searchPlaceholder.color}
                  style={styles.textField}
                />
                <TextInput
                  value={newInjury.name}
                  onChangeText={(value) =>
                    setNewInjury((currentInjury) => ({ ...currentInjury, name: value }))
                  }
                  placeholder="Nombre de lesion o cirugia"
                  placeholderTextColor={styles.searchPlaceholder.color}
                  style={styles.textField}
                />

                <Text style={styles.fieldLabel}>Severidad</Text>
                <View style={styles.severityRow}>
                  {[1, 2, 3, 4, 5].map((value) => {
                    const isSelected = newInjury.severity === value;

                    return (
                      <Pressable
                        key={value}
                        onPress={() =>
                          setNewInjury((currentInjury) => ({
                            ...currentInjury,
                            severity: value,
                          }))
                        }
                        style={[
                          styles.severityButton,
                          isSelected ? styles.severityButtonSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.severityText,
                            isSelected ? styles.severityTextSelected : null,
                          ]}
                        >
                          {value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Estado</Text>
                <View style={styles.chipGrid}>
                  {statusOptions.map((option) => (
                    <OnboardingChoiceChip
                      key={option.value}
                      label={option.label}
                      isSelected={newInjury.status === option.value}
                      onPress={() =>
                        setNewInjury((currentInjury) => ({
                          ...currentInjury,
                          status: option.value,
                        }))
                      }
                      compact
                      theme={theme}
                    />
                  ))}
                </View>

                <TextInput
                  value={newInjury.limitations}
                  onChangeText={(value) =>
                    setNewInjury((currentInjury) => ({ ...currentInjury, limitations: value }))
                  }
                  placeholder="Limitaciones"
                  placeholderTextColor={styles.searchPlaceholder.color}
                  style={styles.textField}
                />

                <View style={styles.twoColumn}>
                  <Pressable
                    onPress={() => setDatePickerTarget('diagnosis')}
                    style={[styles.dateButton, styles.metricField]}
                  >
                    <Text style={newInjury.diagnosis_date ? styles.dateButtonText : styles.datePlaceholder}>
                      {formatDateLabel(newInjury.diagnosis_date, 'Diagnostico')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDatePickerTarget('recovery')}
                    style={[styles.dateButton, styles.metricField]}
                  >
                    <Text style={newInjury.recovery_date ? styles.dateButtonText : styles.datePlaceholder}>
                      {formatDateLabel(newInjury.recovery_date, 'Recuperación')}
                    </Text>
                  </Pressable>
                </View>

                <Button
                  title="Agregar lesion"
                  onPress={addInjury}
                  variant="secondary"
                  fullWidth
                  style={styles.addInjuryButton}
                />

                {injuries.map((injury, index) => (
                  <View key={`${injury.name}-${index}`} style={styles.injuryItem}>
                    <View style={styles.injuryItemCopy}>
                      <Text style={styles.injuryItemTitle}>{injury.name}</Text>
                      <Text style={styles.injuryItemSubtitle}>
                        {injury.body_part} - severidad {injury.severity}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setInjuries((currentInjuries) =>
                          currentInjuries.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      style={styles.removeButton}
                    >
                      <Ionicons name="close" size={16} color={styles.removeButtonText.color} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Notas adicionales</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Cualquier otro detalle que debamos saber..."
                placeholderTextColor={styles.searchPlaceholder.color}
                multiline
                style={[styles.textField, styles.multilineField]}
              />
            </View>
          ) : null}
            </View>
          </Animated.View>
        </OnboardingStepTransition>

        {stepError ? (
          <View style={styles.stepErrorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={styles.stepErrorText.color} />
            <Text style={styles.stepErrorText}>{stepError}</Text>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom + spacing.md, spacing.lg) },
        ]}
      >
        {!canContinue && !isSubmitting && activeStep === 0 ? (
          <Text style={styles.footerHint}>Selecciona un objetivo para continuar</Text>
        ) : null}
        {!canContinue && !isSubmitting && activeStep === 2 ? (
          <Text style={styles.footerHint}>Completa fecha de nacimiento y sexo</Text>
        ) : null}
        {!canContinue && !isSubmitting && activeStep === 3 ? (
          <Text style={styles.footerHint}>Ingresa peso y altura válidos</Text>
        ) : null}

        <View style={styles.actions}>
          {activeStep > 0 ? (
            <Button
              title="Atras"
              onPress={goBack}
              variant="ghost"
              size="lg"
              disabled={isSubmitting}
              style={styles.backAction}
            />
          ) : null}
          <Button
            title={activeStep === stepTitles.length - 1 ? 'Completar registro' : 'Siguiente'}
            onPress={goNext}
            size="lg"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            fullWidth={activeStep === 0}
            style={styles.nextAction}
          />
        </View>
      </View>

      <CalendarDatePickerModal
        visible={datePickerTarget !== null}
        title={datePickerTitle}
        selectedDate={datePickerSelectedDate}
        initialVisibleDate={datePickerTarget === 'birth' ? '1995-01-01' : undefined}
        maxDate={datePickerTarget === 'birth' || datePickerTarget === 'diagnosis' ? todayKey : undefined}
        pickerFlow={datePickerTarget === 'birth' ? 'birthdate' : 'default'}
        requireConfirmation={datePickerTarget !== 'birth'}
        onClose={() => setDatePickerTarget(null)}
        onSelect={handleDateSelect}
      />
    </View>
  );
}

type OnboardingStyles = ReturnType<typeof createStyles>;

interface PreferenceEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  items: string[];
  onRemove: (item: string) => void;
  positive?: boolean;
  styles: OnboardingStyles;
}

const PreferenceEditor: React.FC<PreferenceEditorProps> = ({
  label,
  value,
  onChange,
  onAdd,
  items,
  onRemove,
  positive = false,
  styles,
}) => (
  <View style={styles.preferenceBlock}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.preferenceInputRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Agregar alimento"
        placeholderTextColor={styles.searchPlaceholder.color}
        style={[styles.textField, styles.preferenceInput]}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <Pressable onPress={onAdd} style={styles.preferenceAddButton}>
        <Ionicons name="add" size={22} color="#ffffff" />
      </Pressable>
    </View>
    <View style={styles.chipGrid}>
      {items.map((item) => (
        <Pressable
          key={item}
          onPress={() => onRemove(item)}
          style={[styles.preferenceChip, positive ? styles.preferenceChipPositive : null]}
        >
          <Text style={styles.preferenceChipText}>{item}</Text>
          <Ionicons name="close" size={14} color={styles.preferenceChipText.color} />
        </Pressable>
      ))}
    </View>
  </View>
);

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headerCopy: {
      flex: 1,
    },
    stepLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    stepHint: {
      fontSize: fontSize.xs,
      lineHeight: 17,
      color: theme.colors.textMuted,
    },
    exitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: theme.colors.surfaceAlt,
    },
    exitText: {
      color: theme.colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    keyboardAvoiding: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      padding: spacing.lg,
      justifyContent: 'center',
    },
    card: {
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.lg,
    },
    cardTitle: {
      fontSize: fontSize.xl,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    cardSubtitle: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    goalDescription: {
      marginTop: spacing.md,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    choiceChip: {
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    smallChoiceChip: {
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    choiceChipSelected: {
      borderColor: brandColors.sky,
      backgroundColor: brandColors.sky,
    },
    choiceChipText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    choiceChipTextSelected: {
      color: '#ffffff',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    searchIcon: {
      color: theme.colors.iconMuted,
    },
    searchPlaceholder: {
      color: theme.colors.textMuted,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      paddingVertical: spacing.md,
    },
    emptyText: {
      textAlign: 'center',
      color: theme.colors.textMuted,
      marginTop: spacing.lg,
    },
    fieldLabel: {
      marginBottom: spacing.xs,
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    dateButton: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
    },
    dateButtonText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    datePlaceholder: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: fontSize.base,
      fontWeight: '600',
    },
    segmentRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    segmentButton: {
      flex: 1,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    segmentButtonSelected: {
      borderColor: brandColors.sky,
      backgroundColor: brandColors.sky,
    },
    segmentText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    segmentTextSelected: {
      color: '#ffffff',
    },
    twoColumn: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    metricField: {
      flex: 1,
    },
    textField: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
    },
    multilineField: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    preferenceBlock: {
      marginBottom: spacing.lg,
    },
    preferenceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    preferenceInput: {
      flex: 1,
      marginBottom: 0,
    },
    preferenceAddButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: brandColors.sky,
    },
    preferenceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: `${theme.colors.error}14`,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    preferenceChipPositive: {
      backgroundColor: `${theme.colors.success}14`,
    },
    preferenceChipText: {
      color: theme.colors.textSecondary,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    injuryBox: {
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.base,
      fontWeight: '800',
      marginBottom: spacing.md,
    },
    severityRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    severityButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    severityButtonSelected: {
      borderColor: brandColors.sky,
      backgroundColor: brandColors.sky,
    },
    severityText: {
      color: theme.colors.textSecondary,
      fontWeight: '800',
    },
    severityTextSelected: {
      color: '#ffffff',
    },
    addInjuryButton: {
      marginBottom: spacing.md,
    },
    injuryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    injuryItemCopy: {
      flex: 1,
    },
    injuryItemTitle: {
      color: theme.colors.textPrimary,
      fontSize: fontSize.sm,
      fontWeight: '800',
    },
    injuryItemSubtitle: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
    },
    removeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.colors.error}12`,
    },
    removeButtonText: {
      color: theme.colors.error,
    },
    stepErrorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: `${theme.colors.error}12`,
      borderWidth: 1,
      borderColor: `${theme.colors.error}35`,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    stepErrorText: {
      flex: 1,
      color: theme.colors.error,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    footerHint: {
      marginBottom: spacing.sm,
      textAlign: 'center',
      color: theme.colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.md,
    },
    backAction: {
      flexShrink: 0,
      minWidth: 108,
    },
    nextAction: {
      flex: 1,
      minWidth: 0,
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      backgroundColor: theme.colors.background,
    },
    centeredTitle: {
      marginTop: spacing.md,
      color: theme.colors.textPrimary,
      fontSize: fontSize.lg,
      fontWeight: '800',
      textAlign: 'center',
    },
    centeredError: {
      marginTop: spacing.sm,
      color: theme.colors.error,
      fontSize: fontSize.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: spacing.lg,
      alignSelf: 'stretch',
    },
  });
