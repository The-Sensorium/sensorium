-- 0149 - Service-role execute on the metrics rollup (manual backfill/refill).
-- 0148 revoked the rollup from public/anon/authenticated (admin reads go
-- through the §4 RPCs); ops still need a way to run or refill it by hand.
grant execute on function public.rollup_daily_metrics(date) to service_role;
