# Email Notifications & Appeals — Implementation Plan

Status: **draft, not yet implemented**
Author: DotNetTitan
Scope: transactional outbound email for moderation events + an in-app appeal flow, wired end to end (database → edge function → Resend → user), plus the appeal submission/review UI.

## 1. Goals

The moderation release (0052–0067) notifies users only inside the app. Two gaps remain:

1. **Banned accounts cannot use the app.** A ban is permanent, the user can't log into the full experience, and the only channel today is the restricted-account screen plus a dead `mailto:` link. There is no way to learn of the ban or appeal it outside the app.
2. **A warning, suspension, or hidden message is invisible** to a user who never opens Sensorium in the ban window.

This plan adds:

- **Transactional outbound email** for the full moderation lifecycle, sent from the database through a Supabase Edge Function to Resend, with an outbox + retry pipeline so no notification is ever lost.
- **An in-app appeal page** that banned/suspended users reach by signing in, plus the email CTA that points them there.
- **An admin appeal queue** (list, case detail, accept/reject with a response) inside the existing admin workspace.

### Decisions locked in before writing code

| Decision | Value | Why |
|---|---|---|
| Provider | Resend (API, not SMTP) | Deno-friendly SDK, delivery webhooks, free tier covers current volume |
| Sender | `no-reply@thesensorium.online` | Already the configured sender; one sender for auth + moderation email |
| Direction | **Outbound only** | Resend cannot receive mail; **no `mailto:` and no "reply to this email" anywhere** |
| Appeal media | In-app page (`/appeal`), sign-in required | Reuses existing auth; no token infrastructure; banned accounts can already sign in to the restricted screen |
| Send path | DB outbox → pg_cron → Edge Function → Resend | The enforcement RPCs and the email are in the **same transaction**, so an action and its notification are atomic and never drift |

Appeals are reviewed **in-app by admins only**. There is no Discord or email bridge for appeals in this iteration.

## 2. Architecture

```
┌─────────────┐   RPC (security definer)   ┌──────────────────────────────┐
│ Browser SPA │  report_member, hide,      │        Postgres              │
│             │  warn, restrict, submit_    │  outbound_emails (outbox)    │
│  /appeal    │  appeal, decide_appeal     │  appeals (case table)        │
│  /admin/*   │ ──────────────────────────►│                              │
└─────────────┘                            │  pg_cron: * * * * *          │
                                           │   └─ process_outbound()      │
                                           │        └─ net.http_post       │
                                           │             │                 │
                                           └─────────────┼─────────────────┘
                                                         ▼
                                              ╔═══════════════════════╗
                                              ║ Edge Function         ║
                                              ║ supabase/functions/   ║
                                              ║   send-emails/        ║
                                              ║  claim batch (svc key)║
                                              ║  render template      ║
                                              ║  POST → Resend        ║
                                              ║  mark sent/failed     ║
                                              ╚═══════════════════════╝
                                                         │
                                                         ▼
                                                    ┌─────────┐
                                                    │ Resend  │
                                                    │ (API)   │
                                                    └─────────┘
```

Why outbox + cron instead of a per-row database webhook: the outbox gives automatic retries, a visible queue for ops, batching, and a durable send log that feeds the audit/retention rules. A webhook would fire one HTTP call per row with no retry semantics.

## 3. Email catalog

Every template follows the existing brand family (see §5): shell `#fff8f6`, header "Sensorium", tagline **"Eight strangers. One cluster."**, roboto-like sans (Plus Jakarta Sans), primary CTA `#9d3d1c` pill button, muted footnote block.

All emails are **one-way**: no reply address is mentioned, no `mailto:`, no "Contact us by email". The CTA for restricted users is always the appeal page.

| Template id | Recipient | Trigger | Key content |
|---|---|---|---|
| `message-hidden` | message author | `hide_message` | "Your message was hidden." No cluster/staff detail. |
| `warning-issued` | warned member | `issue_warning` | "A warning was issued on your account." |
| `account-suspended` | suspended member | `apply_account_restriction('suspended')` | Expiry date + "View your status and appeal" CTA → `/appeal` |
| `account-banned` | banned member | `apply_account_restriction('banned')` | "Your account has been permanently banned" + appeal CTA → `/appeal` |
| `restriction-lifted` | member | `apply_account_restriction('active')` **and** auto-lift cron | "Your account is active again." |
| `report-received` | reporter | `report_member` | "We received your report." Reference id only. |
| `report-resolved` | reporter | `resolve_moderation_report` | Generic outcome: dismissed vs actioned **without** internal notes, staff identity, or enforcement detail. Skips when reporter id was anonymized (null). |
| `appeal-received` | appellant | `submit_appeal` | "We received your appeal. We'll review it and email you when a decision is made." |
| `appeal-resolved` | appellant | `decide_appeal` | Outcome text set by the admin + (if granted) "your account is active again." CTA → `/appeal` |

