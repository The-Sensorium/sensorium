# P3 — Image Optimization Plan

> **Status — implemented.** Avatars downscale to `AVATAR_MAX_DIMENSION = 256` on
> web and mobile; lazy-loading coverage was verified. Retained as the design record.

Goal: reduce storage + egress footprint on the free-tier beta without any user-visible
regression. Scope: (1) downscale avatar uploads, (2) verify lazy-loading coverage is
complete across web, (3) small polish (`decoding="async"`). Database and realtime are
untouched.

## Current state (audited 2026-09-09)

Lazy loading on web is **already implemented** — verified in source:

| Surface | Location | Lazy? |
|---|---|---|
| Avatars (all web screens) | `src/components/Avatar.tsx:21` | `loading="lazy"` |
| Post/comment media | `src/components/PostMedia.tsx:55` | `loading="lazy"` |
| Chat image in room | `src/pages/cluster/room/MessageImage.tsx:31` | `loading="lazy"` |
| Mobile feed images | `mobile/` (FlatList virtualized feeds) | N/A (RN `Image`) |

Avatar uploads currently resize to **512 px** at three call sites (QA mismatch: avatars
render at 20–80 px, so 512 px is ~4–10x oversize, wasting storage + egress on every render):

| Site | Location | Current |
|---|---|---|
| Web onboarding | `src/pages/onboarding/step-customization.tsx:48` | `prepareImage(file, { maxDimension: 512 })` |
| Web settings | `src/pages/SettingsPage.tsx:57` | `prepareImage(file, { maxDimension: 512 })` |
| Mobile onboarding | `mobile/src/components/onboarding/StepCustomization.tsx:65-75` | inline `manipulateAsync(..., { resize: { width: 512 } })` |

Mobile has no post-onboarding avatar change surface; avatars only upload during onboarding
(`mobile/src/components/onboarding/StepCustomization.tsx`).

`prepareImage` (web, `src/lib/image.ts:17`) keeps its `maxDimension = 512` default — used
by no other flow; chat/post images call it with `maxDimension: 1600`
(`src/features/cluster.ts:376`, `src/features/posts.ts:632`). Mobile chat/post resize to
1600 via `maybeResize` (`mobile/src/lib/upload-image.ts`).

## Change set

### A. Shared avatar dimension constant

Add `AVATAR_MAX_DIMENSION = 256`:

- Web: export from `src/lib/image.ts` (owns resize defaults).
- Mobile: export from `mobile/src/lib/upload-image.ts` (owns resize helpers).

Rationale for 256: largest avatar display is an 80 px onboarding preview (web) / image
rendered up to ~80 px; 256 px covers ~3x DPR with headroom for future larger surfaces
(profile hero) at a 4x pixel-count reduction vs 512 (256² vs 512²).

### B. Use the constant at the three avatar upload sites

1. `src/pages/onboarding/step-customization.tsx:48` → `prepareImage(file, { maxDimension: AVATAR_MAX_DIMENSION })`
2. `src/pages/SettingsPage.tsx:57` → same
3. `mobile/src/components/onboarding/StepCustomization.tsx:65-75` → replace the inline
   `512` literal and the `maxDim <= 512` guard with the constant (keep GIF passthrough
   and WebP encode as-is)

### C. Web polish: `decoding="async"`

Add `decoding="async"` to the three already-lazy web `<img>`s:
`Avatar.tsx:18`, `PostMedia.tsx:52`, `MessageImage.tsx:28`. Static `cacheControl:
'31536000'` on uploads (already set) still applies.

### D. Verification of lazy-loading completeness

- Audit: grep all user-content `<img` in `src/` for missing `loading="lazy"`
  (expected: none).
- Remote KLIPY GIFs (`MessageGif`, GifPicker) and local preview blobs are out of scope —
  they are not Supabase storage and don't count against Supabase egress.
- Mobile: feeds are already virtualized; no work.

## Explicitly out of scope

- **Retroactive re-encode of existing 512 px avatars.** Not worth the migration risk for
  beta; new uploads shrink. Optional backlog item (a one-off script walking the `avatars`
  bucket would be safe — insert-new/delete-old, owner-scoped).
- Chat/post image sizes (1600) — unchanged.
- Signed URL TTL/refetch cadence (`AVATAR_TTL_SECONDS` 86400, refreshed a minute before
  expiry) — unchanged.

## User-visible behavior

None during normal use. Uploads are smaller (fast on cellular); any avatar re-render after
upload uses the same lazy path. Downside is ~0: 256 px is still >3x the largest on-screen
display even at 3x DPR.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mobile `manipulateAsync` guard change drops GIF/non-resize path | Low | Keep `mime === 'image/gif'` early-return; cover with manual QA |
| `AVATAR_MAX_DIMENSION` import collision web vs mobile | Low | Separate files per app; no cross-app imports |
| Avatar appears soft on an existing large surface | Very low | 256 px exceeds every current display size; re-verify profile preview after |
| Regression in onboarding upload flow | Low | Manual smoke on web + mobile onboarding with an image picker |

## Testing

- Unit: `npm test src/lib/image.test.ts` (prepareImage unchanged — still green). Optionally
  assert the avatar callsites pass the constant (mock `prepareImage` in
  `SettingsPage.test.tsx:186`).
- Manual smoke (both apps):
  1. Onboarding → upload a large photo → confirm avatar uploads, preview crisp, object
     size smaller (Studio bucket browser).
  2. Web settings → change avatar → old object deleted (0050), new one smaller.
  3. Room → send an image → still renders (1600 path untouched).
- E2E: existing suite must stay green (`npm run test:e2e`).

## Rollout

Single feature branch off `develop` (`feat/image-optimization`), Conventional Commit
`perf: downscale avatar uploads to 256px`, one PR. No migrations, no new env vars, no
docs changes beyond this file (optional: note in `docs/TECHNICAL.md` Storage table is
size-agnostic — no edit needed).

## Acceptance criteria

- All three avatar upload sites use `AVATAR_MAX_DIMENSION`
- New avatar objects are ≤ 256 px and verify smaller in the bucket
- `loading="lazy"` audit finds no regressions; `decoding="async"` added
- Unit + e2e suites green; web + mobile onboarding/settings smoke pass