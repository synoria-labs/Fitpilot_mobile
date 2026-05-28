import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/authStore';
import { parseNotificationPayload, type NotificationPayload } from './notificationTypes';
import { navigateToNotificationDeepLink } from './notificationDeepLink';

function handleResponse(
  response: Notifications.NotificationResponse,
  pendingRef: { current: NotificationPayload | null },
): void {
  const raw = response.notification.request.content.data;
  const payload = parseNotificationPayload(raw);
  if (!payload) {
    return;
  }
  if (useAuthStore.getState().isAuthenticated) {
    navigateToNotificationDeepLink(payload);
  } else {
    pendingRef.current = payload;
  }
}

export function useNotificationListeners(): void {
  const pendingPayloadRef = useRef<NotificationPayload | null>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // Foreground notifications are handled by setNotificationHandler in notifications.ts.
      // Hook here later for in-app toast / unread counter if needed.
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response, pendingPayloadRef);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response, pendingPayloadRef);
      }
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Notifications.setBadgeCountAsync(0).catch(() => undefined);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated) {
      return;
    }
    const pending = pendingPayloadRef.current;
    if (!pending) {
      return;
    }
    pendingPayloadRef.current = null;
    navigateToNotificationDeepLink(pending);
  }, [isAuthenticated, isInitialized]);
}
