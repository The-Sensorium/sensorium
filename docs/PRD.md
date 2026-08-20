# Sensorium - Product Requirements Document (MVP)

This document defines what Sensorium is, who it is for, and how it should behave. It is the product source of truth: before changing product behavior, read this first. For the technical architecture, see [`ARCHITECTURE.md`](ARCHITECTURE.md); for the visual design, see [`DESIGN.md`](DESIGN.md).

**Product Name:** Sensorium

**Tagline:** Eight strangers. One cluster.

## Naming Note

Sensorium is inspired by the show Sense8, and that inspiration is fine to reference openly in conversation, marketing, and community communication. What we should avoid is using the show's own coined terminology as actual product naming: feature names, screen labels, or branding. Those terms belong to the show and carry IP risk if baked into the product itself, especially if this grows beyond a volunteer project.

Terms to avoid using as product naming, since they were specifically coined for the show's fictional concept: Psycellium, Sensate, BPO (Biologic Preservation Organization), Whispers, and blockers (in the sense of suppressing the psychic connection).

Terms that are fine to keep using, since they're ordinary English words the show happens to use rather than something it invented: Cluster, visiting, sharing.

If anyone proposes a new feature or screen name going forward, check whether it's a term coined specifically by the show before it goes into the spec. When in doubt, prefer plain language over anything that sounds like it was pulled directly from Sense8's mythology.

---
## Vision

Sensorium is a social platform that helps strangers form meaningful long-term connections through small permanent groups called Clusters.

Unlike traditional social networks that focus on content, followers, and engagement, Sensorium focuses on conversation, emotional awareness, and shared experiences.

---
## Problem Statement

Existing platforms optimize for broadcasting.
- Instagram optimizes for attention.
- X optimizes for reach.
- Reddit optimizes for discussion.
- Discord optimizes for communities.

None are designed to help a small group of strangers build genuine long-term friendships.

Sensorium solves this by placing users into permanent clusters of exactly eight people and giving them the tools to build trust, connection, and shared history over time.

---
## Target Audience

Primary
Adults (18+) looking to connect with new people.

Examples:
- Remote workers
- Digital nomads
- People seeking friendships
- People with niche interests
- People feeling socially isolated

---
## Core Concepts

### Cluster

A permanent group of exactly 8 members. Clusters are the primary unit of interaction in Sensorium.

### Matching Modes

Cluster formation is modular across multiple matching modes, each forming its own independent cluster:

| Mode | Description |
|---|---|
| Exact Birthdate | Matched with people born on the same day, month, and year |
| Birth Year + Month | Matched with people born in the same month and year |
| Birth Month | Matched with people born in the same month, any year |
| Birth Year | Matched with people born in the same year, any month |
| Local | Matched with people within a user selected radius of their location |

A user can be active in multiple clusters at once, each formed via a different mode. For example, someone could be in a Birth Year cluster and a Local cluster at the same time.

Local mode constraint: a user may only have one active Local cluster at a time (one radius), not multiple overlapping radii. They cannot run a tight 10km cluster and a broader 100km cluster simultaneously.

Open question: total cluster cap. Whether there's a maximum number of simultaneous clusters a user can belong to across all modes, or whether it's unlimited, is not yet decided. This affects onboarding UI, server load, and how spread thin a user's attention gets across clusters.

Open question: should Interest based clusters remain as a mode? Beta interest form research showed a clear preference, around 71%, for birth based matching over interest based matching, with several respondents explicitly saying shared interests defeats the purpose of the concept. Worth deciding whether Interest stays in as an optional extra mode or is cut from v1 entirely.

### Thin Pool Handling

If a selected matching mode doesn't have enough people to fill a cluster (for example, very few users share an exact birthdate), the user is presented a choice rather than the system deciding automatically:
- Keep waiting in the current mode's queue, or
- Broaden to a wider mode (Exact Birthdate to Birth Year + Month to Birth Year)

This preserves user intent. Some respondents in the beta form said they would rather wait a long time for a tighter match than be matched quickly with someone far from what they wanted.

### Signals

A way for a member to ask their cluster for help: advice, recommendations, feedback, accountability, or assistance with something specific. This is the closest the app gets to the show's core mechanic, where the cluster comes together and pools whatever skills or perspective each member has to help the one in need.

A member raises a Signal with a short prompt describing what they need, for example "need advice on a job offer" or "could use accountability on a deadline this week." Other cluster members can respond directly in a thread tied to that Signal, separate from general chat, so the request doesn't get lost in ongoing conversation.

