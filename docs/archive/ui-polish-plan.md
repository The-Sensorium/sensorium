# Mobile UI polish plan (full-app audit)

Goal: close the UI/UX consistency and correctness gaps found by auditing
every mobile screen and shared component against the video's checklist
(alignment, icon weight, typography, dividers, CTA tone, redundant copy,
contrast, color tokens). Mobile-only. No backend, migrations, or new deps.

Locked decisions:

- Gutters: content screens use the 24px grid (`spacing.containerMargin`);
  the room and call surfaces use 16px (`spacing.gutter`) by design. Codify,
  do not change.
- Icons: keep the two-role rule, `2` for navigational and primary-action
  glyphs, `1.5` for secondary/meta/decoration. Fix only outliers within a
  role, and make implicit weights explicit.
- Sticky headers (video "improvement 1") remain out of scope.
- Plan lives at `docs/archive/ui-polish-plan.md`. Full gates plus a
  `mobile/CHANGELOG.md` `Unreleased` entry.

## Scope

In scope: every finding marked P0, P1, and P2 in the tables below, except the
rows marked `LEAVE`. All of it ships, across sequential PRs from `develop`
(squash-merged).

Out of scope: sticky headers (video "improvement 1"); the `LEAVE` rows
(tab-bar icon weight, the deliberate amber/emerald/`Field`-border exceptions,
the icon-only Send button style); any web-side change; any backend,
migration, RLS, or storage change.

## Implementation status (branch `fix/mobile-ui-polish`)

Done and verified (tsc clean, 180 tests pass, oxlint 0 errors):

- P0: `CallControls` off-state contrast + cluster accent; `ModePanel`
  fallback text.
- P1 icons: all 5 back arrows to 2; `CreatedPendingSection` Clock/X;
  `MeetupEntry` CalendarDays; `PublicClusterCard` status icon; both `Check`
  outliers. `mode/[modeId]` back arrows made explicit; `MessageItem` and
  `ParticipantTile` meta glyphs to 1.5.
- P1 CTAs: `signals` Raise, `meetups/new` Add another time, `PreJoin`
  Continue/Join, `PushPermissionPrompt` Settings/Enable to minHeight 48.
- P1 colors: `PublicClusterCard` scheme-aware status; `AnimatedSplash` uses
  `palette.background`. Added `src/lib/status-palette.ts` and routed amber
  (`MemberLocalTime`, `MatchPreferencesSheet`, `home`, `meetups/new`), green
  (`invites`, `votes`), and sky through it.
- P1 dedupe: `ClusterCard` status string; `MuteButton` confirm sheet; signal
  status map via new `src/lib/signal-status.ts` in `signals`, `signals/[signalId]`,
  `TimelineRows`.
- P1 gutter: room composer aligned to the 16 list edge.
- P2: `PreJoin` body 24 to 16; `InCallChat` input border and timestamp;
  `OfflineBanner` icon weight and text scale; `ModePanel` chevrons and
  match-line size; `CallHeader` line heights.
- Changelog `Unreleased` entries added.

Also done in the second pass: lineHeight and/or title scale in `settings.tsx`,
`introductions.tsx`, `cluster-created.tsx`, `queue/[queueId].tsx`,
`settings/reports.tsx`, `clusters.tsx`, `home.tsx`, `PostCard`,
`CreatedPendingSection`, `PostMedia`, `ModePanel`, `CallHeader`, `InCallChat`;
`ui.tsx` `Field` now skips an empty label (`introductions` passed `label=""`);
`settings/reports` status enum capitalized and the duplicate bottom Back
removed; `home`/`clusters` nav arrows made explicit; `MessageInfoModal` title
lineHeight. `ClusterMenu` was already consistent (20/28), left as is.