Notes:

- **`report-resolved` changes PRD.md.** PRD currently says "Reporters are not notified in this release when a report they submitted is resolved." With email, we can notify with a generic outcome. The PRD's privacy rule holds: never internal notes, staff identity, or enforcement detail.
- Templates are rendered **server-side only** (Edge Function). The SPA never sees or builds HTML email.
- The in-app `moderation_notice` rows stay as-is; email is an addition, not a replacement.

## 4. Database changes (new migrations)

Migrations are strict and order-dependent; the newest applied file is `0067`. All new files are `0068+` and **never edit an applied migration** — the enforcement functions are redefined with `create or replace` to add the enqueue calls.

### 0068 — outbound email outbox + pg_net

- `create extension if not exists pg_net;` (verify availability on hosted; local Supabase ships it).
- `outbound_email_template` enum:
  `message-hidden, warning-issued, account-suspended, account-banned, restriction-lifted, report-received, report-resolved, appeal-received, appeal-resolved`.
- `public.outbound_emails` table:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid references profiles(id) on delete set null` (retention: keep the row, detach the person, mirroring reports)
  - `recipient_email text not null` (snapshot at enqueue time)
  - `template outbound_email_template not null`
  - `params jsonb not null default '{}'` (display_name, reason, expires_at, appeal_url, outcome, …)
  - `status text not null default 'queued'` (`queued|sending|sent|failed|abandoned`)
  - `attempts int not null default 0`
  - `last_error text`
  - `created_at timestamptz not null default now()`, `updated_at`, `sent_at`
  - indexes: `(status, created_at)`; `(user_id)`.
  - RLS enabled, **no policies** (client never reads/writes; only `security definer` + `service_role`).
- `public.enqueue_email(p_user_id uuid, p_template outbound_email_template, p_params jsonb)` — `security definer`, **granted to nobody**, resolved from `profiles.email`; skipped cleanly if the profile/email is gone. Called only from other `security definer` functions.
- `public.claim_outbound_emails(p_limit integer default 20)` — returns `queued` rows, flips them to `sending`. `security definer`, **granted to service_role only** (the Edge Function uses the service-role key).
- `public.mark_outbound_email(p_id uuid, p_status text, p_error text default null)` — moves `sending → sent|failed`, increments `attempts` on failure, `abandoned` after 5 attempts. Granted to service_role only.
- Outbox sweep: `public.recover_stuck_sending()` re-queues rows stuck in `sending` for > 2 minutes (Edge Function crash safety). Called by the same cron.

### 0069 — appeals

- `public.appeal_status` enum: `submitted, resolved`.
- `public.appeals` table:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid references profiles(id) on delete set null`
  - `appealed_status account_status not null` (snapshot of restriction at submission)
  - `appealed_reason text not null` (snapshot; the reason shown to the appellant is the *public* restriction reason, never internal staff notes — stored as given by the restriction row)
  - `appealed_expires_at timestamptz`
  - `details text check (char_length(details) between 1 and 5000)`
  - `status appeal_status not null default 'submitted'`
  - `response text` (admin-written outcome text, shown to appellant + used in `appeal-resolved` email; **capped at 2000**, because the accept path forwards it as the `apply_account_restriction` lift reason, whose guard already caps reasons at 2000)
  - `decided_by uuid references profiles(id) on delete set null`, `decided_at timestamptz`
  - `created_at`, `updated_at`
  - unique partial index: `one_open_appeal_per_user on (user_id) where status = 'submitted'`
  - RLS enabled, no policies.
- RPCs (all `security definer`; **no direct grants to authenticated — only via RPC**):
  - `submit_appeal(p_details text)` → restricted users only (`status in ('suspended','banned')`, asserting the *effective* status, i.e. treat lapsed suspensions as active → reject). Inserts the appeal, then `enqueue_email('appeal-received')`. Returns the appeal id.
  - `get_my_appeal()` → self, full owned appeal list (most recent first) for the restricted page to render status + any response.
  - `list_appeals_page(p_status, p_limit, p_offset)` → admin-only (`assert_can_manage_roles`) queue rows.
  - `get_admin_appeal(p_appeal_id)` → admin-only case detail (appeal + restriction snapshot + current restriction).
  - `decide_appeal(p_appeal_id uuid, p_accept boolean, p_response text)` → admin-only. Sets `status = 'resolved'`, response, decided_by/at; if `p_accept`, calls `apply_account_restriction(user, 'active', …)` to lift (raising its existing guards/staff rules); then `enqueue_email('appeal-resolved')`. Handles the already-active edge (`restriction_not_active`): resolves the appeal as granted-with-note instead of erroring.
  - Grant the admin RPCs to `authenticated`; grant `claim/mark/recover` to `service_role` only.
