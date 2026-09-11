# EOL Findings Fix Plan (Decision A + Audit Policy + Appeal Freshness)

Fixes the 3 findings from the manual browser pass in
`docs/ADMIN_MODERATION_EOL_TEST_PLAN.md` (run 2026-09-11 on
`feat/admin-moderation-production`). Decision A (true-reversal restore)
approved. No code changes yet — implement in order below.

Repo rules that constrain this work (AGENTS.md):
- Migrations are order-dependent (`supabase/migrations/NNNN_*.sql`); **never
  edit an applied migration** — add a new one. Latest is `0127`, so the new
  file is `0128_eol_restore_reopen_and_audit_policy.sql`.
- Every table keeps RLS; privileged ops stay in `security definer` functions
  with grants. `supabase db lint --local` must pass.
- `src/lib/database.types.ts` is hand-synced; mirror any RPC shape change
  there AND in `mobile/src/lib/database.types.ts` via `Copy-Item` (never
  hand-edit mobile copies beyond the copy).
- Components never call Supabase directly; reads go through
  `src/features/` TanStack Query hooks.
- Pre-push gate: `npm run lint` + `npm run test:coverage` (hard gate lines
  34% / functions 33% / branches 20%, never lower) + `npm run build`;
  migration changed → `supabase db reset` + `npm run test:integration`.
- Tests colocate (`foo.ts` + `foo.test.ts`); integration in
  `tests/integration/**/*.test.ts` (needs `supabase start`).

## Finding 1 — Restore is unreachable after Hide closes a case

### Root cause (verified in code + DB)
- `src/pages/staff/ModerationCasePage.tsx:121`:
  `canAct={claimedByMe && open}`. `EvidencePanel` renders Hide/Restore
  buttons only when `canAct` (`EvidencePanel.tsx:98,229,284`). Hide closes
  the case, so Restore unmounts with it.
- Server independently blocks it: `restore_post` (`0073:381-383`) and
  `restore_post_comment` (`0073:458-460`) call
  `assert_post_report_actionable`, which raises `report_not_open` unless the
  report is `pending`/`reviewing` (`0073:283`).
- `restore_message` (`0054:617-643`) has NO report assertion and never
  closes the case (`hide_message` at `0054:589-615` writes only the action
  row) — messages need the UI fix only, no RPC change.
- `ModerationCasePage` already computes `isModerator` (`can_moderate`) and
  `isAdmin` (`can_apply_permanent_restriction`) at lines 83-84 — reuse them.

### Target behavior (Decision A: true reversal)
1. On a case whose post/comment/message is hidden, ANY staff viewer with
   `can_moderate` sees **Restore post / Restore comment / Restore message**
   — whether the case is open or closed, claimed or not.
2. Restore on an **open** case keeps today's semantics: assert actionable
   (assignee match for `reviewing`) + close as `actioned`.
3. Restore on a **closed** (`actioned`/`dismissed`) case reopens it to
   `reviewing`, `assigned_to` = restorer, `last_activity_at` = now, and
   writes the `post_restored` / `post_comment_restored` audit row linked to
   the report. Reason stays `'false positive review'` from the UI; RPC keeps
   `reason_required` / `reason_too_long` guards.
4. Hide buttons keep the existing gate (claimed-by-me + open). Only Restore
   gets the wider gate — least-privilege preserved because the server still
   enforces `assert_can_moderate()`.

### Migration `0128` (part 1 — reopen on restore)
- New helper `reopen_report_as_reviewing(p_report_id, p_note)`:
  `security definer`, `assert_can_moderate()`, locks the report row,
  raises `report_not_found` when missing, `report_not_closed` when still
  `pending`/`reviewing`; else sets `status='reviewing'`,
  `assigned_to=v_actor`, `resolution_note=coalesce(p_note, resolution_note)`,
  `reviewed_by=v_actor`, `reviewed_at=now()`, `last_activity_at=now()`,
  `updated_at=now()`. Touch `due_at`? No — recompute nothing; the SLA clock
  keeps the original `due_at` so reopened cases that are overdue
  immediately flag breached (honest signal, matches SLA-watch semantics).
