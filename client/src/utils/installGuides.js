// Install instructions keyed by `${os}:${browser}`.
//
// Guide shape:
//   kind: 'steps' — numbered list with optional per-step icon
//   kind: 'redirect' — "open this in a different browser" message
//   kind: 'unsupported' — browser can't install at all on this OS
//   kind: 'fallback' — generic fallback when we don't have a specific match
//
// `**bold**` segments inside `text` / `message` get rendered as <strong> by
// the InstallInstructions component. Step icons use simple keys
// ('share' | 'kebab' | 'ellipsis' | 'menu' | 'address-bar') resolved to inline
// SVG/glyphs in the component template.

const IOS_SAFARI = {
  kind: 'steps',
  title: 'Add Protokol Lab to your home screen',
  steps: [
    { icon: 'share', text: 'Tap the **Share** button at the bottom of Safari.' },
    { text: 'Scroll down and choose **Add to Home Screen**.' },
    { text: 'Tap **Add**, then open Protokol Lab from the new home-screen icon.' },
  ],
  note: 'Push notifications work only when launched from the home-screen icon.',
};

const IPADOS_SAFARI = {
  kind: 'steps',
  title: 'Add Protokol Lab to your home screen',
  steps: [
    { icon: 'share', text: 'Tap the **Share** button in the Safari toolbar (top-right).' },
    { text: 'Choose **Add to Home Screen**.' },
    { text: 'Tap **Add**, then open Protokol Lab from your home screen.' },
  ],
  note: 'Push notifications work only when launched from the home-screen icon.',
};

const IOS_NEEDS_SAFARI = {
  kind: 'redirect',
  title: 'Open in Safari to install',
  message:
    'On iPhone, installing requires **Safari**. In your current browser, tap the share menu and choose **Open in Safari** — then tap **Share** → **Add to Home Screen**.',
};

const IPADOS_NEEDS_SAFARI = {
  kind: 'redirect',
  title: 'Open in Safari to install',
  message:
    'On iPad, installing requires **Safari**. Open Protokol Lab in Safari, then tap **Share** → **Add to Home Screen**.',
};

const ANDROID_CHROME = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Tap the **⋮** menu in the top-right of Chrome.' },
    { text: 'Choose **Install app** (sometimes shown as **Add to Home Screen**).' },
    { text: 'Confirm to add the icon, then open Protokol Lab from your launcher.' },
  ],
  note: 'If Chrome shows an **Install** banner at the bottom of the page, you can tap that instead.',
};

const ANDROID_EDGE = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Tap the **…** menu at the bottom of Edge.' },
    { text: 'Choose **Add to phone** or **Install**.' },
    { text: 'Confirm, then open Protokol Lab from your launcher.' },
  ],
};

const ANDROID_FIREFOX = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Tap the **⋮** menu in Firefox.' },
    { text: 'Choose **Install** (or **Add to Home Screen**).' },
    { text: 'Confirm, then open Protokol Lab from your launcher.' },
  ],
};

const ANDROID_SAMSUNG = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Tap the **menu** (☰) icon at the bottom of Samsung Internet.' },
    { text: 'Choose **Add page to** → **Home screen**.' },
    { text: 'Tap **Add**, then open from your home screen.' },
  ],
};

const ANDROID_GENERIC = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Open your browser menu (often **⋮** or **☰**).' },
    { text: 'Look for **Install app** or **Add to Home Screen**.' },
    { text: 'Confirm, then open Protokol Lab from your launcher.' },
  ],
};

const MACOS_SAFARI = {
  kind: 'steps',
  title: 'Add Protokol Lab to your Dock',
  steps: [
    { text: 'In the menu bar, click **File** → **Add to Dock…**' },
    { text: 'Confirm the name and click **Add**.' },
    { text: 'Launch Protokol Lab from your Dock.' },
  ],
  note: 'Requires Safari 17 (macOS Sonoma) or newer. On older versions, open Protokol Lab in Chrome or Edge to install.',
};

