export function notificationDisplay(value = {}) {
  return { mode: value.mode === 'badge' ? 'badge' : 'popup',
    seconds: Number.isInteger(value.seconds) && value.seconds >= 2 && value.seconds <= 60 ? value.seconds : 5 };
}

export function validateNotificationDisplay(value) {
  if (!['popup', 'badge'].includes(value?.mode) || !Number.isInteger(value.seconds) || value.seconds < 2 || value.seconds > 60) {
    throw new Error('Choose a notification duration from 2 to 60 seconds.');
  }
  return notificationDisplay(value);
}

export function newNotificationIds(alerts, seen) {
  const fresh = alerts.filter(alert => !seen.has(alert.id));
  for (const alert of alerts) seen.add(alert.id);
  return fresh;
}
