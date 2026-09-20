# Cluster Lifecycle Simplification Plan

> Planning/review phase only. No application code, migrations, tests, generated types, or configuration were changed to produce this document. It is based on the codebase as it exists now (web SPA + `mobile/`, Supabase Postgres backend, RLS + `security definer` RPCs).
>
> **Locked decisions (review follow-up, binding for implementation):**
>
> 1. Existing `status='introductions'` clusters are backfilled to `status='active', introductions_completed_at=now()`, keeping per-member `intro_completed_at` as checklist progress, silently (no `unlocked` fan-out).
> 2. Open `select_candidate` votes get a one-shot cutover in the migration: close them and return their rounds to sourcing under the new deterministic path. The old candidate-vote branch is not kept for another release.
> 3. New `candidate_pool` stores only `[selected_candidate]`; decline/expire re-sources the next eligible candidate.
> 4. `/waiting` (web + mobile) is kept as a route for compatibility but redirects to the cluster room; it is not an active lifecycle state.
> 5. Failed `accept_invitation` (invitee became ineligible) keeps current behavior (no auto-advance); out of scope.
> 6. Continuous refill is in scope: an active cluster keeps starting sequential replacement cycles until it is back to 8 (8→7→8, 8→6→7→8, departures during an in-flight round). Never parallel invitations.

## 0. Summary of findings and proposed approach

### What exists today

**Formation → introduction gating:**

- `maybe_form_cluster()` (`supabase/migrations/0011_matching_functions.sql:31-74`) fires from the `queue_entries_formation` trigger (`AFTER INSERT OR DELETE ON queue_entries`). When `count >= 8` for a `(mode, queue_key)` it takes the 8 oldest `queue_entries ORDER BY joined_at LIMIT 8`, inserts `clusters(status='introductions', introductions_deadline=now()+72h, introductions_completed_at=NULL)`, inserts 8 `cluster_members`, deletes those queue rows, fans out 8 `notifications(type='cluster_formed')`, and `pg_notify('queue_update')`.
- Locked until every active member completes 5 intro answers:
  - `cluster_unlocked(p_cluster_id)` (`supabase/migrations/0004_chat.sql:29-35`) = `clusters.introductions_completed_at IS NOT NULL`.
  - This single predicate gates `messages` SELECT/INSERT RLS (`0004_chat.sql:37-47`), every `send_message()` body (`0012`, `0024`, `0033`, `0038`, `0046`, `0054`, `0138`), all posts/likes/comments/reactions/read RPCs and RLS (`0072_posts_schema.sql`, `0073_posts_functions.sql`, `0077`, `0079`, `0080`, `0081`, `0082`, `0098`, `0099`, `0106`, `0139`), and `get_member_profiles()` avatar/bio masking (`0004_chat.sql:89-94`, redefined in `0047`, `0048`).
  - `submit_intro_answers()` (`0045`, live body `0054_moderation_enforcement.sql:181-234`) marks `cluster_members.intro_completed_at` when the caller has 5 `intro_answers`, and only while `clusters.status='introductions'` promotes the cluster to `status='active', introductions_completed_at=now()` plus an `unlocked` notification fan-out.
  - `check_intro_deadlines()` (`0012_intro_social_functions.sql:68-104`, live body `0136_cron_batch_limits.sql:137-177`, cron `*/15` in `0015_cron.sql`) removes (`left_at=now()`) every active member with `intro_completed_at IS NULL` once `status='introductions' AND introductions_deadline < now()`, calls `start_replacement()`, and unlocks if no incompletes remain.
  - Web gating: `ClusterLayout.tsx:67-75` redirects to `/cluster/:id/waiting` when `!introductions_completed_at`, and to `/cluster/:id/introductions` when the cluster is unlocked but the viewer's own `intro_completed_at` is null. `IntroductionsPage.tsx:44-55`, `WaitingForOthersPage.tsx:49-55`, `ClusterCard.tsx:26-35`, `ModePanel.tsx:70-88` (`InClusterCard`), `PostsFeedPage.tsx:108,179-189`, `HomePage.tsx:166-192`, `ClusterCreatedPage.tsx:131-133`, and `notificationTarget()` (`notifications.ts:342` → `/cluster/:id/introductions`) all assume the locked phase.
  - Mobile mirrors all of it: `mobile/app/(app)/cluster/[clusterId]/introductions.tsx`, `waiting.tsx`, `cluster-created.tsx`, `home.tsx`, `mode/[modeId].tsx`, `posts.tsx`, plus `mobile/src/features/introductions.ts`.

**Replacement + candidate-selection voting:**

- Tables (`0007_votes_replacement.sql`): `votes(type vote_type, status, closes_at=now()+48h, result jsonb)`, `vote_responses(choice='yes'|'no'|candidate-user-id)`, `replacement_rounds(status replacement_status, candidate_pool uuid[], invited_user_id, select_candidate_vote_id→votes.id, declined_user_ids uuid[], attempts int, closed_reason)`, `invitations(status, expires_at=now()+72h)`.
- Enums (`0001_enums.sql`): `vote_type('replace_member','change_name','select_candidate')`, `replacement_status('selecting_candidates','voting','inviting','filled','closed')`.
- `source_candidates()` (original `0014_replacement_functions.sql:75-170`, live body `0141_source_candidates_inline.sql:33-154`): advisory-locked; `attempts+1`; branch 1 = same `queue_key ORDER BY joined_at LIMIT 3` with inlined eligibility (onboarded, no active same-mode membership, no active cooldown, not in `declined_user_ids`); branch 2 = top-up from other keys same mode `ORDER BY joined_at`; 0 → stay `selecting_candidates` (close `pool_exhausted` at `attempts>=5`); 1 → `inviting` + `create_invitation()` (no vote); ≥2 → `status='voting'` + insert `votes(select_candidate)` + `replacement` notification (`Candidates are up for selection`).
- `close_expired_votes()` (original `0013:64-153`, live `0136:36-135`): `select_candidate` branch (lines `92-119`) resolves by plurality `GROUP BY choice ORDER BY count(*) DESC, min(created_at)` when `cast >= fn_quorum(active)` (`fn_quorum = floor(n/2)+1`, `0013:59-62`), moves round to `inviting` + `create_invitation()`; else `no_quorum` → back to `selecting_candidates` + re-`source_candidates()`. Always writes `result={yes,no,cast,quorum,quorum_met,outcome}` and fans out `vote_result`.
- `vote_on()` hardened in `0023_governance_realtime.sql:19-45`: `replace_member|change_name` accept only `yes|no`; `select_candidate` accepts only a user id in the linked round's `candidate_pool`.
- Invitation lifecycle (`0014:172-303`, cron-hardened `0136:179-221`): `create_invitation()`, `accept_invitation()` (owner+pending guard, `already_in_cluster_of_mode` guard, advisory lock, `accepted` + `cluster_members` insert + delete all `queue_entries` of invitee + extend `introductions_deadline` if still `introductions` + round `filled` + `replacement` notification), `decline_invitation()` → `advance_round_on_invitation_void()` (append `declined_user_ids`, reset to `selecting_candidates`, re-`source_candidates()`), `expire_invitations()` (same advance path), `progress_replacements()` (re-source `selecting_candidates`, close `attempts>=5 AND created_at<now()-14d`).
- Entry points calling `start_replacement()`: `leave_cluster()` (`0014:27-43`), `close_expired_votes()` replace-member pass, `check_intro_deadlines()`, plus moderation/ban/delete paths (`0026`, `0028`, `0056`, `0063`, `0064`).
- Read RPCs (`0023`, `0140`): `get_replacement_round()`, `get_candidate_profiles()` (avatar masked unless `cluster_unlocked`), `get_pending_invitations()`, `get_vote_counts()`.
- Web UI (`src/features/votes.ts`, `src/pages/cluster/VotesView.tsx:28-32,129,163-170,180-196,288-346,348-473,475-566`, `MembersView.tsx:37-52`, `room/VoteRow.tsx`, `ClusterRail.tsx:114`, `HomePage.tsx:108-154`): `useReplacementRound`, `useReplacementCandidates`, `ReplacementBanner` (`selecting_candidates|inviting|voting` copy), `ActiveVoteCard` candidate cards (`vote_on(vote.id, c.user_id)`, one-shot, quorum `cast/quorum`), `PastVoteCard` uuid-outcome parsing.
- Realtime (`0021_realtime_chat.sql`, `0023_governance_realtime.sql:4-13`, `src/features/realtime.ts:153,280-366`, `src/features/notifications.ts:282-313`): `votes` + `replacement_rounds` in publication; `useClusterChannel` patches `cluster-votes`/`vote-counts` and invalidates `replacement-round`/`replacement-candidates`; `useNotificationsChannel` invalidates `my-invitations`. Notification prefs (`0024_notifications_m11.sql:18-35`): `vote_started|vote_result|replacement → prefs.votes`, `invitation_received → prefs.invitations`; deep-links (`notifications.ts:315-348`): `vote_started|vote_result|replacement → /cluster/:id/votes`, `invitation_received → /home`, `cluster_formed → /cluster/:id/introductions`.
- Mobile mirrors: `mobile/src/features/votes.ts`, `mobile/src/features/notifications.ts`, `mobile/src/features/realtime.ts` (pinned per `AGENTS.md`), `mobile/app/(app)/cluster/[clusterId]/votes.tsx` (full port incl. candidate cards + banner), `members.tsx:27`, `home.tsx:67`, `notifications.tsx:44`.
- Cron (`0015_cron.sql`, `0039_cron_idempotent.sql`, `0136`): `vote-close */10`, `invite-expire */30`, `replacement-progress */60`, `intro-deadline */15`, with `*_idx` partial indexes from `0136:23-33`.

