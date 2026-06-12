import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { spacing, fontSize, borderRadius } from '../../constants/colors';
import { useAppTheme, useThemedStyles, type AppTheme } from '../../theme';

interface RestTimerProps {
  visible: boolean;
  initialSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

export const RestTimer: React.FC<RestTimerProps> = ({
  visible,
  initialSeconds,
  onComplete,
  onSkip,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [seconds, setSeconds] = useState(initialSeconds);
  const progress = useSharedValue(1);

  // Cuenta atras anclada a una fecha limite real (Date.now), no a ticks de
  // setInterval: en background o con la pantalla bloqueada los timers de JS
  // se congelan, y un descanso de 90s contaria solo el tiempo en primer
  // plano. Al volver, el siguiente tick recalcula contra el reloj y el timer
  // queda correcto (igual que los timers de cardio/movimiento del controller).
  useEffect(() => {
    if (!visible) {
      return;
    }

    const endAtMs = Date.now() + initialSeconds * 1000;
    setSeconds(initialSeconds);

    const syncRemaining = () => {
      const remainingSeconds = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));

      setSeconds((previousSeconds) =>
        previousSeconds === remainingSeconds ? previousSeconds : remainingSeconds,
      );

      // La barra se re-sincroniza en cada tick (en vez de una sola animacion
      // larga) para que tambien se corrija tras una congelacion en background.
      const fraction = initialSeconds > 0 ? remainingSeconds / initialSeconds : 0;
      progress.value = withTiming(Math.max(0, Math.min(1, fraction)), {
        duration: 260,
        easing: Easing.linear,
      });
    };

    progress.value = 1;
    syncRemaining();
    const interval = setInterval(syncRemaining, 250);

    return () => clearInterval(interval);
  }, [initialSeconds, progress, visible]);

  useEffect(() => {
    if (visible && seconds === 0) {
      onComplete();
    }
  }, [onComplete, seconds, visible]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="time-outline" size={48} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>Descanso</Text>

          <Text style={styles.timer}>{formatTime(seconds)}</Text>

          <View style={styles.progressContainer}>
            <Animated.View style={[styles.progressBar, progressStyle]} />
          </View>

          <Text style={styles.subtitle}>
            Tiempo recomendado: {formatTime(initialSeconds)}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Ionicons name="play-skip-forward" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.skipButtonText}>Saltar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={() => setSeconds((s) => s + 30)}>
              <Ionicons name="add" size={20} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>+30s</Text>
            </TouchableOpacity>
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
      padding: spacing.lg,
    },
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      width: '100%',
      maxWidth: 320,
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
    title: {
      fontSize: fontSize.xl,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      marginBottom: spacing.sm,
    },
    timer: {
      fontSize: 56,
      fontWeight: 'bold',
      color: theme.colors.primary,
      marginBottom: spacing.lg,
      fontVariant: ['tabular-nums'],
    },
    progressContainer: {
      width: '100%',
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.colors.primary,
      borderRadius: 3,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: theme.colors.textMuted,
      marginBottom: spacing.xl,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    skipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: spacing.xs,
    },
    skipButtonText: {
      fontSize: fontSize.base,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: theme.colors.primarySoft,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      gap: spacing.xs,
    },
    addButtonText: {
      fontSize: fontSize.base,
      fontWeight: '500',
      color: theme.colors.primary,
    },
  });

export default RestTimer;
