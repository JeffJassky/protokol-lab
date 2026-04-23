import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Web Push on the client-side. Manages: VAPID key fetch, current browser
// Notification permission state, active PushSubscription, subscribe/unsub,
// per-category toggles.
export const usePushStore = defineStore('push', () => {
  const vapidKey = ref('');
  const serverEnabled = ref(false);
  const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const subscription = ref(null); // PushSubscription.toJSON() or null
  const subscriptionDoc = ref(null); // server-side doc w/ categories
  const loading = ref(false);
  const error = ref('');

  const supported = computed(() => {
    if (typeof window === 'undefined') return false;
    return (
      'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window
    );
  });

  const enabled = computed(() => permission.value === 'granted' && !!subscription.value);

  async function fetchVapidKey() {
    if (vapidKey.value) return vapidKey.value;
    const data = await api.get('/api/push/vapid-public-key');
    vapidKey.value = data.key || '';
    serverEnabled.value = Boolean(data.enabled);
    return vapidKey.value;
  }

  async function refreshPermission() {
    if (typeof Notification !== 'undefined') permission.value = Notification.permission;
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.ready;
  }

  async function loadExistingSubscription() {
    if (!supported.value) return;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    subscription.value = sub ? sub.toJSON() : null;
  }

  // Web Push requires the VAPID public key in a Uint8Array — this is the
  // canonical urlBase64 → Uint8Array conversion.
  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function enable() {
    error.value = '';
    if (!supported.value) {
      error.value = 'Push is not supported in this browser.';
      return false;
    }
    loading.value = true;
    try {
      await fetchVapidKey();
      if (!vapidKey.value) {
        error.value = 'Server push is not configured.';
        return false;
      }

      const perm = await Notification.requestPermission();
      permission.value = perm;
      if (perm !== 'granted') {
        error.value = perm === 'denied'
          ? 'Notifications blocked. Enable them in your device Settings → this app.'
          : 'Notifications permission was dismissed.';
        return false;
      }

      const reg = await getRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey.value),
        });
      }
      subscription.value = sub.toJSON();

      const saved = await api.post('/api/push/subscribe', {
        subscription: sub.toJSON(),
      });
      subscriptionDoc.value = saved.subscription;

      // Opportunistic: push the user's IANA timezone up so the scheduler
      // fires reminders at local wall-clock times.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        await api.patch('/api/settings/notifications', { timezone: tz }).catch(() => {});
      }

      return true;
    } catch (err) {
      error.value = err.message || 'Failed to enable notifications.';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function disable() {
    error.value = '';
    loading.value = true;
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      subscription.value = null;
      subscriptionDoc.value = null;
    } catch (err) {
      error.value = err.message || 'Failed to disable notifications.';
    } finally {
      loading.value = false;
    }
  }

  async function setCategories(categories) {
    if (!subscription.value?.endpoint) return;
    const data = await api.patch('/api/push/categories', {
      endpoint: subscription.value.endpoint,
      categories,
    });
    subscriptionDoc.value = data.subscription;
  }

  async function sendTest() {
    return api.post('/api/push/test', {
      endpoint: subscription.value?.endpoint,
    });
  }

  async function fetchSubscriptions() {
    try {
      const data = await api.get('/api/push/subscriptions');
      // The doc for *this* device is the one whose endpoint matches our sub.
      if (subscription.value?.endpoint) {
        subscriptionDoc.value = data.subscriptions.find(
          (s) => s.endpoint === subscription.value.endpoint,
        ) || null;
      }
      return data.subscriptions;
    } catch {
      return [];
    }
  }

  return {
    vapidKey,
    serverEnabled,
    permission,
    subscription,
    subscriptionDoc,
    loading,
    error,
    supported,
    enabled,
    fetchVapidKey,
    refreshPermission,
    loadExistingSubscription,
    enable,
    disable,
    setCategories,
    sendTest,
    fetchSubscriptions,
  };
});