A Signal has a simple state: open, in progress, or resolved. The member who raised it marks it resolved once they've gotten what they needed; it isn't auto-closed by time or by vote.

Open question: should Signals support a category tag (advice, recommendation, accountability, practical help) so members can scan what kind of support is being asked for, or should it stay freeform text only for v1?

Open question: should there be a notification specifically for new Signals, separate from regular message notifications, so a genuine ask for help doesn't get buried in chat activity?

---
## User Requirements

Users must:
- Be 18+
- Verify email address
- Choose a display name
- Select full date of birth
- Select a country
- Optionally share location, only if they want to use Local mode

Date of birth cannot be changed after registration.

Open question: the original beta form only asked for birth year to keep signup friction low. Asking for full date of birth at signup is a bigger ask of new users and may affect signup conversion. Worth weighing against the matching flexibility it enables.

---
## User Profile

Required Fields
- Display Name
- Date of Birth (used for matching; birth year may be the only part shown publicly, see open question below)
- Country

Optional Fields
- Profile Photo
- Bio
- Location (only required if using Local mode)

Users may edit profile information at any time except date of birth.

Open question: should full date of birth be visible to other users, or only birth year, with month and day used internally for matching but not displayed? Beta respondents were comfortable sharing birth year, but full DOB visibility wasn't tested.

---
## Cluster Joining

Users may join any combination of available matching modes, each forming a separate cluster:
- Exact Birthdate
- Birth Year + Month
- Birth Month
- Birth Year
- Local

Each mode a user opts into puts them in a separate queue for that mode. A user is not required to join all modes. They can start with just one and add others later from the Discovery page.

---
## Queue System

Clusters are formed through queues, one per matching mode per user.

Example:
Birth Year + Month: 1996-March Queue
6 / 8 Members

Clusters are created only when exactly 8 users are available in that specific mode's queue.

No communication is allowed while waiting in queue.

Because users can be in multiple queues at once, the Home and Queue screens need to show queue status per mode, not just a single queue state.

---
## Onboarding Flow

Step 1
User completes profile (display name, full date of birth, country; optional photo, bio, location).

Step 2
User selects one or more matching modes to join.

Step 3
For each selected mode, user joins that mode's queue.

Step 4
Each queue independently reaches 8 members.

Step 5
Cluster is created per mode, independently. A user may have one cluster created while still waiting in another mode's queue.

Step 6
Introduction phase begins for that cluster.

Step 7
Each member answers 5 introduction questions.

Step 8
Profiles unlock.

Step 9
Chat unlocks.

Steps 6 through 9 repeat independently per cluster, since a user may be in multiple clusters at different stages at once.

---
## Introduction Questions

Rules:
- Platform defined
- Same questions for all users
- Free text answers only
- All questions mandatory
- 72 hour completion deadline

Failure to complete within 72 hours results in removal and replacement.

Introduction answers remain permanently visible on user profiles, per cluster.

---
## Identity Model

Before introductions complete:

Visible:
- Display Name
- Country
- Birth Year (or relevant matching detail depending on mode; for example, Local cluster members might see general location instead)

Hidden:
- Profile Photo
- Bio

After introductions complete:

Visible:
- Display Name
- Country
- Birth Year
- Profile Photo
- Bio
- Introduction Answers

Real names are not required.

---
## Communication

### Cluster Chat

Supported:
- Text Messages
- Images
- GIFs
- Emoji Reactions

Not Supported:
- Direct Messages
- Voice Notes
- Video Calls

Open question: with a user potentially in multiple clusters, should there be a unified inbox view across clusters, or fully separate spaces?

---
## Message Features

Users can:
- Send messages
- Edit messages
- Delete messages
- React to messages
- See who has read their messages (read receipts)

Deleted messages are removed for all users.
Edited messages display an "edited" indicator.

### Read receipts

Receipts are sender-only and revealed on demand: the author opens the `⋯` menu
on one of their messages, taps **Info**, and sees a dialog listing who has seen
it ("Seen by") and who hasn't ("Not seen yet").

They are based on a **read watermark**, not per-message tracking: a member counts
as having seen a message once they have caught up past it in the room (the same
position that clears their unread chat badge). This means "seen" means "was
caught up to at least this point in the chat", not "opened this exact message".
A member who joined after the message was sent will read as having seen it. The
dialog updates live while open as members read.

