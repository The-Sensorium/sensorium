# Sensorium Mobile App Plan — Expo (Member-Only)

Goal: ship a member-only React Native app with Expo Go that reuses the existing Supabase backend 1:1. Admin and moderation queues stay web/desktop-only. Member-side reporting + appeal stay in mobile.

Source of truth: `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/DESIGN.md`, `docs/TECHNICAL.md`, `src/app/router.tsx`, `src/features/*`.

## 1. What Gets Reused vs Rewritten

Backend — reuse 100%, zero changes required for v1:
- Postgres + RLS + RPC (`supabase/migrations/*`), Auth email/password, Storage private buckets (`chat-images`, `avatars`, `posts-images`), Realtime publications, pg_cron + `send-emails` Edge Function.
- Mobile points at the same projects: staging during build, production at release. No new backend project.
- Copy `src/lib/database.types.ts` verbatim into mobile (manual sync after each migration, same rule as web).

Frontend logic — port, don't invent:
- Portable as-is (logic only): `src/features/matching.ts` (226 lines), `signals.ts`, `votes.ts`, `introductions.ts`, `discovery.ts`, `avatars.ts`, `mentions.ts`, `gifs.ts` (Klipy fetch + `parseKlipyResults`), `notifications.ts`, `cluster.ts` queries/mutations, `posts.ts` queries/mutations, `src/lib/modes.ts`, `geo.ts`, `availability.ts`, `countries.ts`, `constants.ts`, `query-retry.ts`, `error.ts`, `utils.ts`.
- Member-side only from: `moderation.ts` (report submit only, drop queue/claim actions), `appeals.ts` (submit appeal only, drop admin queue/decision).
- Drop entirely: `admin-moderation.ts`, `src/pages/staff/*` (6 pages), `ModeratorLayout`, `AdminLayout`, `RequireCapability`, session-role picker (`session-role-provider.tsx`, `SessionRolePage`, `SwitchRoleButton`, `StaffNavigation`). Mobile simplifies to member shell only.

UI — full rewrite (this is the work):
- 197 TS/TSX files in web `src/`; member scope is ~25 routes + ~35 shared components. DOM + Tailwind v4 → RN primitives + NativeWind. `BrowserRouter` → Expo Router. `lucide-react` → `lucide-react-native`. `@fontsource` → `expo-font`. Canvas `prepareImage` → `expo-image-manipulator`.
- Hardest screen by far: `src/pages/cluster/RoomView.tsx` + `room/` (Composer, MessageItem, MessageImage/Gif, MessageInfoModal/read receipts, TypingBubble, GifPicker, RaiseSignalModal, VoteRow, SignalRow). Budget half the project here.

## 2. Architecture Decision

Create a separate repo `sensorium-mobile` (recommended over monorepo — web is Vite SPA with Vercel pipelines; mobile needs EAS pipelines; shared code is types + pure helpers only).

```
sensorium-mobile/
  app/                    # expo-router: (auth)/, (onboarding)/, (app)/tabs, cluster/[id]/
  src/lib/                # supabase.ts, database.types.ts (copied), modes, geo, theme-tokens
  src/features/           # ported query hooks, one file per domain (same names as web)
  src/components/         # Avatar, ClusterCard, QueueCard, PostCard, Composer, etc. (RN)
  assets/                 # fonts, splash, icon
  app.json / eas.json
```

Stack: Expo SDK 53+, Expo Router, TypeScript strict, NativeWind v4, TanStack Query v5, `@supabase/supabase-js` + `@react-native-async-storage/async-storage` + `react-native-url-polyfill`, `@shopify/flash-list` for chat/feed, `expo-image-picker` + `expo-image-manipulator` + `expo-file-system`, `expo-location`, `expo-notifications`, `expo-font`, `expo-secure-store` (optional for session), `expo-web-browser` + `expo-linking` (auth deep links).

