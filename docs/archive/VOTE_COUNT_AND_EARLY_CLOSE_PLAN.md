# Vote Count Bug + Early Close on Majority: Implementation Plan

Status: implemented. Migration `0159_vote_early_close.sql` applied locally, clients fixed, gates green (see section 7).

Source: `qa-testing` report with mobile screenshot showing `1 of 3 votes needed` plus `You voted: yes` on a rename vote where 3 members had voted, and follow-up decision to end the timer early once a majority is reached.

This plan covers two workstreams:

- A: fix the mobile undercount bug.
- B: change governance votes so a decisive majority closes the vote immediately instead of waiting for the fixed 48h timer.

## 1. Current behavior

### 1.1 Governance vote lifecycle

- Tables: `supabase/migrations/0007_votes_replacement.sql:3-24`
  - `votes(status open|closed, closes_at default now() + 48 hours, result jsonb)`.
  - `vote_responses(vote_id, user_id, choice)` with PK `(vote_id, user_id)`.
- Start: `start_replace_vote`, `start_name_vote` (live bodies in `0143_deterministic_replacement.sql` via `0138_hot_write_rate_limits.sql`, originally `0013_vote_functions.sql`). Each inserts an open vote and fans out `vote_started`.
- Vote: `vote_on(p_vote_id, p_choice)` in `0143_deterministic_replacement.sql:225-250`. Validates active membership, `status = open`, `yes|no` only for governance types, rate limit 10/hour, then upsert. It does not close anything.
- Close: `close_expired_votes()` in `0143_deterministic_replacement.sql:142-223` (batched version from `0136_cron_batch_limits.sql`, originally `0013_vote_functions.sql:64-153`).
  - Driving query: `where status = open and closes_at < now() order by closes_at limit 100 for update skip locked`.
  - Per vote: count active members, `v_quorum := fn_quorum(v_active)` where `fn_quorum = floor(n/2)+1`.
  - Count `yes`, `no`, `total` from `vote_responses`.
  - Pass rule for `replace_member` and `change_name`: `v_total >= v_quorum and v_yes > v_no`.
  - Writes `result = {yes, no, cast, quorum, quorum_met, outcome}` and fans out `vote_result`.
  - Cron: `vote-close */10` in `supabase/migrations/0015_cron.sql:6`.
- Result: full tallies are only visible after close. Open votes intentionally hide other members choices.

### 1.2 Vote secrecy model

- `supabase/migrations/0044_harden_reaction_and_vote_rls.sql:28-46`
  - `vote_responses` select requires active membership AND (`auth.uid() = user_id` OR vote `status = closed`).
  - This is why direct reads of `vote_responses` on an open vote only return the caller's own row.
- `tests/integration/rls.test.ts:241` pins this: open responses hidden from other members, revealed once closed.

### 1.3 Web path (correct)

- `src/features/votes.ts:60-74` `useVoteCounts()` calls `get_vote_counts(p_cluster_id)` defined in `supabase/migrations/0140_feed_counts.sql:66-92`.
  - `security definer`, checks `is_active_member`, then `count(vr.vote_id)` per vote plus `my_choice` subselect for `auth.uid()`.
  - Returns total cast count without leaking who voted which way.
- `src/pages/cluster/VotesView.tsx:39,64-77,375-380`
  - `castCountByVote` from `counts.data`, `quorum = floor(members/2)+1`.
  - Copy: `X of Y votes needed` or `Quorum reached (X of Y votes)`.
  - `myChoice` from `counts.data`, shows `You voted: yes|no` instead of buttons.
- Realtime `src/features/realtime.ts:302-334`: `votes` INSERT patches `cluster-votes`, UPDATE patches plus invalidates `vote-counts`.
- Test `src/pages/cluster/VotesView.test.tsx:154-174` covers quorum progress and quorum reached copy. Note `165: confirms quorum without implying an early close`, which will need updating under workstream B.
- Integration `tests/integration/governance.test.ts:493-535` covers `get_vote_counts` counts plus own choice.

### 1.4 Mobile path (buggy)

- `mobile/src/features/votes.ts:31-53` `useClusterVoteResponses()` fetches vote ids then `.from(vote_responses).select(*).in(vote_id, ids)`.
  - Under the 0044 RLS policy, on an open vote this returns only the caller's own rows.
