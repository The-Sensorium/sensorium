# Mobile Navigation and Keyboard Fix Plan

Status: partially implemented. Shipped the low-risk hardening (keyed
composers, blur dismiss, modal focus fixes, tab-bar ownership, Android
resize mode). Deferred: full Tabs-to-Stack restructure, room rewrite onto
KeyboardChatScrollView, realtime ref-count removal. Those need a prod APK
soak test before merge.
Scope: `mobile/` only. Web app, Supabase schema, RLS, RPCs, and Edge Functions are out of scope.
Goal: fix the long-session defects where text fields get stuck and empty strips appear after visiting many clusters, posts, signals, and comments.

## 1. Background and symptoms

Reported behavior:

- Fresh start works correctly.
- After navigating through many pages (cluster room, members, signals, signal detail, votes, settings, posts, post detail, comments, profiles), some screens show:
  - a text field that keeps old content, does not focus, or does not open the keyboard,
  - an empty area above or below the composer, or content hidden under the footer,
  - a menu or modal state that seems carried over from another screen.

Prior review found two structural causes:

1. Detail screens are hidden `Tabs.Screen` routes (`href: null`) in `mobile/app/(app)/_layout.tsx`, not `Stack` pushes. Tab screens stay mounted, so state leaks across `clusterId` and `postId` changes.
2. Keyboard handling uses three patterns:
   - `mobile/app/(app)/cluster/[clusterId]/room.tsx`: `KeyboardAvoidingView` with `behavior=height` on Android.
   - `mobile/app/(app)/posts/[postId].tsx` plus `mobile/src/components/ui.tsx` `Screen`: `KeyboardStickyView` plus `KeyboardChatScrollView`, correct pattern but with stale height state.
   - `mobile/app/(app)/cluster/[clusterId]/signals/[signalId].tsx`, `RaiseSignalModal`, `Modal`: inline inputs plus `KeyboardAwareScrollView`, with `numberOfLines` and `autoFocus` races.

Official references used for this plan:

- Expo Router, Common navigation patterns: stacks inside tabs, detail route outside tabs pushed from an outer Stack.
- Expo Router, JavaScript Tabs and Stack docs, including `href: null`, `backBehavior`, `getId` custom push behavior.
- `react-native-keyboard-controller`, Building a chat app guide, plus `KeyboardChatScrollView`, `KeyboardStickyView`, `KeyboardAwareScrollView`, `extraContentPadding`, `keyboardLiftBehavior` docs.
- `react-native-safe-area-context` edge-to-edge behavior on Android, Expo SDK 57 defaults.

## 2. Goals and non-goals

Goals:

- Cluster room, cluster sections, post detail, comment composer, signal detail, and shared modals follow one documented navigation and keyboard pattern.
- Navigating across many clusters and posts leaves no stale draft, focus, footer height, channel, or modal state.
- No empty keyboard or safe-area strips on Android edge-to-edge production builds and iOS.
- Back navigation returns to the screen the user came from.
- No behavior change to web, backend, auth, push, calls, or design tokens.

Non-goals:

- No visual redesign.
- No new dependencies unless review approves one.
- No migration, RLS, or RPC changes.
- No change to moderator or admin surfaces, which stay web-only.

## 3. Proposed end state

### 3.1 Navigation

- `mobile/app/(app)/_layout.tsx` contains only the five real tabs: `home`, `posts`, `notifications`, `clusters`, `settings`.
- Cluster detail becomes a nested Stack, for example `mobile/app/(app)/cluster/[clusterId]/_layout.tsx` with `room`, `members`, `signals`, `signals/[signalId]`, `votes`, `settings`.
- Cross-cutting details pushed above the tabs from an outer Stack: `posts/[postId]`, `profile/[userId]`, and optionally `mode/[modeId]`, `queue/[queueId]`, `cluster-created`, `settings/reports`.
- Detail screens unmount on back. No module-level ref counting needed for correctness.
- Push of same route with different params creates a new screen or resets state explicitly via `key` or `getId`, not via shared mounted state.

### 3.2 Keyboard and fixed areas

- One chat pattern for room and post detail: `KeyboardStickyView` footer plus `KeyboardChatScrollView` or FlatList equivalent with `extraContentPadding` fed from footer `onLayout`.
- One form pattern for signal detail replies and small modals: `KeyboardAwareScrollView` with `bottomOffset`, no `numberOfLines` pinning, no `autoFocus` before layout commit.
- One safe-area rule: parent owns top, left, right. Sticky footer owns bottom plus keyboard translate. No double padding from both parent and footer.
- Android `softwareKeyboardLayoutMode` set to `resize` in `mobile/app.json` per keyboard-controller install guidance.
- No width or layout animation around a growing multiline `TextInput`.

