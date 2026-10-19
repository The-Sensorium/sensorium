/** How many of the newest cards to mount in the Home preview: every leading
 * card that has finished loading, plus the one after it. Cards after that wait
 * so their images and member lookups do not start all at once. */
export function visiblePostCount(postIds: readonly string[], readyIds: ReadonlySet<string>): number {
  let readyPrefix = 0
  for (const id of postIds) {
    if (!readyIds.has(id)) break
    readyPrefix += 1
  }
  return Math.min(readyPrefix + 1, postIds.length)
}
