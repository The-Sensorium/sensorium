import { Pressable, Text, View } from 'react-native'
import { Link, router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { REPORT_REASONS, useMyReports } from '../../../src/features/moderation'
import { timeAgo } from '../../../src/features/notifications'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../../src/components/ui'

const REASON_LABELS = new Map(REPORT_REASONS.map((r) => [r.value, r.label]))

const KIND_LABELS: Record<string, string> = {
  member: 'Member',
  message: 'Message',
  post: 'Post',
  comment: 'Comment',
}

function outcomeFor(status: string): string | null {
  if (status === 'actioned') return 'Reviewed — action taken.'
  if (status === 'dismissed') return 'Reviewed — no action taken.'
  return null
}

export default function MyReportsScreen() {
  const t = useTheme()
  const reports = useMyReports()

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}
      >
        <ArrowLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
          Back to settings
        </Text>
      </Pressable>

      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>My reports</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Reports you submitted.
      </Text>

      {reports.isLoading ? (
        <LoadingView />
      ) : reports.isError ? (
        <Card>
          <Text style={{ fontSize: 14, color: t.error }}>
            Couldn’t load your reports. Please try again.
          </Text>
        </Card>
      ) : (reports.data ?? []).length === 0 ? (
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            No reports yet. Reports you submit appear here.
          </Text>
        </Card>
      ) : (
        (reports.data ?? []).map((report) => {
          const outcome = outcomeFor(report.status)
          const open = report.status === 'pending' || report.status === 'reviewing'
          return (
            <Card key={report.id}>
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                    {report.target_display_name
                      ? `${report.target_display_name} · ${KIND_LABELS[report.target_kind] ?? report.target_kind}`
                      : `${KIND_LABELS[report.target_kind] ?? report.target_kind} report`}
                  </Text>
                  <View
                    style={{ backgroundColor: open ? t.surfaceContainer : t.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '500', color: open ? t.primary : t.onSurfaceVariant }}>
                      {report.status}
                    </Text>
                  </View>
                </View>
                <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
                  {report.cluster_name} · {REASON_LABELS.get(report.reason) ?? report.reason} · {timeAgo(report.created_at)}
                </Text>
                {report.details ? (
                  <Text style={{ marginTop: 4, fontSize: 14, fontStyle: 'italic', lineHeight: 20, color: t.onSurfaceVariant }}>
                    “{report.details}”
                  </Text>
                ) : null}
                {outcome ? (
                  <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>{outcome}</Text>
                ) : null}
              </View>
            </Card>
          )
        })
      )}
      <View style={{ height: 8 }} />
      <Link href="/(app)/settings" asChild>
        <Pressable style={{ alignItems: 'center', padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Back to settings</Text>
        </Pressable>
      </Link>
    </Screen>
  )
}
