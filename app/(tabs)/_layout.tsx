import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router, Tabs } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme, useThemedStyles } from '../../src/theme';
import {
  BottomTabBarVisibilityProvider,
  useBottomTabBarVisibility,
} from '../../src/hooks/useBottomTabBarVisibility';
import { isTabletLayout } from '../../src/utils/layout';
import { ProtectedRoute } from '../../src/components/common';
import { useAuthStore } from '../../src/store/authStore';
import { registerDevicePushTokenForUser } from '../../src/services/notifications';

const TABLET_EXPANDED_WIDTH = 152;
const TABLET_COLLAPSED_WIDTH = 84;
const TABLET_TOP_PADDING = 88;
const TABLET_BOTTOM_PADDING = 18;
const TABLET_TOGGLE_TOP = 44;
const PHONE_TAB_BAR_HEIGHT = 60;
const PHONE_TAB_BAR_VERTICAL_PADDING = 8;
const HIDDEN_CONTENT_BOTTOM_INSET = 12;

interface TabletTabBarProps {
  props: BottomTabBarProps;
  isExpanded: boolean;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onToggle: () => void;
}

interface PhoneTabBarProps {
  props: BottomTabBarProps;
}

type TabBarIconRenderer = (props: {
  focused: boolean;
  color: string;
  size: number;
}) => React.ReactNode;

type TabLayoutStyles = ReturnType<typeof createStyles>;

const TabletTabBar: React.FC<TabletTabBarProps> = ({
  props,
  isExpanded,
  onHoverIn,
  onHoverOut,
  onToggle,
}) => {
  const { state, descriptors, navigation } = props;
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const toggleIconColor = theme.isDark ? theme.colors.textPrimary : theme.colors.tabBarActiveTint;

  return (
    <Pressable
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        styles.tabletRailContainer,
        isExpanded ? styles.tabletRailContainerExpanded : styles.tabletRailContainerCollapsed,
      ]}
    >
      <View
        style={[
          styles.tabletRailInner,
          isExpanded ? styles.tabletRailInnerExpanded : styles.tabletRailInnerCollapsed,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Contraer navegacion' : 'Expandir navegacion'}
          accessibilityHint="Cambia el ancho de la barra lateral"
          hitSlop={8}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.tabletRailToggle,
            !isExpanded ? styles.tabletRailToggleCollapsed : null,
            pressed ? styles.tabletRailTogglePressed : null,
          ]}
        >
          <Ionicons
            name={isExpanded ? 'chevron-back' : 'chevron-forward'}
            size={20}
            color={toggleIconColor}
          />
        </Pressable>
        <View
          style={[
            styles.tabletTabBar,
            isExpanded ? styles.tabletTabBarExpanded : styles.tabletTabBarCollapsed,
          ]}
        >
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;
            const color = isFocused
              ? theme.colors.tabBarActiveTint
              : theme.colors.tabBarInactiveTint;
            const rawLabel =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : options.title || route.name;
            const label = rawLabel === 'index' ? 'Inicio' : rawLabel;
            const icon = options.tabBarIcon as TabBarIconRenderer | undefined;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onLongPress={onLongPress}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.tabletTabBarItem,
                  isExpanded ? styles.tabletTabBarItemExpanded : styles.tabletTabBarItemCollapsed,
                  isFocused ? styles.tabletTabBarItemActive : null,
                  pressed ? styles.tabletTabBarItemPressed : null,
                ]}
              >
                <View
                  style={[
                    styles.tabletTabBarIconSlot,
                    !isExpanded ? styles.tabletTabBarIconSlotCollapsed : null,
                  ]}
                >
                  {icon?.({
                    focused: isFocused,
                    color,
                    size: 24,
                  })}
                </View>
                {isExpanded ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabletTabBarLabel,
                      isFocused ? styles.tabletTabBarLabelActive : null,
                      { color },
                    ]}
                  >
                    {label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
};

