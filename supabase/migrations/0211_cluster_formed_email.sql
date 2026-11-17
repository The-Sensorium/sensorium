-- 0211_cluster_formed_email.sql
-- One email per member when a cluster becomes usable. The inbox row and push
-- already fire for the same event, so this hook rides that row and cannot
-- drift from the notification paths (queue matching and created-cluster
-- activation alike).
--
-- No opt-in or opt-out: cluster formation is rare and tied to an action the
-- member already took. Push plus email is intentional.

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
