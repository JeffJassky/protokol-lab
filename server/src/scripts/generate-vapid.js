// Run once to mint a VAPID keypair for Web Push. Paste the output into your
// server/.env. Re-running rotates the keys — every existing PushSubscription
// must re-subscribe after rotation, so avoid unless compromised.
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('# Add these to server/.env');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
