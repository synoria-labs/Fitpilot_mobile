import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';
import { borderRadius, brandColors, buttonGradients, colors, fontSize, shadows, spacing } from '../../constants/colors';
import { getWorkoutSetTypeDefinition, usesSegmentedWorkoutCapture } from '../../constants/workoutSetTypes';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { DayExercise, ExerciseProgress, WorkoutScreenMode } from '../../types';
import { resolveTechniqueMedia } from '../../utils/exerciseTechnique';
import {
  formatDistanceMeters,
  formatDurationSeconds,
  formatEffortValue,
  formatZoneLabel,
  getCardioIntensityLabel,
  getCardioSummaryLabel,
  getMovementMetricLabel,
  getMovementSummaryLabel,
  isEditableEffortType,
  isPlyometricExercise,
  isTimedMovementExercise,
  shouldShowStrengthEffort,
} from '../../utils/formatters';
import {
  formatWorkoutMetricValue,
  normalizeWorkoutMetricValue,
  sanitizeWorkoutMetricDraft,
  type WorkoutMetricField,
} from '../../utils/workoutMetricInputs';
import {
  getSetGroupByNumber,
  hasCompletedCardioExecution,
  hasCompletedMovementExecution,
  type CardioExecutionDraft,
  type MovementExecutionDraft,
  type StrengthExecutionDraft,
} from '../../utils/workoutSession';
import { VideoPlayerModal, YouTubePlayerModal } from '../video';

const EXERCISE_PLACEHOLDER = require('../../../assets/exercise-placeholder.jpg');
const YOUTUBE_RED = '#FF0000';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = 312;
const INTERACTIVE_CARD_HEIGHT = 356;
const IMAGE_WIDTH_RATIO = 0.5;
const DIAGONAL_WIDTH = 80;

type PrimaryButtonGradientColors = readonly [string, string, string];

type StrengthMetricField = 'reps' | 'weight' | 'effort';
type CardioMetricField = 'duration' | 'calories' | 'distance' | 'effort';
type MovementMetricField = 'duration' | 'contacts' | 'height_cm' | 'distance_cm';

type ExerciseCardBaseProps = {
  mode: WorkoutScreenMode;
  dayExercise: DayExercise;
  progress: ExerciseProgress;
  currentSetNumber: number;
  isActive: boolean;
  exerciseNumber: number;
  totalExercises: number;
  setInProgress: boolean;
  isSavingSet?: boolean;
  onActivateExercise?: () => void;
  onAdvanceSet?: () => void;
  onSaveSet?: () => void;
  onSelectSet?: (setNumber: number) => void;
  onDeleteSet?: (setNumber: number) => void;
  shouldAutoplayPreview?: boolean;
};

type StrengthExerciseCardProps = ExerciseCardBaseProps & {
  kind: 'strength';
  draft: StrengthExecutionDraft;
  onStrengthMetricChange: (segmentIndex: number, field: StrengthMetricField, delta: number) => void;
  onStrengthMetricCommit: (segmentIndex: number, field: StrengthMetricField, value: number) => void;
  onAddSegment?: () => void;
  onRemoveSegment?: (segmentIndex: number) => void;
};

type CardioExerciseCardProps = ExerciseCardBaseProps & {
  kind: 'cardio';
  draft: CardioExecutionDraft;
  onCardioMetricChange: (field: CardioMetricField, delta: number) => void;
  onCardioMetricCommit: (field: CardioMetricField, value: number) => void;
};

type MovementExerciseCardProps = ExerciseCardBaseProps & {
  kind: 'movement';
  draft: MovementExecutionDraft;
  onMovementMetricChange: (field: MovementMetricField, delta: number) => void;
  onMovementMetricCommit: (field: MovementMetricField, value: number) => void;
};

type ExerciseCardProps = StrengthExerciseCardProps | CardioExerciseCardProps | MovementExerciseCardProps;

type CardVariant = 'compact' | 'interactive';

type CardLayout = {
  cardHeight: number;
  imageWidth: number;
  infoWidth: number;
  metricsWidth: number;
  actionDockWidth: number;
};

const formatCompact = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
};

const getAdaptiveGuidanceCopy = (dayExercise: DayExercise) => {
  const guidance = dayExercise.adaptive_guidance;
  if (!guidance) {
    return null;
  }

  const deltaKg = Math.abs(guidance.delta_kg ?? 0);
  let title = 'Mantén la carga';
  if (guidance.recommended_action === 'increase' && deltaKg > 0) {
    title = `Sube ${formatCompact(deltaKg)} kg`;
  } else if (guidance.recommended_action === 'decrease' && deltaKg > 0) {
    title = `Reduce ${formatCompact(deltaKg)} kg`;
  }

  return {
    title,
    reason: guidance.reason_text?.trim() || null,
  };
};

const AdaptiveGuidanceNotice = ({
  dayExercise,
  styles,
}: {
  dayExercise: DayExercise;
  styles: ReturnType<typeof createStyles>;
}) => {
  const guidanceCopy = getAdaptiveGuidanceCopy(dayExercise);
  if (!guidanceCopy) {
    return null;
  }

  return (
    <View style={styles.adaptiveGuidanceBox}>
      <Text style={styles.adaptiveGuidanceTitle}>{guidanceCopy.title}</Text>
      {guidanceCopy.reason ? (
        <Text style={styles.adaptiveGuidanceReason}>{guidanceCopy.reason}</Text>
      ) : null}
    </View>
  );
};

const formatCardioBlockChipLabel = (
  cardioBlock: ExerciseProgress['cardio_blocks_data'][number] | undefined,
  dayExercise: DayExercise,
) => {
  if (!cardioBlock) {
    return getCardioIntensityLabel(dayExercise);
  }

  if (cardioBlock.duration_seconds > 0) {
    return formatDurationSeconds(cardioBlock.duration_seconds);
  }

  if ((cardioBlock.distance_meters ?? 0) > 0) {
    return formatDistanceMeters(cardioBlock.distance_meters ?? 0);
  }

  if ((cardioBlock.calories_burned ?? 0) > 0) {
    return `${formatCompact(cardioBlock.calories_burned)} cal`;
  }

  return getCardioIntensityLabel(dayExercise);
};

const formatMovementBlockChipLabel = (
  movementBlock: ExerciseProgress['movement_blocks_data'][number] | undefined,
  dayExercise: DayExercise,
) => {
  if (!movementBlock) {
    return getMovementSummaryLabel(dayExercise);
  }

  if (isPlyometricExercise(dayExercise)) {
    if ((movementBlock.contacts_completed ?? 0) > 0) {
      return `${formatCompact(movementBlock.contacts_completed)} cont`;
    }
    if ((movementBlock.height_cm ?? 0) > 0) {
      return `${formatCompact(movementBlock.height_cm)} cm`;
    }
    if ((movementBlock.distance_cm ?? 0) > 0) {
      return `${formatCompact(movementBlock.distance_cm)} cm`;
    }
  }

  if ((movementBlock.duration_seconds ?? 0) > 0) {
    return formatDurationSeconds(movementBlock.duration_seconds ?? 0);
  }

  return getMovementSummaryLabel(dayExercise);
};

