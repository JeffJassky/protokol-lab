# Native release workflow

This doc covers the day-to-day mechanics of building and shipping the iOS +
Android apps. The strategic plan lives in `plans/native-app-plan.md`.

## TL;DR

```bash
# One-shot: build the stripped JS bundle and sync into ios/ + android/
cd client
npm run build:native:sync

# Open the platform projects in their native IDEs
npm run ios:open       # -> Xcode
npm run android:open   # -> Android Studio
```

Both `ios/` and `android/` are committed to the repo. Build artifacts
(Pods, .gradle, xcuserdata, etc.) are gitignored.

## Architecture

Single Vue codebase at `client/`. Two build outputs:

- `client/dist/` — full web bundle (marketing + admin + app), served
  publicly at `protokollab.com`. Build with `npm run build`.
- `client/dist-native/` — stripped bundle, app surface only, no marketing
  or admin. Build with `npm run build:native`. The `VITE_APP_ONLY=1`
  flag drives the route filter in `client/src/router/index.js`.

`client/scripts/verify-native-bundle.mjs` runs after every native build
and fails CI if any forbidden chunk (`LandingPage`, `Blog*`, `Comparison*`,
`Admin*`, etc.) leaks into `dist-native/assets/`.

`capacitor.config.ts` sets `webDir: 'dist-native'` so `cap copy` ships the
right bundle into the native shells.

## Common workflows

### Daily development on the web app

Nothing changes. `npm run dev` serves the full app + marketing site at
`localhost:5173`. The native shells are not in the loop.

### Verifying a change works in a native shell

```bash
cd client
npm run build:native:sync   # build + verify + cap sync
npm run ios:open            # then hit Run in Xcode
```

Hot reload across the native shell is not configured; rebuild + sync each
time. (Live updates are the M-future Capacitor Live Updates story; deferred
until the app is shipping per plans/native-app-plan.md §7.3.)

### Reviewer test account

Provisioned via `server/src/scripts/seed-reviewer-account.js`. Run once
before submission:

```bash
REVIEWER_PASSWORD='strong-password-here' \
  node server/src/scripts/seed-reviewer-account.js
```

Email defaults to `appstore-review@protokollab.com`. Override with
`REVIEWER_EMAIL=...` if needed. The script is idempotent — re-runs wipe and
reseed the data set so the reviewer always sees a populated app.

The credentials go into:
- App Store Connect: App Information → App Review Information → Sign-In
  Information.
- Play Console: Testing → Internal testing → Tester credentials.

Stash the password in 1Password under "App Store Reviewer Account."

### Updating native dependencies

After installing a new Capacitor plugin:

```bash
cd client
npm i @some/capacitor-plugin
npx cap sync   # writes pod / gradle changes into ios/ + android/
```

Commit the resulting changes to `ios/App/Podfile.lock` and
`android/app/build.gradle` if they're modified.

## Sign in with Apple

Apple guideline 4.8 makes Sign in with Apple mandatory on any iOS app that
ships a third-party login (we offer Google). Without it, App Store review
will reject. The full client + server flow is wired but disabled until
the Apple Developer Program is active and the audience env vars are set.

The server route (`POST /api/auth/apple`) verifies the identity token
against Apple's published JWKS, looks up by `appleId` (the `sub` claim),
falls back to email-link, otherwise creates a new user. Mirrors the Google
route's semantics — first sign-in must include an email; subsequent
sign-ins are matched solely by `appleId`.

### One-time setup (after Apple Developer reactivation)

1. **App ID** — `com.protokollab.app` already exists. In the Apple
   Developer portal go to **Identifiers → App IDs → Protokol Lab** and
   tick the **Sign In with Apple** capability. Save.
2. **Xcode** → App target → **Signing & Capabilities** → **+ Capability** →
   **Sign in with Apple**. This adds `com.apple.developer.applesignin` to
   `App.entitlements`. Commit the entitlements change.
3. (Web only — optional, skip for iOS-only deploys) **Service ID**:
   Identifiers → "+" → Services IDs → set Identifier (e.g.
   `com.protokollab.app.web`). Configure return URL
   `https://protokollab.com/auth/apple/callback`. Set
   `APPLE_SERVICE_ID` to the chosen identifier.
4. (Server-only flows — token refresh, account-deletion notifications)
   Generate a Sign in with Apple Auth Key:
   Keys → "+" → Sign in with Apple → download the `.p8`. Note the **Key
   ID**. The Sign in with Apple `.p8` is **separate** from the APNs
   `.p8` — don't reuse keys across the two.

### Server env vars

```
APPLE_BUNDLE_ID=com.protokollab.app
APPLE_SERVICE_ID=                          # web only, leave blank for iOS-only
APPLE_TEAM_ID=                             # 10-char team id
APPLE_SIGN_IN_KEY_ID=                      # 10-char key id (separate from APNS_KEY_ID)
APPLE_SIGN_IN_KEY_P8="-----BEGIN PRIVATE KEY-----
<...full .p8 contents...>
-----END PRIVATE KEY-----"
```

Only `APPLE_BUNDLE_ID` is required for the iOS native flow — that's the
audience the verifier checks. The other vars are for web Sign-in flows
and server-to-Apple callbacks (token exchange, deletion notifications)
that aren't wired yet but will be when web becomes a target.

Leaving `APPLE_BUNDLE_ID` and `APPLE_SERVICE_ID` both blank disables the
route — `/api/auth/apple` returns 503 "Apple sign-in not configured"
instead of attempting verification with an empty audience list.

### Testing

The `AppleSignInButton` component renders only on Capacitor
(`isNativePlatform()`); web build hides it entirely until web Sign-in is
also wired. Test on a real device — sim works for the auth dialog but
the system sheet sometimes doesn't return a token in sim builds.

