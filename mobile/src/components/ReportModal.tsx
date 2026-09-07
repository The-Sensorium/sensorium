import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { CheckCircle2 } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { Modal } from './Modal'
import { REPORT_REASONS, useIsMuted, useMuteUser, useReportMember, type ReportReason } from '../features/moderation'
import { useReportComment, useReportPost } from '../features/posts'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { PrimaryButton } from './ui'

const REPORT_ERRORS: Record<string, string> = {
  duplicate_report: 'You already have an open report against this member.',
  cannot_report_self: 'You cannot report yourself.',
  message_not_reportable: 'That message can no longer be reported.',
  post_not_reportable: 'That post can no longer be reported.',
  comment_not_reportable: 'That comment can no longer be reported.',
  not_a_member: 'Both you and the member you are reporting must be active in this cluster.',
  details_too_long: 'The details are too long. Please keep them under 2000 characters.',
  account_inactive: 'Your account is restricted right now and cannot submit reports.',
}

export function ReportModal({
  open,
  onClose,
  clusterId,
  target,
  messageId,
  contentTarget,
}: {
  open: boolean
  onClose: () => void
  clusterId: string
  target: { id: string; name: string }
  messageId?: string
  contentTarget?: { kind: 'post' | 'comment'; id: string }
}) {
  const t = useTheme()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const reportMember = useReportMember()
  const reportPost = useReportPost(clusterId)
  const reportComment = useReportComment(clusterId)
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const isSelf = selfId !== null && target.id === selfId
  const muted = useIsMuted(contentTarget ? null : target.id)
  const muteUser = useMuteUser()
  const title = contentTarget ? `Report ${contentTarget.kind}` : 'Report member'

  useEffect(() => {
    if (open) {
      setReason(null)
      setDetails('')
      setError(null)
      setSubmitted(false)
    }
  }, [open])

  async function handleSubmit() {
    if (!reason) return
    setError(null)
    setSubmitting(true)
    try {
      if (contentTarget?.kind === 'post') {
        await reportPost.mutateAsync({ postId: contentTarget.id, reason, details: details.trim() || undefined })
      } else if (contentTarget?.kind === 'comment') {
        await reportComment.mutateAsync({ commentId: contentTarget.id, reason, details: details.trim() || undefined })
      } else {
        await reportMember.mutateAsync({
          clusterId,
          targetUserId: target.id,
          reason,
          details: details.trim() || undefined,
          messageId,
        })
      }
      setSubmitted(true)
    } catch (e) {
      const raw = e instanceof Error ? e.message : ''
      setError(REPORT_ERRORS[raw] ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {submitted ? (
        <View style={{ marginTop: 16, alignItems: 'center', gap: 8, padding: 16 }}>
          <CheckCircle2 size={32} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
            Report submitted
          </Text>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            Thanks. Our moderators will review your report
            {contentTarget ? ` about this ${contentTarget.kind}` : ` about ${target.name}`}.
          </Text>
          {!muted && !isSelf ? (
            <Pressable
              disabled={muteUser.isPending}
              onPress={() => muteUser.mutate({ targetUserId: target.id, displayName: target.name })}
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.pill,
                paddingHorizontal: 16,
                paddingVertical: 8,
                opacity: muteUser.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                Also mute {target.name} (only you)
              </Text>
            </Pressable>
          ) : null}
          {muteUser.isError ? (
            <Text style={{ fontSize: 12, color: t.error }}>
              Couldn’t mute {target.name}. Try again.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            Why are you reporting{contentTarget ? ` this ${contentTarget.kind}` : ` ${target.name}`}?
          </Text>
          {REPORT_REASONS.map((r) => {
            const active = reason === r.value
            return (
              <Pressable
                key={r.value}
                onPress={() => setReason(r.value)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? t.primary : t.outlineVariant,
                  backgroundColor: active ? t.surfaceContainer : 'transparent',
                  borderRadius: radii.md,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 14, color: active ? t.onSurface : t.onSurfaceVariant }}>
                  {r.label}
                </Text>
              </Pressable>
            )
          })}
          <TextInput
            value={details}
            onChangeText={setDetails}
            maxLength={2000}
            multiline
            numberOfLines={3}
            placeholder="Anything that helps our moderators understand the issue… (optional)"
            placeholderTextColor={t.onSurfaceVariant}
            style={{
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 14,
              minHeight: 88,
              textAlignVertical: 'top',
              color: t.onSurface,
            }}
          />
          {error ? <Text style={{ fontSize: 14, color: t.error }}>{error}</Text> : null}
          <PrimaryButton
            title="Submit report"
            loading={submitting}
            onPress={() => void handleSubmit()}
          />
        </View>
      )}
    </Modal>
  )
}
