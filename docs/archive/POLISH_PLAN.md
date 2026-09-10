# Polish Plan — Chat Reactions, Password Visibility, Room Presence

Three UX fixes, each applied on **both web (`src/`) and mobile (`mobile/`)**.
Read order reference: `ARCHITECTURE.md` → `PRD.md` → `DESIGN.md` → `TECHNICAL.md`.
Tailwind tokens live in `docs/DESIGN.md`; mobile equivalents in
`mobile/src/lib/theme-tokens.ts`. `src/features/cluster.ts` and
`mobile/src/features/cluster.ts` are manually-kept twins — edit both.

---

## Task 1 — Instant visual reaction toggles

### Problem
Reacting to a chat message waits on a full DB round-trip before the icon
appears: `useToggleReaction` does a SELECT (does mine exist?), then
INSERT/DELETE, then `onSuccess` invalidates the reactions query and refetches.
Compare `useTogglePostLike`/`useToggleCommentLike` (`src/features/posts.ts`),
which patch the query cache optimistically in `onMutate`, roll back on error,
and reconcile on settle.

### Files
- `src/features/cluster.ts` — `useToggleReaction` (line ~209)
- `mobile/src/features/cluster.ts` — same function (mirror)
- `src/features/cluster.test.tsx` — hook tests (mobile mirror has no test file;
  mobile relies on the web copy being behavior-identical)
- `src/pages/cluster/RoomView.test.tsx` — mocks `useToggleReaction`; will need
  a mutate/spinner behaviour check if any

### Data model
`message_reactions(message_id, user_id, emoji, created_at)`; PK is the triple.
The room reads reactions for the **loaded** messages via
`useClusterReactions(clusterId, messageIds)` →
`['cluster-reactions', clusterId]` returning `Reaction[]`. The UI derives:
- `reactionsByMessage`: `Map<message_id, Reaction[]>` (web `RoomView.tsx`
  ~191, mobile `room.tsx` ~204)
- `myReactionKeys`: `Set<"message_id:emoji">` of the caller's reactions (web
  ~201, mobile ~214)

So optimistic patching must add/remove a single `Reaction` row in the
`['cluster-reactions', clusterId]` cache; the memos re-derive automatically.

### Change — rewrite `useToggleReaction` to be optimistic
Keep the mutation's server write a raw INSERT/DELETE (there is no toggle RPC;
RLS guards own-row writes). Add, mirroring `useTogglePostLike`:

```
onMutate: async ({ messageId, emoji }) => {
  if (!clusterId || !userId) return
  await queryClient.cancelQueries(['cluster-reactions', clusterId])
  const prev = queryClient.getQueryData<Reaction[]>(['cluster-reactions', clusterId])
  queryClient.setQueryData<Reaction[]>(['cluster-reactions', clusterId], (cur) => {
    const base = cur ?? prev ?? []
    const mine = (r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji
    if (base.some(mine)) return base.filter((r) => !mine(r))
    return [...base, { message_id: messageId, user_id: userId, emoji,
                        created_at: new Date().toISOString() }]
  })
  return { prev }
},
onError: (_e, _vars, ctx) => {
  if (clusterId && ctx?.prev) queryClient.setQueryData(['cluster-reactions', clusterId], ctx.prev)
},
onSettled: () => {
  if (clusterId) void queryClient.invalidateQueries(['cluster-reactions', clusterId])
}
```

Remove the pre-check SELECT in `mutationFn`; keep it a pure
insert-or-delete (or branch on `myReactionKeys` passed from the caller to avoid
an extra read — see "Open question" below).

### Guard rails
- The realtime cluster channel also streams `message_reactions`? No — it
  streams `messages`, `signals`, etc.; reactions arrive only via the query.
  Therefore `invalidate` on settle is the reconciliation path (safe, no
  duplicate from realtime).
- Fast double-tap: the optimistic toggle flips state on first tap; a second tap
  while the first INSERT is in flight could double-write. Post likes avoid this
  with a server-side toggle RPC. For reactions keep it simple (mirror the
  client, debounce via `isPending` on the toggle button) OR add a
  `toggle_message_reaction` RPC. See "Open question".

### Acceptance
- Tap an emoji on a message → it appears immediately, no spinner/gap.
- Tap again → disappears immediately.
- On error the prior state restores; on success the server truth reconciles.
- Works identically on web + mobile.

---

## Task 2 — Show/hide password fields

### Problem
Password inputs are plain `type="password"` (web) / `secureTextEntry` (mobile)
with no way to verify what was typed.

### Files — web
- `src/pages/auth/LoginPage.tsx` — 1 password field
- `src/pages/auth/SignUpPage.tsx` — Password + Confirm (2 fields)
- `src/pages/auth/ResetPasswordPage.tsx` — 1 field
- Web uses `lucide-react` (available) → `Eye` / `EyeOff` icons.

