-- Reactions are a cluster-scoped interaction: writes must require active
-- membership, matching the read policy from 0004. Previously insert/delete only
-- checked auth.uid() = user_id, so any authenticated user who knew a message
-- UUID could react to it — and the 0024 notify trigger would deliver reaction
-- notifications to authors of clusters they don't belong to.

drop policy "reactions manage own" on public.message_reactions;
drop policy "reactions delete own" on public.message_reactions;

create policy "reactions insert member"
  on public.message_reactions for insert
  with check (
    auth.uid() = user_id
    and public.is_active_member(
      (select cluster_id from public.messages where id = message_id)
    )
  );

create policy "reactions delete own member"
  on public.message_reactions for delete
  using (
    auth.uid() = user_id
    and public.is_active_member(
      (select cluster_id from public.messages where id = message_id)
    )
  );

-- Votes hide results until they close (intent documented in 0007, enforced in
-- the UI: open votes show only the caller's own choice). The old select policy
-- exposed every member's choice while a vote was open, leaking the live tally
-- and, for select_candidate votes, who voted for whom. Members may still read
-- their own response while open; all responses become readable once closed.

drop policy "vote responses members manage" on public.vote_responses;

create policy "vote responses read own or closed"
  on public.vote_responses for select
  using (
    public.is_active_member(
      (select cluster_id from public.votes where id = vote_id)
    )
    and (
      auth.uid() = user_id
      or (select status from public.votes where id = vote_id) = 'closed'
    )
  );
