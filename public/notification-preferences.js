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
