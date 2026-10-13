# Avatar Upgrade Plan: dual variants plus crop and quality fixes

## Goal

Fix two linked problems with one change:

1. Upload UX is basic: no crop, no camera choice on mobile, weak previews and error copy.
2. Profile detail photo looks low quality: we store one 256px file (`AVATAR_MAX_DIMENSION = 256`) and reuse it for 20px list avatars and for the fullscreen `AvatarViewer`, which upscales 256px to 600-900px.

Target state: every new avatar upload produces two files in the existing private `avatars` bucket:

- full: longest edge 1024px, used by `AvatarViewer` dialog and `ZoomableImage`
- thumb: longest edge 256px, used by every `Avatar` list thumbnail

`profiles.avatar_url` keeps the full path. New nullable `profiles.avatar_thumb_url` keeps the thumb path. Old rows have `avatar_thumb_url = null` and fall back to `avatar_url` until the user re-uploads.

## Non-goals

- No new bucket, no public URLs, no change to signed URL TTL (1h).
- No server-side backfill of old 256px files into 1024px files (upscaling cannot recover quality).
- No change to chat-images or posts-images (still single 1600px file).

## Current state (verified)

- Web upload: `src/pages/settings/EditProfilePage.tsx:38`, `src/pages/onboarding/step-customization.tsx:35`, resize in `src/lib/image.ts:20`.
- Mobile upload: `mobile/app/(app)/settings/profile.tsx:40`, `mobile/src/components/onboarding/StepCustomization.tsx:29`, resize in `mobile/src/lib/upload-image.ts:70`, upload in `mobile/src/features/avatars.ts:42`.
- Read path: `src/features/avatars.ts:45` and mobile mirror, `src/components/Avatar.tsx:15`, `src/components/AvatarViewer.tsx:18`, mobile `Avatar.tsx:10` and `AvatarViewer.tsx:16`.
- Detail render: web `src/pages/ProfilePage.tsx:142` (`h-32 w-32 md:h-36 md:w-36`), mobile `mobile/app/(app)/profile/[userId].tsx:132` (`size={128}`), fullscreen reuses the same URL.
- DB: `profiles.avatar_url text` (`supabase/migrations/0002_profiles.sql:10`). Many RPCs project `avatar_url` with intro-unlock masking (`0004`, `0047`, `0048`, `0049`, `0161`, `0188`, `0189`, `0190`, plus `0023`, `0168`, `0170`, `0093`). Storage GC and account deletion read `avatar_url` (`0050`, `0054`, `0193`, `0194`, `0195`).

## Decisions

### 1. Web crop library: `react-easy-crop`

Add `react-easy-crop` (v6.x, MIT, React 19 compatible, ~2.3M weekly downloads, maintained in 2026) for the avatar step only.

Why it over the alternatives:

- `react-easy-crop` has drag, zoom, rotate, `cropShape="round"`, `aspect={1}`, mobile friendly touch. This matches avatar needs exactly.
- `react-image-crop` (v11, 0 deps, <5KB) is smaller and keyboard accessible but has no built-in rotate and needs more hand wiring.
- `react-avatar-editor` (v14 beta) is purpose built for avatars and is a fine second choice, but `react-easy-crop` has wider adoption and better docs for modal flows.

Scope: one shared `src/components/AvatarCropModal.tsx` used by onboarding and settings. No drag-drop library; native file input plus optional camera capture attribute is enough.

### 2. Mobile crop: built-in `allowsEditing`, no new package

Keep the existing Expo stack (`expo-image-picker`, `expo-image-manipulator`, `expo-image`, `expo-file-system`). No new dependency.

Change picker calls to:

```ts
launchImageLibraryAsync({
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
})
```

This is the documented 2026 Expo pattern (SDK 57 docs): free native crop UI, square on iOS, 1:1 plus rotate on Android. Add `launchCameraAsync` with the same flags as a second choice. Rejected: `expo-dynamic-image-crop` (low adoption) and a custom gesture cropper with reanimated (overkill while native sheet covers square avatars).

### 3. Variant sizes and encoding

- `AVATAR_FULL_MAX_DIMENSION = 1024`, `AVATAR_THUMB_MAX_DIMENSION = 256`, WebP quality 0.85 for photos.
- Web: decode once with `createImageBitmap`, draw full canvas, then draw thumb canvas from the full canvas (two-step downscale preserves detail better than one jump from 4000px to 256px).
- Mobile: `manipulateAsync` resize to 1024 WebP first, then a second `manipulateAsync` from the full output to 256 WebP. Fall back to original on manipulator throw (existing behavior).
- GIF: keep current behavior (no re-encode, animation preserved). Store the same uploaded GIF path in both `avatar_url` and `avatar_thumb_url` so readers can use either field without branching.
- HEIC: iOS can return `image/heic`. Current allow-list rejects it with a generic message. Plan: detect `image/heic` and `image/heif` early and show "Please choose a JPG, PNG, WebP, or GIF image (HEIC is not supported yet)."

