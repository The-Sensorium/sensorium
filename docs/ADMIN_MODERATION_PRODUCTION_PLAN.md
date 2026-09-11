# Admin And Moderation Production Readiness Plan

## Purpose

This document reviews the current Sensorium web admin and moderation flow and lays out a detailed implementation plan to make it production-ready. It is based on the current React/Supabase implementation in:

- `src/pages/staff/*`
- `src/features/access.ts`
- `src/features/admin-moderation.ts`
- `src/features/moderation.ts`
- `src/features/appeals.ts`
- `src/app/router.tsx`
- `src/app/guards.tsx`
- `supabase/migrations/0052_*` through `0069_*`, plus post moderation and notification migrations
- `tests/integration/appeals.test.ts`, `tests/integration/emails.test.ts`, `tests/integration/posts.test.ts`
- `e2e/safety.spec.ts`

The current backend has a solid security foundation: RLS is enabled, staff access goes through security-definer RPCs, role and account actions are audited, report claim locks exist, and appeal/restriction paths are covered by integration tests. The web operator experience is still too thin for production operations.

## Current State Summary

### What Already Exists

- Moderator and admin route separation:
  - `/moderator/reports`
  - `/moderator/reports/:reportId`
  - `/admin/reports`
  - `/admin/reports/:reportId`
  - `/admin/appeals`
  - `/admin/appeals/:appealId`
  - `/admin/roles`
  - `/admin/audit`
- Database-backed RBAC:
  - `moderator`
  - `admin`
  - member as implicit base role
- Capability gates:
  - `can_moderate`
  - `can_apply_temporary_restriction`
  - `can_manage_roles`
  - `can_apply_permanent_restriction`
  - `can_view_audit_log`
- Moderation queue:
  - status filter
  - newest/oldest ordering
  - keyset pagination
  - claim case
- Case detail:
  - report metadata
  - reported message text when available
  - claim/release
  - dismiss
  - hide/restore reported message
  - warning
  - temporary suspension
  - admin permanent ban
- Appeals:
  - restricted users can appeal
  - admins can list and decide appeals
  - appeal emails are queued
- Role management:
  - account search
  - grant/revoke moderator/admin roles
  - last-admin and self-action protections
- Audit:
  - append-only moderation action query
  - basic client-side filtering over loaded rows
- Notifications:
  - report and appeal staff unread badges
  - email outbox for report, enforcement, and appeal lifecycle

### Production Readiness Rating

Current state is best described as an MVP-grade trust and safety console with a stronger-than-average database enforcement layer, but an underdeveloped operational layer.

Suggested rating:

- Security model: 7/10
- Operator workflow: 4/10
- Case context and evidence: 3/10
- Policy consistency: 3/10
- Reporting and observability: 2/10
- Test coverage for staff UI: 4/10
- Production support readiness: 3/10

## Major Shortcomings

### 1. No Moderation Dashboard

Staff land directly in a queue. There is no operational overview showing:

- number of pending reports
- oldest unreviewed report age
- reports by reason
- reports by content type
- assigned-to-me workload
- unresolved appeals
- enforcement actions over time
- repeat offender signals
- SLA breaches

Why this matters: production moderation requires prioritization. A flat queue makes it hard to detect backlog, abuse spikes, or urgent safety issues.

### 2. Queue Is Too Basic For Real Triage

The queue only supports status and sort order. It does not support:

- "Assigned to me"
- unassigned only
- content type filter: member, chat message, post, comment
- severity/priority
- report reason groups
- cluster filter
- target account filter
- reporter filter
- date range
- SLA status
- bulk actions
- saved views
- server-side search

The current `get_moderation_queue` response also does not expose enough triage data. It lacks:

- reporter display name
- target current account status
- target prior enforcement count
- target open report count
- content type
- post/comment summary
- assignment age
- last activity timestamp
- priority/SLA fields

### 3. Case Page Lacks Full Context

`ModerationCasePage` shows only the submitted report, a single reported message if present, and action buttons. It does not show:

