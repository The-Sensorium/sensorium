# Legal and Privacy Compliance

Audience: whoever is preparing a launch or a store submission. This is an engineering status document, not legal advice. Bobby's tracker (`Sensorium_Legal_Action_Tracker`, shared Google Sheet) stays the working task list; this file records what the code actually does, which decisions are expensive to reverse, and what has to be true before submission.

## Where things stand

| Area | State |
|---|---|
| Distribution | Web SPA on Vercel, Android on a Google Play closed testing track, iOS not submitted |
| Legal entity | Not established. Blocks DSA trader status, a Play organization account, and naming a controller in the policy |
| Public documents | Privacy Policy, Terms, and Child Safety Standards live at `/privacy-policy`, `/terms`, `/child-safety`. Source is `src/pages/legal/content.ts`, mirrored to mobile by `scripts/sync-legal.mjs` |
| Account deletion | Implemented in app: `delete_my_account` plus storage cleanup (`0193_account_deletion_storage.sql`). Meets the store requirement |
| Crash reporting | Removed in #400. No crash SDK and no crash data collection anywhere |
| Public launch | Not yet. Android is on a closed testing track, so a region move or a clean-start project migration is still cheap |

The policy and the terms were written before any of this work started and are already live. Most tracker items are corrections to existing text, not new documents.

## What blocks a submission, and why "after iOS" is the wrong gate

Four things need the legal entity, and three of them are on the iOS critical path rather than after it.

| Requirement | Why the entity is needed | Lead time |
|---|---|---|
| Apple DSA trader status | Since 17 Feb 2025, apps without trader status are removed from all 27 EU storefronts. Trader status needs verified business identity and contact details | Days after the entity exists |
| Google Play organization account | An organization account requires a D-U-N-S number. The account type cannot be switched later, so launching as an individual means a second account and an app migration | D-U-N-S is typically 5 to 30 days, on top of incorporation |
| Data controller in the policy | The policy must name the legal entity or a natural person. Naming yourself publishes your full name and address and puts fines on you personally | Instant once the entity exists |
| Store listing seller name | The displayed seller is the account's legal identity. Changing it later is a support case at best | Instant once the entity exists |

Incorporation plus D-U-N-S plus trader verification is realistically 4 to 8 weeks of wall clock with no coding overlap. Starting it when iOS is feature complete means waiting 4 to 8 weeks with a finished app.

Two things do not need the entity and should not be deferred for it: the iOS privacy manifest and App Store privacy labels, and the consent decision. Both depend on the tracker list below, so they are cheapest to settle before the iOS release is built.

## One-way doors

Waiting is fine for text. It is expensive for these.

| Decision | Current state | Cost of changing later |
|---|---|---|
| Supabase project region | Fixed at project creation | Supabase does not move a project between regions. It means a new project plus a full migration, new keys, and re-pointing Vercel, EAS, and `.env`. Trivial today, a downtime weekend later |
| Play developer account type | Individual or organization, chosen at signup | Cannot be converted. A second account and an app transfer |
| Apple account identity | Individual or organization at enrollment | Conversion to organization is restricted and needs a D-U-N-S number |
| Seller name in listings | Follows the account identity | Follows the account, so it inherits the same constraints |
| Bundle and package id (`online.thesensorium.app`) | Already set | Store identity, effectively permanent. No action needed |

Decide the Supabase region before production data exists, not after. The same applies to any vendor that fixes a data region at organization creation, such as a crash-reporting provider if one is ever reintroduced.

## Vendors in use

Derived from the code, not from the policy, and the source of truth for the vendor register. Everything below is a processor. None of them are independent controllers, which is the correction Bobby asked for in point #5.