### Proposed approach (smallest coherent change)

**Change 1: open at 8:** keep every existing `cluster_unlocked` gate exactly as-is and make it true at formation. One RPC change (`maybe_form_cluster()` inserts `status='active', introductions_completed_at=now(), introductions_deadline=NULL`) unlocks chat/posts/calls/signals/votes/profiles immediately with zero RLS rewrites. Frontend removes the two redirects and repoints entry links to the room; intros become an optional in-cluster checklist. `submit_intro_answers()`, `intro_answers`, `get_intro_progress()`, and columns are retained. `check_intro_deadlines()` becomes legacy-only (it already only matches `status='introductions'`, so new clusters are automatically exempt).

**Change 2: no candidate voting:** keep tables, enums, `replacement_rounds` state machine, invitation lifecycle, eligibility (`fn_candidate_eligible` + inlined predicates in `0141`), cooldowns, RLS, and governance votes untouched. Change only the pool-size branch in `source_candidates()`: whenever the pool is non-empty, deterministically invite `v_pool[1]` (which is already `ORDER BY queue_entries.joined_at`, i.e. longest-waiting first) instead of opening a `select_candidate` vote when `array_length >= 2`. Then delete/quarantine the now-unreachable `select_candidate` resolution and validation paths (`close_expired_votes()` branch, `vote_on()` branch) and their UI. No new tables, no new architecture; `replacement_status='voting'` and `vote_type='select_candidate'` become write-dead but stay in the enum for existing rows.
**Locked:** new `candidate_pool` is exactly `[v_pool[1]]` (single-element); decline/expire re-sources and picks the next eligible candidate.

**Change 3: continuous refill (locked, fixes the §9 under-8 gap):** the invariant is **an active cluster continuously attempts to return to 8 members until it reaches 8**, sequentially (at most one pending invitation per cluster at a time):
- `leave_cluster()` while a round is already active (`selecting_candidates`/`inviting`) does **not** supersede it; the vacancy is picked up by the accept-chain recount below.
- `accept_invitation()`, after marking its round `filled` and inserting the member (under the existing `replacement:<cluster>` advisory lock), recounts active members; if still `< 8` and no other active round exists, it immediately calls `start_replacement()` for the next cycle, and adds a defensive `cluster_full` guard (recount `>= 8` before insert → raise instead of overshooting).
- `progress_replacements()` gains a bounded safety-net scan: active clusters with `< 8` members and no active round and no pending invitation get a fresh `start_replacement()` (covers `pool_exhausted` closures and race windows).

---

## 1. Current architecture

### 1.1 Queue → cluster formation flow

| Step | Code |
|---|---|
| Queue entry | `join_queue(p_mode, p_radius_km)` (`0011:92-138`, guards extended in `0054`, `0129`, `0132`, `0138`): auth, onboarding (`dob`), `mode_cooldowns`, `already_in_cluster_of_mode`, `local` location/radius; `ON CONFLICT one_queue_per_mode DO NOTHING`; returns `(queue_key, waiting)` |
| Key/label | `fn_queue_key()` / `fn_mode_label()` (`0011:3-29`, `open_mix` key `'open'` in `0131`/`0132`) |
| Formation trigger | `queue_entries_formation AFTER INSERT OR DELETE ... queue_entries_change()` (`0011:76-90`); sole formation path (explicit re-call deliberately removed, `0011:131-133`) |
| Formation | `maybe_form_cluster()` (`0011:31-74`): advisory lock `cluster:mode:key`, `count<8 → return`, `array_agg ORDER BY joined_at LIMIT 8`, insert cluster `status='introductions'`, deadline `+72h`, insert members, delete queue rows, 8× `cluster_formed` notifications, `pg_notify('queue_update')` |
| Status RPCs | `get_my_matching_status()` (`0018`), `get_my_queue_keys()` (`0011:154-162`), `get_queue_count()` (`0011:147-152`, 60s poll `matching.ts:121-145`), `get_my_clusters()` (`0037`, includes `status`, `introductions_deadline`, `introductions_completed_at`, `member_count`) |
| Hooks | `useMyQueueStatus`, `useMyQueueKeys`, `useMyClusters`, `useClusterMembers→get_member_profiles`, `useJoinQueue`, `useLeaveQueue`, `useLatestClusterFormed` (`src/features/matching.ts`); mirrored in `mobile/src/features/matching.ts` |
| Entry UI | `ModePanel.tsx` (`JoinCard`/`JoinedCard`/`InClusterCard`), `QueuePage.tsx`, `QueueCard.tsx` (`{current} of 8`), `WhatsNextSteps.tsx` (notify at 8 / 72h-or-lose-spot / chat unlocks when all answer), `HomePage.tsx:166-192` (`cluster_formed` banner → `/cluster-created`), `ClusterCreatedPage.tsx` (marks `cluster_formed` read, `Start introductions` → `/cluster/:id/introductions`) |
| Constants | `CLUSTER_SIZE=8` (`src/lib/constants.ts:6`), mirrored in SQL `LIMIT 8`; `mobile/src/lib/constants.ts` copy |

### 1.2 Current introduction gating

| Layer | Code |
|---|---|
| Lock predicate | `cluster_unlocked()` (`0004:29-35`): `introductions_completed_at IS NOT NULL` |
| Chat RLS + RPC | `messages` read/insert require `is_active_member AND cluster_unlocked` (`0004:37-47`); `send_message()` raises `chat_locked` otherwise (all bodies listed above) |
| Posts/social | `0072_posts_schema.sql:86-99,118` + every posts RPC (`0073`, `0077`, `0079`, `0080`, `0081`, `0082`, `0098`, `0099`, `0106`, `0138`, `0139`): same `is_active_member AND cluster_unlocked` guard |
| Profiles | `get_member_profiles()` masks `avatar_url/bio=NULL` until unlocked (`0004:89-94` → `0047` → `0048`); `get_candidate_profiles()` same (`0023:77-89`); `intro_answers` readable by fellow members only after unlock (`0003:102-113`) |
| Completion | `submit_intro_answers()` (`0045`, live `0054:181-234`): upsert answers, require 5 rows, set own `intro_completed_at`; if `status='introductions'` and all active complete → `status='active'`, stamp `introductions_completed_at`, fan out `unlocked` |
| Deadline/removal | `check_intro_deadlines()` (`0136:137-177`): past-deadline `introductions` clusters lose every `intro_completed_at IS NULL` member (`left_at=now()`), then `start_replacement()`; unlock if remainder all complete |
| Replacement join | `accept_invitation()` extends `introductions_deadline` only `WHERE status='introductions'` (`0014:260-265`) |
| Routes | `/cluster/:clusterId/introductions` (`IntroductionsPage.tsx`), `/cluster/:clusterId/waiting` (`WaitingForOthersPage.tsx`), `/cluster-created`, all under `RequireActiveAccount+RequireSessionRole(member)+RequireOnboarded+AppShell` (`router.tsx:161-194`) |
| Redirects | `ClusterLayout.tsx:67-75`; `IntroductionsPage.tsx:44-55`; `WaitingForOthersPage.tsx:49-55` (with 3s `cluster.refetch()` loop guard against stale-cache redirect loops, lines `24-31`) |
| Cards/links | `ClusterCard.tsx:26-35` + `MemberClusterCard`, `ModePanel InClusterCard:78-87`, `PostsFeedPage.tsx:108,179-189`, `notificationTarget()` `cluster_formed → /introductions` (`notifications.ts:342`) |
| Signals/calls | NOT intro-gated today: `signals` RLS requires only `is_active_member` (`0005_signals.sql:27-44`, `0022`, `0054:78-84`); `calls`/`call_participants` require only `is_active_member` (`0107`–`0111`). They are unreachable in practice only because the UI never lets a locked member into the room. Votes RLS likewise requires only membership (`0007:56-69`, `0044`); `start_replace_vote`/`start_name_vote`/`vote_on` check membership/open, not unlock |
| Mobile | `mobile/app/(app)/cluster/[clusterId]/introductions.tsx` (submit → `waiting`), `waiting.tsx` (10s `useIntroProgress` poll + 3s refetch guard + `useFocusEffect` router priority), `cluster-created.tsx`, `home.tsx`, plus shared `mobile/src/features/introductions.ts` |

