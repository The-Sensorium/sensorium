import { useEffect } from 'react'
import { View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useAuth } from '../../src/auth-context'
import { goHome, goLogin } from '../../src/lib/auth-navigation'
import { useNotificationsChannel, useUnreadCount } from '../../src/features/notifications'
import { useActiveAccountGate } from '../../src/lib/use-active-account'
import { joinCallFromPush } from '../../src/features/cluster-calls'
import { onPushResponse, getLaunchPushData, syncBadgeCount, clearClusterPushNotifications } from '../../src/lib/push'
import { pushClusterId } from '../../src/lib/push-suppress'
import { isTabTarget, pushDataToHref, type PushData } from '../../src/lib/notification-routing'
import { IncomingCallOverlay } from '../../src/components/IncomingCallOverlay'

// Deep links and push cold starts seed the tabs under the pushed detail, so
// back and swipe-back land on Home instead of a single-entry stack.
export const unstable_settings = { anchor: '(tabs)' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizePushData(data: PushData): PushData {
  const out: PushData = {}
  if (typeof data.kind === 'string' && data.kind.length <= 64) out.kind = data.kind
  if (typeof data.clusterId === 'string' && UUID_RE.test(data.clusterId)) out.clusterId = data.clusterId
  if (typeof data.postId === 'string' && UUID_RE.test(data.postId)) out.postId = data.postId
  if (typeof data.commentId === 'string' && UUID_RE.test(data.commentId)) out.commentId = data.commentId
  if (typeof data.messageId === 'string' && UUID_RE.test(data.messageId)) out.messageId = data.messageId
  if (typeof data.signalId === 'string' && UUID_RE.test(data.signalId)) out.signalId = data.signalId
  if (typeof data.newMemberId === 'string' && UUID_RE.test(data.newMemberId)) out.newMemberId = data.newMemberId
  if (typeof data.meetupId === 'string' && UUID_RE.test(data.meetupId)) out.meetupId = data.meetupId
  if (typeof data.callId === 'string' && UUID_RE.test(data.callId)) out.callId = data.callId
  if (typeof data.v === 'number') out.v = data.v
  return out
}

async function handlePushTap(data: PushData, signedIn: boolean) {
  if (!signedIn) {
    goHome()
    return
  }
  const clean = sanitizePushData(data)
  const clusterId = pushClusterId(clean)
  if (clusterId) void clearClusterPushNotifications(clusterId)
  // A join push must seat the user before the call screen mints its token.
  // A missed one (the call ended while the push sat in the shade) lands on the
  // room instead of an error screen.
  if (clean.kind === 'incoming_call' && clean.callId) {
    const joined = await joinCallFromPush(clean.callId)
    if (!joined) {
      if (clean.clusterId) {
        router.push({ pathname: '/cluster/[clusterId]/room', params: { clusterId: clean.clusterId } })
      } else {
        goHome()
      }
      return
    }
  }
  const target = pushDataToHref(clean)
  if (!target) {
    goHome()
    return
  }
  try {
    if (isTabTarget(target)) router.navigate(target)
    else router.push(target)
  } catch {
    goHome()
  }
}

export default function AppStack() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  useEffect(() => {
    if (auth.state === 'signedOut') goLogin()
  }, [auth.state])
  useActiveAccountGate('member')
  useNotificationsChannel(userId)
  const unread = useUnreadCount()
  useEffect(() => {
    void syncBadgeCount(unread.data ?? 0)
  }, [unread.data])
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void onPushResponse((data) => {
      void handlePushTap(data as PushData, auth.state === 'signedIn')
    }).then((fn) => {
      if (disposed) fn()
      else unsubscribe = fn
    })
    // A tap that cold-starts a terminated app is not delivered through the
    // listener above; it must be read once at startup. Wait for auth to leave
    // loading so a signed-out tap falls back to home instead of a locked room.
    void getLaunchPushData().then((data) => {
      if (!disposed && data) void handlePushTap(data as PushData, auth.state === 'signedIn')
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [auth.state])
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <IncomingCallOverlay />
    </View>
  )
}