- `moderation_actions` gains value `appeal_decided` via `alter type ... add value` → needs its **own migration** (enum value, then 0070 may reference it — same-transaction rule).

### 0070 — enqueue calls inside existing enforcement (create or replace)

Re-wraps the existing functions to add `enqueue_email` calls next to the existing `notifications` inserts. Each is `create or replace` of the current signature so **no schema or grant changes** beyond the additions:

- `report_member` → enqueue `report-received` to the reporter.
- `resolve_moderation_report` → enqueue `report-resolved` to the reporter **when `reporter_id` is not null** (anonymized → skip). Generic outcome text only.
- `hide_message` → enqueue `message-hidden` to the author (existing `v_author <> v_actor` guard preserved).
- `issue_warning` → enqueue `warning-issued`.
- `apply_account_restriction`:
  - `suspended` → `account-suspended` (params: expires_at).
  - `banned` → `account-banned` (params: appeal_url).
  - `active` lift → `restriction-lifted`.
- `lift_expired_suspensions()` (0062 cron) → enqueue `restriction-lifted` per auto-lifted row.
- `decide_appeal` (from 0069) → handled in 0069.

Enqueue lives in the same statement block as the enforcement write, so both commit or neither does.

### 0071 — cron wiring

- Schedule the email pump (replaces/includes 0039's idempotent schedule):
  - every minute: `process_outbound_emails()` → `net.http_post` the Edge Function URL with the shared secret header; Edge Function pulls via `claim_outbound_emails`.
  - every 5 minutes: `recover_stuck_sending()` (timer overlaps the existing `suspension-expiry` job cleanly).
- `process_outbound_emails` must be granted to `postgres` (cron) only; the Edge Function performs no DB write without its secret.

## 5. Email templates / brand spec

Reuse the existing look from the Sign Up Confirmation and Reset Password templates:

- Shell: `background:#fff8f6; padding:40px 16px; font-family:'Plus Jakarta Sans',Arial,sans-serif`; inner max-width `520px`.
- Header: `Sensorium` in `#3a0b00` bold; sub-line **"Eight strangers. One cluster."** in `#802908`.
- Heading: `#3a0b00`, 24px.
- Body text: `#5b403a`, 15px, line-height 1.6.
- CTA: pill `border-radius:999px`, `background:#9d3d1c`, white text.
- Footnote block: `#8a746d`, 13px.

Templates as **plain render functions** in `supabase/functions/_shared/templates.ts` (no framework) — one exported `renderEmail(template, params): { subject, html }` switch, ~150 lines, unit-testable with Deno's built-in test runner if we add a tiny `deno.json` for it.

Rules:

- No `mailto:` and no "reply"/"email us" wording anywhere.
- No staff identity, internal notes/preferences, or enforcement detail. The reason shown in emails/apostrophes is the restriction `reason` from the row.
- CTA URLs derive from `SENSORIUM_APP_URL` env (staging → `https://preview.thesensorium.online`, prod → `https://www.thesensorium.online`, local → `http://127.0.0.1:3000`). `/appeal` for restricted users, `/restricted` fallback text.

## 6. Edge Function `send-emails`

Located at `supabase/functions/send-emails/index.ts`:

1. Verify `x-sensorium-email-secret` header against `SENSORIUM_EMAIL_SECRET`; reject otherwise (verify_jwt disabled for cron-driven integration).
2. `POST /` (cron-triggered): call `claim_outbound_emails(20)` with the service-role client (auto-injected `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` on hosted and in `supabase functions serve`).
3. For each row: render template → `Resend.emails.send({ from: RESEND_FROM, to: recipient_email, subject, html })`.
4. `mark_outbound_email(id, 'sent')` on success; `('failed', message)` on error. `attempts >= 5` → `abandoned` (visible to ops in Studio).
5. Catch-all: return 200 always (cron re-triggers; outbox is the source of truth).

Local dev: `supabase functions serve send-emails` with env `RESEND_API_KEY` set to a test key or a no-op stub. Local tests never hit real Resend — they assert on the `outbound_emails` rows.

## 7. Frontend changes

### Feature module `src/features/appeals.ts`

- `useSubmitAppeal()` → `submit_appeal` mutation, invalidates `['appeals']`.
- `useMyAppeal()` → `get_my_appeal` query, key `['appeals','mine']`.
- `useAdminAppeals({status,page})` → `list_appeals_page`, key `['admin','appeals', …]`.
- `useAdminAppeal(id)` → `get_admin_appeal`, key `['admin','appeals',id]`.
- `useDecideAppeal()` → `decide_appeal` mutation, invalidates appeal + access + moderation keys.
- New hook additions where `admin-moderation.ts` prefers them: keep appeals in their own module to mirror `moderation.ts`/`admin-moderation.ts` split.

### Routes (`src/app/router.tsx`)

- Add `/appeal` under `RequireAuth` with a new `RequireRestricted` guard: signed-in AND effective status `suspended|banned` OR else redirect to `/home`. (Active users get bounced; the page is meaningless to them.)
- Add `/admin/appeals` and `/admin/appeals/:appealId` under the admin shell (already guarded `RequireCapability can_manage_roles` + `admin` session role).
- `AppShell`/`ModeratorLayout` untouched; `AdminLayout` + `StaffNavigation` gain an "Appeals" entry (admin only, route `/admin/appeals`).

### Pages

- **`src/pages/AppealPage.tsx`** (new): the target of the email CTA. Reads `useMyAccess` for current status + `useMyAppeal`. Renders:
  - if an open (submitted) appeal exists → status "Under review" plus the appeal text and a "we've got it" note.
  - if no open appeal and status restricted → the appeal form (textarea + submit, max 5000 chars, inline error mapping). A previously resolved appeal is shown as a "Previous outcome" note above the form so a restricted account can appeal a *new* restriction; the DB's `one_open_appeal_per_user` partial index only bars a second *open* appeal.
  - the resolved status/response view is replaced by the form-forwarding case above; a resolved appeal never blocks a fresh one.
  - sign-out / back-to-restricted affordances.
- **`src/pages/staff/AdminAppealsPage.tsx`** (new): paginated queue, filter by status; row → detail.
- **`src/pages/staff/AdminAppealCasePage.tsx`** (new): shows appellant snapshot (appealed status, reason, expiry), whatever restriction exists now, their appeal text; decision form (accept/reject radio + required response, **max 2000**, matching the lift-reason cap the accept path forwards it into) calling `useDecideAppeal`; guards last-admin rule surfaced through existing `formatError`.
- **`src/pages/RestrictedAccountPage.tsx`**: **remove the `mailto:support@sensorium.app` link** (contradicts the outbound-only decision and the address is wrong anyway; also no such inbox). Replace with a link to `/appeal` and keep the existing "contact support" guidance as in-app only.

## 8. Environment & secrets

No new browser (`VITE_*`) variables. New server-side only:

| Variable | Environment | Set via |
|---|---|---|
| `RESEND_API_KEY` | staging + prod, edge fn env | `supabase functions deploy send-emails --project-ref … --secret-refs` or dashboard secrets |
| `RESEND_FROM` | `no-reply@thesensorium.online` | edge fn env |
| `SENSORIUM_EMAIL_SECRET` | shared between DB cron and edge fn, per environment | GitHub secret + dashboard/CLI secret |
| `SENSORIUM_APP_URL` | staging / prod / local | edge fn env |

Auth emails (welcome / reset) stay on the currently configured sender so all mail shares `no-reply@thesensorium.online`. Verify the hosted project's `[auth.email.smtp]` / sender setting matches this plan in the dashboard (config.toml change only affects local + is updated for local parity).

## 9. CI / deployment notes

- Migrations: follow existing workflow (staging on `develop` merge, prod on `main` merge). No special handling — new files travel like any other.
- Edge function deploy: add `supabase functions deploy send-emails` to `migrate-staging.yml` / `migrate-production.yml` (or a one-off script first, then bake into the workflows). Needs `SUPABASE_ACCESS_TOKEN` + the per-project ref + the new secrets.
- Deliverability: with the domain already DNS-verified for the sender, confirm Resend's SPF/DKIM records are in place for `thesensorium.online` (or the `no-reply` sub-path) and add a DMARC record if not present. This is the one ops task that decides whether appeal emails reach human inboxes.
- `supabase/functions` doesn't touch the Vite build/lint/coverage surface; the `send-emails` function has its own optional `deno.json` for template unit tests and must not be picked up by `npm test` (it matches `src/**` only, so it won't).

