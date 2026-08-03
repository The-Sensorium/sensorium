-- 0023 - Governance: realtime votes + replacement_rounds, vote_on hardening, RPCs
-- Milestone 10 (Governance). Follows 0022. Idempotent via db reset.

-- Votes and replacement rounds are new in the realtime publication so the Votes tab
-- stays live: vote INSERT (vote starts), vote UPDATE (cron closes it → result),
-- round INSERT/UPDATE (replacement status advances).
alter publication supabase_realtime add table
  public.votes,
  public.replacement_rounds;

insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array['votes', 'replacement_rounds']) as t(e);

-- Validate the choice a member casts:
--  - replace_member / change_name → 'yes' | 'no' only
--  - select_candidate → must be a user id in the active round's candidate pool
-- Prevents junk choices (e.g. a bogus candidate id) from ever being tallied.
create or replace function public.vote_on(p_vote_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare v_type vote_type;
begin
  select v.type into v_type
  from public.votes v
  join public.cluster_members cm on cm.cluster_id = v.cluster_id
  where v.id = p_vote_id and cm.user_id = auth.uid() and cm.left_at is null and v.status = 'open';

  if v_type is null then raise exception 'vote_not_available'; end if;

  if v_type in ('replace_member', 'change_name') then
    if p_choice not in ('yes', 'no') then raise exception 'invalid_choice'; end if;
  elsif v_type = 'select_candidate' then
    if not exists (
      select 1
      from public.replacement_rounds r
      cross join lateral unnest(coalesce(r.candidate_pool, '{}')) as c(user_id)
      where r.select_candidate_vote_id = p_vote_id
        and c.user_id::text = p_choice
    ) then raise exception 'invalid_choice'; end if;
  end if;

  insert into public.vote_responses (vote_id, user_id, choice)
  values (p_vote_id, auth.uid(), p_choice)
  on conflict (vote_id, user_id) do update set choice = excluded.choice, created_at = now();
end; $$;

-- Active replacement round for a cluster (RLS: caller must be an active member).
create function public.get_replacement_round(p_cluster_id uuid)
returns table (
  id uuid,
  cluster_id uuid,
  mode public.matching_mode,
  status public.replacement_status,
  candidate_pool uuid[],
  select_candidate_vote_id uuid,
  invited_user_id uuid,
  declined_user_ids uuid[],
  attempts int,
  closed_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.cluster_id, r.mode, r.status, r.candidate_pool,
         r.select_candidate_vote_id, r.invited_user_id, r.declined_user_ids,
         r.attempts, r.closed_reason, r.created_at, r.updated_at
  from public.replacement_rounds r
  where r.cluster_id = p_cluster_id
    and r.status in ('selecting_candidates', 'voting', 'inviting')
    and public.is_active_member(p_cluster_id)
  order by r.created_at desc
  limit 1;
$$;

-- Profile cards for a round's candidate pool (security definer; pool order kept).
-- Avatars stay hidden until the cluster is unlocked, matching member profiles.
create function public.get_candidate_profiles(p_round_id uuid)
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name,
         case when public.cluster_unlocked(r.cluster_id) then p.avatar_url else null end
  from public.replacement_rounds r
  cross join unnest(coalesce(r.candidate_pool, '{}')) with ordinality as c(user_id, ord)
  join public.profiles p on p.id = c.user_id
  where r.id = p_round_id
    and public.is_active_member(r.cluster_id)
  order by c.ord
  limit 3;
$$;

-- The caller's pending invitations, with cluster context (RLS: own rows only).
create function public.get_pending_invitations()
returns table (id uuid, cluster_id uuid, cluster_name text, mode_label text,
               created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.cluster_id, c.name, c.mode_label, i.created_at, i.expires_at
  from public.invitations i
  join public.clusters c on c.id = i.cluster_id
  where i.user_id = auth.uid() and i.status = 'pending'
  order by i.created_at asc;
$$;
