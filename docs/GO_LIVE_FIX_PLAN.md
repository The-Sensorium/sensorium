# Go-Live Fix Plan - Security and Performance

Status: draft, for web app (`src/`) and mobile app (`mobile/`).
Goal: fix must-fix blockers before production launch. Non-blockers move to post-launch.
Source: full codebase review Sep 2026. DB and RLS core is solid, mobile auth and realtime need tightening.

No em dashes in this doc by repo convention. Use hyphens, commas, or colons.

## Scope and out of scope

In scope:
- Mobile token storage, sign-out cleanup
- Push lockscreen, captcha WebView, deep links, push routing
- RPC oracles, avatar read scope, upload validation
- Realtime filters, polling herd, N+1, missing indexes
- Bundle splits, Vercel cache and security headers, permission cleanup

Out of scope:
- Vault migration for `email_settings.secret` and `push_settings.secret` (post-launch)
- Coverage gate raise (post-launch, after fixes land)
- Full `useInfiniteQuery` refactor for messages and posts (do minimal pagination guard now, full refactor post-launch unless load tests fail)

## Phase 0 - Baseline (0.5h)

1. `git status`, `git log --oneline -5`, confirm branch from `develop`.
2. `npm run lint`
3. `npm test` quick sanity (full `npm run test:coverage` at end)
4. `supabase status`, `supabase db lint --local`
5. Record current bundle size: `npm run build` and note `dist/` output.

Acceptance: clean baseline, known failures logged.

## Phase 1 - Mobile auth and data safety (half day, BLOCKER)

### 1.1 SecureStore for Supabase auth
Files:
- `mobile/src/lib/supabase.ts:18`
- `mobile/package.json`
- `mobile/app.json` (no change expected, verify)

Tasks:
- Add `expo-secure-store` dependency.
- Implement async `SecureStoreAdapter` with `getItem`, `setItem`, `removeItem` for Supabase auth only.
- Keep `AsyncStorage` for `sensorium:signup-email` in `mobile/src/lib/auth-storage.ts`, theme flags, intro flags.
- Keep `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`.
- Handle `createClient` failure explicitly, do not swallow misconfig. Surface error in dev, `unavailable` state in prod with log.

Acceptance:
- Fresh login persists across restart.
- No tokens in `AsyncStorage` (inspect storage dump in dev).
- Rooted device extraction risk note closed.

### 1.2 Sign-out and channel teardown
Files:
- `mobile/app/(app)/settings.tsx:202-211` (verify exact path in repo, settings route)
- `mobile/src/lib/push.ts`
- `mobile/src/features/realtime.ts:260,624`
- `mobile/src/app-providers.tsx:68`

Tasks:
- On `SIGNED_OUT`: `unregisterPushToken(storedToken)`, `supabase.removeAllChannels()`, clear `clusterChannelEntries` and `presenceStore`, then `queryClient.clear()`, then `signOut()`.
- Centralize `AppState` refresh handler (today tripled in `supabase.ts:32-36`, `app-providers.tsx:68`, `realtime.ts:691`). One owner.
- Persist last-uploaded Expo push token locally, unregister that value (not a fresh fetch). See 2.1.

Acceptance:
- User switch leaves zero channels (`supabase.getChannels().length === 0` in dev log).
- No ghost pushes after sign-out in manual test.

## Phase 2 - DB hardening migration (half day, BLOCKER)

New migration: `supabase/migrations/0170_go_live_hardening.sql` (next free number, never edit old files).

Tasks:
- `has_platform_role(uuid)`, `can_moderate(uuid)`, `can_manage_roles(uuid)`: assert `p_user_id = auth.uid()` for `authenticated` callers, or revoke `authenticated` grant and add self-only wrapper `is_self_staff(): boolean`. Update grants.
- `has_verified_totp_factor(uuid)`: same, self-only.
- `avatars_member_read`: decide policy. Option A (strict): owner + active co-member + `can_moderate` staff. Option B (ship fast): keep any-authenticated read but document that avatars are public to members. Recommended: Option A if avatars can be private.
- `app_url()`: leave as-is, note non-secret.
- Add missing `SET search_path = public` to invoker helpers: `0002:42`, `0011:10,21`, `0013:60`, `0024:23`, `0033:13`, `0056:29`, `0080:20`, `0097:10`, `0132:10,21`, `0147:30`, `0155:23`, `0167:10`, `0117:30,42,53`, `0118:36`.

