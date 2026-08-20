-- 0068_email_outbox.sql
-- Outbound transactional email for the moderation lifecycle. Adds a durable
-- outbox table written inside the same transaction as the enforcement RPCs
-- (an action and its notification cannot drift), plus the queue lifecycle:
-- enqueue (security definer, called by other security definer functions),
-- claim (service-role only, for the Edge Function), mark (service-role only),
-- and a stuck-`sending` recovery sweep for the cron.
--
-- The actual HTTP delivery happens outside Postgres (cron -> Edge Function ->
-- Resend); this migration only owns the reliable queue. pg_net is enabled for
-- the cron pump in 0071.

create extension if not exists pg_net;

-- -- 1) Enum + table ----------------------------------------------------------

create type public.outbound_email_template as enum (
  'message-hidden',
  'warning-issued',
  'account-suspended',
  'account-banned',
  'restriction-lifted',
  'report-received',
  'report-resolved',
  'appeal-received',
  'appeal-resolved'
);

create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  template public.outbound_email_template not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'abandoned')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index outbound_emails_queue_idx
  on public.outbound_emails (status, created_at)
  where status in ('queued', 'sending');

create index outbound_emails_user_idx
  on public.outbound_emails (user_id, created_at desc);

alter table public.outbound_emails enable row level security;

-- -- 2) Enqueue ---------------------------------------------------------------
-- Internal helper: resolves the recipient address from profiles at enqueue
-- time and persists a snapshot, so a later profile/email change (or deletion)
-- never rewrites the historical record. Skipped cleanly when the profile or
-- its email is gone (anonymized / deleted account). Granted to nobody; only
-- other security definer functions reach it.

create function public.enqueue_email(
  p_user_id uuid,
  p_template public.outbound_email_template,
  p_params jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email public.profiles.email%type;
begin
  if p_user_id is null then
    return;
  end if;

  select email into v_email
  from public.profiles
  where id = p_user_id;
  if v_email is null then
    return;
  end if;

  insert into public.outbound_emails (user_id, recipient_email, template, params)
  values (p_user_id, v_email, p_template, coalesce(p_params, '{}'::jsonb));
end; $$;

-- -- 3) Claim + mark (Edge Function lifecycle) --------------------------------
-- The Edge Function pulls the next batch under the service-role key. Claiming
-- flips `queued -> sending` atomically in one statement so a crash mid-send
-- can never double-claim; the recovery sweep re-queues anything stuck.

create function public.claim_outbound_emails(p_limit integer default 20)
returns table (
  id uuid,
  recipient_email text,
  template public.outbound_email_template,
  params jsonb
)
language sql security definer set search_path = public as $$
  with batch as (
    select oe.id
    from public.outbound_emails oe
    where oe.status = 'queued'
    order by oe.created_at asc, oe.id asc
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.outbound_emails oe
  set status = 'sending', updated_at = now()
  from batch b
  where oe.id = b.id
  returning oe.id, oe.recipient_email, oe.template, oe.params;
$$;

create function public.mark_outbound_email(
  p_id uuid,
  p_status text,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_email_status';
  end if;

  update public.outbound_emails
  set status = case
        when p_status = 'failed' and attempts + 1 >= 5 then 'abandoned'
        else p_status
      end,
      attempts = attempts + 1,
      last_error = coalesce(p_error, last_error),
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      updated_at = now()
  where id = p_id;
end; $$;

-- -- 4) Recovery sweep --------------------------------------------------------
-- Rows stuck in `sending` longer than two minutes (Edge Function crash,
-- network blip) are re-queued so the next cron tick retries them.

create function public.recover_stuck_sending()
returns void
language sql security definer set search_path = public as $$
  update public.outbound_emails
  set status = 'queued', updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '2 minutes';
$$;

-- -- 5) App URL helper -------------------------------------------------------
-- Environment-aware base URL for email CTAs (appeal page etc.). Reads the
-- per-environment `app_url` from email_settings (one row), which CI seeds for
-- staging/prod; local defaults to the Vite dev origin. No secret or URL lives
-- in the frontend bundle.

create table public.email_settings (
  id boolean primary key default true check (id),
  edge_url text,
  secret text,
  app_url text not null default 'http://127.0.0.1:5173',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (id, edge_url, secret, app_url, enabled)
values (true, null, null, 'http://127.0.0.1:5173', false);

alter table public.email_settings enable row level security;

create function public.app_url()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(app_url, 'http://127.0.0.1:5173')
  from public.email_settings
  where id = true;
$$;

grant execute on function public.app_url() to authenticated, service_role;

-- -- 6) Grants ----------------------------------------------------------------
-- enqueue_email is internal: granted to nobody, reached only through the
-- security-defining enforcement RPCs it is called from (they run as the
-- postgres owner). The queue reads/writes are service-role only -- the Edge
-- Function authenticates with the service-role key; the authenticated member
-- role never touches the outbox. recover_stuck_sending runs from the pg_cron
-- postgres role.

revoke all on table public.outbound_emails from anon, authenticated;
grant select, insert, update, delete on public.outbound_emails to service_role;

revoke all on table public.email_settings from anon, authenticated;
grant select on public.email_settings to service_role;

revoke execute on function
  public.enqueue_email(uuid, public.outbound_email_template, jsonb),
  public.claim_outbound_emails(integer),
  public.mark_outbound_email(uuid, text, text),
  public.recover_stuck_sending()
  from public, anon, authenticated;

grant execute on function
  public.claim_outbound_emails(integer),
  public.mark_outbound_email(uuid, text, text),
  public.recover_stuck_sending()
  to service_role;

-- -- 7) Audit enum value ------------------------------------------------------
-- `appeal_decided` is used by 0069's decide_appeal. The value lands here so it
-- is available before that migration runs; PostgreSQL forbids referencing a
-- freshly added enum value in the same transaction.

alter type public.moderation_action_type add value 'appeal_decided';