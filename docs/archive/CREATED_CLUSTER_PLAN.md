# Created Cluster - Implementation Plan

**Status:** Implemented (single migration `0168`; web + mobile UI; integration tests green; E2E walked on web via Playwright)
**Goal:** Let a user create a small cluster from people they have already shared a cluster with. Creator plus invitees, 3 to activate, up to 8 total. Reuse existing cluster, member, invitation, and notification infrastructure. Mockups are reference only; the shipped UI follows existing web patterns in `ClustersPage`, `ClusterCard`, `HomePage` invite cards, and `ClusterLayout` tabs, and the established mobile patterns (stepped single-screen wizard like onboarding, hidden tab routes, `Screen`/`Card`/`PrimaryButton` primitives).
**Non-goals:** Arbitrary user search or invites, DMs, roles or permissions, member management beyond invite plus accept plus decline, changing queue matching, changing cluster size for queue-formed clusters.

Locked user answers 2026-09-28: pending = members tab only; post-activation invites = creator only; expiry = 72h free slot with creator notice and no auto-refill; eligible pool = current plus ex-members; discovery = hide until Active; leave = no cooldown; name = 50-char free text, trim plus non-empty check, no profanity filter, report path only.

Follow-up fixes 2026-09-28 (parity review): created-cluster activation at 3 fired the queue "Eight of you were matched" banner and cluster-created copy on both apps, so all four "ready" surfaces are now member-count aware (8 keeps the legacy copy). The demo seeder never onboarded filler members, which emptied the eligible picker, so `ensureUser` now backfills `onboarding_completed_at`. Mobile ships the same flow natively: create wizard (`clusters/new`), invite detail (`invites/[invitationId]`), pending gates on room/signals/votes/settings, pending roster plus invite-more on members, created/pending card labels, and creator-only invites. `created-clusters.ts` is a synced generated module on both apps.

Harassment and spam guards 2026-09-28 (all in `0168`): co-member-only eligibility plus 5/day creation cap and 8-slot cap are the base. On top: top-up invites rate-limited (20/hour); an explicit decline is final for that cluster (`previously_declined`, while expiry and creator-cancel stay re-invitable); muting is honored silently (no notification or push, hidden from the pending list and detail, row still created so the mute is never revealed); suspended/banned accounts are ineligible. Decline is a two-tap confirm on both apps because decline is now final. No ejection vote exists for created clusters by design (queue refill is meaningless); recourse inside a created cluster is mute, report, or leave.

Queue separation 2026-09-28 (all in `0168`): created clusters store `matching_mode='open_mix'` purely as a storage sentinel and carry no semantic mode. `join_queue` and `get_my_matching_status` are origin-filtered so a created-cluster member is neither blocked from the Open Mix queue nor reported as occupying its tile, and accepting a created invite never touches queue entries - matching and created clusters stay fully independent.

---

## 1. Product decisions (locked)

| Decision | Proposed value | Rationale |
|---|---|---|
| Entry point | "Create a cluster" button on `ClustersPage` beside "Your clusters", plus empty-state CTA | Matches existing page structure in `src/pages/ClustersPage.tsx:30-55`. No new nav. |
| Flow | Name, then pick from eligible co-members, then review, then send | Mirrors mock steps 2-4 but built with existing modal and picker patterns from `ModePanel`. |
| Creator | Auto member 1, counted as confirmed | Simplest activation math: creator + 2 accepts = 3. |
| Size | Min 3 confirmed to activate, max 8 total | Per proposal. No DDL enforces 8 today; RPC enforces the cap. |
| Eligibility | Current plus ex-members the creator shared any cluster with, excluding current members and already-pending invitees | Locked 2026-09-28. Query `cluster_members` self-join on any shared `cluster_id` regardless of `left_at`. |
| Pending state | Visible in list and detail to creator and confirmed members only; invitees see invite via Home plus Notifications, not the cluster row | Follows RLS today: `clusters` SELECT requires `is_active_member` in `supabase/migrations/0003_queues_clusters.sql:89-94`. |
| Pending behavior | Members tab plus Settings visible, chat plus posts plus signals plus votes plus calls locked until Active | Avoids a 1-person chat room and matches "behave like normal only after activation". Settings stays open because it holds only details plus leave, and leaving must stay possible while pending. |
| Activation | Automatic when confirmed count reaches 3; status flips Pending to Active, `cluster_formed` fan-out | No manual step, no timer. |
| Late joins | Invited users can still accept up to 8 after activation; creator-only invites while pending and after activation | Locked 2026-09-28. |
| Discovery | Pending created clusters excluded from `get_clusters_by_mode` directory and counts until Active | Same treatment as `archived` today; avoids leaking pre-formed groups. |
| Name | Free text, 50-char limit, trim plus non-empty check; later changes reuse existing `change_name` vote path; abuse handled via existing report path only | Locked 2026-09-28. No profanity filter. |
| Expiry | Reuse 72h `expire_invitations` cron, but created-cluster expiry must NOT trigger replacement refill | Reuse timer, fork the void path. |

