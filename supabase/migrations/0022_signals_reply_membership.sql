-- 0022 - Signals hardening: reply_signal membership check + reply RLS membership
-- Milestone 9 (Signals). Follows 0021. Idempotent via db reset.

-- reply_signal previously let any authenticated user reply to any signal.
-- Restrict to active members of the signal's cluster (consistent with raise_signal).
create or replace function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cluster uuid;
begin
  select cluster_id into v_cluster from public.signals where id = p_signal_id;
  if v_cluster is null then raise exception 'signal_not_found'; end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = v_cluster and user_id = auth.uid() and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.signal_replies (signal_id, author_id, content)
  values (p_signal_id, auth.uid(), p_content);
end; $$;

-- Direct-table insert path: require author match AND cluster membership.
drop policy if exists "signal replies insert own cluster" on public.signal_replies;
create policy "signal replies insert own cluster"
  on public.signal_replies for insert
  with check (
    auth.uid() = author_id
    and public.is_active_member(
      (select cluster_id from public.signals where id = signal_id)
    )
  );