const PhoneTabBar: React.FC<PhoneTabBarProps> = ({ props }) => {
  const { state, descriptors, navigation } = props;
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isVisible, setContentInsetBottom } = useBottomTabBarVisibility();
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const tabWidth = (width - 32) / state.routes.length;
  const indicatorX = useSharedValue(state.index * tabWidth);
  const visiblePaddingBottom = Math.max(insets.bottom, 16);
  const hiddenOffset = PHONE_TAB_BAR_HEIGHT + visiblePaddingBottom + 24;
  const visibleContentInset = PHONE_TAB_BAR_HEIGHT + visiblePaddingBottom + 16;

  useEffect(() => {
    indicatorX.value = withSpring(state.index * tabWidth, {
      damping: 20,
      stiffness: 150,
      mass: 0.8,
    });
    translateY.value = withSpring(isVisible ? 0 : hiddenOffset, {
      damping: 20,
      stiffness: 120,
    });
    opacity.value = withTiming(isVisible ? 1 : 0, { duration: 250 });
    setContentInsetBottom(
      isVisible ? visibleContentInset : insets.bottom + HIDDEN_CONTENT_BOTTOM_INSET,
    );
  }, [
    hiddenOffset,
    indicatorX,
    insets.bottom,
    isVisible,
    opacity,
    setContentInsetBottom,
    state.index,
    tabWidth,
    translateY,
    visibleContentInset,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value + (tabWidth - 48) / 2 }],
  }));

  return (
    <Animated.View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        styles.phoneFloatingTabBarWrapper,
        animatedStyle,
        {
          paddingBottom: visiblePaddingBottom,
          paddingHorizontal: 16,
        },
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? (theme.isDark ? 45 : 60) : 42}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
        tint={
          Platform.OS === 'android' && theme.isDark
            ? 'systemUltraThinMaterialDark'
            : theme.colors.phoneNavShellBlurTint
        }
        style={styles.customTabBarBlur}
      >
        <View style={styles.customTabBarContainer}>
          <Animated.View
            style={[styles.customTabIconWrapperActive, styles.slidingIndicator, indicatorStyle]}
          />
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const label = options.title || route.name;

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.customTabItem}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
              >
                <AnimatedTabIcon
                  focused={isFocused}
                  icon={options.tabBarIcon as TabBarIconRenderer | undefined}
                  activeColor={theme.colors.phoneNavIconActive}
                  inactiveColor={theme.colors.phoneNavIconInactive}
                  styles={styles}
                />
                <AnimatedLabel
                  focused={isFocused}
                  label={label === 'index' ? 'Inicio' : label}
                  activeColor={theme.colors.phoneNavLabelActive}
                  inactiveColor={theme.colors.phoneNavLabelInactive}
                  styles={styles}
                />
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </Animated.View>
  );
};

type AnimatedTabIconProps = {
  focused: boolean;
  icon?: TabBarIconRenderer;
  activeColor: string;
  inactiveColor: string;
  styles: TabLayoutStyles;
};

const AnimatedTabIcon: React.FC<AnimatedTabIconProps> = ({
  focused,
  icon,
  activeColor,
  inactiveColor,
  styles,
}) => {
  const scale = useSharedValue(focused ? 1.15 : 1);
  const opacity = useSharedValue(focused ? 1 : 0.7);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 12,
      stiffness: 200,
    });
    opacity.value = withTiming(focused ? 1 : 0.7, { duration: 250 });
  }, [focused, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.customTabIconWrapper, animatedStyle]}>
      {icon?.({
        focused,
        color: focused ? activeColor : inactiveColor,
        size: 24,
      })}
    </Animated.View>
  );
};

type AnimatedLabelProps = {
  focused: boolean;
  label: string;
  activeColor: string;
  inactiveColor: string;
  styles: TabLayoutStyles;
};

const AnimatedLabel: React.FC<AnimatedLabelProps> = ({
  focused,
  label,
  activeColor,
  inactiveColor,
  styles,
}) => {
  const scale = useSharedValue(focused ? 1 : 0.92);
  const opacity = useSharedValue(focused ? 1 : 0.7);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.92, {
      damping: 15,
      stiffness: 150,
    });
    opacity.value = withTiming(focused ? 1 : 0.7, { duration: 250 });
  }, [focused, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.Text
      numberOfLines={1}
      style={[
        styles.customTabText,
        focused && styles.customTabTextActive,
        { color: focused ? activeColor : inactiveColor },
        animatedStyle,
      ]}
    >
      {label}
    </Animated.Text>
  );
};