### 1.1 Explicitly out of scope

- Search by name, email, or QR; invite strangers.
- Roles (admin, moderator), kick, ban from cluster, or transfer of creator.
- Cooldown: leaving a created cluster triggers no cooldown (locked 2026-09-28; created origin has no matching mode).
- Total-cluster cap per user (still an open PRD question).
- Changing `CLUSTER_SIZE` for queue clusters.

---

## 2. Current-state map (files that must change)

### 2.1 Backend

| File | What matters |
|---|---|
| `supabase/migrations/0003_queues_clusters.sql` | `clusters`, `cluster_members`, `is_active_member()`, RLS (members-only SELECT, no direct inserts). |
| `supabase/migrations/0007_votes_replacement.sql` | `invitations` table (`pending, accepted, declined, expired`, `expires_at +72h`) and `replacement_rounds`. Reuse the invite shape, do not reuse the round flow. |
| `supabase/migrations/0011_matching_functions.sql` plus `0142_open_cluster_at_formation.sql` | `maybe_form_cluster()` queue-only creation path. No direct-create RPC exists. |
| `supabase/migrations/0143_deterministic_replacement.sql`, `0144`, `0145` | Live `accept_invitation` body: `cluster_full >= 8` guard, mode-collision guard, refill chain, join notice with `payload.new_member_id`. Copy guards, skip refill for created origin. |
| `supabase/migrations/0014_replacement_functions.sql` | `decline_invitation`, `advance_round_on_invitation_void`, `source_candidates`. Created flow needs its own void path (free slot, notify creator, no re-source). |
| `supabase/migrations/0136_cron_batch_limits.sql` | Live `expire_invitations()` plus `progress_replacements()` safety net. The safety net (`active AND count < 8 AND no round AND no pending -> start_replacement`) will hijack pending created clusters unless gated by origin. This is the highest-risk integration point. |
| `supabase/migrations/0023_governance_realtime.sql` | `get_pending_invitations()`, `get_replacement_round()`. Extend pending read with creator name and confirmed count, or add `get_created_invites()`. |
| `supabase/migrations/0037_cluster_member_counts.sql`, `0041_public_cluster_directory.sql`, `0043_directory_rpc_authenticated_only.sql` | `get_my_clusters()`, `get_clusters_by_mode()`, `get_public_cluster_counts()`. Must decide pending visibility and include origin. |
| `supabase/migrations/0017_grants.sql`, `0113` | Grant surface. New RPCs need `GRANT EXECUTE TO authenticated`; keep no direct table inserts. |
| `src/lib/database.types.ts` | Generated. Regen after migration; run `node mobile/scripts/sync-db-types.mjs --check`. |

Schema gaps today: no `clusters.created_by`, no `clusters.origin` or `is_custom`, no `pending` value in `cluster_status` (`introductions, active, archived` only), no `inviter_id` on `invitations`, `matching_mode` and `queue_key` are NOT NULL with no custom value.

### 2.2 Frontend web

