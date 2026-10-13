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

### Fixed

- Deleting your account now also removes the photos you shared in clusters you had already left.
- Fullscreen profile photos are now sharp instead of blurry.
- Fixed profile photos sometimes showing only on the edit screen and as initials everywhere else.
- Fixed uploading a profile photo crashing on Android.
- Fixed the chat composer sometimes floating mid-screen after returning from the app switcher on Android.

## [1.1.0]

Initial closed-testing release on Google Play.