Third pass also completed: lineHeight/title scale in `votes.tsx`,
`meetups.tsx`, `room.tsx` delete dialog, `CommentItem`, `ReportModal`,
`ConfirmSheet`, `MuteDurationSheet`, `IntroChecklistBanner`, `CommentThread`,
`AgeRangeSlider`, `CallChatSheet`, `settings/profile.tsx`,
`notifications.tsx`; off-scale sizes in `VoiceBubble`, `VoiceRecorder`,
`PronounField`, `appearance.tsx`, `MemberCardMenu`, `notifications`, and
`meetups` badges; the `Field` empty-label guard; and two copy dedupes
(`settings/profile` local-time subtitle, `notifications` empty copy).

Fourth pass (role-level audit, not attribute sweeps): destructive delete
confirms now use the error tone (`CommentItem`, room message delete); radio
groups use the `checked` accessibility state consistently; icon-only controls
have `accessibilityRole`/state (call controls, voice recorder, room composer,
GIF picker, timezone picker, call close); the appeal back control pops instead
of pushing `/restricted`; the profile, post, queue, and signal not-found
states render a back control for iOS; the intro banner CTA label matches the
compact primary size; and the Posts tab title matches the other tab titles.

Won't do (decided):

- Tokenizing the magic 16px gutters (`room.tsx`, `call.tsx`, call components,
  `onboarding/index.tsx`) to `spacing.gutter` / `containerMargin`. The values
  are already correct, so this is import hygiene with no visual change and is
  not worth touching the room/call layout code. Do it only as an isolated
  `chore` PR if ever needed.
- Minor copy duplicates: `meetups/new` repeated title, `home` greeting plus
  daypart, `ModePanel` eyebrow, `CreatedPendingSection` "Pending". These are
  content decisions, not defects; leave for a content/design pass.

## Audit coverage

Read in full: all `app/**` routes, `src/components/**` (incl. `room/`,
`room/call/`, `discovery/`, `created/`, `meetups/`, `onboarding/`), and the
supporting `theme-tokens.ts`, `ui.tsx`, `cluster-theme.tsx`. Ground truth for
"good": `PostMedia.tsx:114-134` (backed overlay), `Screen`/`Card` gutters,
`PrimaryButton` (pill, 48, no caps).

## Findings by checklist item

Severity: P0 correction, P1 user-visible consistency, P2 hygiene.
Disposition: FIX, CENTRALIZE (deliberate color, keep but tokenize),
LEAVE (intentional, disputed).

### 1. Contrast and color correctness

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P0 | FIX | `src/components/room/call/CallControls.tsx:102,103,109,110,155,157,213` | Inactive mic/video/speaker glyphs are hardcoded `#fff` on `t.surfaceHighest` (`#eedfda` light). White on that is about 1.3:1, so the "off" state is invisible in light mode. Hardcoded `#fff` also bypasses the cluster accent. Use `t.onSurface`/`t.onSurfaceVariant` on the off state and `useClusterOnAccent()` on the primary state. |
| P0 | FIX | `src/components/discovery/ModePanel.tsx:40,74` | Bare `<Text>This mode isn't available yet.</Text>` with no style. Defaults to black, unreadable in dark mode. Add `color: t.onSurfaceVariant`, `fontSize: 14`, `lineHeight: 20`. |
| P1 | FIX | `src/components/PublicClusterCard.tsx:16-17` | Raw `#047857`/`#b45309` status colors with no dark variant and no token. Dark `#222` background gives weak contrast. Use a scheme-aware token or the existing accent. |
| P1 | FIX | `src/components/AnimatedSplash.tsx:42` | Raw `#181818`/`#fef8f7`; `#fef8f7` is not `colors.background` (`#fff8f6`). Use `colors`/`darkColors`. |
| P1 | CENTRALIZE | `src/components/MemberLocalTime.tsx:21` vs `src/components/MatchPreferencesSheet.tsx:110-111` | Amber time/availability color uses different light values (`#f59e0b` vs `#b45309`) despite a comment claiming they match. Centralize into one tokenized helper. |
| P2 | CENTRALIZE | `app/(app)/home.tsx:67`, `app/(app)/invites/[invitationId].tsx:21`, `app/(app)/cluster/[clusterId]/meetups/new.tsx:103`, `app/(app)/cluster/[clusterId]/votes.tsx:45`, `src/components/PostMedia.tsx:132-133`, `src/components/PushPermissionPrompt.tsx:117,119`, `src/components/ZoomableImage.tsx:67` | Raw hex/rgb (`amber`, `green`, emerald tally, `#fff` overlays). `votes.tsx:45` is scheme-aware and deliberate (keep). `meetups/new.tsx:103` may be deliberate. Centralize the rest into tokens or small palette helpers. |

