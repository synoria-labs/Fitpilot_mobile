import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandColors, fontSize } from '../../constants/colors';
import { useThemedStyles, type AppTheme } from '../../theme';
import { AURORA_SIGNATURE_ANGLE, auroraFont } from '../../theme/aurora';

const HERO_GEOMETRY = Object.freeze({
  canvasWidth: 100,
  topBox: Object.freeze({
    x: 26.63,
    y: 15.48,
    width: 31.3,
    height: 24.41,
  }),
  circleAnchor: Object.freeze({
    x: 57.53,
    y: 71.54,
  }),
  footprint: Object.freeze({
    minX: 26.63,
    maxX: 73.37,
  }),
});
const HERO_CIRCLE_RADIUS_RATIO = 0.125;
const HERO_GRADIENT_COLORS = [brandColors.navy, brandColors.sky] as const;

export type SharedWeeklyCalendarVariant =
  | 'default'
  | 'partial'
  | 'complete'
  | 'rest'
  | 'missed'
  | 'diet';

export type SharedWeeklyCalendarHeroSelectionMode = 'selected-or-today' | 'selected-only';
export type SharedWeeklyCalendarDensity = 'default' | 'tight-top' | 'compact';

export interface SharedWeeklyCalendarDay {
  id: string;
  dateKey: string;
  dayLabel: string;
  dateNumber: string | number;
  isSelected: boolean;
  isToday: boolean;
  isDisabled?: boolean;
  statusText: string;
  variant: SharedWeeklyCalendarVariant;
  showHero?: boolean;
  onPress?: () => void;
}

interface SharedWeeklyCalendarProps {
  days: SharedWeeklyCalendarDay[];
  heroSelectionMode?: SharedWeeklyCalendarHeroSelectionMode;
  density?: SharedWeeklyCalendarDensity;
  contentWidth?: number;
  isTabletPortrait?: boolean;
}

interface CalendarMetrics {
  usableWidth: number;
  dayGap: number;
  shapeSize: number;
  circleRadius: number;
  defaultSlotWidth: number;
  baseSlotWidth: number;
  selectedSlotWidth: number;
  textContainerLeft: number;
  textContainerTop: number;
  textContainerWidth: number;
  textContainerHeight: number;
  circleCenterX: number;
  circleCenterY: number;
  footprintMinXScaled: number;
  footprintMaxXScaled: number;
  heroEdgeGutter: number;
}

type HeroCapsuleMetrics = {
  top: number;
  height: number;
  width: number;
  /** How far the top and bottom lean away from the capsule's centre line. */
  lean: number;
  shiftStatus: number;
  shiftLabel: number;
  shiftCircle: number;
};

// The selected day is a capsule leaning at the brand's 14°, the same angle as the today
// card's chamfer. Its content stays upright and is shifted along the lean instead.
const HeroCapsule: React.FC<{ slotWidth: number; capsule: HeroCapsuleMetrics; offset: number }> = ({
  slotWidth,
  capsule,
  offset,
}) => (
  <LinearGradient
    colors={HERO_GRADIENT_COLORS}
    start={{ x: 0.2, y: 0 }}
    end={{ x: 0.8, y: 1 }}
    style={[
      staticStyles.heroCapsule,
      {
        left: (slotWidth - capsule.width) / 2 + offset,
        top: capsule.top,
        width: capsule.width,
        height: capsule.height,
        borderRadius: capsule.width / 2,
        transform: [{ skewX: `${AURORA_SIGNATURE_ANGLE}deg` }],
      },
    ]}
  />
);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getShowSpecialShape = (
  day: SharedWeeklyCalendarDay,
  heroSelectionMode: SharedWeeklyCalendarHeroSelectionMode,
) => {
  if (day.showHero === false) {
    return false;
  }

  if (heroSelectionMode === 'selected-only') {
    return day.isSelected;
  }

  return day.isSelected || day.isToday;
};

const getStatusTextStyle = (
  day: SharedWeeklyCalendarDay,
  styles: ReturnType<typeof createStyles>,
) => {
  switch (day.variant) {
    case 'rest':
      return styles.statusRest;
    case 'missed':
      return styles.statusMissed;
    case 'complete':
      return styles.statusComplete;
    case 'partial':
      return styles.statusPartial;
    case 'diet':
      return day.isToday ? styles.statusDietToday : styles.status;
    default:
      return styles.status;
  }
};