| File | Change |
|---|---|
| `src/pages/ClustersPage.tsx:30-55` | Add Create button plus empty-state CTA; split `useMyClusters()` list into Pending and Active sections. |
| `src/app/router.tsx:199` | Add `/clusters/new` route (guarded like `/clusters`), lazy page reusing `AppShell` patterns. |
| `src/features/created-clusters.ts` (new) | `useEligibleComembers()`, `useCreateCluster()`, `useInviteMore()`, reuse invalidation keys `my-clusters`, `clusters-by-mode`, `public-cluster-counts`, `my-invitations`. No direct `from('clusters').insert`. |
| `src/components/ClusterCard.tsx` | Add `pending` label plus "X more to activate" plus invite CTA; fix fallback that renders unknown status as Active. |
| `src/components/PublicClusterCard.tsx` | Handle new status or exclude pending from directory; current `statusMeta` key-misses on unknown values. |
| `src/features/votes.ts:164-225` | Extend or mirror `useMyPendingInvitations`, `useAcceptInvitation`, `useDeclineInvitation` for created invites with creator name and roster preview. |
| `src/pages/HomePage.tsx:98-144` | Reuse pending-invite card pattern; show cluster name, creator, people involved, Accept plus Decline. |
| `src/pages/NotificationsPage.tsx`, `src/features/notifications.ts` | Reuse `invitation_received` type plus `invitations` pref; extend payload with `creator_id` and deep link to invite view. |
| `src/app/layouts/ClusterLayout.tsx`, `src/pages/cluster/MembersView.tsx`, `RoomView.tsx` | Gate room plus chat plus posts plus signals plus votes on Active; Members tab shows confirmed vs pending rows with check and clock affordances. |
| `src/pages/cluster/SettingsView.tsx:68` | Replace literal `/ 8` with `CLUSTER_SIZE` or cluster target size. |
| `src/lib/constants.ts:6` | `CLUSTER_SIZE = 8` stays for queue clusters; created clusters reuse the same cap, no constant change. |

### 2.3 Mobile

Mirrors web per `mobile/scripts/sync-db-types.mjs` (`matching.ts`, `discovery.ts`, `cluster.ts` are copies; `realtime.ts` is pinned). After web lands: sync db types with `--check`, port status label and pending card, port invite accept flow. Staff surfaces stay web-only so no admin work.

---

## 3. Backend build (one migration, e.g. `0168_created_clusters.sql`)

1. `ALTER TABLE clusters ADD COLUMN created_by uuid REFERENCES profiles(id), ADD COLUMN origin text NOT NULL DEFAULT 'queue'`. Legacy rows stay `queue`; new rows use `created`. Alternative `is_custom bool` is equivalent; pick one.
2. Decide `matching_mode` and `queue_key` for created rows: either allow NULL (needs NOT NULL drop) or store sentinel (`matching_mode` keeps an existing value plus `origin = 'created'`, `queue_key = 'custom:<uuid>'`, `mode_label = 'Created'`). Sentinel is less invasive to existing RPCs that assume NOT NULL.
3. Decide status: add `cluster_status` value `forming` or `pending` via `ALTER TYPE ... ADD VALUE`, or reuse `introductions` for pending. New value is clearer but requires updating `ClusterCard`, `PublicClusterCard`, directory RPC filters, and metrics rollups.
4. New `SECURITY DEFINER` RPCs (grant `EXECUTE TO authenticated`):
   - `create_created_cluster(p_name text, p_invitee_ids uuid[])`: assert auth and onboarding, validate name length, validate 2 to 7 invitees, validate each invitee via co-member check, insert `clusters` plus creator `cluster_members` row, insert `invitations(pending)` rows, insert `notifications(invitation_received)` rows with creator payload. Advisory lock per creator to avoid double-create races.
   - `get_eligible_comembers()`: distinct users sharing any `cluster_id` with caller, excluding current members of the target cluster, already-pending invitees, and optionally muted users. Returns profile fields already visible to members.
   - `invite_to_created_cluster(p_cluster_id, p_invitee)`: creator-only (or member per section 7), `count < 8` guard, no duplicate pending, co-member check.
   - `accept_created_invitation(p_invitation_id)` and `decline_created_invitation(p_invitation_id)`: ownership plus `already_responded` checks copied from replacement flow; accept inserts `cluster_members`, marks `accepted`, flips cluster to Active at 3 and emits `cluster_formed` plus `replacement`-style join notice; decline or expire marks void and notifies creator. Neither path touches `replacement_rounds` or `queue_entries`.
