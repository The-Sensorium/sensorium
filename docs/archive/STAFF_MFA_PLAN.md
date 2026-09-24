# Staff MFA Plan (Supabase Auth TOTP, Staff-Only)

> Status: approved, ready for implementation.
> Scope: TOTP MFA for web staff roles (`moderator`, `admin`) only. Supabase Auth native TOTP on free tier. Web SPA + Postgres enforcement. Mobile out of scope (staff surfaces are web-only).
> Non-goals: member MFA, phone/SMS MFA (paid add-on), SSO/SAML, changing RLS table policies, changing matching/chat/calls behavior.

## 1. Problem and Current State

Staff accounts hold privileged capabilities (`can_moderate`, `can_manage_roles`, `can_apply_permanent_restriction`, `can_view_audit_log` in `src/features/access.ts:12-17`) enforced by `assert_can_moderate()` and `assert_can_manage_roles()`.

MFA was removed because it had no UI:

- `supabase/migrations/0059_remove_staff_mfa_requirement.sql:1-27` - drops AAL2 check, keeps role-only checks.
- `supabase/migrations/0067_drop_staff_mfa_satisfied.sql:1-82` - drops `jwt_has_aal2()` helper and `staff_mfa_satisfied` from `get_my_access()`.
- `supabase/config.toml:312-322` - `[auth.mfa.totp]` and `[auth.mfa.phone]` enroll/verify are `false`.
- `src/app/guards.tsx:103-111` - `RequireCapability` is role-only, no AAL gate.

Result: one phished staff password gives full moderation and role-admin access. Member accounts stay password-only by design (low value per account, high friction cost).

## 2. Decision: Supabase-Native TOTP, Staff-Only Enforcement

| Option | Verdict |
|---|---|
| Supabase Auth TOTP (`auth.mfa.*`), staff-only AAL2 check in RPC asserts | **Use this.** Free on all plans, enabled by default per Supabase docs, no custom crypto, small UI surface. |
| Phone/SMS MFA | Reject for now. Paid add-on ($75/mo first project, then $10/mo). Unneeded for staff who can use authenticator apps. |
| Custom OTP backend or Edge Function verifier | Reject. Duplicates what Supabase Auth already does. More code, no benefit. |
| Member-wide mandatory MFA | Reject. Friction outweighs account value. Keep optional later if wanted. |
| Dashboard-only MFA for Supabase project members | Complementary, not a substitute. That protects the Supabase dashboard, not app staff logins. Do both, but this plan covers app logins. |

References:

- Supabase docs: `https://supabase.com/docs/guides/auth/auth-mfa/totp`
- Pricing: Basic MFA (TOTP) Included on Free/Pro/Team/Enterprise; Advanced MFA Phone is paid.
- Client pattern: `supabase.auth.mfa.enroll()`, `challengeAndVerify()`, `getAuthenticatorAssuranceLevel()` (already available in `@supabase/supabase-js ^2.111.0` per `package.json:27`).

## 3. What You (Human) Must Do - Dashboard Steps

These cannot be done in code. Do them before merging the enforcement migration, but keep enforcement off until the UI ships (see rollout).

### 3.1 Supabase - enable TOTP per project (~5 min x 2 projects)

Do separately on staging and production (isolated projects per `docs/ARCHITECTURE.md:8`):

1. Dashboard > Authentication > Multi-Factor Authentication > enable TOTP.
2. Keep Phone MFA off (paid, not needed).
3. Confirm local `supabase/config.toml` `[auth.mfa.totp]` is enabled for `supabase start` so integration tests can enroll test factors. This is local-only config, no secrets involved.

### 3.2 No Vercel or EAS changes

No new env vars. TOTP uses the existing Supabase Auth session. Mobile needs nothing (staff shells are desktop-only per `src/app/guards.tsx:144-154`).

## 4. Implementation - Database (Enforcement Point)

Shipped as `0157_staff_optin_mfa_enforcement.sql`: opt-in AAL2 gates in the two staff asserts (enrolled staff must present AAL2, unenrolled staff unaffected), preserving the 0063 account-status check order. First-admin bootstrap was scoped out: staging/production keep the existing manual `service_role` grant path, local seed covers demo roles. Full mandatory enforcement plus recovery codes remain phase 2.

1. Re-introduce AAL2 gate in the two staff asserts (0059 pattern, plus AAL check):
   - `assert_can_moderate()`: require `auth.uid()` not null, `can_moderate(auth.uid())` true, and `auth.jwt() ->> 'aal' = 'aal2'` when the caller holds a staff role.
   - `assert_can_manage_roles()`: same with `can_manage_roles(auth.uid())`.
   - Keep `set search_path = public`, `security definer`, existing `revoke` posture. No new grants.