- `mobile/app/(app)/cluster/[clusterId]/votes.tsx:74-87`
  - `myChoiceByVote` filters `r.user_id === userId` (correct).
  - `castCountByVote` counts rows in `responses.data` per `vote_id` (incorrect for open votes, counts only visible rows).
  - Same copy as web at `408-412`, so `1 of 3 votes needed` in the screenshot is exactly this bug: 3 votes cast, only 1 visible to the caller.
- `mobile/src/features/votes.ts:60-74` already contains a `useVoteCounts` copy (generated from web via `mobile/scripts/sync-db-types.mjs:29-35`), but the votes screen does not use it.
- `mobile/src/features/realtime.ts` is pinned per `AGENTS.md` and `mobile/scripts/sync-db-types.mjs:125-132`. It has its own `useClusterChannel` copy that must be reconciled by hand if web realtime handling changes.

## 2. Desired behavior

### 2.1 Workstream A: accurate progress count on mobile

- Mobile Active votes card shows the same total `cast_count` as web for open votes.
- Still hides who voted which way until close: only total count plus the caller's own choice.
- No change to RLS. RLS stays as the secrecy enforcement. The count comes from the existing `security definer` RPC, not from widening direct reads.

### 2.2 Workstream B: early close on decisive majority

Decision: locked. Close early on all three decisive states below. Thread intent plus codebase review both point this way.

- Let `active` = current active members in the cluster, `quorum = floor(active/2)+1`, `yes` and `no` = current tallies for that vote.
- Close immediately as `passed` when `yes >= quorum`. Rationale: `yes >= quorum` implies `total >= quorum` and `yes > no` always holds because `no <= active - yes < quorum <= yes`. This matches the existing pass rule (`v_total >= v_quorum and v_yes > v_no` in `0143`) with no rule change, only timing.
- Close immediately as `failed` when `no >= quorum`. Rationale: `yes` can no longer pass because max possible `yes = active - no < quorum`, and `yes > no` is impossible since `no` holds a majority. Pass-only early close would leave a decided failure open for 48h, which repeats the reported complaint in reverse and conflicts with `docs/PRD.md:306-307` (hidden until completed, revealed after close, with no fixed-wait promise).
- Close immediately when all active members voted (`yes + no >= active`), applying the normal pass/fail rule. Rationale: covers small-cluster ties where neither side reaches quorum but the outcome is fixed (for example 4 members, quorum 3, final 2 yes and 2 no must close as `failed` instead of waiting for expiry).
- Otherwise stay open until `closes_at`. The existing expiry path is unchanged.
- Copy stays `Results are hidden until it closes`, but `closes` can now happen early. `Ends in X` remains accurate because early close moves the vote to Past votes via realtime update.

Out of scope unless explicitly requested:

- No live yes/no tallies on open votes. Only the total cast count stays visible.
- No change to 48h TTL for undecided votes.
- No change to `fn_quorum`, cooldowns, replacement chaining, invitation TTLs, or notification prefs.
- No schema change to `votes` or `vote_responses`.

Open product questions: resolved (see section 8). All three decisions are locked below.

1. Confirm fail-fast on `no >= quorum`, or only pass-fast on `yes >= quorum`?
2. Should vote creators or other members get an immediate push when an early close happens, or is the existing `vote_result` fan-out enough?
3. Should the UI show a transient `Quorum reached` state, or is instant move to Past votes preferred?

## 3. Database design (new migration `0159_vote_early_close.sql`)

Follow `AGENTS.md` migrations rules: new numbered file, never edit an applied migration, order-dependent, RLS stays enabled, privileged ops in `security definer` with grants, then `supabase db lint --local` and regenerate `src/lib/database.types.ts`.

### 3.1 Refactor close logic into a shared helper

Create `close_governance_vote(v_vote public.votes)` or `try_close_vote(p_vote_id uuid)` that holds the per-vote body currently duplicated in `close_expired_votes()`:

- Input: open vote row (locked via `for update` in caller).
- Recompute `v_active`, `v_quorum`, `v_yes`, `v_no`, `v_total`.
- Build the same `v_result` json shape `{yes, no, cast, quorum, quorum_met, outcome}`.
- Apply the same effects:
  - `replace_member` pass: set `left_at`, insert `mode_cooldowns` with `fn_cooldown_interval`, call `start_replacement`.
  - `change_name` pass: update `clusters.name`.
  - Always: `update votes set status = closed, result = v_result where id = ... and status = open`, check `row_count` to keep exactly-once behavior under concurrent runs, then fan out `vote_result` only if this run closed it.