- Rewrite the tail of `restore_post` / `restore_post_comment` (same
  signatures — `database.types.ts` untouched):
  ```
  if p_report_id is not null then
    select status into v_report_status from reports where id = p_report_id;
    → missing: report_not_found
    → pending/reviewing: existing assert_post_report_actionable + close_post_report_as_actioned (unchanged)
    → actioned/dismissed: reopen_report_as_reviewing(p_report_id, p_reason)
  end if;
  ```
- `restore_message`: no change (already assertion-free).
- Grants: functions are `create or replace` with identical signatures, so
  existing grants survive (same pattern as `0125:24`). No new tables, RLS
  untouched. Run `supabase db lint --local` after.

### UI changes (part 2 — show Restore on closed cases)
- `ModerationCasePage.tsx`: pass `canRestore={isModerator}` to
  `EvidencePanel` (staff routes already guarantee moderator-or-admin; the
  capability check is belt-and-braces and matches `isAdmin` usage below).
- `EvidencePanel.tsx`: add `canRestore: boolean` prop; thread it to the
  message block (`{canAct ? …}` at :98 stays for Hide, Restore uses
  `canRestore`), `ReportedPost` (:229) and `ReportedComment` (:284):
  Hide keeps `canAct && …`, Restore renders when
  `canRestore && hidden && id && !deleted`.
- `ReportedPost`/`ReportedComment` need split props (today one `canAct`
  gates both buttons): add `canRestore` alongside, e.g.
  `{canAct && !hidden ? <Hide/> : null}{canRestore && hidden ? <Restore/> : null}`.
  Deleted-author content (`deleted`) still shows the snapshot note only.
- Copy: after restore succeeds the existing `run()` success banner
  ("Action completed successfully.") plus timeline entry
  (`post_restored`) confirm it; no new strings except reusing
  `'false positive review'`.
- `CasePanels.test.tsx`: extend — closed case + hidden post + moderator
  → `Restore post` present, `Hide post` absent; non-staff (`canRestore`
  false) → neither. Mirror for comment and message blocks.

### Integration tests (new file `tests/integration/restore-reopen.test.ts`)
Follow the existing per-file setup pattern (isolated users via service
role, target-scoped assertions — never global-empty per the plan gotcha):
1. Open post report → claim (admin A) → hide → assert case `actioned` +
   post `rejected` → restore as admin B (different admin, case unclaimed
   by B) → assert post `approved`, case `reviewing` assigned to B,
   `post_restored` audit row with `report_id` set.
2. Same loop for comment (`post_comment_restored`, `approved`).
3. Restore on OPEN case keeps old semantics (closes `actioned`).
4. Restore with `p_report_id` pointing at a `pending` case assigned to
   someone else → still `cannot_resolve_not_assigned_to_you`.
5. Moderator (non-admin) can restore + reopen (moderate-only path).
6. Restore on missing report id → `report_not_found`; on open case the
   new `report_not_closed` never fires (only the reopen helper raises it —
   cover by calling the helper path via an `actioned` case twice: second
   restore raises `post_not_found_or_not_hidden` since content is already
   approved).

### EOL re-verification (browser, per test-plan §3 Phase 3)
Post case: Hide → `Actioned` + `Hidden` badge → **Restore post now visible**
→ click → case `Reviewing` reassigned to me + timeline `post_restored`.
Same for comment. Message case: Hide (stays open) → Restore still offered.

## Finding 2 — `policy_code` stored but invisible in audit

### Root cause (verified)
- `apply_account_restriction` / `decide_appeal` write
  `moderation_actions.policy_code` (EOL pass wrote `spam` on our warning —
  confirmed via psql; `metadata` holds only `{"type":"warning"}`).
- `get_moderation_audit_v2` (`0125:261-276`) does NOT select `a.policy_code`;
  drawer renders `row.metadata` only (`ModerationAuditPage.tsx:118-121`);
  `auditRowsToCsv` (`admin-moderation.ts:639-662`) omits the column.

### Changes (same `0128` migration, second half)
- `DROP FUNCTION public.get_moderation_audit_v2(jsonb, integer, jsonb);`
  then re-`CREATE` identical + `policy_code text` in `returns table` and
  `a.policy_code` in the select list. (DROP is required — Postgres
  `CREATE OR REPLACE` rejects return-type changes; re-issue both grants
  from `0125:345-351` since DROP drops grants.)
