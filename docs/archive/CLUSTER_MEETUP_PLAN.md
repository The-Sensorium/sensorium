# Cluster Meetup Implementation Plan

Status: shipped to `develop` (was approved for implementation on `feature/cluster-meetup`). This is a design record; current behavior lives in the core docs and the code, which take precedence where they disagree.
Scope: web SPA + Expo mobile + Supabase backend, end to end. No calendar integration in v1.

## 1. Goal

Let members of an active cluster propose a casual weekly group meetup, vote on a time,
reach quorum (3), get reminded, join a LiveKit call, give lightweight feedback, and return
to the cluster. The flow must feel like a natural part of the cluster, reuse existing UI
and call infrastructure, and ship behind a beta flag so it can be enabled or disabled
without affecting chat, votes, signals, or navigation.

Non-goals for v1:
- No organizer or host role.
- No scheduling or calendar sync (no CalDAV, no Google Calendar write).
- No new social feed. Post-meetup sharing reuses the existing cluster composer.
- No redesign of chat, member cards, navigation, or call infrastructure.
- No new colors, typefaces, radii, gradients, streaks, points, or badges.

## 2. UX flow (both clients)

All copy uses hyphens only, never em or en dashes, per repo convention.

1. Invitation entry point in an active cluster:
   - Title `Cluster Meetup`, body `Meet the people behind the messages.`
   - `Pick a few times for a casual group call this week.` CTA `Propose a time`.
   - No footnote: the card speaks to the proposer, and there is nothing to
     join yet. The only low-pressure copy is `You can always skip a week.`
     in the post-call feedback, where opting out is actually on the table.
   - Web: quiet card in `RoomView` above the composer plus a `Meetups` tab in
     `ClusterLayout`. Mobile: quiet card at top of `room.tsx` plus a Meetup row
     reachable from the cluster menu. Not a new bottom tab.
   - The card links to a dedicated ballot-builder screen (web `meetups/new`
     route, mobile `meetups/new` tab route). The proposer adds 2-5 custom
     times: day constrained to the next 7 days, 15-minute time steps, first
     row prefilled with next Saturday 7pm local. Each valid row previews the
     instant in every member's timezone (`profiles.timezone`,
     `late there` tag after dark). Proposing needs at least 2 valid times.
2. Time voting (`When should we meet?` / `Choose a time that works for you.`):
   - The proposed ballot, rendered in viewer local time via existing
     `profiles.timezone` + `MemberLocalTime`.
   - `Times are shown in your local time.` CTA `Submit vote`.
   - One vote per member per meetup, changeable until voting closes (upsert).
3. Quorum state (`Finding a time` / `X of Y members have voted`):
    - After voting, a `Your pick` badge on the chosen slot plus updated
      per-slot counts, so the vote landing is unmistakable.
    - Per-slot vote counts only, no avatar stacks: the counts carry the
      state. Slots render as read-only results, not radio buttons. (The
      `voters` payload stays in `get_meetup_state` but no client renders it
      on this screen.)
   - `N people have not voted yet.` and `We need 3 people on one time to set
     the meetup.`
   - `Change my vote` opens an explicit edit mode (ballot + `Submit change` /
     `Keep my vote`); `Back to room` returns to the cluster. Quorum is fixed
     at 3 confirmed participants on one slot. First slot to reach 3 wins; ties
     break by earliest `starts_at`, then earliest slot id. Deterministic,
     no host.
4. Confirmed (`Your cluster meetup is set` / slot + `N members joining`):
   - Participant avatars, CTA `Join Meetup`, note `We will remind you before it starts.`
   - `Join Meetup` is disabled until 10 minutes before start; then enabled.
   - Joining routes into the existing call: web `CallOverlay`, mobile `call.tsx`.
