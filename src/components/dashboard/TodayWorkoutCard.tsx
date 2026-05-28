import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants/colors';
import { WorkoutCardSkeleton } from '../common/Skeleton';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import type { MuscleVolumeResponse } from '../../types';
import type { ProgramTimelineCardState } from '../../utils/programTimeline';
import { MiniBodyMap, type BodyMapView } from './bodyMap/MiniBodyMap';
import { WorkoutCardBackdrop } from './WorkoutCardBackdrop';

const BASE_CARD_HEIGHT = 272;
const CORNER_RADIUS = borderRadius.xl;

const getChamferHorizontal = (cardWidth: number) => Math.max(84, Math.min(110, cardWidth * 0.16));
const getHorizontalSegment = (cardWidth: number) => Math.max(56, Math.min(88, cardWidth * 0.12));
const CHAMFER_VERTICAL = 45;
const CHAMFER_RADIUS = 12;

const getCardShapePath = (
  w: number,
  h: number,
  r: number,
  chamferH: number,
  chamferV: number,
  hSegment: number,
  cr: number,
) => {
  const x2 = w - chamferH;
  const x3 = w - hSegment;
  const y3 = chamferV;

  const dx = x3 - x2;
  const dy = y3;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  const diagStartX = x2 + cr * ux;
  const diagStartY = cr * uy;
  const diagEndX = x3 - cr * ux;
  const diagEndY = y3 - cr * uy;

  return `
    M ${r},0
    L ${x2 - cr},0
    Q ${x2},0 ${diagStartX},${diagStartY}
    L ${diagEndX},${diagEndY}
    Q ${x3},${y3} ${x3 + cr},${y3}
    L ${w - cr},${y3}
    Q ${w},${y3} ${w},${y3 + cr}
    L ${w},${h - r}
    Q ${w},${h} ${w - r},${h}
    L ${r},${h}
    Q 0,${h} 0,${h - r}
    L 0,${r}
    Q 0,0 ${r},0
    Z
  `;
};

const getCardShape = (cardWidth: number, cardHeight: number) => {
  const chamferHorizontal = getChamferHorizontal(cardWidth);
  const horizontalSegment = getHorizontalSegment(cardWidth);

  return {
    chamferHorizontal,
    path: getCardShapePath(
      cardWidth,
      cardHeight,
      CORNER_RADIUS,
      chamferHorizontal,
      CHAMFER_VERTICAL,
      horizontalSegment,
      CHAMFER_RADIUS,
    ),
  };
};

const CardMask: React.FC<{ cardWidth: number; cardHeight: number; shapePath: string }> = ({
  cardWidth,
  cardHeight,
  shapePath,
}) => (
  <Svg width={cardWidth} height={cardHeight}>
    <Path d={shapePath} fill="black" />
  </Svg>
);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TodayWorkoutCardProps {
  cardState: ProgramTimelineCardState;
  onStartPress: () => void;
  onOpenSessions?: () => void;
  isLoading?: boolean;
  muscleVolume?: MuscleVolumeResponse | null;
  isMuscleVolumeLoading?: boolean;
  contentWidth?: number;
  horizontalPadding?: number;
  isTabletPortrait?: boolean;
  compact?: boolean;
}

const getEmptyIconName = (
  reason: 'no-program' | 'rest' | 'no-scheduled' | 'no-pending' | 'no-executed',
) => {
  if (reason === 'rest') {
    return 'leaf-outline';
  }

  if (reason === 'no-pending') {
    return 'checkmark-done-circle-outline';
  }

  if (reason === 'no-executed') {
    return 'time-outline';
  }

  return 'calendar-outline';
};

