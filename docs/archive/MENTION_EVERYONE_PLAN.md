# @everyone Mention Plan

Goal: let any cluster member type `@everyone` in chat to notify the whole cluster through the existing mention pipeline (inbox row + push + email), with autocomplete and chip rendering on web and mobile.

This is a small-medium change. Per-member `@DisplayName` mentions already exist end to end; `@everyone` is a special case on top of them. No schema change, no RLS change, no new notification type.

## 0. Where things stand

Frontend (web):

- `src/features/mentions.ts`: `parseMentions()` splits content into text and mention chips, `parseMentionQuery()` finds the `@query` token at the caret, `filterMentionCandidates()` ranks member matches. The rule mirrors the backend: word-boundary `@` plus full display name (case-insensitive), longest name first.
- `src/pages/cluster/room/Composer.tsx:63-121`: builds `mentionMembers` (excludes self), shows the `Mention a member` listbox, inserts `@DisplayName ` on select.
- `src/pages/cluster/room/MentionText.tsx:14`: renders each mention as a profile `Link` (`/profile/:id?cluster=`).
- Tests: `src/features/mentions.test.ts`, `src/pages/cluster/room/Composer.test.tsx`, `src/pages/cluster/room/MessageItem.test.tsx`.

Frontend (mobile, hand-mirrored):

- `mobile/src/features/mentions.ts`: copy of the web parser (do not hand-diverge except through this plan, then keep in sync).
- `mobile/src/components/room/Composer.tsx:73-102`, `mobile/src/components/room/MentionText.tsx:5`: same behavior in React Native.
- Sync check: `node mobile/scripts/sync-db-types.mjs --check` after any shared-file change.

Backend (Supabase, migrations are immutable, add new ones only):

- `supabase/migrations/0033_mention_word_boundary.sql:9`: `is_mentioned(p_content, p_display_name)` immutable helper, word-boundary match.
- Live `send_message()` body is `supabase/migrations/0138_hot_write_rate_limits.sql:154` (auth guard, `assert_account_can_write`, `is_active_member` plus `cluster_unlocked`, 60/hr rate limit, reply target check). On `p_content`, it builds `v_mentions` from active members via `is_mentioned()` and inserts one `notifications` row per match with `type = 'mention'`, title `<author> mentioned you`, payload `{"message_id": v_msg_id}`.
- `supabase/migrations/0153_plain_chat_push.sql:22`: `fan_out_push_for_message()` trigger on `messages` INSERT fans plain chat straight to `push_outbox` (`type = 'message'`, channel `messages`), skipping the author and anyone matched by `is_mentioned()` so mentioned members get only the higher-priority `mention` push.
- Downstream fan-out is generic over `notifications` rows: the `notifications` INSERT trigger (`0100/0102/0103/0137/0145` chain) applies `notification_allowed()` prefs, account-active, and token presence for both push and email. `@everyone` reuses this path, so per-cluster `mentions` opt-outs keep working with no extra code.
- Read path: `get_my_notifications()` (live body `0134`) gates stored rows by `notification_allowed()`, so members who disabled `mentions` will not see the `@everyone` rows either.
- Integration tests: `tests/integration/intro-social.test.ts:439` (mention fan-out plus word-boundary negatives), `tests/integration/notifications.test.ts`, `tests/integration/push.test.ts:67` (`mentionCluster` helper plus no-double-push test at `:120`).
- E2E: `e2e/cluster-room.spec.ts:64` (autocomplete inserts chip, timeline renders profile link).

## 1. Locked decisions

1. **Copy**: reuse `type = 'mention'`. Title is `<author display_name> || ' mentioned everyone'`, body is `null`, payload is `{"message_id": v_msg_id}` unchanged.
2. **Who can use it**: any active cluster member. No role check, no dedicated `@everyone` cooldown in v1. Abuse is covered by the existing 60 messages/hr per-user rate limit, the per-cluster `mentions` opt-out, and the cluster cap of 8 (blast radius is 7 rows).
3. **Autocomplete placement**: `@everyone` is the pinned first option when the query is empty or a case-insensitive prefix of `everyone` (e.g. `@`, `@e`, `@every`), then normal member ranking below it.
4. **Rendering**: non-link, non-clickable chip reusing the existing mention styling (same tokens as `MentionText`, no new colors per `docs/DESIGN.md`). There is no profile to link to.
5. **Collision**: if a member is literally named `Everyone`, the broadcast token wins and that member is still included via the broadcast. Document this in the migration comment.

