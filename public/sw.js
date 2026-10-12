// Network-first shell: never cache authenticated API responses or private data.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Tutel Calendar', {
        body: data.body || '',
        icon: '/assets/app-icon.png',
        badge: '/assets/app-icon.png',
        tag: `${data.groupId || 'calendar'}:${data.notificationId || data.eventId || 'notification'}`,
        data: { url: data.url || '/' },
      }),
      self.navigator?.setAppBadge
        ? self.navigator.setAppBadge(data.unread || 1).catch(() => {})
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);

  if (url.origin !== self.location.origin) {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(async (clients) => {
      for (const client of clients) {
        await client.navigate(url.href);
        await client.focus();
        return;
      }

      return self.clients.openWindow(url.href);
    }),
  );
});