| Vendor | Purpose | Data seen | Reached from |
|---|---|---|---|
| Supabase | Auth, database, storage, realtime | Everything in the tables below, including photos, voice notes, and call metadata | `supabase/`, `src/lib/supabase.ts`, mobile client |
| LiveKit | Voice and video for cluster calls | Live audio and video, participant identity and room tokens. Nothing recorded | `supabase/functions/create-call-token/`, `@livekit/*` clients |
| BigDataCloud | Reverse geocode during Local Radius setup | Approximate coordinates and the caller's IP, sent from the device | `src/lib/geo.ts`, `mobile/src/lib/geo.ts` |
| Expo Push, then Firebase Cloud Messaging on Android and APNs on iOS | Push delivery | Push token, sender display name, short message preview | `supabase/functions/send-push/` |
| KLIPY | GIF search and delivery | Search queries and the caller's IP, sent from the device | `src/features/gifs.ts`, `mobile/src/features/gifs.ts` |
| Resend | Transactional email | Email address and message body | `supabase/functions/send-emails/` |
| Cloudflare Turnstile | Bot protection on signup and sign-in | Device and browser signals from the challenge page | `src/components/TurnstileWidget.tsx`, `mobile/src/components/captcha-sheet.tsx` |
| Google Sign-In | Optional federated sign-in | Identity and basic profile the user approves | Supabase Auth provider |
| Vercel | Web hosting, plus web analytics on the challenge page | Request metadata, anonymized page views | `vercel.json`, `@vercel/analytics` |
| EAS | Build and signing service for the mobile apps | Build artifacts, no member data | `mobile/eas.json` |

Sentry is **not** in use. Crash reporting was removed in #400, so the Sentry rows in the shared tracker are stale.

Two of these are called straight from the device rather than through the backend: BigDataCloud and KLIPY see the member's IP address directly. That matters for the transfer mechanism, because the IP is not covered by a Supabase or LiveKit DPA.

## Retention: promised versus enforced

The policy and the system currently disagree in one place.

| Data | Policy says | Implemented |
|---|---|---|
| Profile, memberships, owned content | Deleted with the account | Yes. `delete_my_account`, plus storage cleanup for avatars, chat images, and post and comment images (0193) |
| Photos and voice notes | Deleted with the account | Voice objects are removed when a message is deleted through `delete_message` (0200). Confirm the account-deletion path also reclaims them |
| Moderation records, reports, actions | Retained up to 24 months, personal identifiers stripped on account deletion | Partially. Identifiers are stripped on deletion (0053) and retention indexes exist (0056), but no scheduled job deletes or anonymizes records older than 24 months. **Gap** |
| Metrics aggregates | Not in the policy yet | `cluster_daily_stats` and `mode_daily_stats` hold counts only, with no `user_id` column by construction, and are purged at 24 months (0148) |
| IP addresses, auth and request logs | Not addressed | Held by Supabase and Vercel under their own defaults. No policy statement yet |
| Push tokens | Not addressed | Removed when reassigned or when the device unregisters. No rule for dormant tokens |
| Email outbox (`outbound_emails`) | Not addressed | No retention rule. Rows hold the recipient address and body copy |

The moderation gap is the one to close first: it is a promise in a live document that the database does not keep, and the fix is a `pg_cron` job alongside the existing ones.

## Data inventory as implemented

Grouped by source, matching the structure Bobby asked for in point #7.

**We ask for it**

- Email address, display name, date of birth, country. Only the birth year is shown to other members.
- Profile photo, stored as a path in a private bucket with short-lived signed URLs.
- Bio and introduction answers.
- Local area plus matching radius. Precise coordinates are sent to BigDataCloud and never stored in the profile.
- Open Mix age preference.

**Collected automatically**

- IP address and request metadata at Supabase, Vercel, LiveKit, KLIPY, and BigDataCloud.
- Session and auth metadata, including federated identity if Google sign-in is used.
- Push tokens, platform, and notification read state.
- Cluster content: messages, photos, voice notes, GIF references, reactions, posts, comments, signals, votes, and mentions.
- Moderation records: reports, actions, warnings, suspensions, bans, and appeals.
- Call participation metadata. Media itself is not recorded.
- Read receipts in chat.

**Third parties**

- Google, when sign-in with Google is used.
- KLIPY, which sees GIF search queries.
- BigDataCloud, which sees coordinates during Local Radius setup.
- Expo and Firebase, which see push tokens and notification content.
- Resend, which sees the recipient address and email body.