- Keep `select_candidate` stray handling identical to `0143:179-185`: close as `superseded` with no fan-out.

Then rewrite `close_expired_votes()` to loop over due votes and call the helper. Keep its advisory lock `vote-close`, `statement_timeout 240s`, `order by closes_at limit 100 for update skip locked`, and partial index `votes_open_due_idx` usage.

### 3.2 Early close trigger in `vote_on()`

Extend `vote_on()` (live body `0143:225-250`, preserving `assert_account_can_write` and rate limit order):

1. Existing guards unchanged: auth, membership, `status = open`, `yes|no` validation, rate limit, upsert response.
2. After upsert, take `pg_advisory_xact_lock(hashtext('vote:' || p_vote_id))` to serialize concurrent voters on the same vote.
3. Re-read the vote row with `for update`. If already `closed`, return.
4. Count `yes`, `no`, `total`, compute `active` and `quorum` the same way as the close path.
5. If `v_type in (replace_member, change_name)` and (`yes >= quorum` OR `no >= quorum` OR `total >= active`), call the shared close helper for that vote.
6. Important: do not change the return type (`returns void`) so existing clients are unaffected. Early close effects (rename, removal, replacement start, notifications) happen in the same transaction as the deciding vote, which keeps the UX instant.

Concurrency notes:

- `vote_on` and `close_expired_votes` can race on the same vote. Both must use `where status = open` on the final update plus `row_count` check so only one applies effects and fans out.
- Vote changes (same user flipping `yes` to `no`) use upsert. The post-write check runs on every write, so a flip that undecides nothing stays open, a flip that decides closes. No special handling needed beyond recounting after the write.
- Member leave/join between votes changes `active` and therefore `quorum`. Recounting at vote time plus recounting at expiry time is the correct behavior. Document that quorum is evaluated at close time, not at vote creation time.

### 3.3 Grants and RLS

- No RLS policy change. `0044` secrecy stays.
- `vote_on` and `close_expired_votes` remain `security definer`. New helper is `security definer` with `set search_path = public`, revoked from `public, anon`, granted to `authenticated`, matching `0140:94-95` style.
- No new table, enum, index, or cron schedule. Optional: add a partial index only if `supabase db lint` or query plan shows the per-vote recount is slow. Expected load is one vote row plus aggregate over at most 8 responses, so no index work is planned.

### 3.4 `get_vote_counts` unchanged

No change needed. It already returns totals for open votes. Workstream A is a client switch to use it.

## 4. Client design

### 4.1 Shared feature module (`src/features/votes.ts`, then sync to mobile)

- No API change: `useVoteCounts`, `useClusterVotes`, `useVoteOn`, `parseVoteResult` signatures stay the same.
- `useVoteOn` `onSuccess` already invalidates `vote-responses` and `vote-counts` (web: `src/features/votes.ts:154-159`). Add `cluster-votes` invalidation there as well so an early close (which flips `status` to `closed`) moves the card from Active to Past without waiting for realtime. Keep the realtime UPDATE handler as the primary path; the invalidation is a fallback.
- Regenerate mobile copies with `cd mobile && npm run sync:db-types`. `mobile/src/features/votes.ts` is generated from the web copy, so do not hand-edit it except via the sync script. Verify with `node mobile/scripts/sync-db-types.mjs --check`.

### 4.2 Web (`src/pages/cluster/VotesView.tsx`)

Decision: locked. Reword progress to neutral participation copy and remove the `Quorum reached` branch.

- Keep `useVoteCounts` as the count source. No counting logic change.
- Change Active card copy from `X of Y votes needed` / `Quorum reached (X of Y votes)` to `X of Y votes cast`. Reason: under early close, `total >= quorum` no longer means decided (example: 8 members, quorum 5, split 3 yes and 2 no leaves the vote open, so `Quorum reached` would mislead). Neutral `votes cast` also fixes the reported confusion where `1 of 3 votes needed` read as only one vote counted. Denominator stays `quorum` to keep the change small and preserve secrecy (no yes/no split is revealed while open).
- Ensure `openVotes` vs `closedVotes` filters (`124-125`) handle the early-close transition. No filter change needed, but the realtime UPDATE handler (`src/features/realtime.ts:319-334`) already patches `cluster-votes` and invalidates `vote-counts`, which is what moves the card.
- Check `ClusterRail.tsx:116` open-vote count and `room/VoteRow.tsx` if they read `cluster-votes` directly; they will pick up the status flip via the same invalidation. No extra work unless inspection finds a stale cache key.