export default function TabLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = isTabletLayout(width, height);
  const isHoverEnabled = Platform.OS === 'web';
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuthStore();
  const [isRailPinnedExpanded, setIsRailPinnedExpanded] = useState(true);
  const [isRailHovered, setIsRailHovered] = useState(false);

  const isRailExpanded = useMemo(
    () => (isHoverEnabled ? isRailPinnedExpanded || isRailHovered : isRailPinnedExpanded),
    [isHoverEnabled, isRailHovered, isRailPinnedExpanded],
  );

  useEffect(() => {
    setIsRailPinnedExpanded(isTablet);
    setIsRailHovered(false);
  }, [isTablet]);

  useEffect(() => {
    if (Platform.OS === 'web' || !user?.id) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      void registerDevicePushTokenForUser(user.id);
    });

    return () => {
      task.cancel();
    };
  }, [user?.id]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const conversationId = data.conversation_id;

      if (data.type === 'chat' && conversationId) {
        router.push({
          pathname: '/(tabs)/chat',
          params: { conversationId: String(conversationId) },
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ProtectedRoute>
      <BottomTabBarVisibilityProvider>
        <Tabs
          tabBar={(props) =>
            isTablet ? (
              <TabletTabBar
                props={props}
                isExpanded={isRailExpanded}
                onHoverIn={isHoverEnabled ? () => setIsRailHovered(true) : undefined}
                onHoverOut={isHoverEnabled ? () => setIsRailHovered(false) : undefined}
                onToggle={() => setIsRailPinnedExpanded((currentValue) => !currentValue)}
              />
            ) : (
              <PhoneTabBar props={props} />
            )
          }
          screenOptions={{
            animation: 'none',
            sceneStyle: {
              backgroundColor: theme.colors.background,
            },
            tabBarPosition: isTablet ? 'left' : 'bottom',
            tabBarVariant: isTablet ? 'material' : 'uikit',
            tabBarActiveTintColor: theme.colors.tabBarActiveTint,
            tabBarInactiveTintColor: theme.colors.tabBarInactiveTint,
            tabBarActiveBackgroundColor: isTablet
              ? theme.colors.tabBarActiveBg
              : theme.colors.tabBarBackground,
            tabBarInactiveBackgroundColor: theme.colors.tabBarBackground,
            tabBarShowLabel: !isTablet || isRailExpanded,
            tabBarHideOnKeyboard: !isTablet,
            tabBarStyle: isTablet
              ? [
                  styles.tabletTabBar,
                  isRailExpanded ? styles.tabletTabBarExpanded : styles.tabletTabBarCollapsed,
                ]
              : styles.phoneTabBar,
            tabBarItemStyle: isTablet
              ? [
                  styles.tabletTabBarItem,
                  isRailExpanded ? styles.tabletTabBarItemExpanded : styles.tabletTabBarItemCollapsed,
                ]
              : styles.phoneTabBarItem,
            tabBarLabelStyle: isTablet ? styles.tabletTabBarLabel : styles.phoneTabBarLabel,
            tabBarIconStyle: isTablet ? styles.tabletTabBarIcon : undefined,
            headerShown: false,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Inicio',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'home' : 'home-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="diet"
            options={{
              title: 'Dieta',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'restaurant' : 'restaurant-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="workouts"
            options={{
              title: 'Entreno',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'barbell' : 'barbell-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              title: 'Chat',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="measurements"
            options={{
              title: 'Medidas',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'body' : 'body-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="search"
            options={{
              title: 'Buscar',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'search' : 'search-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Perfil',
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons
                  name={focused ? 'person' : 'person-outline'}
                  size={size}
                  color={color}
                />
              ),
            }}
          />
        </Tabs>
      </BottomTabBarVisibilityProvider>
    </ProtectedRoute>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>['theme']) =>
  StyleSheet.create({
    phoneFloatingTabBarWrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      backgroundColor: 'transparent',
    },
    phoneTabBar: {
      backgroundColor: theme.colors.tabBarBackground,
      borderTopColor: theme.colors.tabBarBorder,
      borderTopWidth: 1,
      paddingTop: PHONE_TAB_BAR_VERTICAL_PADDING,
      paddingBottom: PHONE_TAB_BAR_VERTICAL_PADDING,
      height: PHONE_TAB_BAR_HEIGHT,
    },
    phoneTabBarItem: {
      borderRadius: 0,
    },
    customTabBarBlur: {
      borderRadius: 35,
      overflow: 'hidden',
      backgroundColor:
        Platform.OS === 'android'
          ? theme.isDark
            ? 'rgba(13, 37, 72, 0.76)'
            : 'rgba(239, 248, 255, 0.74)'
          : theme.colors.phoneNavShellBackground,
      borderWidth: 1,
      borderColor:
        Platform.OS === 'android'
          ? theme.isDark
            ? 'rgba(103, 182, 223, 0.22)'
            : 'rgba(103, 182, 223, 0.20)'
          : theme.colors.phoneNavShellBorder,
      ...(Platform.OS === 'android'
        ? {
            shadowColor: 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          }
        : {
            shadowColor: theme.isDark ? '#000000' : theme.colors.phoneNavIconActive,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: theme.isDark ? 0.22 : 0.12,
            shadowRadius: theme.isDark ? 20 : 18,
            elevation: theme.isDark ? 12 : 10,
          }),
    },
    customTabBarContainer: {
      flexDirection: 'row',
      height: 72,
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 8,
    },
    customTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    customTabIconWrapper: {
      width: 48,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    customTabIconWrapperActive: {
      backgroundColor: theme.colors.phoneNavIndicatorBackground,
    },
    slidingIndicator: {
      position: 'absolute',
      top: 20,
    },
    customTabText: {
      fontSize: 10,
      fontWeight: '500',
    },
    customTabTextActive: {
      fontWeight: '600',
    },
    phoneTabBarLabel: {
      fontSize: 11,
      fontWeight: '500',
    },
    tabletRailContainer: {
      alignSelf: 'stretch',
      flexShrink: 0,
    },
    tabletRailContainerExpanded: {
      width: TABLET_EXPANDED_WIDTH,
    },
    tabletRailContainerCollapsed: {
      width: TABLET_COLLAPSED_WIDTH,
    },
    tabletRailInner: {
      flex: 1,
      position: 'relative',
      width: '100%',
    },
    tabletRailInnerExpanded: {
      width: TABLET_EXPANDED_WIDTH,
    },
    tabletRailInnerCollapsed: {
      width: TABLET_COLLAPSED_WIDTH,
    },
    tabletTabBar: {
      backgroundColor: theme.colors.tabBarBackground,
      borderTopWidth: 0,
      borderRightColor: theme.colors.tabBarBorder,
      borderRightWidth: 1,
      flex: 1,
      paddingTop: TABLET_TOP_PADDING,
      paddingBottom: TABLET_BOTTOM_PADDING,
      width: '100%',
    },
    tabletTabBarExpanded: {
      width: TABLET_EXPANDED_WIDTH,
    },
    tabletTabBarCollapsed: {
      width: TABLET_COLLAPSED_WIDTH,
    },
    tabletTabBarItem: {
      alignItems: 'center',
      borderColor: 'transparent',
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      height: 48,
      marginHorizontal: 12,
      marginVertical: 6,
      minHeight: 48,
    },
    tabletTabBarItemExpanded: {
      justifyContent: 'flex-start',
      paddingHorizontal: 12,
    },
    tabletTabBarItemCollapsed: {
      alignSelf: 'center',
      width: 48,
      marginHorizontal: 0,
      paddingHorizontal: 0,
      justifyContent: 'center',
    },
    tabletTabBarItemActive: {
      backgroundColor: theme.colors.tabBarActiveBg,
      borderColor: theme.colors.primaryBorder,
      borderLeftColor: theme.colors.tabBarActiveTint,
      borderLeftWidth: 2,
    },
    tabletTabBarItemPressed: {
      opacity: 0.82,
    },
    tabletTabBarIconSlot: {
      alignItems: 'center',
      height: 24,
      justifyContent: 'center',
      marginRight: 12,
      width: 24,
    },
    tabletTabBarIconSlotCollapsed: {
      marginRight: 0,
    },
    tabletTabBarLabel: {
      fontSize: 12,
      fontWeight: '500',
    },
    tabletTabBarLabelActive: {
      fontWeight: '600',
    },
    tabletTabBarIcon: {
      marginTop: 2,
    },
    tabletRailToggle: {
      position: 'absolute',
      top: TABLET_TOGGLE_TOP,
      right: 22,
      zIndex: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? theme.colors.surfaceAlt : theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.primaryBorder,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.28 : 0.14,
      shadowRadius: 10,
      elevation: 8,
    },
    tabletRailTogglePressed: {
      backgroundColor: theme.colors.tabBarActiveBg,
      transform: [{ scale: 0.96 }],
    },
    tabletRailToggleCollapsed: {
      right: 24,
    },
  });
