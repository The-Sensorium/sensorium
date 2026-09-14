# Archive

This folder holds the per-feature **implementation plans and deep-dives** that were
written while building out shipped features. They are kept for design history and
rationale, not as onboarding material.

**If you are new, you do not need to read these.** The current, canonical behavior
lives in the core docs and in the code:

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) - how the system fits together
- [`../PRD.md`](../PRD.md) - what the product does now
- [`../DESIGN.md`](../DESIGN.md) - the visual system and tokens
- [`../TECHNICAL.md`](../TECHNICAL.md) - the deep technical reference
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) - how to contribute

Reach for an archived doc when you want the *why* and the *trade-offs* behind a
specific feature, or the migration/RPC sequence it introduced. Prefer the code and
the core docs if an archived plan disagrees with reality.

## Contents

Status reflects the feature in the live app, not the doc's original framing.

| Document | Feature | Status |
|---|---|---|
| [`MOBILE_APP_PLAN.md`](MOBILE_APP_PLAN.md) | Member-only Expo/React Native companion app | Shipped |
| [`MOBILE_CALLS_PLAN.md`](MOBILE_CALLS_PLAN.md) | Cluster audio/video calls on mobile | Shipped |
| [`MOBILE_UX_IMPLEMENTATION_PLAN.md`](MOBILE_UX_IMPLEMENTATION_PLAN.md) | Mobile UX gaps (pull-to-refresh, virtualization, haptics, touch targets) | Shipped |
| [`CLUSTER_CALLS_PLAN.md`](CLUSTER_CALLS_PLAN.md) | Cluster audio/video calls (web + mobile, LiveKit) | Shipped |
| [`POSTS_FEATURE_PLAN.md`](POSTS_FEATURE_PLAN.md) | Cluster-scoped posts feed, comments/replies, likes, moderation | Shipped |
| [`STAFF_NOTIFICATIONS_PLAN.md`](STAFF_NOTIFICATIONS_PLAN.md) | Moderator/admin unread badges for reports and appeals | Shipped |
| [`EMAIL_NOTIFICATIONS_APPEALS_PLAN.md`](EMAIL_NOTIFICATIONS_APPEALS_PLAN.md) | Transactional email outbox + in-app appeals | Shipped |
| [`PUSH_NOTIFICATIONS_PLAN.md`](PUSH_NOTIFICATIONS_PLAN.md) | Expo OS-level push notifications + `push_outbox` | Shipped |
| [`MUTE_AND_MY_REPORTS_PLAN.md`](MUTE_AND_MY_REPORTS_PLAN.md) | Per-user mute and "My Reports" self-status view | Shipped |
| [`IMAGE_OPTIMIZATION_PLAN.md`](IMAGE_OPTIMIZATION_PLAN.md) | Avatar downscaling + lazy-loading coverage | Shipped |
| [`POLISH_PLAN.md`](POLISH_PLAN.md) | Optimistic reactions, password visibility, pinned presence | Shipped |

Older plans may contain stale "Status" lines written before the work landed; the
table above is the source of truth for what is live.

## Note on stale paths in migration comments

Migrations are immutable once applied, so comments inside them are never rewritten.
A few therefore point at paths that have since moved or were never standalone:

- Some early migrations reference `docs/ROLE_BASED_ACCESS_PLAN.md`, which was folded
  into the moderation/platform-roles section of [`../TECHNICAL.md`](../TECHNICAL.md)
  and never kept as a standalone file.
- Some migrations (e.g. `0100_push_outbox.sql`) reference plans at their old
  pre-archive paths such as `docs/PUSH_NOTIFICATIONS_PLAN.md`; the files now live
  in this folder.

Those comments are historical; treat the code and the core docs as current.