Deliberate exceptions to keep (do not "fix"): amber time-of-day
(`MemberLocalTime`, per `docs/archive/MEMBER_PROFILE_DETAIL_UPDATE_PLAN.md`),
emerald yes-tally (`votes.tsx:45`), `Field`/`PasswordField` `t.outline` input
borders (documented intentional).

### 2. Icon stroke weight

Rule: `2` = navigational/primary action; `1.5` = secondary/meta/decoration;
lucide default (unset) is `2`, so secondary glyphs must be explicit.

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P1 | FIX | `app/(app)/posts/[postId].tsx:174`, `app/(app)/profile/[userId].tsx:129`, `app/(app)/queue/[queueId].tsx:113`, `app/(app)/settings/reports.tsx:39`, `app/(app)/cluster/[clusterId]/signals/[signalId].tsx:251` | Back arrow at 1.5; back arrows are 2 everywhere else. |
| P1 | FIX | `src/components/created/CreatedPendingSection.tsx:78` (Clock 2 vs same icon `:111` 1.5), `:134` (dismiss X 2 vs 1.5 elsewhere) | Same icon, two weights in one file. |
| P1 | FIX | `src/components/meetups/MeetupEntry.tsx:155` | `CalendarDays` 2 here, 1.5 in `meetups.tsx:128,289,352` and `meetups/new.tsx:218`. |
| P1 | FIX | `src/components/PublicClusterCard.tsx:106` | Status icon stroke 1.75, outside the system. |
| P1 | FIX | `app/(app)/clusters/new.tsx:297`, `app/(app)/invites/[invitationId].tsx:144` | Selected `Check` at 2.5 vs 2 elsewhere. |
| P2 | FIX | `src/components/MessageItem.tsx:201` (2) vs `:259` (1.5); `src/components/PostComposer.tsx:97` (Plus 2) vs `:239` (Send 1.5); `src/components/CommentComposer.tsx:446` vs `:448`; `src/components/room/Composer.tsx:633` vs `:635` | Same-role glyphs at different weights (Send/Check, CornerUpLeft). Pick one per role. |
| P2 | FIX | `src/components/discovery/ModePanel.tsx:183,292`, `src/components/OfflineBanner.tsx:19` | Secondary chevron/status icons rely on implicit 2; set 1.5. |
| P2 | FIX | `app/(app)/mode/[modeId].tsx:50,78`, `app/(app)/home.tsx:367,421,441,571`, `app/(app)/clusters.tsx:185` | Nav arrows rely on the implicit default; make explicit 2. |
| P2 | FIX | `src/components/room/call/ParticipantTile.tsx:67` | 14px `MicOff` meta glyph at 2; should be 1.5. |
| P2 | FIX | `src/components/ClusterMenu.tsx:105`, `src/components/MemberCardMenu.tsx:114,139`, `src/components/ClusterCard.tsx:170` | Section/menu/chat icons at 1.5 vs the 2 used by peers (medium confidence, confirm per role). |
| - | LEAVE | `app/(app)/_layout.tsx:114,121,129,136,143` | Tab bar line icons at 1.5. `DESIGN.md` specifies a light line-icon nav style; keep. Disputed by one pass. |

