import { api } from './index.js';

// Starts a Stripe Checkout session and sends the browser to Stripe-hosted
// payment flow. On success Stripe redirects back to
// /profile/settings/account/subscription?checkout=success.
export async function startCheckout(planId, interval) {
  const { url } = await api.post('/api/stripe/create-checkout-session', {
    planId,
    interval,
  });
  if (!url) throw new Error('Stripe did not return a checkout URL');
  window.location.href = url;
}

// Opens the Stripe-hosted Billing Portal so the user can change plan, update
// card, download invoices, or cancel. Requires an existing stripeCustomerId.
export async function openBillingPortal() {
  const { url } = await api.post('/api/stripe/create-portal-session');
  if (!url) throw new Error('Stripe did not return a portal URL');
  window.location.href = url;
}

// Snapshot of the current user's subscription state. Read-only; no Stripe
// roundtrip, just what our DB already knows from webhook sync.
export async function fetchSubscription() {
  return api.get('/api/stripe/subscription');
}