Design tokens: port `docs/DESIGN.md` front-matter 1:1 into `src/lib/theme-tokens.ts` (light + dark values, radii, spacing 8px base). No new colors. Dark mode via NativeWind `dark:` + `useColorScheme`, persisted choice in AsyncStorage (web uses `localStorage` + `dark` class — replicate behavior, not mechanism).

## 3. Phase 0 — Scaffolding (days 1–2)

1. `npx create-expo-app sensorium-mobile --template tabs` then convert to Expo Router stack + tabs, TypeScript strict on, `oxlint` or `eslint-config-expo`.
2. Install: `@tanstack/react-query`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `nativewind`, `lucide-react-native`, `@shopify/flash-list`, `expo-image-picker`, `expo-image-manipulator`, `expo-location`, `expo-notifications`, `expo-font`, `expo-linking`, `expo-web-browser`.
3. Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_KLIPY_APP_KEY`, `EXPO_PUBLIC_KLIPY_ENDPOINT` (mirrors `VITE_*` in web `.env.example`). Same staging values first.
4. `src/lib/supabase.ts` (RN variant of web `src/lib/supabase.ts`):
   - `import 'react-native-url-polyfill/auto'`, `createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`.
   - Add `AppState` listener to start/stop auto-refresh (standard Supabase RN recipe).
   - Copy `database.types.ts`, `query-retry.ts`, `modes.ts`, `geo.ts`, `availability.ts`, `countries.ts`, `error.ts`, `utils.ts` verbatim; replace `import.meta.env` reads with `process.env.EXPO_PUBLIC_*`.
5. Providers: replicate `src/app/providers.tsx` — `QueryClientProvider` (same `staleTime 30s`, same permanent-error retry rule), `AuthContext` (same `getSession` + `onAuthStateChange` shape), theme provider. Skip `SessionRoleProvider`.
6. Guards: port simplified `src/app/guards.tsx` → `RequireAuth` (→ login), `RequireActiveAccount` (→ `/restricted` via `useMyAccess` from `access.ts`), `RequireOnboarded` (→ onboarding via `use-profile`), `RequireRestricted` (appeal only). No capability/role gates.
7. Acceptance: `npx expo start` opens in Expo Go, landing placeholder renders, Supabase session persists across reload.

## 4. Phase 1 — Auth, Onboarding, Static Shell (week 1)

Web routes → mobile:
- `/`, `/privacy-policy`, `/terms` → simple scroll screens (reuse copy, link to hosted legal if preferred).
- `/auth/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` → `(auth)/` stack. Supabase Auth API identical. Differences: no Google OAuth in v1 unless configured for native (keep email/password only); deep-link `exp://` / EAS URL for verify + reset via `expo-linking` + `expo-web-browser` instead of web redirects. Test against staging Inbucket/local stack first.
- `/onboarding` → `(onboarding)/` 5-step wizard, port `src/pages/onboarding/step-*.tsx` in order: profile (display name, DOB immutable, country, 18+ validation) → customization (photo via `expo-image-picker` → `avatars` bucket, bio) → modes multi-select → local setup (`expo-location` permission + radius, replaces browser geolocation) → review → join queues (same `matching.ts` RPCs).
- `/restricted` + `/appeal` → keep both. Suspended/banned users must see status + submit one appeal (`appeals.ts` member mutation only). This is member-facing, not staff.
- Bottom tabs (member shell, replaces `AppShell`): Home, Clusters (= Discovery), Posts, Notifications, Settings. Header holds theme toggle + notification bell (`NotificationBell`, `UnreadBadge` ports).
- Acceptance: signup → verify → onboard → land on Home against staging, matching web behavior.

## 5. Phase 2 — Home, Discovery, Queue, Introductions (week 2)

