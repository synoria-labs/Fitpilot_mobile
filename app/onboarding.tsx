import React, { useEffect, useMemo, useState } from 'react';
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
import { Button, LoadingSpinner } from '../src/components/common';
import { CalendarDatePickerModal } from '../src/components/calendar/CalendarDatePickerModal';
import { borderRadius, brandColors, fontSize, spacing } from '../src/constants/colors';
import { onboardingService } from '../src/services/onboarding';
import { useAuthStore } from '../src/store/authStore';
import { useThemedStyles, type AppTheme } from '../src/theme';
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
  'Detalles medicos',
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
  { value: 'recovering', label: 'En recuperacion' },
  { value: 'resolved', label: 'Resuelta' },
  { value: 'chronic', label: 'Cronica' },
];

const genreOptions: { value: OnboardingGenre; label: string }[] = [
  { value: 'man', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
];

const formatDateLabel = (value: string, fallback: string) =>
  value ? formatLocalDate(value, { day: '2-digit', month: 'long', year: 'numeric' }) : fallback;

const parsePositiveNumber = (value: string) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

export default function OnboardingScreen() {
  const styles = useThemedStyles(createStyles);
  const { isAuthenticated, isInitialized, logout, refreshUser, user } = useAuthStore();

  const [activeStep, setActiveStep] = useState(0);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const todayKey = getTodayDateKey();
  const progress = (activeStep + 1) / stepTitles.length;
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
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
          setLoadError('No pudimos cargar las opciones. Revisa tu conexion e intenta de nuevo.');
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

  const canContinue = (() => {
    if (activeStep === 0) return Boolean(selectedGoal);
    if (activeStep === 2) return Boolean(dateOfBirth && genre);
    if (activeStep === 3) {
      return Boolean(parsePositiveNumber(weightKg) && parsePositiveNumber(heightCm));
    }
    return true;
  })();

  const validateCurrentStep = () => {
    if (activeStep === 0 && !selectedGoal) {
      setStepError('Selecciona un objetivo para continuar.');
      return false;
    }

    if (activeStep === 2) {
      if (!dateOfBirth) {
        setStepError('La fecha de nacimiento es obligatoria.');
        return false;
      }

      if (dateOfBirth > todayKey) {
        setStepError('La fecha de nacimiento no puede ser futura.');
        return false;
      }

      if (!genre) {
        setStepError('El sexo es obligatorio.');
        return false;
      }
    }

    if (activeStep === 3) {
      if (!parsePositiveNumber(weightKg) || !parsePositiveNumber(heightCm)) {
        setStepError('Ingresa peso y altura validos.');
        return false;
      }
    }

    setStepError(null);
    return true;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;

    if (activeStep < stepTitles.length - 1) {
      setActiveStep((currentStep) => currentStep + 1);
      return;
    }

    void submitOnboarding();
  };

  const goBack = () => {
    setStepError(null);
    setActiveStep((currentStep) => Math.max(0, currentStep - 1));
  };

  const toggleAllergen = (allergenId: number) => {
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
      const refreshedUser = await refreshUser();

      if (refreshedUser?.onboardingStatus !== 'completed') {
        Alert.alert(
          'Onboarding guardado',
          'Guardamos tus datos, pero aun no pudimos confirmar el estado actualizado. Intenta abrir la app de nuevo.',
        );
        return;
      }

      router.replace('/(tabs)');
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
    return 'Fecha de recuperacion';
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
                setLoadError('No pudimos cargar las opciones. Revisa tu conexion e intenta de nuevo.');
              })
              .finally(() => setIsLoadingOptions(false));
          }}
          style={styles.retryButton}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.stepLabel}>
              Paso {activeStep + 1} de {stepTitles.length}
            </Text>
            <Text style={styles.title}>{stepTitles[activeStep]}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salir del onboarding"
            onPress={() => {
              void logout();
              router.replace('/login');
            }}
            style={styles.exitButton}
          >
            <Ionicons name="log-out-outline" size={18} color={styles.exitText.color} />
            <Text style={styles.exitText}>Salir</Text>
          </Pressable>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {activeStep === 0 ? (
            <View>
              <Text style={styles.cardTitle}>Cual es tu objetivo principal?</Text>
              <Text style={styles.cardSubtitle}>Selecciona el objetivo que mejor te describe.</Text>
              <View style={styles.chipGrid}>
                {goals.map((goal) => {
                  const isSelected = selectedGoalId === goal.id;

                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => {
                        setSelectedGoalId(goal.id);
                        setStepError(null);
                      }}
                      style={[styles.choiceChip, isSelected ? styles.choiceChipSelected : null]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          isSelected ? styles.choiceChipTextSelected : null,
                        ]}
                      >
                        {goal.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                {filteredAllergens.map((allergen) => {
                  const isSelected = selectedAllergenIds.includes(allergen.id);

                  return (
                    <Pressable
                      key={allergen.id}
                      onPress={() => toggleAllergen(allergen.id)}
                      style={[styles.choiceChip, isSelected ? styles.choiceChipSelected : null]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          isSelected ? styles.choiceChipTextSelected : null,
                        ]}
                      >
                        {allergen.name}
                      </Text>
                    </Pressable>
                  );
                })}
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
                      setWeightKg(value.replace(/[^0-9.]/g, ''));
                      setStepError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.0"
                    placeholderTextColor={styles.searchPlaceholder.color}
                    style={styles.textField}
                  />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.fieldLabel}>Altura (cm)</Text>
                  <TextInput
                    value={heightCm}
                    onChangeText={(value) => {
                      setHeightCm(value.replace(/[^0-9.]/g, ''));
                      setStepError(null);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
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
                  {statusOptions.map((option) => {
                    const isSelected = newInjury.status === option.value;

                    return (
                      <Pressable
                        key={option.value}
                        onPress={() =>
                          setNewInjury((currentInjury) => ({
                            ...currentInjury,
                            status: option.value,
                          }))
                        }
                        style={[
                          styles.smallChoiceChip,
                          isSelected ? styles.choiceChipSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceChipText,
                            isSelected ? styles.choiceChipTextSelected : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
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
                      {formatDateLabel(newInjury.recovery_date, 'Recuperacion')}
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

        {stepError ? (
          <View style={styles.stepErrorBox}>
            <Text style={styles.stepErrorText}>{stepError}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {activeStep > 0 ? (
            <Button
              title="Atras"
              onPress={goBack}
              variant="ghost"
              disabled={isSubmitting}
              style={styles.backAction}
            />
          ) : null}
          <Button
            title={activeStep === stepTitles.length - 1 ? 'Completar registro' : 'Siguiente'}
            onPress={goNext}
            isLoading={isSubmitting}
            disabled={!canContinue || isSubmitting}
            fullWidth={activeStep === 0}
            style={styles.nextAction}
          />
        </View>
      </ScrollView>

      <CalendarDatePickerModal
        visible={datePickerTarget !== null}
        title={datePickerTitle}
        selectedDate={datePickerSelectedDate}
        initialVisibleDate={datePickerTarget === 'birth' ? '1995-01-01' : undefined}
        maxDate={datePickerTarget === 'birth' || datePickerTarget === 'diagnosis' ? todayKey : undefined}
        onClose={() => setDatePickerTarget(null)}
        onSelect={handleDateSelect}
      />
    </KeyboardAvoidingView>
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
      paddingTop: Platform.OS === 'ios' ? 58 : 38,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    stepLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 2,
      fontSize: fontSize['2xl'],
      fontWeight: '800',
      color: theme.colors.textPrimary,
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
    progressTrack: {
      height: 5,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      marginTop: spacing.md,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: borderRadius.full,
      backgroundColor: brandColors.sky,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
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
      borderRadius: borderRadius.lg,
      backgroundColor: `${theme.colors.error}12`,
      borderWidth: 1,
      borderColor: `${theme.colors.error}35`,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    stepErrorText: {
      color: theme.colors.error,
      fontSize: fontSize.sm,
      fontWeight: '700',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    backAction: {
      minWidth: 100,
    },
    nextAction: {
      flex: 1,
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
