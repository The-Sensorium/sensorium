import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Check, Clock, UserPlus } from 'lucide-react-native'
import { Avatar } from '../../../src/components/Avatar'
import { toErrorMessage } from '../../../src/lib/error'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../src/lib/theme-choice'
import { Card, ErrorText, LoadingView, PrimaryButton, Screen } from '../../../src/components/ui'
import { Modal } from '../../../src/components/Modal'
import { useCreatedInviteDetail } from '../../../src/features/created-clusters'
import { useAcceptInvitation, useDeclineInvitation } from '../../../src/features/votes'

type DetailMember = { id: string; display_name: string }

export default function InviteDetailScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const joinedColor = scheme === 'dark' ? '#34d399' : '#059669'
  const { invitationId = '' } = useLocalSearchParams<{ invitationId: string }>()
  const detail = useCreatedInviteDetail(invitationId || null)
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()
  const [confirmingDecline, setConfirmingDecline] = useState(false)

  const info = detail.data
  const members = ((info?.members ?? []) as DetailMember[]).filter((m) => m && m.id)
  const error =
    toErrorMessage(detail.error, '') ||
    toErrorMessage(accept.error, '') ||
    toErrorMessage(decline.error, '')

  async function onAccept() {
    if (!invitationId) return
    try {
      await accept.mutateAsync(invitationId)
      router.replace({
        pathname: '/cluster/[clusterId]/members',
        params: { clusterId: info?.cluster_id ?? '' },
      })
    } catch {
      // Surfaced via accept.error.
    }
  }

  async function onDecline() {
    if (!invitationId) return
    try {
      await decline.mutateAsync(invitationId)
      setConfirmingDecline(false)
      router.replace('/(app)/home')
    } catch {
      // Surfaced via decline.error inside the dialog; stay open to retry.
    }
  }

  if (detail.isLoading) {
    return (
      <Screen>
        <LoadingView label="Loading invitation…" />
      </Screen>
    )
  }

  if (!info) {
    return (
      <Screen>
        <Link href="/(app)/home" asChild>
          <Pressable
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, minHeight: 48 }}
          >
            <ArrowLeft size={16} color={t.primary} strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Home</Text>
          </Pressable>
        </Link>
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This invitation isn’t available. It may have been answered or withdrawn.
          </Text>
        </Card>
      </Screen>
    )
  }

  const pendingSlots = Math.max(0, (info.pending_count ?? 0) - 1)

  return (
    <Screen>
      <Link href="/(app)/home" asChild>
        <Pressable
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, minHeight: 48 }}
        >
          <ArrowLeft size={16} color={t.primary} strokeWidth={2} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Home</Text>
        </Pressable>
      </Link>

      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
        >
          <UserPlus size={28} color={t.primary} strokeWidth={1.5} />
        </View>
        <Text style={{ marginTop: 12, fontSize: 22, lineHeight: 28, fontWeight: '600', color: t.onSurface, textAlign: 'center' }} accessibilityRole="header">
          You’ve been invited to join a cluster
        </Text>
        <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
          {info.creator_name} invited you to join {info.cluster_name}.
        </Text>
      </View>
      <ErrorText message={error || null} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
            {info.cluster_name}
          </Text>
          <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
              {info.member_count} {info.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          {members.map((member) => (
            <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
              <Avatar name={member.display_name} src={null} size={40} />
              <Text style={{ flex: 1, fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                {member.display_name}
              </Text>
              {member.id === info.creator_id ? (
                <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: t.primary }}>Creator</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={14} color={joinedColor} strokeWidth={2.5} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: joinedColor }}>Joined</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {pendingSlots > 0 ? (
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
              {pendingSlots} more {pendingSlots === 1 ? 'invitation' : 'invitations'} pending
            </Text>
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Pressable
            disabled={accept.isPending || decline.isPending}
            onPress={() => setConfirmingDecline(true)}
            accessibilityRole="button"
            accessibilityLabel="Decline"
            style={{
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.pill,
              paddingHorizontal: 24,
              paddingVertical: 16,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: accept.isPending || decline.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>Decline</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title="Accept invitation"
            loadingTitle="Accepting…"
            loading={accept.isPending}
            onPress={() => void onAccept()}
          />
        </View>
      </View>

      <Modal
        open={confirmingDecline}
        onClose={() => setConfirmingDecline(false)}
        title="Decline invitation?"
      >
        <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          You won’t be invited to {info.cluster_name} again. You can still be invited to other
          clusters.
        </Text>
        {decline.error ? (
          <Text
            accessibilityRole="alert"
            style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.error }}
          >
            {toErrorMessage(decline.error, 'Could not decline the invitation. Please try again.')}
          </Text>
        ) : null}
        <View style={{ marginTop: 20, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => setConfirmingDecline(false)}
              accessibilityRole="button"
              style={{
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.pill,
                paddingHorizontal: 24,
                paddingVertical: 16,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>
                Keep invitation
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="Decline"
              loadingTitle="Declining…"
              loading={decline.isPending}
              onPress={() => void onDecline()}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