## Database migration (one new file, never edit applied ones)

Next number is `0196` (latest is `0195_storage_objects_pagination.sql`).

File: `supabase/migrations/0196_avatar_thumb.sql`:

1. `alter table public.profiles add column if not exists avatar_thumb_url text;`
2. Redefine every RPC that returns `avatar_url` to also return `avatar_thumb_url` with identical masking (`case when introductions_completed_at is not null then p.avatar_thumb_url else null`). Affected set to verify by grep before writing: `get_member_profiles`, `get_candidate_profiles`, `get_my_mutes_with_profiles`, `get_my_reports` profile branch, invitation and created-cluster profile projections.
3. Extend storage accounting functions (`0193`, `0194`, `0195` equivalents) to union both columns so account deletion and storage cleanup reclaim both objects. Extend `0054_moderation_enforcement` avatar match to check both columns.
4. RLS: no new policy needed. Both files live under `avatars/{userId}/...`, covered by `avatars_owner_delete` (`0050`) and `avatars_member_read` (`0032`). Keep bucket `file_size_limit` 5MB and mime allow-list unchanged.
5. Validate with `supabase db lint --local`.

Then regenerate `src/lib/database.types.ts` from the schema and run `node mobile/scripts/sync-db-types.mjs --check` (commit regenerated mobile copies; do not hand edit them).

## Client changes

### Shared naming

Storage paths (both platforms):

- `{userId}/{uuid}_full.webp` (or original ext for GIF)
- `{userId}/{uuid}_thumb.webp` (same GIF path for GIF)

Reuse existing `storagePath` helpers with a suffix. Both files share one uuid per upload so orphan cleanup can match the pair.

### `src/lib/image.ts` (web)

- Add `AVATAR_FULL_MAX_DIMENSION = 1024`, keep `AVATAR_THUMB_MAX_DIMENSION = 256`. Keep `AVATAR_MAX_DIMENSION` as deprecated alias for one release or remove with test updates (prefer remove to avoid three constants).
- Add `prepareAvatarVariants(file): Promise<{ full: File; thumb: File }>` plus keep `prepareImage` for chat and posts untouched.
- GIF and non-resizable: return `{ full: file, thumb: file }`.

### `mobile/src/lib/upload-image.ts`

- Mirror the two constants.
- Replace single `uploadAvatar` resize with `prepareAvatarPair(uri, mime, w, h)` returning `{ fullUri, thumbUri, mime }`, then upload both via existing `uploadImageBytes`.

### `src/features/avatars.ts` plus mobile mirror

- Keep `avatarStoragePath` as is (validates both variants, same regex).
- Change `deleteAvatarObject` to accept and delete a pair: `deleteAvatarObjects(full, thumb)` that removes up to two paths, tolerates one missing, and stays silent on null.
- Add `useAvatarThumbUrl(thumb, full)` (prefers thumb, falls back to full) and `useAvatarFullUrl(full, thumb)` (prefers full, falls back to thumb). Keep `useAvatarUrl` as thin wrapper for back-compat during migration, or remove if call sites all move (update tests either way).
- Types: extend profile and member shapes with `avatar_thumb_url: string | null`.

### Components

- `Avatar` (web + mobile): takes `src` (full) plus optional `thumbSrc`. It derives the `_thumb` path, renders the thumbnail, and falls back to the full file if the thumb image errors (covers GIF/small single-file rows and mismatched extensions). Only flows that already hold both columns (settings, onboarding) pass `thumbSrc` explicitly; every other call site is untouched.
- `AvatarViewer` (web + mobile): takes `src` only and derives the `_full` path for the dialog. No layout change; only the source URL changes.

### Upload flows (4 call sites, same sequence)

Web `EditProfilePage` and `step-customization`, mobile `settings/profile` and `StepCustomization`:

1. Pick: web file input (plus `AvatarCropModal` with `react-easy-crop` square crop, zoom 1-3, rotate); mobile action sheet with Library and Camera, both with `allowsEditing` 1:1.
2. Validate: mime allow-list plus explicit HEIC message, 5MB pre-check on the picked file.
3. Crop, then build both variants, then upload both with `upsert: false`.
4. `updateProfile.mutateAsync({ avatar_url: fullPath, avatar_thumb_url: thumbPath })` (onboarding: `patch({ avatarUrl: full, avatarThumbUrl: thumb })`).
5. Only after the save succeeds, delete the old pair. On save failure, delete the newly uploaded pair to avoid orphans, then surface `toErrorMessage`.
6. Local preview: web `URL.createObjectURL` of the cropped result inside the modal; mobile uses the cropped asset uri. Revoke object URLs on close.
7. Disabled states while uploading, cancel path that skips upload, and inline `role="alert"` error text (existing pattern).

## Small improvements bundled in

- Camera option on mobile with permission denied copy ("Photo access was denied. Enable it in Settings to add a photo.").
- Consistent oversize copy on both platforms: "That image is larger than 5 MB."
- Post-resize size guard (a cropped 1024px WebP is far below 5MB, but keep the check for GIF passthrough).
- Keep existing focus trap in `AvatarViewer` dialog and `hitSlop` on mobile pressables.

## Tests

- Unit colocated with source:
  - `src/lib/image.test.ts`: variant sizes (1024 and 256 draw calls), two-step thumb from full, GIF passthrough returns same file twice.
  - `mobile/src/lib/upload-image.test.ts`: pair resize actions (`width: 1024` then thumb), throw fallback, unknown dims untouched.
  - `src/features/avatars.test.ts` plus mobile mirror: path sanitize for `_full` and `_thumb` names, pair delete calls `remove` with both paths, hook fallback (thumb null uses full and vice versa).
  - `EditProfilePage.test.tsx`, onboarding step test, mobile profile tests: upload saves both fields, old pair deleted only after save success, new pair cleaned up on save failure.
  - `Avatar.test.tsx`, `AvatarViewer.test.tsx` (both platforms): thumbnail uses thumb URL, dialog uses full URL.
- Integration (`supabase start`, fresh `supabase db reset`, no demo seed): extend `tests/integration/storage.test.ts` for pair insert, read scope, cross-user write deny; extend `account-deletion-storage.test.ts` to assert both objects reclaimed.
- E2E (Playwright, needs `supabase start` plus `seed:demo`): onboarding upload and settings change avatar still pass; add `data-e2e` hooks only if selectors prove flaky.
- Gates: `npm run lint`, `npm run test:coverage` (do not lower v8 thresholds), `npm run build`. If migrations changed: `supabase db reset` plus `npm run test:integration`. If synced files changed: `node mobile/scripts/sync-db-types.mjs --check`.

## Rollout and backfill

- Old rows: `avatar_url` = 256px file, `avatar_thumb_url` = null. UI renders thumb hook fallback (same 256px file) everywhere, so nothing breaks; detail viewer stays soft until re-upload.
- No forced migration of pixels. Optional backlog: one-off script that downloads each legacy avatar, upscales nothing, just copies it to `_thumb` and marks `avatar_thumb_url`, so new code paths get exercised without fake quality gain. Prefer asking users to re-upload for true 1024px quality.
- Storage cost: roughly 2x per avatar (1024px WebP ~80-150KB plus 256px ~10-20KB). Negligible at profile-photo cardinality.

## Acceptance

- New web upload produces `_full` (longest edge 1024) and `_thumb` (256); profile save writes both columns.
- New mobile upload from library and camera does the same.
- Member lists and headers load thumb signed URLs; `AvatarViewer` dialog loads full signed URL; Network tab shows two distinct paths for one user.
- Profile detail photo at fullscreen is visibly sharper than the current 256px upscale; list avatars show no regression.
- Old single-file profiles still render (fallback) on web and mobile.
- Replacing or removing a photo deletes both old objects; failed saves leave no orphan pair.
- `lint`, `test:coverage`, `build`, `test:integration`, and mobile `sync --check` all pass.

## Work order

1. Migration `0196` plus `database.types.ts` regen plus mobile sync.
2. `image.ts` variants plus unit tests.
3. `upload-image.ts` pair plus unit tests.
4. `avatars.ts` pair helpers plus hooks plus tests (web, then mirror mobile).
5. `Avatar` and `AvatarViewer` source swap (web, then mobile).
6. Web `AvatarCropModal` with `react-easy-crop` plus wire into 2 web flows.
7. Mobile picker `allowsEditing` plus camera plus wire into 2 mobile flows.
8. Integration and E2E updates, docs sync (`docs/TECHNICAL.md` storage row, `mobile/README.md` if picker behavior needs noting).
