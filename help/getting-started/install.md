---
title: Install the app
description: Install Protokol Lab on iPhone, iPad, Android, or desktop.
category: getting-started
last_reviewed: 2026-05-10
---

# Install the app

Protokol Lab installs as a Progressive Web App (PWA) on every platform, plus a native iOS app. Installed mode gets you faster launches, push notifications, and a real home-screen icon.

## iPhone (iOS)

You have two options:

### Option 1: Native iOS app (recommended)

The native app supports Sign in with Apple, Apple Push Notifications, and the system camera flow. Available from the App Store.

### Option 2: Install the web app from Safari

::: warning
**Safari only.** iOS does not allow PWA installation from Chrome, Firefox, or any other browser on iPhone. If you're using a different browser, the install button won't appear.
:::

1. Open the site in Safari.
2. Tap the **Share** button (the square with the arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.

The app icon appears on your home screen. Open from there — opening from Safari again puts you back in the browser tab, which doesn't deliver push notifications.

## iPad (iPadOS)

Same as iPhone — use Safari, tap Share, then Add to Home Screen. The Share button is in the top-right corner on iPad rather than the bottom.

## Android

Most Android browsers (Chrome, Edge, Samsung Internet, Firefox) support PWA install:

1. Open the site.
2. Tap the menu (three dots, top-right).
3. Tap **Install app** or **Add to Home Screen**.
4. Confirm.

If the menu doesn't show an install option, the browser may have already installed it — check your home screen first.

## macOS / Windows / Linux desktop

In Chromium-based browsers (Chrome, Edge, Brave, Arc, Opera):

1. Open the site.
2. Look for the install icon in the address bar (a small monitor with a download arrow).
3. Click **Install**.

In Safari on macOS:

1. **File → Add to Dock…** (Sonoma and later).

In Firefox: PWA install isn't supported. The site works fine as a regular tab.

## After installing

A few things change once the app is installed:

- **Push notifications** become possible (the OS will ask for permission the first time something tries to send one).
- **Faster cold starts** — the app shell is cached locally so launches feel instant.
- **The app appears separately** from your browser, with its own window and home-screen icon.
- **Your data syncs** the same way — you're still signed in to the same account.

## Verifying it's installed

The app remembers across sessions whether it's been installed on this device, so reinstall prompts don't keep appearing. If you want to check:

- **iOS / iPadOS**: open from the home-screen icon. The status bar should match the app's theme rather than Safari's address bar.
- **Android**: check your app drawer and home screen.
- **Desktop**: the app should open in its own window, not a browser tab.

## Uninstalling

- **iOS / iPadOS**: long-press the icon, tap **Remove App**, then **Delete App**.
- **Android**: long-press the icon, drag to **Uninstall**.
- **Desktop Chromium**: in the installed app window, click the **⋯ menu → Uninstall Protokol Lab**. Or visit `chrome://apps`.

Uninstalling doesn't delete your account or data. To do that, see [Delete your account](/account/delete).

## Push notifications

Notifications require both:

1. **Installation** (above), and
2. **Permission granted** in Settings → Notifications inside the app.

You'll get a system permission prompt the first time. If you decline, you can re-enable later from your device's settings:

- **iOS**: Settings → Notifications → Protokol Lab.
- **Android**: Settings → Apps → Protokol Lab → Notifications.
- **macOS**: System Settings → Notifications → Protokol Lab.

## Troubleshooting

**"Add to Home Screen isn't showing in Safari."**
You're probably in private browsing or a non-Safari browser. Switch to standard Safari and try again.

**"The install button never appears in Chrome on Android."**
Chrome only shows it after you've spent a minute or two on the site. Reload, scroll around, then check the menu again.

**"I installed but push notifications don't fire."**
Check that you opened from the installed icon, not the browser. Web push only works in the installed shell. Then verify Settings → Notifications inside the app, and your OS permission for the app.
