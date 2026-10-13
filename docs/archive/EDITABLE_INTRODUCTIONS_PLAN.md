# Editable Cluster Introductions - Implementation Plan

Status: implemented, verified with lint, unit, coverage, build, sync check, and intro-social integration.

## Decisions (from stakeholder)

- Scope: Web + mobile together.
- Entry points: Profile page + intro route. No new affordances in members tab or room.
- Save semantics: Require all 5 answers, non-empty, same as today. No partial save, no clearing to incomplete.
- Side effects: Silent update. Keep `intro_completed_at` as-is, no notifications, no version history.

## Current behavior

- Web `src/pages/IntroductionsPage.tsx:43-45`: if `membership.data?.intro_completed_at` is set, redirects to `/cluster/:id`. Form state starts empty, so completed users can never revisit or edit.
- Mobile `mobile/app/(app)/cluster/[clusterId]/introductions.tsx:32-40,62-68`: same `done` guard with `router.replace` to room.
- Web profile `src/pages/ProfilePage.tsx:302-316`: shows `Complete your introductions` link only when `answers.length === 0` and `isSelf`. No edit path once answered.
- Mobile profile `mobile/app/(app)/profile/[userId].tsx:273-295`: same, link only on empty state.
- Backend `submit_intro_answers` (`supabase/migrations/0142_open_cluster_at_formation.sql:70-101`): already `INSERT ... ON CONFLICT (user_id, cluster_id, question_id) DO UPDATE`. Re-submit with 5 rows is a silent upsert and re-stamps `intro_completed_at` only if already complete (same value class, no unlock logic). No migration needed for edit.
- Hook `src/features/introductions.ts:89-112`: `useSubmitIntroAnswers` invalidates `intro-progress`, `cluster-membership`, `cluster`, `my-clusters`, but not `member-intro-answers`. Edit needs that extra invalidation so ProfilePage refreshes.

## Goals

1. Let a member who completed intros revisit `/cluster/:id/introductions` and update answers.
2. Prefill form with existing answers, keep 1000 char limit and all-5-required validation.
3. Add `Edit introductions` entry point on own profile (web + mobile).
4. Keep behavior silent: no progress reset, no notifications, no deadline or gating changes.
5. Parity between web and mobile, including synced feature copy.

## Non-goals

- No partial/draft saves.
- No delete or clear-to-incomplete flow.
- No edit history, diff view, or notifications to clustrmates.
- No changes to `intro_questions`, RLS, grants, `get_intro_progress`, or cluster lifecycle.
- No new routes. Reuse existing `/cluster/:clusterId/introductions`.

## Backend

No new migration. Verify by reading live function before coding:

- `submit_intro_answers(uuid, jsonb)` upserts and requires 5 rows to touch `intro_completed_at`. Re-submit path is safe for active members via existing `is_active_member` check and `assert_account_can_write`.
- `intro_answers` select policy allows active members to read own + others answers. No RLS change.
- `database.types.ts` unchanged.

If verification shows divergence from `0142`, stop and re-plan instead of adding a migration silently.

## Web changes

1. `src/features/introductions.ts`
   - In `useSubmitIntroAnswers.onSuccess`, also invalidate `['member-intro-answers', clusterId]`.
   - No signature change: still `{ clusterId, answers: Record<number, string> }`.

2. `src/pages/IntroductionsPage.tsx`
   - Remove the `intro_completed_at` redirect block.
   - Fetch own answers with existing `useMemberIntroAnswers(clusterId, authUserId)`. Need `useAuth` user id.
   - Merge loading states: cluster + membership + questions + ownAnswers.
   - Prefill: `useState` empty plus `useEffect` to seed from `ownAnswers.data` once loaded, without clobbering user typing (only seed if user has not touched form, e.g. `didSeed` ref).
   - Derive `isEdit = (ownAnswers.data ?? []).length > 0`.
   - Copy: title `Tell your cluster who you are` stays for first run; for edit use `Edit your introductions`. Subtitle `Answer below to share who you are.` stays, or `Update anything that changed.` for edit. Button `Save introductions` vs `Save changes`, pending `Saving...` unchanged.
   - Keep `allAnswered` rule and `maxLength={1000}`.
   - After success, `navigate(/cluster/:id)` same as today, plus profile back path works via browser back.
   - Add `data-e2e` hooks if missing for intro inputs and save button (check `e2e/cluster-lifecycle.spec.ts:56-69` selectors).