### 3. Typography

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P1 | FIX | `app/(app)/cluster/[clusterId]/room.tsx:1610`, `settings.tsx:117`, `votes.tsx:187,218,312,425,569`, `meetups.tsx:425,432,446`, `introductions.tsx:114,132`, `signals.tsx:121`, `signals/[signalId].tsx:477` | Wrapping body/caption text with no `lineHeight`. |
| P1 | FIX | `app/(app)/home.tsx:240,247,363,599`, `clusters.tsx:81,182`, `settings.tsx:270,325,448,481`, `cluster-created.tsx:75`, `queue/[queueId].tsx:72`, `settings/reports.tsx:96`, `settings/profile.tsx`, `notifications.tsx`, `invites/[invitationId].tsx` | Same: missing `lineHeight` on multiline copy. |
| P1 | FIX | `src/components/room/call/PreJoin.tsx:89,150` (20/700 no lineHeight), `:112,210` (16/600), `CallHeader.tsx:33` (17 no lineHeight vs `call.tsx:39` has 22), `CallChatSheet.tsx:87` (16/700 no lineHeight), `src/components/PostCard.tsx:232,236,299`, `CommentItem.tsx:194,198`, `ReportModal.tsx:106,134,191`, `Composer.tsx:335,673`, `VoiceRecorder.tsx:168`, `ConfirmSheet.tsx:97`, `MuteDurationSheet.tsx:188`, `MuteButton.tsx:141`, `IntroChecklistBanner.tsx:82`, `CommentThread.tsx:257,261`, `AgeRangeSlider.tsx:226,227` | Same across shared components and the call flow. |
| P1 | FIX | Title scale has no single source: `ClusterMenu.tsx:33` (20/28), `room.tsx:1058` (17/22), card titles (18/24), `signals/[signalId].tsx:288` and `MessageInfoModal.tsx:128` (20/28, 20/26) | Define one title scale and apply. |
| P2 | FIX | Off-scale sizes: 15/21 (`MuteButton.tsx:81`, `MuteDurationSheet.tsx:140,180`, `notifications.tsx:295`, `signals.tsx:273`, `signals/[signalId].tsx:252`, `votes.tsx:215,248`, `room.tsx:1049,1089`, `MemberCardMenu.tsx:115,140`); 13/18 (`PushPermissionPrompt.tsx:76`, `OfflineBanner.tsx:20,37`, `VoiceBubble.tsx:25`, `VoiceRecorder.tsx:333,336`, `PronounField.tsx:52`, `appearance.tsx:149`); 11 (`PostMedia.tsx:133`, status badges in `signals.tsx:270`, `signals/[signalId].tsx:285`, `meetups.tsx:392,665`, `meetups/new.tsx:299,310`, `ClusterCard.tsx:190`); 17/22 (`home.tsx:212`); 22/30 (`meetups.tsx:355`); 22/28 (`invites/[invitationId].tsx:111`); 18/26 (`meetups.tsx:96,105,131,263,291,354`, `meetups/new.tsx:221`); 12/18 (`home.tsx:417`) | Normalize to the scale (12/16, 14/20, 16/24, 18/24, 20/28, 24/30). Review hero exceptions (`clusters/new.tsx:170`, `cluster-created.tsx:96`) for `letterSpacing: -0.2`. |
| P2 | FIX | `src/components/ui.tsx:335` ("OR" uppercase, no `letterSpacing`), `app/(app)/_layout.tsx:101` (tab label 12/500 no `lineHeight`), `StepReview.tsx:22` and `PostCard.tsx:110` (`500` vs `600` emphasis) | Minor scale/weight consistency. |