Indexes (same migration or `0171_go_live_indexes.sql`):
- `posts(author_id)` for `useUserPosts` in `src/features/posts.ts:173`
- `post_likes(post_id)` (today only `cluster_id`)
- `comment_likes(comment_id)` (today only `cluster_id`)
- `invitations(user_id)` (today only `inviter_id`)
- `cluster_members(cluster_id)` (today only `user_id`)
- `message_reads(message_id)` (check `0048/0049/0154` first, add if missing)
- `user_mutes(muted_user_id)` (today only `user_id`)

Tasks after SQL:
- `supabase db reset`
- `npm run seed:demo`
- `supabase db lint --local`
- `npm run test:integration`
- Regenerate types: update `src/lib/database.types.ts`, then `cd mobile && npm run sync:db-types` and commit copies.
- `node mobile/scripts/sync-db-types.mjs --check`

Acceptance: lint clean, integration green, types in sync.

## Phase 3 - Mobile push, captcha, deep links (1 day, BLOCKER)

### 3.1 Push visibility and lifecycle
Files: `mobile/src/lib/push.ts:24-191`, `mobile/app.json`, `mobile/src/app-providers.tsx:45,53,66-72`

Tasks:
- Set messages and mentions channels to `PRIVATE` (or `SECRET`), keep low sensitivity channels as-is.
- Do not block sign-in on push setup. Defer `setNotificationChannelAsync` off critical path, debounce foreground re-register.
- Remove blind double `rpc('register_push_token')` in `push.ts:104-107,125-128`. Single call with backoff, check RLS error explicitly.
- Store last-uploaded token, unregister stored value. Swallow fetch errors on unregister path.
- `clearClusterPushNotifications:182-191`: keep O(N) dismiss but only on room open, cap N.

### 3.2 Captcha WebView
File: `mobile/src/components/captcha-sheet.tsx:35-91`

Tasks:
- `if(!allowedOrigin) return false` (today `return true`).
- Check `event.nativeEvent.url` or origin equals `allowedOrigin` before `parseChallengeToken`.
- Keep `domStorageEnabled` and third party cookies modal-scoped, clear cache on close.
- Keep fail-closed in release (`captcha.ts:15-17` already correct, `__DEV__` bypass only).

### 3.3 Deep links and routing
Files:
- `mobile/src/lib/deep-links.ts:7-63`
- `mobile/app/_layout.tsx:25-42`
- `mobile/app/(app)/_layout.tsx:14-54`
- `mobile/app/(app)/auth/signup.tsx:33`

Tasks:
- Filter `getInitialURL` and URL events to `sensorium://auth/*` before `handleAuthCallback`.
- Whitelist OTP `type`: `signup`, `recovery`, `email_change`, `invite`, `magiclink`. Reject otherwise, remove `as 'signup'` cast.
- Prefer PKCE `code` only, drop hash-implicit `setSession` branch or gate behind deprecation log.
- Cap or clear `consumedCodes` on success to avoid unbounded growth.
- Gate `pushDataToHref` routing on `auth.state === 'signedIn'` plus cluster membership check, fallback to `/(app)/home`.
- Verify `sensorium://verify-email` lands on a handler that exchanges code. Fix route or change `emailRedirectTo`.

### 3.4 Permissions
File: `mobile/app.json:33-43`, `mobile/src/lib/geo.ts:14-16`

Tasks:
- Remove duplicate `ACCESS_FINE_LOCATION`, keep coarse. Use `Accuracy.Balanced`, request only when `local` mode selected.
- Keep `FOREGROUND_SERVICE_MICROPHONE` and `UIBackgroundModes:audio` for LiveKit, add store listing note for call use.
- Verify `PreJoin.tsx:32,47` camera and mic prompts remain gesture gated, `push.ts:95-122` push prompt remains gesture gated.

