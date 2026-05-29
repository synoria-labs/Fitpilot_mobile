import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../constants/colors';

const SETTINGS_KEY = 'fitpilot_meal_planning_reminder_settings';
const NOTIFICATION_ID_KEY = 'fitpilot_meal_planning_notification_id';
const ANDROID_CHANNEL_ID = 'meal-planning-reminders';

export type MealPlanningReminderWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type MealPlanningReminderHour = 8 | 10 | 18;

export interface MealPlanningReminderSettings {
  enabled: boolean;
  weekday: MealPlanningReminderWeekday;
  hour: MealPlanningReminderHour;
  minute: 0;
}

export const DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS: MealPlanningReminderSettings = {
  enabled: false,
  weekday: 1,
  hour: 10,
  minute: 0,
};

const VALID_WEEKDAYS = new Set<MealPlanningReminderWeekday>([1, 2, 3, 4, 5, 6, 7]);
const VALID_HOURS = new Set<MealPlanningReminderHour>([8, 10, 18]);

const isValidWeekday = (value: unknown): value is MealPlanningReminderWeekday =>
  typeof value === 'number' && VALID_WEEKDAYS.has(value as MealPlanningReminderWeekday);

const isValidHour = (value: unknown): value is MealPlanningReminderHour =>
  typeof value === 'number' && VALID_HOURS.has(value as MealPlanningReminderHour);

const normalizeSettings = (value: unknown): MealPlanningReminderSettings => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS;
  }

  const candidate = value as Partial<MealPlanningReminderSettings>;

  return {
    enabled: candidate.enabled === true,
    weekday: isValidWeekday(candidate.weekday)
      ? candidate.weekday
      : DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS.weekday,
    hour: isValidHour(candidate.hour)
      ? candidate.hour
      : DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS.hour,
    minute: 0,
  };
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Planificacion semanal',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.success,
  });
};

const requestNotificationPermission = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

export const getMealPlanningReminderSettings =
  async (): Promise<MealPlanningReminderSettings> => {
    const storedValue = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!storedValue) {
      return DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS;
    }

    try {
      return normalizeSettings(JSON.parse(storedValue));
    } catch {
      return DEFAULT_MEAL_PLANNING_REMINDER_SETTINGS;
    }
  };

export const saveMealPlanningReminderSettings = async (
  settings: MealPlanningReminderSettings,
): Promise<MealPlanningReminderSettings> => {
  const normalizedSettings = normalizeSettings(settings);
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(normalizedSettings));
  return normalizedSettings;
};

export const cancelMealPlanningReminder = async (): Promise<void> => {
  const notificationId = await SecureStore.getItemAsync(NOTIFICATION_ID_KEY);
  if (notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // The identifier may point to a notification already removed by the OS.
    }
  }

  await SecureStore.deleteItemAsync(NOTIFICATION_ID_KEY);
};

export const scheduleMealPlanningReminder = async (
  settings: MealPlanningReminderSettings,
): Promise<string | null> => {
  const normalizedSettings = normalizeSettings(settings);
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    return null;
  }

  await ensureAndroidChannel();
  await cancelMealPlanningReminder();

  const trigger: Notifications.WeeklyTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: normalizedSettings.weekday,
    hour: normalizedSettings.hour,
    minute: normalizedSettings.minute,
  };

  if (Platform.OS === 'android') {
    trigger.channelId = ANDROID_CHANNEL_ID;
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Planifica tus menus',
      body: 'Elige tus comidas de la semana y genera tu lista del super.',
      sound: true,
      data: {
        feature: 'meal-planning',
      },
    },
    trigger,
  });

  await SecureStore.setItemAsync(NOTIFICATION_ID_KEY, notificationId);
  return notificationId;
};