- reporter history
- target account history
- prior reports grouped by outcome
- prior warnings, suspensions, bans, lifted restrictions
- current restriction state
- current roles of the target
- cluster membership context
- surrounding chat messages
- post/comment context when reports target posts/comments
- media preview for reported images
- reporter-target relationship in the same cluster
- number of reports from other users against the same target/content
- internal case notes
- moderator handoff notes
- timeline of all actions on the case

Why this matters: production decisions need context. Without it, moderators will over-punish, under-punish, or rely on external/manual investigation.

### 4. Post And Comment Moderation Is Backend-Ready But Not UI-Ready

The database supports `report_post`, `report_post_comment`, `hide_post`, `restore_post`, `hide_post_comment`, and `restore_post_comment`. The staff case page, however, only fetches and displays reported chat messages through `get_moderation_message`.

Missing UI/RPC work:

- case detail should identify target kind: member, message, post, comment
- post reports should render post title/content/media
- comment reports should render comment content plus parent post context
- action panel should offer hide/restore post or comment
- queue rows should show target kind
- audit rows should link post/comment actions back to case detail

### 5. No Severity, Priority, Or SLA Model

Reports currently have status only: `pending`, `reviewing`, `actioned`, `dismissed`.

Missing concepts:

- severity: low, medium, high, urgent
- priority score derived from reason, repeat reports, content type, and target history
- SLA target by severity
- due_at timestamp
- breached_at or computed breach status
- escalation marker
- abuse category taxonomy beyond the current reason enum

Current reasons are useful but too coarse for operations:

- harassment
- hate_speech
- spam
- inappropriate_content
- other

Production needs more structured policy mapping, while preserving a member-friendly reporting UI.

### 6. No Internal Notes Or Collaboration

There is no way for staff to leave internal notes except the final resolution note. Missing:

- case comments
- private staff-only notes
- handoff note on release
- escalation note
- decision rationale separate from user-facing copy
- note edit/delete policy
- note audit trail

This makes collaboration and escalation brittle.

### 7. Assignment Model Is Minimal

Claim/release exists, but there is no:

- reassignment by admin
- assignment to another moderator
- "my cases" view
- stale assignment detection
- auto-release after inactivity
- workload balancing
- assignment activity heartbeat
- conflict indicator if another moderator acts while the page is open

The database protects reviewing reports from being resolved by another moderator, which is good, but the UI does not make the operational state obvious enough.

### 8. Enforcement Actions Are Too Coarse

Available case actions:

- warning
- hide/restore message
- suspension
- ban
- dismiss

Missing production actions:

- no-violation resolution with structured reason
- educational notice without formal warning
- content-specific warning
- temporary content hide pending review
- account restriction presets
- escalation to admin/legal
- lift restriction from staff console
- combine actions, for example hide content plus warning
- require second admin approval for permanent bans
- require confirmation phrase for permanent bans
- structured enforcement reason codes

Current free-text reasons are good for flexibility, but production reporting and consistency require structured action reasons plus optional notes.

### 9. Appeals Are Too Thin

Appeals are admin-only and functional, but missing:

- appeal assignment
- appeal SLA
- appeal decision templates
- link back to original restriction action and related report
- full target history on appeal page
- second-review requirement for permanent bans
- reopen or duplicate appeal handling
- appeal quality/status categories
- internal appeal notes
- admin decision metrics

The appeal response is user-facing and doubles as lift reason. That is simple, but it conflates internal rationale with external communication.

### 10. Audit Log Is Not Operationally Useful Yet

The audit page filters only the locally loaded rows. Missing:

- server-side filtering
- actor filter
- target filter
- report id filter
- action filter at RPC level
- date range at RPC level
- export
- deep links from audit row to report/appeal/account
- metadata display
- actor and target emails where appropriate for admins
- immutable audit retention job implementation visibility
- audit integrity checks

### 11. No Admin Account Detail Page

Admins can search accounts only inside the grant-role dialog. There is no standalone account page showing:

