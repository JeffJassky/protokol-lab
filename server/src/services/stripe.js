import Stripe from 'stripe';
import { childLogger } from '../lib/logger.js';

const log = childLogger('stripe-svc');

// Pinned API version. Bump deliberately after reviewing upgrade guide.
// https://stripe.com/docs/upgrades#api-versions
const API_VERSION = '2024-12-18.acacia';

const secretKey = process.env.STRIPE_SECRET_KEY || null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

if (!secretKey) {
  log.warn('STRIPE_SECRET_KEY not set — Stripe routes will reject requests.');
}
if (!webhookSecret) {
  log.warn('STRIPE_WEBHOOK_SECRET not set — webhook signature verification disabled (dev only).');
}

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: API_VERSION })
  : null;

export const STRIPE_WEBHOOK_SECRET = webhookSecret;

export function isStripeConfigured() {
  return stripe !== null;
}