### 4.3 Mobile (`mobile/app/(app)/cluster/[clusterId]/votes.tsx`)

This is the actual bug fix:

- Replace `useClusterVoteResponses` with `useVoteCounts` on this screen, mirroring web:
  - `myChoiceByVote` from `counts.data` `my_choice`.
  - `castCountByVote` from `counts.data` `cast_count`.
  - Loading gate switches from `responses.isLoading` to `counts.isLoading`.
  - Pull-to-refresh list switches from `responses.refetch()` to `counts.refetch()`.
  - `PastVoteCard` `castCount` prop uses `counts` fallback the same way web does (`VotesView.tsx:200`), not a filtered `responses` length.
- Keep `useClusterVoteResponses` exported (other screens or tests may use it) unless grep shows zero remaining callers, in which case remove it in a follow-up to keep this change small.
- Manually reconcile `mobile/src/features/realtime.ts` pinned copy: ensure `votes` INSERT/UPDATE handlers invalidate `vote-counts` (not `vote-responses`) and patch `cluster-votes`, matching web `src/features/realtime.ts:310-334`. Also ensure `useVoteOn` invalidation there includes `cluster-votes` after the web change is synced.
- Verify Android copy strings match web and contain no em dashes or en dashes per repo convention.

## 5. Tests

### 5.1 Unit and component (Vitest, jsdom, colocated)

- `src/pages/cluster/VotesView.test.tsx`
  - Keep: loading, empty, yes/no cast, own-choice display, error surfacing, legacy `select_candidate` hidden, replacement banner, modal starts, past-vote rendering.
  - Update `154-174`: replace `1 of 2 votes needed` with `1 of 2 votes cast`, and replace `165: confirms quorum without implying an early close` with a below-quorum progress case plus a past-vote assertion for the decided case (decisive votes now close immediately, so the old `Quorum reached` active state is removed).
  - Add mobile parity coverage if a mobile unit harness exists; otherwise rely on shared `votes.test.tsx` plus manual QA on the votes screen. Mobile copy must match web (`X of Y votes cast`).
- `src/features/votes.test.tsx`
  - Keep `get_vote_counts` call assertion. Add assertion that `useVoteOn.onSuccess` invalidates `cluster-votes` in addition to `vote-counts` and `vote-responses`.
- `src/features/realtime.test.tsx`
  - Keep votes INSERT/UPDATE patch tests. Add that UPDATE (early close) invalidates `vote-counts`.

### 5.2 Integration (`tests/integration/governance.test.ts`, requires `supabase start`)

Add cases without touching existing pass/fail expiry cases:

- `vote_on` closes a `change_name` vote immediately when `yes >= quorum`: start vote with 5 members, cast 3 yes, assert `status = closed`, `outcome = passed`, cluster renamed, without manually expiring `closes_at` and without calling `close_expired_votes`.
- `vote_on` closes immediately as `failed` when `no >= quorum`: cast quorum `no`, assert closed, name unchanged or member stays. This is the locked fail-fast rule, not an optional case.
- `vote_on` closes immediately when all active members voted even without quorum on either side: 4 members, 2 yes and 2 no, assert `status = closed` and `outcome = failed`.
- No early close below quorum: cast 1 yes on a 5-member cluster, assert still `open`.
- Vote flip: yes then change to no (upsert) still recounts correctly and does not double-apply effects.
- Exactly-once: deciding vote plus concurrent `close_expired_votes` call results in one `vote_result` fan-out and one `start_replacement` effect (for `replace_member`).
- `get_vote_counts` still returns total count to a non-voter while open (already covered at `493-535`, keep as regression anchor for workstream A).
- `tests/integration/rls.test.ts:241` stays green: direct `vote_responses` reads still hide others choices while open.

### 5.3 E2E (Playwright, `e2e/`, requires `supabase start` + `seed:demo`)

- Existing selectors use `data-e2e` attributes. Check whether votes cards have stable selectors; add them only if missing for the new early-close assertion.
- Proposed scenario: seed demo cluster, start name vote as one user, vote yes from quorum members, assert the vote leaves Active votes and appears under Past votes without waiting for expiry.

### 5.4 Manual QA checklist

- Mobile (Expo Android): 3-member test cluster, each votes, each device shows `2 of 2 votes cast` style progress while undecided and moves to Past votes after the deciding vote, never stuck at `1 of 3`.
- Web: same cluster shows identical counts.
- Timer: undecided vote still shows `Ends in X`; decided vote disappears from Active immediately and shows full `yes/no/cast/quorum` in Past votes.
- Notifications: `vote_result` arrives once.

