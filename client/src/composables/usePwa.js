import { ref, computed, onMounted, onUnmounted, readonly } from 'vue';

const INSTALL_STORAGE_KEY = 'pwa:installed';

function readPersistedInstall() {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem(INSTALL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePersistedInstall(val) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (val) localStorage.setItem(INSTALL_STORAGE_KEY, '1');
    else localStorage.removeItem(INSTALL_STORAGE_KEY);
  } catch {
    // private mode / disabled storage — silently degrade.
  }
}

// Singleton state — we only want one beforeinstallprompt capture per tab,
// and multiple components need to observe the same install status.
//
// Order matters: `installedPersistent` calls `readPersistedInstall()` at
// module-eval time, which references `INSTALL_STORAGE_KEY`. `const` is in
// the temporal dead zone before its declaration, so the storage key MUST be
// declared above this ref or the read silently throws and the persistent
// install signal is lost.
const os = ref(detectOs());
const browser = ref(detectBrowser());
const isStandalone = ref(detectStandalone());
const deferredPrompt = ref(null);
const installedThisSession = ref(false);
// Sticky "we've seen this device install the PWA" — needed because a user can
// install the PWA, then later open the same site in a regular browser tab,
// where display-mode is `browser` and standalone signals are all false. Without
// persistence we'd nag them to install something they already have.
const installedPersistent = ref(readPersistedInstall());
// Async signal from getInstalledRelatedApps() on Chromium — lets us recover
// install state across uninstall/reinstall and handle users who installed the
// PWA on a previous visit before this persistence code shipped.
const installedRelated = ref(false);
const swReady = ref(false);
let listenersAttached = false;

function markInstalled() {
  installedPersistent.value = true;
  writePersistedInstall(true);
}

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

  // Standalone display-mode at boot is itself proof of install — persist so
  // future visits in a regular browser tab still know the PWA is installed.
  if (isStandalone.value) markInstalled();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.value = e;
    // Browser is offering to install → the PWA is NOT currently installed.
    // If we have a stale persistent flag from a prior install, clear it so
    // the install nudge reappears after the user uninstalls.
    if (installedPersistent.value && !isStandalone.value) {
      installedPersistent.value = false;
      installedRelated.value = false;
      writePersistedInstall(false);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    installedThisSession.value = true;
    markInstalled();
  });

  // Re-check standalone on visibility changes so returning from the home
  // screen install flow updates the UI without a manual refresh.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      isStandalone.value = detectStandalone();
      if (isStandalone.value) markInstalled();
    }
  });

  // Chromium-only authoritative check — when it returns ≥1 the PWA is
  // installed. We do NOT clear the persistent flag on an empty result: the
  // API only matches installs whose manifest URL matches the current page's
  // `related_applications.url`, which can mismatch in dev (localhost vs prod
  // origin) and would falsely "uninstall" a freshly-installed PWA. Empty is
  // ambiguous; non-empty is conclusive.
  if (typeof navigator.getInstalledRelatedApps === 'function') {
    navigator.getInstalledRelatedApps().then((apps) => {
      if (Array.isArray(apps) && apps.length > 0) {
        installedRelated.value = true;
        markInstalled();
      }
    }).catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => { swReady.value = true; }).catch(() => {});
  }
}

export function usePwa() {
  onMounted(attachListeners);
  onUnmounted(() => { /* singleton listeners persist */ });

  const canPromptInstall = computed(() => deferredPrompt.value != null);
  const installed = computed(() =>
    isStandalone.value
    || installedThisSession.value
    || installedRelated.value
    || installedPersistent.value,
  );
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
