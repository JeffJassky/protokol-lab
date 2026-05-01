import { ref, computed, onMounted, onUnmounted, readonly } from 'vue';

// Singleton state — we only want one beforeinstallprompt capture per tab,
// and multiple components need to observe the same install status.
const os = ref(detectOs());
const browser = ref(detectBrowser());
const isStandalone = ref(detectStandalone());
const deferredPrompt = ref(null);
const installedThisSession = ref(false);
const swReady = ref(false);
let listenersAttached = false;

// Granular OS — separates iPadOS from iOS (Safari install flow differs in
// copy/UI position) and macOS/Windows/Linux from each other so the install
// guide matrix can offer accurate per-OS instructions.
function detectOs() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  const platformStr = navigator.platform || '';
  // iPadOS 13+ reports a Mac UA; disambiguate by touch points.
  const iPadOS = platformStr === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (iPadOS || /iPad/.test(ua)) return 'ipados';
  if (/Android/i.test(ua)) return 'android';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Mac/i.test(platformStr)) return 'macos';
  if (/Win/i.test(platformStr)) return 'windows';
  if (/Linux/i.test(platformStr)) return 'linux';
  return 'other';
}

// Granular browser — order matters since UA strings are layered (Chrome's
// UA also contains "Safari", Edge's contains "Chrome", etc.).
function detectBrowser() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  // iOS variants identify themselves first.
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS/.test(ua)) return 'firefox';
  if (/EdgiOS/.test(ua)) return 'edge';
  // Desktop / Android.
  if (/Edg\//.test(ua)) return 'edge';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Vivaldi/.test(ua)) return 'vivaldi';
  if (/Firefox/.test(ua)) return 'firefox';
  // Chrome must come before Safari since Chrome's UA contains "Safari".
  if (/Chrome/.test(ua)) return 'chrome';
  if (/Safari/.test(ua) && /AppleWebKit/.test(ua)) return 'safari';
  return 'other';
}

// Coarse `platform` kept for backward compat with older callers (checking
// 'ios' vs 'desktop' for high-level decisions). Derived from `os`.
const platform = computed(() => {
  const o = os.value;
  if (o === 'ios' || o === 'ipados') return 'ios';
  if (o === 'android') return 'android';
  if (o === 'macos' || o === 'windows' || o === 'linux' || o === 'chromeos') return 'desktop';
  return 'unknown';
});

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS uses navigator.standalone, everyone else uses display-mode media query.
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true;
  return false;
}

function isIosSafari() {
  if (os.value !== 'ios' && os.value !== 'ipados') return false;
  return browser.value === 'safari';
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
    () => (os.value === 'ios' || os.value === 'ipados') && !isIosSafari() && !isStandalone.value,
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
    platform,
    os: readonly(os),
    browser: readonly(browser),
    isStandalone: readonly(isStandalone),
    installed,
    canPromptInstall,
    needsIosInstallInstructions,
    installBlockedByNonSafariIos,
    swReady: readonly(swReady),
    promptInstall,
  };
}