### 1.3 Current replacement flow (kept)

`leave_cluster()` → `start_replacement()` (supersede in-flight → new `selecting_candidates` → `source_candidates()`) → `inviting` → `create_invitation()` → `accept_invitation()` → round `filled` (or `decline/expire` → `advance_round_on_invitation_void()` → re-source) → `progress_replacements()` retries empties; `pool_exhausted` after `attempts>=5` (immediate) or `attempts>=5 AND created_at<now()-14d` (sweep). Eligibility (`fn_candidate_eligible` + identical inlined joins in `0141:56-108`): onboarded, no active same-mode membership, no active cooldown, not in `declined_user_ids`. Cooldowns: 30d default (`0014:38-40`), `open_mix` 7d via `fn_cooldown_interval()` (`0132`). Invitation TTL 72h (`0007:47`), cron `invite-expire */30`. All of this is **preserved**; only the pool→vote branch changes (next section).

### 1.4 Current candidate-selection voting flow (to remove)

1. `source_candidates()` pool `>= 2` → round `voting`, `candidate_pool uuid[≤3]`, `select_candidate_vote_id` → new `votes(select_candidate, closes_at=now()+48h)`, fan out `replacement` (`Candidates are up for selection`), `0141:137-153`.
2. `vote_on(vote_id, candidate_user_id)` validated against pool, `0023:32-40`, rate-limited in `0138`.
3. `VotesView.tsx ActiveVoteCard` (`394-442`): candidate cards from `useReplacementCandidates(round.id)`, shown only when `round.status==='voting' && round.select_candidate_vote_id===vote.id` (`186-188`); one-shot (`disabled myChoice!==null`, `409`); quorum line `cast/quorum` with `quorum=floor(members/2)+1` (`75`).
4. `ReplacementBanner` `voting` copy (`334-340`): `Candidate selection in progress / Cast your vote below.` `selecting_candidates` copy references hourly checks (matches `replacement-progress */60`); `inviting` copy shows invitee name.
5. `close_expired_votes()` `select_candidate` branch (`0136:92-119`): quorum `cast>=quorum` → plurality winner (`ORDER BY count(*) DESC, min(created_at)`), round `inviting` + `create_invitation()`; else `no_quorum` → `selecting_candidates` + re-source. Writes `result.outcome = <winner-uuid>|none|no_quorum`, fans out `vote_result`.
6. `PastVoteCard` (`475-566`): uuid-regex `passed` detection (`485`), `Selected` chip, `X was selected.` copy.
7. Expiry/cleanup: vote TTL 48h (`0007:11`), cron `vote-close */10` (`0015`, batched `0136:36-135` with `votes_open_due_idx`), round sweep `attempts>=5 +14d → closed` inside `progress_replacements()`.
8. Notifications: `vote_started` (governance only, note `source_candidates` does **not** emit `vote_started` for candidate votes, only `replacement`), `vote_result` on every close (incl. candidate votes), `replacement` for candidate-ready + new-member-joined. Prefs gate: candidate paths share `prefs.votes` (`0024:30`).
9. Realtime: `votes` + `replacement_rounds` publication (`0023:7-13`); `useClusterChannel` votes INSERT→patch `cluster-votes` + invalidate `vote-counts`, rounds INSERT/UPDATE→invalidate `replacement-round`/`replacement-candidates` (`realtime.ts:280-366`); mobile pinned copy identical.
10. Tests: `tests/integration/governance.test.ts` (candidate sourcing S-06, `voting` + `candidate_pool[3]` + `select_candidate_vote_id`, quorum/timer/expiry, decline/expire chains), `src/features/votes.test.tsx`, `src/pages/cluster/VotesView.test.tsx`, `MembersView.test.tsx`, `mobile/.../votes.tsx` (no dedicated unit file; shares `mobile/src/features/votes.ts`).

---

## 2. Target behavior

### 2.1 New formation flow

1. 8 eligible people match → `maybe_form_cluster()` inserts `clusters(status='active', introductions_completed_at=now(), introductions_deadline=NULL)` and 8 `cluster_members(intro_completed_at=NULL)`.
2. All 8 immediately open `/cluster/:id` (room). No redirect to `/introductions` or `/waiting`.
3. Chat (`send_message`), posts/composer, calls (`calls` RPCs), signals, votes/governance, members list with full avatars/bios, and notifications all work immediately because `cluster_unlocked()` is true from row creation.
4. `cluster_formed` notification copy changes from `Complete your introductions within 72 hours.` to an open-room message; its deep-link becomes `/cluster/:id` (not `/introductions`).
5. Introduction questions (`get_intro_questions()`) remain answerable at any time via `submit_intro_answers()`; each submission still stamps the member's own `intro_completed_at` and remains visible per `intro_answers` RLS (now readable immediately since the cluster is unlocked). Incomplete intros never block, never remove, never extend deadlines (there is no deadline on new clusters).
6. An intro checklist/nudge lives **inside** the cluster (e.g. a dismissible room banner or members-tab progress strip fed by the retained `get_intro_progress()`), not as a gate.
7. User-visible states after the change:
   - `Your cluster is ready → Open your cluster` (no deadline, no `Start introductions`).
   - Room shows an optional `Complete your introductions (X of 8)` nudge until the viewer (or the cluster) finishes; everything else is fully interactive.
   - `Posts unlock after introductions` empty-state disappears.
   - `Introductions in progress / Waiting for the others / Complete your introductions` card copy disappears; cards show `Active`.

### 2.2 New replacement flow

1. Vacancy (`leave_cluster`, vote-pass removal, ban/delete, unchanged) → `start_replacement()` → `source_candidates()` as today (same eligibility, same `queue_key`-first then top-up ordering).
2. If pool empty → `selecting_candidates`, retry via `progress_replacements()`; close `pool_exhausted` as today.
3. If pool non-empty (1 **or** ≥2) → deterministically invite `candidate_pool[1]`, defined as the longest-waiting eligible candidate because both SELECTs are `ORDER BY queue_entries.joined_at` (`0141:77,104`). Set `status='inviting'`, `invited_user_id`, **`candidate_pool=[v_pool[1]]` (locked: single-element, not the full pool)**, `select_candidate_vote_id=NULL`, then `create_invitation()` (unchanged, 72h TTL, `invitation_received` notification).
4. Decline/expire → existing `advance_round_on_invitation_void()` → re-source → next longest-waiting candidate (single-element pool rewritten each cycle; `declined_user_ids` exclusion prevents re-invite loops). No fanfare, no vote, no `Candidates are up for selection` broadcast. Failed `accept_invitation` (became ineligible) keeps current behavior: RPC error to the invitee, round stays `inviting`, no auto-advance (locked, out of scope).
5. Continuous refill until 8 (locked invariant): accepting a replacement while still below 8 immediately chains the next cycle; a departure landing while a round is already in flight does not supersede it; the accept-chain recount covers the extra vacancy (8→7→8, 8→6→7→8). At most one pending invitation per cluster at a time; `progress_replacements()` safety-net restarts refill for under-8 clusters with no active round and no pending invitation (e.g. after `pool_exhausted`). See §3.2 for exact RPC mechanics.
6. User-visible states: `Finding replacement candidates` (empty pool) and `Invitation sent / Waiting for X to respond` remain; `Candidate selection in progress / Cast your vote below` and every candidate ballot disappears. Governance (`Replace a member`, `Suggest a cluster name`, yes/no cards, quorum, past-vote history) is pixel-identical.

---

## 3. Database / RPC changes

All changes are `CREATE OR REPLACE` / new migration(s); **never edit an applied migration** (repo rule, `AGENTS.md`). Security model stays `security definer` + grants + RLS; no new tables.

### 3.1 Migration A, open at 8 (formation + intro retirement)

