# Turnstile Bot Protection Plan (Supabase Auth CAPTCHA)

> Status: web implemented on `feat/turnstile-captcha` — `CaptchaSection` + SignUp/Login/Forgot/VerifyEmail wiring + tests green. Still pending: dashboard steps (§3), staging/prod enablement in rollout order (§7), mobile Phase 2 (§6).
> Scope: Cloudflare Turnstile for Supabase Auth on web SPA (primary), Expo mobile (secondary), staging + production (both free-tier Supabase projects).
> Non-goals: custom backend, Edge Function captcha for forms, changing RLS/RPC, changing email templates.

## 1. Problem & Current State

Sensorium has **no bot protection** on auth today:

- `supabase/config.toml:214-219` — `[auth.captcha]` is commented out / disabled.
- Web calls with no `captchaToken`:
  - `src/pages/auth/SignUpPage.tsx:33` — `supabase.auth.signUp()`
  - `src/pages/auth/LoginPage.tsx:22` — `supabase.auth.signInWithPassword()`
  - `src/pages/auth/ForgotPasswordPage.tsx:20` — `supabase.auth.resetPasswordForEmail()`
  - `src/pages/auth/ResetPasswordPage.tsx:25` — `supabase.auth.updateUser()` (no captcha applicable —authed session)
- Mobile mirrors with no `captchaToken`:
  - `mobile/app/(auth)/signup.tsx:32`
  - `mobile/app/(auth)/login.tsx:21`
  - `mobile/app/(auth)/forgot-password.tsx:19`
- What we do get for free: per-IP rate limits (`sign_in_sign_ups=30/5min`, `token_verifications=30/5min` in `config.toml:199-213`), email confirmation (`enable_confirmations=true`), 8-char client password check. This slows casual abuse but does **not** stop distributed bot signups, password-spray, or reset-email spam — which burns the small free-tier quotas (50k MAU, 5 GB egress, limited auth emails).

Supabase does **not** protect you automatically. It has native Turnstile/hCaptcha support, but you must (a) turn it on in the dashboard per project and (b) send `captchaToken` from the client. Cloudflare Turnstile itself is free for unlimited verifications; Supabase Auth captcha is GA and available on the free plan.

References:

- Supabase docs: `https://supabase.com/docs/guides/auth/auth-captcha`
- Dashboard toggle: Project Settings → Auth → Bot and Abuse Protection → Enable CAPTCHA protection
- Frontend pattern: `await supabase.auth.signUp({ email, password, options: { captchaToken } })` (same for `signInWithPassword`, `resetPasswordForEmail`)

## 2. Decision: Turnstile (Not hCaptcha)

| Option | Verdict |
|---|---|
| Cloudflare Turnstile, Managed mode | **Use this.** Invisible for most users, free/unlimited, best conversion, works with Supabase natively. |
| hCaptcha | Fallback only. Visible image challenges, more friction, free tier has limits. |
| Custom captcha + Edge Function verify | Reject. Duplicates what Supabase already does server-side; more code to maintain, no benefit for auth flows. |
| Cloudflare Bot Fight Mode / WAF only | Complementary, not a substitute. Protects the Vercel frontend domain, not the Supabase auth API directly. Can add later. |

## 3. What You (Human) Must Do — Dashboard / Cloudflare Steps

These cannot be done in code. Do them **before** merging the frontend PR, but enable enforcement **after** the frontend is deployed (see §7 rollout order — otherwise you lock out all logins).

### 3.1 Cloudflare — create widget(s) (~10 min)

1. Log in to `dash.cloudflare.com` → Turnstile → Add Widget.
2. Recommended: **two widgets** (isolates staging from prod):
   - `sensorium-staging`: domains `127.0.0.1`, `localhost`, `preview.thesensorium.online`, plus each Vercel feature-preview domain if you want captcha tested there (e.g. `*.vercel.app`) — or skip previews.
   - `sensorium-prod`: domain `www.thesensorium.online` (add apex/root if used).
   - Minimum viable: one widget with all domains. Fine to start; split later.
3. Mode: **Managed** (invisible, Cloudflare decides when to challenge).
4. Copy per widget: **Site Key** (public, goes in frontend env) + **Secret Key** (private, goes only in Supabase dashboard — never in git).
5. For local/E2E testing note Cloudflare's **test keys** (no real challenge):
   - Site key `1x00000000000000000000AA` + any dummy secret → always passes.
   - Site key `2x00000000000000000000AB` → always fails. Use to test error path.

### 3.2 Supabase — enable enforcement per project (~5 min × 2 projects)

Do separately on **staging** and **production** (isolated projects per `docs/ARCHITECTURE.md:§8`):

