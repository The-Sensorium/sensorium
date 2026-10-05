import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, UserRound } from 'lucide-react-native'
import { useProfile } from '../lib/use-profile'
import { useUpdateProfile } from '../features/cluster'
import {
  DEFAULT_PROFILE_STATUS,
  isProfileStatus,
  profileStatusMeta,
  type ProfileStatus,
} from '../lib/profile-status'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { useResolvedScheme } from '../lib/theme-choice'
import { statusDotColor } from '../lib/status-dot'
import { Card } from './ui'
import { ProfileStatusSheet } from './ProfileStatusSheet'

export function ProfileStatusCard() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const profile = useProfile()
  const updateProfile = useUpdateProfile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<ProfileStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saved = profile.data?.manual_status
  const current: ProfileStatus =
    optimistic ?? (isProfileStatus(saved) ? saved : DEFAULT_PROFILE_STATUS)
  const meta = profileStatusMeta(current)

  // Clear the optimistic value once the refetch lands. Clearing in onSettled
  // would flash back to the stale value on slow networks.
  useEffect(() => {
    if (optimistic !== null && saved === optimistic) setOptimistic(null)
  }, [optimistic, saved])

  function handleSelect(next: ProfileStatus) {
    setSheetOpen(false)
    setError(null)
    setOptimistic(next)
    updateProfile.mutate(
      { manual_status: next },
      {
        onError: () => {
          setError('Could not save your status. Please try again.')
          setOptimistic(null)
        },
      },
    )
  }

  return (
    <Card>
      <View style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <UserRound size={20} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Status</Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
          Your status is visible to your cluster.
        </Text>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Status ${meta.label}, change status`}
          style={{
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            backgroundColor: t.surfaceContainer,
            borderRadius: radii.lg,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 56,
          }}
        >
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: statusDotColor(current, scheme === 'dark') }} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.onSurface }}>
            {meta.label}
          </Text>
          <ChevronRight size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        </Pressable>
        {error ? (
          <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>{error}</Text>
        ) : null}
      </View>
      <ProfileStatusSheet
        open={sheetOpen}
        current={current}
        onClose={() => setSheetOpen(false)}
        onSelect={handleSelect}
      />
    </Card>
  )
}