### Files — mobile
- `mobile/src/components/ui.tsx` — add a shared `PasswordField` (reuses
  `Field`'s styling, adds an inline right-side toggle)
- `mobile/app/(auth)/login.tsx` — swap `<Field … secureTextEntry …>` → `<PasswordField>`
- `mobile/app/(auth)/signup.tsx` — Password + Confirm
- `mobile/app/(auth)/reset-password.tsx` — 1 field
- Mobile uses `lucide-react-native` → `Eye`/`EyeOff`.

### Web implementation (per field)
Wrap the `<input type="password">` in a `relative` container; absolutely-place a
`button type="button"` at the right edge that toggles `type`
`"password" ↔ "text"` and swaps `Eye`/`EyeOff`. Keep the existing styling
tokens and focus ring. Add `aria-label="Show password"` / `"Hide password"`
and `aria-pressed`. Do not change layout width — icon overlays the input's
right padding (add `pr-10`).

Smallest duplication-free option: a local `PasswordInput` component extracted
per page, or a shared `src/components/PasswordInput.tsx`. Prefer the shared
component since three pages use it.

### Mobile implementation
Extend `ui.tsx` with `PasswordField` that renders like `Field` but manages
`secureTextEntry` state and places a `Pressable` eye toggle inside the input
row (absolute right, ≥44pt hit target). Screens replace their password
`Field`s. Confirm `confirm`/`confirmPassword` fields also get the toggle
(both visible makes matching-by-eye possible).

### Acceptance
- Eye icon present on every password/confirm field (login, signup, reset), web
  + mobile.
- Toggling shows/hides the text and swaps the icon.
- Field value, labels, autofill, and submit logic unchanged.
- Existing tests that find inputs by label still pass (toggle is an extra
  button, not a renamed input).

---

## Task 3 — "In the room now" always visible (web)

### Problem
- Mobile (`mobile/app/(app)/cluster/[clusterId]/room.tsx`, ~470–510): the
  presence strip is a fixed row **above** the scrollable `FlatList` — always on
  screen.
- Web (`src/pages/cluster/RoomView.tsx`, ~516–565): the presence strip is the
  **first child inside the scroll container**, so it scrolls away. User must
  scroll to the top to see who's in the room.

### Goal
Web presence strip behaves like mobile: pinned above the message timeline,
never scrolled out of view.

### Web change — `src/pages/cluster/RoomView.tsx`
The current structure (comment at ~518) intentionally places the strip inside
the scroll surface. Restructure:

```
<section flex flex-col>            ← unchanged outer section
  {/* presence strip — pulled OUT of the scroll div, sibling above it */}
  <section aria-label="Who is in the room" …>…existing strip JSX…</section>
  <div ref={scrollRef} scroll>…messages/timeline only…</div>
  {/* composer stays below */}
</section>
```

Mechanically: cut the strip `<section>` (lines ~524–565) out of the scroll div
and paste it as the first child of the outer `<section>`, before the
`<div ref={scrollRef}>`. Keep its styling/markup identical so the e2e selector
`getByRole('heading', { name: /In the room now/i })` and
`RoomView.test.tsx` presence test keep passing.

Check surrounding layout: the outer section is `flex min-h-0 flex-1 flex-col`
with the scroll div `flex-1`. Adding the strip as a fixed sibling that doesn't
grow is fine; it should use `shrink-0` so it never collapses. The loading /
empty / "no messages" states and `scrollToEnd` logic are unaffected since the
scroll ref stays on the timeline div.

Also consider making it collapse into a compact pill on small widths if space
is tight (already uses `flex-wrap`), but no layout redesign required — match
mobile's compact single-row behavior which already caps at 8 avatars.

### Acceptance
- On web, the "In the room now" strip stays visible while scrolling through
  long conversations (no scroll-to-top needed).
- Mobile unchanged (already correct).
- No change to read-marker, pinned/scroll-to-latest behaviour, or the presence
  count logic.

---

## Testing matrix (both apps)

| # | Scenario | Expect |
|---|----------|--------|
| 1 | React to a message (web + mobile) | Emoji appears instantly, no gap |
| 2 | Toggle the same reaction off | Disappears instantly |
| 3 | Force a network error on react | Icon reverts (rollback) |
| 4 | Password fields on login/signup/reset | Eye toggle reveals/hides, web + mobile |
| 5 | Long room conversation, scroll deep | Presence strip still visible (web), mobile unchanged |
| 6 | Realtime messages still stream while scrolled | No regression (timeline unchanged) |

Run `npm run lint`, `npm test`, `npm run build` (root), and
`npx tsc --noEmit` + `npm run lint` in `mobile/` before PR. E2E suites
(`e2e/`, Playwright) cover the presence heading selector and room flows —
re-run `npm run test:e2e` if the local stack is up.

## Decision (recorded) — Task 1 uses a toggle RPC
**Option A is chosen:** add a `toggle_message_reaction` RPC migration before
the client change. Rationale: atomic INSERT-or-DELETE on the PK removes the
double-tap race, drops the pre-check SELECT, and matches the existing
`toggle_post_like` pattern. `useToggleReaction` will call `.rpc()` and patch
the reactions cache optimistically in `onMutate` (rollback on error,
invalidate on settle). No pure-client fallback.

## Open question (resolved) — Task 1 implementation approach
~~Optimistic reactions are simplest with a server-side atomic
`toggle_message_reaction` RPC~~ — resolved above (Option A). The migration is
`NNNN_toggle_message_reaction.sql`, security definer, checks active membership
+ unlocked cluster, and performs INSERT-or-DELETE on
`(message_id, user_id, emoji)`; add an RLS/integration test.
