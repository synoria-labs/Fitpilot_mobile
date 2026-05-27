import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  FloatingButton,
  LoadingSpinner,
  SegmentedControl,
  TabScreenWrapper,
} from '../../src/components/common';
import {
  GlucoseDetailModal,
  GlucoseFormModal,
} from '../../src/components/health-metrics';
import { ConnectedHealthFeedbackDetail } from '../../src/components/connected-health';
import {
  MeasurementCreateMenuModal,
  MeasurementDetailModal,
  MeasurementFormModal,
} from '../../src/components/measurements';
import {
  CALCULATION_METADATA,
  getMeasurementProgressMetricConfig,
  type MeasurementProgressMetricKey,
  PERIMETER_CARD_FIELDS,
  RECENT_CALCULATION_CODES,
  SUMMARY_METRICS,
} from '../../src/constants/measurements';
import { GLUCOSE_CONTEXT_LABELS } from '../../src/constants/healthMetrics';
import {
  borderRadius,
  fontSize,
  shadows,
  spacing,
} from '../../src/constants/colors';
import {
  useBottomTabBarContentInset,
  useBottomTabBarScroll,
} from '../../src/hooks/useBottomTabBarVisibility';
import { useGlucoseRecords } from '../../src/hooks/useGlucoseRecords';
import {
  createMyMeasurement,
  getMyMeasurementDetail,
  listMyMeasurements,
  updateMyMeasurement,
} from '../../src/services/measurements';
import { useAuthStore } from '../../src/store/authStore';
import {
  MEASUREMENT_PREFERENCE_LABELS,
  useMeasurementPreferenceStore,
} from '../../src/store/measurementPreferenceStore';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../src/theme';
import type {
  ApiError,
  CreateOwnMeasurementPayload,
  MeasurementDetail,
  MeasurementHistoryItem,
  MeasurementPagination,
} from '../../src/types';
import {
  formatGlucoseRecordedAt,
  hasAdditionalHealthMetrics,
} from '../../src/utils/healthMetrics';
import { getPrimaryScreenHorizontalPadding } from '../../src/utils/layout';
import { convertMeasurementUnitValue } from '../../src/utils/measurementUnits';
import {
  calculateMeasurementChange,
  formatMeasurementDate,
  formatMeasurementNumber,
  getMeasurementDisplayDate,
  parseMeasurementNumber,
} from '../../src/utils/measurements';

const HISTORY_PAGE_SIZE = 20;

type MeasurementsTab = 'summary' | 'body' | 'glucose' | 'health';
type MeasurementCreateAction = 'body' | 'glucose';

const MEASUREMENTS_TABS = [
  { key: 'summary', label: 'Resumen' },
  { key: 'body', label: 'Corporal' },
  { key: 'glucose', label: 'Glucosa' },
  { key: 'health', label: 'Salud' },
] satisfies { key: MeasurementsTab; label: string }[];