1. Dashboard → Authentication → Bot and Abuse Protection → Enable CAPTCHA protection → provider **Cloudflare Turnstile** → paste widget **Secret Key** → Save.
2. Confirm `supabase/config.toml` local `[auth.captcha]` stays **disabled/commented** — local `supabase start` has no Turnstile secret, and E2E/seed run locally. Cloud config is dashboard-only; do not commit secrets to `config.toml`.
3. Optional hardening (same screen / Auth settings, free-tier safe):
   - Leaked-password protection: ON.
   - `minimum_password_length`: raise to 8 to match the client check (currently 6 in `config.toml:183`).
   - Keep `enable_confirmations=true`; keep rate limits as-is initially.

### 3.3 Vercel — set public site keys

- `preview` env (develop): `VITE_TURNSTILE_SITE_KEY=<staging site key>`.
- `production` env (main): `VITE_TURNSTILE_SITE_KEY=<prod site key>`.
- No secret in Vercel ever. Site key is public by design.
- Mobile (EAS): equivalent `EXPO_PUBLIC_TURNSTILE_SITE_KEY` if Phase 2 ships (see §6).

## 4. Implementation — Web SPA

### 4.1 New shared component: `src/components/TurnstileWidget.tsx`

Wrap `@marsidev/react-turnstile` (the library Supabase docs use) so pages share behavior:

```tsx
// Props: siteKey, onToken(token|null), onError?, theme?: 'light'|'dark'|'auto'
// Behavior:
// - renders nothing (returns null) when siteKey is empty → local dev / E2E path
// - Managed mode, single explicit render per form
// - exposes reset via ref/key so pages can reset after submit or on expiry/expired
```

Rules:

- No new design tokens — widget inherits page theme; pass `theme` from existing theme util if trivial, else default `auto`. No new colors/radii per `docs/DESIGN.md`.
- Token is short-lived: store in page state, clear on `onExpire`/`onError`, force re-solve before submit.
- Fail closed when key is configured: disable submit while `captchaToken == null`. Fail open only when key is **absent** (local dev) — never in staging/prod builds with a key present.

### 4.2 Page changes (web)

| File | Change |
|---|---|
| `src/pages/auth/SignUpPage.tsx` | Add widget + `captchaToken` state; pass `options: { emailRedirectTo, captchaToken }` to `signUp`; reset widget after success/failure; surface captcha errors via existing `error` alert. |
| `src/pages/auth/LoginPage.tsx` | Same pattern for `signInWithPassword({ email, password, options: { captchaToken } })`. |
| `src/pages/auth/ForgotPasswordPage.tsx` | Same pattern for `resetPasswordForEmail(email, { redirectTo, captchaToken })`. |
| `src/pages/auth/ResetPasswordPage.tsx` | **No change** — `updateUser()` runs on an authed recovery session, no captcha field. |
| `src/lib/` config | Read `import.meta.env.VITE_TURNSTILE_SITE_KEY` (empty string locally). No secret. |

Sketch (signup):

```tsx
const [captchaToken, setCaptchaToken] = useState<string | undefined>()
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
// ...
<TurnstileWidget siteKey={siteKey} onToken={setCaptchaToken} />
// submit:
await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect, ...(captchaToken ? { captchaToken } : {}) } })
```

Gate: `disabled={submitting || (siteKey && !captchaToken)}` with helper text "Verifying you're human…" when key present but no token yet.

### 4.3 Deps & config

- `npm i @marsidev/react-turnstile` (web only).
- `.env.example` (if present) + README env section: document `VITE_TURNSTILE_SITE_KEY` (empty = captcha bypassed locally).
- `supabase/config.toml`: leave `[auth.captcha]` commented with a one-line comment pointing here (local stack intentionally unenforced).

### 4.4 Unit / component tests (colocated, per repo convention)

- Update `src/pages/auth.test.tsx` mocks to assert `captchaToken` is forwarded when present and omitted when absent.
- New `src/components/TurnstileWidget.test.tsx`: renders null without siteKey; renders widget + fires `onToken` with key.
- Keep `npm run test:coverage` gate green (lines 34%, functions 33%, branches 20% — never lower).

## 5. E2E, Integration, Seed — Must Not Break