### 4. Dividers and borders

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P2 | FIX | `src/components/room/Composer.tsx:515` (`t.outline`) vs `src/components/CommentComposer.tsx:358` (`t.outlineVariant`) | Mirrored input surfaces use different border weights. |
| P2 | FIX | `src/components/room/call/InCallChat.tsx:133`, `src/components/created/CreatedPendingSection.tsx:152`, `src/components/ui.tsx:273` | Heavier border than the `outlineVariant` standard (Field borders are deliberate, leave). |
| P2 | FIX | `app/appeal.tsx:152` (radii.xl vs Field radii.md), `app/(app)/cluster/[clusterId]/room.tsx:1123` (primary border), `src/components/MuteDurationSheet.tsx:202` (Cancel surfaceHigh vs surfaceContainer peers) | Local inconsistencies. |

### 5. CTA tone and hit targets

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P1 | FIX | `app/(app)/cluster/[clusterId]/signals.tsx:110`, `meetups/new.tsx:343`, `src/components/room/call/PreJoin.tsx:97-114,199-211`, `src/components/PushPermissionPrompt.tsx:93,111` | Primary CTAs at `minHeight: 44`, under the 48 standard. |
| P2 | FIX | `src/components/captcha-sheet.tsx:143-158` (no minHeight), `app/restricted.tsx:130,156,167`, `src/components/onboarding/StepLocal.tsx:137`, `IntroChecklistBanner.tsx:100`, `ReportModal.tsx:123`, `created/CreatedPendingGate.tsx:44-60` (label 14 not 16), `app/(app)/clusters.tsx:55` (paddingVertical 14) | Undersized or off-spec actions. |
| - | REVIEW | `PostComposer.tsx:234`, `CommentComposer.tsx:433`, `Composer.tsx:620` | Circular icon-only Send at 44x44/radius 22; intentional icon button, keep unless standardizing. No ALL-CAPS CTAs exist anywhere. |

### 6. Redundant and duplicated copy

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P1 | FIX | `src/components/ClusterCard.tsx:45` vs `:122-131` | Status string computed then re-derived inline; the two diverge (`Pending,` vs `Pending ·`). Use one string. |
| P1 | FIX | `src/components/MuteButton.tsx:85-100` vs `:143-158` | Identical `ConfirmSheet` and body copy written twice. |
| P1 | FIX | `app/(app)/cluster/[clusterId]/signals.tsx:24`, `signals/[signalId].tsx:39`, `src/components/room/TimelineRows.tsx:14` | Signal status label map duplicated three times. |
| P2 | FIX | `meetups/new.tsx:211` vs `:221` (title repeated), `:384-387` (status vs CTA contradiction at 0 slots), `settings/profile.tsx:224` vs `:264`, `notifications.tsx:146` vs `:234`, `settings.tsx:117` vs `:139`, `settings/reports.tsx:92` (raw enum), `:37`/`:120` (two back controls), `room.tsx:1101` vs `:1273` (member count twice), `home.tsx:208` vs `:213` (double greeting), `ModePanel.tsx:84` vs `:88`, `CreatedPendingSection.tsx:81` vs `:112` | Minor duplicated labels/copy. |

### 7. Alignment and gutters

| Sev | Disposition | File:line | Issue |
|---|---|---|---|
| P1 | FIX | `app/(app)/cluster/[clusterId]/room.tsx:1507` | Composer wrapper pads 12 while the message list pads 16, so bubbles and composer do not share a vertical edge. |
| P2 | FIX | `src/components/room/call/PreJoin.tsx:87,149` | PreJoin body pads 24 while the call surface uses 16 (two gutters in one surface). |
| P2 | FIX | `src/components/TimezonePicker.tsx:60,76,84` and `onboarding/StepProfile.tsx:53,69` | Same modal uses 16 for the header/search and 24 for list rows. |
| P2 | FIX | `src/components/PostActionsSheet.tsx:48` (8) vs `ConfirmSheet.tsx:63` (16) | Bottom-sheet content edges do not align across the app. |
| P2 | FIX | `app/(app)/cluster/[clusterId]/room.tsx:1038,1075,1108,1112,1117,1201,1311`, `call.tsx:35,244,282`, `room/call/CallHeader.tsx:28`, `CallControls.tsx:115`, `CallChatSheet.tsx:76,76`, `InCallChat.tsx:109,113,120`, `room/MessageInfoModal.tsx:204` | Magic 16/24 literals on chat/call surfaces; use `spacing.gutter`/`spacing.containerMargin`. Token hygiene, no visual change. |
| - | FIX | `app/(onboarding)/index.tsx:98,210` | `padding: 24` literal; use `spacing.containerMargin`. |

