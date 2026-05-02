import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { isNativePlatform } from '../api/auth-token.js';

// Push notifications on the client. Two transports — Web Push (browsers,
// VAPID + service worker) and APNs via @capacitor/push-notifications on
// the iOS native shell. Both share permission/enabled/error state so the
// UI doesn't have to branch per-platform.
export const usePushStore = defineStore('push', () => {
  const vapidKey = ref('');
  const serverEnabled = ref(false);
  const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  // Web: PushSubscription.toJSON(). Native: { endpoint: 'apns:<token>',
  // transport: 'apns', token } — endpoint synthesized to match the server's
  // PushSubscription.endpoint convention so setCategories etc. just work.
  const subscription = ref(null);
  const subscriptionDoc = ref(null); // server-side doc w/ categories
  const loading = ref(false);
  const error = ref('');

  const supported = computed(() => {
    if (typeof window === 'undefined') return false;
    if (isNativePlatform()) return true;
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
    if (isNativePlatform()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const r = await PushNotifications.checkPermissions();
        // Capacitor returns 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'.
        // Collapse the prompt variants to 'default' so UI logic matches Web.
        permission.value = r.receive === 'granted' || r.receive === 'denied' ? r.receive : 'default';
      } catch {
        // Plugin not available (web build) — fall through to Web Notification API.
      }
      return;
    }
    if (typeof Notification !== 'undefined') permission.value = Notification.permission;
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.ready;
  }

  async function loadExistingSubscription() {
    if (isNativePlatform()) {
      // Native subscription is hydrated from persisted Pinia state — there's
      // no APNs API to query "am I registered?". If we have a token already,
      // refresh permission state to reflect whether the user revoked it in
      // iOS Settings since last launch.
      await refreshPermission();
      return;
    }
    if (!supported.value) return;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    subscription.value = sub ? sub.toJSON() : null;
  }

  // Native (iOS APNs / Android FCM) enable. Resolves to true on success,
  // false (with `error` populated) otherwise. Listens once for the
  // 'registration' event; the plugin fires it after `register()` completes
  // an APNs handshake. Times out after 15s so a silent failure surfaces in
  // the UI instead of leaving the button spinning forever.
  async function enableNative() {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    permission.value = perm.receive === 'granted' || perm.receive === 'denied'
      ? perm.receive
      : 'default';
    if (perm.receive !== 'granted') {
      error.value = perm.receive === 'denied'
        ? 'Notifications blocked. Enable in iOS Settings → Protokol Lab → Notifications.'
        : 'Notifications permission was dismissed.';
      return false;
    }

    const token = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('APNs registration timed out — is the app signed with a push entitlement?'));
      }, 15000);
      let regHandle, errHandle;
      PushNotifications.addListener('registration', (t) => {
        clearTimeout(timeout);
        regHandle?.remove?.();
        errHandle?.remove?.();
        resolve(t.value);
      }).then((h) => { regHandle = h; });
      PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timeout);
        regHandle?.remove?.();
        errHandle?.remove?.();
        reject(new Error(e?.error || 'APNs registration failed'));
      }).then((h) => { errHandle = h; });
      PushNotifications.register().catch((e) => {
        clearTimeout(timeout);
        regHandle?.remove?.();
        errHandle?.remove?.();
        reject(e);
      });
    });

    subscription.value = { endpoint: `apns:${token}`, transport: 'apns', token };
    const saved = await api.post('/api/push/subscribe', { transport: 'apns', token });
    subscriptionDoc.value = saved.subscription;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      await api.patch('/api/settings/notifications', { timezone: tz }).catch(() => {});
    }
    return true;
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
      if (isNativePlatform()) {
        return await enableNative();
      }

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
      if (isNativePlatform()) {
        // No "unregister" on iOS — the OS owns the APNs token and will
        // re-issue/recycle it as needed. Drop the server-side row and the
        // local persisted state so this device stops getting fan-outs.
        const ep = subscription.value?.endpoint;
        if (ep) {
          await api.post('/api/push/unsubscribe', { endpoint: ep }).catch(() => {});
        }
        subscription.value = null;
        subscriptionDoc.value = null;
        return;
      }
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
}, {
  // Native APNs has no "is this device registered?" query API — once
  // PushNotifications.register() fires the registration event we have to
  // remember the token ourselves, otherwise every cold start would prompt
  // the user again. Web subscription is also persisted: cheap, and lets
  // `enabled` resolve synchronously on cold load before the SW handshake
  // completes.
  persist: { pick: ['subscription', 'subscriptionDoc'] },
});
