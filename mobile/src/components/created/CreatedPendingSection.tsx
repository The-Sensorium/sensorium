import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Clock, Search, UserPlus, X } from 'lucide-react-native'
import { Avatar } from '../Avatar'
import { toErrorMessage, inviteErrorMessage } from '../../lib/error'
import {
  useCancelCreatedInvitation,
  useCreatedPendingInvites,
  useEligibleComembers,
  useInviteToCreatedCluster,
} from '../../features/created-clusters'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { PrimaryButton, ErrorText } from '../ui'

/** Pending roster, invite-more, and cancel controls for user-created clusters
 * (mirrors the web MembersView section). Rendered only for created clusters. */
export function CreatedPendingSection({
  clusterId,
  confirmedCount,
  confirmedIds,
  isCreator,
}: {
  clusterId: string
  confirmedCount: number
  confirmedIds: string[]
  isCreator: boolean
}) {
  const t = useTheme()
  const pending = useCreatedPendingInvites(clusterId)
  const eligible = useEligibleComembers()
  const invite = useInviteToCreatedCluster(clusterId)
  const cancel = useCancelCreatedInvitation(clusterId)
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pendingList = useMemo(() => pending.data ?? [], [pending.data])
  const pendingIds = useMemo(() => new Set(pendingList.map((p) => p.user_id)), [pendingList])
  const confirmedIdSet = useMemo(() => new Set(confirmedIds), [confirmedIds])
  const q = search.trim().toLowerCase()
  const candidates = useMemo(
    () =>
      (eligible.data ?? []).filter(
        (p) =>
          !pendingIds.has(p.user_id) &&
          !confirmedIdSet.has(p.user_id) &&
          (!q || (p.display_name ?? '').toLowerCase().includes(q)),
      ),
    [eligible.data, pendingIds, confirmedIdSet, q],
  )

  const isPending = confirmedCount < 3
  const full = confirmedCount + pendingList.length >= 8

  return (
    <View style={{ marginBottom: 12 }} testID="created-pending-section">
      <ErrorText message={actionError} />
      {isPending ? (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: t.surfaceContainer,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        >
          <View
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surfaceHighest, alignItems: 'center', justifyContent: 'center' }}
          >
            <Clock size={14} color={t.onSurfaceVariant} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>Pending</Text>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
              {3 - confirmedCount} more {3 - confirmedCount === 1 ? 'member' : 'members'} needed to
              activate.
            </Text>
          </View>
        </View>
      ) : null}

      {pendingList.map((inv) => (
        <View
          key={inv.invitation_id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: t.surfaceContainer,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.outlineVariant,
            borderRadius: radii.xl,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <Avatar name={inv.display_name} src={inv.avatar_url} size={40} />
          <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={1}>
            {inv.display_name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>Pending</Text>
          </View>
          {isCreator ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cancel invitation to ${inv.display_name}`}
              disabled={cancel.isPending}
              onPress={() => {
                setActionError(null)
                void cancel.mutateAsync(inv.invitation_id).catch((err) => {
                  setActionError(toErrorMessage(err, 'Could not cancel the invitation.'))
                })
              }}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: cancel.isPending ? 0.6 : 1,
              }}
            >
              <X size={16} color={t.onSurfaceVariant} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {isCreator && !full ? (
        <View style={{ marginTop: 4 }}>
          <PrimaryButton
            title="Invite more people"
            onPress={() => setShowPicker((v) => !v)}
          />
          {showPicker ? (
            <View
              style={{
                marginTop: 8,
                backgroundColor: t.surfaceLowest,
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.xl,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Search size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search people…"
                  placeholderTextColor={t.onSurfaceVariant}
                  accessibilityLabel="Search people to invite"
                  style={{ flex: 1, fontSize: 14, color: t.onSurface, minHeight: 44 }}
                />
              </View>
              {eligible.isLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <ActivityIndicator size="small" color={t.primary} />
                  <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>Loading…</Text>
                </View>
              ) : candidates.length === 0 ? (
                <Text style={{ marginTop: 8, fontSize: 12, color: t.onSurfaceVariant }}>
                  No one else to invite right now.
                </Text>
              ) : (
                candidates.slice(0, 20).map((person) => (
                  <Pressable
                    key={person.user_id}
                    accessibilityRole="button"
                    disabled={invite.isPending}
                    onPress={() => {
                      setActionError(null)
                      void invite.mutateAsync(person.user_id).catch((err) => {
                        setActionError(inviteErrorMessage(err, 'Could not send the invitation.'))
                      })
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48, opacity: invite.isPending ? 0.6 : 1 }}
                  >
                    <Avatar name={person.display_name} src={person.avatar_url} size={36} />
                    <Text style={{ flex: 1, fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                      {person.display_name}
                    </Text>
                    <UserPlus size={16} color={t.primary} strokeWidth={1.5} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: t.primary }}>Invite</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