const CHROMIUM_DESKTOP = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Look for the **install icon** (a monitor with ⊕) at the right edge of the address bar.' },
    { text: 'Or click the **⋮** menu → **Install Protokol Lab…**' },
    { text: 'Confirm, then launch from your Applications folder, Start menu, or app drawer.' },
  ],
};

const EDGE_DESKTOP = {
  kind: 'steps',
  title: 'Install Protokol Lab',
  steps: [
    { text: 'Click the **⋯** menu in the top-right corner of Edge.' },
    { text: 'Choose **Apps** → **Install this site as an app**.' },
    { text: 'Confirm, then launch from your Applications folder or Start menu.' },
  ],
};

const FIREFOX_DESKTOP_UNSUPPORTED = {
  kind: 'unsupported',
  title: 'Firefox can\'t install web apps on desktop',
  message:
    'Firefox on desktop doesn\'t support installing web apps. Open Protokol Lab in **Chrome**, **Edge**, or **Safari** (macOS 14+) to install it.',
};

const FALLBACK = {
  kind: 'fallback',
  message:
    'Look for an **Install** option in your browser\'s menu (often **⋮** or **⋯** → **Install**). If your browser doesn\'t offer one, try Chrome or Edge.',
};

const GUIDES = {
  // ===== iOS (iPhone) =====
  'ios:safari': IOS_SAFARI,
  'ios:chrome': IOS_NEEDS_SAFARI,
  'ios:firefox': IOS_NEEDS_SAFARI,
  'ios:edge': IOS_NEEDS_SAFARI,
  'ios:other': IOS_NEEDS_SAFARI,

  // ===== iPadOS =====
  'ipados:safari': IPADOS_SAFARI,
  'ipados:chrome': IPADOS_NEEDS_SAFARI,
  'ipados:firefox': IPADOS_NEEDS_SAFARI,
  'ipados:edge': IPADOS_NEEDS_SAFARI,
  'ipados:other': IPADOS_NEEDS_SAFARI,

  // ===== Android =====
  'android:chrome': ANDROID_CHROME,
  'android:edge': ANDROID_EDGE,
  'android:firefox': ANDROID_FIREFOX,
  'android:samsung': ANDROID_SAMSUNG,
  'android:opera': ANDROID_CHROME,
  'android:vivaldi': ANDROID_CHROME,
  'android:other': ANDROID_GENERIC,

  // ===== macOS =====
  'macos:safari': MACOS_SAFARI,
  'macos:chrome': CHROMIUM_DESKTOP,
  'macos:edge': EDGE_DESKTOP,
  'macos:opera': CHROMIUM_DESKTOP,
  'macos:vivaldi': CHROMIUM_DESKTOP,
  'macos:firefox': FIREFOX_DESKTOP_UNSUPPORTED,
  'macos:other': FALLBACK,

  // ===== Windows =====
  'windows:chrome': CHROMIUM_DESKTOP,
  'windows:edge': EDGE_DESKTOP,
  'windows:opera': CHROMIUM_DESKTOP,
  'windows:vivaldi': CHROMIUM_DESKTOP,
  'windows:firefox': FIREFOX_DESKTOP_UNSUPPORTED,
  'windows:other': FALLBACK,

  // ===== Linux / ChromeOS =====
  'linux:chrome': CHROMIUM_DESKTOP,
  'linux:edge': EDGE_DESKTOP,
  'linux:opera': CHROMIUM_DESKTOP,
  'linux:vivaldi': CHROMIUM_DESKTOP,
  'linux:firefox': FIREFOX_DESKTOP_UNSUPPORTED,
  'linux:other': FALLBACK,
  'chromeos:chrome': CHROMIUM_DESKTOP,
  'chromeos:other': FALLBACK,
};

export function getInstallGuide(os, browser) {
  return GUIDES[`${os}:${browser}`] || GUIDES[`${os}:other`] || FALLBACK;
}
