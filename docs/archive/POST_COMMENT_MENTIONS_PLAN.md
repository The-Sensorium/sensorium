# Post Comment Mentions Plan

Status: Shipped

## Summary

Add @-mention support to post comments on web and mobile: composer autocomplete,
mention rendering, and mention notifications. This closes the gap left by `@`
mention support that already exists in cluster chat (`send_message`) and Signal
replies (`reply_signal`), but not in post comments (`create_post_comment`).

## Why this is not just cosmetic

Today, typing `@Name` in a comment does three wrong things:

1. It does not autocomplete, so the author has to type an exact display name.
2. It renders as plain text, not a mention chip or profile link.
3. It notifies no one. `create_post_comment` never calls `is_mentioned`, so a
   comment mention is silently inert.

Chat and Signal replies share one mention pipeline (`is_mentioned` /
`is_mentioned_everyone` -> `mention` notification -> `mentions` pref -> push /
email -> deep link). Comments should join that pipeline rather than invent one.

## Decisions

- **Scope**: per-member mentions and the `@everyone` broadcast (mirrors chat and
  Signal replies).
- **Surfaces**: web and mobile, for parity.
- **Notification type**: a `mention` row, not a new type. This respects the
  per-cluster `mentions` preference, deep-links to the exact comment, and reuses
  the existing push channel (`mentions`) and email outbox. When the post author
  or the parent-reply author is mentioned, they get the `mention` row instead of
  the generic `post_comment` row, so nobody gets two rows for one comment.

## Current state (verified)

- Shared helpers: `src/features/mentions.ts` (`parseMentions`,
  `parseMentionQuery`, `filterMentionCandidates`, `MentionMember`), mirrored in
  `mobile/src/features/mentions.ts`.
- Web autocomplete: `src/components/MentionListbox.tsx`, used by
  `src/pages/cluster/room/Composer.tsx` and
  `src/pages/cluster/SignalDetailPage.tsx`.
- Web rendering: `src/pages/cluster/room/MentionText.tsx` (composes
  `LinkifiedText`, so URLs still linkify).
- Mobile autocomplete: `mobile/src/components/room/MentionSuggestions.tsx`, used
  by `mobile/src/components/room/Composer.tsx`.
- Mobile rendering: `mobile/src/components/room/MentionText.tsx`.
- Comment bodies today use `LinkifiedText` only: `src/components/CommentItem.tsx:87`
  and `mobile/src/components/CommentItem.tsx:101`.
- Comment composers today are plain textareas: `src/components/CommentThread.tsx`
  (`renderComposer`) and `mobile/src/components/CommentComposer.tsx`.
- Backend: `create_post_comment`, live body in
  `supabase/migrations/0163_mute_notification_suppression.sql:137`. It inserts
  only `post_comment` notifications (post author and parent-reply author) and
  never parses mentions.