---
## Status System

Users may set a current status.

Examples:
- ðŸ’» Working
- ðŸ“š Studying
- ðŸŽ® Gaming
- âœˆï¸ Traveling
- ðŸ˜´ Sleeping

Visible to cluster members.

---
## Availability System

Options:
- ðŸŸ¢ Available
- ðŸŸ¡ Busy
- ðŸ”´ Do Not Disturb

Visible to cluster members.

---
## Cluster Governance

Clusters are community governed.

---
## Replacement Votes

Any cluster member may initiate a replacement vote.

Reasons may include:
- Inactivity
- Toxic behavior
- Poor participation

Voting remains hidden until completed.
Results are revealed after voting closes.

Open question: beta research flagged safety and harassment as the top concern, and a vote only removal process, with no individual blocking, means a harassed user depends on the rest of the cluster to act. Worth deciding whether to add an individual block or mute option as a faster personal safeguard alongside the vote system.

---
## Replacement Process

If replacement vote succeeds:
1. Platform selects candidate pool.
2. Cluster reviews candidates.
3. Cluster votes.
4. Winning candidate receives invitation.
5. Candidate accepts or declines.

If accepted:
- Joins cluster
- Receives access to full cluster history

---
## Cluster Leaving

Users may leave at any time.

Upon leaving:
- Cluster vacancy is created
- Replacement process begins

User messages remain in cluster history.

---
## Cooldown Rules

Leaving a cluster triggers a 30 day cooldown before joining another cluster of the same mode.

Example:
Leaving a Birth Year + Month cluster triggers a 30 day cooldown for that specific mode only. It does not affect other modes the user is in.

Open question: beta research flagged fear of being "stuck" as a top concern. Worth weighing whether 30 days is the right length, or whether it should be shorter, especially since the multi mode model already gives users other active clusters to fall back on.

---
## Cluster Naming

Clusters may vote to change their name.

Example:
1996 Cluster becomes The Night Owls

Name changes require a cluster vote.

---
## Moderation

### Reporting

Users may report other members and can attach a specific message to a report.

Reasons:
- Harassment
- Hate Speech
- Spam
- Inappropriate Content
- Other

Only one open report may target the same member at a time. Reports are reviewed by platform moderators.

---
### Moderation Queue

Reports enter a shared queue reviewed by moderators and admins.

- An open (unclaimed) report can be claimed by any moderator or admin; claiming locks the case to that assignee.
- A claimed report can be released back to the queue.
- Report statuses: `pending` (open, unclaimed), `reviewing` (claimed), `actioned` (resolved with an enforcement action), and `dismissed` (reviewed and closed without action).

---
### Enforcement Actions

Reviewing a report, a moderator can:

- Dismiss it when no action is warranted.
- Hide or restore the reported message. Hiding is reversible; content is never permanently deleted by moderation in this release.
- Issue a warning to the member.
- Suspend the member's account temporarily, up to 7 days; the member is restricted until the suspension expires.
- Administrators can also permanently ban an account. A ban revokes all platform roles, removes the member from active clusters (starting the normal replacement process), and restricts the account permanently.

Moderators cannot take enforcement action against other moderators or admins, and an admin cannot ban or de-role the last remaining active admin.

---
### Account Restrictions

- Suspended and banned accounts can sign in only to a restricted-account screen, where they can see their status and any suspension expiry, sign out, delete their account, or contact support to appeal.
- A suspended account keeps its cluster memberships so the member returns automatically when the suspension expires.
- A permanent ban has no expiry.

---
### Notification to Affected Users

- Members receive an in-app moderation notice when their message is hidden or their account is warned or suspended.
- Banned accounts cannot use the app, so no in-app notice is sent; the restriction is shown on the restricted-account screen.
- Reporters receive an email confirmation when their report is submitted and a generic outcome when it is resolved (dismissed or actioned). The outcome email never contains internal notes, staff identity, or enforcement detail.
- Enforcement actions are also emailed to the affected member (warning, suspension, ban, lift, hidden message). No report-history screen is shipped yet; a future report-history view may show only the current status and a generic final outcome.

---
### Email Notifications

- All product email is outbound-only and sent from a single sender: `no-reply@thesensorium.online`. There is no inbox, no `mailto:` support in this release, and no Reply-To address.
- The catalog covers moderation and appeal lifecycles: report confirmation, report resolution, warning issued, message hidden, account suspended, account banned, restriction lifted, appeal received, appeal resolved.
- Emails are queued in the database and delivered by a scheduled Edge Function; the app never sends email from the browser.
- Restricted accounts can reach the appeal page from the emails they receive and from the restricted-account screen.

