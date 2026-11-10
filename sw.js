// KAI Events · notifications for the home-screen app (web push). Shows the notification, sets the red number on the icon,
// and opens the event's guest list when tapped. It does nothing else (no caching).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'KAI Event Planners', body: e.data ? e.data.text() : '' }; }
  var jobs = [self.registration.showNotification(d.title || 'KAI Event Planners', {
    body: d.body || '', tag: d.tag || 'kai', renotify: true, icon: '/app/icons/kai-192.png', badge: '/app/icons/kai-192.png', data: { url: d.url || '/admin' }
  })];
  if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) jobs.push(d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.all(jobs).catch(function () {}));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || '/admin', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('navigate' in list[i]) { return list[i].navigate(url).then(function (c) { return c && c.focus(); }); } }
    return self.clients.openWindow(url);
  }));
});