1. **`maybe_form_cluster()`** (`0011` body): change the `INSERT clusters` to `(status='active', introductions_completed_at=now(), introductions_deadline=NULL)`. Update the `cluster_formed` notification `body` to an open-room message (e.g. `Your cluster is open. Say hello.`). Everything downstream (`cluster_unlocked`, RLS, `send_message`, posts, `get_member_profiles` unmasking, `get_my_clusters`) then works with no further edits.
2. **`submit_intro_answers()`** (live body `0054:181-234`): keep upsert + 5-row → own `intro_completed_at` marking; **delete** the unlock block (lines `213-233`: `if status='introductions' → count → stamp → unlocked fan-out`). Retain `assert_account_can_write()` and rate-limit wiring (`0138`). No grant change.
3. **`check_intro_deadlines()`** (live body `0136:137-177`): replace body with `RETURN` + comment (locked: legacy rows are backfilled in the same migration, §8, so there is nothing left to scan). Do NOT drop the function (cron references it until unscheduled below).
4. **`accept_invitation()` deadline extension** (`0014:260-265`): delete the `introductions_deadline` bump (deadlines no longer exist; legacy rows are backfilled to `active` so the `WHERE status='introductions'` arm is dead).
5. **Cron (locked):** `select cron.unschedule('intro-deadline')` in the same migration; keep the no-op function body for idempotent replay.
6. **Backfill (locked, silent, same migration, before/after function rewrites, order is irrelevant since new bodies never touch `status='introductions'` rows):** `UPDATE clusters SET status='active', introductions_completed_at=now(), updated_at=now() WHERE status='introductions'`. Keep every `cluster_members.intro_completed_at` value as checklist progress. Emit **zero** `unlocked` notifications.
6. **Indexes**: no change required. `clusters_intro_deadline_idx WHERE status='introductions'` (`0136:32-33`) becomes write-dead for new rows; leave it (harmless, serves legacy scan if retained).
7. **Explicitly NOT changed**: `cluster_unlocked()` definition, `messages`/`posts`/reaction/read RLS policies, `send_message()` guards, `get_member_profiles()` masking logic, `intro_answers` RLS, `is_active_member()`, `fn_queue_key`/`fn_mode_label`, `join_queue`/`leave_queue`, `get_my_clusters()` shape, `mode_cooldowns`, `notification_allowed()` (except §6), grants in `0017`/`0127`. RLS/security implication: new clusters expose messages/profiles/answers immediately to the 8 members, which is the requested behavior; no policy widens access to non-members.

### 3.2 Migration B, deterministic replacement (remove candidate vote)

1. **`source_candidates()`** (live body `0141`): replace the tail (`124-153`) so any non-empty pool takes the current single-candidate path: set **`candidate_pool = ARRAY[v_pool[1]]` (locked)**, `status='inviting'`, `invited_user_id=v_pool[1]`, `select_candidate_vote_id=NULL`, then `create_invitation()` + `RETURN`. **Delete** the `voting` update, the `votes(select_candidate)` insert, the `v_active` count, and the `Candidates are up for selection` fan-out. Keep the empty-pool/retry/`pool_exhausted` head (`110-122`), advisory lock, `attempts` increment, and both eligibility SELECTs byte-for-byte (they already implement longest-waiting-first via `ORDER BY joined_at`).
2. **`close_expired_votes()`** (live body `0136:36-135`): **delete** the `elsif v_vote.type='select_candidate'` branch (`92-119`). Keep `replace_member` + `change_name` byte-for-byte, plus the advisory lock, `LIMIT 100 SKIP LOCKED`, `WHERE status='open'` guard, and `vote_result` fan-out (now governance-only). One-shot cutover rows (locked, same migration, §8) close any open candidate votes independently of this function, so no transitional branch is kept.
3. **`vote_on()`** (live body `0023:19-45` + rate limits `0138`): reduce to the `replace_member|change_name → yes|no` check; **delete** the `select_candidate` pool-membership check (`32-40`). Keep `vote_not_available` and upsert semantics.
4. **Continuous refill mechanics (locked):**
   - `leave_cluster()`: after `left_at` + cooldown + departure notice, start a replacement **only if no active round** (`selecting_candidates`/`inviting`; `voting` is dead) exists for the cluster; otherwise do nothing, since the accept-chain below covers the extra vacancy. `start_replacement()` keeps its supersede body as a safety net for the remaining explicit callers (governance-vote-pass, moderation/ban/delete), but `leave_cluster` no longer triggers supersede-orphaning of a pending invitation.
   - `accept_invitation()`: inside the existing `replacement:<cluster>` advisory lock, after the current `accepted` + member-insert + round-`filled` steps, add a defensive recount **before** insert. If active members are already `>= 8`, raise `cluster_full` instead of inserting (protects against legacy orphans/races; never triggers in the sequential flow). After insert, recount again; if still `< 8` **and** no other active round exists, call `start_replacement()` immediately for the next cycle (same lock, sequential, the just-filled round is terminal, so at most one pending invitation ever exists).
   - `progress_replacements()`: keep the existing `selecting_candidates` re-source loop + `pool_exhausted` sweep, and add a bounded safety-net scan (`ORDER BY ... LIMIT 100 FOR UPDATE SKIP LOCKED`, same pattern as `0136`): active (`status='active'`) clusters with `< 8` active members, no active round, and no `pending` invitation → `start_replacement()`. This is what makes the invariant continuous across `pool_exhausted` closures and crash windows. No new cron schedule; reuse `replacement-progress */60`.
   - Decline/expire/`advance_round_on_invitation_void()`: unchanged (same-round re-source). Failed accept (ineligible): unchanged, no auto-advance (locked).
4. **States/columns**: retain `vote_type='select_candidate'`, `replacement_status='voting'`, `replacement_rounds.candidate_pool`, `select_candidate_vote_id`, `declined_user_ids`, `attempts`, `invitations` columns. Rationale: existing rows reference them; dropping enum values requires a rewrite of `votes`/`replacement_rounds` and a `get_replacement_round()` shape change. They become write-dead (no new `voting` rounds, no new `select_candidate` votes, `select_candidate_vote_id` always NULL going forward). A later cleanup migration may drop them after the legacy backfill window, out of scope here.
5. **Triggers/indexes**: none. `votes_open_due_idx`, `replacement_rounds_status_idx`, `invitations_pending_expires_idx` (`0136:23-30`) stay valid and now serve governance-only traffic.
6. **RLS/security**: no policy changes. `votes`/`vote_responses`/`replacement_rounds`/`invitations` policies (`0007:56-78`, `0044`) and all `GRANT authenticated` entries stay. `get_replacement_round()` still returns only active rounds to members; its `voting` arm simply stops matching new rows. `get_candidate_profiles()` is retained for legacy display but new rounds expose a single invitee (or nothing, frontend stops calling it; see §4).

### 3.3 What is deliberately retained

`fn_candidate_eligible()`, both `0141` eligibility SELECTs, cooldown intervals (`30d` / `open_mix 7d`), `already_in_cluster_of_mode`, `fn_quorum()`, `start_replacement()` supersede logic, `create_invitation()` / `accept_invitation()` / `decline_invitation()` / `expire_invitations()` / `advance_round_on_invitation_void()` / `progress_replacements()`, invitation TTLs, all notification pref plumbing except copy/target tweaks in §6, and the full governance vote path.

---

## 4. Frontend changes (web)

### 4.1 Change 1, remove gating, keep intros as checklist

