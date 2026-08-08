// ──── Browser Notification Utility ────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      ...options,
    });
  } catch {
    // Notification failed silently (e.g. in some mobile browsers)
  }
}

/**
 * Send a review reminder notification
 */
export function sendReviewReminder(dueCount: number) {
  if (dueCount <= 0) return;
  sendNotification('📅 复习提醒', {
    body: `你有 ${dueCount} 张知识卡片待复习`,
    tag: 'review-reminder',
  });
}

/**
 * Schedule a review reminder for the next day
 */
export function scheduleReviewReminder(dueCount: number) {
  if (dueCount <= 0) return;

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9:00 AM

  const msUntilTomorrow = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    sendReviewReminder(dueCount);
  }, msUntilTomorrow);
}