const getExerciseDescription = (dayExercise: DayExercise) => {
  const descriptionEs = dayExercise.exercise?.description_es?.trim();
  if (descriptionEs) {
    return descriptionEs;
  }

  const descriptionEn = dayExercise.exercise?.description_en?.trim();
  return descriptionEn || null;
};

const createCardLayout = (variant: CardVariant): CardLayout => {
  const cardHeight = variant === 'interactive' ? INTERACTIVE_CARD_HEIGHT : CARD_HEIGHT;
  const imageWidth = CARD_WIDTH * IMAGE_WIDTH_RATIO;
  const infoWidth = CARD_WIDTH - imageWidth + DIAGONAL_WIDTH;
  const innerPadding = spacing.md + spacing.sm;
  const getAvailableInfoWidth = (verticalFraction: number) =>
    Math.max(infoWidth - DIAGONAL_WIDTH * verticalFraction, 0);

  return {
    cardHeight,
    imageWidth,
    infoWidth,
    metricsWidth: getAvailableInfoWidth(0.72) - innerPadding,
    actionDockWidth: getAvailableInfoWidth(0.88) - innerPadding,
  };
};

const getImageShapePath = (width: number, height: number, radius: number) => `
  M ${DIAGONAL_WIDTH},0
  L ${width - radius},0
  Q ${width},0 ${width},${radius}
  L ${width},${height - radius}
  Q ${width},${height} ${width - radius},${height}
  L 0,${height}
  Z
`;

const getInfoShapePath = (width: number, height: number, radius: number) => `
  M 0,${radius}
  Q 0,0 ${radius},0
  L ${width},0
  L ${width - DIAGONAL_WIDTH},${height}
  L ${radius},${height}
  Q 0,${height} 0,${height - radius}
  Z
`;

const ImageMask = ({ layout }: { layout: CardLayout }) => (
  <Svg width={layout.imageWidth} height={layout.cardHeight}>
    <Path d={getImageShapePath(layout.imageWidth, layout.cardHeight, borderRadius.xl)} fill="black" />
  </Svg>
);

const InfoMask = ({ layout }: { layout: CardLayout }) => (
  <Svg width={layout.infoWidth} height={layout.cardHeight}>
    <Path d={getInfoShapePath(layout.infoWidth, layout.cardHeight, borderRadius.xl)} fill="black" />
  </Svg>
);

const EditableMetric = ({
  field,
  metricId,
  label,
  value,
  onAdjust,
  onCommitValue,
  step,
  disabled,
  styles,
  accentColor,
  placeholderColor,
}: {
  field: WorkoutMetricField;
  metricId: string;
  label: string;
  value: number | null | undefined;
  onAdjust?: (delta: number) => void;
  onCommitValue?: (value: number) => void;
  step: number;
  disabled: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
}) => {
  const [draftValue, setDraftValue] = useState(() => formatWorkoutMetricValue(field, value));
  const [isFocused, setIsFocused] = useState(false);
  const metricIdRef = useRef(metricId);

  useEffect(() => {
    if (metricIdRef.current !== metricId) {
      metricIdRef.current = metricId;
      setDraftValue(formatWorkoutMetricValue(field, value));
      setIsFocused(false);
      return;
    }

    if (!isFocused) {
      setDraftValue(formatWorkoutMetricValue(field, value));
    }
  }, [field, isFocused, metricId, value]);

  const handleCommit = useCallback(
    (rawValue?: string) => {
      const normalizedValue = normalizeWorkoutMetricValue(field, rawValue ?? draftValue);
      if (normalizedValue == null) {
        setDraftValue(formatWorkoutMetricValue(field, value));
        return;
      }

      onCommitValue?.(normalizedValue);
      setDraftValue(formatWorkoutMetricValue(field, normalizedValue));
    },
    [draftValue, field, onCommitValue, value],
  );

  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricCardLabel}>{label}</Text>
      <View style={styles.metricStepperRow}>
        <TouchableOpacity style={styles.metricButton} disabled={disabled} onPress={() => onAdjust?.(-step)}>
          <Ionicons name="remove" size={16} color={accentColor} />
        </TouchableOpacity>
        <TextInput
          value={draftValue}
          onChangeText={(nextValue) => setDraftValue(sanitizeWorkoutMetricDraft(field, nextValue))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            handleCommit();
            setIsFocused(false);
          }}
          onSubmitEditing={() => {
            handleCommit();
            setIsFocused(false);
          }}
          keyboardType={field === 'reps' || field === 'calories' || field === 'distance' ? 'number-pad' : 'decimal-pad'}
          returnKeyType="done"
          editable={!disabled}
          selectTextOnFocus
          style={styles.metricInput}
          placeholderTextColor={placeholderColor}
        />
        <TouchableOpacity style={styles.metricButton} disabled={disabled} onPress={() => onAdjust?.(step)}>
          <Ionicons name="add" size={16} color={accentColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const StaticMetric = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricCardLabel}>{label}</Text>
    <Text style={styles.metricStaticValue}>{value}</Text>
  </View>
);

const EditableStepperMetric = ({
  field,
  metricId,
  label,
  value,
  onAdjust,
  onCommitValue,
  step,
  disabled,
  styles,
  accentColor,
  placeholderColor,
}: {
  field: WorkoutMetricField;
  metricId: string;
  label: string;
  value: number | null | undefined;
  onAdjust?: (delta: number) => void;
  onCommitValue?: (value: number) => void;
  step: number;
  disabled: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
}) => {
  const [draftValue, setDraftValue] = useState(() => formatWorkoutMetricValue(field, value));
  const [isFocused, setIsFocused] = useState(false);
  const metricIdRef = useRef(metricId);

  useEffect(() => {
    if (metricIdRef.current !== metricId) {
      metricIdRef.current = metricId;
      setDraftValue(formatWorkoutMetricValue(field, value));
      setIsFocused(false);
      return;
    }

    if (!isFocused) {
      setDraftValue(formatWorkoutMetricValue(field, value));
    }
  }, [field, isFocused, metricId, value]);

  const handleCommit = useCallback(
    (rawValue?: string) => {
      const normalizedValue = normalizeWorkoutMetricValue(field, rawValue ?? draftValue);
      if (normalizedValue == null) {
        setDraftValue(formatWorkoutMetricValue(field, value));
        return;
      }

      onCommitValue?.(normalizedValue);
      setDraftValue(formatWorkoutMetricValue(field, normalizedValue));
    },
    [draftValue, field, onCommitValue, value],
  );

  const handleAdjust = useCallback(
    (delta: number) => {
      const baseValue =
        normalizeWorkoutMetricValue(field, isFocused ? draftValue : value) ??
        normalizeWorkoutMetricValue(field, value);

      if (baseValue == null) {
        return;
      }

      const nextValue = Math.max(0, baseValue + delta);
      if (!isFocused && onAdjust) {
        onAdjust(delta);
      } else {
        onCommitValue?.(nextValue);
      }

      setDraftValue(formatWorkoutMetricValue(field, nextValue));
    },
    [draftValue, field, isFocused, onAdjust, onCommitValue, value],
  );

  return (
    <View style={styles.inlineMetricRow}>
      <TouchableOpacity
        style={styles.inlineMetricButton}
        disabled={disabled}
        onPress={() => handleAdjust(-step)}
      >
        <Ionicons name="chevron-down" size={18} color={accentColor} />
      </TouchableOpacity>
      <View style={styles.inlineMetricValue}>
        <View
          style={[
            styles.inlineMetricInputShell,
            isFocused && styles.inlineMetricInputShellFocused,
          ]}
        >
          <TextInput
            value={draftValue}
            onChangeText={(nextValue) => setDraftValue(sanitizeWorkoutMetricDraft(field, nextValue))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              handleCommit();
              setIsFocused(false);
            }}
            onSubmitEditing={() => {
              handleCommit();
              setIsFocused(false);
            }}
            keyboardType={field === 'reps' || field === 'calories' || field === 'distance' ? 'number-pad' : 'decimal-pad'}
            returnKeyType="done"
            editable={!disabled}
            selectTextOnFocus
            style={styles.inlineMetricInput}
            placeholderTextColor={placeholderColor}
          />
        </View>
        <Text style={styles.inlineMetricLabel}>{label}</Text>
      </View>
      <TouchableOpacity
        style={styles.inlineMetricButton}
        disabled={disabled}
        onPress={() => handleAdjust(step)}
      >
        <Ionicons name="chevron-up" size={18} color={accentColor} />
      </TouchableOpacity>
    </View>
  );
};

