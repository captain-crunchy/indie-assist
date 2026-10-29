// Service Worker: zeigt Push-Benachrichtigungen an und öffnet beim Tippen die App.
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'Pi-Planer', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icon.svg', badge: '/icon.svg', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws[0]; return w ? w.focus() : clients.openWindow(e.notification.data.url);
  }));
});
