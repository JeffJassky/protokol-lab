// Registers /sw.js and forwards notification-click messages back to the app
// so Vue Router can handle the target URL without a full reload.
export async function registerServiceWorker(router) {
  if (!('serviceWorker' in navigator)) return null;
  // Our SW only handles push + notificationclick — no precaching — so it's
  // safe to run in dev. Opt-out via VITE_DISABLE_SW=1 if it ever gets in the way.
  if (import.meta.env.VITE_DISABLE_SW === '1') return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'notification-click' && event.data.url) {
        const url = event.data.url;
        // Path-only urls route through vue-router; full origins do window.location.
        if (url.startsWith('/')) router.push(url).catch(() => {});
        else window.location.href = url;
      }
    });

    return reg;
  } catch (err) {
    console.error('[pwa] SW registration failed', err);
    return null;
  }
}