Acceptance: lockscreen shows no body, forged postMessage rejected in manual test, cold-start push tap lands on home when signed out, Play permission review notes ready.

## Phase 4 - Uploads and storage TTL (half day, BLOCKER)

Files:
- `mobile/src/lib/upload-image.ts:1-85`
- `mobile/src/features/avatars.ts:7-28`
- `mobile/src/features/cluster.ts:330-345`
- `mobile/src/features/posts.ts:770-783`
- `mobile/src/features/avatars.ts:4-5`
- `app/(app)/settings/profile.tsx:75`, `StepCustomization.tsx:22`

Tasks:
- Cap bytes (15 MB starting point), allowlist `image/jpeg`, `image/png`, `image/webp`, `image/gif`, add timeout and retry.
- Return validated mime plus matching ext together, fix `extFor` default `webp` mismatch.
- Use `randomUUID` or `getRandomValues` for object names.
- Validate path inputs with `^[A-Za-z0-9/_.-]+\.[a-z0-9]+$`, reject `..` and absolute URLs before `remove` or `createSignedUrl`.
- Route all avatar uploads through helper (resize plus validate), remove direct `storage.from('avatars').upload` bypasses.
- Reduce avatar signed URL TTL from 24h to 1h to match chat and posts (`3600s`).

Acceptance: 30 MB pick rejected cleanly, crafted `../` path rejected, extension matches content type.

## Phase 5 - Realtime and query performance (1 to 2 days, BLOCKER)

### 5.1 Filters
Files:
- `src/features/notifications.ts:244,351-368,402`
- `mobile/src/features/notifications.ts:362-402`
- `mobile/src/features/realtime.ts:286-581`
- `src/features/realtime.ts:228-591`

Tasks:
- Add `filter: cluster_id=eq.<id>` or `user_id=eq.<id>` to every `postgres_changes` binding that lacks it. Web is mostly filtered except notifications messages INSERT. Mobile has 6+ unfiltered: `message_reactions`, `signal_replies`, `post_likes`, `post_comments`, `comment_likes`, `call_participants`.
- Replace global messages INSERT invalidation with scoped unread bump or per-cluster invalidation. Keep 300ms coalesce as floor, not fix.
- Add `subscribe(status =>)` logging plus backoff UI for socket failure. Floating `void` patch promises must catch and log.

### 5.2 Polling herd
Files:
- `src/features/avatars.ts:50-51`, `cluster.ts:370`, `posts.ts:810` and mobile mirrors
- `src/features/introductions.ts:76`, `notifications.ts:25,48,78`, `matching.ts:131`, `admin-moderation.ts:236,240`

Tasks:
- Remove `refetchInterval` on signed URL hooks, keep `staleTime` only, refresh on focus or error. Share cache by path.
- Add `refetchIntervalInBackground: false` everywhere polling remains.
- Add `staleTime` to `signals.ts:10,32,67`, `posts.ts:47-393` batch, `cluster.ts:28`, `cluster-calls.ts:24,45`, `moderation.ts:24,134`. Prevent mount churn.
- Add missing `enabled` to `admin-moderation.ts:198,262,606,665` so staff queries do not fire logged-out.

### 5.3 N+1 and pagination
Files:
- `src/features/posts.ts:69-112,191-254,304-359,377-384`
- `src/components/PostCard.tsx`, `src/pages/posts/PostsFeedPage.tsx:64-81`
- `src/features/cluster.ts:28-106`
- `src/features/moderation.ts:211`, `src/pages/onboarding/OnboardingPage.tsx:119`

Tasks:
- Add batch `get_post_counts_for_clusters(ids)` RPC or reuse cluster scoped counts, replace `Promise.all(ids.map(get_post_counts))`.
- Prefer `usePostLikesForPosts`, `usePostCommentsForPosts`, `useClusterPostLikes` over per-card `usePostLikes(postId)` when feed spans clusters.
- Add `.limit()` or `.range()` to unbounded selects in `signals.ts` and `posts.ts`. Convert message and post history to `useInfiniteQuery` with `getNextPageParam` (staff pattern in `admin-accounts.ts:51,66` is reference).
- Batch sequential deletes and joins with `Promise.all` or server RPC.