- profile identity
- account status
- active roles
- active clusters
- report history as reporter
- report history as target
- enforcement history
- appeals
- mutes/report abuse signals
- role history
- manual account actions

This is one of the largest product gaps. Moderators need a target profile view; admins need a full account operations page.

### 12. No Staff Policy Or Decision Framework In The UI

There is no visible policy guidance during review. Missing:

- reason-specific playbooks
- severity definitions
- recommended action ladder
- previous action ladder for target
- copy templates for notices and appeals
- checklist before ban/suspension

Without this, different moderators will handle similar cases inconsistently.

### 13. No Rich Evidence Handling

The `reports.evidence jsonb` column exists, but the web app does not use it. Missing:

- captured content snapshot at report time
- message/post/comment content snapshot
- image storage path snapshot
- reporter client metadata where appropriate
- surrounding context references
- changed/deleted content detection
- immutable evidence rendering

Production moderation should not depend only on live content rows, because content may be edited, deleted, hidden, or anonymized after report creation.

### 14. No Abuse Prevention For Reporting

The backend prevents duplicate open member reports per reporter-target, and post/comment report functions have duplicate guards. Still missing:

- rate limiting report submissions
- spam detection for report abuse
- "reporter reliability" or abuse signals
- throttling repeated false reports
- automatic grouping of duplicate reports against same content
- reporter feedback beyond generic status

### 15. No Observability Or Ops Alerts

No visible evidence of:

- backlog alerting
- SLA breach alerting
- email/push outbox failure dashboards
- moderation RPC error monitoring
- audit anomaly detection
- role change alerting
- ban/suspension volume monitoring

### 16. Testing Gaps

Good integration coverage exists for appeals, emails, and post moderation RPCs. Missing or thin areas:

- unit/component tests for `ModerationQueuePage`
- unit/component tests for `ModerationCasePage`
- unit/component tests for `ModerationRolesPage`
- unit/component tests for `ModerationAuditPage`
- E2E tests for moderator/admin staff paths
- integration tests for queue filters and future SLA/priority logic
- integration tests for audit filters/export
- regression tests for post/comment cases in staff UI
- concurrency tests for claim/release/reassign
- tests around deleted users/content rendering in staff pages

## Target Production Capabilities

### Operator Home

Add `/moderator` and `/admin` dashboard routes before the queue.

Required widgets:

- pending reports count
- oldest pending report age
- assigned-to-me count
- reviewing count
- actioned/dismissed last 7 days
- appeals submitted count for admins
- urgent/SLA-breached count
- report breakdown by reason
- recent high-risk cases
- outbox health summary for admins

Backend:

- `get_staff_moderation_summary()`
- `get_admin_operations_summary()`

Frontend:

- `src/pages/staff/StaffDashboardPage.tsx`
- hooks in `src/features/admin-moderation.ts`

### Production Queue

Add fields to reports:

- `target_kind text` or generated logic from `message_id`, `post_id`, `comment_id`, `target_user_id`
- `severity moderation_severity not null default 'medium'`
- `priority_score int not null default 0`
- `due_at timestamptz`
- `last_activity_at timestamptz not null default now()`
- `escalated_at timestamptz`
- `escalated_by uuid references profiles(id) on delete set null`
- `escalation_reason text`

Add enum:

- `moderation_severity`: `low`, `medium`, `high`, `urgent`

Replace or extend `get_moderation_queue` with:

- status filter
- assignee filter: all, unassigned, assigned_to_me, assigned_to_user
- target kind filter
- reason filter
- severity filter
- SLA filter
- search query
- date range
- cursor pagination

Suggested RPC:

- `get_moderation_queue_v2(p_filters jsonb, p_limit int, p_cursor jsonb)`

Returned fields:

- report id
- target kind
- cluster name
- reporter display name
- target display name
- reason
- severity
- status
- assigned_to
- assigned_to_display_name
- created_at
- due_at
- last_activity_at
- prior_target_reports
- prior_target_actions
- duplicate_open_reports
- snippet

