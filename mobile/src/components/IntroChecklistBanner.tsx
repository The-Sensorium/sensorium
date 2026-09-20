import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Sparkles, X } from 'lucide-react-native'
import { useMyMembership, useIntroProgress } from '../features/introductions'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { Card } from './ui'

const DISMISS_PREFIX = 'intro-nudge-dismissed:'

/**
 * In-cluster introductions nudge (web parity). Intros are an optional
 * checklist that never blocks access: the banner shows only while the
 * viewer's own intro is pending and links to the answer form. Dismissible
 * banners (room) persist the dismissal per viewer; persistent banners
 * (members tab) always stay visible while pending, so the form is never
 * unreachable.
 */
export function IntroChecklistBanner({
  clusterId,
  dismissible = true,
}: {
  clusterId: string
  dismissible?: boolean
}) {
  const t = useTheme()
  const membership = useMyMembership(clusterId || null)
  const progress = useIntroProgress(clusterId || null, clusterId !== '')
  const [dismissed, setDismissed] = useState<boolean | null>(dismissible ? null : false)

  useEffect(() => {
    if (!dismissible) return
    let live = true
    AsyncStorage.getItem(`${DISMISS_PREFIX}${clusterId}`)
      .then((value) => {
        if (live) setDismissed(value === '1')
      })
      .catch(() => {
        if (live) setDismissed(false)
      })
    return () => {
      live = false
    }
  }, [dismissible, clusterId])

  if (dismissed) return null
  if (membership.isLoading || !membership.data || membership.data.intro_completed_at) return null

  const rows = progress.data ?? []
  const done = rows.filter((r) => r.intro_completed_at).length

  function dismiss() {
    setDismissed(true)
    if (dismissible) {
      AsyncStorage.setItem(`${DISMISS_PREFIX}${clusterId}`, '1').catch(() => {})
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: t.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={16} color={t.onPrimary} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
            Complete your introductions
          </Text>
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={2}>
            {rows.length > 0
              ? `${done} of ${rows.length} members finished.`
              : 'Tell your cluster who you are.'}
          </Text>
        </View>
        <Link
          href={{ pathname: '/cluster/[clusterId]/introductions', params: { clusterId } }}
          asChild
        >
          <Pressable
            accessibilityLabel="Answer the intro questions"
            style={{
              backgroundColor: t.primary,
              borderRadius: radii.pill,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onPrimary }}>Answer</Text>
          </Pressable>
        </Link>
        {dismissible ? (
          <Pressable
            accessibilityLabel="Dismiss introductions reminder"
            onPress={dismiss}
            style={{ paddingHorizontal: 4, paddingVertical: 8 }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  )
}
