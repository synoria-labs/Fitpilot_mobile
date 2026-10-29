import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Logo } from '../common';
import { AuroraPill, GradientText } from '../aurora';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import type { DashboardProgramSummary, User } from '../../types';

const OBJECTIVE_LABELS: Record<string, string> = {
  hypertrophy: 'ganar masa muscular',
  strength: 'fuerza máxima',
  endurance: 'resistencia',
  fat_loss: 'perder grasa',
  general_fitness: 'fitness general',
  athletic_performance: 'rendimiento atlético',
};

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const getGreeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días,';
  if (hour < 19) return 'Buenas tardes,';
  return 'Buenas noches,';
};

const PulseDot = ({ color }: { color: string }) => {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }
    progress.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.8 * (1 - progress.value),
    transform: [{ scale: 0.6 + progress.value * 1.2 }],
  }));

  return (
    <View style={styles.pulse}>
      <Animated.View style={[styles.pulseRing, { borderColor: color }, ringStyle]} />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
};

type HomeHeroProps = {
  user: User;
  program?: DashboardProgramSummary | null;
  sessionName?: string | null;
  sessionIsToday?: boolean;
  streakDays: number;
  onProfilePress?: () => void;
  horizontalPadding: number;
};

/** Saludo de Inicio sobre la aurora: fecha, nombre con degradado, la sesión del día y la racha. */
export const HomeHero = ({
  user,
  program,
  sessionName,
  sessionIsToday = false,
  streakDays,
  onProfilePress,
  horizontalPadding,
}: HomeHeroProps) => {
  const aurora = useAurora();
  const [now] = useState(() => new Date());
  const [hasAvatarError, setHasAvatarError] = useState(false);

  useEffect(() => {
    setHasAvatarError(false);
  }, [user.profilePictureUrl]);

  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const objective = program?.objective ? OBJECTIVE_LABELS[program.objective] ?? program.objective : null;
  const dateLabel = `${WEEKDAYS_SHORT[now.getDay()]} ${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`;
  const hasAvatarImage = Boolean(user.profilePictureUrl) && !hasAvatarError;
  const streakLabel = `${streakDays} ${streakDays === 1 ? 'día' : 'días'}`;

  const sentence: React.ReactNode[] = [];
  if (sessionName) {
    sentence.push(
      sessionIsToday ? 'Hoy toca ' : 'Te espera ',
      <Text key="session" style={[auroraFont('bold'), { color: aurora.text }]}>
        {sessionName}
      </Text>,
      '. ',
    );
  }
  if (streakDays > 0) {
    sentence.push(
      'Llevas ',
      <Text key="streak" style={[auroraFont('bold'), { color: aurora.text }]}>
        {streakLabel}
      </Text>,
      ' cumpliendo al menos dos metas.',
    );
  } else if (!sessionName) {
    sentence.push('Cada día que entrenas, caminas o duermes bien suma a tu constancia.');
  }

  return (
    <View style={{ paddingHorizontal: horizontalPadding + 4 }}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Logo size="sm" variant="mark" showText={false} />
          <View style={styles.dateRow}>
            <PulseDot color={aurora.tones.emerald.tone} />
            <Text style={[auroraType.label, { color: aurora.muted }]}>{dateLabel}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir tu perfil"
          disabled={!onProfilePress}
          onPress={onProfilePress}
          hitSlop={6}
        >
          <LinearGradient
            colors={[aurora.tones.blue.tone, aurora.tones.violet.tone, aurora.tones.emerald.tone]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            <View style={[styles.avatar, { borderColor: aurora.ground, backgroundColor: aurora.tones.violet.tone }]}>
              {hasAvatarImage ? (
                <Image
                  source={{ uri: user.profilePictureUrl ?? undefined }}
                  style={styles.avatarImage}
                  onError={() => setHasAvatarError(true)}
                />
              ) : (
                <Text style={[styles.initials, auroraFont('extrabold')]}>{initials}</Text>
              )}
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      <Text style={[auroraType.display, styles.greeting, { color: aurora.text }]}>{getGreeting(now)}</Text>
      <GradientText
        colors={[aurora.tones.blue.tone, aurora.tones.violet.tone, aurora.tones.emerald.tone]}
        style={[auroraType.display, styles.name]}
      >
        {firstName}
      </GradientText>

      {sentence.length ? (
        <Text style={[auroraType.body, styles.sentence, { color: aurora.muted }]}>{sentence}</Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chips, { marginHorizontal: -(horizontalPadding + 4) }]}
        contentContainerStyle={[styles.chipsContent, { paddingHorizontal: horizontalPadding + 4 }]}
      >
        {streakDays > 0 ? (
          <AuroraPill tone="amber" variant="glass" size="md" icon="flame-outline" label={`Racha de ${streakLabel}`} />
        ) : null}
        {objective ? (
          <AuroraPill tone="blue" variant="glass" size="md" icon="flag-outline" label={`Meta: ${objective}`} />
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulse: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    padding: 2,
  },
  avatar: {
    flex: 1,
    borderRadius: 21,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontSize: 14,
    color: '#ffffff',
  },
  greeting: {
    marginTop: 22,
  },
  name: {
    marginTop: 0,
  },
  sentence: {
    marginTop: 10,
  },
  chips: {
    marginTop: 16,
    flexGrow: 0,
  },
  chipsContent: {
    gap: 8,
    paddingBottom: 4,
  },
});
