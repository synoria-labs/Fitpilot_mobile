import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, LoadingSpinner } from '../common';
import {
  CALCULATION_METADATA,
  DETAIL_MEASUREMENT_SECTIONS,
  MEASUREMENT_FIELD_LABELS,
} from '../../constants/measurements';
import { borderRadius, fontSize, spacing } from '../../constants/colors';
import type {
  MeasurementCalculationRun,
  MeasurementCalculationValue,
  MeasurementDetail,
  MeasurementWarning,
} from '../../types';
import {
  formatMeasurementDate,
  formatMeasurementNumber,
  getMeasurementDisplayDate,
  parseMeasurementNumber,
} from '../../utils/measurements';
import { convertMeasurementUnitValue } from '../../utils/measurementUnits';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import { useMeasurementPreferenceStore } from '../../store/measurementPreferenceStore';

interface MeasurementDetailModalProps {
  visible: boolean;
  detail: MeasurementDetail | null;
  isLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
}

type DisplayCalculation = {
  code: string;
  label: string;
  shortDescription?: string;
  group: 'main' | 'ideal_weight' | 'special';
  showInPrimarySummary: boolean;
  calculation: MeasurementCalculationValue;
  missingFieldLabels: string[];
  supportText: string | null;
};

type UnavailableCalculation = {
  key: string;
  label: string;
  missingFieldLabels: string[];
};

const IDEAL_WEIGHT_SECTION_LABEL = 'Peso saludable estimado';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getCalculationMetadata = (code: string) =>
  CALCULATION_METADATA[code] ?? {
    label: code.replace(/_/g, ' '),
    patientLabel: code.replace(/_/g, ' '),
    order: 999,
    group: 'special' as const,
    showInPrimarySummary: false,
    shortDescription: undefined,
  };

const getDisplayMeasurement = (
  value: number,
  unit: string | null | undefined,
  preference: ReturnType<typeof useMeasurementPreferenceStore.getState>['preference'],
  decimals?: number,
) => {
  const convertedValue = convertMeasurementUnitValue(value, unit, preference);
  const normalizedUnit = convertedValue.unit?.trim().toLowerCase() ?? null;
  const resolvedDecimals =
    decimals ??
    (normalizedUnit === '%'
      ? 1
      : normalizedUnit === 'kg'
        ? 1
        : normalizedUnit === 'cm2'
          ? 1
          : normalizedUnit === 'kg/m2'
            ? 2
            : convertedValue.unit
              ? 2
              : 3);

  return {
    value: formatMeasurementNumber(convertedValue.value, resolvedDecimals),
    unit: convertedValue.unit,
  };
};

const formatCalculationValue = (
  calculation: MeasurementCalculationValue,
  preference: ReturnType<typeof useMeasurementPreferenceStore.getState>['preference'],
) => {
  if (calculation.value === null) {
    return '--';
  }

  const displayValue = getDisplayMeasurement(
    calculation.value,
    calculation.unit,
    preference,
  );

  return displayValue.unit
    ? `${displayValue.value} ${displayValue.unit}`
    : displayValue.value;
};