3. `src/pages/ProfilePage.tsx`
   - In Introductions section, when `isSelf && answers.length > 0`, render secondary `Edit introductions` link/button to `/cluster/${clusterId}/introductions` below the answers list.
   - Keep existing empty-state `Complete your introductions` primary button unchanged.
   - Style with existing tokens only per `docs/DESIGN.md`.

## Mobile changes

Mirror web, in RN components:

1. `mobile/src/features/introductions.ts`
   - Do not hand-edit. Regenerate via `cd mobile && npm run sync:db-types` after web `src/features/introductions.ts` changes. Verify with `--check`.

2. `mobile/app/(app)/cluster/[clusterId]/introductions.tsx`
   - Remove `done` redirect (`useFocusEffect` + early return).
   - Fetch own answers via `useMemberIntroAnswers` from `mobile/src/features/cluster.ts` (already exists) or add same hook to introductions feature if preferred, then prefill same `didSeed` pattern.
   - Same copy and validation semantics as web.
   - After save, `router.replace` to room.

3. `mobile/app/(app)/profile/[userId].tsx:267-318`
   - After answers list, when `isSelf`, add `Edit introductions` pressable linking to `/cluster/[clusterId]/introductions`.
   - Keep empty-state `Complete your introductions` unchanged.

4. `mobile/src/components/IntroChecklistBanner.tsx`
   - No change: banner only shows while viewer intro is pending. Completed users never see it, so edit does not retrigger nudge. Confirm condition stays `intro_completed_at == null`.

## Edge cases

- New member with 0 answers: flow unchanged, `isEdit=false`, empty form.
- Member with 1-4 answers (legacy partial): form prefills what exists, still requires all 5 to save, `intro_completed_at` stays null until 5 saved. Same RPC behavior.
- Concurrent edit on two devices: last write wins per question row, acceptable, no locking.
- Non-member direct URL: existing `This cluster isn't available to you.` path unchanged.
- Rate limits / moderation (`assert_account_can_write`, `0138` wiring): unchanged, errors surface in existing `error` state.
- Empty string or whitespace: still treated as unanswered, button disabled.

## Tests

- Unit/colocated (Vitest, jsdom):
  - `src/features/introductions.test.tsx`: assert `useSubmitIntroAnswers` invalidates `member-intro-answers`.
  - New or extended `IntroductionsPage` test: completed membership no longer redirects, form prefills from `useMemberIntroAnswers`, save calls `submit_intro_answers` with 5 rows.
  - `ProfilePage.test.tsx`: own profile with answers shows `Edit introductions` link with correct `to`.
- Integration (`tests/integration/intro-social.test.ts` style, requires `supabase start` on fresh `db reset`):
  - Submit 5, re-submit 5 with changed text, assert answers updated, `intro_completed_at` still set, no new notifications, `get_intro_progress` still complete.
- E2E (`e2e/cluster-lifecycle.spec.ts`):
  - Extend intro nudge test: after initial save, revisit `/introductions`, assert prefilled, edit one answer, save, assert profile shows updated text.
- Mobile: manual Expo check for prefill, save, profile edit link. No new automated mobile tests unless pattern exists.
- Gates: `npm run lint`, `npm test`, `npm run test:coverage` (do not lower thresholds in `vite.config.ts`), `npm run build`. `node mobile/scripts/sync-db-types.mjs --check` must pass. No migration, so no `db reset` required except for integration run.

## Files to touch

- `src/features/introductions.ts`
- `src/pages/IntroductionsPage.tsx`
- `src/pages/ProfilePage.tsx`
- `mobile/app/(app)/cluster/[clusterId]/introductions.tsx`
- `mobile/app/(app)/profile/[userId].tsx`
- Regenerated: `mobile/src/features/introductions.ts` via sync script
- Tests: `src/features/introductions.test.tsx`, `src/pages/ProfilePage.test.tsx`, new `src/pages/IntroductionsPage.test.tsx`, `e2e/cluster-lifecycle.spec.ts`, `tests/integration/intro-social.test.ts`

## Rollout

1. Implement web hook + page + profile + tests.
2. Run sync script, implement mobile screen + profile link.
3. Run lint, unit, coverage, build, sync check.
4. Run integration intro suite against fresh local stack.
5. Manual verify: first-run save, revisit edit, profile edit link, mobile parity, banner does not reappear after edit.
