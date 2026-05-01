import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.protokollab.app',
  appName: 'Protokol Lab',
  // Native shells bundle the stripped JS produced by `npm run build:native`.
  // The marketing site and admin surface are excluded at build time so the
  // App Store reviewer launches into the authed app, not a marketing
  // brochure (plans/native-app-plan.md §6.13).
  webDir: 'dist-native',
  server: {
    androidScheme: 'https',
    // Native WebView origin is capacitor://localhost (iOS) /
    // https://localhost (Android). Server CORS allowlists those origins
    // (server/src/app.js). The WebView itself never navigates to
    // protokollab.com — Stripe Checkout opens via @capacitor/browser
    // (SFSafariViewController / Custom Tabs) and inbound universal links
    // come back into the app via App.addListener('appUrlOpen'), not nav.
    // allowNavigation deliberately empty.
    allowNavigation: [],
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // Hold the splash until Pinia is hydrated and `auth.fetchMe()` resolves
      // so cold start doesn't flash a blank app shell. Hide manually with
      // `SplashScreen.hide()` from App.vue once the first auth-resolved
      // render is in. M6 wires this up.
      launchAutoHide: false,
      backgroundColor: '#0b0f0c',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
    },
    SocialLogin: {
      // Only providers we actually ship. Disabling Facebook + Twitter keeps
      // their SDKs out of the binary, which both shrinks the app and keeps
      // the App Privacy answers tighter (no Meta/Twitter tracking SDKs to
      // declare). Apple is enabled here because Phase C will turn it on;
      // the Apple flow uses system APIs and adds nothing to the build size.
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