```bash
cd client
npm run build:native:sync
npm run ios:open
# Xcode: select device, Cmd+R
```

In the app, hit **Continue with Apple** on Login / Register / Start. iOS
shows the system sheet; pick "Hide My Email" or share your real email.
Server logs should show `apple sign-in: new user created` (first time)
or `apple sign-in: success` (subsequent), and the user lands in `/welcome`
or `/`.

If you revoke the app via Settings → Apple ID → Password & Security →
Apps Using Apple ID, the next sign-in returns no email — that's the
"first sign-in without a usable email" 409 the server returns. Tell the
user to revoke from iOS Settings (the route's error message says this).

## Push notifications (APNs)

The iOS app receives notifications via APNs using token-based auth (`.p8`
key + JWT). The Android app will use FCM when wired; that path is still
stubbed in `server/src/services/push.js`.

Web Push (VAPID) keeps working independently — APNs only fires for
subscriptions stored with `transport: 'apns'`. Enable / disable from the
app calls `@capacitor/push-notifications`, posts the device token to
`/api/push/subscribe`, and unsubscribes by deleting the row server-side.

### One-time setup (after Apple Developer reactivation)

1. **Apple Developer portal** → Certificates, Identifiers & Profiles → Keys
   → "+" → check **Apple Push Notifications service (APNs)** → Continue →
   download the `.p8`. The download link only appears once; store the file
   in 1Password under "APNs Auth Key (Protokol Lab)".
2. Note the **Key ID** (10 chars, shown next to the key) and **Team ID**
   (10 chars, top-right of the dev portal).
3. **Xcode** → open `client/ios/App/App.xcodeproj` → App target → Signing &
   Capabilities → "+ Capability" → **Push Notifications**. Xcode generates
   `App.entitlements` with `aps-environment = development`. Commit the
   entitlements file.

### Server env vars

Set these in `server/.env` for local dev and as DigitalOcean app envs for
prod:

```
APNS_TEAM_ID=<10-char team>
APNS_KEY_ID=<10-char key id>
APNS_BUNDLE_ID=com.protokollab.app
APNS_KEY_P8="-----BEGIN PRIVATE KEY-----
<...full .p8 contents, multiline...>
-----END PRIVATE KEY-----"
APNS_PRODUCTION=false
```

`APNS_KEY_P8` accepts real newlines (DigitalOcean's secret editor handles
that fine) or a single-line `\n`-escaped form (`server/src/lib/apns.js`
normalizes both).

Leaving any APNs var blank disables the native send path silently — Web
Push keeps working, native subscriptions are stored but log
`apns: not fully configured`.

### Sandbox vs production

`APNS_PRODUCTION` controls which APNs host the server hits:

- `false` → `api.sandbox.push.apple.com` (Xcode-signed dev builds, anything
  with `aps-environment = development`).
- `true` → `api.push.apple.com` (TestFlight + App Store builds, which get
  `aps-environment = production` from the distribution profile).

Tokens issued in one environment are not valid in the other. If a server
on prod APNs gets a sandbox token (or vice versa), Apple returns
`BadDeviceToken` and `services/push.js` prunes the row. This is the most
common reason a freshly-registered token "just stops working" after a
build-config change.

For TestFlight rollouts: change DO's `APNS_PRODUCTION` to `true` and have
testers reinstall so they get a production-environment token.

### Testing on a real device

iOS Simulator can register with APNs since iOS 16, but tokens are flaky
and frequently fail to deliver real pushes. Use a physical iPhone for
end-to-end testing.

```bash
cd client
npm run build:native:sync
npm run ios:open
# In Xcode: select your device, Cmd+R
```

In the app, finish onboarding → tap **Enable reminders** → accept the iOS
permission prompt. Server logs should show `push: subscription upserted`
with `transport: 'apns'`. Trigger a test from the admin panel
(`POST /api/push/test`) and the banner should land on the device within
a few seconds.

If the registration listener times out (15s) with "is the app signed with
a push entitlement?", the build is missing the Push Notifications
capability — re-check Xcode's Signing & Capabilities tab.

## Phase / milestone status

See `plans/native-app-plan.md` §10. Quick map of what this doc supports
right now:

- ✅ M5 — Capacitor scaffold + reviewer-account seeder. App boots in iOS
  Simulator + Android emulator.
- ⏸ M16 — Code signing + release pipeline. Apple Developer Program
  reactivation gates this. When that's live: distribution cert, App ID,
  provisioning profile, App Store Connect API key, signing config in
  `ios/App/App.xcodeproj`, plus Play App Signing on the Play Console.

## Troubleshooting

### `cap add ios` complains about TypeScript missing
Run `npm i -D typescript`. Capacitor's CLI needs it to read
`capacitor.config.ts`.

### `cap add ios` succeeds but Xcode build fails on "could not find pod"
Run `cd client/ios/App && pod install`. The `cap add ios` step normally
runs this for you, but stale `Podfile.lock` from a different machine can
trip it up.

### `cap sync` fails after a plugin install
Delete `client/ios/App/Pods/` and re-run `cap sync`. Pods aren't committed,
so this is a no-op for the team.

### iOS Simulator app is blank / shows "could not connect"
The simulator can't reach `protokollab.com` on localhost-only dev API.
Either:
1. Run with `VITE_API_HOST=http://your-mac-lan-ip:3001` and start the dev
   server bound to `0.0.0.0` (`HOST=0.0.0.0 npm run dev:server`), then
   `npm run build:native:sync`.
2. Or test against the deployed prod API by leaving `VITE_API_HOST`
   unset (defaults to `https://protokollab.com`).