## 4. Work phases

### Phase 0: repro and baseline, no behavior change

1. Add a manual repro script to this file or a test checklist:
   - open cluster A room, type draft, do not send, open members, signals, signal detail, votes, settings, back to room,
   - open cluster B room, check composer is empty,
   - open post A, type comment, open post B, check composer is empty,
   - open keyboard on room, post detail, signal detail on Android prod APK and iOS, screenshot footer position,
   - background and foreground the app mid-draft, repeat.
2. Record current behavior on Expo Go versus production APK, since bottom inset is zero in Expo Go and non-zero in prod.
3. Capture baseline: `cd mobile && npm run lint`, `npx tsc --noEmit`, `npm test`.

Acceptance: repro steps are repeatable and show stale draft or gap on current code.

### Phase 1: navigation restructure

Files:

- `mobile/app/(app)/_layout.tsx`
- new `mobile/app/(app)/cluster/[clusterId]/_layout.tsx`
- `mobile/app/(app)/posts/[postId].tsx`, `mobile/app/(app)/profile/[userId].tsx`, related links in `ClusterMenu.tsx`, `PostCard.tsx`, `CommentThread.tsx`, `TimelineRows.tsx`, push routing in `notification-routing.ts`, `push.ts`
- `mobile/app.json` only if deep-link prefixes need updating, expected no change

Steps:

1. Create the cluster Stack layout with `headerShown: false`, `animation: fade` where currently used to preserve feel.
2. Remove hidden cluster screens, post detail, and profile from `Tabs`. Keep only the five tab screens.
3. Update all `router.push`, `router.replace`, `Link href`, and push-tap targets to the new Stack URLs. URLs can stay identical, only the navigator owner changes.
4. Decide back behavior:
   - cluster section to section: Stack pop or replace, preserve existing fade,
   - room back: `router.back()` with fallback to `/(app)/clusters` or `/(app)/home` as today,
   - post detail back: Stack pop to `/(app)/posts`.
5. Remove reliance on `backBehavior="history"` for detail correction. Keep it only if tab-to-tab history still needs it, else use default.
6. Add explicit remount safety:
   - `<Composer key={clusterId} />` in room,
   - `<CommentComposer key={postId} />` in post detail,
   - signal reply draft keyed by `signalId`,
   - or Stack `getId={({params}) => params.clusterId}` style option if duplicate pushes must stack.
7. Keep `ClusterMenu` navigation but verify modal closes before navigation completes on the new Stack.

Acceptance:

- Each room, post detail, and signal detail mounts fresh with empty draft.
- Back from room returns to the list it came from.
- No hidden detail screen remains in `Tabs`.

### Phase 2: room keyboard unification

Files:

- `mobile/app/(app)/cluster/[clusterId]/room.tsx`
- `mobile/src/components/room/Composer.tsx`
- `mobile/src/components/ui.tsx` if shared footer logic is extracted
- `mobile/src/components/CollapsibleChrome.tsx`

Steps:

1. Replace room `KeyboardAvoidingView` with the post-detail pattern:
   - list: `KeyboardChatScrollView` or FlatList wired through `ScrollViewComponent`, with `inverted` support and `extraContentPadding` shared value,
   - composer: `KeyboardStickyView` with `offset={{ closed: 0, opened: bottom }}` and `paddingBottom: 8 + bottom`.
2. Feed composer height into list padding via `onLayout`, same as `[postId].tsx:80-88`. Reset the shared value on `clusterId` change.
3. Keep `SafeAreaView edges={['top', 'left', 'right']}` on the parent. Move bottom inset ownership into the sticky footer only.
4. Remove `keyboardVerticalOffset={0}` and `behavior=height` logic.
5. Audit `CollapsibleChrome`: do not animate width on every keystroke while the multiline input grows. Options:
   - keep buttons mounted but use opacity only, or
   - gate the collapse on focus plus content, not on each character, or
   - remove collapse for room and keep full chrome.
6. Keep mention popup positioning tested with keyboard open and closed. Verify `keyboardShouldPersistTaps="handled"` or `"always"` remains correct for mention selection.
7. Re-test `pinned`, `newCount`, jump-to-latest, `onEndReached` load-earlier, typing indicators, and call banner with the new scroll component.

Acceptance:

- Composer sits flush on the keyboard on iOS and Android prod, no floating strip, no content visible under it.
- Multiline growth extends scroll range, does not clip text or push the list unexpectedly.
- Mention list, GIF picker, image stage, and reply chip do not leave stranded floating panels.