## 10. Testing plan

### Integration (`tests/integration/`, requires `supabase start`)

- **emails.test.ts**: every enforcement path queues the right template/recipient/params:
  - hide/restore → `message-hidden` to author (not to the moderator);
  - warn, suspend (with expiry), ban, lift, and **auto-lift** → correct templates;
  - report + resolve → `report-received`, then `report-resolved` to the reporter; anonymized reporter (null on delete) → no enqueue and no crash;
  - outbox lifecycle: `claim_outbound_emails` moves `queued→sending`, `mark_outbound_email` moves to `sent`/`failed`, 5 failures → `abandoned`, stuck `sending` re-queued by `recover_stuck_sending`;
  - actor-not-notified paths, and no email to a deleted profile.
- **appeals.test.ts**:
  - active user cannot `submit_appeal`; suspended + banned can; lapsed suspension → rejected as active;
  - one open appeal per user enforced;
  - `submit_appeal` → `appeal-received` enqueued;
  - non-admin denied `list_appeals_page` / `get_admin_appeal` / `decide_appeal`;
  - `decide_appeal(accept)` lifts restriction (respects `cannot_restrict_staff`, `last_admin`, suspension window rules) and enqueues `appeal-resolved`; reject path keeps restriction;
  - appeal on an already-auto-lifted suspension resolves cleanly (no `restriction_not_active` error).

