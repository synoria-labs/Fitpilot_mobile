import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';
import { spacing } from '../../constants/colors';
import { WorkoutCardSkeleton } from '../common/Skeleton';
import { auroraFont, useAurora } from '../../theme/aurora';
import type { MicrocycleMode, MuscleVolumeItem, MuscleVolumeResponse } from '../../types';
import type { ProgramTimelineCardState } from '../../utils/programTimeline';
import { getTodayDateKey } from '../../utils/date';
import type { SharedWeeklyCalendarDay } from '../calendar/SharedWeeklyCalendar';
import type { AuroraIconName } from '../aurora';
import { BODY_MAP_MUSCLE_PATHS } from './bodyMap/bodyMapAtlas';
import { MiniBodyMap, type BodyMapView } from './bodyMap/MiniBodyMap';
import { CardWeekStrip } from './CardWeekStrip';
import { WorkoutCardBackdrop } from './WorkoutCardBackdrop';

// Notch geometry from the proposal: the estimated time sits in a cut 58 deep and 124 wide,
// reached by a short diagonal and softened at both bends.
const NOTCH_DEPTH = 58;
const NOTCH_RUN = 40;
const NOTCH_WIDTH = 124;
const NOTCH_SMOOTHING = 16;
const NOTCH_CORNER = 22;
const CORNER = 28;
const CARD_PADDING = 20;
const FIGURE_TOP = 72;
const FIGURE_WIDTH = 80;
const FIGURE_HEIGHT = 146;
const INITIAL_HEIGHT = 420;

const r2 = (value: number) => Math.round(value * 100) / 100;

const getCardPath = (w: number, h: number) => {
  const xb = w - NOTCH_WIDTH;
  const xa = xb - NOTCH_RUN;
  const length = Math.hypot(NOTCH_RUN, NOTCH_DEPTH);
  const ux = NOTCH_RUN / length;
  const uy = NOTCH_DEPTH / length;
  const k = NOTCH_SMOOTHING;

  return [
    `M 0 ${CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${CORNER} 0`,
    `L ${r2(xa - k)} 0`,
    `Q ${r2(xa)} 0 ${r2(xa + k * ux)} ${r2(k * uy)}`,
    `L ${r2(xb - k * ux)} ${r2(NOTCH_DEPTH - k * uy)}`,
    `Q ${r2(xb)} ${NOTCH_DEPTH} ${r2(xb + k)} ${NOTCH_DEPTH}`,
    `L ${r2(w - NOTCH_CORNER)} ${NOTCH_DEPTH}`,
    `A ${NOTCH_CORNER} ${NOTCH_CORNER} 0 0 1 ${w} ${NOTCH_DEPTH + NOTCH_CORNER}`,
    `L ${w} ${r2(h - CORNER)}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${r2(w - CORNER)} ${h}`,
    `L ${CORNER} ${h}`,
    `A ${CORNER} ${CORNER} 0 0 1 0 ${r2(h - CORNER)}`,
    'Z',
  ].join(' ');
};

const ACTIONS: Record<string, { label: string; icon: AuroraIconName }> = {
  empezar: { label: 'Empezar sesión', icon: 'play' },
  continuar: { label: 'Continuar sesión', icon: 'play' },
  retomar: { label: 'Retomar sesión', icon: 'refresh' },
  'ver registro': { label: 'Ver registro', icon: 'document-text-outline' },
};

const EMPTY_ICONS: Record<string, AuroraIconName> = {
  rest: 'leaf-outline',
  'no-pending': 'checkmark-done-circle-outline',
  'no-executed': 'time-outline',
};

// Muscle heads fold into the short group names the chips use ("Deltoides", "Core").
const MUSCLE_GROUPS: Record<string, string> = {
  anterior_deltoid: 'Deltoides',
  lateral_deltoid: 'Deltoides',
  posterior_deltoid: 'Deltoides',
  abs: 'Core',
  obliques: 'Core',
  chest: 'Pecho',
  lats: 'Dorsales',
  upper_back: 'Espalda alta',
  lower_back: 'Espalda baja',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquios',
  glutes: 'Glúteos',
  adductors: 'Aductores',
  calves: 'Pantorrillas',
  tibialis: 'Tibial',
};

const getTopMuscleGroups = (muscles: MuscleVolumeItem[], limit = 2) => {
  const volumeByGroup = new Map<string, number>();
  muscles.forEach((muscle) => {
    const group = MUSCLE_GROUPS[muscle.muscle_name] ?? muscle.display_name.trim().split(/\s+/)[0];
    volumeByGroup.set(group, (volumeByGroup.get(group) ?? 0) + muscle.effective_sets);
  });
  return [...volumeByGroup.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([group]) => group);
};