## 2. Phase 1 - Backend migration `0155_mention_everyone.sql`

Why: security lives in the database; the client is never trusted for fan-out.

1. Add immutable helper next to `is_mentioned`:
   `is_mentioned_everyone(p_content text) returns boolean`, case-insensitive word-boundary match on the literal token `@everyone` (preceded by start or non `[a-z0-9_]`, followed by end or non `[a-z0-9_]`). Implement with the same `strpos` loop style as `is_mentioned` so behavior matches exactly (no regex escaping risk, no mid-word `@` match, `@everyone!` and `(@everyone)` match, `me@everyone` and `@everyoneelse` do not).
2. Re-issue `send_message(p_cluster_id, p_content, p_image_url, p_reply_to_id)` by copying the `0138` body byte-for-byte (guards, `cluster_unlocked`, `check_rate_limit('send_message', 60, interval '1 hour')`, reply validation), then replace only the mention block:
   - `if public.is_mentioned_everyone(p_content)` then `select array_agg(distinct cm.user_id)` over active members excluding author into `v_mentions`;
   - else the existing per-member `is_mentioned(p_content, m.display_name)` query.
   - Insert `notifications` rows with `type = 'mention'`, title `<author display_name> || ' mentioned everyone'` in the broadcast branch, `' mentioned you'` otherwise. Keep payload shape identical.
3. Re-issue `fan_out_push_for_message()` by copying the `0153` body, extending only the skip condition so broadcast recipients are also excluded from the plain `message` push:
   `and not (NEW.content is not null and (public.is_mentioned_everyone(NEW.content) or public.is_mentioned(NEW.content, coalesce(pr.display_name, ''))))`.
   This preserves the single-wake behavior and the no-double-push invariant.
4. Keep `security definer`, `set search_path = public`, and existing `revoke ... from public, anon, authenticated` posture for the trigger function. `send_message` grants are unchanged (existing grants cover `create or replace`).
5. Run `supabase db lint --local` and add the new migration to the `docs/TECHNICAL.md` migration timeline.

Explicitly not changed: `is_mentioned()` body, `notification_allowed()`, `get_my_notifications()`, push/email workers, RLS policies, rate-limit values, `database.types.ts` by hand (regen, see phase 4).

## 3. Phase 2 - Web frontend

Files: `src/features/mentions.ts`, `src/pages/cluster/room/Composer.tsx`, `src/pages/cluster/room/MentionText.tsx`.

1. `mentions.ts`:
   - Add `EVERYONE_NAME = 'everyone'` export and extend `MentionPart` with `{ type: 'everyone'; prefix: string; name: string }`.
   - `parseMentions()`: check the `@everyone` token first with the same word-boundary rule (case-insensitive), emit `everyone` parts, then run the existing per-member regex over the remainder. Precedence: broadcast wins on overlap.
   - Candidates: add `matchesEveryone(query)` helper (`'everyone'.startsWith(q)`). `Composer` prepends the `@everyone` pseudo-option when it matches; `filterMentionCandidates()` itself stays people-only so its unit tests are untouched.
   - `insertMention()` accepts `MentionMember | 'everyone'`; the everyone path inserts `@everyone ` (trailing space, same as members).
   - `parseMentionQuery()` needs no change: it already returns the `@`-token up to whitespace, so `@`, `@e`, `@every` all produce a query.
2. `Composer.tsx`: render the `@everyone` row first in the `Mention a member` listbox (megaphone icon instead of an avatar, plain `everyone` text matching the member-row layout), keep keyboard nav (`ArrowUp/Down`, `Enter/Tab`, `Escape`) working over the combined list.
3. `MentionText.tsx`: render `everyone` parts as a styled non-link chip reusing the existing mention classes (rounded, `bg-primary/10`, `text-primary`), with `@{name}` text. Member parts keep the profile `Link`.
4. Conventions: strict TypeScript, `@/` alias, no em dashes or en dashes in copy or comments, Tailwind tokens from `docs/DESIGN.md` only, no new colors or radii.

## 4. Phase 3 - Mobile mirror

Files: `mobile/src/features/mentions.ts`, `mobile/src/components/room/Composer.tsx`, `mobile/src/components/room/MentionText.tsx`.