No advertising identifiers, no analytics SDK, no attribution SDK, and no crash diagnostics.

## Trackers and consent

SDKs that touch the device or browser, for the Trackers tab and for the iOS privacy manifest.

| SDK or surface | Platform | Accesses | Consent |
|---|---|---|---|
| `expo-notifications` | App | Push token, device platform | Covered by the OS permission prompt |
| `expo-location` | App | Coarse location, only for Local Radius | OS permission prompt, feature opt-in |
| `expo-camera`, `expo-image-picker` | App | Camera and photo library | OS permission prompt |
| `expo-audio` | App | Microphone, for voice notes and calls | OS permission prompt |
| LiveKit WebRTC | App and web | Camera, microphone, network | OS or browser permission prompt |
| `@supabase/supabase-js` | App and web | Session token, local storage | Essential |
| `react-native-webview` | App | Turnstile challenge page only | Essential |
| Vercel Analytics | Web only | Anonymized page views on the challenge page, no cookies | Not consent-gated today |

There is no non-essential tracker in the app. If that stays true, an in-app consent management platform is unnecessary and point #8 reduces to confirming the web challenge page and any future website analytics. Confirm with Bobby before buying or building a CMP.

On iOS, the privacy manifest (`PrivacyInfo.xcprivacy`) and the App Store privacy labels have to match this table. App Tracking Transparency is only required if a cross-app tracking SDK is ever added.

## Tracker items and gates

Gates are the trigger, not a date: start an item when its gate fires. `Now` means it is unblocked and its lead time or irreversibility makes deferring costly.

| ID | Item | Owner | Status | Gate |
|---|---|---|---|---|
| A1 | Establish the legal entity | Titan | Not started | **Now**. Longest lead time, unblocks A2 and both store accounts |
| A2 | Replace "Sensorium" with the entity's legal name | Bobby | Not started | Before submission, after A1 |
| A3 | Draft the data, purpose, legal basis, retention table | Bobby | Not started | After iOS feature freeze |
| A4 | Review and correct that table | Titan | Not started | After A3 |
| A5 | Add the data subject rights section | Bobby | Not started | After iOS feature freeze |
| A6 | Provide the vendor and transfer template | Bobby | Not started | **Now**. Unblocks A7 and A9 |
| A7 | Fill the vendor register | Titan | Facts collected (vendors section above) | **Now**. Ongoing as vendors change |
| A8 | Select EU regions where offered | Titan | Not started | **Now**. One-way door, cheapest before production data |
| A9 | Review the register and update the notice | Bobby | Not started | Before submission, after A8 |
| A10 | Correct the processor wording | Bobby | Not started | Before submission. The wrong sentence is live today |
| A11 | Define the retention policy | Titan | Gap analysis done (retention section above) | **Now**. May need a `pg_cron` migration |
| A12 | Advise on retention periods and update the policy | Bobby | Not started | After A11 |
| A13 | Confirm the full data inventory | Titan | Facts collected (inventory section above) | **Now** |
| A14 | Rewrite section 1 grouped by source | Bobby | Not started | After A13 |
| A15 | Prepare the consent and tracker template | Bobby | Not started | After A16 |
| A16 | List every SDK, cookie, and pixel | Titan | Facts collected (trackers section above) | **Now**. Drives the iOS labels and manifest |
| A17 | Research consent management options | Titan | Not started | After A16, and possibly unnecessary |
| A18 | Decide on a lawyer and a security review | Titan | Not started | Before submission, after the drafts land |

## Ground rules

- A new vendor, SDK, bucket, or table means this file and the shared tracker change in the same pull request, before it ships.
- Two statements in the live policy are known to be wrong and are tracked as A10 and A11. Do not rewrite them piecemeal; fix them together with the retention policy so the document stays internally consistent.
- The web and mobile legal pages render from one source (`src/pages/legal/content.ts`). Edit there, then run `npm run sync:legal`.