## 6. Docs and generated files

- `src/lib/database.types.ts`: regenerate from the schema after the migration. Then run `cd mobile && npm run sync:db-types` and commit mobile copies. Verify with `node mobile/scripts/sync-db-types.mjs --check`.
- `docs/TECHNICAL.md`: update governance bullet to mention early close on decisive majority plus the shared close helper.
- `docs/PRD.md`: update name-change and replacement vote sections if they state a fixed 48h wait.
- `mobile/README.md`: only if votes screen behavior is documented there.
- Keep `docs/archive/` untouched (shipped-feature records).

## 7. Verification gates (per `AGENTS.md`)

- `supabase db lint --local` after adding `0159`.
- `supabase db reset` then `npm run seed:demo` if migrations changed, then `npm run test:integration`.
- `npm run lint`.
- `npm run test:coverage`: hard v8 gate (lines 34 percent, functions 33 percent, branches 20 percent). Never lower thresholds.
- `npm run build` (typecheck via `tsc -b` plus `vite build`).
- If a synced web file changed: `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated mobile copies.
- Docs-only changes skip coverage and build gates; this change is not docs-only.
- Pre-push: lint, coverage, build. If migrations changed, also reset plus integration. If synced files changed, also sync check.

## 8. Decisions (locked after codebase review)

1. Fail-fast scope: close early on `yes >= quorum` plus `no >= quorum` plus all-voted. Chosen because the pass rule in `0143` is `total >= quorum and yes > no`, so pass-only early close would leave decided failures open for 48h and repeat the complaint in reverse. The all-voted rule is required for ties below quorum (4 members, 2 yes and 2 no must close as `failed`). Quorum stays `floor(active/2)+1` and is evaluated at close time in both paths.
2. Copy: change Active card to neutral `X of Y votes cast` and remove the `Quorum reached` branch on web plus mobile. Chosen because `total >= quorum` no longer implies decided (8 members, quorum 5, split 3 yes and 2 no stays open), so the old branch would mislead. Neutral participation copy also fixes the reported `1 of 3 votes needed` confusion without leaking the hidden yes/no split required by `0044` and `docs/PRD.md:306-307`. Denominator stays `quorum` to keep the change small.
3. Notifications: keep the existing `vote_result` fan-out inside the shared close helper, fired immediately on early close. Chosen because every `notifications` INSERT already flows through the `push_outbox` trigger (`0100`, governance channel), respects per-cluster prefs (`0024`, `0056`, `0080`), deep-links to `/cluster/:id/votes` (`src/features/notifications.ts:402-404`), and updates live via `useNotificationsChannel` plus `useClusterChannel`. No new notification type, push channel, or Edge Function work is needed. The deciding voter also gets the result, matching the expiry path.
4. Mobile cleanup: leave `useClusterVoteResponses` exported for now vs remove if unused. Chosen: leave it, remove in a follow-up after grep confirms no callers.

## 9. Implementation order

1. Migration `0159_vote_early_close.sql`: helper plus `vote_on` early-close plus `close_expired_votes` refactor. Local `supabase start`, `supabase db reset`, `supabase db lint --local`.
2. Regenerate `database.types.ts` plus mobile sync and check.
3. Integration tests for early close plus existing governance and RLS suites.
4. Web `useVoteOn` invalidation tweak plus `VotesView.test.tsx` updates.
5. Mobile votes screen switch to `useVoteCounts` plus pinned realtime reconciliation.
6. Unit tests, lint, coverage, build.
7. Docs updates (`TECHNICAL.md`, `PRD.md` as needed).
8. Manual QA on web plus Android, then PR targeting `develop` with Conventional Commits.

## 10. Risks

- Double-apply of rename/removal/replacement if `vote_on` and cron race: mitigated by per-vote advisory lock plus `where status = open` plus `row_count` guard.
- Long transaction on the deciding vote (close effects plus fan-out inside `vote_on`): bounded to one cluster of at most 8 members, same work the cron already does per vote.
- Quorum drift when members leave mid-vote: accepted, quorum is evaluated at close time in both paths.
- Mobile stale cache if realtime event is missed: mitigated by adding `cluster-votes` invalidation to `useVoteOn.onSuccess` alongside realtime UPDATE handling.