### Phase 3: posts, comments, signals, modals

Files:

- `mobile/app/(app)/posts/[postId].tsx`
- `mobile/src/components/CommentComposer.tsx`
- `mobile/app/(app)/cluster/[clusterId]/signals/[signalId].tsx`
- `mobile/src/components/room/RaiseSignalModal.tsx`
- `mobile/src/components/Modal.tsx`
- `mobile/src/components/room/GifPicker.tsx`
- `mobile/src/components/ClusterMenu.tsx`

Steps:

1. Post detail:
   - keep sticky plus chat pattern,
   - reset `composerHeight.value` on `postId` change,
   - add `key={postId}` to `CommentComposer`,
   - verify `onStickyFooterLayout` fires after reply chip, image preview, and GIF picker open and close.
2. Comment composer:
   - keep no `numberOfLines` rule,
   - replace `requestAnimationFrame` plus `120ms` focus retry with focus on committed layout or user gesture only,
   - clear `draft`, `image`, `gif`, `gifOpen`, `error`, `seenReplyRef` on `postId` change or unmount.
3. Signal detail:
   - remove `numberOfLines={3}` from reply input, use `minHeight` growth like comment composer,
   - either move reply to a sticky footer for parity with posts, or keep inline with `KeyboardAwareScrollView` and verify small-screen coverage,
   - key draft and status-confirm state by `signalId`.
4. Modals:
   - remove `numberOfLines={4}` and `autoFocus` from `RaiseSignalModal` input,
   - focus on modal `onShow` or input `onLayout`,
   - fix nested `Pressable` in `Modal.tsx` so content taps do not trigger backdrop close and keyboard taps persist,
   - verify `RaiseSignalModal` prompt clears on close and on cluster change.
5. `GifPicker`:
   - keep gesture-handler `ScrollView` choice with comment explaining nested scroller,
   - verify `gridHeight` use in posts header versus bounded chat dock, no paint over action row.
6. `ClusterMenu`:
   - close modal synchronously before `Link` navigation,
   - verify no open state persists after Stack navigation.

Acceptance:

- No reply, comment, or signal draft survives a change of post, signal, or cluster.
- Reply tap focuses reliably without double keyboard open or close.
- Modals open with keyboard visible and close without leaving backdrop state.

### Phase 4: Android config, safe area, tab bar

Files:

- `mobile/app.json`
- `mobile/app/(app)/_layout.tsx`
- `mobile/src/components/ui.tsx`
- `mobile/app/(app)/cluster/[clusterId]/call.tsx`

Steps:

1. Set Android keyboard layout mode to `resize` in `mobile/app.json` if keyboard-controller requires it for the installed version. Rebuild dev client and prod APK to verify.
2. Standardize safe-area edges:
   - list plus sticky screens: parent `['top', 'left', 'right']`, footer owns `bottom`,
   - plain screens: parent `['top', 'left', 'right']` or default with explicit bottom padding, never both parent and footer adding `bottom`.
3. Revisit `tabBarHideOnKeyboard`:
   - preferred: `false` on chat and sticky screens, since the sticky view already tracks the keyboard,
   - or keep `true` only where no sticky view exists, with a comment.
4. Verify call screen keeps `tabBarStyle: { display: 'none' }` behavior under the new Stack, plus camera and mic permissions flow.
5. Test edge-to-edge gesture bar, dark mode, large font (`maxFontSizeMultiplier`), and landscape guard (portrait only today) for footer overlap.

Acceptance:

- No double bottom padding in prod, no floating footer in Expo Go.
- Tab bar does not jump when keyboard opens on room or post detail.

### Phase 5: realtime and presence cleanup

Files:

- `mobile/src/features/realtime.ts`
- callers in room, post detail, members, signals screens

Steps:

1. After Stack unmount is confirmed, evaluate whether `clusterChannelEntries` ref counting and `presenceStore` sharing can be simplified to per-screen subscribe and unsubscribe.
2. If simplification is risky, keep the stores but add:
   - guaranteed teardown on Stack unmount,
   - no cross-cluster patching,
   - logging or dev counter to detect leaks after long navigation.
3. Verify background and foreground behavior in room still flushes read markers and heals errored message queries.
4. Verify push suppression (`setSuppressedPushCluster`) still sets and clears on focus and blur, not only on unmount.

Acceptance:

- Visiting 10 or more clusters leaves one active channel at most, no stale message inserts.
- Presence online and typing sets reflect the current cluster only.

### Phase 6: verification

Commands:

