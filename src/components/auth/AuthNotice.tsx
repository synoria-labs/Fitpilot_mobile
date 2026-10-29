import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auroraFont, useAurora } from '../../theme/aurora';
import { AuthGlassCard } from './AuthGlassCard';

type AuthErrorBannerProps = {
  title: string;
  message: string;
  style?: StyleProp<ViewStyle>;
};

/** Rose banner for a failed attempt; screen readers announce it as soon as it appears. */
export const AuthErrorBanner = ({ title, message, style }: AuthErrorBannerProps) => {
  const aurora = useAurora();
  const rose = aurora.tones.rose;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: rose.soft, borderColor: rose.line }, style]}
    >
      <Ionicons name="alert-circle" size={19} color={rose.tone} style={styles.bannerIcon} />
      <View style={styles.copy}>
        <Text style={[styles.bannerTitle, { color: rose.ink }]}>{title}</Text>
        <Text style={[styles.bannerMessage, { color: rose.ink }]}>{message}</Text>
      </View>
    </View>
  );
};

type AuthInfoNoteProps = {
  title: string;
  /** One paragraph each; the first reads stronger than the rest. */
  paragraphs: readonly string[];
  style?: StyleProp<ViewStyle>;
};

/** Small glass note with a blue badge, for guidance below the form. */
export const AuthInfoNote = ({ title, paragraphs, style }: AuthInfoNoteProps) => {
  const aurora = useAurora();
  const blue = aurora.tones.blue;

  return (
    <AuthGlassCard radius={22} padding={14} blur={false} elevated={false} style={style}>
      <View style={styles.note}>
        <View style={[styles.badge, { backgroundColor: blue.soft }]}>
          <Ionicons name="sparkles" size={18} color={blue.tone} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.noteTitle, { color: aurora.text }]}>{title}</Text>
          {paragraphs.map((paragraph, index) => (
            <Text
              key={paragraph}
              style={[
                styles.noteText,
                index === 0 ? styles.noteLead : styles.noteFollow,
                { color: index === 0 ? aurora.muted : aurora.faint },
              ]}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      </View>
    </AuthGlassCard>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerIcon: {
    marginTop: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    ...auroraFont('extrabold'),
    fontSize: 13.5,
    lineHeight: 18,
  },
  bannerMessage: {
    ...auroraFont('medium'),
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitle: {
    ...auroraFont('extrabold'),
    fontSize: 13.5,
    lineHeight: 19,
  },
  noteText: {
    ...auroraFont('medium'),
    fontSize: 12.5,
    lineHeight: 18,
  },
  noteLead: {
    marginTop: 3,
  },
  noteFollow: {
    marginTop: 6,
  },
});