| File | Change |
|---|---|
| `src/app/layouts/ClusterLayout.tsx:65-75` | Delete both redirects (`!introductions_completed_at → /waiting`; `!intro_completed_at → /introductions`). The shell renders `Outlet` for every active member. Keep the `!cluster.data \|\| !membership.data` unavailable state |
| `src/app/router.tsx:188-189` | Keep both routes mounted for compatibility. `/introductions` stays as the unblocked answer form. `/waiting` (locked decision) stays mounted but immediately redirects to `/cluster/:id` (room), it must not represent an active lifecycle state, hold no polling logic, and receive no new links. Do NOT delete the routes in this change |
| `src/pages/IntroductionsPage.tsx:44-55,83-90,143-147` | Remove the post-submit bounce to `/waiting`; after save, navigate to `/cluster/:id`. Keep the 5-question form + `useSubmitIntroAnswers`. Update copy: `This room is already open. Answer below…` becomes the only copy (delete the `Chat unlocks once everyone answers. Deadline:` branch) |
| `src/pages/WaitingForOthersPage.tsx` | Locked: convert to a compat redirect. If `cluster.data` loads, `Navigate to=/cluster/:id` (room); keep the unavailable-cluster state. Delete both gating `Navigate` guards (`49-55`), the 3s refetch-loop guard (`24-31`), the `useIntroProgress` poll, progress list, and deadline copy from this route. The intro checklist lives as a new in-room `IntroChecklist` component fed by `useIntroProgress` (10s poll retained there) |
| `src/components/ClusterCard.tsx:26-35,57-81` + `MemberClusterCard:87-95` | `pending/needsIntros/waitingOnOthers` collapse to `target=/cluster/:id`; status copy becomes `Active`/`Archived`. `useMyMembership` still useful for the checklist nudge but not for routing |
| `src/pages/discovery/ModePanel.tsx:70-128` (`InClusterCard`) | Same collapse: `needsIntros/waitingOnOthers → target=/cluster/:id`, copy `You’re already in an active cluster`. Delete `CountdownTimer(deadline)` + `chat is locked until everyone answers` |
| `src/pages/posts/PostsFeedPage.tsx:107-108,173-189` | Delete `isLocked` and the `Posts unlock after introductions → /waiting` empty state; always render `PostComposer` for members |
| `src/pages/HomePage.tsx:166-192` | Banner copy: `Eight of you were matched. Complete intros within 72 hours to unlock chat.` → open-room copy; keep `CountdownTimer` only if legacy rows still exist, else drop. `formedDeadline` lookup (`81-87`) can go once deadlines are NULL |
| `src/pages/ClusterCreatedPage.tsx:72-88,131-137` | Copy `Complete your introductions within 72 hours to unlock the chat` → open-room copy; CTA `Start introductions → /introductions` becomes `Open your cluster → /cluster/:id` (with a secondary `Answer the intro questions` link) |
| `src/components/WhatsNextSteps.tsx:41-59` | Rewrite the 2nd/3rd bullets (`72 hours … or you’ll lose your spot`, `Chat unlocks once everyone answers`) → `Your cluster opens immediately` + `Answer the 5 intro questions when you’re ready` |
| `src/features/notifications.ts:342` | `cluster_formed → /cluster/:id/introductions` becomes `/cluster/:id` |
| `src/features/introductions.ts` | Keep all four hooks (`useCluster`, `useMyMembership`, `useIntroQuestions`, `useIntroProgress`, `useSubmitIntroAnswers`), which power the checklist. `useIntroProgress` 10s poll stays (or moves behind the nudge component) |
| `src/features/matching.ts` | No logic change; `useMyClusters` still surfaces `status/introductions_*` for legacy rows |
| `CountdownTimer` usages tied to `introductions_deadline` (`ClusterCreatedPage:84`, `IntroductionsPage:88`, `WaitingForOthersPage:76`, `ClusterCard:64,74`, `ModePanel:108`, `HomePage:185`) | Remove for new clusters (deadline NULL). Keep the component itself (still used by `VotesView:390` vote TTL and invitation expiry) |
| `src/pages/cluster/room/VoteRow.tsx`, `ClusterRail.tsx`, `MembersView.tsx:37-52` | No gating change; `MembersView` spot-open banner stays (still accurate during refills) |

New/changed UI state: a single in-cluster intro nudge (banner or members-tab strip): `You’ve answered X of 5 · N of 8 members finished` with a link to the intro form. Reuses `useIntroProgress` + `useMyMembership`; dismissible per viewer; never blocks.

### 4.2 Change 2, remove candidate voting UI

| File | Change |
|---|---|
| `src/pages/cluster/VotesView.tsx` | Delete `VOTE_TYPE_LABEL.select_candidate` (`28-32`); delete `roundVoting` (`129`), `showCandidates` (`186-188`), candidate branch of `ActiveVoteCard` (`394-442` incl. `vote_on(vote.id, c.user_id)`, quorum line, `Candidates are being prepared` fallback); simplify `ReplacementBanner` (`288-346`) to two states (`selecting_candidates`, `inviting`), update `selecting_candidates` copy (`we check hourly` still true via `replacement-progress */60`); simplify `PastVoteCard` (`475-566`): drop uuid-`passed` regex (`485`), `Selected` chip, winner copy; keep yes/no tallies. `useReplacementCandidates` import + `candidates` query (`43`) removed (or left unused only if legacy display is kept, prefer removal) |
| `src/features/votes.ts` | Keep `useClusterVotes`, `useClusterVoteResponses`, `useVoteCounts`, `useReplacementRound`, `useStartReplaceVote`, `useStartNameVote`, `useVoteOn` (governance yes/no), `useMyPendingInvitations`, `useAcceptInvitation`, `useDeclineInvitation`, `parseVoteResult`. Remove or deprecate `useReplacementCandidates` + `CandidateProfile` export once no caller remains. `ReplacementRound` type stays (shape unchanged). No frontend change for continuous refill, chaining is server-side; existing `replacement-round` invalidation already surfaces chained rounds |
| `src/pages/cluster/room/VoteRow.tsx` | `Replace/Choose a new member` link stays (governance entry point); any candidate-specific copy goes |
| `src/components/ClusterRail.tsx:114` | `Open votes` rail stays; it will simply never list candidate votes again |
| `src/pages/cluster/MembersView.tsx:37-52` | Spot-open banner stays (still true while `get_replacement_round()` returns a round); copy `finding a new member` remains accurate |
| `src/pages/HomePage.tsx:108-154` | Invitation accept/decline cards unchanged (core refill UX) |
| `src/features/realtime.ts:280-325` | Keep votes + rounds subscriptions (governance + refill status still live). The `replacement-candidates` invalidation (`323`, `364`) can be dropped with the hook; harmless to keep during transition |
| `src/features/notifications.ts:335-342` | `vote_started|vote_result|replacement → /cluster/:id/votes` stays (governance + refill updates still land there); `invitation_received → /home` stays |

Obsolete UI: candidate ballot cards, `Candidate selection in progress` banner state, `Choose a new member` vote titles (open + historical display, history rows remain in DB and render under a generic label until §8 backfills them), `Candidates are being prepared. Vote will open shortly.` fallback.

---

## 5. Mobile changes

Parity is required (`mobile/README.md`; `mobile/scripts/sync-db-types.mjs` copies `database.types.ts` + shared `src/lib`/`src/features` modules; never hand-edit generated copies).

| File | Change |
|---|---|
| `mobile/src/features/introductions.ts`, `matching.ts`, `votes.ts`, `notifications.ts`, `realtime.ts` (pinned, hand-reconciled) | Regenerate via sync script after web changes; hand-apply the `realtime.ts` equivalent of §4.2 (drop `replacement-candidates` invalidation) |
| `mobile/app/(app)/cluster/[clusterId]/introductions.tsx:33-41,63-69` | Same as web `IntroductionsPage`: remove bounce to `waiting`; post-submit → `room`; open-room-only copy |
| `mobile/app/(app)/cluster/[clusterId]/waiting.tsx:27-48,70-80` | Locked: same compat redirect as web, resolve to `room` via `router.replace` once loading settles; strip the progress poll/guards. Update `useFocusEffect` router priority accordingly |
| `mobile/app/(app)/cluster/[clusterId]/votes.tsx` | Full port of web `VotesView` edits: delete candidate cards, `ReplacementBanner` voting state, `PastVoteCard` selected-state; remove `useReplacementCandidates` query + pull-to-refresh entry (`61-73`); note mobile uses `useClusterVoteResponses` for counts where web uses `useVoteCounts`, both stay governance-only |
| `mobile/app/(app)/cluster/[clusterId]/members.tsx:27` | Keep spot-open banner (same as web) |
| `mobile/app/(app)/cluster/[clusterId]/room.tsx`, `settings.tsx`, `signals/*`, `call.tsx` | No gating change needed (they already assume membership-only; the lock was enforced upstream by routing, same as web) |
| `mobile/app/(app)/home.tsx:67`, `cluster-created.tsx`, `mode/[modeId].tsx`, `queue/[queueId].tsx`, `clusters.tsx`, `posts.tsx`, `notifications.tsx:44` | Same copy/link updates as web (`Start introductions` → `Open your cluster`, deadline removal, `replacement` icon stays for refill updates) |
| `mobile/src/components/*` (`ModePanel`, `QueueCard`, `ClusterCard`, `CountdownTimer` equivalents) | Same collapse as §4.1 |

---

## 6. Notifications / realtime

### Can be removed (candidate-voting-specific)