Content screens otherwise honor the 24 grid via `Screen` and the list
containers (`posts.tsx:291`, `notifications.tsx:250`).

## Implementation phases

Sequencing is by severity. Each PR is independently shippable and tested.

### Phase 0: baseline

- [ ] Branch `fix/mobile-ui-polish` off `develop`.
- [ ] Capture light and dark screenshots (before) of: call screen, mode
      panel fallback, public cluster card, cluster room, a member profile.

### Phase 1: P0 correctness

- [ ] `CallControls.tsx:102,103,109,110,155,157,213` - off-state glyphs use
      `t.onSurface`/`t.onSurfaceVariant` on `surfaceHighest`; on-state uses
      `useClusterOnAccent()`; remove hardcoded `#fff`.
- [ ] `ModePanel.tsx:40,74` - style the fallback `<Text>` with
      `t.onSurfaceVariant`, `14/20`.

### Phase 2: P1 user-visible consistency

- [ ] Back arrows to 2: `posts/[postId].tsx:174`,
      `profile/[userId].tsx:129`, `queue/[queueId].tsx:113`,
      `settings/reports.tsx:39`, `signals/[signalId].tsx:251`.
- [ ] Same-icon weights: `CreatedPendingSection.tsx:78,134`,
      `MeetupEntry.tsx:155`, `PublicClusterCard.tsx:106`,
      `clusters/new.tsx:297`, `invites/[invitationId].tsx:144`.
- [ ] Primary CTAs to `minHeight: 48`: `signals.tsx:110`,
      `meetups/new.tsx:343`, `PreJoin.tsx:97-114,199-211`,
      `PushPermissionPrompt.tsx:93,111`.
- [ ] Color tokens: `PublicClusterCard.tsx:16-17` scheme-aware status colors;
      `AnimatedSplash.tsx:42` use `colors`/`darkColors`.
- [ ] `lineHeight` on wrapping text: room, votes, introductions, meetups,
      signals, settings, settings/reports, cluster-created, home, clusters,
      invites, plus `PostCard`, `CommentItem`, `ReportModal`, `Composer`,
      `ConfirmSheet`, `MuteDurationSheet`, `MuteButton`,
      `IntroChecklistBanner`, `CommentThread`, `AgeRangeSlider`, and the call
      flow (`PreJoin`, `CallHeader`, `CallChatSheet`, `InCallChat`).
- [ ] Title scale: define one title treatment and apply across
      `ClusterMenu.tsx:33`, `room.tsx:1058`, card titles,
      `signals/[signalId].tsx:288`, `MessageInfoModal.tsx:128`.
- [ ] Dedupe: `ClusterCard.tsx` status string (`:45`/`:122-131`);
      `MuteButton.tsx` `ConfirmSheet` (`:85-100`/`:143-158`); signal status
      map (`signals.tsx:24`, `signals/[signalId].tsx:39`,
      `TimelineRows.tsx:14`).
- [ ] Room composer gutter: `room.tsx:1507` align 12 to the list 16.

### Phase 3: P2 hygiene

- [ ] Remaining explicit icon weights: `MessageItem.tsx:201`,
      `PostComposer.tsx:97`, `CommentComposer.tsx:446`, `Composer.tsx:633`,
      `ModePanel.tsx:183,292`, `OfflineBanner.tsx:19`,
      `mode/[modeId].tsx:50,78`, `home.tsx:367,421,441,571`,
      `clusters.tsx:185`, `ParticipantTile.tsx:67`, `ClusterMenu.tsx:105`,
      `MemberCardMenu.tsx:114,139`, `ClusterCard.tsx:170`.