- **E2E (`e2e/`, Playwright):** runs against local `supabase start` where captcha is OFF + `VITE_TURNSTILE_SITE_KEY` unset → widget renders null, submit enabled, existing specs (`golden-path`, `safety`, etc.) pass unchanged. Add one spec asserting signup/login forms submit with no widget when key is absent. Do **not** enable real captcha in CI E2E; optionally add a manual staging check (see §8).
- **Integration (`tests/integration/`):** unchanged — exercises RLS/RPC directly, no auth-captcha path. No new migration, so no `supabase db reset` strictly required, but run it in pre-push per `AGENTS.md` if anything under `supabase/` is touched (it won't be).
- **`npm run seed:demo` (`scripts/seed-demo.mjs`):** uses service-role/admin API which bypasses captcha. Verify once on staging after enablement that the seeder still works.

## 6. Mobile (Expo) — Phase 2, Required Before Enforcement If Mobile Ships Logins

> Enforcement is **server-side and global per project**: once you flip the Supabase toggle, *every* `signUp`/`signIn` without a valid token fails — including the Android app. Do not enable prod enforcement until mobile either (a) sends tokens or (b) you explicitly accept mobile lockout (don't).

`@marsidev/react-turnstile` does not run in React Native. Options, recommended first:

1. **WebView Turnstile (recommended):** small `TurnstileWebView` component hosting a minimal HTML page with the Turnstile JS widget; extracts token via `onMessage`; then `supabase.auth.signUp({ ..., options: { captchaToken } })` from `mobile/app/(auth)/signup.tsx:32`, `login.tsx:21`, `forgot-password.tsx:19`. Use `EXPO_PUBLIC_TURNSTILE_SITE_KEY`. Libraries exist (`react-native-turnstile`, `rn-turnstile`) — evaluate vs. a ~50-line own WebView to avoid a stale dep.
2. **Hosted auth fallback:** open system browser to a tiny web page (Vercel-hosted `/auth/mobile-verify`) that solves Turnstile and deep-links the token back. More moving parts; only if WebView proves unreliable.
3. **Defer mobile enforcement:** if mobile is not yet in production use, ship web first with enforcement ON and gate mobile release on Phase 2. Document the lockout explicitly; test a mobile login against staging after enablement to confirm the failure mode before deciding.

Mobile work copies nothing from `src/lib` (captcha widget is web-only); `mobile/scripts/sync-db-types.mjs` unaffected. `mobile/README.md` gets a short section when Phase 2 lands.

## 7. Rollout Order (Do Not Skip)

1. Merge frontend PR (widget + token passing, graceful no-key fallback) to `develop` → preview deploy. Captcha **still OFF** in Supabase → preview works with and without tokens.
2. Configure Cloudflare widget(s) + Vercel `VITE_TURNSTILE_SITE_KEY` for preview (§3).
3. Smoke-test preview manually (valid signup/login/reset + expired-token + wrong-token paths).
4. Enable captcha in **staging** Supabase project. Re-test preview + `seed:demo` + one mobile login attempt (expect mobile to fail until Phase 2 — record it).
5. Open `develop` → `main` release PR only after staging is green; `npm run check:release` must pass; releases merge with merge-commit per `AGENTS.md`.
6. After prod deploy, set prod `VITE_TURNSTILE_SITE_KEY`, then enable captcha in **production** Supabase project. Verify with a real signup + curl negative test:
   `curl -X POST $SUPABASE_URL/auth/v1/signup -H "apikey: $ANON" -d '{"email":"bot@test.example","password":"sensor1234"}'` → must fail captcha-required once enforced.

Rollback: disable toggle in dashboard (instant, no deploy); frontend with key but enforcement off still works (tokens sent, ignored).

## 8. Verification Checklist

- [ ] Web signup/login/forgot with valid token succeed (staging, then prod).
- [ ] Without token (curl / token stripped) fails with captcha error once enforced.
- [ ] Expired token + failing test key show a clear, non-technical error; widget resets.
- [ ] No-key local dev (`npm run dev` + `supabase start`) works exactly as today; E2E green.
- [ ] `npm run lint`, `npm run test:coverage`, `npm run build` green; `node mobile/scripts/sync-db-types.mjs --check` if any synced file touched (expected: untouched).
- [ ] Dark mode + mobile viewport: widget usable, no layout break, no new design tokens.
- [ ] `seed:demo` still works against staging with enforcement on.
- [ ] Google OAuth flows untouched and working (no captcha field on OAuth).
- [ ] Prod: Vercel env set, Supabase toggle on, curl negative test recorded.

## 9. Costs & Limits (Free Tier)

- Turnstile: $0, unlimited. Supabase captcha: no add-on fee; counts against normal Auth MAU (50k free) only on success.
- No migration, no new table, no Edge Function, no `database.types.ts` regen.
- Keep an eye on Auth email rate limits after launch — captcha should *reduce* wasted sends.

## 10. Work Breakdown (Suggested PRs)

- **PR 1 (web, this plan's MVP):** dep + `TurnstileWidget` + 3 page wirings + env docs + unit tests. No dashboard change. Branch from `develop` (`feat/turnstile-web`), target `develop`, squash.
- **PR 2 (mobile Phase 2):** `TurnstileWebView` + 3 screen wirings + `mobile/README.md` note + manual staging test. Required before prod enforcement matters for mobile users.
- **Ops (no PR):** Cloudflare widgets, Vercel envs, staging then prod Supabase toggles, checklist sign-off.

## 11. Open Questions

1. One shared Turnstile widget vs. staging/prod split? (Recommend split; single is acceptable for MVP.)
2. Do Vercel feature-preview deployments need captcha? If yes, add `*.vercel.app` to the staging widget domains; if no, leave key unset there so the widget no-ops.
3. Is mobile login in active use yet? Answer decides whether Phase 2 blocks prod enforcement.
