-- 0158_call_token_rate_limit.sql
-- Relax the call-token mint rate limit from 10 to 30 per 10 minutes.
--
-- Legitimate rejoin bursts trip 10 during normal use: backing out of a call
-- and rejoining, or retrying on a flaky network, mints once per join, and a
-- locked-out user sees only a generic join failure. Tokens stay short-lived
-- (10 minute TTL) and membership-gated, so abuse exposure is unchanged in
-- kind. Replaces get_call_token_context from 0138 with the limit raised;
-- grants are preserved across create or replace and re-issued to be explicit.

create or replace function public.get_call_token_context(p_call_id uuid, p_user_id uuid)
returns table (
  call_found boolean,
  call_status text,
  call_expires_at timestamptz,
  cluster_id uuid,
  cluster_status text,
  is_active boolean,
  is_member boolean,
  is_participant boolean,
  display_name text
)
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then raise exception 'not_authenticated'; end if;

  perform public.check_rate_limit_for(p_user_id, 'call_token', 30, interval '10 minutes');

  return query
  select
    c.id is not null,
    c.status,
    c.expires_at,
    c.cluster_id,
    cl.status::text,
    public.is_account_active(p_user_id),
    exists (
      select 1 from public.cluster_members cm
      where cm.cluster_id = c.cluster_id
        and cm.user_id = p_user_id
        and cm.left_at is null
    ),
    exists (
      select 1 from public.call_participants cp
      where cp.call_id = p_call_id
        and cp.user_id = p_user_id
        and cp.left_at is null
    ),
    (select pr.display_name from public.profiles pr where pr.id = p_user_id)
  from (select 1) as one
  left join public.calls c on c.id = p_call_id
  left join public.clusters cl on cl.id = c.cluster_id;
end; $$;

revoke execute on function
  public.get_call_token_context(uuid, uuid)
  from public, anon, authenticated;

grant execute on function
  public.get_call_token_context(uuid, uuid)
  to service_role;
