# Changelog

Tester-facing release notes for the Sensorium mobile app (closed testing on
Google Play). The web app deploys continuously and is not versioned here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):
one section per version, `Added` / `Fixed` / `Changed` groups, plain
tester-facing language. Entries are added under `Unreleased` with each change
and moved to a versioned section on release. See `README.md` (Building and
release) for the release ritual.

## [Unreleased]

### Added

- Open Mix now has optional match preferences: choose an age range you are comfortable being grouped with (Any age by default).
- Profile photos can now be cropped to a square and taken with the camera, not just picked from the gallery.
- You now get notified when someone replies to a Signal you raised, and when a Signal you helped with is marked in progress or resolved.
- You can now @-mention members in signal replies, with suggestions as you type and tappable names, just like in chat.
- You can now @-mention members in post comments, with suggestions as you type and tappable names, just like in chat.
- You can now edit your own post comments, just like chat messages (an edited comment shows an "edited" marker).
- You can now send voice notes in cluster chat: record up to 2 minutes, preview before sending, and play back with a simple player showing the time.
- You can now copy a chat message: long-press the message and tap Copy.
- You can now attach a photo taken with the camera in cluster chat, not just from the gallery.
- You can now swipe a chat message right to reply to it, without opening the long-press menu.
- You can now react with any emoji in cluster chat: long-press a message, tap the + button for the full picker with search and skin tones, or use the quick reactions as before.
- Cluster cards now have side-by-side chat and bell buttons: chat jumps straight to the room, and the bell mutes push notifications for 1 hour, 8 hours, 1 day, or until you turn them back on. Muted clusters stop buzzing but keep their unread badge.
- Required onboarding fields are now marked with a red asterisk.
- The email verification screen now mentions checking your spam or junk folder if the confirmation email is missing.

### Changed

- Delete and other destructive confirmations now use a centered dialog with stacked, full-width actions, so the decision reads clearly before you commit to it. The Delete option in post and message menus now uses the same neutral color as Edit.
- The chat room member strip now shows as many whole faces as fit your screen, with a +N badge for the rest, instead of spilling onto a second row on narrower phones. The message box also uses a shorter hint that fits on one line.
- Tidied icons, spacing, text sizes, and accent colors across screens so things line up and read consistently.
- Recent posts on Home now appear one at a time: the newest post loads first, and the next appears once that one has finished, instead of all three images starting at once.

### Fixed

- Picking a mention suggestion now replaces the letters you typed instead of leaving the last one behind, in chat and post comments.
- Busy chat no longer buzzes for every message: you get one notification per cluster that quietly updates with the recent messages until you read it, instead of a stack of buzzing alerts. Each one now names its cluster and shows who said what. Mentions still alert loudly.
- Deleting your account now also removes the photos you shared in clusters you had already left.
- Declining a cluster invitation is now final for that cluster: you will not be invited to it again, and both apps ask you to confirm before declining.
- Fullscreen profile photos are now sharp instead of blurry.
- Fixed profile photos sometimes showing only on the edit screen and as initials everywhere else.
- Fixed uploading a profile photo crashing on Android.
- Fixed the chat composer sometimes floating mid-screen after returning from the app switcher on Android.
- Fixed the back button closing the app from cluster screens (chat sections, signal detail, meetup planner, member profiles) opened from a notification. It now returns to the chat room instead.
- Fixed the phone back button leaving the app to the phone home screen from posts, queues, invites, discovery, settings pages, legal pages, and later onboarding and cluster creation steps. System back now follows the same trail as in-app back, with a sensible parent when there is no history. The chat room no longer forces home when history exists.
- Fixed the phone back button exiting to the phone home screen on Android 13 to 15.
- Fixed your own profile photo flashing back to your initial on every screen. Avatars now load from the cache again.
- Fixed faces in the chat room member strip looking cut off at the top and bottom.
- Fixed GIF search results hiding behind the keyboard in chat. The results now stay visible while you type.
- Fixed sent chat text reappearing in the message box when you tap it again right after sending, which could resend the same message twice.
- Fixed the in-call mute, camera, and speaker buttons being nearly invisible in light mode.
- Fixed the "mode unavailable" notice being hard to read in dark mode.

## [1.1.0]

Initial closed-testing release on Google Play.