const InlineStaticMetric = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.inlineStaticMetricContainer}>
    <Text style={styles.inlineMetricNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
      {value}
    </Text>
    <Text style={styles.inlineMetricLabel}>{label}</Text>
  </View>
);

const StrengthExerciseBody = ({
  dayExercise,
  draft,
  isEditing,
  isSavingSet,
  styles,
  accentColor,
  placeholderColor,
  primaryGradientColors,
  onStrengthMetricChange,
  onStrengthMetricCommit,
  onAdvance,
  actionLabel,
  actionDockWidth,
}: {
  dayExercise: DayExercise;
  draft: StrengthExecutionDraft;
  isEditing: boolean;
  isSavingSet: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
  primaryGradientColors: PrimaryButtonGradientColors;
  onStrengthMetricChange: StrengthExerciseCardProps['onStrengthMetricChange'];
  onStrengthMetricCommit: StrengthExerciseCardProps['onStrengthMetricCommit'];
  onAdvance?: () => void;
  actionLabel: string;
  actionDockWidth: number;
}) => {
  const showStrengthEffort = shouldShowStrengthEffort(dayExercise);
  const isEffortEditable = showStrengthEffort && isEditableEffortType(dayExercise.effort_type);
  const primarySegment = draft.currentSegments[0];
  const currentEffortLabel = formatEffortValue(
    dayExercise.effort_type,
    primarySegment?.effort_value ?? dayExercise.effort_value,
  );

  if (!isEditing) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onAdvance} disabled={!onAdvance || isSavingSet}>
        <View style={styles.inlineGuidanceStack}>
          <View style={styles.inlineStaticMetricsStack}>
            <InlineStaticMetric
              styles={styles}
              label={`Reps ${dayExercise.reps_min ?? '-'}-${dayExercise.reps_max ?? '-'}`}
              value={`${primarySegment?.reps_completed ?? dayExercise.reps_min ?? 0}`}
            />
            <View style={styles.inlineDivider} />
            <InlineStaticMetric
              styles={styles}
              label="Peso (kg)"
              value={`${formatCompact(primarySegment?.weight_kg ?? 0)} kg`}
            />
            {showStrengthEffort ? (
              <>
                <View style={styles.inlineDivider} />
                <InlineStaticMetric styles={styles} label="Intensidad" value={currentEffortLabel} />
              </>
            ) : null}
          </View>
          <AdaptiveGuidanceNotice dayExercise={dayExercise} styles={styles} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.inlineEditorSection}>
      <View style={styles.inlineMetricsStack}>
        <EditableStepperMetric
          field="reps"
          metricId={`strength-reps-${draft.currentSetNumber}`}
          label={`Reps ${dayExercise.reps_min ?? '-'}-${dayExercise.reps_max ?? '-'}`}
          value={primarySegment?.reps_completed}
          onAdjust={(delta) => onStrengthMetricChange(0, 'reps', delta)}
          onCommitValue={(value) => onStrengthMetricCommit(0, 'reps', value)}
          step={1}
          disabled={isSavingSet}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={placeholderColor}
        />
        <View style={styles.inlineDivider} />
        <EditableStepperMetric
          field="weight"
          metricId={`strength-weight-${draft.currentSetNumber}`}
          label="Peso (kg)"
          value={primarySegment?.weight_kg}
          onAdjust={(delta) => onStrengthMetricChange(0, 'weight', delta)}
          onCommitValue={(value) => onStrengthMetricCommit(0, 'weight', value)}
          step={2.5}
          disabled={isSavingSet}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={placeholderColor}
        />
        {showStrengthEffort ? (
          isEffortEditable ? (
            <>
              <View style={styles.inlineDivider} />
              <EditableStepperMetric
                field="effort"
                metricId={`strength-effort-${draft.currentSetNumber}`}
                label={dayExercise.effort_type}
                value={primarySegment?.effort_value ?? dayExercise.effort_value}
                onAdjust={(delta) => onStrengthMetricChange(0, 'effort', delta)}
                onCommitValue={(value) => onStrengthMetricCommit(0, 'effort', value)}
                step={0.5}
                disabled={isSavingSet}
                styles={styles}
                accentColor={accentColor}
                placeholderColor={placeholderColor}
              />
            </>
          ) : (
            <>
              <View style={styles.inlineDivider} />
              <InlineStaticMetric styles={styles} label="Intensidad" value={currentEffortLabel} />
            </>
          )
        ) : null}
      </View>
      <AdaptiveGuidanceNotice dayExercise={dayExercise} styles={styles} />

      {onAdvance ? (
        <View style={[styles.inlineActionDock, { width: actionDockWidth }]}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.inlineActionDockTouchable, isSavingSet && styles.disabled]}
            disabled={isSavingSet}
            onPress={onAdvance}
            activeOpacity={0.84}
          >
            <LinearGradient
              colors={primaryGradientColors}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 0.85 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const StrengthSegmentEditor = ({
  dayExercise,
  draft,
  isSavingSet,
  styles,
  accentColor,
  placeholderColor,
  deleteIconColor,
  onStrengthMetricChange,
  onStrengthMetricCommit,
  onAdvance,
  onAddSegment,
  onRemoveSegment,
  onDeleteCurrentSet,
  actionLabel,
  actionIcon,
}: {
  dayExercise: DayExercise;
  draft: StrengthExecutionDraft;
  isSavingSet: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
  deleteIconColor: string;
  onStrengthMetricChange: StrengthExerciseCardProps['onStrengthMetricChange'];
  onStrengthMetricCommit: StrengthExerciseCardProps['onStrengthMetricCommit'];
  onAdvance?: () => void;
  onAddSegment?: () => void;
  onRemoveSegment?: (segmentIndex: number) => void;
  onDeleteCurrentSet?: () => void;
  actionLabel?: string;
  actionIcon?: React.ComponentProps<typeof Ionicons>['name'];
}) => {
  const setTypeDefinition = getWorkoutSetTypeDefinition(dayExercise.set_type);
  const showStrengthEffort = shouldShowStrengthEffort(dayExercise);
  const isEffortEditable = showStrengthEffort && isEditableEffortType(dayExercise.effort_type);

  return (
    <View style={styles.segmentEditor}>
      <View style={styles.segmentHeader}>
        <View style={styles.segmentHeaderCopy}>
          <Text style={styles.segmentTitle}>Serie {draft.currentSetNumber}</Text>
          <Text style={styles.segmentHint}>{setTypeDefinition.captureHint}</Text>
        </View>
        {onDeleteCurrentSet ? (
          <TouchableOpacity style={styles.deleteButton} onPress={onDeleteCurrentSet}>
            <Ionicons name="trash-outline" size={16} color={deleteIconColor} />
          </TouchableOpacity>
        ) : null}
      </View>

      <AdaptiveGuidanceNotice dayExercise={dayExercise} styles={styles} />

      {draft.currentSegments.map((segment, segmentIndex) => (
        <View key={`${draft.currentSetNumber}-${segment.segment_index}`} style={styles.segmentCard}>
          <View style={styles.segmentCardHeader}>
            <Text style={styles.segmentCardTitle}>Segmento {segmentIndex + 1}</Text>
            {segmentIndex > 0 && draft.currentSegments.length > setTypeDefinition.minimumSegments && onRemoveSegment ? (
              <TouchableOpacity onPress={() => onRemoveSegment(segmentIndex)}>
                <Text style={styles.removeText}>Quitar</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.metricsGrid}>
            <EditableMetric
              field="reps"
              metricId={`segment-reps-${draft.currentSetNumber}-${segmentIndex}`}
              label="Reps"
              value={segment.reps_completed}
              onAdjust={(delta) => onStrengthMetricChange(segmentIndex, 'reps', delta)}
              onCommitValue={(value) => onStrengthMetricCommit(segmentIndex, 'reps', value)}
              step={1}
              disabled={isSavingSet}
              styles={styles}
              accentColor={accentColor}
              placeholderColor={placeholderColor}
            />
            <EditableMetric
              field="weight"
              metricId={`segment-weight-${draft.currentSetNumber}-${segmentIndex}`}
              label="Peso (kg)"
              value={segment.weight_kg}
              onAdjust={(delta) => onStrengthMetricChange(segmentIndex, 'weight', delta)}
              onCommitValue={(value) => onStrengthMetricCommit(segmentIndex, 'weight', value)}
              step={2.5}
              disabled={isSavingSet}
              styles={styles}
              accentColor={accentColor}
              placeholderColor={placeholderColor}
            />
            {showStrengthEffort ? (
              isEffortEditable ? (
                <EditableMetric
                  field="effort"
                  metricId={`segment-effort-${draft.currentSetNumber}-${segmentIndex}`}
                  label={dayExercise.effort_type}
                  value={segment.effort_value ?? dayExercise.effort_value}
                  onAdjust={(delta) => onStrengthMetricChange(segmentIndex, 'effort', delta)}
                  onCommitValue={(value) => onStrengthMetricCommit(segmentIndex, 'effort', value)}
                  step={0.5}
                  disabled={isSavingSet}
                  styles={styles}
                  accentColor={accentColor}
                  placeholderColor={placeholderColor}
                />
              ) : (
                <StaticMetric
                  styles={styles}
                  label="Intensidad"
                  value={formatEffortValue(dayExercise.effort_type, segment.effort_value ?? dayExercise.effort_value)}
                />
              )
            ) : null}
          </View>
        </View>
      ))}

      <View style={styles.segmentActions}>
        {onAddSegment ? (
          <TouchableOpacity style={styles.ghostButton} onPress={onAddSegment} disabled={isSavingSet}>
            <Ionicons name="add-circle-outline" size={16} color={brandColors.navy} />
            <Text style={styles.ghostButtonText}>Agregar segmento</Text>
          </TouchableOpacity>
        ) : null}
        {onAdvance ? (
          <TouchableOpacity style={styles.ghostButton} onPress={onAdvance} disabled={isSavingSet}>
            <Ionicons name={actionIcon ?? 'checkmark-circle-outline'} size={16} color={brandColors.navy} />
            <Text style={styles.ghostButtonText}>{actionLabel ?? 'Guardar serie'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const CardioExerciseBody = ({
  dayExercise,
  draft,
  isEditing,
  isSavingSet,
  styles,
  accentColor,
  placeholderColor,
  primaryGradientColors,
  onCardioMetricChange,
  onCardioMetricCommit,
  onAdvance,
  actionLabel,
  actionDockWidth,
}: {
  dayExercise: DayExercise;
  draft: CardioExecutionDraft;
  isEditing: boolean;
  isSavingSet: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
  primaryGradientColors: PrimaryButtonGradientColors;
  onCardioMetricChange: CardioExerciseCardProps['onCardioMetricChange'];
  onCardioMetricCommit: CardioExerciseCardProps['onCardioMetricCommit'];
  onAdvance?: () => void;
  actionLabel: string;
  actionDockWidth: number;
}) => {
  const plannedZoneLabel = formatZoneLabel(dayExercise.intensity_zone) ?? '--';

  if (!isEditing) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onAdvance} disabled={!onAdvance || isSavingSet}>
        <View style={styles.inlineStaticMetricsStack}>
          <InlineStaticMetric styles={styles} label="Duracion" value={formatDurationSeconds(draft.durationSeconds)} />
          <View style={styles.inlineDivider} />
          <InlineStaticMetric
            styles={styles}
            label="Distancia"
            value={draft.distanceMeters != null && draft.distanceMeters > 0 ? formatDistanceMeters(draft.distanceMeters) : '--'}
          />
          <View style={styles.inlineDivider} />
          <InlineStaticMetric
            styles={styles}
            label="Calorias"
            value={draft.caloriesBurned != null && draft.caloriesBurned > 0 ? `${formatCompact(draft.caloriesBurned)} cal` : '--'}
          />
          <View style={styles.inlineDivider} />
          <InlineStaticMetric styles={styles} label="Zona" value={plannedZoneLabel} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.inlineEditorSection}>
      <View style={styles.inlineMetricsStack}>
        <EditableStepperMetric
          field="duration"
          metricId={`cardio-duration-${draft.currentSetNumber}`}
          label="Duracion (min)"
          value={draft.durationSeconds / 60}
          onAdjust={(delta) => onCardioMetricChange('duration', delta)}
          onCommitValue={(value) => onCardioMetricCommit('duration', value)}
          step={1}
          disabled={isSavingSet}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={placeholderColor}
        />
        <View style={styles.inlineDivider} />
        <EditableStepperMetric
          field="distance"
          metricId={`cardio-distance-${draft.currentSetNumber}`}
          label="Distancia (m)"
          value={draft.distanceMeters}
          onAdjust={(delta) => onCardioMetricChange('distance', delta)}
          onCommitValue={(value) => onCardioMetricCommit('distance', value)}
          step={100}
          disabled={isSavingSet}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={placeholderColor}
        />
        <View style={styles.inlineDivider} />
        <EditableStepperMetric
          field="calories"
          metricId={`cardio-calories-${draft.currentSetNumber}`}
          label="Calorias"
          value={draft.caloriesBurned}
          onAdjust={(delta) => onCardioMetricChange('calories', delta)}
          onCommitValue={(value) => onCardioMetricCommit('calories', value)}
          step={10}
          disabled={isSavingSet}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={placeholderColor}
        />
        <View style={styles.inlineDivider} />
        <InlineStaticMetric styles={styles} label="Zona" value={plannedZoneLabel} />
      </View>

      {onAdvance ? (
        <View style={[styles.inlineActionDock, { width: actionDockWidth }]}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.inlineActionDockTouchable, isSavingSet && styles.disabled]}
            disabled={isSavingSet}
            onPress={onAdvance}
            activeOpacity={0.84}
          >
            <LinearGradient
              colors={primaryGradientColors}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 0.85 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const MovementExerciseBody = ({
  dayExercise,
  draft,
  isEditing,
  isSavingSet,
  styles,
  accentColor,
  placeholderColor,
  primaryGradientColors,
  onMovementMetricChange,
  onMovementMetricCommit,
  onAdvance,
  actionLabel,
  actionDockWidth,
}: {
  dayExercise: DayExercise;
  draft: MovementExecutionDraft;
  isEditing: boolean;
  isSavingSet: boolean;
  styles: ReturnType<typeof createStyles>;
  accentColor: string;
  placeholderColor: string;
  primaryGradientColors: PrimaryButtonGradientColors;
  onMovementMetricChange: MovementExerciseCardProps['onMovementMetricChange'];
  onMovementMetricCommit: MovementExerciseCardProps['onMovementMetricCommit'];
  onAdvance?: () => void;
  actionLabel: string;
  actionDockWidth: number;
}) => {
  const isPlyometric = isPlyometricExercise(dayExercise);
  const isTimedMovement = isTimedMovementExercise(dayExercise, draft.durationSeconds);
  const secondaryMetricLabel = getMovementMetricLabel(dayExercise);
  const secondaryMetricValue = draft.metricType === 'distance_cm' ? draft.distanceCm : draft.heightCm;

  if (!isEditing) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onAdvance} disabled={!onAdvance || isSavingSet}>
        <View style={styles.inlineStaticMetricsStack}>
          {isPlyometric ? (
            <>
              <InlineStaticMetric
                styles={styles}
                label={`Contactos ${dayExercise.reps_min ?? '-'}-${dayExercise.reps_max ?? '-'}`}
                value={`${draft.contactsCompleted ?? dayExercise.reps_min ?? '--'}`}
              />
              <View style={styles.inlineDivider} />
              <InlineStaticMetric
                styles={styles}
                label={secondaryMetricLabel}
                value={secondaryMetricValue != null ? `${formatCompact(secondaryMetricValue)} cm` : '--'}
              />
            </>
          ) : (
            <>
              <InlineStaticMetric
                styles={styles}
                label={isTimedMovement ? 'Duracion' : 'Cumplimiento'}
                value={isTimedMovement && draft.durationSeconds != null ? formatDurationSeconds(draft.durationSeconds) : 'Completar'}
              />
              <View style={styles.inlineDivider} />
              <InlineStaticMetric styles={styles} label="Bloques" value={`${dayExercise.sets}`} />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.inlineEditorSection}>
      <View style={styles.inlineMetricsStack}>
        {isPlyometric ? (
          <>
            <EditableStepperMetric
              field="contacts"
              metricId={`movement-contacts-${draft.currentSetNumber}`}
              label="Contactos"
              value={draft.contactsCompleted}
              onAdjust={(delta) => onMovementMetricChange('contacts', delta)}
              onCommitValue={(value) => onMovementMetricCommit('contacts', value)}
              step={1}
              disabled={isSavingSet}
              styles={styles}
              accentColor={accentColor}
              placeholderColor={placeholderColor}
            />
            <View style={styles.inlineDivider} />
            <EditableStepperMetric
              field={draft.metricType === 'distance_cm' ? 'distance_cm' : 'height_cm'}
              metricId={`movement-secondary-${draft.currentSetNumber}`}
              label={secondaryMetricLabel}
              value={secondaryMetricValue}
              onAdjust={(delta) => onMovementMetricChange(draft.metricType === 'distance_cm' ? 'distance_cm' : 'height_cm', delta)}
              onCommitValue={(value) => onMovementMetricCommit(draft.metricType === 'distance_cm' ? 'distance_cm' : 'height_cm', value)}
              step={1}
              disabled={isSavingSet}
              styles={styles}
              accentColor={accentColor}
              placeholderColor={placeholderColor}
            />
          </>
        ) : isTimedMovement ? (
          <EditableStepperMetric
            field="duration"
            metricId={`movement-duration-${draft.currentSetNumber}`}
            label="Duracion (min)"
            value={draft.durationSeconds != null ? draft.durationSeconds / 60 : null}
            onAdjust={(delta) => onMovementMetricChange('duration', delta)}
            onCommitValue={(value) => onMovementMetricCommit('duration', value)}
            step={1}
            disabled={isSavingSet}
            styles={styles}
            accentColor={accentColor}
            placeholderColor={placeholderColor}
          />
        ) : (
          <InlineStaticMetric styles={styles} label="Cumplimiento" value="Marcar bloque" />
        )}
      </View>

      {onAdvance ? (
        <View style={[styles.inlineActionDock, { width: actionDockWidth }]}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.inlineActionDockTouchable, isSavingSet && styles.disabled]}
            disabled={isSavingSet}
            onPress={onAdvance}
            activeOpacity={0.84}
          >
            <LinearGradient
              colors={primaryGradientColors}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 0.85 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

export const ExerciseCard: React.FC<ExerciseCardProps> = (props) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const primaryGradientColors: PrimaryButtonGradientColors = theme.isDark
    ? buttonGradients.primary.dark
    : buttonGradients.primary.light;
  const [isEditing, setIsEditing] = useState(false);
  const [showGifModal, setShowGifModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const wasActiveRef = useRef(props.isActive);

  const exercise = props.dayExercise.exercise;
  const exerciseName = exercise?.name_es || exercise?.name_en || 'Ejercicio';
  const exerciseDescription = getExerciseDescription(props.dayExercise);
  const isCardio = props.kind === 'cardio';
  const isMovement = props.kind === 'movement';
  const isCompleted = props.progress.is_completed;
  const isReviewMode = props.mode === 'review';
  const isHistoricalEditMode = props.mode === 'historicalEdit';
  const canEditCompletedExercise = isCompleted && !isReviewMode;
  const isInteractiveMode = !isReviewMode;
  const showControls = isInteractiveMode && (props.isActive || isEditing) && (!isCompleted || isEditing);
  const usesSegmentedCapture = props.kind === 'strength' && usesSegmentedWorkoutCapture(props.dayExercise.set_type);
  const showInlineControls = !usesSegmentedCapture && showControls;
  const showSegmentEditor = usesSegmentedCapture && showControls;
  const showCurrentSetChip = isInteractiveMode && (!isCompleted || isEditing) && (props.isActive || props.setInProgress);
  const setTypeDefinition = getWorkoutSetTypeDefinition(props.dayExercise.set_type);
  const accentColor = (props.isSavingSet ?? false) ? theme.colors.iconMuted : theme.colors.primary;
  const media = useMemo(() => resolveTechniqueMedia(exercise), [exercise]);
  const { videoUrl, useYouTubeModal } = media;
  const inlineImageSource =
    props.shouldAutoplayPreview && media.gifUrl
      ? { uri: media.gifUrl }
      : media.posterUrl
        ? { uri: media.posterUrl }
        : EXERCISE_PLACEHOLDER;
  const layout = useMemo(
    () => createCardLayout(showInlineControls ? 'interactive' : 'compact'),
    [showInlineControls],
  );
  const plannedZoneLabel = formatZoneLabel(props.dayExercise.intensity_zone) ?? null;
  const primaryAction = isHistoricalEditMode ? props.onSaveSet : props.onAdvanceSet;
  const currentSetExists = isCardio
    ? hasCompletedCardioExecution(props.progress, props.currentSetNumber)
    : isMovement
      ? hasCompletedMovementExecution(props.progress, props.currentSetNumber)
    : (props.progress.sets_data ?? []).some((setGroup) => setGroup.set_number === props.currentSetNumber);

  useEffect(() => {
    if (wasActiveRef.current && !props.isActive) {
      setIsEditing(false);
    }

    wasActiveRef.current = props.isActive;
  }, [props.isActive]);

  const handleTechniquePress = useCallback(() => {
    if (useYouTubeModal) {
      setShowYouTubeModal(true);
      return;
    }

    setShowVideoModal(true);
  }, [useYouTubeModal]);

  const handlePreviewPress = useCallback(() => {
    if (media.gifUrl) {
      setShowGifModal(true);
      return;
    }

    handleTechniquePress();
  }, [handleTechniquePress, media.gifUrl]);

  const handleCompletedOverlayPress = useCallback(() => {
    if (!canEditCompletedExercise) {
      return;
    }

    props.onActivateExercise?.();
    setIsEditing(true);
  }, [canEditCompletedExercise, props]);

  const chipLabelForSet = useCallback(
    (setNumber: number) => {
      if (isCardio) {
        const cardioBlock = (props.progress.cardio_blocks_data ?? []).find((item) => item.set_number === setNumber);
        if (!cardioBlock && getSetGroupByNumber(props.progress, setNumber)) {
          return formatCardioBlockChipLabel(undefined, props.dayExercise);
        }
        return formatCardioBlockChipLabel(cardioBlock, props.dayExercise);
      }
      if (isMovement) {
        const movementBlock = (props.progress.movement_blocks_data ?? []).find((item) => item.set_number === setNumber);
        return formatMovementBlockChipLabel(movementBlock, props.dayExercise);
      }

      const setGroup = (props.progress.sets_data ?? []).find((item) => item.set_number === setNumber);
      if (!setGroup) {
        return usesSegmentedWorkoutCapture(props.dayExercise.set_type)
          ? setTypeDefinition.shortLabel
          : formatEffortValue(
              props.dayExercise.effort_type,
              props.draft.currentSegments[0]?.effort_value ?? props.dayExercise.effort_value,
            );
      }
      if (setGroup.segment_count > 1) {
        return `${setGroup.segment_count} seg`;
      }
      return formatEffortValue(
        props.dayExercise.effort_type,
        setGroup.segments[0]?.effort_value ?? props.dayExercise.effort_value,
      );
    },
    [isCardio, isMovement, props, setTypeDefinition.shortLabel],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.cardBase, { height: layout.cardHeight }]}>
        <View style={[styles.mediaArea, { width: layout.imageWidth }]}>
          <TouchableOpacity
            style={[styles.mediaPressable, { width: layout.imageWidth, height: layout.cardHeight }]}
            activeOpacity={0.92}
            onPress={handlePreviewPress}
          >
            <MaskedView
              style={[styles.maskContainer, { width: layout.imageWidth, height: layout.cardHeight }]}
              maskElement={<ImageMask layout={layout} />}
            >
              <Image source={inlineImageSource} style={styles.exerciseImage} resizeMode="cover" />
            </MaskedView>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          accessibilityLabel={`Abrir tecnica de ${exerciseName}`}
          activeOpacity={0.88}
          style={[styles.playButton, useYouTubeModal && styles.youtubeButton]}
          testID="exercise-technique-button"
          onPress={handleTechniquePress}
        >
          <Ionicons name={useYouTubeModal ? 'logo-youtube' : 'play'} size={18} color={colors.white} />
        </TouchableOpacity>

        <View style={[styles.infoAreaContainer, { width: layout.infoWidth }]}>
          <MaskedView
            style={[styles.maskContainer, { width: layout.infoWidth, height: layout.cardHeight }]}
            maskElement={<InfoMask layout={layout} />}
          >
            <View style={[styles.infoBackground, { width: layout.infoWidth, height: layout.cardHeight }]} />
          </MaskedView>
        </View>

        <View style={[styles.infoArea, { width: layout.infoWidth }]}>
          <View style={styles.infoContent}>
            <View style={styles.headerRow}>
              <View style={styles.badgeRow}>
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{props.exerciseNumber}/{props.totalExercises}</Text>
                </View>
                <View style={[styles.modeBadge, isCardio ? styles.cardioBadge : styles.strengthBadge]}>
                  <Text style={styles.modeBadgeText}>
                    {isCardio
                      ? (props.dayExercise.cardio_subclass?.toUpperCase() || 'CARDIO')
                      : isMovement
                        ? (exercise?.exercise_class?.toUpperCase() || 'MOV')
                        : setTypeDefinition.shortLabel}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={props.onActivateExercise}
                disabled={!props.onActivateExercise || props.isSavingSet || !isInteractiveMode}
                activeOpacity={0.84}
              >
                <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
              </TouchableOpacity>
              <Text style={styles.exerciseMeta} numberOfLines={2}>
                {isCardio
                  ? getCardioSummaryLabel(props.dayExercise)
                  : isMovement
                    ? getMovementSummaryLabel(props.dayExercise)
                    : setTypeDefinition.label}
              </Text>
              {isCardio ? (
                <View style={styles.cardioMetaRow}>
                  {plannedZoneLabel ? (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{plannedZoneLabel}</Text>
                    </View>
                  ) : null}
                  {props.dayExercise.distance_meters ? (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>
                        {props.dayExercise.distance_meters >= 1000
                          ? `${(props.dayExercise.distance_meters / 1000).toFixed(1)} km`
                          : `${props.dayExercise.distance_meters} m`}
                      </Text>
                    </View>
                  ) : null}
                  {props.dayExercise.target_calories ? (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{props.dayExercise.target_calories} cal</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={[styles.bodyContent, { width: layout.metricsWidth }]}>
              {props.kind === 'strength' ? (
                <StrengthExerciseBody
                  dayExercise={props.dayExercise}
                  draft={props.draft}
                  isEditing={showInlineControls}
                  isSavingSet={props.isSavingSet ?? false}
                  styles={styles}
                  accentColor={accentColor}
                  placeholderColor={theme.colors.textMuted}
                  primaryGradientColors={primaryGradientColors}
                  onStrengthMetricChange={props.onStrengthMetricChange}
                  onStrengthMetricCommit={props.onStrengthMetricCommit}
                  actionLabel={
                    isHistoricalEditMode
                      ? 'Guardar serie'
                      : props.setInProgress
                        ? 'Finalizar serie'
                        : 'Iniciar serie'
                  }
                  actionDockWidth={layout.actionDockWidth}
                  onAdvance={primaryAction}
                />
              ) : props.kind === 'cardio' ? (
                <CardioExerciseBody
                  dayExercise={props.dayExercise}
                  draft={props.draft}
                  isEditing={showInlineControls}
                  isSavingSet={props.isSavingSet ?? false}
                  styles={styles}
                  accentColor={accentColor}
                  placeholderColor={theme.colors.textMuted}
                  primaryGradientColors={primaryGradientColors}
                  onCardioMetricChange={props.onCardioMetricChange}
                  onCardioMetricCommit={props.onCardioMetricCommit}
                  actionLabel={
                    isHistoricalEditMode
                      ? 'Guardar bloque'
                      : props.setInProgress
                        ? 'Finalizar bloque'
                        : 'Iniciar bloque'
                  }
                  actionDockWidth={layout.actionDockWidth}
                  onAdvance={primaryAction}
                />
              ) : (
                <MovementExerciseBody
                  dayExercise={props.dayExercise}
                  draft={props.draft}
                  isEditing={showInlineControls}
                  isSavingSet={props.isSavingSet ?? false}
                  styles={styles}
                  accentColor={accentColor}
                  placeholderColor={theme.colors.textMuted}
                  primaryGradientColors={primaryGradientColors}
                  onMovementMetricChange={props.onMovementMetricChange}
                  onMovementMetricCommit={props.onMovementMetricCommit}
                  actionLabel={
                    isHistoricalEditMode
                      ? 'Guardar bloque'
                      : props.setInProgress
                        ? 'Finalizar bloque'
                        : 'Iniciar bloque'
                  }
                  actionDockWidth={layout.actionDockWidth}
                  onAdvance={primaryAction}
                />
              )}
            </View>
          </View>
        </View>

        {canEditCompletedExercise && !isEditing ? (
          <TouchableOpacity
            style={[styles.completedOverlayTouchable, { width: layout.infoWidth }]}
            activeOpacity={0.9}
            onPress={handleCompletedOverlayPress}
          >
            <MaskedView
              style={[styles.maskContainer, { width: layout.infoWidth, height: layout.cardHeight }]}
              maskElement={<InfoMask layout={layout} />}
            >
              <BlurView intensity={25} tint={theme.colors.blurTint} style={styles.blurView}>
                <View style={styles.completedOverlayContent}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={32} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.completedText}>Completado</Text>
                  <Text style={styles.tapToEditText}>Toca para editar</Text>
                </View>
              </BlurView>
            </MaskedView>
          </TouchableOpacity>
        ) : null}

        {canEditCompletedExercise && isEditing ? (
          <TouchableOpacity style={styles.editingBadge} onPress={() => setIsEditing(false)} activeOpacity={0.84}>
            <Ionicons name="close-circle" size={18} color={colors.white} />
            <Text style={styles.editingBadgeText}>Cerrar</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.setChipSection}>
        <View style={styles.setChipList}>
          {Array.from({ length: props.progress.total_sets }, (_, index) => {
            const setNumber = index + 1;
            const isCompletedSet = isCardio
              ? hasCompletedCardioExecution(props.progress, setNumber)
              : isMovement
                ? hasCompletedMovementExecution(props.progress, setNumber)
              : (props.progress.sets_data ?? []).some((item) => item.set_number === setNumber);
            const isCurrent = showCurrentSetChip && setNumber === props.currentSetNumber;

            return (
              <TouchableOpacity
                key={setNumber}
                style={[styles.setChip, isCompletedSet && styles.setChipCompleted, isCurrent && styles.setChipCurrent]}
                activeOpacity={0.85}
                disabled={isReviewMode || !props.onSelectSet}
                onPress={() => props.onSelectSet?.(setNumber)}
                onLongPress={() => {
                  if (isHistoricalEditMode && isCompletedSet) {
                    props.onDeleteSet?.(setNumber);
                  }
                }}
              >
                <Text style={[styles.setChipTitle, isCompletedSet && styles.setChipTitleCompleted]}>
                  {props.kind === 'strength' ? `S${setNumber}` : `B${setNumber}`}
                </Text>
                <Text style={[styles.setChipValue, isCompletedSet && styles.setChipValueCompleted]} numberOfLines={2}>
                  {chipLabelForSet(setNumber)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.setIndicatorText}>
          {props.kind === 'strength' ? 'Serie' : 'Bloque'} {props.currentSetNumber}/{props.progress.total_sets}
        </Text>
      </View>

      {props.kind === 'strength' && showSegmentEditor ? (
        <StrengthSegmentEditor
          dayExercise={props.dayExercise}
          draft={props.draft}
          isSavingSet={props.isSavingSet ?? false}
          styles={styles}
          accentColor={accentColor}
          placeholderColor={theme.colors.textMuted}
          deleteIconColor={theme.colors.error}
          onStrengthMetricChange={props.onStrengthMetricChange}
          onStrengthMetricCommit={props.onStrengthMetricCommit}
          onAddSegment={props.onAddSegment}
          onRemoveSegment={props.onRemoveSegment}
          onAdvance={primaryAction}
          actionLabel={(() => {
            if (isHistoricalEditMode) return 'Guardar serie';
            const isLastSet = props.currentSetNumber >= props.progress.total_sets;
            if (props.setInProgress) return isLastSet ? 'Finalizar ejercicio' : 'Finalizar serie';
            return isLastSet ? 'Iniciar última serie' : 'Iniciar serie';
          })()}
          actionIcon={(() => {
            if (isHistoricalEditMode) return 'checkmark-circle-outline';
            if (props.setInProgress) return props.currentSetNumber >= props.progress.total_sets ? 'trophy-outline' : 'checkmark-circle-outline';
            return 'play-circle-outline';
          })()}
          onDeleteCurrentSet={
            isHistoricalEditMode && currentSetExists && props.onDeleteSet
              ? () => props.onDeleteSet?.(props.currentSetNumber)
              : undefined
          }
        />
      ) : null}

      {media.gifUrl ? (
        <Modal visible={showGifModal} transparent animationType="fade" onRequestClose={() => setShowGifModal(false)}>
          <View style={styles.gifModalOverlay}>
            <Pressable style={styles.gifModalBackdrop} onPress={() => setShowGifModal(false)} />
            <View style={styles.gifModalCard}>
              <View style={styles.gifModalHeader}>
                <Text style={styles.gifModalTitle} numberOfLines={2}>{exerciseName}</Text>
                <TouchableOpacity style={styles.gifModalCloseButton} onPress={() => setShowGifModal(false)} activeOpacity={0.82}>
                  <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.gifModalScroll}
                contentContainerStyle={styles.gifModalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Image source={{ uri: media.gifUrl }} style={styles.gifModalImage} resizeMode="contain" />
                {exerciseDescription ? (
                  <View style={styles.gifModalDescriptionBlock}>
                    <Text style={styles.gifModalDescriptionLabel}>Descripcion</Text>
                    <Text style={styles.gifModalDescriptionText}>{exerciseDescription}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {!useYouTubeModal && videoUrl ? (
        <VideoPlayerModal
          visible={showVideoModal}
          videoUri={videoUrl}
          exerciseName={exerciseName}
          onClose={() => setShowVideoModal(false)}
        />
      ) : null}

      <YouTubePlayerModal
        visible={showYouTubeModal}
        exerciseName={exerciseName}
        searchName={exercise?.name_en}
        youtubeUrl={useYouTubeModal && videoUrl ? videoUrl : undefined}
        onClose={() => setShowYouTubeModal(false)}
      />
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
    },
    cardBase: {
      width: CARD_WIDTH,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      position: 'relative',
      ...shadows.md,
    },
    mediaArea: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      zIndex: 1,
    },
    mediaPressable: {
      overflow: 'hidden',
    },
    maskContainer: {
      overflow: 'hidden',
    },
    infoAreaContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 2,
    },
    infoBackground: {
      backgroundColor: theme.colors.card,
    },
    infoArea: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 3,
    },
    infoContent: {
      flex: 1,
      paddingLeft: spacing.md,
      paddingTop: spacing.sm,
      paddingRight: spacing.xl,
      paddingBottom: spacing.sm,
    },
    bodyContent: {
      marginTop: spacing.xs,
      alignSelf: 'flex-start',
      flex: 1,
    },
    card: {
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      overflow: 'hidden',
      ...shadows.md,
    },
    topRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    mediaCard: {
      width: 108,
      height: 132,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceAlt,
      position: 'relative',
    },
    exerciseImage: {
      width: '100%',
      height: '100%',
    },
    playButton: {
      position: 'absolute',
      right: spacing.sm,
      bottom: spacing.sm,
      zIndex: 4,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary[500],
    },
    youtubeButton: {
      backgroundColor: YOUTUBE_RED,
    },
    contentColumn: {
      flex: 1,
      gap: spacing.sm,
    },
    headerRow: {
      gap: spacing.xs,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    orderBadge: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      backgroundColor: theme.colors.surfaceAlt,
    },
    orderBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    modeBadge: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderWidth: 1,
    },
    cardioBadge: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    strengthBadge: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
    },
    modeBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    exerciseName: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    exerciseMeta: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    cardioMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    metaPill: {
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    metaPillText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    editorSection: {
      gap: spacing.sm,
    },
    inlineMetricsStack: {
      width: '100%',
      flexShrink: 1,
    },
    inlineStaticMetricsStack: {
      width: '100%',
      paddingTop: spacing.xs,
    },
    inlineGuidanceStack: {
      width: '100%',
      gap: spacing.sm,
    },
    inlineMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    inlineMetricButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    inlineMetricValue: {
      flex: 1,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineMetricInputShell: {
      width: '100%',
      minHeight: 30,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    inlineMetricInputShellFocused: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    inlineMetricInput: {
      paddingVertical: 0,
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    inlineMetricNumber: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
      width: '100%',
    },
    inlineMetricLabel: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    inlineStaticMetricContainer: {
      width: '100%',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineDivider: {
      width: '100%',
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 2,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    metricCard: {
      minWidth: 120,
      flexGrow: 1,
      flexBasis: 120,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.sm,
      gap: spacing.xs,
    },
    metricCardLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    metricStaticValue: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    metricStepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    metricButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    metricInput: {
      flex: 1,
      minHeight: 40,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: spacing.sm,
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    primaryButton: {
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    inlineActionDock: {
      paddingTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    inlineActionDockTouchable: {
      width: '100%',
    },
    primaryButtonGradient: {
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    primaryButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: colors.white,
    },
    inlineEditorSection: {
      flex: 1,
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    setChipSection: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    setChipList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    setChip: {
      minWidth: 74,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...shadows.sm,
    },
    setChipCompleted: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    setChipCurrent: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    setChipTitle: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    setChipTitleCompleted: {
      color: theme.colors.primary,
    },
    setChipValue: {
      marginTop: 2,
      fontSize: fontSize.xs,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    setChipValueCompleted: {
      color: theme.colors.primary,
    },
    setIndicatorText: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
    },
    segmentEditor: {
      marginTop: spacing.sm,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    adaptiveGuidanceBox: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      gap: 4,
    },
    adaptiveGuidanceTitle: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    adaptiveGuidanceReason: {
      fontSize: fontSize.xs,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    segmentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    segmentHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    segmentTitle: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    segmentHint: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? 'rgba(248,113,113,0.12)' : '#fef2f2',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(248,113,113,0.28)' : '#fecaca',
    },
    segmentCard: {
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.sm,
      gap: spacing.sm,
    },
    segmentCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    segmentCardTitle: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    removeText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.error,
    },
    segmentActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    ghostButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    ghostButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    completedOverlayTouchable: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 10,
    },
    blurView: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? 'rgba(8, 17, 31, 0.82)' : 'rgba(59, 130, 246, 0.65)',
    },
    completedOverlayContent: {
      alignItems: 'center',
    },
    checkCircle: {
      width: 56,
      height: 56,
      marginBottom: spacing.sm,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    completedText: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: colors.white,
    },
    tapToEditText: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: 'rgba(255, 255, 255, 0.8)',
    },
    editingBadge: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.xl,
      zIndex: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: colors.primary[500],
    },
    editingBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
      color: colors.white,
    },
    gifModalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    gifModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(3, 7, 18, 0.76)',
    },
    gifModalCard: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '88%',
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      ...shadows.md,
    },
    gifModalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    gifModalTitle: {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    gifModalCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    gifModalScroll: {
      maxHeight: '100%',
    },
    gifModalScrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
    },
    gifModalImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
    },
    gifModalDescriptionBlock: {
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    gifModalDescriptionLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.4,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    gifModalDescriptionText: {
      fontSize: fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    disabled: {
      opacity: 0.6,
    },
  });

export default ExerciseCard;
