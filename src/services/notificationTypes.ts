export const NOTIFICATION_CATEGORIES = [
  'workout_assigned',
  'meal_reminder',
  'subscription_expiring',
  'health_insight',
  'recovery_alert',
  'step_goal',
  'trainer_message',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPayload = {
  category: NotificationCategory;
  entityId?: string;
  deepLink: string;
  data?: Record<string, unknown>;
};

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

export function parseNotificationPayload(raw: unknown): NotificationPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isNotificationCategory(obj.category)) return null;
  if (typeof obj.deepLink !== 'string' || !obj.deepLink.startsWith('/')) return null;
  return {
    category: obj.category,
    entityId: typeof obj.entityId === 'string' ? obj.entityId : undefined,
    deepLink: obj.deepLink,
    data: typeof obj.data === 'object' && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : undefined,
  };
}
