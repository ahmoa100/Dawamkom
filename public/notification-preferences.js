export function effectiveNotificationPreferences(workspace, branchId) {
  return {...workspace.notificationPreferences,...workspace.branchNotificationPreferences?.[branchId]};
}
export function effectiveNotificationSettings(workspace, branchId) {
  return {...workspace.notificationSettings,...workspace.branchNotificationSettings?.[branchId]};
}
