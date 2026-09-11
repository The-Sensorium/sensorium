# Admin & Moderation End-to-End Test Plan (Manual Browser Pass)

Companion to the implementation plan at
`docs/archive/ADMIN_MODERATION_PRODUCTION_PLAN.md` (all 8 phases shipped).
This doc lets a fresh session run the full manual browser verification that
automated tests do not cover: cross-page flows, visual states, and
role-specific behavior in a real browser.

## 0. Context for a New Session

- **Branch:** `feat/admin-moderation-production` (all work lives here; single
  PR into `develop` at the end — do not PR yet).
- **What shipped:** Phases 1–8 (dashboard, queue v2, case workspace, post/comment
  cases, account operations, policies, appeals v2, audit v2, rate limits, SLA
  watch, ops health) plus extras: staff console visual treatment, More-menu nav,
  mobile browsers forced to member shell, history-aware back navigation,
  labeled triage badges, `timeUntil` for due dates.
- **Migrations:** `0117`–`0127` in `supabase/migrations/`. Never edit an applied
  migration; add a new one. Regenerate `src/lib/database.types.ts` by hand plus
  `mobile/src/lib/database.types.ts` (`Copy-Item` — see AGENTS.md rule).
- **Key frontend files:** `src/pages/staff/` (dashboard, queue, case + 6 panel
  components, accounts, appeals, audit), `src/features/admin-moderation.ts`,
  `src/features/appeals.ts`, `src/features/admin-accounts.ts`,
  `src/components/StaffNavigation.tsx`, `src/lib/use-back-or.ts`,
  `src/lib/device.ts`, `src/lib/database.types.ts`.
- **Automated coverage (already green, do not re-prove unless touching code):**
  `npm run lint`, `npm test` (unit/component), `npm run test:coverage` (hard
  gate: lines 34%, functions 33%, branches 20% — never lower),
  `npm run test:integration` (requires `supabase start`; 20+ files),
  `npm run build` (`tsc -b` + vite).
- **Pre-push gate (repo rule):** `lint` + `test:coverage` + `build`; since
  migrations changed: `supabase db reset` + `test:integration`.

## 1. Local Environment Setup

1. `supabase start` (Docker Desktop must be running).
2. `npm run seed:demo` — writes `.env`, creates `diya@demo.example /
   sensor123` in cluster "Aurora". Reseed any time fixtures get messy.
3. `npm run dev` → `http://localhost:5173`.
4. Recreate staff logins (wiped by every `supabase db reset`; NOT in seed):
   - `staff-e2e@demo.example / sensor123` → grant `admin` via
     `user_roles` (`grant_reason: 'e2e'`, `granted_by` = own id).
   - `moderator-e2e@demo.example / sensor123` → grant `moderator`.
   - Both need `display_name` + `onboarding_completed_at` on profiles.
   - A Node one-off with `@supabase/supabase-js` (service-role key from
     `supabase status`) is the fastest way; delete the script afterwards.
