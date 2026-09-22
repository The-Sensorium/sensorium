let suppressedClusterId: string | null = null

/** The room currently on screen, if any. Its pushes arrive banner-free. */
export function setSuppressedPushCluster(clusterId: string | null): void {
  suppressedClusterId = clusterId
}

export function getSuppressedPushCluster(): string | null {
  return suppressedClusterId
}

/** True when a push targets the open room (no banner or sound; it stays listed). */
export function shouldSuppressPushBanner(
  data: Record<string, unknown> | null | undefined,
  openClusterId: string | null,
): boolean {
  const clusterId = data?.clusterId
  return typeof clusterId === 'string' && clusterId !== '' && clusterId === openClusterId
}
