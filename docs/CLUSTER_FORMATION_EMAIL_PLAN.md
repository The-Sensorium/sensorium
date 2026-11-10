# Cluster Formation Email Plan

Status: **Implemented** in this branch, pending merge and deploy. When it
ships, move the file to `docs/archive/` and add a row to
`docs/archive/README.md`.

Goal: send one transactional email to each member when a cluster becomes usable,
reusing the existing outbox, cron, and Resend delivery pipeline. Push already
fires for the same event; sending both is intentional.

## 0. Decisions (locked)

1. **No opt-in or opt-out.** Cluster formation is rare and tied to an action the
   member already took (joined a queue, accepted an invitation). No new
   preference table or settings UI.
2. **Push plus email is fine.** Do not add deduplication, presence checks, or
   inactive-user gating.
3. **One email per member per cluster.** A queue-formed cluster sends 8. A
   created cluster sends 3, at the same moment its in-app `cluster_formed`
   notification fires.
4. **Outbound only.** Same sender (`no-reply@thesensoriumapp.com`), no reply
   wording, no mailto link, matching the moderation templates.
5. **Ride the existing event.** Hook the `cluster_formed` notification instead
   of editing the matching RPCs.

## 1. How it fits the existing stack

Already in place, reused without changes:

- `public.outbound_emails`, `public.enqueue_email(uuid, enum, jsonb)`, the
  `claim_outbound_emails` / `mark_outbound_email` lifecycle, and
  `public.app_url()`: `supabase/migrations/0068_email_outbox.sql`
- The per-minute pump and stuck-row recovery: `0071_email_pump_cron.sql`,
  `0101_email_outbox_retry.sql`
- Resend delivery and template dispatch: `supabase/functions/send-emails/index.ts`,
  `supabase/functions/_shared/templates.ts`
- Existing notification trigger pattern: `fan_out_push_notification()` in
  `0100_push_outbox.sql`, last redefined in `0205_cluster_push_mute.sql`
- `cluster_formed` notifications are written by:
  - `maybe_form_cluster()` for queue matching, live body in
    `0191_open_mix_age_prefs.sql` (local/open mix) and `0190_local_age_prefs.sql`
  - `accept_invitation()` when a created cluster reaches three confirmed
    members: `0168_created_clusters.sql:494`
- `email_settings.enabled` keeps the local stack inert. Staging and production
  are enabled by the migration workflows.

No new edge function, secret, bucket, or frontend code is required.

## 2. Trigger approach

Add an `AFTER INSERT` trigger on `public.notifications`:

```
notifications insert (type = 'cluster_formed')
  -> enqueue_cluster_formed_email()
       -> public.enqueue_email(user_id, 'cluster-formed', params)
            -> outbound_emails (queued)
                 -> email-pump cron -> send-emails -> Resend
```

Why a trigger instead of calling `enqueue_email` inside `maybe_form_cluster` and
`accept_invitation`:

- No need to copy the large live function bodies into a new migration.
- Covers both formation paths, plus any future path that writes the same
  notification.
- Email and in-app notification cannot drift, because they share the row that
  was already written.
- Matches the existing push fan-out pattern, including the `cluster_id is null`
  guard needed by manual notifications in tests.

Recipient rules follow the notification row. If the cluster formed, the
notification was fanned out to active members only, so the email follows the
same set. Invitees who have not accepted a created cluster get no email.

## 3. Migrations

Latest applied migration is `0209_declined_invite_is_final.sql`. Add two files.

### 3.1 `0210_cluster_formed_email_template.sql`

Postgres cannot reference a value added to an enum in the same transaction, so
the enum value lands on its own, matching the precedent in `0068` and `0119`.

```sql
-- 0210_cluster_formed_email_template.sql
-- The trigger that uses the value follows in 0211; PostgreSQL forbids
-- referencing a freshly added enum value in the same transaction.

alter type public.outbound_email_template
  add value if not exists 'cluster-formed';
```

### 3.2 `0211_cluster_formed_email.sql`

```sql
-- 0211_cluster_formed_email.sql
-- One email per member when a cluster becomes usable. The row already exists
-- for the inbox and push, so this hook cannot drift from them.

create function public.enqueue_cluster_formed_email()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cluster_name text;
  v_display_name text;
begin
  if NEW.type <> 'cluster_formed' or NEW.cluster_id is null then
    return NEW;
  end if;

  if not public.is_account_active_internal(NEW.user_id) then
    return NEW;
  end if;

  select c.name into v_cluster_name
  from public.clusters c
  where c.id = NEW.cluster_id;
  if v_cluster_name is null then
    return NEW;
  end if;

  select p.display_name into v_display_name
  from public.profiles p
  where p.id = NEW.user_id;

  perform public.enqueue_email(
    NEW.user_id,
    'cluster-formed',
    jsonb_build_object(
      'cluster_id', NEW.cluster_id,
      'display_name', v_display_name,
      'cluster_name', v_cluster_name,
      'cluster_url', public.app_url() || '/cluster/' || NEW.cluster_id::text
    )
  );

  return NEW;
end; $$;

drop trigger if exists notifications_cluster_formed_email on public.notifications;
create trigger notifications_cluster_formed_email
  after insert on public.notifications
  for each row execute function public.enqueue_cluster_formed_email();

revoke execute on function public.enqueue_cluster_formed_email()
  from public, anon, authenticated;
```

