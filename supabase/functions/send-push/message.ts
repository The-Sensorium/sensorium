// Pure push-to-Expo payload mapping for the send-push worker.
//
// Kept free of Deno imports so the mapping is unit-testable under both the
// edge runtime and vitest. The worker (index.ts) handles claiming, auth,
// retries, and receipts; everything about what lands on the device lives
// here.

export interface PushRow {
  expo_push_token: string
  title: string
  body: string | null
  data: Record<string, unknown>
  channel: string
}

// One updating shade row per cluster for plain chat. Android `tag` replaces
// an already-displayed notification with the same tag; `collapseId`
// coalesces in-transit redeliveries while offline. `threadId` groups the
// same burst on iOS and is ignored on Android. Other push types keep one
// row per event, so they return null (no grouping fields attached).
export function chatBurstTag(data: Record<string, unknown>): string | null {
  if (data['kind'] !== 'message') return null
  const clusterId = data['clusterId']
  if (typeof clusterId !== 'string' || clusterId === '') return null
  return `cluster-${clusterId}`
}

export function buildExpoMessage(push: PushRow): Record<string, unknown> {  const tag = chatBurstTag(push.data)
  // Quiet chat follow-ups update the shade row silently on both platforms:
  // no sound on iOS (channelId is Android only, so the quiet channel alone
  // would still buzz iPhones), LOW channel on Android.
  const quiet = push.channel === 'messages-quiet'
  return {
    to: push.expo_push_token,
    title: push.title,
    body: push.body ?? undefined,
    data: push.data,
    channelId: push.channel,
    ...(quiet ? {} : { sound: 'default' }),
    ...(tag ? { collapseId: tag, tag, threadId: tag } : {}),
  }
}

// Collapse a claimed batch so only the newest message push per device and
// cluster goes to Expo. Same tag means the newest content replaces anything
// older on the shade, so sending superseded rows only wastes pushes and
// risks a stale row arriving last and winning the display. Grouping is per
// device (token): each phone still gets its own push. Non-chat pushes and
// rows without a cluster always send.
export function collapseSuperseded<T extends PushRow & { id: string }>(
  rows: T[],
): { send: T[]; skip: T[] } {
  const latestByDevice = new Map<string, number>()
  rows.forEach((row, index) => {
    if (chatBurstTag(row.data) === null) return
    latestByDevice.set(row.expo_push_token + '::' + String(row.data['clusterId']), index)
  })
  const send: T[] = []
  const skip: T[] = []
  rows.forEach((row, index) => {
    const tag = chatBurstTag(row.data)
    if (tag !== null && latestByDevice.get(row.expo_push_token + '::' + String(row.data['clusterId'])) !== index) {
      skip.push(row)
    } else {
      send.push(row)
    }
  })
  return { send, skip }
}