2. Optional read helper: return `aal` or `mfa_enrolled` in `get_my_access()` so the UI can route (enroll vs verify) without a second round trip. Recreate with drop/recreate per 0057/0067 pattern and re-apply `grant execute ... to authenticated`.
3. Staff RPCs already call these asserts (moderation, role admin, appeals v2, audit export). No per-RPC change needed if they funnel through the asserts. Audit each staff `security definer` function to confirm it calls the assert; patch strays.

Enforcement lives here, not in the router. Guards stay UX-only.

## 5. Implementation - Web SPA

### 5.1 New staff MFA module: `src/features/staff-mfa.ts`

Thin wrapper over `supabase.auth.mfa` so pages share behavior:

- `useMfaStatus()`: `getAuthenticatorAssuranceLevel()` + `mfa.listFactors()` via TanStack Query.
- `enrollTotp()`: `mfa.enroll({ factorType: 'totp' })` returns `qr_code`/`secret`, then `mfa.challengeAndVerify({ factorId, code })`.
- `verifyAal2()`: `mfa.challenge({ factorId })` then `mfa.verify({ factorId, challengeId, code })`.
- `unenroll(factorId)`: `mfa.unenroll({ factorId })` for settings/reset.

No secrets persisted. Factor IDs only.

### 5.2 Pages and routes (staff-only, desktop shells)

1. `/admin/mfa-setup` (or `/moderator/mfa-setup` shared component): QR code + secret + confirm-code form. Shown when `useMyAccess()` has staff capability but `aal != aal2` and no verified factor.
2. Login verify step: after `signInWithPassword`, if `getAuthenticatorAssuranceLevel()` returns `currentLevel: aal1, nextLevel: aal2`, render code input instead of redirecting to `/entry`. Reuse existing auth page styling and tokens in `docs/DESIGN.md`.
3. Settings row: show enrolled factors, unenroll/re-enroll. Admin-only reset for locked-out moderators (via existing `can_manage_roles` path, not self-service bypass).

### 5.3 Guards

Extend the post-login resolver in `src/app/guards.tsx` (`SessionRoleResolver`):

- Keep fail-closed behavior: MFA loading blocks staff routing, MFA errors show `AccessErrorScreen` with retry.
- If staff capability present but AAL1 with an enrolled factor, redirect to MFA verify instead of the workspace.
- Members (`member` shell, `/home`) never hit this branch.
- Deliberately nudge-only in this phase: `RequireCapability` and the staff shells do NOT check MFA, so direct `/admin` links stay open until the `0158` AAL2 enforcement migration lands. The banner copy says "will soon require" to match.

## 6. Mobile - Explicitly Out of Scope (Web-Only Decision)

No change. `mobile/` is member-only; staff shells force `member` on mobile (`src/app/guards.tsx:150-154`). Member RPCs never require AAL2, so the app works at AAL1 whether or not the account enrolled via web. Nothing breaks and nobody is locked out.

Mobile members have no enroll/manage UI: that is a deliberate deferral, not an oversight. Rationale: the threat model is staff capabilities (web-only), member MFA is optional, and any member who wants it can enroll once on the web. A mobile enroll screen (settings row, login verify step) gets built only when a real mobile-only member asks for it.

## 7. Tests

- Integration (`tests/integration/`, requires `supabase start`): new `staff-mfa.test.ts`. Matrix: AAL1 staff denied on moderation/role RPCs, AAL2 staff allowed, members unaffected, unenrolled staff routed to setup. Extend `rbac.test.ts` if asserts change shape.
- Unit (`src/**/*.test.ts`): `staff-mfa.ts` helpers, guard redirects (AAL1 staff to verify, AAL2 to workspace, member passthrough), setup page happy/error paths.
- Manual: enroll with Google Authenticator/1Password, login with and without code, lockout recovery via admin reset, staging dashboard TOTP on/off.

Pre-push per `AGENTS.md`: `npm run lint`, `npm run test:coverage` (do not lower gates in `vite.config.ts`), `npm run build`. Migration changed, so also `supabase db reset` + `npm run test:integration`.

## 8. Rollout Order (Avoid Lockout)

1. Ship MFA UI (setup + verify + settings) with AAL2 enforcement OFF. Staff enroll voluntarily.
2. Enable TOTP in Supabase dashboard staging, test end to end, then production.
3. Ship enforcement migration to `develop` (applies to staging via `migrate-staging.yml`), confirm staff can still work, then release `develop` to `main`.
4. Announce recovery path: admin reset + support contact before enforcement goes live.

## 9. Effort

Small: 1 migration, 1 feature module, 2 screens (setup, verify), 1 guard tweak, 1 integration test file. Roughly half a day to a day for TOTP-only staff-only. Becomes medium only with recovery codes UI, re-enroll polish, and audit-log entries for enroll/unenroll.