5. Reminders (lightweight, no new push infra):
   - New `notification_type` values `meetup_invite`, `meetup_confirmed`,
     `meetup_reminder_24h`, `meetup_reminder_15m`, `meetup_starting`.
   - Stored inbox rows + existing push fan-out (`push_outbox` + `send-push`).
   - One pg_cron pump `meetup-remind * * * * *` transitions
     `confirmed -> starting` and emits 24h, 15m, and at-start rows once each
     (idempotent flags on the meetup row).
   - Copy: `Cluster Meetup tomorrow`, `Your meetup starts in 15 minutes`,
     `Your cluster is waiting`, each with `View Meetup` or `Join Meetup`.
6. Call screen: reuse only.
   - Web: `CallBanner` + `PreJoinDialog` + `CallOverlay` (`LiveKitRoom`).
   - Mobile: `call.tsx` + `room/call/CallSession`, `CallGrid`, `CallControls`.
   - A meetup join starts (or joins) a normal cluster `calls` row via
     `start_call` / `join_call`, tagged with `meetups.call_id`. No new WebRTC code.
7. Post-call follow-up (non-blocking modal or sheet):
   - `That was your Cluster Meetup`, `N members joined.`, `How was it?`
     with `Loved it` / `It was nice` / `Not really for me`.
   - Then `Meet again next week?` with `Yes, let us meet again` /
     `Maybe next time`, plus `You can always skip a week.`
   - Dismiss always available; never blocks return to cluster.
8. Return to cluster:
   - Quiet state `You met this week` + `N members joined your Cluster Meetup.`
   - Optional prompt `What was your favorite moment?` that focuses the existing
     composer. No new feed.

Resilience required: vote changes, non-voters, fewer than 3 participants
(meetup expires, no call), late joins, early leaves, expiration. Every state has
loading, empty, error, and expired UI.

## 3. Backend design (Supabase, migrations 0171+)

Pattern source: `0107/0108/0110` (calls lifecycle + cron), `0007/0013/0159`
(votes + quorum + early close), `0008/0072` (notification types), `0100/0105`
(push fan-out), `0161` (timezone).

### 3.1 Schema (0171)

New enum:
```sql
create type meetup_status as enum (
  'proposed', 'voting', 'confirmed', 'starting', 'active', 'completed', 'cancelled'
);
```

Tables (all RLS enabled, `is_active_member(cluster_id)` read pattern,
writes via RPC only except where noted):

- `meetups`:
  `id uuid pk`, `cluster_id uuid fk clusters cascade`, `created_by uuid fk profiles`,
  `status meetup_status default 'voting'`, `confirmed_slot_id uuid nullable`,
  `starts_at timestamptz nullable` (denormalized from confirmed slot),
  `ends_at timestamptz nullable`, `voting_closes_at timestamptz not null`,
  `reminder_24h_sent_at timestamptz nullable`, `reminder_15m_sent_at timestamptz nullable`,
  `started_at timestamptz nullable`, `completed_at timestamptz nullable`,
  `cancelled_at timestamptz nullable`, `call_id uuid nullable fk calls`,
  `created_at`, `week_label text` (for example `Week 2`, nullable).
  One active meetup per cluster enforced in RPC via
  `pg_advisory_xact_lock(hashtextextended(cluster_id))`, same as `start_call`.
- `meetup_slots`:
  `id uuid pk`, `meetup_id uuid fk meetups cascade`, `starts_at timestamptz`,
  `ends_at timestamptz`, `created_by uuid`, `created_at`.
  Constraint `ends_at > starts_at`. Min 2, max 5 enforced in RPC (0177):
  the proposer builds the whole ballot from custom times.
- `meetup_votes`:
  `meetup_id uuid`, `slot_id uuid fk meetup_slots cascade`, `user_id uuid`,
  pk `(meetup_id, user_id)`, so one vote per member, changeable by update.
- `meetup_rsvps` (attendance):
  `meetup_id uuid`, `user_id uuid`, pk `(meetup_id, user_id)`,
  `status text check (status in ('going','maybe','declined')) default 'going'`,
  `checked_in_at timestamptz nullable`, `created_at`.
