# Muted-Author Notification Suppression Plan

Goal: once you mute someone, no new notification traffic from them reaches you - no inbox rows, no push, no email - while existing history stays untouched.

This is a small-medium change. Muting today only hides content client-side (`user_mutes` plus `get_my_mutes()`, read by `isMutedAuthor()` in room, feed, post, and comment renderers); the entire notification pipeline (inbox fan-out, push outbox, email) is mute-unaware. Suppression lands at fan-out time with one predicate per emit site, so push and email are covered automatically wherever they key off the suppressed rows. No schema change, no RLS change, no new notification type, no frontend change.

## 0. Where things stand

Backend (Supabase, migrations are immutable, add new ones only):

- `supabase/migrations/0090_user_mutes.sql`: `user_mutes(user_id, muted_user_id)` PK, no-self check, own-row RLS. `0093` adds `get_my_mutes()`. Nothing in the notification path reads this table.
- `send_message()` (live body `0138`, broadcast extension `0155`): inserts one `mention` row per matched member (`{"message_id": v_msg_id}`), plus `message` rows for the rest (since 0156 the `message` rows still fan out but the center hides plain chat; they still drive push via 0153, see below).
- `fn_notify_reaction()` (`0024`): trigger on `message_reactions` INSERT notifies the message author (`{"message_id", "emoji"}`), skipping self-reactions.
- `create_post_comment()` (live body `0139`, deep-link extension `0162`): notifies the post author and the parent-comment author (`{"post_id", "comment_id"}`).
- `toggle_post_like()` (`0139`): notifies the post author (`{"post_id"}`). `toggle_comment_like` emits nothing.
- Push: the `notifications` INSERT trigger (`0100/0102/0103/0137/0145` chain) fans rows into `push_outbox` per recipient token. Plain chat writes no inbox row, so `fan_out_push_for_message()` on `messages` INSERT (`0153`, extended `0155`) pushes directly, skipping the author, mentioned members, and broadcast recipients.
- Email: member-activity email keys off the same notification rows (appeals/moderation mail uses explicit `enqueue_email` calls and is untouched by this plan).
- Read path: `get_my_notifications()` (live body `0156`) gates rows by `notification_allowed()` prefs only. No change needed here under fan-out suppression.
- Integration tests: `tests/integration/posts.test.ts` (post fan-out plus prefs), `tests/integration/notifications.test.ts` (reaction trigger, prefs), `tests/integration/push.test.ts` (no-double-push, per-token fan-out).

Frontend (web + mobile):

- No change needed. Suppressed rows are never created, so the center, badge, push taps, and deep links behave as if the activity never happened. `notificationTarget()` and the `?message=` / `?comment=` handling are untouched.
- `mobile/src/features/notifications.ts` is a synced copy; untouched.

## 1. Locked decisions

1. **Scope**: all member activity. `mention` (including `@everyone` broadcasts), `reaction`, `post_comment`, `post_like`. Governance (`vote_started`, `vote_result`, `replacement`), `signal_new`, `invitation_received`, `cluster_formed`, `queue_update`, `unlocked`, and all staff/moderation types are unchanged: muting a member must never hide a vote about them or a moderator notice.
2. **Push and email**: suppressed together with the inbox row. Push for stored rows dies with the row (no INSERT, no `push_outbox` fan-out). Plain-chat pushes need an explicit guard in `fan_out_push_for_message()` since they bypass the inbox. Member-activity email keys off the same rows; verify during implementation that no separate email trigger exists for these types, and note the outcome in the migration comment.
3. **History**: rows created before the mute stay visible (read or unread). Only new activity is suppressed. Unmuting does not resurrect anything (nothing was stored to resurrect).
4. **Broadcasts**: a member who muted the broadcaster is excluded from the `@everyone` fan-out, same predicate as direct mentions.
5. **Muting stays silent**: no notification, push, or email tells anyone they were muted (already the rule per `MUTE_AND_MY_REPORTS_PLAN.md`).
6. **Mute is global, not per-cluster**: `user_mutes` has no cluster column, so one predicate shape fits every emit site: the recipient suppresses the actor.

## 2. Phase 1 - Backend migration `01NN_mute_notification_suppression.sql`

Why: security and fan-out live in the database; the client is never trusted to filter.

Shared predicate (no new helper needed; inline `NOT EXISTS` keeps each function readable):

```sql
and not exists (
  select 1 from public.user_mutes m
  where m.user_id = <recipient_id> and m.muted_user_id = <actor_id>
)
```

1. Re-issue `send_message(...)` by copying the live body byte-for-byte, changing only the two notification inserts:
   - per-member `mention` branch: add the predicate with recipient = the mentioned member, actor = `auth.uid()` (the sender). This covers the `@everyone` broadcast branch identically.
   - `message` branch: same predicate (defense in depth; plain-chat rows stay out of the center but feed badge-adjacent counts in older clients).
