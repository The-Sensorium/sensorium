# What's Next Flow — Queue → Intros Expectation Plan

Source: Discord `#beta-testing` thread (MathgirlJK + Dotnet Titan).

## 1. Problem (from thread)

1. User joins a queue (`Open pool / 5 of 8 in queue`). Current copy:
   `Communication begins after the cluster is formed. You can browse or join other matching modes while you wait.`
   — says nothing about a second step, checking back, or a deadline.
2. Intro screen does show a deadline (`Tell your cluster who you are / Chat unlocks once everyone answers. Deadline: 1d 10h 1m`), but that only helps if the user comes back.
3. User expected a match notification and got none (reported as broader: "I've received no notifications").
   — **Notification bug is already fixed (out of scope for this plan).** This plan covers only the expectation / flow concern.
4. Titan's interim proposal (single added line: "come back within 72 hours to do intros once the 8 fill up") was accepted as helpful but is easy to miss as gray paragraph text. This plan replaces it with a structured flow.

Ground truth rules (do not change):
- `CLUSTER_SIZE = 8` (`src/lib/constants.ts:1-6`, mirrors `limit 8` in `supabase/migrations/0011_matching_functions.sql`).
- Intro deadline = `now() + 72 hours` on cluster formation (`0011_matching_functions.sql:55-56`), notification body `Complete your introductions within 72 hours.` (`0011:69`).
- Miss = removal + replacement (`docs/PRD.md:213`, `docs/ARCHITECTURE.md:80`).
- Replacement extends deadline (`0014_replacement_functions.sql:261-263`, `0054_moderation_enforcement.sql:485-487`).

## 2. Goals / Non-goals

