# Dark Mode Indigo Implementation Plan — Web + Mobile

## 1. Goal

Change dark-mode interactive color from terracotta to indigo blue on **both** web and mobile, and make the Sensorium logo mark inherit the theme color. No accent picker/personalization system. Light mode pixel-identical.

## 2. Non-goals (explicitly skipped)

- No "Dark mode accent" setting, no swatches, no preview, no `sensorium:dark-accent` key, no `data-dark-accent` attribute.
- No Settings → Appearance section.
- No `theme.ts` / `theme-provider.tsx` / `index.html` FOUC logic changes (mode resolution stays `light|system|dark` via `.dark` class + `sensorium:theme`).
- No migrations, no RLS/RPC changes, no business-logic changes, no layout/typography/spacing changes.
- No mobile `theme-choice.tsx` changes.

## 3. Current state (verified)

| Area | Web | Mobile |
|---|---|---|
| Token source | `src/index.css` `@theme` (light) + `.dark:89-149` override, Tailwind v4 CSS-first, zero `dark:` branches | `mobile/src/lib/theme-tokens.ts` `colors` + `darkColors:33-63` |
| Dark primary today | `--color-primary #ff8a5c`, `on #3a0b00`, `container #8f2f0d`, `on-container #ffdbcf`, `inverse #9d3d1c`, `fixed #ffdbcf / dim #ffb59e / on-fixed #3a0b00 / variant #8f2f0d` (`index.css:113-122`) | `primary #ff8a5c`, `onPrimary #3a0b00`, `primaryContainer #8f2f0d`, `inversePrimary #9d3d1c` (`theme-tokens.ts:47-50`) |
| Consumers | ~100 `bg-primary / text-primary / border-primary / ring-primary` utilities + `:focus-visible { outline: var(--color-primary) }` (`index.css:204-207`); all auto-follow the var | `t.primary / t.onPrimary` in `ui.tsx` (PrimaryButton:186, AuthLink:287, ProgressBar:411, spinners, refresh), `PostComposer`, `CommentThread`, `ModePanel`, `StepModes/StepLocal`, `Avatar`, `BrandWordmark`, `ClusterCard`, `QueueCard`; `app/_layout.tsx:102` navigator `primary`; `AnimatedSplash.tsx:41` stroke |
| Semantics (must not change) | `error` token; like heart inline `var(--color-error)` (`PostCard.tsx:181,187`, `CommentItem.tsx:92,94`); `emerald/amber` availability (`availability.ts:12-13` etc.) | `t.error` likes/destructive; `bg-emerald-500 #10b981 / bg-amber-500 #f59e0b` (`AvailabilityBadge.tsx:7-8`) |
| Logo today | `BrandMark.tsx:18` `<img src=/logo-mark.png vs /logo-mark-dark.png>`; vectors `public/logo-mark.svg` (single path, `fill:#000000`) exist but unused | `BrandMark.tsx:6-20` `<Image legacy-icon-light/dark.png>`; vector already extracted as `LOGO_MARK_D` (`logoMarkPath.ts:3`); tint pattern proven in `AnimatedSplash.tsx:73` |
| Tests | `BrandMark.test.tsx` asserts `img[src]` PNG swap | Small Vitest suite; `mobile/README.md` pre-push: `lint + tsc --noEmit + test` |

## 4. Target values (approved: indigo `#6366F1` on `#181818`)

### 4a. Web — `src/index.css` `.dark` block only

```diff
- --color-surface: #1a1a1a;            + --color-surface: #181818;
- --color-surface-dim: #1a1a1a;        + --color-surface-dim: #181818;
- --color-background: #1a1a1a;         + --color-background: #181818;
- --color-inverse-on-surface: #1a1a1a; + --color-inverse-on-surface: #181818;
- --color-primary: #ff8a5c;            + --color-primary: #6366F1;
- --color-on-primary: #3a0b00;         + --color-on-primary: #ffffff;
- --color-primary-container: #8f2f0d;  + --color-primary-container: #312e81;
- --color-on-primary-container: #ffdbcf; + --color-on-primary-container: #e0e7ff;
- --color-inverse-primary: #9d3d1c;    + --color-inverse-primary: #818cf8;
- --color-primary-fixed: #ffdbcf;      + --color-primary-fixed: #e0e7ff;
- --color-primary-fixed-dim: #ffb59e;  + --color-primary-fixed-dim: #a5b4fc;
- --color-on-primary-fixed: #3a0b00;   + --color-on-primary-fixed: #1e1b4b;
- --color-on-primary-fixed-variant: #8f2f0d; + --color-on-primary-fixed-variant: #4338ca;
```

Text: `on-surface #fcf9f2` (kept), `on-surface-variant #8a847e` → `#A8A29E` (warmer, softer grey), `outline #6f6a64` → `#78736F` (muted/tertiary). Remaining surfaces/borders/error/shadows unchanged (`outline-variant #2a2a2a`, etc.). Light `@theme:10-81` untouched. `on-primary` is white (not deep indigo ink) because dark text on `#6366F1` is unreadable; white on `#6366F1` is ≈ 4.8:1. `#A8A29E` on `#181818` is ≈ 7:1.

### 4b. Mobile — `mobile/src/lib/theme-tokens.ts` `darkColors` only