Frontend:

- filter toolbar with saved presets
- tabs for `Unassigned`, `Assigned to me`, `Breached`, `All open`, `Closed`
- stable URL query params for filters
- empty states per filter
- row badges for target kind, severity, SLA, assignment

### Case Workspace

Convert `ModerationCasePage` into a workspace with these panels:

- Case header:
  - status
  - severity
  - target kind
  - SLA due time
  - assignee
  - created and last activity
- Evidence panel:
  - member report details
  - reported content snapshot
  - live content state
  - media preview through signed URLs
  - surrounding chat/post/comment context
- Reporter panel:
  - reporter display name
  - reporter account age
  - reports filed in last 30 days
  - false/dismissed report ratio
- Target panel:
  - account status
  - roles
  - active clusters
  - prior reports
  - prior enforcement
  - current restrictions
- Case timeline:
  - claim/release
  - notes
  - content actions
  - account actions
  - resolution
- Action panel:
  - structured decision reason
  - optional internal note
  - optional user-facing notice template
  - action preview
  - confirmation for destructive actions

Backend RPCs:

- `get_moderation_case_v2(p_report_id uuid)`
- `get_moderation_case_timeline(p_report_id uuid)`
- `add_moderation_case_note(p_report_id uuid, p_note text)`
- `set_moderation_case_severity(p_report_id uuid, p_severity moderation_severity, p_reason text)`
- `escalate_moderation_case(p_report_id uuid, p_reason text)`
- `assign_moderation_case(p_report_id uuid, p_assignee uuid, p_reason text)`

Frontend:

- `src/pages/staff/ModerationCasePage.tsx` refactor into smaller components:
  - `CaseHeader`
  - `EvidencePanel`
  - `ReporterPanel`
  - `TargetPanel`
  - `CaseTimeline`
  - `CaseActionPanel`
- add `src/features/admin-moderation-case.ts` only if `admin-moderation.ts` becomes too large

### Post And Comment Case Support

Backend already has post/comment report and enforcement RPCs. Add staff read RPCs:

- `get_moderation_post(p_report_id uuid)`
- `get_moderation_comment(p_report_id uuid)`
- or include them in `get_moderation_case_v2`

Required fields:

- post id
- title
- content
- image path
- gif url
- author id/display name
- moderation status
- deleted_at
- comment id
- parent comment id
- parent/post context

Frontend:

- render post/comment cases with the same quality as chat message cases
- add hide/restore post actions
- add hide/restore comment actions
- link audit rows to the correct content/report
- shipped in `0120_moderation_post_comment_case.sql` + `EvidencePanel`: case v2 carries `post`/`comment` payloads (author, media, moderation/deleted state, parent post context); staff image preview reuses signed URLs via new `posts-images`/`chat-images` staff-read storage policies (buckets stay private); audit rows link to the case via `report_id`
- deliberately no member-view link on reported posts/comments: staff are rarely members of the reported cluster, so the member route would bounce to the workspace picker; the evidence panel is the reliable preview

Tests:

- unit tests for post case render
- unit tests for comment case render
- integration tests that staff read RPCs do not leak to members
- E2E covering reported post/comment case action
- shipped as `tests/integration/moderation-posts-case.test.ts` (payload shape, member denial, hide-closes-case, timeline entry); the live hide-post flow is additionally verified manually per phase because the demo seed has no posts for scripted E2E

### Account Operations Page

Add admin routes:

- `/admin/accounts`
- `/admin/accounts/:userId`

Add moderator-safe target profile route:

- `/moderator/accounts/:userId`

Moderator version should hide email and role administration unless needed. Admin version can expose email and role history.

Backend:

- `search_accounts_v2(p_query text, p_limit int)`
- `get_staff_account_summary(p_user_id uuid)`
- `get_admin_account_detail(p_user_id uuid)`
- `get_account_moderation_history(p_user_id uuid, p_limit int, p_cursor jsonb)`
- `lift_account_restriction(p_user_id uuid, p_reason text)` as a clearer wrapper around `apply_account_restriction(..., 'active', ...)`

