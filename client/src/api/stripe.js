import { api } from './index.js';
import { isNativePlatform } from './auth-token.js';
import router from '../router/index.js';

// On native, the WebView itself never navigates to Stripe — Apple Pay
// rendering and Stripe's anti-fraud checks are unreliable in WKWebView, and
// any cookies Stripe sets during checkout would land in the wrong origin.
// We open the URL in @capacitor/browser instead (SFSafariViewController on
// iOS, Custom Tabs on Android).
//
// When Stripe redirects to the success URL, that page renders inside the
// in-app browser — the WebView itself never sees it. We watch for the
// `browserFinished` event (user dismissal) and route the native WebView
// back into the app at `returnPath`. SubscriptionPage's onMount fetch
// pulls the freshly-updated `User.plan` from our DB (Stripe webhook
// usually lands in <1s, well before the user dismisses).
//
// Web behavior is unchanged: same-tab redirect to Stripe-hosted checkout.
async function openExternalUrl(url, returnPath) {
  if (!isNativePlatform()) {
    window.location.href = url;
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  const handle = await Browser.addListener('browserFinished', async () => {
    try { await handle.remove(); } catch (_e) { /* ignore */ }
    if (returnPath) {
      // No-op if the user is already on returnPath (e.g. back from portal
      // landing on the same route the trigger lived on).
      router.replace(returnPath).catch(() => {});
    }
  });
  await Browser.open({ url, presentationStyle: 'popover' });
}

// Starts a Stripe Checkout session and sends the user to Stripe-hosted
// payment flow. On success Stripe redirects back to
// /profile/settings/account/subscription?checkout=success — that page
// reconciles the result.
export async function startCheckout(planId, interval) {
  const { url } = await api.post('/api/stripe/create-checkout-session', {
    planId,
    interval,
  });
  if (!url) throw new Error('Stripe did not return a checkout URL');
  await openExternalUrl(url, '/profile/settings/account/subscription');
}

// Opens the Stripe-hosted Billing Portal so the user can change plan, update
// card, download invoices, or cancel. Requires an existing stripeCustomerId.
export async function openBillingPortal() {
  const { url } = await api.post('/api/stripe/create-portal-session');
  if (!url) throw new Error('Stripe did not return a portal URL');
  await openExternalUrl(url, '/profile/settings/account/subscription');
}

// Snapshot of the current user's subscription state. Read-only; no Stripe
// roundtrip, just what our DB already knows from webhook sync.
export async function fetchSubscription() {
  return api.get('/api/stripe/subscription');
}
