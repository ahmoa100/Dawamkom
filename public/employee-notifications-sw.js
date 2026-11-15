self.addEventListener('push', event => {
  const notification = event.data?.json();
  if (!notification) return;
  event.waitUntil(self.registration.showNotification(notification.title, {
    body: notification.body,
    icon: '/apple-touch-icon.png',
    tag: notification.tag,
    data: { url: notification.url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data.url, self.location.origin);
  if (target.origin === self.location.origin) event.waitUntil(clients.openWindow(target.href));
});
