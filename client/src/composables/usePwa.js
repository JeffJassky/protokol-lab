import { ref, computed, onMounted, onUnmounted, readonly } from 'vue';

// Singleton state — we only want one beforeinstallprompt capture per tab,
// and multiple components need to observe the same install status.
const platform = ref(detectPlatform());
const isStandalone = ref(detectStandalone());
const deferredPrompt = ref(null);
const installedThisSession = ref(false);
const swReady = ref(false);
let listenersAttached = false;

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports Mac UA — disambiguate by touch points.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || iPadOS || /iPad/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS uses navigator.standalone, everyone else uses display-mode media query.
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true;
  return false;
}

function isIosSafari() {
  if (platform.value !== 'ios') return false;
  const ua = navigator.userAgent || '';
  // Chrome/Firefox on iOS identify as CriOS/FxiOS and can't install PWAs.
  return !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function attachListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.value = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    installedThisSession.value = true;
  });

  // Re-check standalone on visibility changes so returning from the home
  // screen install flow updates the UI without a manual refresh.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      isStandalone.value = detectStandalone();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => { swReady.value = true; }).catch(() => {});
  }
}

export function usePwa() {
  onMounted(attachListeners);
  onUnmounted(() => { /* singleton listeners persist */ });

  const canPromptInstall = computed(() => deferredPrompt.value != null);
  const installed = computed(() => isStandalone.value || installedThisSession.value);
  const needsIosInstallInstructions = computed(
    () => isIosSafari() && !isStandalone.value,
  );
  const installBlockedByNonSafariIos = computed(
    () => platform.value === 'ios' && !isIosSafari() && !isStandalone.value,
  );

  async function promptInstall() {
    const prompt = deferredPrompt.value;
    if (!prompt) return { outcome: 'unavailable' };
    prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt.value = null;
    return choice;
  }

  return {
    platform: readonly(platform),
    isStandalone: readonly(isStandalone),
    installed,
    canPromptInstall,
    needsIosInstallInstructions,
    installBlockedByNonSafariIos,
    swReady: readonly(swReady),
    promptInstall,
  };
}