### Unit (jsdom, `src/**/*.test.tsx`)

- `AppealPage` renders form vs. status states.
- `AdminAppealsPage` / `AdminAppealCasePage` render, filter, decide, error mapping (extend `formatError` with appeal codes if needed).
- `guards.test.tsx`: `RequireRestricted` behavior (restricted passes, active redirects).

### E2E (Playwright, `e2e/`)

- One spec: staff suspends demo account → sign in as that user → `/appeal` shows form → submit → admin sees appeal in queue → decide → user sees response + `appeal-resolved` row in outbox (DB assertion). Browser-visible only; no real email send.

## 11. Docs updates (docs are source of truth)

- **PRD.md**: reporting section "Reporters are not notified…" → reporters receive an email confirmation and a generic resolution notice; add an "Email notifications" section (catalog, outbound-only, one sender); add an "Appeals" subsection (in-app page, admin review, single open appeal, appeal resolved via `apply_account_restriction` lift).
- **TECHNICAL.md**: add `supabase/functions/send-emails` to the repo layout; add Edge Functions + outbox + cron + email env vars to the database/env/deployment sections; note the service-role-only grants for the outbox and why enforcement RPCs stay authenticated-only (mirroring the 0062 lesson).
- **ARCHITECTURE.md**: backend table gains "Edge Functions" (outbox pump → Resend) and Scheduled Jobs already lists cron; add the appeal flow to the application-flow section.
- Note: the plan's earlier reference to `ROLE_BASED_ACCESS_PLAN.md` is stale — that file does not exist in the repo; the appeals capability + outbox service-role boundary are described in this document and in the migration comments instead.

## 12. Decisions (resolved)

These were flagged for review during drafting and are now final. No implementation stalls on them:

1. **Reporters are emailed on resolution — PRD is updated.** `report-resolved` lands in the catalog (generic outcome only: dismissed vs actioned). The PRD line "Reporters are not notified in this release…" is replaced as part of the docs work in §11. The privacy rule holds: never internal notes, staff identity, or enforcement detail.
2. **Appeals are decided by admins only.** Moderators do not see the appeal queue. The appeal is the escalation path on top of a moderation decision, and the high-water capability (`can_manage_roles`, owning permanent restrictions and lifts) already sits with admins. A moderator who wants to lift a suspension they applied can do so in the moderation case UI directly; the appeal queue is the admin-owned review lane.
3. **Ban/suspend emails include the restriction `reason` verbatim**, because it is the public-facing value already stored on the restriction row and the user has a right to know the stated basis. They never contain the moderator's internal note/reason from `resolve_moderation_report` or any staff identity.
4. **`app_url()` reads `email_settings.app_url`, not `auth.settings().site_url`.** `auth.settings()` is not available in the local Supabase CLI (auth schema exposes only `email/jwt/role/uid` helpers), so the app URL comes from a column on the existing `email_settings` table (default `http://127.0.0.1:5173`; staging/production seed it per environment in CI). No new `VITE_*` vars; `SENSORIUM_APP_URL` feeds the seed.
5. **The outbox and appeals tables are granted DELETE to `service_role`** so integration tests can drain them between runs; client (`anon`/`authenticated`) access remains fully revoked, so this is test/ops-only surface.

## 13. Out of scope

- Inbound email / `mailto:` support (needs Workspace/Zoho; deferred).
- Discord integration for appeals.
- Report-history screen (future per PRD).
- Email quiet-hours, send-volume tuning, digests, or i18n.