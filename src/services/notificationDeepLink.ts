import { router } from 'expo-router';
import type { NotificationPayload } from './notificationTypes';

const ALLOWED_PATH_PREFIXES = [
  '/(tabs)',
  '/profile',
  '/measurements',
  '/recipes',
  '/recommendations',
  '/workout',
  '/workouts',
] as const;

export function isAllowedDeepLink(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function navigateToNotificationDeepLink(payload: NotificationPayload): void {
  if (!isAllowedDeepLink(payload.deepLink)) {
    console.warn('[notifications] Rejected deep link not in allow list:', payload.deepLink);
    return;
  }
  try {
    router.push(payload.deepLink as never);
  } catch (error) {
    console.warn('[notifications] Failed to navigate to deep link:', payload.deepLink, error);
  }
}
