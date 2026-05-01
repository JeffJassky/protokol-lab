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