2. Re-issue `fn_notify_reaction()`: after the self-reaction early return, add `if exists (select 1 from public.user_mutes where user_id = v_author and muted_user_id = NEW.user_id) then return NEW; end if;`.
3. Re-issue `create_post_comment(...)`: guard both `post_comment` inserts (post-author notice with actor = `v_actor`, parent-author notice with the same actor) with the predicate. Keep the `comment_id` payload from 0162 untouched.
4. Re-issue `toggle_post_like(...)`: guard the `post_like` insert the same way.
5. Re-issue `fan_out_push_for_message()`: extend the recipient skip so owners who muted the author get no plain-chat push. The trigger joins `push_tokens`; add `and not exists (select 1 from public.user_mutes m where m.user_id = <token owner> and m.muted_user_id = NEW.author_id)`. Copy the 0155 body and change only this condition.
6. Keep `security definer`, `set search_path = public`, existing grants, rate limits, and RLS posture in every re-issued function. `user_mutes` is already readable by the definer role (RLS own-rows plus definer bypass); no grant change.
7. Run `supabase db lint --local` and add the migration to the `docs/TECHNICAL.md` timeline.

Explicitly not changed: `user_mutes` schema and RLS, `notification_allowed()`, `get_my_notifications()`, badge RPCs, governance/signal/invitation fan-out, staff notifications, moderation email triggers, `database.types.ts` by hand (regen, see phase 3).

## 3. Phase 2 - No frontend change

Web and mobile render from stored rows and `get_my_notifications()`; suppressed activity simply never arrives. No component, hook, route, or deep-link change. The muted-placeholder jump targets from the deep-link feature keep working for rows created before the mute.

## 4. Phase 3 - Types, seed, and docs

1. No schema change is expected, so `src/lib/database.types.ts` should be unchanged; verify with regen plus `cd mobile && npm run sync:db-types` and `node mobile/scripts/sync-db-types.mjs --check`.
2. Seed needs no change (`npm run seed:demo`); verify manually as `diya@demo.example` muting `rio@demo.example`, then `@rio` from diya produces no row, no push, and no badge for rio.
3. Update `docs/TECHNICAL.md` notification paragraph to note mute suppression at fan-out, and the `docs/PRD.md` mute section if it promises inbox behavior. Core docs stay canonical; this plan file remains the design record.

## 5. Phase 4 - Tests

Unit (colocated, Vitest): none required (no client change). If a pure helper is added (not planned), cover it colocated.

Integration (requires `supabase start`, sequential):

- `tests/integration/notifications.test.ts` style: b mutes a; a sends `Hi @b` (and `@everyone`); assert zero `mention` rows for b, while an unmuted third member still gets theirs. Reaction: b mutes a; a reacts to b's message; assert zero `reaction` rows for b.
- `tests/integration/posts.test.ts` style: b mutes a; a comments on b's post and replies to b's comment; assert zero `post_comment` rows for b; b likes... (a likes b's post produces nothing for b only if b muted a - cover the like guard). Prefs-off plus muted-on combined case still yields nothing.
- `tests/integration/push.test.ts` style: b mutes a; a sends plain chat; assert zero `push_outbox` rows for b's tokens on channel `messages`, while unmuted members still get theirs.
- History case: seed a `mention` row, then b mutes a, assert the old row is still returned by `get_my_notifications()`; new mentions after the mute create nothing.
- Unmute case: b unmutes a; new mention creates a row again.

E2E: none required (no UI change). Optional manual pass per phase 3.2.

## 6. Verification

Pre-push per `AGENTS.md`:

- `npm run lint`
- `npm run test:coverage` (hard v8 gate: lines 34 percent, functions 33 percent, branches 20 percent; never lower thresholds)
- `npm run build` (`tsc -b` plus `vite build`)
- Migrations changed, so also `supabase db reset` plus `npm run test:integration`
- `node mobile/scripts/sync-db-types.mjs --check` (expect no-op)

No realtime publication change, so no `supabase stop && supabase start` cycle beyond the normal reset.

## 7. Acceptance criteria

- With b muting a: `@b` and `@everyone` from a create zero `mention` rows for b; a's reactions to b's messages create zero `reaction` rows; a's comments/replies/likes on b's content create zero `post_comment` / `post_like` rows; plain chat from a creates zero pushes for b's tokens.
- Unmuted members in the same cluster are unaffected in every case above.
- Rows created before the mute remain visible; unmuting restores future delivery only.
- Governance, signals, invitations, cluster lifecycle, and staff/moderation notifications are unaffected by mutes.
- All gates in section 6 pass.

## 8. Risks and edge cases

- **Harassment race**: a harasser's messages sent in the gap before the victim mutes still notify. Mitigation is the existing report plus block path; this plan only stops future pings. Document this in the mute UX copy if product wants it explicit.
- **Over-suppression**: the predicate keys on (recipient, actor) per row, so it cannot leak across users; a wrong actor binding would either drop legitimate notices or fail to suppress. Each emit site names its actor explicitly (sender, reactor, commenter, liker); the integration tests pin one case per site.
- **Broadcast blast radius**: `@everyone` in an 8-member cluster now fans out to 7-minus-muted instead of 7. No other behavior changes.
- **Email verification**: if implementation finds a member-activity email trigger that does not key off `notifications` rows, gate it the same way in the same migration and call it out in the migration comment.
- **Scope guard**: no client changes, no prefs schema changes, no badge RPC changes, no backfill, no deletion of historical rows.
