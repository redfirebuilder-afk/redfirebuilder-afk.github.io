// ============================================
// SERVICE WORKER — Кэширование для PWA
// ============================================

const CACHE_NAME = 'messenger-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/auth.js',
  './js/profile.js',
  './js/upload.js',
  './js/notifications.js',
  './js/chats.js',
  './js/messages.js',
  './js/admin.js',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for Firebase
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and Firebase requests
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebase.com') ||
      url.hostname.includes('gstatic.com')) return;

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Нет интернет-соединения', { status: 503 }));
    })
  );
});

// Push notifications (future use)
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();
  self.registration.showNotification(data.title || 'Messenger', {
    body: data.body || '',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: data.chatId || 'message',
    data: { chatId: data.chatId },
  });
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
