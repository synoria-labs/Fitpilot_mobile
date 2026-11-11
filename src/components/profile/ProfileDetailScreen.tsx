import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  borderRadius,
  fontSize,
  spacing,
} from '../../constants/colors';
import { useAppTheme, useThemedStyles } from '../../theme';
import { AuroraBackdrop, type AuroraPalette } from '../aurora';
import { auroraFont, getAuroraTokens } from '../../theme/aurora';
import { getPrimaryScreenHorizontalPadding } from '../../utils/layout';

interface ProfileDetailScreenProps {
  title?: string;
  headerRight?: React.ReactNode;
  overview?: boolean;
  /** Aurora glows behind the header. Off unless asked: this screen also hosts Dieta's and Entreno's subscreens. */
  backdrop?: AuroraPalette;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollEnabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export const ProfileDetailScreen: React.FC<ProfileDetailScreenProps> = ({
  title,
  subtitle,
  headerRight,
  overview = false,
  backdrop,
  children,
  footer,
  scrollEnabled = true,
  contentStyle,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { width, height } = useWindowDimensions();
  const horizontalPadding = getPrimaryScreenHorizontalPadding(width, height);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {backdrop ? <AuroraBackdrop width={width} height={overview ? 520 : height} palette={backdrop} /> : null}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, overview ? styles.overviewHeader : null, { paddingHorizontal: horizontalPadding }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={[styles.backButton, overview ? styles.overviewBack : null]}
            activeOpacity={0.9}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.icon} />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>

        {scrollEnabled ? (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingHorizontal: horizontalPadding },
              footer ? styles.scrollContentWithFooter : null,
              contentStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.staticContent,
              { paddingHorizontal: horizontalPadding },
              footer ? styles.staticContentWithFooter : null,
              contentStyle,
            ]}
          >
            {children}
          </View>
        )}

        {footer ? <View style={[styles.footer, { paddingHorizontal: horizontalPadding }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) => {
  const aurora = getAuroraTokens(theme.isDark);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: aurora.ground,
    },
    keyboardContainer: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    overviewHeader: { paddingTop: 18, paddingBottom: 20, alignItems: 'center' },
    overviewBack: { width: 44, height: 44, borderRadius: 14 },
    backButton: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: aurora.glass,
      borderWidth: 1,
      borderColor: aurora.glassBorder,
    },
    headerContent: {
      flex: 1,
      marginLeft: spacing.md,
    },
    title: {
      fontSize: fontSize['2xl'],
      ...auroraFont('extrabold'),
      color: aurora.text,
    },
    subtitle: {
      ...auroraFont('medium'),
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: aurora.faint,
      lineHeight: 20,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    scrollContentWithFooter: {
      paddingBottom: spacing.xl,
    },
    staticContent: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    staticContentWithFooter: {
      paddingBottom: spacing.lg,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      backgroundColor: aurora.glass,
      borderTopWidth: 1,
      borderTopColor: aurora.border,
    },
  });
};
