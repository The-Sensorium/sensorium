-- 0082_comment_likes.sql
-- Likes on comments and replies (Instagram/Reddit-style). Any comment (top-level
-- or reply) can be liked; each comment displays its like count, and a top-level
-- comment also shows its reply count. Mirrors the post-like model. Follows 0081.

create table public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

-- The owning cluster is reached via comment -> post -> cluster.
create policy "comment likes read"
  on public.comment_likes for select
  using (
    public.is_active_member((
      select p.cluster_id from public.post_comments pc
      join public.posts p on p.id = pc.post_id
      where pc.id = comment_id
    ))
  );

create policy "comment likes insert own"
  on public.comment_likes for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member((
      select p.cluster_id from public.post_comments pc
      join public.posts p on p.id = pc.post_id
      where pc.id = comment_id
    ))
  );

create policy "comment likes delete own"
  on public.comment_likes for delete
  using (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member((
      select p.cluster_id from public.post_comments pc
      join public.posts p on p.id = pc.post_id
      where pc.id = comment_id
    ))
  );

create or replace function public.toggle_comment_like(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select p.cluster_id into v_cluster
  from public.post_comments pc
  join public.posts p on p.id = pc.post_id
  where pc.id = p_comment_id and pc.deleted_at is null;
  if v_cluster is null then raise exception 'comment_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'comments_locked';
  end if;

  select user_id into v_member from public.comment_likes
  where comment_id = p_comment_id and user_id = v_actor;
  if v_member is null then
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v_actor);
  else
    delete from public.comment_likes where comment_id = p_comment_id and user_id = v_actor;
  end if;
end; $$;

grant select on public.comment_likes to authenticated;
grant execute on function public.toggle_comment_like(uuid) to authenticated;
grant execute on function public.toggle_comment_like(uuid) to service_role;

alter publication supabase_realtime add table public.comment_likes;
insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array['comment_likes']) as t(e);