- `source_candidates()` fan-out: `replacement / Candidates are up for selection / Review and vote…` (`0141:149-153`).
- `close_expired_votes()` `vote_result` rows whose `result.outcome` is a candidate uuid / `none` / `no_quorum`, disappears with the branch deletion (governance `vote_result` rows continue).
- No `vote_started` was ever emitted for candidate votes (only governance `start_replace_vote`/`start_name_vote` emit it), so nothing to remove there, confirm during implementation by grepping `vote_started` inserts.
- Web/mobile `ReplacementBanner` `voting` state + `ActiveVoteCard` candidate quorum line + `replacement-candidates` query invalidation (`realtime.ts:322-324,362-365` and mobile pinned copy).

### Becomes unnecessary

- `useReplacementCandidates` / `get_candidate_profiles()` calls for new rounds (retain the RPC for legacy display + audit).
- `votes` realtime INSERT/UPDATE traffic for `select_candidate` rows (channel itself stays for governance).
- `CountdownTimer(vote.closes_at)` on candidate cards (governance cards keep theirs).

### Must remain

- `cluster_formed` (new copy + `/cluster/:id` target), `unlocked` (legacy rows only; no new fan-out after `submit_intro_answers` simplification), `invitation_received` → `/home`, `replacement` for `leave_cluster` departure notice (`0026`), new-member-joined (`0014:271-274`), and empty-pool states, `vote_started`/`vote_result` for `replace_member`/`change_name`, prefs keys `votes` + `invitations` (`0024:30-31`, `PREF_LABELS`), `user:${userId}` channel (`notifications` + `invitations` INSERT), `cluster:${clusterId}` channel (votes/rounds/members/messages/posts/calls), invitation 30s poll fallback (`votes.ts:189`), `queue_update` `pg_notify` path.

---

## 7. Tests

### Unit / component (Vitest, jsdom, `src/**/*.{test,spec}.{ts,tsx}`; hard v8 gate, never lower thresholds)

- `src/components/ClusterCard.test.tsx:51-114`: pending → `/introductions` / `/waiting` cases become `→ /cluster/:id` + `Active`; update fixtures (`introductions_completed_at: null` + `status='introductions'` now renders active-room link).
- `src/pages/posts/PostsFeedPage.test.tsx:45-86`: locked-fixture (`introductions_completed_at: null`) now renders composer + posts, not the waiting link.
- `src/pages/cluster/VotesView.test.tsx`, `src/features/votes.test.tsx`: delete candidate-ballot cases; add regression: no `select_candidate` card renders even when a legacy `voting` round exists (or round hidden per §8 display rule); governance yes/no + quorum cases unchanged and expanded as the anti-regression anchor.
- `src/features/introductions.test.tsx`, `matching.test.tsx`, `ClusterCreatedPage`/`HomePage`/`ModePanel` tests: update copy/link expectations (no deadline, no `/introductions` CTA).
- Mobile: no dedicated votes unit file, cover via web tests + manual parity checklist + `sync-db-types --check`.

### Integration (`tests/integration/`, requires `supabase start`; sequential, 20s timeouts)

- `matching.test.ts`: formation assertion changes, 8× `join_queue` now yields `clusters(status='active', introductions_completed_at NOT NULL, introductions_deadline NULL)`, 8 members, 0 queue rows, 8 `cluster_formed` notifications (new body). `get_my_clusters.member_count` unchanged.
- `intro-social.test.ts`: rewrite. `submit_intro_answers` partial (<5) still leaves `intro_completed_at NULL` but cluster already `active`; full completion by all 8 changes nothing at cluster level and emits zero `unlocked`; `check_intro_deadlines()` is a no-op (explicit test: backdated deadline + incomplete intros → no `left_at`, no round). Backfill test (locked): seed `status='introductions'` rows with mixed `intro_completed_at`, run the migration backfill, assert `active` + stamped, `intro_completed_at` preserved, zero `unlocked` notifications.
- `governance.test.ts`: candidate-sourcing S-06 block rewritten. 2–3 eligible now yield `status='inviting' + invited_user_id = oldest joined_at + candidate_pool=[that user] + invitations[pending]`, `select_candidate_vote_id NULL`, zero `votes(select_candidate)`; decline → next-oldest (single-element pool rewritten); expire → next; quorum tests (`fn_quorum q8=5`) stay but apply to governance only; `invalid_choice` for candidate-uuid choices now asserts rejection on governance votes; longest-waiting determinism test (staggered `joined_at` → first invite is earliest). Cutover test (locked): seed an open `select_candidate` vote + `voting` round, run the cutover, assert vote `closed` (outcome `superseded`), round back to `selecting_candidates` with `invited_user_id NULL`, then next `source_candidates()` invites deterministically with zero new candidate votes.
- Continuous-refill tests (locked, new, the invariant is **active clusters return to 8**): (a) 8→7→8: leave → `inviting` → accept → `filled`, count 8, no further round; (b) 8→6→7→8: two leaves before any accept → still exactly one active round and one pending invitation (no supersede-orphan) → first accept → count 7 → chained second round exists → second accept → 8 `filled`; (c) departure during `inviting`: leave → active round unchanged (same `id`, same invitee), accept → chain covers both vacancies; (d) `cluster_full` guard: force count to 8 with a stale pending invitation (legacy orphan) → `accept_invitation` raises, no 9th member; (e) safety net: close a round `pool_exhausted` while under 8 with no pending invitation → `progress_replacements()` starts a fresh round.
- `account.test.ts:166-200`, `discovery.test.ts`, `rls.test.ts`, `rbac.test.ts`, `restore-reopen.test.ts`: update where they assume locked formation clusters or candidate votes; add RLS assertions that new-cluster messages/posts/answers are member-readable immediately and still invisible to non-members.

### E2E (Playwright, `e2e/`, seeded `diya@demo.example / sensor123` in Aurora)

- No dedicated formation/intro/replacement spec exists today (`golden-path.spec.ts`, `cluster-room.spec.ts` assume unlocked Aurora). Add: (1) queue → 8th join → room renders composer/members/signals/votes immediately (no `/introductions`, no `/waiting`, and direct navigation to `/waiting` lands on the room); (2) intro nudge → answer 5 → checklist clears, room never locks; (3) member leaves → `A spot just opened` → invitee accepts → 8 again, with zero candidate ballots; (4) double departure → two sequential accepts → 8 (continuous-refill invariant); governance vote still passes through yes/no → rename/remove.

### Governance non-regression anchor

`close_expired_votes` replace/name pass+fail paths, `vote_on yes|no`, `fn_quorum`, `vote_result` fan-out, 48h TTL + `vote-close */10` batching, and the full `VotesView` governance UI must have unchanged passing coverage before and after. Any shared helper touched by Migration B (`vote_on`, `close_expired_votes`) gets a governance-only test run as a verification gate (§10).

---

## 8. Migration / rollout considerations (locked decisions applied)

- **Existing active clusters** (`status='active'`): untouched by the backfill (predicate matches `status='introductions'` only). Replacement on them uses the new deterministic + chained path once Migration B ships.
- **Existing introduction-gated clusters** (locked §D1): one-shot silent backfill in Migration A, `UPDATE clusters SET status='active', introductions_completed_at=now(), updated_at=now() WHERE status='introductions'`. Per-member `intro_completed_at` values are preserved as checklist progress. Zero `unlocked` notifications. After this statement no `status='introductions'` row remains, so `check_intro_deadlines()` (no-op) and `accept_invitation()` (deadline arm deleted) have nothing legacy to handle.
- **Existing replacement rounds, one-shot cutover (locked §D2, same Migration B, ordered):** (i) rewrite `source_candidates()` / `close_expired_votes()` / `vote_on()` first; (ii) close every open `votes(type='select_candidate', status='open')` as `status='closed', result=<existing tallies> || {outcome:'superseded'}` with **no** `vote_result` fan-out for these rows (the outcome is an internal migration marker, not a community result); (iii) for each round pointing at a now-closed candidate vote (`status='voting'`): reset to `status='selecting_candidates', candidate_pool='{}', invited_user_id=NULL, select_candidate_vote_id=<kept for audit>, updated_at=now()`, then call the **new** `source_candidates()` so the deterministic path takes over immediately. `selecting_candidates`/`inviting` rounds without a candidate vote continue untouched (next re-source invites deterministically). Pending `inviting` invitations stay valid and are never orphaned by the cutover.
- **Existing candidate-selection votes (closed history):** rows remain (audit + `vote_responses` FK). Display rule (locked with §D2): `VotesView`/`PastVoteCard` never renders an open candidate ballot again; closed legacy rows render under a generic non-interactive label (no quorum line, no winner CTA) or are hidden by a `type != 'select_candidate'` filter, implementer picks hiding (preferred, fewer branches) since §D2 guarantees no new ones.
- **Continuous-refill rollout:** the chained `accept_invitation()` + guarded `leave_cluster()` + `progress_replacements()` safety net ship together in Migration B (not staggered). No parallel-invitation window: chaining happens under the existing advisory lock, and `leave_cluster` no longer supersedes an in-flight round.
- **Invitations**: pending invitations stay valid across both migrations (untouched table + TTL + cron).
- **Seed/demo**: `npm run seed:demo` + Aurora fixtures assume the intro flow (`ClusterCreatedPage`, `WhatsNextSteps`, e2e `cluster-room` expectations of `No open votes`). Update seed copy and e2e selectors together; `data-e2e="whats-next-steps"` / `home-cluster-ready-banner` selectors may need new copy but stable attributes.
- **Realtime/publication**: no publication change, so no `supabase stop && supabase start` realtime pickup dance is needed (that restart is only required after realtime-migration changes per `AGENTS.md`; none are proposed).
- **`database.types.ts` + mobile copies**: regenerate after migrations land (`mobile/scripts/sync-db-types.mjs --check` in pre-push); no hand-edits.