Goals:
- User knows **before joining** that step 2 exists (8 → intros in 72h → chat).
- User knows **while queued** what to do (wait, we'll notify, come back in 72h or lose spot).
- User feels **urgency at return** (Home banner + `/cluster-created` state the 72h deadline).
- No new backend, no migration, no new tokens, web + mobile parity.

Non-goals:
- No notification/push changes (already fixed).
- No matching logic, deadline, or replacement changes.
- No blocking modal / checkbox consent on join (adds drop-off where we need 8 to fill).
- No new colors, typefaces, radii (`docs/DESIGN.md` token restriction).

## 3. Proposed flow (3 touchpoints, no extra clicks)

### T1 — Pre-join: `JoinCard` gets a 3-step primer
Where: `src/pages/discovery/ModePanel.tsx:88-152` (`JoinCard`), mobile mirror `mobile/src/components/discovery/ModePanel.tsx:96-158`.

Now: `displayBlurb` only ("Join and you'll be grouped with the next 7… Clusters are built to last.").

Change to:
- Keep headline + `count of 8 ready` + Join button exactly as-is.
- Replace single blurb paragraph with `How it works` ordered list:
  1. `Wait until 8 are ready` (live count is step state)
  2. `Once your cluster forms, come back within 72 hours for intros`
  3. `Chat unlocks once everyone answers`
- One supporting line under list: `We'll notify you when your cluster forms.`

Why: sets mental model before commitment, zero friction, survives even if user never opens `/queue`.

### T2 — In-queue: `What happens next` card (not a paragraph)
Where web:
- `src/pages/QueuePage.tsx:75-126` (main queue screen, copy at `:87-90`)
- `src/components/QueueCard.tsx:46-96` (card on home/clusters, copy at `:90-93`)
- `src/pages/discovery/ModePanel.tsx:154-197` (`JoinedCard` — currently **no** next-step copy, only `View queue`; this is the biggest miss)

Where mobile (mirror 1:1):
- `mobile/app/(app)/queue/[queueId].tsx:101-154` (copy at `:116-119`)
- `mobile/src/components/QueueCard.tsx:44-92` (copy at `:85-88`)
- `mobile/src/components/discovery/ModePanel.tsx:160-199` (`JoinedCard`)

Change to:
- Keep `QueueProgress` (`X of 8 in queue` + bar) untouched — it is step-1 state.
- Replace gray paragraph with a headed section:
  - Heading: `What happens next` (`text-sm font-semibold text-on-surface`, web; `14/600` mobile)
  - List (icons + text, existing icon set only — `lucide-react` / `lucide-react-native`):
    - `Bell`: `We'll notify you once 8 are in and your cluster forms.`
    - `Clock`: `Once your cluster forms, you have 72 hours to complete intros or you'll lose your spot.`
    - `MessageSquareText` (already used on landing for intros): `Chat unlocks once everyone answers.`
- `JoinedCard` (web + mobile): add the `Clock` line under the count + keep `View queue` CTA. Minimum viable if card space is tight: the 72h line only.

Copy notes:
- Say `8` and `72 hours` in words (matches `ClusterCreatedPage.tsx:76`: "Eight strangers matched. Complete your introductions within 72 hours to unlock the chat.").
- Say consequence plainly (`or you'll lose your spot`) per PRD removal rule; do not soften to "to keep your spot" only.
- Do not promise push vs in-app; say `notify` (covers both, robust to permission denial).

### T3 — At match: add deadline urgency to return points
Where web:
- `src/pages/HomePage.tsx:156-175` (Home `Your cluster is ready` banner, sub `Eight of you were matched. Start your introductions.`)
- `src/pages/ClusterCreatedPage.tsx:66-78` (interstitial, already has 72h copy — keep, add live countdown)

Where mobile:
- `mobile/app/(app)/home.tsx:188-220` (same banner)
- `mobile/app/(app)/cluster-created.tsx:85` (same 72h copy)

Change to:
- Home banner sub → `Eight of you were matched. Complete intros within 72 hours to unlock chat.`
- If cluster deadline is resolvable client-side, render `CountdownTimer` (`src/components/CountdownTimer.tsx:5-30`, ticks every 60s, `Expired` state) next to banner sub. Data path: `useMyClusters()` (`src/features/matching.ts:56-90`) exposes `cluster.introductions_deadline`; match `formed.data.cluster_id` (`useLatestClusterFormed`, `matching.ts:211-234`) to a row in `useMyClusters`. If no match (loading / RLS lag), fall back to static `72 hours` text — never block the banner on the lookup.
- `/cluster-created`: keep copy, append `Deadline: <CountdownTimer deadline={...}/>` reusing `useMyClusters` lookup or `useCluster(clusterId)` (`src/features/introductions.ts:11-27`). Mobile: add equivalent countdown text (check for existing mobile countdown component; else static `72 hours` + deadline string).

Why: notification fix gets them back to Home; deadline on Home is what converts return → intro submit.

## 4. File-by-file change list

Web:
1. `src/pages/discovery/ModePanel.tsx`
   - `JoinCard`: blurb → 3-step list + notify line.
   - `JoinedCard`: add 72h `Clock` line.
2. `src/pages/QueuePage.tsx:87-90` — paragraph → `What happens next` section.
3. `src/components/QueueCard.tsx:90-93` — same section, `text-xs` variant.
4. `src/pages/HomePage.tsx:156-175` — banner sub + optional `CountdownTimer`.
5. `src/pages/ClusterCreatedPage.tsx:75-78` — append countdown (lookup via `useMyClusters`).

Mobile (manual mirror; not auto-synced — see §7):
6. `mobile/src/components/discovery/ModePanel.tsx` — same as (1).
7. `mobile/app/(app)/queue/[queueId].tsx:116-119` — same as (2).
8. `mobile/src/components/QueueCard.tsx:85-88` — same as (3).
9. `mobile/app/(app)/home.tsx:188-220` — same as (4).
10. `mobile/app/(app)/cluster-created.tsx` — same as (5).

Shared (extracted, not optional):
11. New `src/components/WhatsNextSteps.tsx` (+ `mobile/src/components/WhatsNextSteps.tsx` hand-mirror) rendering the 3-item list from props. All call sites use it — keeps 5 call sites consistent. No new deps, tokens only.

No changes to: migrations, RPCs, `src/features/*`, `src/lib/constants.ts`, realtime, prefs, router.

## 5. Design constraints

- Tokens only from `docs/DESIGN.md` front-matter. Reuse: `text-on-surface-variant` for body, `text-primary` for heading kicker/icons, `bg-surface`, `border-outline-variant/60`, `rounded-2xl`, `rounded-pill`, `shadow-soft`. No new hex, font, radius.
- Icons: reuse installed set (`Bell`, `Clock`, `MessageSquareText`, `ArrowRight`, `PartyPopper`). strokeWidth 1.5 per existing queue/cluster UI.
- Type: web headings `font-display font-semibold`; body `text-sm leading-6` (queue page), `text-xs leading-5` (cards) to match current density.
- Dark mode: token classes only, no `dark:` branches (class swap on `<html>` handles it).
- A11y: list as `<ol>` with `aria-label="What happens next"`; icons `aria-hidden`; countdown has `aria-live="off"` (60s tick, avoid chatter) with `title` = absolute deadline; touch targets unchanged; color never sole signal (icon + text).

## 6. Edge cases

- `open_mix` display: keep `Open pool` override (`QueuePage.tsx:53`, `QueueCard.tsx:56`, both ModePanels). Steps copy is mode-agnostic.
- `local` mode: `LocalSetupCard` untouched; `JoinCard`/`JoinedCard` steps apply once `queue_key` exists.
- Counts: `useQueueCount` live + 15s poll fallback (`matching.ts:115-154`); copy never interpolates count except existing `X of 8`.
- Already-matched (`InClusterCard`), not-in-queue (`EmptyState`), queue-not-found: untouched.
- Deadline extension on replacement (`WaitingForOthersPage.tsx:127-130` explains re-fill + extend): `CountdownTimer` reads live `introductions_deadline`, so it self-corrects.
- Expired deadline: `CountdownTimer` shows `Expired`; banner/CTA still navigates (server owns removal).
- Offline / loading: steps are static copy (no skeleton); countdown falls back to `72 hours` text if deadline unresolved.
- Long queue waits (days): copy has no "soon" promise; only "once 8 are in".

## 7. Mobile parity note

`mobile/scripts/sync-db-types.mjs` copies `database.types` + shared `src/lib`/`src/features` modules only — **UI components are hand-mirrored**. After web edits, hand-apply (6)–(10) and run `node mobile/scripts/sync-db-types.mjs --check` only if a synced web file changed (not expected here; UI-only). `mobile/src/features/realtime.ts` is pinned — do not touch.

## 8. Tests

- Unit (Vitest jsdom, colocated `*.test.tsx`, run `npm test <path>`):
  - New `WhatsNextSteps.test.tsx`: renders 3 steps, 72h + 8 text, `aria-label`.
  - Update/extend existing ModePanel/QueueCard/Home tests if they assert old paragraph (grep `Communication begins after` — 5 hits: `QueuePage`, `QueueCard`, mobile x2, `docs/PRD.md:1049` (doc, leave or update separately)).
  - Home banner: with/without deadline lookup (fallback text vs countdown).
- Coverage gate (`npm run test:coverage`, v8 thresholds lines 34% / functions 33% / branches 20% in `vite.config.ts`): UI-only copy must not regress; never lower thresholds.
- Integration (`npm run test:integration`, needs `supabase start`): not affected (no RPC/RLS change); run only if touching migrations (we aren't).
- E2E (Playwright `e2e/`, needs `supabase start` + `npm run seed:demo`, selects by `data-e2e`): add `data-e2e="whats-next-steps"` to new section + `data-e2e="home-cluster-ready-banner"` if missing; extend `golden-path.spec.ts` join-queue leg to assert steps visible.
- Manual: join queue → verify T1; view queue → T2; seed 8/8 formation → Home banner T3 + `/cluster-created` countdown; dark mode + mobile viewport.

## 9. Rollout

1. Implement web (1)–(5), unit tests, `npm run lint`, `npm test:coverage`, `npm run build`.
2. Mirror mobile (6)–(10), Expo check.
3. E2E `data-e2e` + golden-path assertion.
4. PR `feat/...` → `develop` (squash). No migration, so no `supabase db reset` required; no `develop`→`main` release notes beyond copy.
5. Docs: `docs/` is source of truth — `PRD.md:1049` quotes old queue copy; update or file docs follow-up (CI ignores md-only changes).

## 10. Risks

- Copy blindness persists if list styling is too subtle → mitigate with heading + icons + consequence line, and repetition across T1/T2/T3.
- Deadline lookup on Home adds a second query (`useMyClusters` alongside `useLatestClusterFormed`) → mitigate with fallback text, never gate banner.
- Web/mobile drift → mitigate with shared `WhatsNextSteps` shape + side-by-side PR diff.

## 11. Decisions (locked)

1. Tone: explicit consequence — `or you'll lose your spot`, per `PRD.md:213` removal rule. No softening.
2. Implementation: extract shared `src/components/WhatsNextSteps.tsx` (+ hand-mirrored `mobile/src/components/WhatsNextSteps.tsx`). All 5 call sites use it.
3. E2E: add `data-e2e="whats-next-steps"` + `data-e2e="home-cluster-ready-banner"` in the same PR and extend `golden-path.spec.ts`.
4. Step-2 copy is anchored to formation — `Once your cluster forms, you have 72 hours…`, never a bare `within 72 hours` pre-formation (misreads as 72h from joining).

## 12. Follow-up (post-archive)

Two gaps found during UI verification, fixed in the same branch:

1. **Mode-page top card was intros-blind.** `InClusterCard` (`src/pages/discovery/ModePanel.tsx`, mirror `mobile/src/components/discovery/ModePanel.tsx`) always said "already in an active cluster / Open your cluster", even with intros pending. It now resolves the cluster via `useMyClusters` + the caller's `useMyMembership` and renders three states:
   - `Action needed / Complete your introductions / … Deadline: <CountdownTimer>` → CTA `Start introductions` → `/cluster/:id/introductions`
   - `In progress / Waiting for the others` → CTA `Check progress` → `/cluster/:id/waiting`
   - Active (unchanged) → `Open your cluster` → room.
   Lookup miss falls back to the old generic copy; the card is never gated on the queries.
2. **Home/Clusters list cards carried no urgency.** `ClusterCard` (web + mobile) showed only `Introductions in progress` for pending clusters. It now personalizes via `MemberClusterCard` (`useMyMembership`): pending + unanswered → `Complete your introductions · Deadline`, pending + answered → `Waiting for the others · Deadline` (deadline already on the `MyCluster` row — no extra query). Covered by new `ClusterCard.test.tsx` cases.

## 13. Review fixes (same branch)

1. Answered users route to `/waiting`, not `/introductions` (`ClusterCard` web + mobile). Unknown personal state still defaults to `/introductions` (self-redirects).
2. Web `CountdownTimer` red state is `expired` only (was also red on exact hour/day boundaries).
3. `WhatsNextSteps` owns no margin; callers pass it (`QueuePage` `mt-6`, cards `mt-3`/`mt-4`). Mobile margin follows `compact` (12 vs 24).
4. Home banner + `InClusterCard` resolve the deadline via `useCluster` with the list lookup as fallback, instead of list-only.