UI sections:

- identity
- current account status
- restriction banner
- roles
- active clusters
- report history
- enforcement history
- appeal history
- admin actions

### Structured Policy And Enforcement

Add tables:

- `moderation_policy_categories`
- `moderation_policy_rules`
- `moderation_action_templates`
- `moderation_decision_reasons`

Minimum viable schema:

- category code
- title
- description
- default severity
- recommended action
- active flag
- sort order

Action RPCs should accept:

- `p_policy_code`
- `p_reason`
- `p_internal_note`
- `p_user_notice`

Keep free text, but require a structured policy code for enforcement actions in production.

Frontend:

- reason dropdown grouped by policy category
- recommended action helper
- notice template picker
- action preview

### Appeals V2

Add fields to `appeals`:

- `assigned_to`
- `review_due_at`
- `internal_note`
- `decision_reason_code`
- `original_action_id`
- `original_report_id`

Add RPCs:

- `claim_appeal(p_appeal_id uuid)`
- `release_appeal(p_appeal_id uuid)`
- `assign_appeal(p_appeal_id uuid, p_assignee uuid, p_reason text)`
- `add_appeal_note(p_appeal_id uuid, p_note text)`
- `get_admin_appeal_v2(p_appeal_id uuid)`
- `list_appeals_page_v2(p_filters jsonb, p_limit int, p_cursor jsonb)`

UI improvements:

- assignment and SLA state
- original enforcement context
- target account history
- internal notes
- decision templates
- separate internal decision reason from user-facing response
- second admin approval workflow for permanent ban appeal rejection

### Audit V2

Add server-side filtering to `get_moderation_audit`.

Suggested RPC:

- `get_moderation_audit_v2(p_filters jsonb, p_limit int, p_cursor jsonb)`

Filters:

- action
- actor id
- target id
- report id
- appeal id
- date from
- date to
- free text query

Add:

- audit detail drawer
- metadata renderer
- links to report, appeal, and account pages
- CSV export RPC for admins, or client-side export over paginated results

### Evidence Snapshotting

On report creation, populate `reports.evidence` with immutable snapshots.

Member/chat report snapshot:

- reported message id
- message content at report time
- message image path at report time
- message created_at
- author id/display name at report time
- cluster id/name at report time

Post report snapshot:

- post id
- title/content at report time
- image path or gif url
- author id/display name
- cluster id/name

Comment report snapshot:

- comment id
- comment content/media
- parent post id/title/content snippet
- author id/display name

Implementation:

- update `report_member`, `report_post`, and `report_post_comment`
- keep evidence JSON small enough for moderation; avoid storing full long conversation transcripts
- store storage paths, never signed URLs
- use staff-only signed URL helper for media previews

### Reporting Abuse And Rate Limits

Add lightweight rate limits:

- max reports per account per hour
- max reports per target per day from same reporter
- max appeals per account per restriction

Suggested table:

- `moderation_rate_limits`

Simpler first step:

- implement rate limit checks directly in report/appeal RPCs using existing rows and timestamps

Suggested errors:

- `report_rate_limited`
- `appeal_rate_limited`

UI:

- friendly member-facing messages
- staff signal on reports from accounts with unusually high dismissed-report rate

### Notifications And Alerts

Add staff alerting:

- SLA breach notification
- high-severity report notification
- appeal nearing SLA notification
- role granted/revoked notification to admins

Backend:

- cron job `detect_moderation_sla_breaches`
- `notify_staff(..., p_admin_only)` already exists and can be reused

Frontend:

- staff nav badges by queue type
- dashboard alert list
- optional email for urgent/admin-only alerts

### Production Observability

Add admin-only operations health page or dashboard card:

- pending email outbox
- failed/abandoned email outbox
- pending push outbox
- failed push outbox
- stuck sending rows
- newest cron heartbeat timestamps

Backend:

- `get_admin_ops_health()`
- expose only counts and status, not secrets or raw payloads