Port phase 2 line-for-line, adapted to React Native (`Text` chip instead of `Link`, same haptics and menu behavior as the existing mobile composer). Per the established chat-SDK pattern (Stream Chat RN, Slack mobile), the mobile suggestion list is a floating overlay anchored above the input row (`absolute`, `bottom: '100%'`) rather than an inline block, rendered as a `FlatList` with `keyboardShouldPersistTaps="always"` and a bounded height (`maxHeight: 216`, about 4.5 rows) so it never covers the chat. Then run `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated copies. `mobile/src/features/realtime.ts` is pinned and untouched.

## 5. Phase 4 - Types, seed, and docs

1. Regenerate `src/lib/database.types.ts` from the migrated schema (no codegen script in `package.json`; use the established local flow), then `cd mobile && npm run sync:db-types`.
2. Seed needs no change (`npm run seed:demo`); verify `@everyone` manually as `diya@demo.example` in Aurora.
3. Update `docs/PRD.md` `@-mentions` section and `docs/TECHNICAL.md` mention/push paragraphs to note the broadcast token. Core docs stay canonical; this plan file remains the design record.

## 6. Phase 5 - Tests

Unit (colocated, Vitest):

- `src/features/mentions.test.ts`: `@everyone` mid-sentence, start/end of string, case-insensitive (`@Everyone`), punctuation boundaries (`(@everyone)!`), negatives (`me@everyone`, `@everyoneelse`), precedence over member matches, combined `@everyone` plus `@DisplayName` in one message, `matchesEveryone('')` and `matchesEveryone('eve')`.
- `Composer.test.tsx` (web) plus mobile composer coverage if present: `@` shows `@everyone` first, `Enter` inserts `@everyone `, `Escape` dismisses.
- `MessageItem.test.tsx` / `MentionText` coverage: broadcast renders as non-link chip, member links unchanged.

Integration (requires `supabase start`, sequential):

- `tests/integration/intro-social.test.ts` style: `send_message('Hi @everyone')` in a 3-member cluster creates 2 `mention` rows (everyone except author), author excluded, left members excluded; `me@everyone` and `@everyoneelse` create none.
- `tests/integration/push.test.ts` style: broadcast yields one `mention` push per recipient token on channel `mentions`, and zero `message` pushes for the same recipients (extends the `:120` no-double-push test).
- `tests/integration/notifications.test.ts` style: recipient with `mentions: false` pref does not see the broadcast in `get_my_notifications()`.

E2E (requires `supabase start` plus `npm run seed:demo` plus `npx playwright install chromium`):

- Extend `e2e/cluster-room.spec.ts:64` pattern: fill `@every`, select `@everyone`, send, assert the timeline shows the non-link chip.

## 7. Verification

Pre-push per `AGENTS.md`:

- `npm run lint`
- `npm run test:coverage` (hard v8 gate: lines 34 percent, functions 33 percent, branches 20 percent; never lower thresholds)
- `npm run build` (`tsc -b` plus `vite build`)
- Migrations changed, so also `supabase db reset` plus `npm run test:integration`
- Shared files changed, so also `node mobile/scripts/sync-db-types.mjs --check`
- E2E for the composer path: `npm run test:e2e` (or at minimum `e2e/cluster-room.spec.ts`)

After realtime migration edits there are none here (no realtime publication change), so no `supabase stop && supabase start` cycle is needed beyond the normal reset.

## 8. Acceptance criteria

- Typing `@` or `@eve` in the room composer lists `@everyone` first; selecting it inserts `@everyone `.
- Sending `Hi @everyone` notifies every other active cluster member with a `mention` row titled `<author> mentioned everyone`, delivers one `mentions`-channel push per token, and renders a non-link chip on web and mobile.
- The author gets nothing; left members get nothing; `mentions: false` pref members see nothing.
- No recipient gets both a `mention` and a `message` push for the same message.
- `me@everyone`, `@everyoneelse`, and `@every` (no match) behave as plain text.
- All gates in section 7 pass.

## 9. Risks and edge cases

- Spam: any member can ping 7 others at mention priority. Mitigations in place: 60 messages/hr per-user rate limit, per-cluster `mentions` opt-out, clusters capped at 8. No dedicated `@everyone` cooldown in v1.
- Collision with display name `Everyone`: broadcast wins by design (section 1.5).
- Case and punctuation: handled by the shared word-boundary rule on both sides; keep the SQL and TypeScript implementations in lockstep (longest-name-first ordering is unaffected since `everyone` is checked first).
- Email: no extra work; the email outbox fans out from the same `notifications` rows under the same gates.
- Scope guard: no changes to posts, signals, votes, DMs, or staff surfaces; room chat only.