- `meetup_feedback`:
  `meetup_id uuid`, `user_id uuid`, pk `(meetup_id, user_id)`,
  `rating text check (rating in ('loved','nice','not_for_me'))`,
  `meet_again text check (meet_again in ('yes','maybe')) nullable`,
  `created_at`.

RLS (mirrors `calls` + `votes`):
- `SELECT` on all five tables: `is_active_member(cluster_id)` directly for
  `meetups`, via subselect for children
  (for example `is_active_member((select cluster_id from meetups where id = meetup_id))`).
- No direct `INSERT/UPDATE/DELETE` grants to `authenticated`; all mutations go
  through `security definer` RPCs. `service_role` retains full access for cron.

### 3.2 RPCs (0172, `security definer`, `search_path=public`, revoke from anon/public, grant to authenticated)

- `create_meetup(p_cluster_id, p_slots jsonb [{starts_at, ends_at}...], p_voting_closes_at)` returns `meetup_id`.
  Guards: `is_active_member`, `assert_account_can_write`, rate limit
  (`check_rate_limit`), advisory lock, single active meetup
  (no other row in `proposed/voting/confirmed/starting/active` for the cluster),
  3-4 slots, all slots in the future, `voting_closes_at` before earliest slot.
  Inserts meetup + slots, fans out one `meetup_invite` notification per other
  active member (same fan-out shape as `0013` vote creation).
  A proposal holds 2-5 custom slots built on the ballot-builder screen
  (web `meetups/new` route, mobile `meetups/new` tab route): day constrained
  to the next 7 days, time in 15-minute steps (web native inputs / mobile
  datetimepicker), first row prefilled with next Saturday 7pm local
  (`defaultCustomStart`). A screen-level timezone selector frames the whole
  ballot (web native select, mobile `TimezonePicker`), prefilled with the
  proposer's profile zone, then the device zone; wall times convert to UTC
  via `zonedTimeToISO` (`src/lib/timezones.ts`, DST-safe with round-trip
  validation). Each valid row previews the instant in each member's timezone
  (`profiles.timezone` via `useClusterMembers`, amber moon `Late there`
  after 8pm and sky sun `Early there` before 6am, neither on the own row
  which carries a primary `You` pill by its time instead) before proposing.
  Client rule (`isCustomSlotValid`, shared
  `src/lib/meetup.ts`): at least 3h out and within 7 days, one hour long.
  The server re-validates everything (2-5 slots, future slot,
  `ends_at > starts_at`, closes before earliest), so a hostile client cannot
  smuggle in an out-of-window ballot.
- `vote_meetup_slot(p_meetup_id, p_slot_id)` returns void.
  Guards: membership, meetup in `voting`, voting window open, slot belongs to
  meetup. Upserts `(meetup_id, user_id)`. After write, counts per slot; first
  slot with count >= 3 confirms: set `status='confirmed'`,
  `confirmed_slot_id`, `starts_at/ends_at` from slot, fan out
  `meetup_confirmed`. Deterministic tiebreak: lowest count-3 arrival wins
  because confirmation happens inline in the voting transaction under lock.
- `cancel_meetup(p_meetup_id)` returns void. Only the creator can withdraw,
  and only while `proposed/voting`. Confirmed meetups cannot be cancelled
  unilaterally; they complete or expire via `expire_meetups`.
- `rsvp_meetup(p_meetup_id, p_status)` upserts `meetup_rsvps`.
- `check_in_meetup(p_meetup_id)` sets `checked_in_at=now()` when the user joins
  the linked call; called alongside `join_call` from the client.
- `submit_meetup_feedback(p_meetup_id, p_rating, p_meet_again)` upserts feedback.
  Allowed when `completed` or within 7 days after `ends_at`.