Frontend:

- `/admin/ops` or dashboard section

## Detailed Implementation Phases

### Phase 0: Baseline Review And Test Inventory

Deliverables:

- keep this document as the source plan
- add tracking issues for each phase
- confirm current migrations apply from scratch with `supabase db reset`
- run:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:integration` after Supabase is running

Acceptance criteria:

- current admin/moderation tests are cataloged
- known baseline failures are documented before changes

### Phase 1: Staff Dashboard And Queue V2

Backend:

- add `moderation_severity` enum
- add report columns:
  - `severity`
  - `priority_score`
  - `due_at`
  - `last_activity_at`
  - `escalated_at`
  - `escalated_by`
  - `escalation_reason`
- create `get_staff_moderation_summary`
- create `get_moderation_queue_v2`
- backfill existing reports:
  - `other` and `spam` -> `low` or `medium`
  - `harassment` and `hate_speech` -> `high`
  - set due_at by severity
- review fixes (shipped in `0118_moderation_queue_v2_fixes.sql`):
  - 7-day actioned/dismissed counts use `reviewed_at`, not `created_at`
  - insert triage trigger preserves explicitly set severity/priority/due_at and only backfills defaults, so `urgent` stays reachable
  - queue V2 search escapes LIKE wildcards (`\`, `%`, `_`) via `escape_like_pattern`

Frontend:

- add dashboard page
- change `/moderator` and `/admin` default redirects to dashboard
- build queue filters and URL query state
- keep old queue hook until V2 is tested, then remove it
- review fixes:
  - whitelist all URL filter params (plus assignee UUID check) so tampered query strings fall back to defaults instead of crashing the RPC
  - "Assigned to me" tab uses `sla=open` to match the dashboard card and the assigned-count semantics
  - debounced queue search (300ms) plus `keepPreviousData` to avoid per-keystroke RPC storms and spinner flicker
  - dashboard urgent section has an error state with retry instead of rendering the empty state
  - `StaffNavItem.end` for exact dashboard highlighting (prefix match lit both Dashboard and Reports)

Tests:

- unit tests for new hooks
- component tests for dashboard empty/loading/error/data states
- component tests for tampered-URL filter sanitization and the urgent error branch
- integration tests for queue filter permissions and ordering

### Phase 2: Case Workspace V2

Backend:

- create case notes table:
  - `moderation_case_notes`
  - `id`
  - `report_id`
  - `author_id`
  - `note`
  - `created_at`
  - `edited_at`
  - `deleted_at`
- create timeline RPC
- create `get_moderation_case_v2`
- add assignment/escalation/severity RPCs

Frontend:

- split `ModerationCasePage` into panel components
- add timeline
- add notes
- add target/reporter summaries
- show current assignment and stale-page warnings
- add action confirmation modals
- shipped as `src/pages/staff/components/`: `CaseHeader`, `EvidencePanel`, `ReporterPanel`, `TargetPanel`, `CaseTimeline` (owns note composer/edit/delete), `CaseActionPanel` (triage + enforcement)
- review fixes: UNION timeline aliases output columns explicitly (ORDER BY sees first-SELECT names); queue-v2 row types mark LEFT JOIN columns nullable

Tests:

- component coverage for each case panel
- mutation tests for claim, release, assign, notes, and actions
- integration tests for notes and assignment permissions
- integration spec `tests/integration/moderation-case.test.ts`: member denial, context shape, note CRUD scoping, admin-only assign, escalation severity bump, severity guard + audit

### Phase 3: Post/Comment Staff Moderation

Backend:

- add post/comment data to case V2 RPC
- ensure staff media preview uses signed URLs through existing private storage rules or a narrow RPC/helper

Frontend:

- render post/comment evidence
- add hide/restore post actions
- add hide/restore comment actions
- link audit rows to the correct content/report

Tests:

- integration tests for staff case reads on post/comment reports
- component tests for post/comment case UI
- E2E test: report a post/comment, admin opens case, hides content, case closes actioned

### Phase 4: Account Operations

Backend:

- create account summary/detail RPCs
- create account moderation history RPC
- create explicit lift restriction RPC

Frontend:

- add account search page
- add account detail page
- link target names in queue/cases/audit/appeals to account detail
- expose lift restriction for permitted staff

Tests:

- permissions tests for moderator vs admin views
- integration tests for account detail redaction
- component tests for account pages

### Phase 5: Structured Policies And Decision Templates

Backend:

- create policy/action template tables
- seed initial policy categories in a migration
- extend action RPCs with optional policy code first
- after UI adoption, require policy code for production enforcement actions

Frontend:

- add policy selector to action panel
- add recommended action copy
- add user notice templates
- separate internal notes from user-facing messages

Tests:

- template rendering tests
- integration tests for policy code validation
- E2E case resolution with structured policy code

### Phase 6: Appeals V2

Backend:

- add assignment, due date, internal notes, original action/report references
- add appeal claim/release/assign/note RPCs
- create appeal detail V2 RPC

Frontend:

- improve appeal queue filters
- improve appeal case page with original decision context and account history
- separate internal rationale from user-facing response
- add second-review flow for permanent ban appeal rejection

Tests:

- integration tests for appeal assignment and second review
- component tests for appeal decision states
- E2E admin appeal grant/reject

### Phase 7: Audit And Export

Backend:

- add audit filters
- include `appeal_id` where applicable in audit metadata or a first-class column
- create export-safe audit query

Frontend:

- server-side audit filters
- audit detail drawer
- links to case/account/appeal
- CSV export

Tests:

- integration tests for audit filters
- component tests for audit metadata rendering

### Phase 8: Rate Limiting, SLA Alerts, And Ops Health

Backend:

- add report/appeal rate limits
- add SLA breach cron
- add admin ops health RPC
- optionally add role-change staff notifications

Frontend:

- friendly rate-limit errors
- dashboard SLA cards
- ops health cards

Tests:

- integration tests for rate limits
- integration tests for SLA cron
- component tests for ops health states

## Migration Strategy

Follow the repo rule: never edit applied migrations. Add new ordered migrations.

Suggested migration sequence:

- `0117_moderation_severity_and_queue_v2.sql`
- `0118_moderation_case_workspace.sql`
- `0119_moderation_post_comment_case_context.sql`
- `0120_admin_account_operations.sql`
- `0121_moderation_policy_templates.sql`
- `0122_appeals_v2.sql`
- `0123_audit_filters_and_export.sql`
- `0124_moderation_rate_limits_sla_ops.sql`

Keep each migration narrow and testable. Regenerate `src/lib/database.types.ts` after schema/RPC changes and sync mobile database types if shared generated files are required.

## Frontend File Plan

Likely new files:

- `src/pages/staff/StaffDashboardPage.tsx`
- `src/pages/staff/StaffDashboardPage.test.tsx`
- `src/pages/staff/AdminAccountsPage.tsx`
- `src/pages/staff/AdminAccountDetailPage.tsx`
- `src/pages/staff/components/CaseHeader.tsx`
- `src/pages/staff/components/EvidencePanel.tsx`
- `src/pages/staff/components/ReporterPanel.tsx`
- `src/pages/staff/components/TargetPanel.tsx`
- `src/pages/staff/components/CaseTimeline.tsx`
- `src/pages/staff/components/CaseActionPanel.tsx`
- `src/pages/staff/components/PolicySelector.tsx`
- `src/pages/staff/components/AuditDetailDrawer.tsx`

Likely updated files:

- `src/app/router.tsx`
- `src/app/layouts/ModeratorLayout.tsx`
- `src/app/layouts/AdminLayout.tsx`
- `src/features/admin-moderation.ts`
- `src/features/appeals.ts`
- `src/features/notifications.ts`
- `src/lib/database.types.ts`

Consider splitting feature modules only after they become unwieldy:

- `src/features/admin-dashboard.ts`
- `src/features/admin-accounts.ts`
- `src/features/moderation-case.ts`

## Backend Design Notes

### Prefer RPCs Over Direct Table Policies

Continue the current pattern:

- no direct client access to sensitive staff tables
- narrow security-definer RPCs
- `assert_can_moderate`
- `assert_can_manage_roles`
- explicit row shaping for staff reads

### Avoid Overloading RPCs

This repo has already had PostgREST ambiguity fixes. Use versioned function names or drop old signatures before replacement.

Preferred:

- `get_moderation_queue_v2`
- `get_moderation_case_v2`

Avoid:

- overloaded functions with the same name and defaulted parameters

### Preserve Privacy Boundaries

Member-facing views must never expose:

- staff identity
- internal notes
- exact enforcement detail when the PRD says generic outcome only
- reporter identity to target
- target enforcement detail to reporter

Staff/admin views can expose more context, but still avoid unnecessary disclosure. Moderators probably do not need full email visibility; admins do.

### Keep Audit Append-Only

Do not mutate or delete audit records through the app. If retention pruning is implemented, do it through scheduled database maintenance and document it.

## Test Plan

### Unit And Component Tests

Add tests for:

- `ModerationQueuePage`
- `ModerationCasePage`
- `ModerationRolesPage`
- `ModerationAuditPage`
- `StaffDashboardPage`
- account pages
- policy selector
- appeal V2 states

Use mocked feature hooks for page tests, following the existing `AdminAppealsPage.test.tsx` pattern.

### Integration Tests

Add or expand integration specs:

- reports queue V2 filters
- severity/SLA backfill and computation
- report evidence snapshotting
- case notes permissions
- assignment/reassignment permissions
- post/comment case context permissions
- account summary redaction
- policy-code validation
- appeal assignment and second-review rules
- audit V2 filters
- rate limits
- SLA cron notifications

### E2E Tests

Add staff seeded test data, then cover:

- moderator can open dashboard and queue
- moderator can claim a report
- moderator can add note
- moderator can hide reported content
- moderator can warning/suspend within limits
- admin can ban with confirmation
- admin can manage roles
- admin can decide appeal
- admin can inspect audit log

Keep selectors based on `data-e2e` attributes, per repo convention.

## Rollout Plan

1. Ship read-only dashboard and queue V2 behind existing staff routes.
2. Add case V2 read model while preserving old action RPCs.
3. Add notes, assignment, severity, and escalation.
4. Add post/comment UI actions.
5. Add account operations page.
6. Add structured policies as optional.
7. Make structured policy code required for enforcement.
8. Add appeals V2.
9. Add audit filters/export and ops health.
10. Enable SLA alerts and rate limits after staff has visibility into them.

## Production Acceptance Criteria

Before calling the admin/moderation flow production-ready:

- staff can triage by severity, assignment, content type, reason, and SLA
- every report target kind can be reviewed in the case UI
- every enforcement action has a structured policy reason and audit entry
- moderators have enough target/reporter context to decide without leaving the console
- admins have an account operations page
- appeals include original decision context and internal notes
- permanent bans require stronger confirmation and, ideally, second admin review
- audit log supports server-side filtering and useful linking
- evidence snapshots survive content edits/deletions/account deletion
- report abuse is rate-limited
- SLA breaches are visible and alertable
- email/push outbox health is visible to admins
- integration tests cover all staff RPC permission boundaries
- E2E tests cover the main moderator and admin workflows
- `npm run lint`, `npm test`, `npm run build`, and relevant integration/E2E tests pass

## Recommended First Pull Request

Start with Phase 1 because it improves production usefulness without disturbing enforcement semantics too much.

Scope:

- add severity/due fields to reports
- create `get_staff_moderation_summary`
- create `get_moderation_queue_v2`
- add staff dashboard
- add queue filters for unassigned, assigned to me, severity, target kind, reason
- add tests for new hooks and dashboard

Do not bundle case notes, account operations, or policy templates into the first PR. Those should follow once the new queue shape is stable.
