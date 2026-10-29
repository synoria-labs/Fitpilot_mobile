import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  FadeInRight,
  interpolate,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { spacing } from '../../constants/colors';
import { categoryLabels, type ScienceTip, type TipCategory } from '../../constants/scienceTips';
import { auroraFont, auroraType, useAurora, type AuroraTone } from '../../theme/aurora';
import { getContextualTips, type TipContext } from '../../utils/contextualTips';
import { AuroraPill, IconBadge, type AuroraIconName } from '../aurora';
import { withAlpha } from '../aurora/AuroraBackdrop';

interface ScienceTipsProps {
  context?: TipContext;
  tipsCount?: number;
  autoScroll?: boolean;
  autoScrollInterval?: number;
  contentWidth?: number;
  horizontalPadding?: number;
  onTipPress?: (tip: ScienceTip) => void;
}

const CARD_GAP = 12;
const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 20;

const CATEGORY_TONES: Record<TipCategory, AuroraTone> = {
  recovery: 'violet',
  nutrition: 'emerald',
  technique: 'slate',
  motivation: 'rose',
  science: 'blue',
  training: 'amber',
};

export const ScienceTips: React.FC<ScienceTipsProps> = ({
  context,
  tipsCount = 5,
  autoScroll = false,
  autoScrollInterval = 5000,
  contentWidth = 390,
  horizontalPadding = spacing.md,
  onTipPress,
}) => {
  const aurora = useAurora();
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const lastIndex = useSharedValue(0);

  const tips = useMemo(() => {
    if (!context) {
      return getContextualTips(
        {
          nextSession: null,
          microcycleProgress: null,
          muscleVolume: null,
          allCompleted: false,
          workoutPosition: null,
          workoutTotal: null,
          currentHour: new Date().getHours(),
        },
        tipsCount,
      );
    }

    return getContextualTips(context, tipsCount);
  }, [context, tipsCount]);

  // Narrower than the screen so the next tip peeks in and invites the swipe.
  const cardMetrics = useMemo(() => {
    const availableWidth = Math.max(320, contentWidth - horizontalPadding * 2);
    const cardWidth = Math.min(Math.round(availableWidth * 0.8), 340);
    const snapInterval = cardWidth + CARD_GAP;

    return { cardWidth, snapInterval };
  }, [contentWidth, horizontalPadding]);

  useEffect(() => {
    if (!autoScroll || tips.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % tips.length;
      scrollViewRef.current?.scrollTo({
        x: nextIndex * cardMetrics.snapInterval,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, autoScrollInterval);

    return () => clearInterval(interval);
  }, [activeIndex, autoScroll, autoScrollInterval, cardMetrics.snapInterval, scrollViewRef, tips.length]);

  const tipCount = tips.length;
  const snapInterval = cardMetrics.snapInterval;
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / snapInterval);

      if (index !== lastIndex.value && index >= 0 && index < tipCount) {
        lastIndex.value = index;
        runOnJS(setActiveIndex)(index);
      }
    },
  });

  if (tips.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <Text style={[auroraType.title, { color: aurora.text }]}>Para ti</Text>
        <Text style={[auroraType.caption, { color: aurora.faint }]}>
          {activeIndex + 1} de {tips.length}
        </Text>
      </View>

      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardMetrics.snapInterval}
        decelerationRate="fast"
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {tips.map((tip, index) => (
          <TipCard
            key={tip.id}
            tip={tip}
            index={index}
            cardWidth={cardMetrics.cardWidth}
            onPress={onTipPress ? () => onTipPress(tip) : undefined}
          />
        ))}
      </Animated.ScrollView>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pagination}>
        {tips.map((tip, index) => (
          <PaginationDot key={tip.id} index={index} scrollX={scrollX} snapInterval={cardMetrics.snapInterval} />
        ))}
      </View>
    </View>
  );
};

/** Stretches into a gradient dash as its card scrolls into place. */
const PaginationDot: React.FC<{ index: number; scrollX: SharedValue<number>; snapInterval: number }> = ({
  index,
  scrollX,
  snapInterval,
}) => {
  const aurora = useAurora();

  const dotStyle = useAnimatedStyle(() => {
    const position = scrollX.value / snapInterval;
    return {
      width: interpolate(
        position,
        [index - 1, index, index + 1],
        [DOT_SIZE, DOT_ACTIVE_WIDTH, DOT_SIZE],
        Extrapolation.CLAMP,
      ),
    };
  });
  const fillStyle = useAnimatedStyle(() => {
    const position = scrollX.value / snapInterval;
    return {
      opacity: interpolate(position, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View style={[styles.dot, { backgroundColor: aurora.borderStrong }, dotStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
        <LinearGradient
          colors={[aurora.tones.blue.tone, aurora.tones.violet.tone]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
};

interface TipCardProps {
  tip: ScienceTip;
  index: number;
  cardWidth: number;
  onPress?: () => void;
}

const TipCard: React.FC<TipCardProps> = ({ tip, index, cardWidth, onPress }) => {
  const aurora = useAurora();
  const toneKey = CATEGORY_TONES[tip.category] ?? 'blue';
  const tone = aurora.tones[toneKey];

  const cardContent = (
    <>
      <LinearGradient
        colors={[withAlpha(tone.tone, aurora.isDark ? 0.16 : 0.1), withAlpha(tone.tone, 0)]}
        locations={[0, 0.62]}
        start={{ x: 0.33, y: 0 }}
        end={{ x: 0.67, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.cardHeader}>
        <IconBadge icon={tip.icon as AuroraIconName} tone={toneKey} variant="solid" size={36} />
        <AuroraPill label={categoryLabels[tip.category] || tip.category} tone={toneKey} />
      </View>

      <Text style={[styles.cardTitle, auroraFont('extrabold'), { color: aurora.text }]} numberOfLines={1}>
        {tip.title}
      </Text>

      <Text style={[styles.cardDescription, auroraFont('medium'), { color: aurora.muted }]} numberOfLines={3}>
        {tip.content}
      </Text>

      {tip.source ? (
        <View style={[styles.sourceContainer, { borderTopColor: aurora.border }]}>
          <Ionicons name="document-text-outline" size={13} color={aurora.faint} />
          <Text style={[auroraType.caption, styles.sourceText, { color: aurora.faint }]} numberOfLines={1}>
            {tip.source}
          </Text>
        </View>
      ) : null}
    </>
  );

  const cardStyle = [
    styles.card,
    { backgroundColor: aurora.surface, borderColor: aurora.border, boxShadow: aurora.shadow },
  ];

  return (
    <Animated.View
      entering={FadeInRight.delay(index * 100).duration(400)}
      style={[styles.cardWrapper, { width: cardWidth }]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${categoryLabels[tip.category] || tip.category}: ${tip.title}`}
          onPress={onPress}
          style={({ pressed }) => [...cardStyle, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={cardStyle}>{cardContent}</View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  scrollContent: {
    gap: CARD_GAP,
    paddingVertical: 4,
  },
  cardWrapper: {
    alignSelf: 'stretch',
  },
  card: {
    flex: 1,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 21,
  },
  cardDescription: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
  },
  sourceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  sourceText: {
    flex: 1,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    overflow: 'hidden',
  },
});

export default ScienceTips;