const getDayLabelStyle = (
  day: SharedWeeklyCalendarDay,
  styles: ReturnType<typeof createStyles>,
) => {
  if (day.isSelected && day.showHero === false) {
    return [styles.dayLabel, styles.dayLabelSelected];
  }

  if (day.variant === 'rest') {
    return [styles.dayLabel, styles.dayLabelRest];
  }

  return styles.dayLabel;
};

const getDateCircleStyle = (
  day: SharedWeeklyCalendarDay,
  styles: ReturnType<typeof createStyles>,
) => {
  if (day.isSelected && day.showHero === false) {
    return [styles.dateCircle, styles.dateCircleSelectedGhost];
  }

  switch (day.variant) {
    case 'rest':
      return [styles.dateCircle, styles.dateCircleRest];
    case 'missed':
      return [styles.dateCircle, styles.dateCircleMissed];
    case 'complete':
      return [styles.dateCircle, styles.dateCircleComplete];
    case 'partial':
      return [styles.dateCircle, styles.dateCirclePartial];
    case 'diet':
      return day.isToday ? [styles.dateCircle, styles.dateCircleDietToday] : styles.dateCircle;
    default:
      return styles.dateCircle;
  }
};

const getDateNumberStyle = (
  day: SharedWeeklyCalendarDay,
  styles: ReturnType<typeof createStyles>,
) => {
  if (day.isSelected && day.showHero === false) {
    return [styles.dateNumber, styles.dateNumberSelectedGhost];
  }

  switch (day.variant) {
    case 'rest':
      return [styles.dateNumber, styles.dateNumberRest];
    case 'missed':
      return [styles.dateNumber, styles.dateNumberMissed];
    case 'complete':
      return [styles.dateNumber, styles.dateNumberComplete];
    case 'partial':
      return [styles.dateNumber, styles.dateNumberPartial];
    case 'diet':
      return day.isToday ? [styles.dateNumber, styles.dateNumberDietToday] : styles.dateNumber;
    default:
      return styles.dateNumber;
  }
};

