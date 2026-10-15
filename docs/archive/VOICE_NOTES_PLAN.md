# Voice Notes (Web + Mobile) - Shipped Record

Status: shipped on both platforms. Cluster-chat voice notes, timer-only
playback (play/pause plus elapsed/total time, no waveform, no speed).

## What shipped

- Record up to 2:00 (client auto-stop) and 5 MB (bucket cap), AAC-first
  (`audio/mp4`, `audio/m4a`) with Opus containers tolerated on ingest.
- Draft preview ("Preview Audio") with play, timer, discard, and send.
  Send is disabled for sub-second drafts.
- Bubble player: play/pause plus `0:07 / 0:42` timer. One shared audio focus:
  starting any playback pauses whatever else plays (bubbles and draft
  previews); opening the recorder stops playback so the mic cannot capture
  speaker output.
- Replies quote voice notes as `Voice note (0:42)`; push previews use the
  same label. Voice notes are not editable. Mute collapses them, moderation
  hide/restore works, read receipts and reactions behave like text, and the
  storage object is removed on delete.

## Backend contract (0200, hardened in 0201)

- `messages.audio_url` (bare `voice-notes/{cluster_id}/{message_id}.m4a` path,
  never a signed URL), `audio_duration_sec` (1-120), `audio_waveform`
  (nullable JSON peaks, max 64 entries, collected but not rendered in v1),
  `audio_mime`.
- Private `voice-notes` bucket with member-scoped policies mirroring
  `chat-images`; short-lived signed URLs like all other media.
- `send_message` accepts the audio params (defaults keep old clients
  working); exactly one of text/image/audio, duration and MIME validated.
- `delete_message` removes the voice object server-side (GUC-guarded, same
  pattern as the 0054 storage reclaim); clients keep a cache-first removal
  as backup. Return type unchanged.
- A `messages_no_audio_edit` trigger rejects content changes on audio rows,
  so the no-edit rule is enforced in the database, not just the UI.

## Key decisions and trade-offs

- Timer-only players on both clients. An early iteration rendered waveforms
  (custom bars, then a niche RN library); both were cut. There is no
  `wavesurfer.js` equivalent for React Native (production RN chat renders
  server peaks on mature primitives), and a simple timer proved sufficient.
- Durations use client-owned stopwatches: `MediaRecorder` exposes no
  duration API and `expo-audio` recorder metering did not tick reliably.
- Mobile uploads via the ArrayBuffer path (Blob/FormData do not work with
  Supabase Storage on React Native); `mobile/scripts/sync-db-types.mjs`
  swaps only the Blob-based `uploadVoiceNote`, everything else syncs verbatim.
- No transcription in v1 (accessibility and moderation-search cost).

## Known limitations

- Opus/WebM notes recorded on Chrome/Firefox may not play on Safari/iOS;
  AAC-first probing minimizes this but it is unverified on real Safari.
- A device whose recorder yields `.3gp` cannot send (client rejects it with
  copy); confirmed `.m4a` output on tested Android hardware.
- Captions on voice notes are legal in the RPC but no client sends them, so
  push previews always show the duration label.
