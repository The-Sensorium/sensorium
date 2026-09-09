-- 0101_email_outbox_retry.sql
-- Fix a latent flaw shared with the push outbox: claim_outbound_emails only
-- picked up 'queued' rows, so a delivery that failed (transient Resend outage,
-- worker crash mid-send) was never re-queued. mark_outbound_email and the pump
-- both assume retries (dead-letter after 5 attempts, pump waits on
-- 'failed' AND attempts < 5), but the claim never re-offered those rows, so
-- they sat at attempts=1 forever and the pump POSTed every minute doing
-- nothing. Now failed rows below the attempt limit are re-claimable.

create or replace function public.claim_outbound_emails(p_limit integer default 20)
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
       or (oe.status = 'failed' and oe.attempts < 5)
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
