import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const PUSH_TOKEN_FINGERPRINT_KEY = 'fitpilot_push_token_fingerprint';

type RegisterDevicePushTokenOptions = {
  force?: boolean;
};

// Configure how notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Requests permission to send push notifications and returns the Expo push token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10b981', // emerald-500
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return undefined;
    }

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      if (!projectId) {
         console.warn("Project ID not found in app.json configuration. Defaulting to empty project id.");
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: projectId || undefined,
        })
      ).data;

      console.log('Expo Push Token generated:', token);
    } catch (e) {
      console.warn('Error evaluating push token:', e);
    }
  } else {
    console.warn('Must use physical device for Push Notifications');
  }

  return token;
}

/**
 * Sends the generated token to the backend to associate it with the logged-in user.
 */
export async function sendPushTokenToBackend(pushToken: string): Promise<boolean> {
  try {
    const { nutritionClient } = await import('./api');

    await nutritionClient.post('/users/push-token', { token: pushToken });
    console.log('Successfully registered push token with backend');
    return true;
  } catch (error) {
    console.error('Failed to send push token to backend:', error);
    return false;
  }
}

export async function registerDevicePushTokenForUser(
  userId: string,
  options: RegisterDevicePushTokenOptions = {},
): Promise<boolean> {
  const pushToken = await registerForPushNotificationsAsync();
  if (!pushToken) {
    return false;
  }

  const fingerprint = `${userId}:${pushToken}`;
  const previousFingerprint = await SecureStore.getItemAsync(PUSH_TOKEN_FINGERPRINT_KEY);
  if (!options.force && previousFingerprint === fingerprint) {
    return true;
  }

  const wasRegistered = await sendPushTokenToBackend(pushToken);
  if (!wasRegistered) {
    return false;
  }
  await SecureStore.setItemAsync(PUSH_TOKEN_FINGERPRINT_KEY, fingerprint);
  return true;
}
