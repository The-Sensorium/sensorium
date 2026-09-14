-- 0127_staff_table_grants.sql
-- The Phase 2/5 staff tables were created without revoking the default
-- PUBLIC grants, so anon/authenticated held table privileges (RLS with no
-- policies still denied rows, but least-privilege demands no grants either).
-- Mirrors the 0052 pattern: staff-only tables are reachable through
-- security-definer RPCs, service_role keeps its grants.

revoke all on table
  public.moderation_case_notes,
  public.moderation_policy_categories,
  public.moderation_action_templates
  from anon, authenticated;

grant select, insert, update on public.moderation_case_notes to service_role;
grant select, insert, update on public.moderation_policy_categories to service_role;
grant select, insert, update on public.moderation_action_templates to service_role;