Acceptance: single room open triggers zero unfiltered socket events, React Query devtools shows no 10s or 60s tight loops in background, feed of 20 posts triggers O(1) count calls.

## Phase 6 - Bundle, images, caching (half day, BLOCKER for perf)

Files:
- `src/components/CountryFlag.tsx:2`
- `src/pages/cluster/room/CallOverlay.tsx:2-3`
- `src/app/router.tsx`
- `vite.config.ts:15-33`
- `vercel.json`
- `public/` logos and favicons, `index.html`
- Image components: `AvatarViewer.tsx:85-90`, `PostMedia.tsx:121-126`, `EvidencePanel.tsx:234,294`, `MfaSetupPage.tsx:176`, `step-customization.tsx:73`, `ImagePreview.tsx:36`
- Mobile: `Avatar.tsx:11`, `PostMedia.tsx:90`, `MessageMedia.tsx:97,123`, `GifPicker.tsx:104`, `ZoomableImage.tsx:21`

Tasks:
- Dynamic import flags per code, `React.lazy` for `CallOverlay` and heavy routes.
- Add Vercel headers: `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, plus security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`). CSP start in report-only if full CSP is risky pre-launch.
- Dedupe `public/` logos, prefer hashed Vite assets for cache busting, convert large PNG to WebP or AVIF, add preload for main icon font.
- Add `loading="lazy" decoding="async"` plus width and height to lightbox and evidence images. Mobile: set `cachePolicy`, `placeholder`, `recyclingKey` on `expo-image`.
- Tune mobile `FlatList`: `getItemLayout`, `keyExtractor`, `initialNumToRender`, `windowSize`, `maxToRenderPerBatch` in `StepProfile.tsx:55`, `TimezonePicker.tsx:63`, `Composer.tsx:319`, `InCallChat.tsx:99`.
- Memoize `ClusterRail.tsx:68,88,127`, `SignalsView.tsx:51`, `CommentThread.tsx:117,184,187,204,221`, `PostsFeedPage.tsx:64,71,78`, `DiscoveryModePage.tsx:65`, `ClustersPage.tsx:67,98,108` (follow `VotesView.tsx:56,67,76` pattern).

Acceptance: Lighthouse or Playwright perf smoke passes, bundle report shows flags and LiveKit out of initial chunk, Vercel response headers verified with `curl -I`.

## Verification gate (pre-push per AGENTS.md)

- `npm run lint`
- `npm run test:coverage` (do not lower thresholds in `vite.config.ts:52-57`)
- `npm run build` (typecheck via `tsc -b` plus Vite)
- If migrations changed: `supabase db reset`, `npm run seed:demo`, `npm run test:integration`
- If synced web file changed: `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated mobile copies
- Manual: login, cluster room realtime, image upload, push tap cold start, sign-out and user switch, background and foreground polling check
- `supabase db lint --local`
- `npm run check:release` before `develop` to `main` release PR (merge commit only, never squash on `main`)

## Suggested PR split

- PR1: Phase 1 + Phase 2 (auth plus DB). Needs integration tests.
- PR2: Phase 3 + Phase 4 (mobile push plus uploads). Needs device test.
- PR3: Phase 5 + Phase 6 (perf plus bundle). Needs load smoke and header check.

All PRs branch from `develop` as `fix/...`, target `develop`, Conventional Commits (`fix:`). Docs-only changes skip coverage and build gates, code changes do not.

## Post-launch backlog (do not block)

- Vault for push and email secrets
- Full `useInfiniteQuery` conversion, `select('*')` column projection over realtime
- Coverage threshold raise
- `BackgroundFetch` or badge sync strategy, push worker compression and PWA tuning
- `mobile/README.md:162-164` doc list fix for `timezones.ts`, `links.ts`, `created-clusters.ts`
- Pin guard for diverged mobile forks (`realtime.ts`, `cluster-calls.ts`, `avatars.ts`) beyond current pin-string check