---
### Appeals

- A suspended or banned account may submit one in-app appeal (`/appeal`) explaining why a decision should be reconsidered. An active account cannot appeal; a lapsed suspension counts as active, so it cannot.
- Appeals are reviewed and decided by administrators only. Granting an appeal lifts the restriction and restores the account; rejecting keeps it.
- The appellant receives the admin's response by email; the origin of the restriction (moderator identity or internal notes) is never shared.

---
### Audit Log

Every claim, release, dismissal, enforcement action, and platform role change is recorded. The audit log is readable by administrators.

---
### Retention

Reports, internal notes, evidence metadata, and audit actions are retained for 24 months. When a user deletes their account, personal identifiers are detached from these moderation records rather than the audit trail being destroyed.

---
### NSFW Policy

NSFW content is prohibited.

Includes:
- Pornographic content
- Sexually explicit images
- Explicit sexual content

Violations may result in suspension or removal.

---
### Blocking

Blocking is not supported.

Users may:
- Report
- Leave cluster
- Start replacement vote

See the open question under Replacement Votes above; this is the same tension flagged there.

---
## Notifications

User configurable.

Examples:
- All Messages
- Mentions
- Reactions
- Votes
- Cluster Invitations
- New Signals

Open question: with multiple simultaneous clusters, notification settings may need to be configurable per cluster, not just globally.

---
## Discovery

Users browse available matching modes as tiles, one per mode. Selecting a mode opens its
page (`/discovery/{mode}`) with the queue/join flow for that mode and a directory of the mode's
active clusters.

Discovery tiles show:
- Matching Mode (Exact Birthdate, Birth Year + Month, Birth Month, Birth Year, Local)
- Number of active clusters currently in that mode

A mode page shows:
- Queue Count for the relevant pool. For Local, the radius they've selected. For birth based modes, their relevant date grouping.
- Active clusters in that mode: cluster name, status, member count, and formation date only.

Example:
Birth Year + Month: 1996-March
6 / 8 Waiting

Users cannot see queue members, and neither the tiles nor the directory expose cluster
introductions, messages, or membership — only name, status, member count, and formation date.

---
## Success Metrics

Primary
- Cluster Retention Rate (90 Days)

Secondary
- Messages per Cluster
- Daily Active Clusters
- Cluster Replacement Rate
- Introduction Completion Rate
- Average number of active clusters per user. Helps gauge whether multi mode matching adds engagement or spreads users too thin.
- Mode popularity breakdown. Which matching modes actually get used, to validate which to invest further design effort in.


## Screens and user flow

### 1. Application Sitemap

```text
Landing Page
â”œâ”€â”€ Login
â”œâ”€â”€ Sign Up
â”œâ”€â”€ Privacy Policy
â”œâ”€â”€ Terms

Authenticated Area
â”œâ”€â”€ Home (Cluster List, across all active clusters and modes)
â”‚
â”œâ”€â”€ Discovery
â”‚   â”œâ”€â”€ Exact Birthdate Clusters
â”‚   â”œâ”€â”€ Birth Year + Month Clusters
â”‚   â”œâ”€â”€ Birth Month Clusters
â”‚   â”œâ”€â”€ Birth Year Clusters
â”‚   â””â”€â”€ Local Clusters
â”‚
â”œâ”€â”€ Queue Waiting (per mode, can have multiple active)
â”‚
â”œâ”€â”€ Cluster
â”‚   â”œâ”€â”€ Chat
â”‚   â”œâ”€â”€ Members
â”‚   â”œâ”€â”€ Signals
â”‚   â”œâ”€â”€ Cluster Pulse
â”‚   â”œâ”€â”€ Votes
â”‚   â””â”€â”€ Settings
â”‚
â”œâ”€â”€ Profile
â”‚
â”œâ”€â”€ Notifications
â”‚
â””â”€â”€ Account Settings
```

---

### 2. Landing Page

Route:

```text
/
```

Purpose:

* Explain Sensorium
* Convert visitors into users

Sections:

#### Hero

```text
Sensorium

Eight strangers. One cluster.

Build meaningful friendships through small permanent groups.
```

Buttons:

```text
Join Sensorium
Sign In
```

---

#### How It Works

Card 1

```text
Choose How You Want to Match
```

