export default function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const swUrl = '/service-worker.js';
  navigator.serviceWorker.register(swUrl).then((reg) => {
    console.log('Service worker registered:', reg);
    try { reg.update(); } catch (e) {}
    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (ev) => {
      try {
        const data = ev.data || {};
        if (data && data.type === 'SYNC_OFFLINE_QUEUE_REQUEST') {
          // request clients to perform sync; clients will handle
          window.dispatchEvent(new CustomEvent('sw:sync-offline-queue', { detail: data }));
        }
      } catch (e) {}
    });
  }).catch((err) => console.warn('Service worker registration failed', err));
}
