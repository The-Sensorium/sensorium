-- 0088_staff_mark_read_role_guard.sql
-- Tightens mark_staff_notifications_read (creatable in 0087) so only a caller
-- who actually holds the matching staff capability can clear those rows. This is
-- defense-in-depth: the UPDATE already scopes to auth.uid(), and staff rows are
-- never fan-out'd to non-staff, so a member call is otherwise a harmless no-op.
-- Guarding here makes the role requirement explicit rather than incidental.
--
--   report_new  -> requires can_moderate (admin or moderator)
--   appeal_new  -> requires can_manage_roles (admin)
--
-- Raises `insufficient_permission`, matching the codebase-wide convention that
-- src/features/admin-moderation.ts # formatError maps to a friendly message.

create or replace function public.mark_staff_notifications_read(p_type public.notification_type)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'report_new' then
    if not public.can_moderate(auth.uid()) then
      raise exception 'insufficient_permission';
    end if;
  elsif p_type = 'appeal_new' then
    if not public.can_manage_roles(auth.uid()) then
      raise exception 'insufficient_permission';
    end if;
  else
    raise exception 'invalid_notification_type';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and type = p_type
    and read_at is null;
end; $$;