- `src/lib/database.types.ts` (`get_moderation_audit_v2` Returns,
  ~line 2104): add `policy_code: string` (nullable in practice — keep the
  file's non-null convention? Check how sibling nullable columns are typed
  first; `metadata: Json` precedent suggests plain typing is fine, mirror
  whichever convention the nearest nullable column uses). Then
  `Copy-Item src/lib/database.types.ts mobile/src/lib/database.types.ts`.
- `ModerationAuditPage.tsx` drawer: add a `Policy` row (When/Actor/Target/
  Reason block, ~line 93-96) rendered when `row.policy_code` non-null,
  value `row.policy_code.replace(/_/g, ' ')` — same rendering as
  `AdminAppealCasePage.tsx:324-328`. Labeled row, not raw JSON, per plan.
- `auditRowsToCsv`: append `policy_code` header + `row.policy_code ?? ''`
  cell. Old CSVs gain a trailing column — acceptable (export is
  point-in-time, no readers persist the shape in-repo; grep for
  `moderation-audit-` consumers first — there are none outside the page).
- Unit tests colocated: drawer test (row with `policy_code: 'spam'` shows
  `Policy / spam`; null shows no row) in `ModerationAuditPage.test.tsx`;
  `auditRowsToCsv` cases in `admin-moderation.test.ts` (or wherever the
  existing csv tests live — colocate with the helper).
- Integration: extend the restore-reopen warn path or add one assertion in
  the existing audit integration test that `get_moderation_audit_v2`
  returns `policy_code` for a policy enforcement action.

### EOL re-verification
Audit → click the `warning_issued` row → drawer shows `Policy: spam`.
Export CSV → `policy_code` column populated on that row.

## Finding 3 — Appeal case page goes stale after mutations

### Root cause (verified in code)
- The case page reads `useAdminAppealV2` → key
  `['admin', 'appeals-v2', appealId]` (`appeals.ts:233-245`).
- `useAppealMutation.onSuccess` (`appeals.ts:254-257`) invalidates
  `['admin', 'appeals']` + `['moderation']`. TanStack prefix-matching
  compares element-wise: `'appeals' !== 'appeals-v2'`, so the v2 case query
  is NEVER invalidated. Claim + second-review wrote to the DB (verified via
  psql) while the UI sat stale until reload. Same gap in `useDecideAppeal`
  (`appeals.ts:110-115`) — grant happened to paint because its `run()`
  success banner is local state, but the underlying row was stale there too.

### Changes (`src/features/appeals.ts` only, no migration)
- `useAppealMutation.onSuccess`: add
  `void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals-v2'] })`.
- `useDecideAppeal.onSuccess`: add the same line (covers grant/reject
  freshness for both queue `['admin','appeals-v2', filters…]` and case
  `['admin','appeals-v2', id]` keys via prefix match).
- Do NOT remove the existing `['admin','appeals']` invalidation — the v1
  hooks (`useAdminAppeals`, `useAdminAppeal`) still back older surfaces;
  check callers before deleting anything (prefer additive).
- Unit test: colocated `appeals.test.ts(x)` — render a hook harness (the
  repo's existing hook-test pattern, e.g. `QueryClientProvider` + mock
  `supabase.rpc`), fire `useClaimAppeal`, assert
  `queryClient.getQueryState(['admin','appeals-v2', id])` is invalidated.
  If no hook-test harness exists in-repo, add the lightest one mirroring
  neighboring feature tests instead of inventing infra.

### EOL re-verification
Appeal case: Claim → `Assignee: Staff E2E` + Release button appear without
reload. Request second review → checkbox/second-admin notice appears
without reload.

## Execution order + verification
1. Migration `0128` (restore reopen + audit `policy_code`) → `supabase db
   reset` → `npm run seed:demo` → recreate staff logins (§1.4 recipe).
2. UI edits (EvidencePanel/CasePage/drawer/CSV) + `appeals.ts` invalidation.
3. `database.types.ts` + mobile copy.
4. `npm run lint`, `npm test <touched-files>`, `npm run test:coverage`
   (gate unchanged), `npm run build`.
5. `npm run test:integration` (full; append-only audit assertions stay
   target-scoped).
6. Manual browser re-pass of the three EOL items above (in-app clicks, not
   `goto` chains, for back-nav validity).
