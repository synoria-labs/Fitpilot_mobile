import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { useAppTheme, useThemedStyles } from '../../theme';
import { auroraFont, getAuroraTokens, useAurora } from '../../theme/aurora';
import type { ChatAttachment } from '../../types/chat';

type AudioMessagePlayerProps = {
  attachment: ChatAttachment;
  isMine: boolean;
  isActive: boolean;
  onActiveChange: (attachmentId: number | null) => void;
  onDownload: (attachment: ChatAttachment) => void;
};

const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  return `${minutes}:${String(roundedSeconds % 60).padStart(2, '0')}`;
};

const getAudioDisplayName = (name?: string | null) => {
  const trimmedName = name?.trim();
  if (!trimmedName || /^nota-(?:de-)?voz-\d+/i.test(trimmedName)) {
    return 'Nota de voz';
  }

  return trimmedName;
};

export function AudioMessagePlayer({
  attachment,
  isMine,
  isActive,
  onActiveChange,
  onDownload,
}: AudioMessagePlayerProps) {
  const aurora = useAurora();
  const styles = useThemedStyles(createStyles);
  const [progressWidth, setProgressWidth] = useState(0);
  // Android emits rate changes with playback updates, which stop while paused.
  const [playbackRate, setPlaybackRate] = useState(1);
  const player = useAudioPlayer(
    attachment.url ? { uri: attachment.url } : null,
    { updateInterval: 200 },
  );
  const status = useAudioPlayerStatus(player);

  // A different recording starts at normal speed, like the player that loads it.
  useEffect(() => {
    setPlaybackRate(1);
  }, [attachment.url]);

  const duration = useMemo(() => {
    if (Number.isFinite(status.duration) && status.duration > 0) {
      return status.duration;
    }

    return attachment.duration_seconds && attachment.duration_seconds > 0
      ? attachment.duration_seconds
      : 0;
  }, [attachment.duration_seconds, status.duration]);

  const currentTime = Math.max(
    0,
    duration > 0 ? Math.min(status.currentTime, duration) : status.currentTime,
  );
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const canPlay = Boolean(attachment.url);
  const canSeek = canPlay && duration > 0;
  const canChangeRate = canPlay && status.isLoaded;
  const title = !canPlay
    ? 'Audio no disponible'
    : status.isBuffering
      ? 'Cargando audio…'
      : getAudioDisplayName(attachment.file_name);
  const activeWaveColor = isMine ? aurora.onTone : aurora.tones.blue.tone;
  const inactiveWaveColor = isMine
    ? aurora.isDark ? 'rgba(6,16,31,0.25)' : 'rgba(255,255,255,0.35)'
    : aurora.borderStrong;

  useEffect(() => {
    if (!isActive && status.playing) {
      player.pause();
    }
  }, [isActive, player, status.playing]);

  useEffect(() => {
    if (isActive && status.didJustFinish) {
      onActiveChange(null);
    }
  }, [isActive, onActiveChange, status.didJustFinish]);

  const togglePlayback = async () => {
    if (!canPlay) {
      return;
    }

    if (status.playing) {
      player.pause();
      onActiveChange(null);
      return;
    }

    if (status.didJustFinish || (duration > 0 && currentTime >= duration - 0.1)) {
      await player.seekTo(0);
    }

    onActiveChange(attachment.id);
    player.play();
  };

  const seekToRatio = (ratio: number) => {
    if (!canSeek) {
      return;
    }

    const nextTime = duration * Math.max(0, Math.min(1, ratio));
    void player.seekTo(nextTime);
  };

  const handleProgressPress = (event: GestureResponderEvent) => {
    if (!progressWidth) {
      return;
    }

    seekToRatio(event.nativeEvent.locationX / progressWidth);
  };

  return (
    <View style={[styles.container, !canPlay && styles.unavailable]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={!canPlay
          ? 'Audio no disponible'
          : status.playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        accessibilityState={{ disabled: !canPlay }}
        disabled={!canPlay}
        onPress={() => { void togglePlayback(); }}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={isMine ? [aurora.surface, aurora.surface2] : aurora.tones.blue.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.playGradient]}
        />
        {status.isBuffering && canPlay ? (
          <ActivityIndicator size="small" color={isMine ? aurora.tones.blue.ink : aurora.onTone} />
        ) : (
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={18}
            color={isMine ? aurora.tones.blue.ink : aurora.onTone}
          />
        )}
      </Pressable>
      <View style={styles.content}>
        <Text numberOfLines={1} style={[styles.title, isMine && styles.mineText]}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Progreso de la nota de voz"
          accessibilityState={{ disabled: !canSeek }}
          accessibilityValue={{
            min: 0,
            max: Math.max(1, Math.round(duration)),
            now: Math.round(currentTime),
            text: duration > 0
              ? `${formatAudioTime(currentTime)} de ${formatAudioTime(duration)}`
              : 'Duración no disponible',
          }}
          accessibilityActions={[
            { name: 'decrement', label: 'Retroceder 10 segundos' },
            { name: 'increment', label: 'Adelantar 10 segundos' },
          ]}
          disabled={!canSeek}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') {
              seekToRatio((currentTime + 10) / duration);
            } else if (event.nativeEvent.actionName === 'decrement') {
              seekToRatio((currentTime - 10) / duration);
            }
          }}
          onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
          onPress={handleProgressPress}
          style={styles.progressTrack}
        >
          {/* Decorative bars: playback progress is real; the API does not supply waveform samples. */}
          <View pointerEvents="none" style={styles.wave} accessible={false}>
            {WAVE_HEIGHTS.map((height, index) => (
              <View
                key={index}
                style={[
                  styles.waveBar,
                  { height, backgroundColor: index / WAVE_HEIGHTS.length < progress
                    ? activeWaveColor : inactiveWaveColor },
                ]}
              />
            ))}
          </View>
        </Pressable>
        <View style={styles.meta}>
          <Text style={[styles.time, isMine && styles.mineText]}>
            {formatAudioTime(currentTime)} / {duration > 0 ? formatAudioTime(duration) : '--:--'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cambiar velocidad, actual ${playbackRate}x`}
            accessibilityState={{ disabled: !canChangeRate }}
            disabled={!canChangeRate}
            onPress={() => {
              const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
              player.shouldCorrectPitch = true;
              player.setPlaybackRate(nextRate);
              setPlaybackRate(nextRate);
            }}
            style={({ pressed }) => [styles.metaButton, pressed && styles.pressed]}
          >
            <Text style={[styles.rate, isMine && styles.mineText]}>{playbackRate}×</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descargar nota de voz"
            accessibilityState={{ disabled: !canPlay }}
            disabled={!canPlay}
            onPress={() => onDownload(attachment)}
            style={({ pressed }) => [styles.metaButton, pressed && styles.pressed]}
          >
            <Ionicons name="download-outline" size={16} color={isMine ? aurora.onTone : aurora.tones.blue.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const WAVE_HEIGHTS = [8, 14, 22, 12, 26, 30, 18, 10, 24, 28, 16, 9, 20, 26, 14, 22, 30, 24, 12, 8, 16, 22, 28, 18];

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) => {
  const aurora = getAuroraTokens(theme.isDark);
  return StyleSheet.create({
    container: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
    unavailable: { opacity: 0.65 },
    playButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    playGradient: { borderRadius: 22 },
    pressed: { opacity: 0.65 },
    content: { flex: 1, minWidth: 0 },
    title: { ...auroraFont('medium'), fontSize: 10, color: aurora.faint },
    progressTrack: { height: 44, justifyContent: 'center' },
    wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32 },
    waveBar: { flex: 1, borderRadius: 2 },
    meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
    time: { ...auroraFont('medium'), fontSize: 11, fontVariant: ['tabular-nums'], color: aurora.faint },
    rate: { ...auroraFont('bold'), fontSize: 11, color: aurora.tones.blue.ink },
    metaButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    mineText: { color: aurora.onTone },
  });
};