export const SharedWeeklyCalendar: React.FC<SharedWeeklyCalendarProps> = ({
  days,
  heroSelectionMode = 'selected-or-today',
  density = 'default',
  contentWidth = 390,
  isTabletPortrait = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const isCompactDensity = density === 'compact';
  const heroDayIndex = useMemo(
    () => days.findIndex((day) => getShowSpecialShape(day, heroSelectionMode)),
    [days, heroSelectionMode],
  );
  const hasHero = heroDayIndex !== -1;

  const metrics = useMemo<CalendarMetrics>(() => {
    const usableWidth = Math.max(0, contentWidth);
    const isCompactWidth = usableWidth < 390;
    const isTablet = usableWidth >= 720;
    const dayGap = isCompactDensity
      ? isTablet
        ? 6
        : 3
      : isTabletPortrait
        ? 4
        : isTablet
          ? 8
          : isCompactWidth
            ? 4
            : 6;
    const minBaseSlotWidth = isTabletPortrait ? 36 : isTablet ? 42 : isCompactWidth ? 28 : 34;
    const maxBaseSlotWidth = isTabletPortrait ? 56 : isTablet ? 68 : isCompactWidth ? 42 : 54;
    const computedSlotWidth = (usableWidth - dayGap * 6) / 7;
    const defaultSlotWidth = clamp(computedSlotWidth, minBaseSlotWidth, maxBaseSlotWidth);
    const idealShapeSize = isCompactDensity
      ? Math.max(
          defaultSlotWidth + 32,
          Math.min(
            isTablet ? 112 : 104,
            defaultSlotWidth + (isTabletPortrait ? 46 : isTablet ? 50 : 62),
          ),
        )
      : Math.max(
          defaultSlotWidth + (isTabletPortrait ? 34 : isTablet ? 42 : 50),
          Math.min(
            isTabletPortrait ? 112 : isTablet ? 128 : 132,
            defaultSlotWidth + (isTabletPortrait ? 56 : isTablet ? 74 : 86),
          ),
        );
    const heroSafePadding = isCompactDensity
      ? isTablet
        ? 8
        : 4
      : isTabletPortrait
        ? 4
        : isTablet
          ? 10
          : isCompactWidth
            ? 6
            : 8;
    const heroFootprintWidthRatio =
      (HERO_GEOMETRY.footprint.maxX - HERO_GEOMETRY.footprint.minX) / HERO_GEOMETRY.canvasWidth;
    const maxSelectedSlotWidth = Math.max(
      defaultSlotWidth,
      usableWidth - dayGap * 6 - minBaseSlotWidth * 6,
    );
    const maxShapeSizeForLayout =
      (maxSelectedSlotWidth - heroSafePadding) / heroFootprintWidthRatio;
    const shapeSize = hasHero
      ? Math.min(idealShapeSize, maxShapeSizeForLayout)
      : idealShapeSize;
    const selectedSlotWidth = hasHero
      ? heroFootprintWidthRatio * shapeSize + heroSafePadding
      : defaultSlotWidth;
    const baseSlotWidth = hasHero
      ? (usableWidth - dayGap * 6 - selectedSlotWidth) / 6
      : defaultSlotWidth;
    const circleRadius = Math.max(
      isCompactDensity ? 15 : 16,
      Math.min(isCompactDensity ? 16 : 20, shapeSize * HERO_CIRCLE_RADIUS_RATIO),
    );
    const scale = shapeSize / HERO_GEOMETRY.canvasWidth;
    const circleCenterX = HERO_GEOMETRY.circleAnchor.x * scale;
    const footprintMinXScaled = HERO_GEOMETRY.footprint.minX * scale;
    const footprintMaxXScaled = HERO_GEOMETRY.footprint.maxX * scale;

    return {
      usableWidth,
      dayGap,
      shapeSize,
      circleRadius,
      defaultSlotWidth,
      baseSlotWidth,
      selectedSlotWidth,
      textContainerLeft: HERO_GEOMETRY.topBox.x * scale,
      textContainerTop: HERO_GEOMETRY.topBox.y * scale,
      textContainerWidth: HERO_GEOMETRY.topBox.width * scale,
      textContainerHeight: HERO_GEOMETRY.topBox.height * scale,
      circleCenterX,
      circleCenterY: HERO_GEOMETRY.circleAnchor.y * scale,
      footprintMinXScaled,
      footprintMaxXScaled,
      heroEdgeGutter: isTabletPortrait ? 0 : isTablet ? 8 : isCompactWidth ? 2 : 4,
    };
  }, [contentWidth, hasHero, isCompactDensity, isTabletPortrait]);

  const heroCapsule = useMemo<HeroCapsuleMetrics>(() => {
    const top = Math.max(0, metrics.textContainerTop - 8);
    const bottom = Math.min(metrics.shapeSize, metrics.circleCenterY + metrics.circleRadius + 6);
    const height = Math.max(0, bottom - top);
    const centerY = top + height / 2;
    const slope = Math.tan((AURORA_SIGNATURE_ANGLE * Math.PI) / 180);
    // Each line moves to the capsule's centre at its own height: up is left, down is right.
    const shiftAt = (y: number) => (y - centerY) * slope;
    return {
      top,
      height,
      width: metrics.circleRadius * 2 + 10,
      lean: (height / 2) * slope,
      shiftStatus: shiftAt(metrics.textContainerTop + 7),
      shiftLabel: shiftAt(metrics.textContainerTop + 22),
      shiftCircle: shiftAt(metrics.circleCenterY),
    };
  }, [metrics.circleCenterY, metrics.circleRadius, metrics.shapeSize, metrics.textContainerTop]);

  const slotLayouts = useMemo(() => {
    let startX = 0;

    return days.map((_, index) => {
      const showSpecialShape = index === heroDayIndex;
      const width = showSpecialShape
        ? metrics.selectedSlotWidth
        : hasHero
          ? metrics.baseSlotWidth
          : metrics.defaultSlotWidth;
      const layout = {
        width,
        startX,
        showSpecialShape,
      };

      startX += width + metrics.dayGap;
      return layout;
    });
  }, [
    days,
    hasHero,
    heroDayIndex,
    metrics.baseSlotWidth,
    metrics.dayGap,
    metrics.defaultSlotWidth,
    metrics.selectedSlotWidth,
  ]);

  const rowWidth = useMemo(() => {
    const lastSlot = slotLayouts[slotLayouts.length - 1];
    return lastSlot ? lastSlot.startX + lastSlot.width : 0;
  }, [slotLayouts]);

  return (
    <View
      style={[
        styles.container,
        density === 'tight-top' ? styles.containerTightTop : null,
        isCompactDensity ? styles.containerCompact : null,
      ]}
    >
        <View
          style={[
            styles.daysRow,
            {
              gap: metrics.dayGap,
              width: metrics.usableWidth || undefined,
            },
          ]}
        >
        {days.map((day, index) => {
          const slotLayout = slotLayouts[index];
          const showSpecialShape = slotLayout?.showSpecialShape ?? false;
          const statusText = day.statusText || ' ';
          const slotWidth = slotLayout?.width ?? metrics.defaultSlotWidth;
          // On the first and last day the leaning corners would cross the row's edge: slide the
          // capsule, and its content with it, back inside.
          const capsuleReach = heroCapsule.width / 2 + heroCapsule.lean;
          const capsuleCentre = (slotLayout?.startX ?? 0) + slotWidth / 2;
          const heroOffset =
            showSpecialShape && slotLayout
              ? clamp(
                  0,
                  metrics.heroEdgeGutter + capsuleReach - capsuleCentre,
                  rowWidth - metrics.heroEdgeGutter - capsuleReach - capsuleCentre,
                )
              : 0;

          return (
            <TouchableOpacity
              key={day.id}
              style={[
                styles.dayColumn,
                { width: slotWidth, height: metrics.shapeSize },
              ]}
              onPress={day.onPress}
              disabled={day.isDisabled}
              activeOpacity={0.85}
              hitSlop={isCompactDensity ? 4 : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${day.statusText ? `${day.statusText}, ` : ''}${day.dayLabel} ${day.dateNumber}`}
              accessibilityState={{
                disabled: Boolean(day.isDisabled),
                selected: day.isSelected,
              }}
            >
              {showSpecialShape ? (
                <View
                  pointerEvents="none"
                  style={[styles.heroSlot, { width: slotWidth, height: metrics.shapeSize }]}
                >
                  <View
                    style={[
                      styles.shapeContainer,
                      {
                        left: 0,
                        width: slotWidth,
                        height: metrics.shapeSize,
                      },
                    ]}
                  >
                    <HeroCapsule slotWidth={slotWidth} capsule={heroCapsule} offset={heroOffset} />

                    <View
                      style={[
                        styles.textContainerHighlighted,
                        {
                          left: 0,
                          top: metrics.textContainerTop,
                          width: slotWidth,
                          height: metrics.textContainerHeight,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusHighlighted,
                          isCompactDensity ? styles.statusHighlightedCompact : null,
                          { transform: [{ translateX: heroCapsule.shiftStatus + heroOffset }] },
                        ]}
                      >
                        {statusText}
                      </Text>
                      <Text
                        style={[
                          styles.dayLabelHighlighted,
                          isCompactDensity ? styles.dayLabelHighlightedCompact : null,
                          { transform: [{ translateX: heroCapsule.shiftLabel + heroOffset }] },
                        ]}
                      >
                        {day.dayLabel}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.circleContainerHighlighted,
                        {
                          left: slotWidth / 2 - metrics.circleRadius,
                          top: metrics.circleCenterY - metrics.circleRadius,
                          transform: [{ translateX: heroCapsule.shiftCircle + heroOffset }],
                          width: metrics.circleRadius * 2,
                          height: metrics.circleRadius * 2,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.dateCircleHighlighted,
                          {
                            width: metrics.circleRadius * 2,
                            height: metrics.circleRadius * 2,
                            borderRadius: metrics.circleRadius,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateNumberHighlighted,
                            isCompactDensity ? styles.dateNumberHighlightedCompact : null,
                          ]}
                        >
                          {day.dateNumber}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.dayContent,
                    day.variant === 'rest' && styles.dayContentRest,
                    { paddingTop: metrics.textContainerTop },
                  ]}
                >
                  <Text
                    style={[
                      getStatusTextStyle(day, styles),
                      isCompactDensity ? styles.statusCompact : null,
                    ]}
                  >
                    {statusText}
                  </Text>
                  <Text
                    style={[
                      getDayLabelStyle(day, styles),
                      isCompactDensity ? styles.dayLabelCompact : null,
                    ]}
                  >
                    {day.dayLabel}
                  </Text>
                  <View
                    style={[
                      styles.dateCircleContainer,
                      { top: metrics.circleCenterY - metrics.circleRadius },
                    ]}
                  >
                    <View
                      style={[
                        getDateCircleStyle(day, styles),
                        {
                          width: metrics.circleRadius * 2,
                          height: metrics.circleRadius * 2,
                          borderRadius: metrics.circleRadius,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          getDateNumberStyle(day, styles),
                          isCompactDensity ? styles.dateNumberCompact : null,
                        ]}
                      >
                        {day.dateNumber}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      paddingTop: 12,
      paddingBottom: 12,
      overflow: 'visible',
    },
    containerTightTop: {
      paddingTop: 2,
      paddingBottom: 10,
      overflow: 'visible',
    },
    containerCompact: {
      paddingTop: 0,
      paddingBottom: 2,
    },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'visible',
    },
    dayColumn: {
      alignItems: 'center',
      position: 'relative',
      overflow: 'visible',
    },
    heroSlot: {
      position: 'relative',
      overflow: 'visible',
    },
    shapeContainer: {
      position: 'absolute',
      top: 0,
      overflow: 'visible',
    },
    dayContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    dayContentRest: {
      opacity: theme.isDark ? 0.96 : 1,
    },
    textContainerHighlighted: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusHighlighted: {
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
      color: theme.colors.surface,
      lineHeight: 16,
    },
    statusHighlightedCompact: {
      fontSize: 10,
      lineHeight: 12,
    },
    dayLabelHighlighted: {
      marginTop: 2,
      fontSize: fontSize.xs,
      ...auroraFont('semibold'),
      color: theme.colors.surface,
      lineHeight: 16,
    },
    dayLabelHighlightedCompact: {
      marginTop: 0,
      fontSize: 10,
      lineHeight: 12,
    },
    circleContainerHighlighted: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCircleHighlighted: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    dateNumberHighlighted: {
      fontSize: fontSize.base,
      ...auroraFont('extrabold'),
      color: theme.colors.primary,
      lineHeight: 22,
    },
    dateNumberHighlightedCompact: {
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    status: {
      fontSize: fontSize.xs,
      ...auroraFont('bold'),
      color: theme.colors.textSecondary,
      lineHeight: 16,
    },
    statusRest: {
      color: theme.colors.success,
    },
    statusMissed: {
      color: theme.colors.warning,
    },
    statusComplete: {
      color: theme.colors.primary,
    },
    statusPartial: {
      color: theme.colors.primary,
    },
    statusDietToday: {
      color: theme.colors.primary,
    },
    statusCompact: {
      fontSize: 10,
      lineHeight: 12,
    },
    dayLabel: {
      marginTop: 2,
      fontSize: fontSize.xs,
      ...auroraFont('medium'),
      color: theme.colors.textMuted,
      lineHeight: 16,
    },
    dayLabelCompact: {
      marginTop: 0,
      fontSize: 10,
      lineHeight: 14,
    },
    dayLabelSelected: {
      color: theme.colors.primary,
      ...auroraFont('bold'),
    },
    dayLabelRest: {
      color: theme.colors.success,
    },
    dateCircleContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCircle: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: Platform.OS === 'android' && theme.isDark ? 0 : 1,
      borderColor: theme.colors.border,
    },
    dateCircleSelectedGhost: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    dateCircleRest: {
      backgroundColor: theme.isDark ? 'rgba(52, 211, 153, 0.18)' : 'rgba(16, 185, 129, 0.14)',
      borderColor: theme.isDark ? 'rgba(52, 211, 153, 0.32)' : 'rgba(16, 185, 129, 0.22)',
    },
    dateCircleMissed: {
      backgroundColor: theme.isDark ? 'rgba(248, 113, 113, 0.16)' : 'rgba(239, 68, 68, 0.08)',
      borderColor: theme.isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(239, 68, 68, 0.16)',
    },
    dateCircleComplete: {
      backgroundColor: theme.isDark ? 'rgba(52, 211, 153, 0.2)' : 'rgba(16, 185, 129, 0.12)',
      borderColor: theme.isDark ? 'rgba(52, 211, 153, 0.34)' : 'rgba(16, 185, 129, 0.2)',
    },
    dateCirclePartial: {
      backgroundColor: theme.isDark ? 'rgba(96, 165, 250, 0.18)' : 'rgba(59, 130, 246, 0.1)',
      borderColor: theme.isDark ? 'rgba(96, 165, 250, 0.32)' : 'rgba(59, 130, 246, 0.18)',
    },
    dateCircleDietToday: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primaryBorder,
    },
    dateNumber: {
      fontSize: fontSize.base,
      ...auroraFont('semibold'),
      color: theme.colors.textPrimary,
      lineHeight: 22,
    },
    dateNumberCompact: {
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    dateNumberSelectedGhost: {
      color: theme.colors.primary,
      ...auroraFont('bold'),
    },
    dateNumberRest: {
      color: theme.colors.success,
    },
    dateNumberMissed: {
      color: theme.colors.error,
    },
    dateNumberComplete: {
      color: theme.colors.success,
    },
    dateNumberPartial: {
      color: theme.colors.primary,
    },
    dateNumberDietToday: {
      color: theme.colors.primary,
    },
  });

export default SharedWeeklyCalendar;

const staticStyles = StyleSheet.create({
  heroCapsule: {
    position: 'absolute',
    boxShadow: '0px 12px 22px -12px rgba(24, 47, 80, 0.7)',
  },
  heroMask: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