- `get_meetup_state(p_meetup_id)` returns meetup + slots + per-slot counts +
  caller vote + participant list (bounded, RLS-safe aggregate so clients avoid
  N+1 counting). Mirrors `get_vote_counts`.
- `get_cluster_meetups(p_cluster_id)` returns the current plus last completed
  meetup for the `You met this week` state.
- `expire_meetups()` (cron-called): closes voting past `voting_closes_at`
  without quorum as `cancelled` (reason expired), marks `confirmed` past
  `ends_at + 2h` as `completed`. Mirrors `close_expired_votes` /
  `end_expired_calls`.
- `pump_meetup_reminders()` (cron-called every minute): for `confirmed`
  meetups, emits `meetup_reminder_24h` once (when `starts_at - now() <= 24h`),
  flips to `starting` + emits `meetup_reminder_15m` once (when <= 15m), emits
  `meetup_starting` at start. Idempotent via sent-at flags. Reuses the
  `notifications` + `push_outbox` fan-out; no Edge Function change
  (`send-push` already drains by type).

All RPCs use `is_active_member`, `is_account_active`, and `check_rate_limit`
guards. Concurrency via `pg_advisory_xact_lock` on `cluster_id`.

### 3.3 Realtime + cron + notifications (0173)

- Add tables to `supabase_realtime` publication:
  `meetups`, `meetup_slots`, `meetup_votes`, `meetup_rsvps`, `meetup_feedback`.
- New `notification_type` enum values (use `alter type ... add value` pattern
  from `0072`): `meetup_invite`, `meetup_confirmed`, `meetup_reminder_24h`,
  `meetup_reminder_15m`, `meetup_starting`.
- Extend `notificationTarget`-equivalent server payloads with
  `{ meetup_id, cluster_id }` so web and mobile deep-link to
  `/cluster/:id/meetups` (web) and `/(app)/cluster/:id/meetups` (mobile).
- pg_cron (idempotent unschedule + schedule, pattern from `0039`):
  `meetup-expire */5 * * * *` -> `expire_meetups()`,
  `meetup-remind * * * * *` -> `pump_meetup_reminders()`.
- `supabase db lint --local` must pass. After realtime migration changes,
  local stack needs `supabase stop && supabase start`.
- Regenerate `src/lib/database.types.ts` from the local stack after reset,
  then run `node mobile/scripts/sync-db-types.mjs` (or `npm run sync:db-types`
  from `mobile/`) and commit both copies. Never hand-edit generated files.

## 4. Web design (SPA)

New feature module `src/features/meetups.ts` (mirrors `votes.ts` + `cluster-calls.ts`):
hooks `useClusterMeetups`, `useMeetupState`, `useCreateMeetup`, `useVoteMeetupSlot`,
`useCancelMeetup`, `useRsvpMeetup`, `useSubmitMeetupFeedback`, `useCheckInMeetup`.
All reads via TanStack Query; components never call Supabase directly.
Realtime: extend `useClusterChannel` in `src/features/realtime.ts` to invalidate
`['meetups', clusterId]` on `meetups/meetup_slots/meetup_votes/meetup_rsvps` events.

Routes (`src/app/router.tsx`): nested under `/cluster/:clusterId`:
`meetups` -> `MeetupsView` (lazy, same pattern as `VotesView`).
`ClusterLayout` `SECTIONS` gains `{ to: 'meetups', label: 'Meetups', icon: Video }`.
`RoomView` gains a quiet `MeetupCard` entry point above the composer when an
active meetup exists or none exists (CTA `Vote for a time`); hidden when the
flag is off. `ClusterRail` shows the current meetup slot + countdown.

Pages and components (new files, colocated tests):
- `src/pages/cluster/MeetupsView.tsx` + `MeetupsView.test.tsx`: state machine
  render (`voting` ballot, `finding` quorum counts + avatars, `confirmed` +
  `Join Meetup`, `starting/active` join prompt, `completed` + `You met this week`,
  `cancelled/expired` empty state). Uses `Modal`, `Avatar`, `CountdownTimer`,
  `MemberLocalTime`. Buttons use existing pill + primary tokens only.