5. Harden existing functions by origin: `progress_replacements()`, `leave_cluster`, `expire_invitations` void path, and `accept_invitation` refill chain must skip or branch for `origin = 'created'`.
6. Update reads: `get_my_clusters()`, `get_clusters_by_mode()`, `get_public_cluster_counts()`, `get_pending_invitations()` to include origin, creator, and confirmed versus pending counts. Update realtime publications if new columns need live updates (members and invitations already published).
7. Regen `src/lib/database.types.ts`; do not hand-edit except to unblock.

---

## 4. Frontend build order

1. Create button plus list split (`ClustersPage`, `ClusterCard`). Behind no new API until step 3 lands; can render from `useMyClusters` with status filter.
2. Create wizard (`/clusters/new`): name input with 50-char limit per mock, eligible picker with search, review screen, send. New `created-clusters.ts` hooks.
3. Invitee flow: Home card plus Notifications row plus invite detail (`cluster name, creator, people involved, Accept, Decline`), reusing `votes.ts` mutation shapes.
4. Pending detail (creator view): roster with confirmed plus pending rows, "X more to activate", "Invite more people", cancel invite action.
5. Activation flip: status badge Pending to Active, unlock room tabs, `Open cluster` CTA. Reuse `ClusterCreatedPage` pattern or navigate to `/cluster/:id/members`.
6. Late joins up to 8 and directory exclusion until Active.

Styling: Tailwind tokens in `docs/DESIGN.md` only; dark theme primary `#2F6BEE`, existing radii and spacing. No new colors, typefaces, or bottom nav on web.

---

## 5. Tests and gates

- `supabase db reset`, then `npm run seed:demo`.
- `supabase db lint --local`.
- `npm run test:integration`: new cases for create validation (min 3, max 8, non-co-member rejected, duplicate pending rejected), accept at 3 flips Active, decline frees slot, expiry voids without replacement refill, `progress_replacements` ignores created origin, RLS (non-member cannot select cluster row, invitee can read own invitation).
- `npm test` colocated unit tests for new hooks plus status label plus pending card.
- `npm run test:coverage`: do not lower v8 gates in `vite.config.ts`.
- `npm run lint`, `npm run build` (typecheck via `tsc -b`).
- If synced web files changed: `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated mobile copies.
- Pre-push per `AGENTS.md`: lint, coverage, build; plus integration suite because migrations changed. Optional Playwright pass with `data-e2e` selectors on the new button and wizard.

---

## 6. Rollout

1. Land migration on `develop` via PR (feature branches never apply migrations directly). Staging migration workflow applies it; verify `seed:demo` plus manual create plus accept flow on preview.
2. Ship frontend behind no flag (new route is additive; existing clusters untouched).
3. Production via `develop` to `main` release PR with merge commit; run `npm run check:release` first.

---

## 7. Open product questions (all locked 2026-09-28)

1. Pending room lock: locked to members tab only; chat, posts, signals, votes, calls locked until Active.
2. Post-activation invites: locked to creator only.
3. Invite expiry: locked to 72h reuse; slot frees, creator notified, no auto-refill and no replacement path.
4. Co-member definition: locked to current plus ex-members; muted or reported filtering still open (default: no extra filter unless you ask).
5. Discovery: locked to hide until Active.
6. Mode and cooldown: locked to no cooldown on leave; created origin carries no matching mode.
7. Name moderation: locked to free text, 50-char limit, trim plus non-empty check, no profanity filter, reuse report path only.