// Shows the side of the body that carries most of the session's volume.
const pickBodyView = (muscles: MuscleVolumeItem[]): BodyMapView => {
  const weight = (view: BodyMapView) =>
    muscles.reduce(
      (sum, muscle) => sum + (BODY_MAP_MUSCLE_PATHS[view][muscle.muscle_name] ? muscle.effective_sets : 0),
      0,
    );
  return weight('posterior') > weight('anterior') ? 'posterior' : 'anterior';
};

const SHORT_WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "dom 4 oct" (or "4 oct"): short enough for the pill to stay clear of the notch.
const formatShortDate = (dateKey: string | null, withWeekday = true) => {
  const [year, month, day] = (dateKey ?? '').split('-').map(Number);
  if (!year || !month || !day) {
    return '';
  }
  const date = new Date(year, month - 1, day);
  const dayMonth = `${day} ${SHORT_MONTHS[month - 1]}`;
  return withWeekday ? `${SHORT_WEEKDAYS[date.getDay()]} ${dayMonth}` : dayMonth;
};

const formatDuration = (totalSets: number) => {
  const estimatedMinutes = Math.round(totalSets * 3);
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = estimatedMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
};

interface TodayWorkoutCardProps {
  cardState: ProgramTimelineCardState;
  onStartPress: () => void;
  onGoToActionable?: () => void;
  onOpenSessions?: () => void;
  onOpenSplit?: () => void;
  isLoading?: boolean;
  muscleVolume?: MuscleVolumeResponse | null;
  isMuscleVolumeLoading?: boolean;
  /** "Sesión 3 de 6 · Microciclo 1". */
  progressLabel?: string | null;
  weekDays: SharedWeeklyCalendarDay[];
  weekLabel?: string | null;
  canGoToPreviousWeek?: boolean;
  canGoToNextWeek?: boolean;
  showWeekButtons?: boolean;
  onShiftWeek: (direction: -1 | 1) => void;
  onOpenDatePicker?: () => void;
  /** Brings the week back to the current one; only passed when today is within the program. */
  onGoToToday?: () => void;
  mode: MicrocycleMode;
  onModeChange: (mode: MicrocycleMode) => void;
  contentWidth?: number;
  horizontalPadding?: number;
}

/**
 * The day's session as the screen's hero: a navy card with a notch for the estimated time,
 * the session and its muscles, the start button and the week, all in one place.
 */