- `src/pages/cluster/meetups/MeetupCard.tsx`: room entry point. An active
  meetup card can be dismissed per meetup (persisted per user + cluster);
  a new meetup re-shows the banner. The propose entry has no dismiss.
- `src/pages/cluster/meetups/VoteForm.tsx`: slot radio list + `Submit vote`,
  local-time note, change-vote path.
- `src/pages/cluster/meetups/QuorumView.tsx`: per-slot counts + avatar stacks,
  `N have not voted`, `We need 3 people`, `Change my vote`.
- `src/pages/cluster/meetups/ConfirmedView.tsx`: slot, count, avatars,
  `Join Meetup` (disabled until start minus 10m), reminder note.
- `src/pages/cluster/meetups/ReminderCard.tsx`: 24h / 15m / starting variants.
- `src/pages/cluster/meetups/FeedbackModal.tsx`: post-call rating + meet-again,
  always dismissible, uses `Modal`.
- Join path: `useStartCall`/`useJoinCall` + `useCallToken` against
  `meetups.call_id` if present else a fresh `start_call`; render existing
  `CallBanner`/`PreJoinDialog`/`CallOverlay`. No new LiveKit code.
- `src/features/notifications.ts` `notificationTarget()`: add meetup cases to
  `/cluster/:id/meetups`. E2E `data-e2e` attributes: `meetup-card`,
  `meetup-vote-form`, `meetup-quorum`, `meetup-confirmed`, `meetup-join`,
  `meetup-feedback`.

Flag: `src/lib/meetup.ts` exports `MEETUP_ENABLED = true` and
`MEETUP_QUORUM = 3`. When false, routes render null, cards hide, and no RPCs
fire. Single constant, no refactor needed to disable.

## 5. Mobile design (Expo)

Feature module: add `meetups.ts` to the web `src/features/` first, then extend
`mobile/scripts/sync-db-types.mjs` to sync it (same auth-context rewrite as
`votes.ts`). Do not hand-maintain a fork. `realtime.ts` stays pinned; reconcile
the new invalidation by hand in `mobile/src/features/realtime.ts`.
`cluster-calls.ts` stays a mobile fork; reuse it as-is.

Routes (`mobile/app/(app)/cluster/[clusterId]/meetups.tsx`, hidden tab route):
registered in `mobile/app/(app)/_layout.tsx` with `href: null`
(tab bar hidden inside cluster, `router.back()` exit, same as `call.tsx`).
Entry point: quiet card at top of `room.tsx` + optional row in cluster menu.
Deep links: extend `src/lib/notification-routing.ts`
(`pushDataToHref`, `mobileTarget`) with meetup kinds to the new route;
extend `push-suppress.ts` so an open meetup screen suppresses its own banners.
Android channels: reuse `invites/governance`; no new channel unless the
review asks for one.

Components (`mobile/src/components/meetups/`, StyleSheet + `useTheme()` only,
tokens from `theme-tokens.ts`, no new colors):
- `MeetupCard.tsx` (invitation entry), `VoteForm.tsx`, `QuorumView.tsx`,
  `ConfirmedView.tsx`, `ReminderCard.tsx`, `FeedbackSheet.tsx` (uses existing
  `Modal.tsx`), all mirroring the web copy and states.
- Reuse `ui.tsx` (`Card`, `PrimaryButton`, `SecondaryButton`, `Screen`,
  `LoadingView`), `Avatar.tsx`, `CountdownTimer.tsx`, `MemberLocalTime.tsx`.
- Call: navigate to existing `call.tsx`; pass `meetupId` param so check-in
  fires `check_in_meetup` alongside `join_call`. No new WebRTC code; `livekit.ts`
  and `CallSession` unchanged.
