const CACHE_NAME = 'mf-attendance-v3';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  OFFLINE_URL,
];

// Explicit model files to pre-cache so face-api.js models are available offline
const MODEL_FILES = [
  '/models/face_landmark_68_model-shard1',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_recognition_model-shard1',
  '/models/face_recognition_model-shard2',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/ssd_mobilenetv1_model-shard1',
  '/models/ssd_mobilenetv1_model-shard2',
  '/models/ssd_mobilenetv1_model-weights_manifest.json',
  '/models/tiny_face_detector_model-shard1',
  '/models/tiny_face_detector_model-weights_manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE.concat(MODEL_FILES)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

// Network-First strategy to ensure latest UI updates always appear on all network devices
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cache-first ONLY for face recognition models and wasm
  if (url.pathname.startsWith('/models') || url.pathname.endsWith('.wasm')) {
    event.respondWith(
      caches.match(req).then((cacheRes) => {
        if (cacheRes) return cacheRes;
        return fetch(req).then((res) => {
          if (!res || res.status !== 200) return res;
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // Network-first for everything else (UI components, scripts, CSS, navigation)
  event.respondWith(
    fetch(req)
      .then((res) => {
        return res;
      })
      .catch(() => caches.match(req).then((cRes) => cRes || caches.match(OFFLINE_URL)))
  );
});

// Background sync: when service worker receives a sync event, notify clients
self.addEventListener('sync', (event) => {
  if (!event.tag) return;
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SYNC_OFFLINE_QUEUE_REQUEST', tag: event.tag });
        }
      })
    );
  }
});

// Allow runtime clients to message the SW (no-op currently)
self.addEventListener('message', (event) => {
  // placeholder for future commands
});