Card 2

```text
Join a Cluster
```

Card 3

```text
Meet 7 Strangers
```

Card 4

```text
Complete Introductions
```

Card 5

```text
Build Real Connections
```

---

#### Cluster Types

```text
Exact Birthdate
```

```text
Birth Year + Month
```

```text
Birth Month
```

```text
Birth Year
```

```text
Local
```

---

#### FAQ

Questions:

```text
What is a Cluster?
Why exactly 8 people?
How does matching work, and can I choose how I'm matched?
Can I be in more than one cluster at once?
Can I leave a cluster?
```

---

### 3. Sign Up Page

Route

```text
/auth/signup
```

Fields

```text
Email
Password
Confirm Password
```

Buttons

```text
Create Account
Continue With Google
```

Success

```text
Verify your email address.
```

Redirect:

```text
/auth/verify-email
```

---

### 4. Login Page

Route

```text
/auth/login
```

Fields

```text
Email
Password
```

Actions

```text
Login
Forgot Password
Google Login
```

---

### 5. First-Time Onboarding

Route

```text
/onboarding
```

Only shown once.

---

#### Step 1

Profile Setup

Fields

```text
Display Name
Date of Birth
Country
```

Validation

```text
18+
Date of Birth immutable
```

---

#### Step 2

Profile Customization

Optional

```text
Photo
Bio
```

---

#### Step 3

Matching Mode Selection

Section:

```text
How would you like to be matched?
Select one or more.
```

Toggles (multi-select)

```text
Exact Birthdate
Birth Year + Month
Birth Month
Birth Year
Local
```

Validation:

```text
Must select at least one.
```

---

#### Step 4

Local Setup

Only if Local mode selected.

Fields

```text
Share Location
Select Radius (e.g. 10km / 50km / 100km)
```

---

#### Step 5

Review

Summary

```text
Display Name
Date of Birth
Country
Selected Matching Modes
```

Button

```text
Join Queue(s)
```

---

### 6. Home Page

Route

```text
/home
```

Purpose:
Overview across all active clusters and queues.

Layout

Top

```text
Sensorium
Notifications
Profile
```

Body

```text
Your Clusters
```

Cards

Example

```text
1996-March Cluster (Birth Year + Month)

8 Members
23 Unread Messages
```

Example

```text
Local Cluster, 25km (San Francisco)

6 Members
5 Unread Messages
```

Example

```text
Birth Year Cluster, 1996

Queued: 5/8
```

Bottom

```text
Explore More Matching Modes
```

---

### 7. Discovery Page

Route

```text
/discovery
```

Tabs

```text
Exact Birthdate
Birth Year + Month
Birth Month
Birth Year
Local
```

---

#### Exact Birthdate

Card

```text
March 14, 1996

Waiting: 3/8
```

---

#### Birth Year + Month

Card

```text
1996-March

Waiting: 6/8
```

---

#### Birth Year

Card

```text
1996

Waiting: 5/8
```

---

#### Local

Card

```text
Within 25km of San Francisco

Waiting: 6/8
```

Setup if not already configured:

```text
Set Your Radius
```

Actions

```text
Join
```

---

### 8. Queue Page

Route

```text
/queue/{queueId}
```

Purpose

Waiting room. A user may have multiple of these active simultaneously, one per mode joined.

Content

```text
Birth Year + Month Cluster (1996-March)

Waiting For Members

6 / 8
```

Progress bar

```text
â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘
```

Note

```text
Communication begins after the cluster is formed.
You can browse or join other matching modes while you wait.
```

Actions

```text
Leave Queue
```

Realtime updates

```text
6/8
7/8
8/8
```

---

### 9. Cluster Created Page

Route

```text
/cluster-created
```

Content

```text
Your Cluster Is Ready
```

Members list

```text
CodeNomad ðŸ‡®ðŸ‡³
TokyoReader ðŸ‡¯ðŸ‡µ
MountainFox ðŸ‡¨ðŸ‡¦
...
```

Button

```text
Start Introductions
```

---

### 10. Introduction Page

Route

```text
/cluster/{id}/introductions
```

Countdown

```text
72 Hours Remaining
```

Questions

Q1

```text
What do you do?
```

Q2

```text
What are your hobbies?
```

Q3

```text
What are you working toward right now?
```

Q4

```text
What is something people often misunderstand about you?
```

Q5

```text
What are you hoping to get from this cluster?
```

Button

