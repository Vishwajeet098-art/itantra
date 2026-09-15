/* iTantra Service Worker — Web Push + offline cache */
const CACHE_NAME = 'itantra-v2';
const PRECACHE = ['/', '/sos', '/room', '/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// ── Push ───────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() ?? {}; } catch {}

  const { type, senderName, roomCode, audioUrl, body, eventId, url } = data;

  let title, options;

  if (type === 'VOICE_MESSAGE') {
    title = `🎙 Voice message from ${senderName || 'someone'}`;
    options = {
      body: 'Tap to open the room and play.',
      tag: `voice-${roomCode}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      icon: '/itantra-icon.png',
      data: { url: url || `/room?code=${roomCode}`, roomCode, audioUrl, type },
      actions: [{ action: 'open', title: '▶ Open Room' }],
    };
  } else if (type === 'TEXT_MESSAGE') {
    title = `💬 Message from ${senderName || 'someone'}`;
    options = {
      body: body || 'New message',
      tag: `text-${roomCode}`,
      renotify: false,
      requireInteraction: false,
      icon: '/itantra-icon.png',
      data: { url: url || `/room?code=${roomCode}`, type },
    };
  } else if (type === 'SOS_VOICE') {
    title = `🆘 SOS from ${senderName || 'someone'}`;
    options = {
      body: 'Emergency! Tap to open voice note.',
      tag: `sos-${eventId}`,
      requireInteraction: true,
      renotify: true,
      vibrate: [200, 100, 200, 100, 400],
      icon: '/itantra-icon.png',
      data: { url: '/sos', audioUrl, type },
    };
  } else {
    title = data.title || '📡 iTantra';
    options = { body: data.body || data.message || 'Alert', icon: '/itantra-icon.png', data: { url: url || '/' } };
  }

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const target = d.url || '/room';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.postMessage({ type: 'NOTIFICATION_CLICK', ...d });
          return c.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : null;
    })
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