- Flag: `mobile/src/lib/meetup.ts` mirrors web (`MEETUP_ENABLED`, `MEETUP_QUORUM`).

## 6. Test plan

- Unit (colocated, Vitest jsdom): `meetups.ts` hook key invalidation,
  quorum helper (first-to-3, tiebreak earliest slot), local-time formatting,
  `MeetupsView` states (voting, quorum, confirmed, expired, error, loading),
  `FeedbackModal` dismiss never blocks. Keep the repo v8 gate green
  (lines 34 percent, functions 33 percent, branches 20 percent); never lower it.
- Integration (`tests/integration/`, requires `supabase start`): RLS (non-member
  cannot read or vote), one-vote upsert + change, first-to-3 confirms inline,
  tiebreak deterministic, non-quorum expiry cancels, reminder pump idempotent
  (24h/15m/start fire once), feedback gated to completed, single-active-meetup
  invariant under concurrent `create_meetup`.
- E2E (Playwright, requires `supabase start` + `seed:demo`): create, vote,
  quorum confirm, join button enablement, feedback dismiss, `data-e2e` selectors.
- Mobile: `npm run lint`, `npx tsc --noEmit`, `npm test` in `mobile/`; manual
  Expo device check for call join + push tap routing (calls and push need a
  dev build or device, not Expo Go).
- Pre-push: `npm run lint`, `npm run test:coverage`, `npm run build`. Docs-only
  changes skip coverage and build; this feature does not. If migrations changed
  (they do), also `supabase db reset` + `npm run test:integration`. After any
  synced web file changes, `node mobile/scripts/sync-db-types.mjs --check`.

## 7. Rollout

1. Land migrations on `develop` (staging auto-migrates on merge; feature
   branches never apply remotely). Verify on preview + staging APK.
2. Ship UI behind `MEETUP_ENABLED = true` on staging, `false` toggle ready if
   beta needs pausing. No server kill-switch needed because RPCs enforce
   membership regardless.
3. Release `develop` to `main` with a merge commit only (never squash),
   after `npm run check:release` passes.
4. Seed demo: extend `scripts/seed-demo.mjs` only if needed for a demo meetup
   in cluster Aurora; keep idempotent.

## 8. File checklist

Backend: `supabase/migrations/0171_meetups_schema.sql`,
`0172_meetup_functions.sql`, `0173_meetup_realtime_cron.sql`,
`0174_meetup_feedback_fix.sql` (checked-in members may give feedback
pre-start), `0175_meetup_cancel_creator_only.sql` (only the proposer can
withdraw, voting phase only), `0176_meetup_state_voters.sql` (per-slot voter
ids for avatar stacks), `0177_meetup_fifth_slot.sql` (max 5 slots),
`0178_meetup_invite_copy.sql` (invite title grammar fix),
`0179_meetup_cancelled_reason.sql` (expired vs withdrawn),
`src/lib/database.types.ts` (regen), `tests/integration/meetups.test.ts`.
Web: `src/lib/meetup.ts`, `src/features/meetups.ts` (+ test),
`src/pages/cluster/MeetupsView.tsx` (+ test),
`src/pages/cluster/MeetupsNewView.tsx` (+ test),
`src/pages/cluster/meetups/*.tsx`, `ClusterLayout.tsx` + `router.tsx` edits,
`realtime.ts` + `notifications.ts` edits, `ClusterRail`/`RoomView` entry edits.
Mobile: `mobile/scripts/sync-db-types.mjs` (add meetups.ts),
`mobile/src/lib/meetup.ts`, `mobile/app/(app)/cluster/[clusterId]/meetups.tsx`,
`mobile/app/(app)/cluster/[clusterId]/meetups/new.tsx`,
`mobile/src/components/meetups/*.tsx`, `mobile/src/features/realtime.ts`
(hand reconcile), `notification-routing.ts` + `push-suppress.ts` edits,
`(app)/_layout.tsx` route registration.
