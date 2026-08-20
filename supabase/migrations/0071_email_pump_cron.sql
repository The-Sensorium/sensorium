-- 0071_email_pump_cron.sql
-- The scheduler that moves the outbox: pg_cron ticks every minute and asks the
-- Edge Function (via pg_net) to drain `queued`/retryable rows. Keeping the
-- trigger in Postgres (not a dashboard webhook) means the schedule is versioned
-- with the schema and the routing is swappable per environment.
--
-- The edge endpoint + shared secret live in `email_settings` (one row, created
-- in 0068), seeded disabled there so a fresh stack is inert until a deploy
-- wires the real value. Staging/prod override the row through the CI migration
-- workflow.

-- -- 1) Pump ------------------------------------------------------------------

create function public.pump_outbound_emails()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_edge_url text;
  v_secret text;
  v_enabled boolean;
  v_pending boolean;
begin
  select edge_url, secret, enabled
    into v_edge_url, v_secret, v_enabled
  from public.email_settings
  where id = true;

  if not coalesce(v_enabled, false) or v_edge_url is null then
    return;
  end if;

  select exists (
    select 1 from public.outbound_emails
    where status = 'queued'
       or (status = 'failed' and attempts < 5)
  ) into v_pending;

  if not v_pending then
    return;
  end if;

  perform net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    ),
    body := '{}'::jsonb
  );
end; $$;

-- -- 3) Cron ------------------------------------------------------------------
-- Idempotent (0039 pattern): unschedule by name, then re-declare so each named
-- job exists exactly once across staging/prod re-applies.

select cron.unschedule('email-pump')
where exists (select 1 from cron.job where jobname = 'email-pump');
select cron.schedule('email-pump', '* * * * *', $$select public.pump_outbound_emails()$$);

select cron.unschedule('email-recover')
where exists (select 1 from cron.job where jobname = 'email-recover');
select cron.schedule('email-recover', '*/5 * * * *', $$select public.recover_stuck_sending()$$);

-- -- 4) Grants ----------------------------------------------------------------

revoke execute on function public.pump_outbound_emails() from public, anon, authenticated;