- `/home` → Home tab: port `HomePage` + `ClusterCard` + `QueueCard`. Cards show per-mode status (unread counts via watermark `mark_cluster_read`/`mark_all_read`, queue `x/8`). "Explore More Matching Modes" → Clusters tab.
- `/clusters` + `/discovery/:modeId` → Clusters tab + mode detail, port `ClustersPage`, `DiscoveryModePage`, `ModePanel`, `PublicClusterCard` (name/status/member-count/formation-date only — same privacy rule as web, no membership/intros/messages exposed).
- `/queue/:queueId` → queue screen, port `QueuePage`: progress bar, leave-queue action, live count via existing Realtime channel from `matching.ts`/`realtime.ts`.
- `/cluster-created` → interstitial after formation (member list: display name + country only, pre-intro identity rule preserved).
- `/cluster/:id/introductions` + `/waiting` → port `IntroductionsPage` (5 fixed questions from PRD, all mandatory, 72h `CountdownTimer` port) + `WaitingForOthersPage` (5/8 checklist). Same `introductions.ts` RPCs; deadline/removal stays server-side.
- Identity model enforced in UI as web: pre-intro show display name/country/birth-year only; post-intro reveal photo/bio/answers.

## 6. Phase 3 — Cluster Chat (weeks 3–4, the critical path)

Port `RoomView` + all of `src/pages/cluster/room/` to `app/cluster/[id]/index.tsx` + components. Keep all `cluster.ts` RPCs; replace transports:

- List: `FlashList` inverted, `DayDivider`, `MentionText` (port `mentions.ts` parser), `MessageItem` (edit/delete/react, edited flag, deleted-for-all), `MessageImage` (signed URL from `chat-images`, short TTL, refresh before expiry, bare path persisted), `MessageGif` (remote Klipy URL, same as web), reactions, `TypingBubble` (presence channel from `realtime.ts`).
- Composer: port `Composer.tsx` — text + image pick (`expo-image-picker`) + GIF picker (`useTrendingGifs`/`useSearchGifs`, same Klipy env) + send. Replace web `prepareImage` (canvas/`createImageBitmap`) with `expo-image-manipulator` resize to 512px longest edge + WebP/compress 0.85; GIFs pass through untouched. Upload via `expo-file-system` ArrayBuffer/base64 → `supabase.storage.upload` (no `File` in RN).
- Read receipts: keep exact semantics from `TECHNICAL.md` — watermark `last_read_message_at` + immutable `message_reads` via `mark_cluster_read`, `get_message_reads` in `MessageInfoModal` → Seen-by / Not-seen-yet dialog, live-update on `cluster_members` UPDATE. Show on-demand only (⋯ → Info on own messages).
- Realtime: same channels as `realtime.ts` (chat inserts/updates/deletes, signal replies, governance, notifications). Verify Supabase Realtime over Expo Go network; handle foreground/background re-subscribe via `AppState` + focus refetch (replaces web `refetchOnWindowFocus: false` + manual invalidation).
- Members/Votes/Settings tabs → `app/cluster/[id]/members|votes|settings.tsx`: port `MembersView` (8 cards: photo/name/country/status/availability + View Profile), `VotesView` + `VoteRow` (replacement + name-change votes, hidden until close), `SettingsView` (details, start vote, leave → 30-day same-mode cooldown, suggest name triggers vote).
- Keep member `ReportModal` (report member/message with reason) — route goes to staff web queue. Drop hide/restore/claim/warn/suspend/ban UI.
- Acceptance: two Expo Go devices in same staging cluster can chat/realtime/react/edit/delete, receipts update live, images/GIFs render.

## 7. Phase 4 — Signals, Posts, Notifications, Profile, Settings (week 5)

- Signals (`signals.ts`, `SignalsView`, `SignalDetailPage`, `RaiseSignalModal`, `SignalRow`): open/in-progress/resolved, raiser-only resolve, thread replies separate from chat. Same RPCs.
- Posts (`posts.ts` 639 lines — largest feature): `PostsFeedPage` per-cluster feed + `PostDetailPage`, `PostComposer`, `PostCard`, `PostMedia` (private `posts-images` bucket, same signed-URL rule), `CommentThread`/`CommentItem` (one-level Instagram-style replies, `@name` prefix), heart likes with optimistic UI (`toggle_post_like`/`toggle_comment_like`), member `report_post`/`report_post_comment` only. Realtime: `comment_likes` channel as web migration 0082.
- Notifications (`notifications.ts`): list + mark-read/all-read, bell badge. Web push → v1 mobile keeps in-app list + Realtime foreground refresh only (see Phase 5 for push upgrade).
- Profile/Settings: `/profile/:userId` (header + intro answers), `/settings` (photo/name/bio, modes add/leave, status, availability green/yellow/red, notification prefs per existing preference columns, logout, delete-account via migration 0028 flow), `/settings/reports` (own report status, generic outcome only — no staff detail).