const getFieldLabel = (fieldKey: string) => {
  const directLabel = MEASUREMENT_FIELD_LABELS[fieldKey];

  if (directLabel) {
    return directLabel.toLocaleLowerCase('es-MX');
  }

  return fieldKey
    .replace(/_/g, ' ')
    .replace(/\bcm\b|\bkg\b|\bmm\b|\bpct\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-MX');
};

const getUniqueFieldLabels = (fieldKeys: string[]) =>
  Array.from(new Set(fieldKeys.map((fieldKey) => getFieldLabel(fieldKey))));

const getRunStatusPresentation = (
  run: MeasurementCalculationRun | null,
  observationCount: number,
  unavailableCount: number,
  theme: AppTheme,
) => {
  const status = run?.status ?? 'completed';

  if (status === 'failed') {
    return {
      label: 'Requiere revision',
      description:
        'No pudimos completar varias estimaciones para este registro.',
      backgroundColor: `${theme.colors.error}18`,
      textColor: theme.colors.error,
      icon: 'alert-circle-outline' as const,
    };
  }

  if (status === 'partial') {
    return {
      label: 'Con observaciones',
      description:
        observationCount > 0
          ? `Encontramos ${observationCount} observacion${
              observationCount === 1 ? '' : 'es'
            } para revisar.`
          : unavailableCount > 0
            ? 'Algunos indicadores todavia no se pueden estimar con este registro.'
            : 'Tus resultados necesitan una revision breve.',
      backgroundColor: `${theme.colors.warning}18`,
      textColor: theme.colors.warning,
      icon: 'warning-outline' as const,
    };
  }

  if (status === 'running') {
    return {
      label: 'Actualizando',
      description: 'Estamos recalculando esta medicion.',
      backgroundColor: `${theme.colors.primary}18`,
      textColor: theme.colors.primary,
      icon: 'refresh-outline' as const,
    };
  }

  return {
    label: 'Listo',
    description:
      unavailableCount > 0
        ? 'Tus indicadores principales estan listos y algunos extras aun no se pueden estimar.'
        : 'Tus indicadores estan listos para consulta.',
    backgroundColor: `${theme.colors.success}18`,
    textColor: theme.colors.success,
    icon: 'checkmark-circle-outline' as const,
  };
};

const getFrisanchoSupportText = (
  calculation: MeasurementCalculationValue,
  fallback?: string,
) => {
  if (!isRecord(calculation.details)) {
    return fallback ?? null;
  }

  const assessment = calculation.details.assessment;

  if (isRecord(assessment) && typeof assessment.classification === 'string') {
    return assessment.classification;
  }

  return fallback ?? null;
};

const getWarningMessage = (
  warning: MeasurementWarning,
  missingFieldLabels: string[],
) => {
  if (warning.calculation === 'frisancho_indicators') {
    return 'Con las medidas capturadas no se pudo obtener una referencia muscular confiable.';
  }

  if (warning.code === 'calculation_error') {
    return 'Este indicador necesita revision antes de mostrarse con confianza.';
  }

  if (missingFieldLabels.length > 0) {
    return `Para estimarlo falto capturar: ${missingFieldLabels.join(', ')}.`;
  }

  return warning.message;
};

const getDeltaCopy = (
  deltaFromPatient: number | null,
  unit: string,
  preference: ReturnType<typeof useMeasurementPreferenceStore.getState>['preference'],
) => {
  if (deltaFromPatient === null) {
    return null;
  }

  const displayDelta = getDisplayMeasurement(
    Math.abs(deltaFromPatient),
    unit,
    preference,
    1,
  );

  if (deltaFromPatient === 0) {
    return 'Coincide con tu peso actual.';
  }

  return deltaFromPatient > 0
    ? `${displayDelta.value} ${displayDelta.unit} por encima de tu peso actual.`
    : `${displayDelta.value} ${displayDelta.unit} por debajo de tu peso actual.`;
};

export const MeasurementDetailModal: React.FC<MeasurementDetailModalProps> = ({
  visible,
  detail,
  isLoading,
  onClose,
  onEdit,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const measurementPreference = useMeasurementPreferenceStore(
    (state) => state.preference,
  );
  const initializeMeasurementPreference = useMeasurementPreferenceStore(
    (state) => state.initialize,
  );
  const [showIdealWeightFormulas, setShowIdealWeightFormulas] = useState(false);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

  useEffect(() => {
    if (!visible) {
      setShowIdealWeightFormulas(false);
    }
  }, [visible]);

  const displayCalculations = useMemo(() => {
    if (!detail) {
      return [] as DisplayCalculation[];
    }

    return Object.entries(detail.calculations)
      .map(([code, calculation]) => {
        const metadata = getCalculationMetadata(code);
        const missingFieldLabels = getUniqueFieldLabels(
          detail.missingFieldsByCalculation[code] ?? [],
        );

        return {
          code,
          label: metadata.patientLabel,
          shortDescription: metadata.shortDescription,
          group: metadata.group,
          showInPrimarySummary: metadata.showInPrimarySummary,
          calculation,
          missingFieldLabels,
          supportText:
            code === 'frisancho_indicators'
              ? getFrisanchoSupportText(calculation, metadata.shortDescription)
              : metadata.shortDescription ?? null,
        } satisfies DisplayCalculation;
      })
      .sort((leftCalculation, rightCalculation) => {
        const leftOrder = getCalculationMetadata(leftCalculation.code).order;
        const rightOrder = getCalculationMetadata(rightCalculation.code).order;
        return leftOrder - rightOrder;
      });
  }, [detail]);

  const primaryCalculations = useMemo(
    () =>
      displayCalculations.filter(
        (calculation) =>
          calculation.calculation.status === 'computed' &&
          calculation.showInPrimarySummary &&
          calculation.group !== 'ideal_weight',
      ),
    [displayCalculations],
  );

  const unavailableCalculations = useMemo(() => {
    const nextUnavailableCalculations: UnavailableCalculation[] = [];
    const idealWeightMissingFields = new Set<string>();

    displayCalculations.forEach((calculation) => {
      if (calculation.calculation.status !== 'skipped') {
        return;
      }

      if (calculation.group === 'ideal_weight') {
        calculation.missingFieldLabels.forEach((fieldLabel) =>
          idealWeightMissingFields.add(fieldLabel),
        );
        return;
      }

      nextUnavailableCalculations.push({
        key: calculation.code,
        label: calculation.label,
        missingFieldLabels: calculation.missingFieldLabels,
      });
    });

    if (idealWeightMissingFields.size > 0) {
      nextUnavailableCalculations.unshift({
        key: 'ideal_weight',
        label: IDEAL_WEIGHT_SECTION_LABEL,
        missingFieldLabels: Array.from(idealWeightMissingFields),
      });
    }

    return nextUnavailableCalculations;
  }, [displayCalculations]);

  const observationWarnings = useMemo(() => {
    if (!detail) {
      return [];
    }

    return detail.warnings
      .filter((warning) => {
        const calculation = detail.calculations[warning.calculation];
        const missingFields =
          detail.missingFieldsByCalculation[warning.calculation] ?? [];

        return !(
          calculation?.status === 'skipped' &&
          missingFields.length > 0
        );
      })
      .map((warning) => {
        const missingFieldLabels = getUniqueFieldLabels(
          warning.missingFields ?? [],
        );

        return {
          ...warning,
          label: getCalculationMetadata(warning.calculation).patientLabel,
          message: getWarningMessage(warning, missingFieldLabels),
        };
      });
  }, [detail]);

  const idealWeightChart = detail?.charts.idealWeightComparison ?? null;
  const idealWeightEntries = useMemo(
    () =>
      idealWeightChart?.entries.filter((entry) => entry.kind === 'theoretical') ??
      [],
    [idealWeightChart],
  );

  const runPresentation = useMemo(
    () =>
      getRunStatusPresentation(
        detail?.calculationRun ?? null,
        observationWarnings.length,
        unavailableCalculations.length,
        theme,
      ),
    [
      detail?.calculationRun,
      observationWarnings.length,
      unavailableCalculations.length,
      theme,
    ],
  );

  const measurementDate = detail
    ? formatMeasurementDate(getMeasurementDisplayDate(detail.measurement), 'long')
    : 'Detalle de medicion';

  const idealWeightPatientValue =
    idealWeightChart?.patientWeight !== null &&
    idealWeightChart?.patientWeight !== undefined
      ? getDisplayMeasurement(
          idealWeightChart.patientWeight,
          idealWeightChart.unit,
          measurementPreference,
          1,
        )
      : null;

  const idealWeightAverageValue =
    idealWeightChart?.theoreticalWeightAverage !== null &&
    idealWeightChart?.theoreticalWeightAverage !== undefined
      ? getDisplayMeasurement(
          idealWeightChart.theoreticalWeightAverage,
          idealWeightChart.unit,
          measurementPreference,
          1,
        )
      : null;

  const idealWeightRangeValue = useMemo(() => {
    if (!idealWeightChart?.theoreticalWeightRange) {
      return null;
    }

    const minimumValue = getDisplayMeasurement(
      idealWeightChart.theoreticalWeightRange.min,
      idealWeightChart.unit,
      measurementPreference,
      1,
    );
    const maximumValue = getDisplayMeasurement(
      idealWeightChart.theoreticalWeightRange.max,
      idealWeightChart.unit,
      measurementPreference,
      1,
    );

    return {
      value: `${minimumValue.value} - ${maximumValue.value}`,
      unit: minimumValue.unit,
    };
  }, [idealWeightChart, measurementPreference]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Detalle de medicion</Text>
              <Text style={styles.subtitle}>{measurementDate}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close-outline" size={24} color={theme.colors.icon} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <LoadingSpinner text="Cargando detalle..." />
          ) : !detail ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="alert-circle-outline"
                size={40}
                color={theme.colors.iconMuted}
              />
              <Text style={styles.emptyStateText}>
                No fue posible cargar el detalle de esta medicion.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Card style={styles.sectionCard}>
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryHeaderText}>
                    <Text style={styles.sectionTitle}>Resumen de tu medicion</Text>
                    <Text style={styles.sectionDescription}>
                      Registro del {measurementDate}.
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: runPresentation.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      name={runPresentation.icon}
                      size={14}
                      color={runPresentation.textColor}
                    />
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: runPresentation.textColor },
                      ]}
                    >
                      {runPresentation.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.summaryText}>{runPresentation.description}</Text>
                {detail.measurement.notes ? (
                  <View style={styles.noteCard}>
                    <Text style={styles.noteTitle}>Tu anotacion</Text>
                    <Text style={styles.noteText}>{detail.measurement.notes}</Text>
                  </View>
                ) : null}
              </Card>
              {primaryCalculations.length > 0 ? (
                <Card style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Indicadores de tu medicion</Text>
                  <Text style={styles.sectionDescription}>
                    Estimaciones calculadas con tus datos.
                  </Text>
                  <View style={styles.metricGrid}>
                    {primaryCalculations.map((calculation) => (
                      <View key={calculation.code} style={styles.metricCard}>
                        <Text style={styles.metricLabel}>{calculation.label}</Text>
                        <Text style={styles.metricValue}>
                          {formatCalculationValue(
                            calculation.calculation,
                            measurementPreference,
                          )}
                        </Text>
                        {calculation.supportText ? (
                          <Text style={styles.metricHint}>{calculation.supportText}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}

              {idealWeightChart ? (
                <Card style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>{IDEAL_WEIGHT_SECTION_LABEL}</Text>
                  <Text style={styles.sectionDescription}>
                    Tomamos varias referencias para darte un rango orientativo.
                  </Text>

                  <View style={styles.metricGrid}>
                    {idealWeightPatientValue ? (
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Tu peso actual</Text>
                        <Text style={styles.metricValue}>
                          {idealWeightPatientValue.value}
                          {idealWeightPatientValue.unit ? (
                            <Text style={styles.metricUnit}>
                              {' '}
                              {idealWeightPatientValue.unit}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    ) : null}

                    {idealWeightRangeValue ? (
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Rango estimado</Text>
                        <Text style={styles.metricValue}>
                          {idealWeightRangeValue.value}
                          {idealWeightRangeValue.unit ? (
                            <Text style={styles.metricUnit}>
                              {' '}
                              {idealWeightRangeValue.unit}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    ) : null}

                    {idealWeightAverageValue ? (
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Promedio de referencia</Text>
                        <Text style={styles.metricValue}>
                          {idealWeightAverageValue.value}
                          {idealWeightAverageValue.unit ? (
                            <Text style={styles.metricUnit}>
                              {' '}
                              {idealWeightAverageValue.unit}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {idealWeightEntries.length > 0 ? (
                    <View style={styles.formulaSection}>
                      <TouchableOpacity
                        style={styles.expandButton}
                        onPress={() =>
                          setShowIdealWeightFormulas(
                            (currentState) => !currentState,
                          )
                        }
                      >
                        <Text style={styles.expandButtonText}>
                          {showIdealWeightFormulas
                            ? 'Ocultar formulas usadas'
                            : 'Ver formulas usadas'}
                        </Text>
                        <Ionicons
                          name={
                            showIdealWeightFormulas
                              ? 'chevron-up-outline'
                              : 'chevron-down-outline'
                          }
                          size={18}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>

                      {showIdealWeightFormulas ? (
                        <View style={styles.formulaList}>
                          {idealWeightEntries.map((entry) => {
                            const displayValue = getDisplayMeasurement(
                              entry.value,
                              idealWeightChart.unit,
                              measurementPreference,
                              1,
                            );
                            const deltaCopy = getDeltaCopy(
                              entry.deltaFromPatient,
                              idealWeightChart.unit,
                              measurementPreference,
                            );

                            return (
                              <View key={entry.key} style={styles.formulaCard}>
                                <View style={styles.formulaHeader}>
                                  <Text style={styles.formulaLabel}>{entry.label}</Text>
                                  <Text style={styles.formulaValue}>
                                    {displayValue.value}
                                    {displayValue.unit ? (
                                      <Text style={styles.formulaUnit}>
                                        {' '}
                                        {displayValue.unit}
                                      </Text>
                                    ) : null}
                                  </Text>
                                </View>
                                {deltaCopy ? (
                                  <Text style={styles.formulaHint}>{deltaCopy}</Text>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {unavailableCalculations.length > 0 ? (
                <Card style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>No pudimos estimar todavia</Text>
                  <Text style={styles.sectionDescription}>
                    Agrega estas medidas en futuras mediciones para completar mas indicadores.
                  </Text>
                  <View style={styles.unavailableList}>
                    {unavailableCalculations.map((calculation) => (
                      <View key={calculation.key} style={styles.unavailableCard}>
                        <Text style={styles.unavailableTitle}>{calculation.label}</Text>
                        <Text style={styles.unavailableText}>
                          Para estimarlo falto capturar:{' '}
                          {calculation.missingFieldLabels.join(', ')}.
                        </Text>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}

              {observationWarnings.length > 0 ? (
                <Card style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Observaciones</Text>
                  <Text style={styles.sectionDescription}>
                    Estos puntos ayudan a interpretar mejor tu registro.
                  </Text>
                  <View style={styles.warningList}>
                    {observationWarnings.map((warning) => (
                      <View
                        key={`${warning.calculation}-${warning.code}`}
                        style={styles.warningCard}
                      >
                        <Ionicons
                          name="warning-outline"
                          size={18}
                          color={theme.colors.warning}
                          style={styles.warningIcon}
                        />
                        <View style={styles.warningContent}>
                          <Text style={styles.warningTitle}>{warning.label}</Text>
                          <Text style={styles.warningText}>{warning.message}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}

              <View style={styles.measurementSectionIntro}>
                <Text style={styles.sectionTitle}>Medidas registradas</Text>
                <Text style={styles.sectionDescription}>
                  Estas son las medidas guardadas en este registro.
                </Text>
              </View>

              {DETAIL_MEASUREMENT_SECTIONS.map((section) => {
                const rows = section.fields
                  .map((field) => {
                    const value = detail.measurement[field.key];
                    const numericValue = parseMeasurementNumber(value);

                    if (numericValue === null) {
                      return null;
                    }

                    const convertedValue = convertMeasurementUnitValue(
                      numericValue,
                      field.unit,
                      measurementPreference,
                    );

                    return {
                      key: field.key,
                      label: field.label,
                      value: formatMeasurementNumber(
                        convertedValue.value,
                        convertedValue.unit === '%' ? 1 : 1,
                      ),
                      unit: convertedValue.unit ?? undefined,
                    };
                  })
                  .filter(Boolean) as {
                  key: string;
                  label: string;
                  value: string;
                  unit?: string;
                }[];

                if (rows.length === 0) {
                  return null;
                }

                return (
                  <Card key={section.title} style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionDescription}>{section.description}</Text>
                    <View style={styles.rowsContainer}>
                      {rows.map((row) => (
                        <View key={row.key} style={styles.detailRow}>
                          <Text style={styles.detailLabel}>{row.label}</Text>
                          <Text style={styles.detailValue}>
                            {row.value}
                            {row.unit ? (
                              <Text style={styles.detailUnit}> {row.unit}</Text>
                            ) : null}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Button title="Cerrar" onPress={onClose} variant="secondary" />
            <Button title="Editar" onPress={onEdit} disabled={isLoading || !detail} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.md,
    },
    container: {
      width: '100%',
      height: '88%',
      maxWidth: 440,
      maxHeight: 760,
      minHeight: 520,
      backgroundColor: theme.colors.background,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerText: {
      flex: 1,
      paddingRight: spacing.md,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    sectionCard: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    sectionDescription: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    summaryHeaderText: {
      flex: 1,
    },
    summaryText: {
      marginTop: spacing.md,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    noteCard: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    noteTitle: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: theme.colors.primary,
    },
    noteText: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    statusBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    metricCard: {
      width: '48%',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    metricLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    metricValue: {
      marginTop: spacing.xs,
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    metricUnit: {
      fontSize: fontSize.sm,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    metricHint: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    formulaSection: {
      marginTop: spacing.md,
    },
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    expandButtonText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    formulaList: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    formulaCard: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    formulaHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    formulaLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    formulaValue: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    formulaUnit: {
      fontSize: fontSize.sm,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    formulaHint: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    unavailableList: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    unavailableCard: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    unavailableTitle: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    unavailableText: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    warningList: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    warningCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: `${theme.colors.warning}10`,
      borderWidth: 1,
      borderColor: `${theme.colors.warning}40`,
    },
    warningIcon: {
      marginTop: 2,
    },
    warningContent: {
      flex: 1,
    },
    warningTitle: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    warningText: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    measurementSectionIntro: {
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    rowsContainer: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    detailLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
    },
    detailValue: {
      fontSize: fontSize.base,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    detailUnit: {
      fontSize: fontSize.sm,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.md,
    },
    emptyStateText: {
      fontSize: fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
  });