export const TodayWorkoutCard: React.FC<TodayWorkoutCardProps> = ({
  cardState,
  onStartPress,
  onOpenSessions,
  isLoading,
  muscleVolume,
  isMuscleVolumeLoading = false,
  contentWidth,
  horizontalPadding = spacing.md,
  isTabletPortrait = false,
  compact = false,
}) => {
  const scale = useSharedValue(1);
  const [bodyMapView, setBodyMapView] = useState<BodyMapView>('anterior');
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const availableWidth = Math.max(320, (contentWidth ?? 0) - horizontalPadding * 2);
  const cardWidth = availableWidth;
  const cardHeight = isTabletPortrait ? 280 : compact ? 228 : BASE_CARD_HEIGHT;
  const cardShape = getCardShape(cardWidth, cardHeight);
  const chamferHorizontal = cardShape.chamferHorizontal;
  const currentTrainingDayId =
    cardState.kind === 'session' ? cardState.trainingDay.id : null;
  const bodyMapLayout = useMemo(() => {
    if (compact && !isTabletPortrait) {
      return {
        panelWidth: cardWidth < 350 ? 88 : 102,
        panelHeight: cardWidth < 350 ? 130 : 138,
        canvasWidth: cardWidth < 350 ? 64 : 76,
        canvasHeight: cardWidth < 350 ? 108 : 120,
        canvasShellHeight: cardWidth < 350 ? 108 : 120,
      };
    }

    if (isTabletPortrait) {
      return {
        panelWidth: 116,
        panelHeight: 166,
        canvasWidth: 84,
        canvasHeight: 136,
        canvasShellHeight: 140,
      };
    }

    if (cardWidth < 350) {
      return {
        panelWidth: 96,
        panelHeight: 152,
        canvasWidth: 70,
        canvasHeight: 122,
        canvasShellHeight: 126,
      };
    }

    return {
      panelWidth: 106,
      panelHeight: 158,
      canvasWidth: 78,
      canvasHeight: 128,
      canvasShellHeight: 132,
    };
  }, [cardWidth, compact, isTabletPortrait]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    setBodyMapView('anterior');
  }, [currentTrainingDayId]);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  if (isLoading) {
    return (
      <View style={[styles.skeletonWrapper, { marginHorizontal: horizontalPadding }]}>
        <WorkoutCardSkeleton />
      </View>
    );
  }

  if (cardState.kind === 'empty') {
    return (
      <View style={[styles.emptyContainer, { marginHorizontal: horizontalPadding }]}>
        <Ionicons name={getEmptyIconName(cardState.reason)} size={48} color={colors.gray[300]} />
        {cardState.dateLabel ? (
          <View style={styles.emptyDatePill}>
            <Text style={styles.emptyDateText}>{cardState.dateLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.emptyTitle}>{cardState.title}</Text>
        <Text style={styles.emptySubtitle}>{cardState.subtitle}</Text>
      </View>
    );
  }

  const { trainingDay, session } = cardState;
  const totalSets = trainingDay.total_sets;
  const estimatedMinutes = Math.round(totalSets * 3);
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = estimatedMinutes % 60;
  const durationText = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  const sessionCaption = `Sesion ${trainingDay.session_index}`;
  const isOverdueRecommendation = cardState.recommendation === 'overdue';
  const durationContainerWidth = compact
    ? Math.max(70, chamferHorizontal - spacing.md)
    : Math.max(chamferHorizontal - spacing.xs, 84);
  const currentMuscleVolume =
    muscleVolume?.training_day_id === trainingDay.id ? muscleVolume : null;
  const bodyMapMuscles = currentMuscleVolume?.muscles ?? [];
  const showNeutralBodyMapLoadingState = isMuscleVolumeLoading && !currentMuscleVolume;

  return (
    <AnimatedPressable
      style={[
        styles.container,
        compact ? styles.containerCompact : null,
        { marginHorizontal: horizontalPadding },
        animatedStyle,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onStartPress}
    >
      <MaskedView
        style={[styles.cardContainer, { width: cardWidth, height: cardHeight }]}
        maskElement={
          <CardMask
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            shapePath={cardShape.path}
          />
        }
      >
        <View style={[styles.cardSurface, { width: cardWidth, height: cardHeight }]}>
          <WorkoutCardBackdrop
            cardState={cardState}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            shapePath={cardShape.path}
          />
          <View style={[styles.content, compact ? styles.contentCompact : null]}>
            <View style={styles.heroTopContent}>
              <View style={[styles.headerMeta, compact ? styles.headerMetaCompact : null]}>
                <View style={styles.dayBadge}>
                  <BlurView
                    intensity={50}
                    tint={theme.colors.blurTint}
                    style={[styles.dayBadgeBlur, compact ? styles.dayBadgeBlurCompact : null]}
                  >
                    <Text style={styles.dayBadgeText}>{cardState.dateLabel}</Text>
                  </BlurView>
                </View>
              </View>

              <View style={[styles.heroBody, compact ? styles.heroBodyCompact : null]}>
                <View style={[styles.titleArea, compact ? styles.titleAreaCompact : null]}>
                  {isOverdueRecommendation ? (
                    <View style={[styles.overduePill, compact ? styles.metaPillCompact : null]}>
                      <Text style={styles.overduePillText}>Entrenamiento atrasado</Text>
                    </View>
                  ) : null}
                  <View style={[styles.sessionPill, compact ? styles.metaPillCompact : null]}>
                    <Text style={styles.sessionPillText}>{sessionCaption}</Text>
                  </View>
                  <Text style={[styles.title, compact ? styles.titleCompact : null]} numberOfLines={compact ? 1 : undefined}>
                    {trainingDay.name}
                  </Text>
                  {trainingDay.focus ? (
                    <Text style={styles.focusText} numberOfLines={compact ? 1 : undefined}>
                      {trainingDay.focus}
                    </Text>
                  ) : null}
                  {isOverdueRecommendation ? (
                    <Text style={styles.recommendationText} numberOfLines={compact ? 1 : undefined}>
                      Completa esta sesion primero.
                    </Text>
                  ) : null}
                  <Text style={styles.complianceText}>
                    Avance: {Math.round(session.completion_percentage)}%
                  </Text>
                </View>

                <View
                  style={[
                    styles.bodyMapPanel,
                    compact ? styles.bodyMapPanelCompact : null,
                    {
                      width: bodyMapLayout.panelWidth,
                      height: bodyMapLayout.panelHeight,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.bodyMapCanvasShell,
                      compact ? styles.bodyMapCanvasShellCompact : null,
                      { height: bodyMapLayout.canvasShellHeight },
                    ]}
                  >
                    <View
                      style={[
                        styles.bodyMapCanvas,
                        showNeutralBodyMapLoadingState ? styles.bodyMapCanvasLoading : null,
                      ]}
                    >
                      <View style={[styles.bodyMapFigure, compact ? styles.bodyMapFigureCompact : null]}>
                        <MiniBodyMap
                          muscles={bodyMapMuscles}
                          view={bodyMapView}
                          width={bodyMapLayout.canvasWidth}
                          height={bodyMapLayout.canvasHeight}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={[styles.bodyMapToggle, compact ? styles.bodyMapToggleCompact : null]}>
                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={() => setBodyMapView('anterior')}
                      style={[
                        styles.bodyMapToggleButton,
                        compact ? styles.bodyMapToggleButtonCompact : null,
                        bodyMapView === 'anterior' ? styles.bodyMapToggleButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bodyMapToggleButtonText,
                          bodyMapView === 'anterior' ? styles.bodyMapToggleButtonTextActive : null,
                        ]}
                      >
                        Ant
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={() => setBodyMapView('posterior')}
                      style={[
                        styles.bodyMapToggleButton,
                        compact ? styles.bodyMapToggleButtonCompact : null,
                        bodyMapView === 'posterior' ? styles.bodyMapToggleButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bodyMapToggleButtonText,
                          bodyMapView === 'posterior' ? styles.bodyMapToggleButtonTextActive : null,
                        ]}
                      >
                        Post
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.actionsRow, compact ? styles.actionsRowCompact : null]}>
              <TouchableOpacity
                style={styles.startButton}
                onPress={onStartPress}
                activeOpacity={0.9}
              >
                <BlurView
                  intensity={80}
                  tint={theme.colors.blurTint}
                  style={[styles.startButtonBlur, compact ? styles.startButtonBlurCompact : null]}
                >
                  <Text style={styles.startButtonText}>{cardState.actionLabel}</Text>
                  <View style={[styles.arrowCircle, compact ? styles.arrowCircleCompact : null]}>
                    <Ionicons name="arrow-forward" size={compact ? 16 : 18} color={theme.colors.primary} />
                  </View>
                </BlurView>
              </TouchableOpacity>

              {cardState.hasMultipleSessions ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onOpenSessions}
                  activeOpacity={0.86}
                >
                  <BlurView intensity={50} tint={theme.colors.blurTint} style={styles.secondaryButtonBlur}>
                    <Ionicons name="layers-outline" size={16} color={colors.white} />
                    <Text style={styles.secondaryButtonText}>ver sesiones</Text>
                  </BlurView>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </MaskedView>

      <View
        pointerEvents="none"
        style={[
          styles.durationContainer,
          compact ? styles.durationContainerCompact : null,
          {
            width: durationContainerWidth,
          },
        ]}
      >
        <Text
          style={[styles.durationLabel, compact ? styles.durationLabelCompact : null]}
          numberOfLines={1}
        >
          Duracion
        </Text>
        <Text
          style={[styles.durationValue, compact ? styles.durationValueCompact : null]}
          numberOfLines={1}
        >
          {durationText}
        </Text>
      </View>
    </AnimatedPressable>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      marginVertical: spacing.md,
      position: 'relative',
    },
    containerCompact: {
      marginVertical: spacing.sm,
    },
    skeletonWrapper: {
      marginVertical: spacing.md,
    },
    durationContainer: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.sm,
      zIndex: 20,
      alignItems: 'flex-end',
    },
    durationContainerCompact: {
      top: 3,
      right: 2,
    },
    durationLabel: {
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      fontWeight: '600',
      textAlign: 'right',
    },
    durationLabelCompact: {
      fontSize: 11,
      lineHeight: 13,
    },
    durationValue: {
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
      fontWeight: '700',
      marginTop: 2,
      textAlign: 'right',
    },
    durationValueCompact: {
      fontSize: 12,
      lineHeight: 15,
      marginTop: 0,
    },
    cardContainer: {
      overflow: 'hidden',
      borderRadius: CORNER_RADIUS,
      ...shadows.lg,
    },
    cardSurface: {
      flex: 1,
    },
    content: {
      flex: 1,
      padding: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: 36,
      justifyContent: 'flex-start',
    },
    contentCompact: {
      padding: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    headerMeta: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      minHeight: 28,
    },
    headerMetaCompact: {
      minHeight: 24,
    },
    heroTopContent: {
      minWidth: 0,
    },
    dayBadge: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    dayBadgeBlur: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    dayBadgeBlurCompact: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    dayBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: '600',
      color: colors.white,
    },
    titleArea: {
      flex: 1,
      minWidth: 0,
      marginTop: 4,
    },
    titleAreaCompact: {
      marginTop: 0,
    },
    heroBody: {
      width: '100%',
      marginTop: spacing.xs,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    heroBodyCompact: {
      marginTop: 2,
      gap: spacing.xs,
    },
    bodyMapPanel: {
      marginLeft: 'auto',
      flexShrink: 0,
      paddingTop: spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingBottom: spacing.xs,
      marginTop: 2,
      borderRadius: borderRadius.lg,
      backgroundColor: 'rgba(7, 18, 30, 0.42)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 4,
    },
    bodyMapPanelCompact: {
      paddingTop: 5,
      paddingHorizontal: 4,
      paddingBottom: 5,
      borderRadius: borderRadius.md,
    },
    bodyMapCanvasShell: {
      width: '100%',
      paddingTop: 6,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: borderRadius.md,
    },
    bodyMapCanvasShellCompact: {
      paddingTop: 0,
    },
    bodyMapCanvas: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bodyMapCanvasLoading: {
      opacity: 0.76,
    },
    bodyMapFigure: {
      transform: [{ translateY: 6 }],
    },
    bodyMapFigureCompact: {
      transform: [{ translateY: 0 }],
    },
    bodyMapToggle: {
      flexDirection: 'row',
      marginTop: spacing.xs,
      padding: 3,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    bodyMapToggleCompact: {
      marginTop: 4,
      padding: 2,
    },
    bodyMapToggleButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    bodyMapToggleButtonCompact: {
      paddingVertical: 5,
    },
    bodyMapToggleButtonActive: {
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    bodyMapToggleButtonText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    bodyMapToggleButtonTextActive: {
      color: colors.white,
    },
    sessionPill: {
      alignSelf: 'flex-start',
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.24)',
    },
    metaPillCompact: {
      marginBottom: 4,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    sessionPillText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: colors.white,
      letterSpacing: 0.3,
    },
    overduePill: {
      alignSelf: 'flex-start',
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(245, 158, 11, 0.18)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.4)',
    },
    overduePillText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: colors.white,
      letterSpacing: 0.3,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: 'bold',
      color: colors.white,
      lineHeight: 32,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 3,
    },
    titleCompact: {
      fontSize: fontSize.xl,
      lineHeight: 26,
    },
    focusText: {
      fontSize: fontSize.sm,
      color: 'rgba(255,255,255,0.8)',
      marginTop: spacing.xs,
    },
    recommendationText: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.92)',
      lineHeight: 17,
    },
    complianceText: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
      lineHeight: 17,
    },
    actionsRow: {
      marginTop: 'auto',
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    actionsRowCompact: {
      paddingTop: spacing.xs,
      paddingBottom: 0,
      gap: spacing.xs,
    },
    startButton: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    startButtonBlur: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.lg,
      paddingRight: 6,
      paddingVertical: 6,
      backgroundColor: theme.isDark ? 'rgba(8,17,31,0.84)' : 'rgba(255,255,255,0.9)',
    },
    startButtonBlurCompact: {
      paddingLeft: spacing.md,
      paddingVertical: 5,
    },
    startButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '500',
      color: theme.colors.textPrimary,
      marginRight: spacing.sm,
      textTransform: 'lowercase',
    },
    arrowCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowCircleCompact: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    secondaryButton: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    secondaryButtonBlur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    secondaryButtonText: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: colors.white,
      textTransform: 'lowercase',
    },
    emptyContainer: {
      marginVertical: spacing.md,
      padding: spacing.xl,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      ...shadows.sm,
    },
    emptyDatePill: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyDateText: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      marginTop: spacing.md,
    },
    emptySubtitle: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });

export default TodayWorkoutCard;
