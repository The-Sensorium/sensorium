/**
 * A cluster is a permanent group of exactly eight members.
 * Mirrors the capacity used in SQL (see `limit 8` in migrations/0011)
 * and the queue formation threshold; keep both sides in sync if it changes.
 */
export const CLUSTER_SIZE = 8