export const TodayWorkoutCard: React.FC<TodayWorkoutCardProps> = ({
  cardState,
  onStartPress,
  onGoToActionable,
  onOpenSessions,
  onOpenSplit,
  isLoading,
  muscleVolume,
  isMuscleVolumeLoading = false,
  progressLabel,
  weekDays,
  weekLabel,
  canGoToPreviousWeek = true,
  canGoToNextWeek = true,
  showWeekButtons = false,
  onShiftWeek,
  onOpenDatePicker,
  onGoToToday,
  mode,
  onModeChange,
  contentWidth = 390,
  horizontalPadding = spacing.md,
}) => {
  const aurora = useAurora();
  const cardWidth = Math.max(300, contentWidth - horizontalPadding * 2);
  const [cardHeight, setCardHeight] = useState(INITIAL_HEIGHT);
  const trainingDayId = cardState.kind === 'session' ? cardState.trainingDay.id : null;
  const currentMuscleVolume =
    cardState.kind === 'session' && muscleVolume?.training_day_id === trainingDayId ? muscleVolume : null;
  const muscles = useMemo(() => currentMuscleVolume?.muscles ?? [], [currentMuscleVolume]);
  const [bodyView, setBodyView] = useState<BodyMapView>('anterior');

  useEffect(() => {
    setBodyView(pickBodyView(muscles));
  }, [muscles]);

  const shapePath = useMemo(() => getCardPath(cardWidth, cardHeight), [cardHeight, cardWidth]);

  if (isLoading) {
    return (
      <View style={[styles.container, { marginHorizontal: horizontalPadding }]}>
        <WorkoutCardSkeleton />
      </View>
    );
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0 && height !== cardHeight) {
      setCardHeight(height);
    }
  };

  const isSession = cardState.kind === 'session';
  const isToday = cardState.dateKey === getTodayDateKey();
  const isOverdue = isSession && cardState.recommendation === 'overdue';
  const shortDate = formatShortDate(cardState.dateKey);
  const pillLabel = isOverdue
    ? `Atrasada · ${formatShortDate(cardState.dateKey, false)}`
    : isToday
      ? 'Sesión de hoy'
      : shortDate;
  // Up to where the notch's diagonal crosses the pill's top edge, less a small gap.
  const pillMaxWidth =
    cardWidth - CARD_PADDING * 2 - NOTCH_WIDTH - NOTCH_RUN + NOTCH_RUN * (CARD_PADDING / NOTCH_DEPTH) - 6;
  const muscleGroups = getTopMuscleGroups(muscles);
  // Two chips always share one row beside the figure; a long name shortens instead of wrapping.
  const chipMaxWidth = (cardWidth - CARD_PADDING * 2 - FIGURE_WIDTH - 8 - 6) / 2;
  const action = isSession ? ACTIONS[cardState.actionLabel] ?? { label: cardState.actionLabel, icon: 'play' } : null;
  const completion = isSession ? Math.round(cardState.session.completion_percentage) : 0;
  const showsCurrentWeek = weekDays.some((day) => day.isToday);

  const week = (
    <View style={styles.weekBlock}>
      <View style={styles.divider}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.03)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.weekHeader}>
        {/* The range only matters away from the current week, where the days could pass for this one. */}
        <View style={styles.weekTitle}>
          {!showsCurrentWeek && weekLabel ? (
            <>
              <Text style={[styles.weekRange, auroraFont('bold')]} numberOfLines={1}>
                {weekLabel}
              </Text>
              {onGoToToday ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver a la semana actual"
                  onPress={onGoToToday}
                  hitSlop={6}
                  style={({ pressed }) => [styles.todayButton, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                >
                  <Ionicons name="arrow-undo" size={12} color="#e0f2fe" />
                  <Text style={[styles.todayText, auroraFont('bold')]}>Hoy</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
        <View style={styles.weekActions}>
          <View accessibilityRole="radiogroup" style={styles.modeSwitch}>
            {(['planned', 'actual'] as const).map((option) => {
              const active = mode === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option === 'planned' ? 'Ver la semana planificada' : 'Ver lo que se ejecutó'}
                  onPress={() => onModeChange(option)}
                  hitSlop={6}
                  style={[styles.modeOption, active ? styles.modeOptionActive : null]}
                >
                  <Text style={[styles.modeText, auroraFont('bold'), { color: active ? '#ffffff' : '#8ea3c2' }]}>
                    {option === 'planned' ? 'Plan' : 'Real'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {showWeekButtons ? (
            <>
              <GlassIconButton
                icon="chevron-back"
                label="Semana anterior"
                disabled={!canGoToPreviousWeek}
                onPress={() => onShiftWeek(-1)}
              />
              <GlassIconButton
                icon="chevron-forward"
                label="Semana siguiente"
                disabled={!canGoToNextWeek}
                onPress={() => onShiftWeek(1)}
              />
            </>
          ) : null}
          {onOpenDatePicker ? (
            <GlassIconButton icon="calendar-clear-outline" label="Ir a fecha" onPress={onOpenDatePicker} />
          ) : null}
        </View>
      </View>
      <CardWeekStrip
        days={weekDays}
        canGoToPreviousWeek={canGoToPreviousWeek}
        canGoToNextWeek={canGoToNextWeek}
        onShiftWeek={onShiftWeek}
      />
    </View>
  );

  return (
    <View style={[styles.container, { marginHorizontal: horizontalPadding }]}>
      <View style={[styles.card, { width: cardWidth }]} onLayout={handleLayout}>
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={
            <Svg width={cardWidth} height={cardHeight}>
              <Path d={shapePath} fill="black" />
            </Svg>
          }
        >
          <WorkoutCardBackdrop
            cardState={cardState}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            shapePath={shapePath}
          />
        </MaskedView>

        {isSession ? (
          <>
            <View style={[styles.sessionColumn, { marginRight: FIGURE_WIDTH + 8, minHeight: FIGURE_TOP + FIGURE_HEIGHT - CARD_PADDING }]}>
              <View style={[styles.pill, { maxWidth: pillMaxWidth }, isOverdue ? styles.pillOverdue : null]}>
                <View style={[styles.pillDot, isOverdue ? styles.pillDotOverdue : null]} />
                <Text
                  style={[styles.pillText, auroraFont('bold'), isOverdue ? styles.pillTextOverdue : null]}
                  numberOfLines={1}
                >
                  {pillLabel}
                </Text>
              </View>
              <Text style={[styles.title, auroraFont('extrabold')]} numberOfLines={2}>
                {cardState.trainingDay.name}
              </Text>
              {progressLabel ? (
                <Text style={[styles.subtitle, auroraFont('medium')]} numberOfLines={1}>
                  {progressLabel}
                </Text>
              ) : null}
              {cardState.locked ? (
                <Text style={[styles.notice, auroraFont('semibold')]} numberOfLines={2}>
                  Completa primero tu entrenamiento del {cardState.actionableDateLabel}.
                </Text>
              ) : isOverdue ? (
                <Text style={[styles.notice, auroraFont('semibold')]} numberOfLines={1}>
                  Completa esta sesión primero.
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="barbell-outline" size={14} color="#7dd3fc" />
                  <Text style={[styles.metaText, auroraFont('semibold')]}>
                    {cardState.trainingDay.exercise_count} ejercicios
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="list-outline" size={14} color="#7dd3fc" />
                  <Text style={[styles.metaText, auroraFont('semibold')]}>
                    {cardState.trainingDay.total_sets} series
                  </Text>
                </View>
                {completion > 0 && completion < 100 ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="pie-chart-outline" size={14} color="#7dd3fc" />
                    <Text style={[styles.metaText, auroraFont('semibold')]}>{completion}% hecho</Text>
                  </View>
                ) : null}
              </View>
              {muscleGroups.length ? (
                <View style={styles.muscleRow}>
                  {muscleGroups.map((group) => (
                    <View key={group} style={[styles.musclePill, { maxWidth: chipMaxWidth }]}>
                      <LinearGradient
                        colors={['#7dd3fc', '#818cf8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.muscleDot}
                      />
                      <Text style={[styles.muscleText, auroraFont('bold')]} numberOfLines={1}>
                        {group}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bodyView === 'anterior' ? 'Ver los músculos de la espalda' : 'Ver los músculos del frente'}
              onPress={() => setBodyView((view) => (view === 'anterior' ? 'posterior' : 'anterior'))}
              style={[styles.figure, isMuscleVolumeLoading && !currentMuscleVolume ? styles.figureLoading : null]}
            >
              <MiniBodyMap muscles={muscles} view={bodyView} width={FIGURE_WIDTH} height={FIGURE_HEIGHT - 18} />
              <Text style={[styles.figureCaption, auroraFont('bold')]}>
                {bodyView === 'anterior' ? 'Frente' : 'Espalda'}
                <Text style={styles.figureCaptionMuted}> ⇄</Text>
              </Text>
            </Pressable>

            <View style={styles.actions}>
              {cardState.locked && onGoToActionable ? (
                <PrimaryButton label="Ir al pendiente" icon="navigate" onPress={onGoToActionable} />
              ) : action ? (
                <PrimaryButton label={action.label} icon={action.icon} onPress={onStartPress} />
              ) : null}
              {onOpenSplit ? <GlassButton label="Split" icon="grid-outline" onPress={onOpenSplit} /> : null}
              {cardState.hasMultipleSessions && onOpenSessions ? (
                <GlassIconButton icon="layers-outline" label="Ver las sesiones del día" onPress={onOpenSessions} large />
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.emptyBlock}>
            {cardState.dateKey ? (
              <View style={[styles.pill, { maxWidth: pillMaxWidth }]}>
                <View style={styles.pillDot} />
                <Text style={[styles.pillText, auroraFont('bold')]} numberOfLines={1}>
                  {isToday ? 'Hoy' : shortDate}
                </Text>
              </View>
            ) : null}
            <View style={styles.emptyRow}>
              <View style={styles.emptyIcon}>
                <Ionicons name={EMPTY_ICONS[cardState.reason] ?? 'calendar-outline'} size={22} color="#7dd3fc" />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={[styles.emptyTitle, auroraFont('extrabold')]}>{cardState.title}</Text>
                <Text style={[styles.subtitle, auroraFont('medium')]}>{cardState.subtitle}</Text>
              </View>
            </View>
            {onOpenSplit ? (
              <View style={styles.actions}>
                <GlassButton label="Ver split" icon="grid-outline" onPress={onOpenSplit} />
              </View>
            ) : null}
          </View>
        )}

        {weekDays.length ? week : null}
      </View>

      {isSession ? (
        <View pointerEvents="none" style={styles.notchLabel}>
          <View style={styles.notchEyebrow}>
            <Ionicons name="timer-outline" size={12} color={aurora.faint} />
            <Text style={[styles.notchEyebrowText, auroraFont('extrabold'), { color: aurora.faint }]}>
              Tiempo estimado
            </Text>
          </View>
          <Text style={[styles.notchValue, auroraFont('extrabold'), { color: aurora.text }]}>
            {formatDuration(cardState.trainingDay.total_sets)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const PrimaryButton = ({ label, icon, onPress }: { label: string; icon: AuroraIconName; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.primaryPress, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
  >
    <LinearGradient
      colors={['#ffffff', '#d6e9ff']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.primaryButton}
    >
      <Ionicons name={icon} size={16} color="#0b1630" />
      <Text style={[styles.primaryText, auroraFont('extrabold')]} numberOfLines={1}>
        {label}
      </Text>
    </LinearGradient>
  </Pressable>
);

const GlassButton = ({ label, icon, onPress }: { label: string; icon: AuroraIconName; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.glassButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
  >
    <Ionicons name={icon} size={16} color="#eef3fb" />
    <Text style={[styles.glassText, auroraFont('bold')]}>{label}</Text>
  </Pressable>
);

const GlassIconButton = ({
  icon,
  label,
  onPress,
  disabled = false,
  large = false,
}: {
  icon: AuroraIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  large?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    hitSlop={large ? 0 : 6}
    onPress={onPress}
    style={({ pressed }) => [
      large ? styles.glassIconLarge : styles.glassIcon,
      disabled ? styles.glassIconDisabled : null,
      { transform: [{ scale: pressed ? 0.94 : 1 }] },
    ]}
  >
    <Ionicons name={icon} size={large ? 18 : 15} color="#eef3fb" />
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 4,
    position: 'relative',
  },
  card: {
    padding: CARD_PADDING,
  },
  sessionColumn: {
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillOverdue: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.36)',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7dd3fc',
    boxShadow: '0px 0px 10px #7dd3fc',
  },
  pillDotOverdue: {
    backgroundColor: '#fbbf24',
    boxShadow: '0px 0px 10px #fbbf24',
  },
  pillText: {
    flexShrink: 1,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#cfe3ff',
  },
  pillTextOverdue: {
    color: '#fde68a',
  },
  title: {
    marginTop: 14,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.5,
    color: '#eef3fb',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    color: '#a9bbd6',
  },
  notice: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#fde68a',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 12,
    marginTop: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 13,
    color: '#dbe7f7',
  },
  muscleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  musclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(125, 211, 252, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.28)',
  },
  muscleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  muscleText: {
    flexShrink: 1,
    fontSize: 12,
    color: '#dbeafe',
  },
  figure: {
    position: 'absolute',
    top: FIGURE_TOP,
    right: 16,
    width: FIGURE_WIDTH,
    height: FIGURE_HEIGHT,
    alignItems: 'center',
  },
  figureLoading: {
    opacity: 0.6,
  },
  figureCaption: {
    marginTop: 2,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#a9bbd6',
  },
  figureCaptionMuted: {
    color: '#5f7596',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
  },
  primaryPress: {
    flex: 1,
  },
  primaryButton: {
    height: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    boxShadow: '0px 14px 30px -12px rgba(125, 211, 252, 0.75)',
  },
  primaryText: {
    fontSize: 15,
    color: '#0b1630',
  },
  glassButton: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  glassText: {
    fontSize: 14,
    color: '#eef3fb',
  },
  glassIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  glassIconLarge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  glassIconDisabled: {
    opacity: 0.4,
  },
  weekBlock: {
    marginTop: 20,
  },
  divider: {
    height: 1,
    overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  weekTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekRange: {
    flexShrink: 1,
    fontSize: 12,
    color: '#dbe7f7',
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(125, 211, 252, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.4)',
  },
  todayText: {
    fontSize: 11.5,
    color: '#e0f2fe',
  },
  weekActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeSwitch: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeOption: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 9,
    justifyContent: 'center',
  },
  modeOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  modeText: {
    fontSize: 11.5,
  },
  emptyBlock: {
    marginRight: NOTCH_WIDTH - CARD_PADDING,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(125, 211, 252, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.28)',
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: '#eef3fb',
  },
  notchLabel: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 150,
    alignItems: 'flex-end',
  },
  notchEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  notchEyebrowText: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  notchValue: {
    marginTop: 4,
    fontSize: 21,
    lineHeight: 24,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
});