- Reference implementation to mirror: `supabase/migrations/0199_signal_reply_mentions.sql`
  (`reply_signal` mention fan-out and the "skip the generic notify when the
  target was mentioned" rule).

## Backend: migration `0207_post_comment_mentions.sql`

Reissue `create_post_comment` with the same signature
(`uuid, text, text, text, uuid`), so grants from `0099` still apply and no
overload churn is needed. Keep the existing validation and inserts, add mention
fan-out.

Declare:

```sql
v_mentions uuid[];
v_broadcast boolean := false;
v_author_name text;
```

After the comment and self-like inserts, when `p_content is not null`:

1. `v_broadcast := public.is_mentioned_everyone(p_content)`.
2. If broadcast, select every active cluster member except the actor
   (`cluster_members.left_at is null`). Otherwise select members whose
   `display_name` matches via `public.is_mentioned(p_content, m.display_name)`,
   excluding the actor. Mirror `0199` exactly.
3. When `v_mentions is not null`, insert `mention` rows:
   - `title`: `<author name>` + `' mentioned everyone'` or `' mentioned you'`.
   - `body`: `null` (same shape as Signal/chat mention rows).
   - `payload`: `jsonb_build_object('post_id', p_post_id, 'comment_id', v_id)`.
   - Skip any recipient in `user_mutes` who muted the actor.

Then adjust the two existing `post_comment` inserts so a mentioned target is not
double-notified (mirror `0199:78-79`):

- Post author row: add `and (v_mentions is null or not (v_author = any(v_mentions)))`.
- Parent-reply author row: add the same guard for `v_parent_author`.

No enum, preference, push-channel, or email changes are needed: `mention` is
already in `notification_type` (`0001`), maps to the `mentions` pref
(`0056`, `0080`), to the `mentions` push channel (`0100` and later), and to the
email outbox.

Constraints to respect:

- `p_content` can be null for media-only comments: guard all mention work behind
  `p_content is not null`.
- Comment content max stays 1000 (existing `content_out_of_range`).
- Keep `security definer set search_path = public` and the existing checks
  (`assert_account_can_write`, membership, `cluster_unlocked`, `empty_comment`,
  `single_media_only`, `invalid_reply_target`).

## Notification deep link

`src/features/notifications.ts` `notificationTarget` (`mention` case, line 473)
has no post/comment branch, so a tapped comment mention would fall back to the
cluster. Add, before the message/signal checks:

```ts
case 'mention':
  if (postId && commentId) return { to: `/posts/${postId}?comment=${commentId}` }
  if (postId) return { to: `/posts/${postId}` }
  ...
```

`payloadCommentId` already reads `comment_id`, so no new helper is needed.
Confirm the synced mobile copy of `notifications.ts` picks this up (see
Synced copies below).

## Web changes

- `src/pages/posts/PostDetailPage.tsx`: derive `members` already available as
  `useClusterMembers(clusterId)` (line 49) and pass a `MentionMember[]` down to
  `CommentThread`.
- `src/components/CommentThread.tsx`:
  - Add a `members: MentionMember[]` prop (plus thread the current user id, which
    is already available via `useAuth`).
  - In `renderComposer`, add mention state and reuse `parseMentionQuery`,
    `filterMentionCandidates`, and `MentionListbox`, exactly as
    `room/Composer.tsx` does (autocomplete, keyboard selection, insertion).
  - Pass `members` to every `CommentItem`.
- `src/components/CommentItem.tsx`: replace `<LinkifiedText text={comment.content} />`
  with `<MentionText content={comment.content} members={members} clusterId={clusterId} />`.
  Keep the existing reply-target `@{repliedToName}` prefix (it is a reply
  affordance, not a mention).
- Tests: extend `src/components/CommentThread.test.tsx` (suggestion listbox while
  typing `@`, inserts the name) and add a `CommentItem` assertion that a stored
  mention renders as a profile link.

## Mobile changes

- `mobile/app/(app)/posts/[postId].tsx`: `members` is already fetched via
  `useClusterMembers` (line 39). Pass a `MentionMember[]` to both `CommentComposer`
  and `CommentThread`.
- `mobile/src/components/CommentComposer.tsx`:
  - Add mention state and reuse `parseMentionQuery`, `filterMentionCandidates`,
    and `MentionSuggestions`, mirroring `mobile/src/components/room/Composer.tsx`
    (including the Android returnKeyType handling used there).
  - The existing `isTyping` chrome hide and GIF logic are unaffected.
- `mobile/src/components/CommentThread.tsx`: add a `members` prop and pass it to
  each `CommentItem`.
- `mobile/src/components/CommentItem.tsx`: swap `<LinkifiedText ... />` for
  `<MentionText content={comment.content} members={members} />` inside the body
  `<Text>`, keeping the `@{repliedToName}` reply prefix.
- No change to `comment-helpers.ts` (reply resolution is independent of
  mentions).

## Tests

- Integration (`tests/integration/posts.test.ts`), mirroring
  `tests/integration/intro-social.test.ts` (Signal reply mention cases):
  - `create_post_comment` mentions a member: one `mention` row to them with
    `payload.post_id` / `payload.comment_id`.
  - `@everyone` in a comment notifies every other active member.
  - A mentioned post author / parent author gets the `mention` row and no
    `post_comment` row (no double notify).
  - Mutes and the `mentions` pref suppress the row (reuse the `muted-notifications`
    helpers if convenient).
  - Mid-word `@` and a name that continues into another word do not mention.
  - Media-only comment (null content) writes no mention rows and still succeeds.
- Unit: `src/components/CommentThread.test.tsx`, and web/mobile composer mention
  tests where a sibling surface already has one to copy.

## Docs and changelog

- `mobile/CHANGELOG.md` under `Unreleased > Added`: "You can now @-mention
  members in post comments, with suggestions as you type and tappable names,
  just like in chat."
- Note the new capability in `docs/PRD.md` (posts/comments section) and, if the
  mention pipeline is described there, `docs/TECHNICAL.md`.
- Add a row to `docs/archive/README.md` once shipped.

## Synced copies and gates

- If any `src/features/*` file copied by `mobile/scripts/sync-db-types.mjs`
  changes (`notifications.ts`, `mentions.ts`, `posts.ts`), run
  `node mobile/scripts/sync-db-types.mjs --check` and commit the regenerated
  mobile copies. Do not hand-edit generated copies.
- Migration strict rules: never edit `0163`; add `0207`. Remote DBs migrate only
  on merge (staging on `develop`, production on `develop` -> `main`).
- Pre-push gates: `npm run lint`, `npm run test:coverage`, `npm run build`;
  `supabase db lint --local`; `supabase db reset` + `npm run test:integration`
  (no seed, per AGENTS); mobile `npm run lint` + `npm test`.

## Risks and open questions

- `@everyone` in a comment notifies the whole cluster from a low-signal surface.
  Kept for consistency; if noise becomes a problem, restrict comments to
  per-member mentions (one-line change in the migration).
- A post author who disabled the `mentions` pref but not `post_comment` will stop
  seeing a comment notification when that comment names them. This mirrors chat
  and Signal behavior; document it rather than special-casing.
- Display names with spaces rely on the existing word-boundary rule in
  `is_mentioned`; no new ambiguity is introduced.