- [ ] Off-scale type normalization to the scale in item 3 (15/13/11/17/22
      occurrences across `MuteButton`, `MuteDurationSheet`, `notifications`,
      `signals`, `votes`, `room`, `MemberCardMenu`, `PushPermissionPrompt`,
      `OfflineBanner`, `VoiceBubble`, `VoiceRecorder`, `PronounField`,
      `appearance`, `PostMedia`, `meetups`, `meetups/new`, `invites`,
      `home`). Review heroes `clusters/new.tsx:170` and
      `cluster-created.tsx:96` for `letterSpacing: -0.2`.
- [ ] `ui.tsx:335` OR `letterSpacing`; `_layout.tsx:101` tab label
      `lineHeight: 16`; `StepReview.tsx:22` and `PostCard.tsx:110` weight.
- [ ] Dividers/borders: `Composer.tsx:515` vs `CommentComposer.tsx:358`;
      `InCallChat.tsx:133`; `CreatedPendingSection.tsx:152`; `ui.tsx:273`;
      `appeal.tsx:152`; `room.tsx:1123`; `MuteDurationSheet.tsx:202`.
- [ ] Tokenize magic gutters: `room.tsx:1038,1075,1108,1112,1117,1201,1311`;
      `call.tsx:35,244,282`; `CallHeader.tsx:28`; `CallControls.tsx:115`;
      `CallChatSheet.tsx:76`; `InCallChat.tsx:109,113,120`;
      `MessageInfoModal.tsx:204`; `onboarding/index.tsx:98,210`.
- [ ] Align secondary gutters: `PreJoin.tsx:87,149`;
      `TimezonePicker.tsx:60,76,84`; `StepProfile.tsx:53,69`;
      `PostActionsSheet.tsx:48` vs `ConfirmSheet.tsx:63`.
- [ ] Centralize deliberate colors: one helper/token for amber
      (`MemberLocalTime.tsx:21`, `MatchPreferencesSheet.tsx:110-111`,
      `home.tsx:67`), green (`invites/[invitationId].tsx:21`), period colors
      (`meetups/new.tsx:103`); keep emerald tally and `Field` borders as is.
- [ ] Minor dedupe/copy: `meetups/new.tsx:211/221,384-387`,
      `settings/profile.tsx:224/264`, `notifications.tsx:146/234`,
      `settings.tsx:117/139`, `settings/reports.tsx:37/92/120`,
      `room.tsx:1101/1273`, `home.tsx:208/213`, `ModePanel.tsx:84/88`,
      `CreatedPendingSection.tsx:81/112`.

## Verification

- `cd mobile && npm run lint`
- `cd mobile && npx tsc --noEmit`
- `cd mobile && npm test`
- `npm run lint` (root). Skip `test:coverage` (style/copy only, per
  `AGENTS.md`). No synced web file changes, so `sync-db-types --check` is not
  required.
- Manual: dark and light pass over the call screen (off-state controls now
  visible), mode panel fallback, public cluster card, and a cluster room vs a
  members screen for gutter parity.

## Release and changelog

- Branches off `develop`, target `develop`, squash. Suggested split:
  `fix/mobile-call-controls-contrast` (Phase 1 P0), then
  `fix/mobile-ui-polish` (Phases 2 and 3), or one PR per phase.
- `mobile/CHANGELOG.md` `Unreleased`:
  - Fixed: "Call controls are readable in light mode."
  - Fixed: "Mode availability text is readable in dark mode."
  - Changed: "Consistent icon weights, spacing, and type across screens."
- No version bump until release.

## Follow-ups

- Sticky headers on profile and signal detail (video "improvement 1").
- The tab-bar icon weight remains intentionally 1.5; revisit only with a
  design sign-off.
