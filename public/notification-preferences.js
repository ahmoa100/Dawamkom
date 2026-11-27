export function effectiveNotificationPreferences(workspace, branchId) {
  return {...workspace.notificationPreferences,...workspace.branchNotificationPreferences?.[branchId]};
}
export function effectiveNotificationSettings(workspace, branchId) {
  return {...workspace.notificationSettings,...workspace.branchNotificationSettings?.[branchId]};
}

export function documentReminderDays(settings={}) {
 const days=settings.documentReminderDays;
 return Number.isInteger(days)&&days>=0&&days<=365?days:30;
}

export function documentExpiryStatus(expiresOn, today, leadDays) {
  const days = (Date.parse(expiresOn) - Date.parse(today)) / 86400000;
  if (!Number.isFinite(days)) return 'undated';
  if (days < 0) return 'expired';
  if (days <= 7) return 'urgent';
  return days <= leadDays ? 'soon' : 'valid';
}