---

## 9. Risks / edge cases

| Risk | Analysis / mitigation |
|---|---|
| Concurrent 8th joins double-form | Already handled: `maybe_form_cluster()` holds `pg_advisory_xact_lock('cluster:mode:key')` per `(mode,key)`; new body keeps the lock. No change. |
| Two members leave (7→6 or 8→6) | **Locked (continuous refill):** no longer a gap. `leave_cluster()` with an active round does not supersede; the second vacancy waits. `accept_invitation()` recounts and chains the next `start_replacement()` while still `< 8`. `progress_replacements()` safety-net covers `pool_exhausted`/crash windows. Exactly one pending invitation at a time; 8→6→7→8 verified by integration tests (b) + (c). |
| Candidate declines / invitation expires | Unchanged path: `advance_round_on_invitation_void()` appends `declined_user_ids` and re-sources (single-element pool rewritten) to the next longest-waiting candidate. Deterministic order + exclusion list prevents re-invite loops. In a multi-vacancy chain, decline only delays the current cycle; the recount after the eventual accept still covers remaining vacancies. |
| Candidate becomes ineligible between sourcing and accept | **Locked (§D5):** current behavior preserved; `accept_invitation()` raises (`already_in_cluster_of_mode` / `not_yours` / `already_responded`), round stays `inviting`, no auto-advance. Out of scope; documented, not fixed. |
| Cluster reaches 8 while another operation is running / overshoot to 9 | **Locked:** prevented by construction plus a new guard. Sequential design means a second pending invitation is never created (leave-during-flight doesn't source; chaining only fires when `< 8` with no active round). Defense in depth: `accept_invitation()` recounts under the advisory lock and raises `cluster_full` at `>= 8` instead of inserting (covers pre-migration orphan invitations and races). Integration test (d) pins this. |
| Duplicate / orphan invitations | `create_invitation()` still inserts without a pending-exists check (pre-existing), but orphans are now structurally avoided: `leave_cluster` no longer supersedes an `inviting` round, and the cutover (§8) never orphans pending invitations. Legacy superseded-round orphans that still accept hit the `cluster_full` guard or fill a genuine vacancy. Monitor via `invitations_pending_expires_idx`. |
| Chained `start_replacement` recursion / lock re-entry | `accept_invitation()` already holds `pg_advisory_xact_lock('replacement:' || cluster)`; `start_replacement()` takes the same xact-scoped lock, which is re-entrant-safe (same transaction), and the chained call runs before commit so the count it sources from includes the just-inserted member. Chain depth is bounded by vacancies (≤8). Same pattern (RPC calling RPC under lock) already exists: `leave_cluster → start_replacement → source_candidates`. |
| Longest-waiting fairness vs match quality | Branch 1 (same `queue_key`) already precedes top-up, and both are `ORDER BY joined_at`. Deterministic pick = best-match + longest-waiting combined. `open_mix` (single key `'open'`) is pure FIFO. No new ordering key needed, `queue_entries.joined_at` + `queue_entries_ready_idx` already support it. |
| Governance votes affected | Structural isolation: `replace_member`/`change_name` branches, `fn_quorum`, 48h TTL, `vote_result` fan-out, and all UI are untouched. Risk is shared helpers (`vote_on`, `close_expired_votes`): mitigate by deleting only the `select_candidate` limbs and running the governance integration block as a gate. Enum values retained so no type-level breakage. |
| Avatar/bio/answers leak | New clusters unmask immediately **to members only** (RLS `is_active_member` unchanged; non-members still get nothing via `clusters`/`messages`/`intro_answers` policies + `discovery` security-definer directory). Confirm with RLS tests. |
| Stale clients mid-rollout | Old web/mobile cached `ClusterLayout` redirects will bounce once against new active rows until refetch; new rows carry `introductions_completed_at`, so the old `waiting` page immediately forwards to `/cluster/:id`, self-healing. No forced version gate needed. |
| Cron overlap | `0136` advisory locks + `LIMIT 100 SKIP LOCKED` + `statement_timeout` already serialize `vote-close`/`invite-expire`/`replacement-progress`/`intro-deadline`. No change. |

---

## 10. Implementation sequence

1. **Migration A (formation open-at-8 + silent backfill)**, `maybe_form_cluster` active-insert + `cluster_formed` copy; `submit_intro_answers` unlock-block removal; `accept_invitation` deadline-bump removal; `check_intro_deadlines` no-op + `intro-deadline` unschedule; silent backfill `status='introductions' → 'active'` (locked §D1, zero notifications) in the same migration.
   - *Gate:* `supabase db reset` + `seed:demo`; `matching.test.ts` formation asserts active/unlocked; `intro-social.test.ts` no-op-deadline + backfill-silence tests; `supabase db lint --local`.
2. **Web gating removal (§4.1)**, `ClusterLayout`, `ClusterCard`, `ModePanel`, `PostsFeedPage`, `HomePage`, `ClusterCreatedPage`, `WhatsNextSteps`, `notificationTarget`, `WaitingForOthersPage` → compat redirect to room (locked §D4).
   - *Depends on:* step 1 (needs active-at-formation rows to test against). *Gate:* `npm run lint`, `npm test`, `npm run build`; manual room-entry smoke (no `/waiting` flash; direct `/waiting` lands on room).
3. **In-cluster intro checklist/nudge**, new banner/strip on `RoomView`/`MembersView` reusing `useIntroProgress`; `IntroductionsPage` as unblocked form.
   - *Depends on:* step 2. *Gate:* component tests; e2e intro-nudge scenario.
4. **Migration B (deterministic replacement + one-shot cutover + continuous refill)**, `source_candidates` single-element invite path; `close_expired_votes` + `vote_on` candidate-limb removal; cutover of open candidate votes → rounds to sourcing (locked §D2, same migration, ordered per §8); `leave_cluster` no-supersede-when-active + `accept_invitation` recount/chain/`cluster_full` guard + `progress_replacements` under-8 safety net (locked §D6).
   - *Depends on:* step 1 (shared migration tooling, not logic). *Gate:* `governance.test.ts` rewritten S-06 + cutover test + refill tests (a)–(e) + unchanged governance pass/fail blocks; `db lint`.
5. **Web/mobile candidate-UI removal (§4.2 + §5)**, `VotesView`, `votes.ts` hook deprecation, realtime invalidation trim, mobile ports incl. `waiting.tsx` compat redirect (locked §D4), `sync-db-types.mjs --check`, regenerated `database.types.ts` + mobile copies committed.
   - *Depends on:* step 4. *Gate:* `npm run test:coverage` (thresholds intact), `test:integration` (governance + replacement + refill), `test:e2e` refill (incl. double-departure) + governance scenarios.
6. **Notifications/realtime/copy sweep (§6)**, remove `Candidates are up for selection` fan-out verification, banner copy, prefs labels if renamed, seed copy.
   - *Depends on:* steps 2 + 5. *Gate:* notification center snapshot/e2e; no `select_candidate` notification rows in integration runs.
7. **Legacy display + docs**, hide/relabel historic `select_candidate` votes, document retained-but-dead `voting`/`select_candidate` values, update `docs/{ARCHITECTURE,PRD,TECHNICAL}.md` + `mobile/README.md` (docs are source of truth per `AGENTS.md`).
   - *Gate:* `check:release` unaffected; docs-only CI skip applies.

Verification gates overall (per `AGENTS.md` pre-push): `npm run lint`, `npm run test:coverage`, `npm run build`; if migrations changed, `supabase db reset` + `npm run test:integration`; if synced files changed, `node mobile/scripts/sync-db-types.mjs --check`.

---

## 11. Open questions / decisions (all locked, none remaining)

1. ~~Legacy `introductions` rows: backfill vs drain?~~ **Locked (§D1):** silent backfill to `active`, keep `intro_completed_at`, zero notifications.
2. ~~Open `select_candidate` votes: two-stage vs one-shot?~~ **Locked (§D2):** one-shot cutover in Migration B (close as `superseded`, rounds to sourcing, no transitional branch).
3. ~~`candidate_pool`: single-element vs full pool?~~ **Locked (§D3):** `[selected_candidate]`; decline/expire re-sources.
4. ~~`/waiting`: retire vs repurpose?~~ **Locked (§D4):** route kept, redirects to the room; not a lifecycle state.
5. ~~`unlocked` notification for backfilled clusters?~~ **Locked (§D1):** silent, none sent.
6. ~~Failed `accept_invitation` auto-advance?~~ **Locked (§D5):** no change, out of scope.
7. ~~Under-8 gap (8→6, departures during refill)?~~ **Locked (§D6):** fixed via accept-chain recount + no-supersede-on-leave + `progress_replacements()` safety net + `cluster_full` guard; invariant: active clusters continuously attempt to return to 8, sequentially.

No other genuine product or architecture decisions remain, eligibility, cooldowns, TTLs, quorum, RLS, invitation lifecycle (minus the locked chaining), governance, and realtime are fully specified above and preserved. The only choices left are presentational implementation details (exact nudge copy/placement, whether legacy closed `select_candidate` rows are hidden vs generically labeled, hiding preferred), which need no product sign-off.

**The plan is ready for implementation.** Next: implement steps §10.1–§10.7 in order; do not modify application code, migrations, tests, generated types, or configuration until the implementation phase begins.

---

## Appendix B, implementation notes (recorded after build, `feat/cluster-lifecycle-simplification`)

Deviations from the plan as written, all within the locked decisions:

1. **`close_expired_votes()` keeps a `select_candidate → 'superseded'` arm (no fan-out) instead of full deletion.** Rationale found in testing: with the branch deleted, a stray legacy open candidate vote closes with a NULL outcome, and the shared `vote_result` fan-out then violates the `notifications.title NOT NULL` constraint, aborting the whole batch, including governance closes. The arm closes strays as `superseded` (same marker as the cutover) and `continue`s before the fan-out. Pinned by `governance.test.ts` (`superseded`, zero invitations, zero `vote_result` rows, round untouched).
2. **Legacy display = hiding (the preferred option).** `VotesView` open/closed lists, `RoomView` timeline, `ClusterRail`, and mobile `votes.tsx`/room timeline all filter `type !== 'select_candidate'`; `VOTE_TYPE_LABEL` keeps no candidate entry (governance-only record type). Closed legacy rows remain in the DB untouched.
3. **`source_candidates(p_round_id, p_system_user)` keeps its signature.** The param is now unused (single `db lint` "warning extra", same severity as the pre-existing unused-variable warning on this function). Dropping it would cascade into `start_replacement()`/`advance_round_on_invitation_void()` rewrites for zero functional gain.
4. **Seed + e2e.** `scripts/seed-demo.mjs` seeds all clusters `active` (`introductionsDone` = partial checklist progress, default everyone). New `e2e/cluster-lifecycle.spec.ts`: `/waiting` → room redirect, and the Drift intro-nudge → answer-5 → clears flow (requires a fresh `seed:demo`: the intro test completes diya's Drift answers).
5. **Mobile nudge deferred.** The intro checklist banner ships web-only (`IntroChecklistBanner` in `RoomView` + `MembersView`); mobile keeps the unblocked `introductions` route (reachable via deep link) with no new component, smallest coherent change, no generated-copy impact.
6. **Post-review fixes (unapplied-migration edits plus small UI/test changes, all on this branch before merge).** An external review of the uncommitted diff found: (a) `source_candidates()` dropped top-up candidates when the same-key pool aggregated to NULL, fixed with `coalesce(v_pool,'{}')` plus a same-key-empty regression test; (b) `leave_cluster()` check-then-start could double-open rounds under concurrent departures, fixed by holding the `replacement:<cluster>` advisory lock (reentrant with `start_replacement()`); (c) the cutover re-source loop now targets only rounds carrying a `select_candidate_vote_id`, so unrelated `selecting_candidates` rounds keep their attempts budget for the hourly cron; (d) the invitation banner test now uses a non-member invitee to pin the real production copy; (e) `IntroChecklistBanner` mounts keyed by `clusterId` and renders nothing without a membership row.
7. **Checklist entry permanence plus mobile parity (post-verification feedback).** Dismissing the room banner no longer strands the form: the members tab mounts a persistent (`dismissible={false}`) banner while the viewer's intro is pending, so the answer form stays one tap away. Mobile ships the same banner (`IntroChecklistBanner`, AsyncStorage-backed dismissal) in room (dismissible) and members (persistent).

Verification performed: `npm run lint` (0 errors, web + mobile), `npm run build` (tsc + vite), `npm run test:coverage` (88 files / 728 tests, gate held), `npm run test:integration` (27 files / 254 tests on a fresh `supabase db reset`), `npm run test:e2e` equivalent (`npx playwright test --project=chromium`, 29 passed incl. the 2 new scenarios), `node mobile/scripts/sync-db-types.mjs --check` (in sync), `supabase db lint --local` (no findings on rewritten functions except the noted unused-param warning), mobile `vitest` (15 passed).

---

## Appendix, files / RPCs / tables expected to change

**Migrations (new, order-dependent `NNNN_*.sql`):** Migration A rewrites `maybe_form_cluster` (`0011`), `submit_intro_answers` (live `0054`), `check_intro_deadlines` → no-op (live `0136`), `accept_invitation` deadline-arm removal (`0014`), unschedules `intro-deadline`, and silent-backfills `status='introductions' → 'active'`. Migration B rewrites `source_candidates` (live `0141`, single-element invite), `close_expired_votes` (live `0136`, candidate limb deleted), `vote_on` (live `0023`, candidate check deleted), adds `leave_cluster` no-supersede-when-active + `accept_invitation` recount/chain/`cluster_full` guard + `progress_replacements()` under-8 safety net, and runs the one-shot candidate-vote cutover (close `superseded`, rounds to sourcing, immediate re-source). No table/enum/RLS/grant/index changes.

**Tables read but unchanged:** `queue_entries`, `clusters`, `cluster_members` (`intro_completed_at`, `left_at`), `mode_cooldowns`, `intro_questions`, `intro_answers`, `messages`, `posts` family, `signals`, `calls`, `votes`, `vote_responses`, `replacement_rounds` (incl. `voting`, `candidate_pool`, `select_candidate_vote_id`), `invitations`, `notifications`, `notification_prefs`.

**Triggers/cron unchanged:** `queue_entries_formation`, `vote-close */10`, `invite-expire */30`, `replacement-progress */60` (+ `intro-deadline */15` removed or no-op).

**Web:** `ClusterLayout.tsx`, `router.tsx`, `IntroductionsPage.tsx`, `WaitingForOthersPage.tsx` (compat redirect to room), `ClusterCard.tsx`, `ModePanel.tsx`, `PostsFeedPage.tsx`, `HomePage.tsx`, `ClusterCreatedPage.tsx`, `WhatsNextSteps.tsx`, `VotesView.tsx`, `room/VoteRow.tsx`, `MembersView.tsx` (copy only), `features/introductions.ts` (reuse), `features/votes.ts` (drop `useReplacementCandidates`), `features/notifications.ts` (`cluster_formed` target), `features/realtime.ts` (drop `replacement-candidates` invalidation), `features/matching.ts` (no logic), `lib/database.types.ts` (regenerated).

**Mobile:** `mobile/src/features/{introductions,matching,votes,notifications}.ts` (regenerated), `mobile/src/features/realtime.ts` (hand-reconciled), `app/(app)/cluster/[clusterId]/{introductions,waiting,votes,members,room}.tsx`, `app/(app)/{home,cluster-created,mode/[modeId],queue/[queueId],clusters,posts,notifications}.tsx`, `mobile/src/components/*` mirrors, `mobile/src/lib/constants.ts`.

**Tests:** `ClusterCard.test.tsx`, `PostsFeedPage.test.tsx`, `VotesView.test.tsx`, `votes.test.tsx`, `introductions/matching` suites, `tests/integration/{matching,intro-social,governance,account,discovery,rls}.test.ts` (incl. new backfill-silence, cutover, and refill (a)–(e) cases), `e2e/{golden-path,cluster-room}.spec.ts` + 4 new scenarios (§7, incl. double-departure refill and `/waiting`-redirect).