Notes:

- Trigger functions fire regardless of the EXECUTE grant; revoking keeps the
  function out of PostgREST's callable surface.
- `is_account_active_internal` mirrors the push fan-out guard, since there is no
  request JWT in the trigger.
- `app_url()` is `security definer` and already granted to `service_role`; no
  direct read of `email_settings` is needed.
- No grant is added on `outbound_emails` or `enqueue_email`. The new function
  runs as its owner like the other enforcement RPCs.

## 4. Email template

Update `supabase/functions/_shared/templates.ts`:

1. Add `'cluster-formed'` to `TemplateId`.
2. Add `cluster_name?: string` and `cluster_url?: string` to `TemplateParams`.
3. Add a case using the shared `shell`, `heading`, `body`, and `cta` helpers:

```ts
case 'cluster-formed':
  return {
    subject: 'Your cluster is ready',
    html: shell(
      heading('Your cluster is ready') +
        body(
          `${greeting(params.display_name)} ${esc(
            params.cluster_name ?? 'Your cluster',
          )} is open. Say hello, and answer the intro questions when you are ready.`,
        ) +
        (params.cluster_url ? cta(params.cluster_url, 'Open your cluster') : ''),
    ),
  }
```

Copy stays consistent with the two existing in-app variants:

- Queue formation: "Your cluster is ready" / "Say hello, and answer the intro
  questions when you are ready."
- Created cluster activation: "Your cluster is active" / "Three members have
  joined. The cluster is now open."

One generic email covers both. The CTA is the only link and points at
`{app_url}/cluster/{id}`.

## 5. Types and mobile sync

The enum change is schema-visible:

1. Regenerate `src/lib/database.types.ts` from the local schema with the Supabase
   CLI (`npx supabase gen types typescript --local > src/lib/database.types.ts`).
2. Run `node mobile/scripts/sync-db-types.mjs` to copy the generated types and
   shared modules into `mobile/`.
3. Verify with `node mobile/scripts/sync-db-types.mjs --check`.

No web or mobile source code changes are planned. `mobile/CHANGELOG.md` still
needs an `Unreleased` entry because user-facing behavior changes.

## 6. Tests

### Integration

Add assertions to the existing suites. The shared `cleanup()` helper already
deletes every `outbound_emails` row, and `createCluster()` inserts clusters
directly, so existing tests that construct fixtures will not gain rows.

- `tests/integration/matching.test.ts` (the 8-member formation test around line
  239): after `maybe_form_cluster` fires, assert
  - 8 `outbound_emails` rows with `template = 'cluster-formed'`
  - one per member, each `recipient_email` matching that member
  - `params.cluster_url` ends with `/cluster/{clusterId}`
  - `status = 'queued'`
- `tests/integration/created-clusters.test.ts` (the third-member activation test
  around line 176): assert exactly 3 rows after the third accept, and none after
  cluster creation or the first two accepts.
- Existing `claims` tests in `tests/integration/emails.test.ts` remain valid
  because they build clusters through `createCluster()` without writing a
  `cluster_formed` notification.

### Not covered locally

No real Resend call runs in tests. Template rendering is exercised only through
the edge function, so validate the rendered HTML on staging with a real
formation. There is no Vitest or Deno test harness for
`supabase/functions/_shared/templates.ts`; do not add one just for this change.

## 7. Docs

- `docs/TECHNICAL.md` email section: state that the outbox also carries cluster
  formation notices, not only moderation lifecycles.
- `docs/PRD.md` notifications section: add a bullet that cluster formation sends
  an email in addition to the inbox row and push, with no opt-out.
- `mobile/CHANGELOG.md`: `Unreleased` entry, for example "Cluster formation now
  sends an email alongside the push notification."
- On ship: move this file to `docs/archive/` and add it to
  `docs/archive/README.md` with status Shipped.

## 8. Verification

Pre-push gates, per `AGENTS.md` (migrations changed):

1. `supabase db reset` then `npm run seed:demo`
2. `npm run test:integration`
3. `npm run lint`
4. `npm run test:coverage`
5. `npm run build`
6. `node mobile/scripts/sync-db-types.mjs --check`

Manual check on the local stack:

1. Form a cluster or insert a `cluster_formed` notification for a member with a
   profile email.
2. Confirm one `outbound_emails` row per member with `template =
   'cluster-formed'` and a cluster URL built from `app_url()`.
3. On staging, trigger a real formation and confirm the Resend delivery, sender,
   subject, and working CTA.

## 9. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Duplicate channel noise (push and email at once) | Accepted product decision; formations are rare |
| No opt-out | Accepted; event is transactional and tied to the member's own action |
| Email pump shares capacity with moderation and appeals | Rare volume; `claim_outbound_emails` caps at 20 per minute and retries failures |
| Migrations apply before `send-emails` deploys | Unknown template renders fail briefly, then retry up to 5 attempts; no loss |
| Enum value used in the same transaction | Split into `0210` (value) and `0211` (trigger) |
| Future formation path forgets to email | Trigger covers any code that writes a `cluster_formed` notification |

## 10. Out of scope

- Email preferences or unsubscribe flow
- Inactivity gating, digests, or "email only if push failed"
- Emails for other notification types (messages, votes, meetups, signals)
- Open and click tracking
- Any web or mobile UI change
