# Beta hardening plan (Android, Firebase App Distribution)

Status: implemented. Verified via `npx expo prebuild --platform android --clean`
(regenerated manifest shows `allowBackup="false"`,
`enableOnBackInvokedCallback="true"`, and `tools:node="remove"` on the
fine-location and foreground-service permissions), `npm run lint` (0 errors),
`npx tsc --noEmit` (clean), `npm test` (107 passed), and
`npx expo install --check` (up to date). Remaining manual setup is listed at
the bottom.

Implementation notes: `allowBackup`, `predictiveBackGestureEnabled`, and
`blockedPermissions` turned out to be first-class `expo.android` keys in
SDK 57, so no custom config plugin was needed. Sentry follows the Expo-pinned
`~7.11.0` line (`expo install --check` flags anything newer). Sentry init tags
`environment` from `EXPO_PUBLIC_APP_ENV` (set by CI to the build flavor) with
performance tracing explicitly off; the APK workflow fails fast when the
Sentry DSN/org/project are unset. Splash keeps `imageWidth: 200` alongside
`resizeMode: "contain"` on purpose: they are independent settings (width vs
scaling), and dropping `imageWidth` would shrink the splash image to the
100dp default.

Scope: the "do now" items from the 2026 mobile review. OTA (`expo-updates`), AAB, iOS strings, and verified App Links are deferred until Play/iOS submission. No behavior changes beyond the items below.

## 0. Baseline and verification loop

- `android/` is gitignored build output. After each config change, regenerate and inspect: `npx expo prebuild --clean`, then read `android/app/src/main/AndroidManifest.xml`.
- After all items: `npm run lint`, `npx tsc --noEmit`, `npm test`, plus a staging APK install on a physical device (Android 14+ to cover predictive back).

## 1. Backup: stop exporting the auth session

Why: session persists in `expo-sqlite/localStorage` (`src/lib/supabase.ts:2,18`) with `allowBackup="true"` and no backup rules (`AndroidManifest.xml:24`). Restores copy the session to Drive or another device.

- Set `allowBackup` to `false`. Check whether SDK 57 `app.json` (`expo.android`) supports this directly; if not, add a minimal config plugin or `expo-build-properties` to patch the `<application>` attribute.
- Acceptance: regenerated manifest shows `allowBackup="false"` (or rules excluding `databases/`, `shared_prefs/`, WebView dirs).
- Regression: fresh install signs in normally; reinstall does not restore a session.

## 2. Crash reporting: add Sentry

Why: zero crash-reporting coverage; beta feedback without stack traces is unactionable.

- Create the Sentry project, store the DSN outside the repo (EAS secret / CI env; DSN is public-ish but keep it out of git anyway).
- Add `@sentry/react-native` plus the Expo plugin in `app.json` (plugin list at `app.json:45-75`), init early in `app/_layout.tsx` before providers mount.
- Wire source-map upload for the APK CI workflow so stack traces resolve.
- Keep the existing `console.warn` call sites (auth callback, realtime subscribe) as breadcrumbs, do not add noisy logging.
- Acceptance: a test event from a staging APK appears in Sentry with a readable stack trace.

## 3. Predictive back: opt in

Why: `enableOnBackInvokedCallback="false"` (`AndroidManifest.xml:24`) disables the Android 14+ back animation.

- Flip to `"true"` via config (same mechanism question as item 1: direct `app.json` support vs config plugin), regenerate manifest to confirm.
- Regression-test on Android 14+: tab `backBehavior="history"` (`app/(app)/_layout.tsx:94`) and the call screen `animation: "fade"` (`app/(app)/_layout.tsx:162`), plus room/post screens where the tab bar hides.
- Acceptance: system back animates and never traps the user or exits mid-call unexpectedly.

## 4. Permissions: coarse location and foreground-service cleanup

Why: the beta APK declares more than it uses (`AndroidManifest.xml:2-8`).

- Location: app only needs city-level matching (`src/lib/geo.ts` reverse-geocodes to a locality label). `ACCESS_FINE_LOCATION` is blocked via `blockedPermissions` (`expo-location` is already a bare plugin entry in `app.json`, which offers no coarse-only flag); downgrade `getCurrentPositionAsync({ accuracy: High })` (`src/lib/geo.ts:16`) to `Balanced`.
- Foreground service: audit `src/features/cluster-calls.ts` and `src/components/room/call/` for any background-service start (no `startForeground` hits today). If calls are foreground-only, remove `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` from `app.json:40-41` and confirm they disappear from the regenerated manifest. If background audio is required, keep them and declare `foregroundServiceType="microphone"` plus the Play Data Safety entry.
- Calls on Android are foreground-only by decision: iOS keeps the `audio` background mode, but the Android build declares no foreground service, so backgrounding the app mid-call may drop audio. Required device test before beta ships: join a call, background the app and turn the screen off; if audio must survive that, restore the mic FGS permission with `foregroundServiceType="microphone"` instead.
- Acceptance: regenerated manifest requests `ACCESS_COARSE_LOCATION` only; FGS permissions either gone or typed; location matching still resolves a city label on device.

## 5. Housekeeping (bundle with the above, ~15 min)

- Version drift: `package.json:4` says `0.0.4`, `app.json:5` says `0.0.21` with `versionCode 21`. Sync `package.json` to `0.0.21` (or document `app.json` as source of truth).
- Splash: `app.json:66` uses legacy `imageWidth: 200`; migrate to `resizeMode: "contain"` per the current `expo-splash-screen` plugin API.
- Keyboard: `package.json:8-10` excludes `react-native-keyboard-controller` from `expo install` with no reason recorded. Add a one-line comment stating why the drift is intentional.

## Remaining manual setup (not in code)

- Sentry: create the project, then set repo variables `EXPO_PUBLIC_SENTRY_DSN_staging`
  (and `_production` later) plus `SENTRY_ORG` / `SENTRY_PROJECT` and the
  `SENTRY_AUTH_TOKEN` secret so CI uploads sourcemaps. Ship one staging APK
  and confirm a test event resolves to a readable stack trace.
- Device check on Android 14+: system back animates (tabs, room, call screen),
  location matching still resolves a city label (approximate location), and a
  reinstall does not restore a previous session.
- Play Data Safety (at store submission): declare approximate location and note
  that the unused fine-location / foreground-service permissions were removed.

## Explicitly deferred

- `expo-updates`: not needed for App Distribution full-APK beta. Revisit at Play launch.
- Production AAB + shrink/minify: needed for Play, not for APK beta.
- iOS usage strings (`NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`): required before any iOS submission, not for Android beta.
- Verified App Links (`associatedDomains`, `assetlinks.json`): custom `sensorium://` scheme is fine for beta OAuth; do before production.