const CREATE_ACTIONS = [
  {
    key: 'body',
    title: 'Medicion corporal',
    description: 'Peso, composicion, perimetros y observaciones del registro.',
    icon: 'analytics-outline',
  },
  {
    key: 'glucose',
    title: 'Glucosa',
    description: 'Lectura con fecha, hora y contexto clinico.',
    icon: 'water-outline',
  },
] satisfies {
  key: MeasurementCreateAction;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[];

const getChangeAppearance = (
  change: number | null,
  emphasizeDecrease: boolean,
  theme: AppTheme,
) => {
  if (change === null || change === 0) {
    return {
      icon: 'remove-outline' as const,
      color: theme.colors.iconMuted,
    };
  }

  const isPositive = change > 0;
  const isGoodChange = emphasizeDecrease ? !isPositive : isPositive;

  return {
    icon: isPositive
      ? ('arrow-up-outline' as const)
      : ('arrow-down-outline' as const),
    color: isGoodChange ? theme.colors.success : theme.colors.warning,
  };
};

export default function MeasurementsScreen() {
  const { width, height } = useWindowDimensions();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);
  const isFocused = useIsFocused();
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const scrollViewRef = useRef<ScrollView>(null);
  const tabBarScroll = useBottomTabBarScroll();
  const contentInsetBottom = useBottomTabBarContentInset(72);
  const user = useAuthStore((state) => state.user);
  const measurementPreference = useMeasurementPreferenceStore(
    (state) => state.preference,
  );
  const initializeMeasurementPreference = useMeasurementPreferenceStore(
    (state) => state.initialize,
  );
  const wasFocusedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<MeasurementsTab>('summary');
  const [measurements, setMeasurements] = useState<MeasurementHistoryItem[]>([]);
  const [pagination, setPagination] = useState<MeasurementPagination | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, MeasurementDetail>>(
    {},
  );
  const [hasLoadedMeasurements, setHasLoadedMeasurements] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    null,
  );
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateMenuVisible, setIsCreateMenuVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    records: glucoseRecords,
    pagination: glucosePagination,
    latestRecord: latestGlucoseRecord,
    latestError: glucoseLatestError,
    historyError: glucoseHistoryError,
    hasLoadedHistory: hasLoadedGlucoseHistory,
    isLoadingLatest: isLoadingLatestGlucose,
    isLoadingHistory: isLoadingGlucoseHistory,
    isLoadingMore: isLoadingMoreGlucose,
    isDetailVisible: isGlucoseDetailVisible,
    selectedRecord: selectedGlucoseRecord,
    isDetailLoading: isGlucoseDetailLoading,
    isFormVisible: isGlucoseFormVisible,
    editingRecord: editingGlucoseRecord,
    isSubmitting: isSubmittingGlucose,
    isDeleting: isDeletingGlucose,
    loadLatestPreview: loadLatestGlucosePreview,
    ensureHistoryLoaded: ensureGlucoseHistoryLoaded,
    refreshData: refreshGlucoseData,
    loadMore: loadMoreGlucose,
    openDetail: openGlucoseDetailRecord,
    closeDetail: closeGlucoseDetail,
    openCreateForm: openCreateGlucoseForm,
    openEditForm: openEditGlucoseForm,
    closeForm: closeGlucoseForm,
    submitRecord: submitGlucoseRecord,
    deleteSelectedRecord: deleteSelectedGlucoseRecord,
    resetUi: resetGlucoseUi,
  } = useGlucoseRecords(HISTORY_PAGE_SIZE);

  const latestMeasurement = measurements[0] ?? null;
  const latestMeasurementDetail = latestMeasurement
    ? detailCache[latestMeasurement.id] ?? null
    : null;
  const selectedMeasurementDetail = selectedMeasurementId
    ? detailCache[selectedMeasurementId] ?? null
    : null;
  const selectedMeasurement = selectedMeasurementId
    ? selectedMeasurementDetail?.measurement ??
      measurements.find((measurement) => measurement.id === selectedMeasurementId) ??
      null
    : null;
  const editingMeasurement = editingMeasurementId
    ? detailCache[editingMeasurementId]?.measurement ??
      measurements.find((measurement) => measurement.id === editingMeasurementId) ??
      null
    : null;
  const defaultHeightCm = useMemo(() => {
    const latestMeasurementWithHeight = measurements.find(
      (measurement) => parseMeasurementNumber(measurement.height_cm) !== null,
    );
    const heightValue = latestMeasurementWithHeight?.height_cm;

    if (heightValue === null || heightValue === undefined) {
      return null;
    }

    return String(heightValue);
  }, [measurements]);

  const loadMeasurements = useCallback(
    async ({ page = 1, append = false }: { page?: number; append?: boolean } = {}) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setError(null);
      }

      try {
        const response = await listMyMeasurements(page, HISTORY_PAGE_SIZE);

        setMeasurements((currentMeasurements) =>
          append ? [...currentMeasurements, ...response.data] : response.data,
        );
        setPagination(response.pagination);

        if (!append) {
          const latest = response.data[0];
          setDetailCache({});

          if (latest) {
            const detail = await getMyMeasurementDetail(latest.id);
            setDetailCache({ [latest.id]: detail });
          }
        }
      } catch (loadError) {
        const apiError = loadError as ApiError;
        setError(apiError.message || 'No fue posible cargar tus medidas.');
      } finally {
        setHasLoadedMeasurements(true);
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadMeasurements();
  }, [loadMeasurements]);

  useEffect(() => {
    void initializeMeasurementPreference();
  }, [initializeMeasurementPreference]);

  useEffect(() => {
    if (!isFocused) {
      wasFocusedRef.current = false;
      setIsDetailVisible(false);
      setSelectedMeasurementId(null);
      setIsDetailLoading(false);
      setIsFormVisible(false);
      setEditingMeasurementId(null);
      setIsCreateMenuVisible(false);
      resetGlucoseUi();
      return;
    }

    void loadLatestGlucosePreview();
  }, [isFocused, loadLatestGlucosePreview, resetGlucoseUi]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const didRegainFocus = !wasFocusedRef.current;
    wasFocusedRef.current = true;

    if (didRegainFocus && ((!hasLoadedMeasurements && !isLoading) || error)) {
      setIsLoading(true);
      void loadMeasurements();
    }
  }, [
    error,
    isFocused,
    isLoading,
    loadMeasurements,
    hasLoadedMeasurements,
  ]);

  useEffect(() => {
    if (!isFocused || activeTab !== 'glucose') {
      return;
    }

    void ensureGlucoseHistoryLoaded();
  }, [activeTab, ensureGlucoseHistoryLoaded, isFocused]);

  const summaryMetrics = useMemo(() => {
    if (!latestMeasurement) {
      return [];
    }

    return SUMMARY_METRICS.map((metric) => ({
      ...metric,
      value: parseMeasurementNumber(latestMeasurement[metric.key]),
      change: calculateMeasurementChange(measurements, metric.key),
    }));
  }, [latestMeasurement, measurements]);

  const visibleSummaryMetrics = useMemo(
    () => summaryMetrics.filter((metric) => metric.value !== null),
    [summaryMetrics],
  );

  const perimeterCards = useMemo(() => {
    if (!latestMeasurement) {
      return [];
    }

    return PERIMETER_CARD_FIELDS.map((field) => ({
      ...field,
      value: parseMeasurementNumber(latestMeasurement[field.key]),
    })).filter((field) => field.value !== null);
  }, [latestMeasurement]);

  const recentCalculations = useMemo(() => {
    if (!latestMeasurementDetail) {
      return [];
    }

    return RECENT_CALCULATION_CODES.map((code) => {
      const calculation = latestMeasurementDetail.calculations[code];

      if (!calculation || calculation.status !== 'computed' || calculation.value === null) {
        return null;
      }

      return {
        code,
        label: CALCULATION_METADATA[code]?.label ?? code,
        value: calculation.value,
        unit: calculation.unit,
      };
    }).filter(Boolean) as {
      code: string;
      label: string;
      value: number;
      unit: string | null;
    }[];
  }, [latestMeasurementDetail]);

  const previewCalculations = recentCalculations.slice(0, 3);
  const summaryGlucoseRecord = latestGlucoseRecord;
  const summaryGlucoseContextLabel = summaryGlucoseRecord?.glucose_context
    ? GLUCOSE_CONTEXT_LABELS[summaryGlucoseRecord.glucose_context]
    : null;
  const summaryGlucoseIsMixed = hasAdditionalHealthMetrics(summaryGlucoseRecord);

  const getDisplayMeasurement = useCallback(
    (value: unknown, unit?: string | null, decimals = 1) => {
      const numericValue = parseMeasurementNumber(value);

      if (numericValue === null) {
        return {
          value: '--',
          unit: unit?.trim() ?? null,
        };
      }

      const convertedValue = convertMeasurementUnitValue(
        numericValue,
        unit,
        measurementPreference,
      );

      return {
        value: formatMeasurementNumber(
          convertedValue.value,
          convertedValue.unit === '%' ? 1 : decimals,
        ),
        unit: convertedValue.unit,
      };
    },
    [measurementPreference],
  );

  const closeMeasurementDetail = useCallback(() => {
    setIsDetailVisible(false);
    setSelectedMeasurementId(null);
    setIsDetailLoading(false);
  }, []);

  const openCreateMeasurementForm = useCallback(() => {
    setEditingMeasurementId(null);
    setIsFormVisible(true);
  }, []);

  const closeMeasurementForm = useCallback(() => {
    setIsFormVisible(false);
    setEditingMeasurementId(null);
  }, []);

  const isMeasurementEditable = useCallback(
    (measurement: MeasurementHistoryItem | null) => {
      if (!measurement) {
        return false;
      }

      const authenticatedUserId = Number(user?.id);

      return (
        Number.isFinite(authenticatedUserId) &&
        measurement.recorded_by_user_id === authenticatedUserId
      );
    },
    [user?.id],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([loadMeasurements(), refreshGlucoseData()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadMeasurements, refreshGlucoseData]);

  const handleLoadMore = useCallback(async () => {
    if (!pagination || measurements.length >= pagination.total || isLoadingMore) {
      return;
    }

    await loadMeasurements({
      page: pagination.page + 1,
      append: true,
    });
  }, [isLoadingMore, loadMeasurements, measurements.length, pagination]);

  const handleOpenMeasurementProgress = useCallback(
    (metricKey: MeasurementProgressMetricKey) => {
      router.push({
        pathname: '/measurements/progress/[metric]',
        params: { metric: metricKey },
      });
    },
    [],
  );

  const openMeasurementDetail = useCallback(
    async (measurementId: string) => {
      setSelectedMeasurementId(measurementId);
      setIsDetailVisible(true);

      if (detailCache[measurementId]) {
        return;
      }

      setIsDetailLoading(true);

      try {
        const detail = await getMyMeasurementDetail(measurementId);
        setDetailCache((currentCache) => ({
          ...currentCache,
          [measurementId]: detail,
        }));
      } catch (detailError) {
        const apiError = detailError as ApiError;
        closeMeasurementDetail();
        Alert.alert('Error', apiError.message || 'No fue posible cargar el detalle.');
      } finally {
        setIsDetailLoading(false);
      }
    },
    [closeMeasurementDetail, detailCache],
  );

  const handleEditMeasurement = useCallback(() => {
    if (!selectedMeasurement) {
      return;
    }

    if (!isMeasurementEditable(selectedMeasurement)) {
      Alert.alert(
        'Edicion no disponible',
        'Solo puedes editar mediciones registradas por ti desde la app.',
      );
      return;
    }

    setEditingMeasurementId(selectedMeasurement.id);
    closeMeasurementDetail();
    setIsFormVisible(true);
  }, [closeMeasurementDetail, isMeasurementEditable, selectedMeasurement]);

  const handleSubmitMeasurement = useCallback(
    async (payload: CreateOwnMeasurementPayload) => {
      setIsSubmitting(true);

      try {
        const savedMeasurement = editingMeasurementId
          ? await updateMyMeasurement(editingMeasurementId, payload)
          : await createMyMeasurement(payload);

        closeMeasurementDetail();
        closeMeasurementForm();
        await loadMeasurements();
        setDetailCache((currentCache) => ({
          ...currentCache,
          [savedMeasurement.measurement.id]: savedMeasurement,
        }));
        Alert.alert(
          editingMeasurementId ? 'Medicion actualizada' : 'Medicion registrada',
          editingMeasurementId
            ? 'Tus cambios se guardaron correctamente.'
            : 'Tus medidas se actualizaron correctamente.',
        );
      } catch (saveError) {
        const apiError = saveError as ApiError;
        Alert.alert('Error', apiError.message || 'No fue posible guardar la medicion.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [closeMeasurementDetail, closeMeasurementForm, editingMeasurementId, loadMeasurements],
  );

  const handleTabChange = useCallback(
    (nextTab: MeasurementsTab) => {
      setActiveTab(nextTab);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });

      if (nextTab === 'glucose') {
        void ensureGlucoseHistoryLoaded();
      }
    },
    [ensureGlucoseHistoryLoaded],
  );

  const handleSelectCreateAction = useCallback(
    (action: MeasurementCreateAction) => {
      setIsCreateMenuVisible(false);

      if (action === 'body') {
        openCreateMeasurementForm();
        return;
      }

      openCreateGlucoseForm();
    },
    [openCreateGlucoseForm, openCreateMeasurementForm],
  );

  const handleOpenGlucoseDetail = useCallback(
    async (recordId: string) => {
      try {
        await openGlucoseDetailRecord(recordId);
      } catch (detailError) {
        const message =
          detailError instanceof Error
            ? detailError.message
            : 'No fue posible cargar el detalle.';

        Alert.alert('Error', message);
      }
    },
    [openGlucoseDetailRecord],
  );

  const handleSubmitGlucose = useCallback(
    async (payload: Parameters<typeof submitGlucoseRecord>[0]) => {
      try {
        const result = await submitGlucoseRecord(payload);

        Alert.alert(
          result.mode === 'updated' ? 'Glucosa actualizada' : 'Glucosa registrada',
          result.mode === 'updated'
            ? 'Tu lectura se actualizo correctamente.'
            : 'Tu lectura se guardo correctamente.',
        );
      } catch (saveError) {
        const apiError = saveError as ApiError;
        Alert.alert(
          'Error',
          apiError.message || 'No fue posible guardar la glucosa.',
        );
      }
    },
    [submitGlucoseRecord],
  );

  const confirmDeleteGlucose = useCallback(async () => {
    try {
      const wasDeleted = await deleteSelectedGlucoseRecord();

      if (wasDeleted) {
        Alert.alert('Registro eliminado', 'La lectura se elimino correctamente.');
      }
    } catch (deleteError) {
      const apiError = deleteError as ApiError;
      Alert.alert(
        'Error',
        apiError.message || 'No fue posible eliminar la lectura.',
      );
    }
  }, [deleteSelectedGlucoseRecord]);

  const handleDeleteGlucose = useCallback(() => {
    if (!selectedGlucoseRecord) {
      return;
    }

    if (hasAdditionalHealthMetrics(selectedGlucoseRecord)) {
      Alert.alert(
        'Eliminacion no disponible',
        'Este registro tambien incluye otras metricas clinicas y no puede eliminarse desde la app.',
      );
      return;
    }

    Alert.alert(
      'Eliminar registro',
      'Esta accion eliminara tu lectura de glucosa.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void confirmDeleteGlucose();
          },
        },
      ],
    );
  }, [confirmDeleteGlucose, selectedGlucoseRecord]);

  const measurementErrorCard = error ? (
    <Card style={styles.errorCard}>
      <Text style={styles.errorTitle}>No fue posible cargar tus medidas</Text>
      <Text style={styles.errorText}>{error}</Text>
      <Button title="Reintentar" onPress={() => void loadMeasurements()} />
    </Card>
  ) : null;

  const glucoseErrorCard = glucoseHistoryError ? (
    <Card style={styles.errorCard}>
      <Text style={styles.errorTitle}>No fue posible cargar tus glucosas</Text>
      <Text style={styles.errorText}>{glucoseHistoryError}</Text>
      <Button
        title="Reintentar"
        onPress={() =>
          void (hasLoadedGlucoseHistory
            ? refreshGlucoseData()
            : ensureGlucoseHistoryLoaded())
        }
      />
    </Card>
  ) : null;

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Cargando tus medidas..." />;
  }

  return (
    <TabScreenWrapper>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Medidas</Text>
            <Text style={styles.subtitle}>
              Organiza tu seguimiento corporal y glucemico por tipo de registro.
            </Text>
            <Text style={styles.preferenceText}>
              Unidades: {MEASUREMENT_PREFERENCE_LABELS[measurementPreference]}
            </Text>
          </View>
        </View>

        <View style={[styles.tabsWrap, { paddingHorizontal: horizontalPadding }]}>
          <SegmentedControl
            options={MEASUREMENTS_TABS}
            value={activeTab}
            onChange={handleTabChange}
          />
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding, paddingBottom: contentInsetBottom },
          ]}
          onScroll={tabBarScroll.onScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          scrollEventThrottle={tabBarScroll.scrollEventThrottle}
        >
          {activeTab === 'summary' ? (
            <>
              <Card style={styles.summaryIntroCard}>
                <Text style={styles.summaryIntroEyebrow}>Vista general</Text>
                <Text style={styles.summaryIntroTitle}>
                  Todo tu seguimiento, mejor organizado
                </Text>
                <Text style={styles.summaryIntroText}>
                  Revisa lo mas reciente y entra al detalle corporal o glucemico
                  solo cuando lo necesites.
                </Text>
              </Card>

              {measurementErrorCard}

              <Card style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                  <View style={styles.overviewHeaderCopy}>
                    <Text style={styles.overviewEyebrow}>Corporal</Text>
                    <Text style={styles.overviewTitle}>
                      Ultimo registro antropometrico
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.overviewActionPill}
                    activeOpacity={0.88}
                    onPress={() => handleTabChange('body')}
                  >
                    <Text style={styles.overviewActionText}>Ver corporal</Text>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={14}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {latestMeasurement ? (
                  <>
                    <Text style={styles.overviewMeta}>
                      Actualizado el{' '}
                      {formatMeasurementDate(
                        getMeasurementDisplayDate(latestMeasurement),
                        'long',
                      )}
                    </Text>
                    <View style={styles.overviewMetricGrid}>
                      {visibleSummaryMetrics.slice(0, 3).map((metric) => {
                        const displayValue = getDisplayMeasurement(
                          metric.value,
                          metric.unit,
                          metric.unit === '%' ? 1 : 1,
                        );

                        return (
                          <View key={metric.key} style={styles.overviewMetricCard}>
                            <Text style={styles.overviewMetricLabel}>{metric.label}</Text>
                            <Text style={styles.overviewMetricValue}>
                              {displayValue.value}
                              {displayValue.unit ? (
                                <Text style={styles.overviewMetricUnit}>
                                  {' '}
                                  {displayValue.unit}
                                </Text>
                              ) : null}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      style={styles.inlineAction}
                      activeOpacity={0.88}
                      onPress={openCreateMeasurementForm}
                    >
                      <Ionicons
                        name="add-outline"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.inlineActionText}>
                        Registrar nueva medicion corporal
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.overviewEmptyText}>
                      Aun no tienes mediciones corporales registradas.
                    </Text>
                    <TouchableOpacity
                      style={styles.inlineAction}
                      activeOpacity={0.88}
                      onPress={openCreateMeasurementForm}
                    >
                      <Ionicons
                        name="add-outline"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.inlineActionText}>
                        Registrar mi primera medicion
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </Card>

              {previewCalculations.length > 0 ? (
                <Card style={styles.overviewCard}>
                  <View style={styles.overviewHeader}>
                    <View style={styles.overviewHeaderCopy}>
                      <Text style={styles.overviewEyebrow}>Indicadores</Text>
                      <Text style={styles.overviewTitle}>Calculos recientes</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.overviewActionPill}
                      activeOpacity={0.88}
                      onPress={() => handleTabChange('body')}
                    >
                      <Text style={styles.overviewActionText}>Ver detalle</Text>
                      <Ionicons
                        name="chevron-forward-outline"
                        size={14}
                        color={theme.colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.overviewMetricGrid}>
                    {previewCalculations.map((calculation) => {
                      const displayValue = getDisplayMeasurement(
                        calculation.value,
                        calculation.unit,
                        calculation.unit ? 2 : 3,
                      );

                      return (
                        <View key={calculation.code} style={styles.overviewMetricCard}>
                          <Text style={styles.overviewMetricLabel}>
                            {calculation.label}
                          </Text>
                          <Text style={styles.overviewMetricValue}>
                            {displayValue.value}
                            {displayValue.unit ? (
                              <Text style={styles.overviewMetricUnit}>
                                {' '}
                                {displayValue.unit}
                              </Text>
                            ) : null}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              ) : null}

              <Card style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                  <View style={styles.overviewHeaderCopy}>
                    <Text style={styles.overviewEyebrow}>Glucosa</Text>
                    <Text style={styles.overviewTitle}>
                      Seguimiento glucemico reciente
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.overviewActionPill}
                    activeOpacity={0.88}
                    onPress={() => handleTabChange('glucose')}
                  >
                    <Text style={styles.overviewActionText}>Ver glucosa</Text>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={14}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {isLoadingLatestGlucose && !summaryGlucoseRecord ? (
                  <Text style={styles.loadingLabel}>Cargando ultima lectura...</Text>
                ) : summaryGlucoseRecord ? (
                  <>
                    <Text style={styles.glucoseSummaryValue}>
                      {formatMeasurementNumber(summaryGlucoseRecord.glucose_mg_dl, 0)}
                      <Text style={styles.glucoseSummaryUnit}> mg/dL</Text>
                    </Text>
                    <Text style={styles.overviewMeta}>
                      {summaryGlucoseContextLabel ?? 'Sin contexto'} -{' '}
                      {formatGlucoseRecordedAt(summaryGlucoseRecord.recorded_at, 'short')}
                    </Text>
                    <Text style={styles.overviewHint}>
                      {summaryGlucoseIsMixed
                        ? 'Este registro incluye otras metricas clinicas y ya esta visible para tu nutriologo.'
                        : 'Tu lectura mas reciente ya esta lista para seguimiento nutricional.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.inlineAction}
                      activeOpacity={0.88}
                      onPress={openCreateGlucoseForm}
                    >
                      <Ionicons
                        name="add-outline"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.inlineActionText}>
                        Registrar nueva glucosa
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.overviewEmptyText}>
                      {glucoseLatestError ??
                        'Aun no tienes glucosas registradas en tu seguimiento.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.inlineAction}
                      activeOpacity={0.88}
                      onPress={openCreateGlucoseForm}
                    >
                      <Ionicons
                        name="add-outline"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.inlineActionText}>
                        Registrar mi primera glucosa
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </Card>
            </>
          ) : null}

          {activeTab === 'health' ? <ConnectedHealthFeedbackDetail /> : null}

          {activeTab === 'body' ? (
            <>
              {measurementErrorCard}

              {!error && !latestMeasurement ? (
                <Card style={styles.emptyCard}>
                  <Ionicons
                    name="analytics-outline"
                    size={44}
                    color={theme.colors.iconMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    Todavia no tienes mediciones registradas
                  </Text>
                  <Text style={styles.emptyText}>
                    Captura tu primer registro para empezar a ver peso,
                    composicion y perimetros.
                  </Text>
                  <Button
                    title="Registrar mi primera medicion"
                    onPress={openCreateMeasurementForm}
                    icon={<Ionicons name="add-outline" size={18} color="#ffffff" />}
                  />
                </Card>
              ) : null}

              {latestMeasurement ? (
                <>
                  <View style={styles.mainStatsContainer}>
                    {summaryMetrics.map((metric, index) => {
                      const progressConfig = getMeasurementProgressMetricConfig(metric.key);
                      const appearance = getChangeAppearance(
                        metric.change,
                        metric.emphasizeDecrease ?? false,
                        theme,
                      );
                      const displayValue = getDisplayMeasurement(
                        metric.value,
                        metric.unit,
                        metric.unit === '%' ? 1 : 1,
                      );
                      const displayChange =
                        metric.change === null
                          ? null
                          : getDisplayMeasurement(Math.abs(metric.change), metric.unit, 2);

                      const content = (
                        <>
                          <View style={styles.summaryCardHeader}>
                            <View style={styles.summaryIcon}>
                              <Ionicons
                                name={metric.icon as keyof typeof Ionicons.glyphMap}
                                size={20}
                                color={theme.colors.primary}
                              />
                            </View>
                            {progressConfig ? (
                              <View style={styles.metricActionPill}>
                                <Ionicons
                                  name="analytics-outline"
                                  size={12}
                                  color={theme.colors.primary}
                                />
                                <Text style={styles.metricActionText}>Ver grafica</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.summaryLabel}>{metric.label}</Text>
                          <Text style={styles.summaryValue}>
                            {displayValue.value}
                            {metric.value !== null && displayValue.unit ? (
                              <Text style={styles.summaryUnit}>
                                {' '}
                                {displayValue.unit}
                              </Text>
                            ) : null}
                          </Text>
                          {metric.change !== null ? (
                            <View
                              style={[
                                styles.changeBadge,
                                { backgroundColor: `${appearance.color}15` },
                              ]}
                            >
                              <Ionicons
                                name={appearance.icon}
                                size={12}
                                color={appearance.color}
                              />
                              <Text style={[styles.changeText, { color: appearance.color }]}>
                                {displayChange?.value} {displayChange?.unit}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.noChangeText}>Sin comparativo previo</Text>
                          )}
                          {progressConfig ? (
                            <Text style={styles.summaryHelperText}>
                              Toca para ver el progreso completo.
                            </Text>
                          ) : null}
                        </>
                      );

                      if (!progressConfig) {
                        return (
                          <View
                            key={metric.key}
                            style={[
                              styles.summaryCard,
                              index === 0 ? styles.summaryCardLarge : null,
                            ]}
                          >
                            {content}
                          </View>
                        );
                      }

                      return (
                        <TouchableOpacity
                          key={metric.key}
                          style={[
                            styles.summaryCard,
                            index === 0 ? styles.summaryCardLarge : null,
                            styles.metricCardInteractive,
                          ]}
                          activeOpacity={0.92}
                          accessibilityRole="button"
                          accessibilityLabel={`Ver progreso de ${metric.label.toLowerCase()}`}
                          onPress={() => handleOpenMeasurementProgress(progressConfig.key)}
                        >
                          {content}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.lastUpdate}>
                    Ultima actualizacion:{' '}
                    {formatMeasurementDate(
                      getMeasurementDisplayDate(latestMeasurement),
                      'long',
                    )}
                  </Text>

                  {latestMeasurementDetail ? (
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderContent}>
                          <Text style={styles.sectionTitle}>Indicadores calculados</Text>
                          <Text style={styles.sectionDescription}>
                            Resumen derivado del registro mas reciente.
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.sectionHeaderAction}
                          onPress={() => void openMeasurementDetail(latestMeasurement.id)}
                        >
                          <Text style={styles.sectionLink}>Ver detalle</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.calculationGrid}>
                        {recentCalculations.map((calculation) => {
                          const progressConfig = getMeasurementProgressMetricConfig(
                            calculation.code,
                          );
                          const displayValue = getDisplayMeasurement(
                            calculation.value,
                            calculation.unit,
                            calculation.unit ? 2 : 3,
                          );

                          const content = (
                            <>
                              <View style={styles.metricChipHeader}>
                                <Text style={styles.calculationChipLabel}>
                                  {calculation.label}
                                </Text>
                                {progressConfig ? (
                                  <View style={styles.metricActionPill}>
                                    <Ionicons
                                      name="analytics-outline"
                                      size={12}
                                      color={theme.colors.primary}
                                    />
                                    <Text style={styles.metricActionText}>
                                      Ver grafica
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.calculationChipValue}>
                                {displayValue.value}
                                {displayValue.unit ? (
                                  <Text style={styles.calculationChipUnit}>
                                    {' '}
                                    {displayValue.unit}
                                  </Text>
                                ) : null}
                              </Text>
                            </>
                          );

                          if (!progressConfig) {
                            return (
                              <View key={calculation.code} style={styles.calculationChip}>
                                {content}
                              </View>
                            );
                          }

                          return (
                            <TouchableOpacity
                              key={calculation.code}
                              style={[styles.calculationChip, styles.metricCardInteractive]}
                              activeOpacity={0.9}
                              accessibilityRole="button"
                              accessibilityLabel={`Ver progreso de ${calculation.label.toLowerCase()}`}
                              onPress={() =>
                                handleOpenMeasurementProgress(progressConfig.key)
                              }
                            >
                              {content}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.analysisMeta}>
                        <Text style={styles.analysisMetaText}>
                          Estado:{' '}
                          {latestMeasurementDetail.calculationRun?.status ?? 'sin calculo'}
                        </Text>
                        <Text style={styles.analysisMetaText}>
                          Advertencias: {latestMeasurementDetail.warnings.length}
                        </Text>
                      </View>
                    </Card>
                  ) : null}

                  <Card style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Perimetros corporales</Text>
                    <Text style={styles.sectionDescription}>
                      Se muestran unicamente las medidas disponibles del ultimo registro.
                    </Text>
                    <View style={styles.perimeterGrid}>
                      {perimeterCards.map((field) => {
                        const progressConfig = getMeasurementProgressMetricConfig(field.key);
                        const displayValue = getDisplayMeasurement(field.value, field.unit, 1);

                        return (
                          <TouchableOpacity
                            key={field.key}
                            style={[styles.perimeterCard, styles.metricCardInteractive]}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver progreso de ${field.label.toLowerCase()}`}
                            onPress={() =>
                              progressConfig &&
                              handleOpenMeasurementProgress(progressConfig.key)
                            }
                          >
                            <View style={styles.metricChipHeader}>
                              <Ionicons
                                name={
                                  (field.icon ?? 'body-outline') as keyof typeof Ionicons.glyphMap
                                }
                                size={18}
                                color={theme.colors.iconMuted}
                              />
                              <View style={styles.metricActionPill}>
                                <Ionicons
                                  name="analytics-outline"
                                  size={12}
                                  color={theme.colors.primary}
                                />
                                <Text style={styles.metricActionText}>Ver grafica</Text>
                              </View>
                            </View>
                            <Text style={styles.perimeterLabel}>{field.label}</Text>
                            <Text style={styles.perimeterValue}>
                              {displayValue.value}
                              {displayValue.unit ? (
                                <Text style={styles.perimeterUnit}>
                                  {' '}
                                  {displayValue.unit}
                                </Text>
                              ) : null}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Card>

                  <Card style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionHeaderContent}>
                        <Text style={styles.sectionTitle}>Historial</Text>
                        <Text style={styles.sectionDescription}>
                          {pagination?.total ?? measurements.length} registros disponibles.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.sectionHeaderAction}
                        onPress={openCreateMeasurementForm}
                      >
                        <Text style={styles.sectionLink}>Registrar nueva</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.historyList}>
                      {measurements.map((measurement) => (
                        <TouchableOpacity
                          key={measurement.id}
                          style={styles.historyCard}
                          activeOpacity={0.8}
                          onPress={() => void openMeasurementDetail(measurement.id)}
                        >
                          <View style={styles.historyHeader}>
                            <Text style={styles.historyDate}>
                              {formatMeasurementDate(
                                getMeasurementDisplayDate(measurement),
                                'short',
                              )}
                            </Text>
                            <Ionicons
                              name="chevron-forward-outline"
                              size={18}
                              color={theme.colors.iconMuted}
                            />
                          </View>

                          <View style={styles.historyMetricsRow}>
                            {SUMMARY_METRICS.map((metric) => {
                              const value = parseMeasurementNumber(measurement[metric.key]);

                              if (value === null) {
                                return null;
                              }

                              const displayValue = getDisplayMeasurement(
                                value,
                                metric.unit,
                                metric.unit === '%' ? 1 : 1,
                              );

                              return (
                                <View
                                  key={`${measurement.id}-${metric.key}`}
                                  style={styles.historyMetric}
                                >
                                  <Text style={styles.historyMetricLabel}>{metric.label}</Text>
                                  <Text style={styles.historyMetricValue}>
                                    {displayValue.value}
                                    {displayValue.unit ? (
                                      <Text style={styles.historyMetricUnit}>
                                        {' '}
                                        {displayValue.unit}
                                      </Text>
                                    ) : null}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>

                          {measurement.notes ? (
                            <Text style={styles.historyNote} numberOfLines={2}>
                              {measurement.notes}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>

                    {pagination && measurements.length < pagination.total ? (
                      <Button
                        title="Cargar mas"
                        onPress={() => void handleLoadMore()}
                        variant="secondary"
                        isLoading={isLoadingMore}
                      />
                    ) : null}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          {activeTab === 'glucose' ? (
            <>
              {glucoseErrorCard}

              {!hasLoadedGlucoseHistory && isLoadingGlucoseHistory ? (
                <Card style={styles.loadingCard}>
                  <LoadingSpinner text="Cargando tus glucosas..." />
                </Card>
              ) : null}

              {summaryGlucoseRecord ? (
                <Card style={styles.glucoseHeroCard}>
                  <View style={styles.glucoseHeroHeader}>
                    <View style={styles.summaryIcon}>
                      <Ionicons
                        name="water-outline"
                        size={20}
                        color={theme.colors.primary}
                      />
                    </View>
                    {summaryGlucoseIsMixed ? (
                      <View style={styles.historyBadge}>
                        <Text style={styles.historyBadgeText}>Registro mixto</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.glucoseHeroEyebrow}>Ultimo registro</Text>
                  <Text style={styles.glucoseHeroValue}>
                    {formatMeasurementNumber(summaryGlucoseRecord.glucose_mg_dl, 0)}
                    <Text style={styles.glucoseHeroUnit}> mg/dL</Text>
                  </Text>
                  <Text style={styles.glucoseHeroContext}>
                    {summaryGlucoseContextLabel ?? 'Sin contexto'}
                  </Text>
                  <Text style={styles.glucoseHeroDate}>
                    {formatGlucoseRecordedAt(summaryGlucoseRecord.recorded_at, 'short')}
                  </Text>
                  {summaryGlucoseRecord.notes ? (
                    <Text style={styles.glucoseHeroNote} numberOfLines={2}>
                      {summaryGlucoseRecord.notes}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              {!summaryGlucoseRecord &&
              !isLoadingGlucoseHistory &&
              !isLoadingLatestGlucose ? (
                <Card style={styles.emptyCard}>
                  <Ionicons
                    name="water-outline"
                    size={42}
                    color={theme.colors.iconMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    Todavia no tienes glucosas registradas
                  </Text>
                  <Text style={styles.emptyText}>
                    Guarda tu primera lectura para compartir el seguimiento con tu
                    nutriologo.
                  </Text>
                  <Button
                    title="Registrar mi primera glucosa"
                    onPress={openCreateGlucoseForm}
                    icon={<Ionicons name="add-outline" size={18} color="#ffffff" />}
                  />
                </Card>
              ) : null}

              {hasLoadedGlucoseHistory ? (
                <Card style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderContent}>
                      <Text style={styles.sectionTitle}>Historial de glucosa</Text>
                      <Text style={styles.sectionDescription}>
                        {glucosePagination?.total ?? glucoseRecords.length} registros
                        disponibles.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.sectionHeaderAction}
                      onPress={openCreateGlucoseForm}
                    >
                      <Text style={styles.sectionLink}>Registrar nueva</Text>
                    </TouchableOpacity>
                  </View>

                  {glucoseRecords.length > 0 ? (
                    <View style={styles.historyList}>
                      {glucoseRecords.map((record) => {
                        const mixedRecord = hasAdditionalHealthMetrics(record);

                        return (
                          <TouchableOpacity
                            key={record.id}
                            style={styles.historyCard}
                            activeOpacity={0.86}
                            onPress={() => void handleOpenGlucoseDetail(record.id)}
                          >
                            <View style={styles.historyHeader}>
                              <Text style={styles.historyValue}>
                                {formatMeasurementNumber(record.glucose_mg_dl, 0)} mg/dL
                              </Text>
                              <Ionicons
                                name="chevron-forward-outline"
                                size={18}
                                color={theme.colors.iconMuted}
                              />
                            </View>
                            <Text style={styles.historyMeta}>
                              {record.glucose_context
                                ? GLUCOSE_CONTEXT_LABELS[record.glucose_context]
                                : 'Sin contexto'}
                              {' - '}
                              {formatGlucoseRecordedAt(record.recorded_at, 'short')}
                            </Text>
                            {record.notes ? (
                              <Text style={styles.historyNote} numberOfLines={2}>
                                {record.notes}
                              </Text>
                            ) : null}
                            {mixedRecord ? (
                              <View style={styles.historyBadge}>
                                <Text style={styles.historyBadgeText}>
                                  Incluye otras metricas clinicas
                                </Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.historyEmpty}>
                      Cuando registres lecturas, aqui aparecera el historial completo.
                    </Text>
                  )}

                  {glucosePagination &&
                  glucoseRecords.length < glucosePagination.total ? (
                    <Button
                      title="Cargar mas"
                      onPress={() => void loadMoreGlucose()}
                      variant="secondary"
                      isLoading={isLoadingMoreGlucose}
                    />
                  ) : null}
                </Card>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        <FloatingButton
          accessibilityLabel="Registrar nueva medida"
          icon={<Ionicons name="add-outline" size={28} color="#ffffff" />}
          onPress={() => setIsCreateMenuVisible(true)}
          bottomOffset={100}
        />

        <MeasurementCreateMenuModal
          visible={isFocused && isCreateMenuVisible}
          options={CREATE_ACTIONS}
          onClose={() => setIsCreateMenuVisible(false)}
          onSelect={handleSelectCreateAction}
        />

        <MeasurementDetailModal
          visible={isFocused && isDetailVisible}
          detail={selectedMeasurementDetail}
          isLoading={isDetailLoading}
          onClose={closeMeasurementDetail}
          onEdit={handleEditMeasurement}
        />

        <MeasurementFormModal
          visible={isFocused && isFormVisible}
          isSubmitting={isSubmitting}
          initialMeasurement={editingMeasurement}
          defaultHeightCm={defaultHeightCm}
          onClose={closeMeasurementForm}
          onSubmit={handleSubmitMeasurement}
        />

        <GlucoseDetailModal
          visible={isFocused && isGlucoseDetailVisible}
          record={selectedGlucoseRecord}
          isLoading={isGlucoseDetailLoading}
          isDeleting={isDeletingGlucose}
          onClose={closeGlucoseDetail}
          onEdit={openEditGlucoseForm}
          onDelete={handleDeleteGlucose}
        />

        <GlucoseFormModal
          visible={isFocused && isGlucoseFormVisible}
          isSubmitting={isSubmittingGlucose}
          initialRecord={editingGlucoseRecord}
          onClose={closeGlucoseForm}
          onSubmit={handleSubmitGlucose}
        />
      </SafeAreaView>
    </TabScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: theme.colors.background,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    preferenceText: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: theme.colors.iconMuted,
    },
    tabsWrap: {
      paddingBottom: spacing.md,
    },
    scrollView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    errorCard: {
      marginBottom: spacing.sm,
    },
    errorTitle: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    errorText: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
    },
    summaryIntroCard: {
      backgroundColor: theme.colors.primarySoft,
      borderColor:
        Platform.OS === 'android' && theme.isDark ? 'transparent' : theme.colors.primaryBorder,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      ...(Platform.OS === 'android' && theme.isDark
        ? {
            shadowColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
            elevation: 0,
          }
        : {}),
    },
    summaryIntroEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    summaryIntroTitle: {
      marginTop: spacing.sm,
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    summaryIntroText: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    overviewCard: {
      marginBottom: spacing.sm,
      borderColor: Platform.OS === 'android' && theme.isDark ? 'transparent' : theme.colors.border,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      ...(Platform.OS === 'android' && theme.isDark
        ? {
            shadowColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
            elevation: 0,
          }
        : {}),
    },
    overviewHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    overviewHeaderCopy: {
      flex: 1,
    },
    overviewEyebrow: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    overviewTitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    overviewMeta: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    overviewHint: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    overviewEmptyText: {
      marginTop: spacing.md,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    overviewActionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
    },
    overviewActionText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    overviewMetricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    overviewMetricCard: {
      width: '48%',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    overviewMetricLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    overviewMetricValue: {
      marginTop: spacing.xs,
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    overviewMetricUnit: {
      fontSize: fontSize.sm,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    inlineAction: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
    },
    inlineActionText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    glucoseSummaryValue: {
      marginTop: spacing.md,
      fontSize: 30,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    glucoseSummaryUnit: {
      fontSize: fontSize.base,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    loadingLabel: {
      marginTop: spacing.md,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    emptyCard: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    emptyTitle: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    mainStatsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    summaryCard: {
      width: '48%',
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      ...shadows.md,
    },
    summaryCardLarge: {
      width: '100%',
    },
    summaryCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    summaryIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    metricCardInteractive: {
      borderColor: theme.colors.primaryBorder,
    },
    metricChipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    metricActionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.primarySoft,
    },
    metricActionText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    summaryLabel: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    summaryValue: {
      marginTop: spacing.xs,
      fontSize: 30,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    summaryUnit: {
      fontSize: fontSize.base,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    changeBadge: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    changeText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
    },
    noChangeText: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: theme.colors.iconMuted,
    },
    summaryHelperText: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    lastUpdate: {
      marginTop: spacing.md,
      marginBottom: spacing.lg,
      textAlign: 'center',
      fontSize: fontSize.xs,
      color: theme.colors.iconMuted,
    },
    sectionCard: {
      marginBottom: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    sectionHeaderContent: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    sectionHeaderAction: {
      flexShrink: 0,
      alignSelf: 'flex-start',
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
    },
    sectionLink: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    calculationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    calculationChip: {
      width: '48%',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    calculationChipLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    calculationChipValue: {
      marginTop: spacing.xs,
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    calculationChipUnit: {
      fontSize: fontSize.sm,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    analysisMeta: {
      marginTop: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    analysisMetaText: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    perimeterGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    perimeterCard: {
      width: '48%',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    perimeterLabel: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    perimeterValue: {
      marginTop: 2,
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    perimeterUnit: {
      fontSize: fontSize.xs,
      fontWeight: '400',
      color: theme.colors.iconMuted,
    },
    historyList: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    historyCard: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    historyDate: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    historyValue: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    historyMeta: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    historyMetricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    historyMetric: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    historyMetricLabel: {
      fontSize: 10,
      color: theme.colors.textMuted,
    },
    historyMetricValue: {
      marginTop: 2,
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    historyMetricUnit: {
      fontSize: fontSize.xs,
      fontWeight: '400',
      color: theme.colors.textMuted,
    },
    historyNote: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    historyBadge: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: `${theme.colors.warning}15`,
    },
    historyBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.warning,
    },
    historyEmpty: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    loadingCard: {
      minHeight: 180,
      justifyContent: 'center',
    },
    glucoseHeroCard: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    glucoseHeroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    glucoseHeroEyebrow: {
      marginTop: spacing.md,
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    glucoseHeroValue: {
      marginTop: spacing.sm,
      fontSize: 34,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    glucoseHeroUnit: {
      fontSize: fontSize.lg,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    glucoseHeroContext: {
      marginTop: spacing.sm,
      fontSize: fontSize.base,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    glucoseHeroDate: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    glucoseHeroNote: {
      marginTop: spacing.md,
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
  });
