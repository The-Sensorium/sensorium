import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Bell, BellOff } from 'lucide-react-native'
import { useNotificationPrefs, useUpsertNotificationPrefs } from '../features/notifications'
import { isClusterPushMuted, mutedUntilForDuration, type MuteDurationKey } from '../lib/cluster-mute'
import { toErrorMessage } from '../lib/error'
import { useTheme } from '../lib/use-theme'
import { MuteDurationSheet } from './MuteDurationSheet'

/**
 * Per-cluster push-mute bell for cluster cards. Tapping opens the duration
 * sheet; muting only stops pushes, unread counts and Settings are untouched.
 * Sibling of the card links on purpose: it must never trigger navigation.
 */
export function ClusterMuteButton({
  clusterId,
  clusterName,
}: {
  clusterId: string
  clusterName: string
}) {
  const t = useTheme()
  const prefs = useNotificationPrefs()
  const upsert = useUpsertNotificationPrefs()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<MuteDurationKey | 'unmute' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutedUntil = useMemo(
    () => (prefs.data ?? []).find((p) => p.cluster_id === clusterId)?.push_muted_until ?? null,
    [prefs.data, clusterId],
  )
  const muted = isClusterPushMuted(mutedUntil)
  const busy = pendingKey !== null

  function openSheet() {
    setError(null)
    setSheetOpen(true)
  }

  function closeSheet() {
    if (busy) return
    setSheetOpen(false)
    setError(null)
  }

  async function apply(push_muted_until: string | null, key: MuteDurationKey | 'unmute') {
    setPendingKey(key)
    setError(null)
    try {
      await upsert.mutateAsync({ clusterId, toggles: {}, push_muted_until })
      setSheetOpen(false)
    } catch (err) {
      setError(toErrorMessage(err, 'Could not update. Try again.'))
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <View>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={muted ? `Change mute for ${clusterName}` : `Mute ${clusterName} notifications`}
        testID={`cluster-mute-${clusterId}`}
        hitSlop={8}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: t.surfaceLowest,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {muted ? (
          <BellOff size={20} color={t.primary} strokeWidth={1.5} />
        ) : (
          <Bell size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
        )}
      </Pressable>
      <MuteDurationSheet
        open={sheetOpen}
        onClose={closeSheet}
        clusterName={clusterName}
        muted={muted}
        mutedUntil={mutedUntil}
        pendingKey={pendingKey}
        error={error}
        onSelect={(key) => void apply(mutedUntilForDuration(key), key)}
        onUnmute={() => void apply(null, 'unmute')}
      />
    </View>
  )
}
