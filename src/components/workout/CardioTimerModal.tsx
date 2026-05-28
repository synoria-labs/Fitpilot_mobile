import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, buttonGradients, colors, fontSize, spacing } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';
import { formatTime } from '../../utils/formatters';

interface CardioTimerModalProps {
  visible: boolean;
  exerciseName: string;
  plannedDurationSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  isComplete: boolean;
  onFinish: () => void;
}

export const CardioTimerModal: React.FC<CardioTimerModalProps> = ({
  visible,
  exerciseName,
  plannedDurationSeconds,
  remainingSeconds,
  elapsedSeconds,
  isComplete,
  onFinish,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const primaryGradientColors = theme.isDark
    ? buttonGradients.primary.dark
    : buttonGradients.primary.light;
  const progressRatio =
    plannedDurationSeconds > 0
      ? Math.min(elapsedSeconds / plannedDurationSeconds, 1)
      : 0;

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={isComplete ? 'flag-outline' : 'timer-outline'}
              size={44}
              color={theme.colors.primary}
            />
          </View>

          <Text style={styles.exerciseName} numberOfLines={2}>
            {exerciseName}
          </Text>
          <Text style={[styles.statusText, isComplete && styles.statusTextComplete]}>
            {isComplete ? 'Objetivo completado' : 'Bloque cardio en curso'}
          </Text>

          <Text style={styles.timerValue}>{formatTime(remainingSeconds)}</Text>
          <Text style={styles.timerCaption}>
            {isComplete ? 'Tiempo restante agotado' : 'Tiempo restante'}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Objetivo</Text>
              <Text style={styles.metricValue}>{formatTime(plannedDurationSeconds)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Transcurrido</Text>
              <Text style={styles.metricValue}>{formatTime(elapsedSeconds)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.finishButton} onPress={onFinish} activeOpacity={0.84}>
            <LinearGradient
              colors={primaryGradientColors}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 0.85 }}
              style={styles.finishButtonGradient}
            >
              <Text style={styles.finishButtonText}>Finalizar bloque</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            {isComplete
              ? 'Puedes cerrar el bloque cuando termines.'
              : 'El tiempo real ejecutado se guardara al finalizar.'}
          </Text>
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
      padding: spacing.lg,
    },
    container: {
      width: '100%',
      maxWidth: 340,
      borderRadius: borderRadius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.xl,
      alignItems: 'center',
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    exerciseName: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    statusText: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    statusTextComplete: {
      color: '#10B981',
      textAlign: 'center',
    },
    timerValue: {
      marginTop: spacing.lg,
      fontSize: 56,
      fontWeight: '700',
      color: theme.colors.primary,
      fontVariant: ['tabular-nums'],
    },
    timerCaption: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
    },
    progressTrack: {
      width: '100%',
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.border,
      marginTop: spacing.lg,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: theme.colors.primary,
    },
    metricsRow: {
      width: '100%',
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    metricCard: {
      flex: 1,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      gap: spacing.xs,
    },
    metricLabel: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    metricValue: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    finishButton: {
      width: '100%',
      borderRadius: borderRadius.full,
      overflow: 'hidden',
      marginTop: spacing.xl,
    },
    finishButtonGradient: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    finishButtonText: {
      fontSize: fontSize.base,
      fontWeight: '700',
      color: colors.white,
    },
    helperText: {
      marginTop: spacing.md,
      fontSize: fontSize.xs,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });

export default CardioTimerModal;