- `cd mobile && npm run lint`
- `cd mobile && npx tsc --noEmit`
- `cd mobile && npm test`
- `cd mobile && node scripts/sync-db-types.mjs --check` if shared files changed, else skip
- root gates only if shared web files changed: `npm run lint`, `npm run test:coverage`, `npm run build`
- if migrations changed, which is not expected: `supabase db reset` plus `npm run test:integration`

Manual matrix:

- Android prod APK edge-to-edge plus iOS device, light and dark, small and large text.
- Room: send text, image with caption, GIF, reply, edit, delete, react, mention `@everyone` and member, load earlier, typing indicator, call banner join and decline.
- Posts: list to detail, like, comment with image and GIF, reply to comment, delete post back navigation.
- Signals: raise from room and signals tab, reply, status to resolved, resolved list toggle.
- Navigation soak: 15 or more pushes across clusters and posts, then verify empty drafts and no empty footer gaps.
- Keyboard soak: open and close keyboard 20 times, rotate focus between composers, background and foreground mid-draft.

## 5. File change checklist

Expected touched files:

- `mobile/app/(app)/_layout.tsx`: trim to five tabs, adjust `screenOptions`, back behavior, tab-bar keyboard option.
- new `mobile/app/(app)/cluster/[clusterId]/_layout.tsx`: Stack for room, members, signals, signal detail, votes, settings.
- `mobile/app/(app)/cluster/[clusterId]/room.tsx`: sticky plus chat scroll, footer height reset, composer key, safe-area edges.
- `mobile/src/components/room/Composer.tsx`: state reset on cluster change, mention caret on Android, collapse behavior, gif and menu dismissal.
- `mobile/src/components/CollapsibleChrome.tsx`: remove layout thrash near growing input if needed.
- `mobile/app/(app)/posts/[postId].tsx`: composer height reset, composer key, back fallback.
- `mobile/src/components/CommentComposer.tsx`: keying, focus fix, no `numberOfLines`, state reset.
- `mobile/app/(app)/cluster/[clusterId]/signals/[signalId].tsx`: reply input growth, keying, sticky or aware decision.
- `mobile/src/components/room/RaiseSignalModal.tsx`, `mobile/src/components/Modal.tsx`: focus timing, input sizing, tap handling.
- `mobile/src/components/ClusterMenu.tsx`: close-before-navigate, active section prop under Stack.
- `mobile/src/components/room/GifPicker.tsx`: height and nested scroll verification only.
- `mobile/src/components/ui.tsx`: shared `Screen` sticky logic, safe-area ownership, non-sticky footer path.
- `mobile/app.json`: Android keyboard layout mode.
- `mobile/src/features/realtime.ts`: simplify or harden teardown after nav fix.
- `mobile/src/lib/notification-routing.ts`, `mobile/src/lib/push.ts`: verify deep-link and push-tap targets still resolve to new Stack routes.

## 6. Risks and mitigations

- URL changes break push taps and deep links: keep pathnames identical, only change navigator ownership, add push-tap regression checks.
- Stack animation differences annoy users: preserve `animation: fade` for cluster sections in the new Stack.
- Chat scroll component swap regresses load-earlier or jump-to-latest: keep existing `FlatList` props (`inverted`, `onEndReachedThreshold`, `scrollEventThrottle`) and test with long histories.
- `KeyboardChatScrollView` plus inverted virtualized list flashing: follow docs guidance on draw distance if FlashList is introduced, currently plain FlatList so risk is low.
- Expo Go versus prod inset divergence: always verify keyboard and footer on a prod APK, not only Expo Go.
- Scope creep into backend or design tokens: reject changes outside `mobile/`, tokens stay from `src/lib/theme-tokens.ts`.

## 7. Definition of done

- Repro steps from Phase 0 no longer show stuck drafts or empty strips after the soak test.
- Room composer, comment composer, and signal reply all start empty on a new id.
- Keyboard-opened footers are flush with no underlap on Android prod and iOS.
- Back from room, signal detail, post detail, settings, votes, and members lands on the prior screen.
- `npm run lint`, `npx tsc --noEmit`, and `npm test` pass in `mobile/`.
- No migration, backend, token, or web behavior change.
- This plan is updated if implementation discovers a simpler safe fix.

## 8. Open questions for review

1. Keep cluster section transitions as fade in the new Stack, or use platform default push animation?
2. Should post detail and profile hide the tab bar via Stack (preferred) rather than `display: none`, and should the call screen remain full-screen Stack?
3. Should `CollapsibleChrome` collapse stay, change to opacity only, or be removed for reliability?
4. Should signal detail reply become a sticky footer like comments, or stay inline?
5. Can realtime ref counting be removed in this change, or hardened first and removed later?