## 8. Phase 5 — Native Hardening + Push (week 6)

- Auth edge cases: session restore on cold start, expired-token refresh, sign-out clears AsyncStorage, deleted-account cleanup.
- Media: signed-URL refresh timers, upload retry, offline-mutation queue (TanStack offline or manual retry — chat send fails loudly, never silently).
- Location permission denial path for Local mode (fallback to non-local modes, same as web when location unshared).
- Push upgrade (requires one new migration + app wiring, optional for v1): add `push_tokens(user_id, expo_push_token)` table with RLS (owner-only), register token on login via `expo-notifications`, extend existing notification RPCs or add trigger to fan out to Expo Push API via existing `send-emails`-style worker. Without this, mobile has in-app + foreground realtime only — acceptable v1, must be explicit.
- Fonts/theme parity: load Plus Jakarta Sans + Special Elite via `expo-font`, map `font-display`/`font-sans`/`font-brand` classes to RN styles; verify light + dark (`#1a1a1a`/`#fcf9f2`/`#ff8a5c`) contrast.
- Performance: FlashList windowing on chat + posts feed, image caching (`expo-image`), paginate chat (`limit` + cursor as web), debounce GIF search.

## 9. Testing & Release

- Keep web untouched and green: `npm run lint`, `npm run test:coverage` (hard gate 34/33/20%), `npm run build`, `supabase db reset` + `test:integration` if migrations change (push-notifications migration only).
- Mobile tests: Vitest for ported pure helpers (`parseKlipyResults`, `mentions`, `modes`, `seen-by` split, availability); Maestro/exploratory for auth→onboard→queue→intro→chat→signals→votes→posts on staging with two accounts (reuse `npm run seed:demo` account `diya@demo.example` / `sensor123` + one fresh signup).
- EAS: `eas.json` dev/preview/production profiles against staging then production Supabase; OTA updates for JS-only fixes; versioned native builds for permission/SDK changes. Expo Go for daily dev, dev-build for push/location QA.
- Release checklist: staging end-to-end on Expo Go + TestFlight/Play internal → point env at production → EAS production build → store submission. Staff workflows remain web-only; document this in-app (no dead-end moderator links).

## 10. Effort & Risks

Effort: ~5–6 weeks for one experienced RN dev (1: auth/onboarding/shell, 2: home/discovery/queue/intros, 3–4: chat, 5: signals/posts/notifications/settings, 6: hardening/release). Dropping staff saves ~1.5 weeks (7 routes + `admin-moderation.ts` + role gates).

Top risks:
1. Chat parity (realtime + receipts + uploads) — mitigate by porting `cluster.ts`/`realtime.ts` verbatim first, UI second.
2. RN Supabase auth/storage differences (AsyncStorage, no `File`, no canvas) — spike in Phase 0.
3. Scope creep back into moderation UI — guard by keeping `ReportModal` + `AppealPage` as the only moderation surfaces in mobile.
4. Push expectations — agree upfront v1 = in-app only unless Phase 5 migration is approved.
5. Design drift — enforce token file + no new colors/radii per `docs/DESIGN.md`.

Open decisions carried from PRD: cluster cap, interest mode, DOB friction/visibility, unified inbox vs per-cluster (mobile should stay per-cluster tabs as web), block/mute vs vote-only, 30-day cooldown length, signal categories, per-cluster notification prefs — all stay as web behaves; do not relitigate in mobile v1.