5. URL → anon key mapping lives in `.env` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`).

## 2. Fixture Recipes (IDs Change Every Reseed — Recreate, Don't Hardcode)

All via member logins (`diya`, `member-0/1/2/3/4@demo.example`, all
`sensor123`) calling RPCs, or service-role inserts:

| Fixture | How |
|---|---|
| Open member report | `report_member(Aurora, rio, harassment, details)` as diya |
| Open post report | service-role insert into `posts` (Aurora, rio author), then `report_post` as member-0 |
| Open comment report | service-role insert into `post_comments`, then `report_post_comment` as member-1 |
| Suspended user + open appeal | `apply_account_restriction(suspended, +24h)` as staff, then `submit_appeal` as the member |
| Banned user + open appeal | same with `banned` (for second-review flow) |
| Breached report | open report, then service-role `update reports set due_at = past` |

Duplicate guards: one open report per reporter→target pair; pick fresh
reporter/target combos per fixture (the suite has `member-0..4` for this).

## 3. Scenario Checklist

### Phase 1 — Dashboard & Queue (admin AND moderator)
- [ ] `/admin` and `/moderator` render counts; cards deep-link to filtered queues.
- [ ] Queue tabs: Unassigned / Assigned to me / Overdue / All open / Closed.
- [ ] Filters compose in URL: status, type, reason, severity, search (debounced),
      order. Try `?status=bogus` — must fall back, never crash.
- [ ] Claim from queue → success message, button disappears.
- [ ] Moderator sees same queue; `/admin/*` bounces them to workspace select.

### Phase 2 — Case Workspace
- [ ] Case page: labeled badges (Status/Severity/Target), meta grid, reporter +
      target panels with account links, timeline, triage, enforcement.
- [ ] Notes: add → edit (shows “edited”) → delete (two-step confirm).
- [ ] Severity change updates badge + Due time; escalation records reason.
- [ ] Admin reassign via staff search; moderator attempting assign gets a
      permission error (admin-only path).
- [ ] Claim → release cycle; stale-assignment warning for other moderators.

### Phase 3 — Post / Comment Cases
- [ ] Post case renders title/body/media + Hidden/Deleted badges; Hide post →
      case closes Actioned; Restore reopens the loop.
- [ ] Comment case shows parent-post context; Hide/Restore comment works.
- [ ] No member-view links anywhere (removed deliberately — staff are rarely
      cluster members).

### Phase 4 — Accounts
- [ ] `/admin/accounts` + `/moderator/accounts` search (debounced); admin rows
      show email, moderator rows do not.
- [ ] Detail: banner, identity, summary counts, history rows (pill + title /
      detail / links), lift-restriction flow with reason.
- [ ] Moderator viewing a banned account sees “only an admin” instead of lift.
- [ ] Queue no longer has per-row Account buttons (removed as redundant).

### Phase 5 — Policies
- [ ] Policy picker defaults to the report reason; template shows guidance;
      “Use this notice” fills the user-facing reason.
- [ ] Warn/suspend disabled until a reason is typed (hint visible).
- [ ] Enforcement with internal note → note lands in timeline even though the
      case closes in the same interaction.
- [ ] Stored `policy_code` visible on the audit row (drawer metadata).

### Phase 6 — Appeals
- [ ] Appeals queue tabs + claim; overdue flagging.
- [ ] Case page: appellant panel, original decision + original-case link,
      recent reports, internal note, decision templates, policy select.
- [ ] Grant lifts restriction; ban-appeal reject requires second review from a
      DIFFERENT admin (request → checkbox → reject); same-admin reject blocked.

### Phase 7 — Audit
- [ ] Server filters: action list (27 types), search, dates, UUID fields.
- [ ] Row click → drawer with labeled metadata rows (not raw JSON), case /
      account / appeal deep links.
- [ ] Export CSV downloads ≤1000 rows.

### Phase 8 — Ops & Limits
- [ ] Admin dashboard shows Operations health cards + scheduler freshness dots.
- [ ] Moderator dashboard hides the ops section.
- [ ] Rate limits are RPC/trigger-level (covered by integration tests) — browser
      check is the friendly slow-down copy, only triggerable after 10
      reports/hour or 3 appeals/24h (use throwaway accounts).
- [ ] Breached reports re-badge the Reports tab within ~15 min (SLA watch).

### Cross-Cutting UI (from review passes)
- [ ] More-menu: no clipped hovers; page-click dismisses; badge counts intact.
- [ ] Back buttons return to the previous page (appeal → case → back = appeal);
      deep links fall back to parent lists.
- [ ] Queue snippets clamp at 2 lines; no raw `snake_case` codes visible
      anywhere; due/expiry times say “in X”, never “just now” for the future.
- [ ] Light AND dark mode: pills, buttons, dots all legible in both.

## 4. Gotchas That Burned Review Sessions

1. **Stale Vite transform cache:** the dev server occasionally serves old
   bundles (symptom: UI missing code you just wrote). Touch the file to bump
   mtime; if that fails, restart `npm run dev`. Always suspect this before
   suspecting your code.
2. **`page.goto` vs in-app clicks:** `goto` performs full document loads, which
   reset React Router history keys — back-navigation MUST be tested with
   in-app link clicks, never `goto` chains.
3. **Shared-stack audit pollution:** the audit log is append-only across runs,
   so integration assertions must be target-scoped, never global-empty.
4. **`db reset` wipes staff logins** (they are not seeded) — recreate per §1.4.
5. **Dev-server ownership:** if a previous session restarted `npm run dev`
   detached, the original terminal process may be dead; `:5173` owner wins.
6. **Playwright MCP ref churn:** snapshots expire after each action; re-snapshot
   before clicking, and prefer `run_code_unsafe` locators for repeated rows.
7. **Mobile shell check:** needs a real mobile UA (unit tests cover logic);
   via MCP, open a new context with iPhone UA in `run_code_unsafe` — plain
   viewport resize does NOT trigger it.