```diff
- surface/surfaceDim/background: '#1a1a1a', + '#181818',
- inverseOnSurface: '#1a1a1a',              + '#181818',
- primary: '#ff8a5c',          + primary: '#6366F1',
- onPrimary: '#3a0b00',        + onPrimary: '#ffffff',
- primaryContainer: '#8f2f0d', + primaryContainer: '#312e81',
- inversePrimary: '#9d3d1c',   + inversePrimary: '#818cf8',
```

Also `AnimatedSplash.tsx:42` dark splash background and `app.json` splash `dark.backgroundColor`: `'#1a1919'` → `'#181818'`.

Light `colors` untouched.

### 4c. Logo → themeable vector (both platforms)

- **Web:** new `src/components/logoMarkPath.ts` exporting `LOGO_MARK_D` (copy `d` from `public/logo-mark.svg:48`); rewrite `BrandMark.tsx` → `<svg viewBox="0 0 3932.1599 3932.1599" width={size} height={size} className={cn('shrink-0', className)} style={{ color: 'var(--color-primary)' }} role="img" aria-label={alt || undefined}><path d={LOGO_MARK_D} fill="currentColor" /></svg>`; delete `ThemeContext` branch + PNG `src`. Update `BrandMark.test.tsx` (assert `svg` + `currentColor`, labelled/unlabelled, no-provider fallback).
- **Mobile:** rewrite `BrandMark.tsx` → `useTheme()` + `<Svg width={size} height={size} viewBox="0 0 3932.1599 3932.1599"><Path d={LOGO_MARK_D} fill={t.primary} /></Svg>` preserving `size`, `borderRadius: size * 0.28`, `accessibilityLabel`; drop `legacy-icon-*.png` imports, `useResolvedScheme` import. `react-native-svg` already a dep.
- Result: light terracotta (`#9d3d1c` on both platforms, since light `primary` is terracotta), dark indigo (`#6366F1`), automatically correct after §§4a–4b with zero future asset forks. `README.md:2` (`public/logo.png`), `icon-*.png`, adaptive/splash PNGs untouched. Favicons are now a single brand set (light) used in both modes — the `favicon-dark.*` files and `applyFavicon` plumbing were removed.

### 4d. Docs

`docs/DESIGN.md`: `colors-dark` front-matter (`background`/`surface`/`surface-dim` → `#181818`, `primary` → `#6366F1`, `on-primary` → `#ffffff`, `inverse-primary` → `#818cf8`, `primary-fixed…` rows) + Dark Mode `Accent:` bullet (`#ff8a5c` → `#6366F1`, rationale: nighttime comfort + logo inheritance). Light palette section untouched. `index.html` dark `theme-color` → `#181818`. Archive docs (`docs/archive/`) intentionally not rewritten.

## 5. Step-by-step execution order

1. Web tokens (§4a) — 1 edit, `src/index.css`.
2. Mobile tokens (§4b) — 1 edit, `theme-tokens.ts`.
3. Web logo (§4c): add `logoMarkPath.ts`, rewrite `BrandMark.tsx`, update `BrandMark.test.tsx`.
4. Mobile logo (§4c): rewrite `BrandMark.tsx`.
5. Docs (§4d).
6. Verify (§6). PNGs (`logo-mark*.png`, `legacy-icon-*.png`) left on disk (no deletions → no broken refs); optional cleanup follow-up.

## 6. Verification

- Web: `npm run lint`, `npm test`, `npm run test:coverage` (gates lines 34 / functions 33 / branches 20 — must not regress), `npm run build` (`tsc -b` + vite). Manual: dark → buttons/links/nav/focus/toggles/progress/logo indigo with readable text; light → byte-identical terracotta/parchment; hearts red, destructive coral, success green, warning amber in both.
- Mobile: `cd mobile && npm run lint`, `npx tsc --noEmit`, `npm test`; Expo Go/device dark+light check including `BrandMark` at 32px (header) and 101px (`ui.tsx:48` auth), splash, tab bar active.
- E2E/integration: no selectors or schema changed; run existing suites only if CI demands.

## 7. Risks and mitigations

- `rounded-xl object-cover` (img) vs raw svg crop → keep same `size`/radius, eyeball 9 web call sites (`AppShell`, `Admin/Moderator/PublicLayout`, `LandingPage`, `guards`, `SessionRole`, `Restricted`, `OnboardingPage`). Mitigation: use full viewBox, no cropping.
- PNG padding vs path bbox on mobile → compare 32px vs 101px renders once.
- Contrast: white on `#6366F1` ≈ 4.8:1 (passes AA); `#6366F1` on `#181818` ≈ 3.6:1 — fine for large/bold UI accents and button fills.
- No data migration; users keep `sensorium:theme` choice; change applies on next load with zero action.

## 8. Acceptance criteria

- [ ] Dark web + dark mobile: background/surfaces are `#181818` family; primary buttons, links, selected nav/tabs, active toggles, progress, focus rings, wordmark + mark are `#6366F1`; text on indigo is white.
- [ ] Light web + light mobile: unchanged (terracotta `#9d3d1c`, parchment `#fff8f6`).
- [ ] Logo mark has no baked color; single vector per platform.
- [ ] Semantic red/green/amber unchanged in both modes.
- [ ] Lint + coverage gates + `tsc` + unit suites green; docs updated.
