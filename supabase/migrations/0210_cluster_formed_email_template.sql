-- 0210_cluster_formed_email_template.sql
-- The trigger that uses the value follows in 0211. PostgreSQL forbids
-- referencing a freshly added enum value in the same transaction, so the
-- value lands on its own, matching the 0068 and 0119 precedent.

alter type public.outbound_email_template
  add value if not exists 'cluster-formed';