```text
Submit Introductions
```

---

### 11. Waiting For Others Page

Route

```text
/cluster/{id}/waiting
```

Content

```text
5 / 8 Introductions Completed
```

Member list

```text
âœ“ CodeNomad
âœ“ TokyoReader
â³ MountainFox
```

---

### 12. Cluster Page

Route

```text
/cluster/{id}
```

Default Tab

```text
Chat
```

Tabs

```text
Chat
Members
Signals
Pulse
Votes
Settings
```

---

### 13. Chat Tab

Content

Messages

```text
User
Timestamp
Message
Reactions
```

Composer

```text
Message Box
Upload Image
GIF Picker
Send
```

Features

```text
Edit
Delete
React
```

---

### 14. Members Tab

Shows all 8 members.

Card

```text
Photo
Display Name
Country

Status
Availability
```

Actions

```text
View Profile
```

---

### 15. Member Profile Page

Route

```text
/profile/{userId}
```

Sections

Header

```text
Photo
Display Name
Country
Bio
```

Introduction Answers

```text
Q1 Answer
Q2 Answer
...
```

---

### 16. Signals Tab

Route

```text
Cluster > Signals
```

Content

```text
Signals
```

Active Signals list

```text
"Need advice on a job offer" - CodeNomad
Open

"Could use accountability this week" - TokyoReader
In Progress
```

Resolved Signals (collapsed by default)

```text
"Recommend a good therapist" - MountainFox
Resolved
```

New Signal

```text
Raise a Signal
What do you need help with?
```

Signal Detail Page

Route

```text
/cluster/{id}/signals/{signalId}
```

Content

```text
Signal Prompt
Raised By
Status: Open / In Progress / Resolved
```

Thread

```text
Replies from cluster members
```

Actions

```text
Reply
Mark Resolved (raiser only)
```

---

### 18. Votes Tab

Route

```text
Cluster > Votes
```

Sections

Active Votes

Past Votes

---

Vote Card

```text
Replace Member?

Ends In:
48 Hours
```

Buttons

```text
Yes
No
```

---

Candidate Vote

```text
Candidate A
Candidate B
Candidate C
```

Vote

```text
Select Candidate
```

---

### 19. Cluster Settings

Route

```text
Cluster > Settings
```

Actions

```text
View Cluster Details
Start Vote
Leave Cluster
```

Name Change

```text
Suggest Cluster Name
```

Triggers vote.

---

### 20. Notifications Page

Route

```text
/notifications
```

Items

```text
Vote Started
Reaction Received
Cluster Formed
Invitation Received
```

Actions

```text
Mark Read
Mark All Read
```

---

### 21. Account Settings

Route

```text
/settings
```

Sections

Profile

```text
Photo
Display Name
Bio
```

Matching Modes

```text
Manage Active Matching Modes
Add a New Mode
Leave a Mode
```

Status

```text
Current Status
```

Availability

```text
Available
Busy
Do Not Disturb
```

Notification Preferences

```text
Messages
Mentions
Votes
Invitations
```

Account

```text
Logout
Delete Account
```

---

## End-to-End User Flow

```text
Landing
down
Signup
down
Verify Email
down
Onboarding (profile + select one or more matching modes)
down
Join Queue(s), one per mode selected
down
[Per mode, independently:]
Wait For 8 Members
down
Cluster Created
down
Complete Introductions
down
Wait For Others
down
Cluster Unlocks
down
Chat
down
Build Relationships
down
Votes
down
Cluster Evolves
down
Years Of Shared History

[User may add or remove matching modes at any time from Discovery/Settings, repeating the per-mode flow above independently for each]
```

---

## Open Decisions for the Team

This section pulls together every open question flagged above, in one place, for the product and strategy channel to work through:

1. Total cap on simultaneous clusters per user. Capped or unlimited?
2. Should Interest based clusters remain as a mode, given research showed a preference against them?
3. Full date of birth at signup vs. birth year only. Is the added matching flexibility worth the extra friction?
4. Should full date of birth be visible to other members, or kept private and only used internally for matching?
5. Unified inbox across multiple clusters, or fully separate per cluster spaces?
6. Should individual blocking or muting exist alongside the vote to remove system, given safety was the top user concern?
7. Is the 30 day leave cooldown still the right length now that users likely have other active clusters to fall back on?
8. Should Signals support category tags, or stay freeform text only for v1?
9. Should new Signals trigger a distinct notification, separate from regular chat activity?
