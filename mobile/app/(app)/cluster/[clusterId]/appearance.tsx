import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../../../src/auth-context'
import {
  CLUSTER_APPEARANCE_IDS,
  CLUSTER_APPEARANCES,
  getClusterAppearance,
  resolveClusterPalette,
  setClusterAppearance,
  type ClusterAppearanceId,
  type ClusterPalette,
} from '../../../../src/lib/cluster-appearance'
import { useResolvedScheme } from '../../../../src/lib/theme-choice'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { ClusterThemeProvider, useGlobalTheme } from '../../../../src/lib/cluster-theme'
import { errorHaptic, successHaptic } from '../../../../src/lib/haptics'
import { LoadingView, PrimaryButton, Screen } from '../../../../src/components/ui'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'

function paletteFor(
  id: ClusterAppearanceId,
  scheme: 'light' | 'dark',
  base: { background: string; surfaceContainer: string; chatOutgoing: string; primary: string; surface: string; outlineVariant: string },
): ClusterPalette {
  return resolveClusterPalette(id, scheme, base)
}

export default function ClusterAppearanceScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <ClusterAppearanceScreenContent />
    </ClusterThemeProvider>
  )
}

function ClusterAppearanceScreenContent() {
  const t = useTheme()
  const g = useGlobalTheme()
  const scheme = useResolvedScheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const [stored, setStored] = useState<ClusterAppearanceId | null>(null)
  const [pending, setPending] = useState<ClusterAppearanceId>('default')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    let live = true
    getClusterAppearance(userId, clusterId || null)
      .then((value) => {
        if (!live) return
        setStored(value)
        setPending(value)
      })
      .catch(() => {
        if (!live) return
        setStored('default')
        setPending('default')
      })
    return () => {
      live = false
    }
  }, [userId, clusterId])

  useEffect(load, [load])
  useFocusEffect(load)

  function goBackToRoom() {
    if (router.canGoBack()) router.back()
    else router.replace({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })
  }

  async function handleApply() {
    if (!clusterId || !userId || saving || stored === null) return
    if (pending === stored) {
      goBackToRoom()
      return
    }
    setSaving(true)
    try {
      await setClusterAppearance(userId, clusterId, pending)
      setStored(pending)
      successHaptic()
      goBackToRoom()
    } catch {
      errorHaptic()
    } finally {
      setSaving(false)
    }
  }

  const base = { background: g.background, surfaceContainer: g.surfaceContainer, chatOutgoing: g.chatOutgoing, primary: g.primary, surface: g.surface, outlineVariant: g.outlineVariant }

  return (
    <Screen>
      <ClusterSectionHeader title="Appearance" clusterId={clusterId} section="appearance" />

      <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, marginBottom: 16 }}>
        This only changes how this cluster looks to you.
      </Text>

      {stored === null ? (
        <LoadingView label="Loading theme…" />
      ) : (
        <View style={{ gap: 12 }}>
          {CLUSTER_APPEARANCE_IDS.map((id) => {
            const meta = CLUSTER_APPEARANCES[id]
            const palette = paletteFor(id, scheme, base)
            const selected = pending === id
            return (
              <Pressable
                key={id}
                onPress={() => setPending(id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${meta.name} theme`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: t.surfaceContainer,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? palette.accent : t.outlineVariant,
                  borderRadius: radii.xl,
                  padding: 16,
                  minHeight: 96,
                }}
              >
                <View
                  style={{
                    width: 120,
                    backgroundColor: palette.background,
                    borderWidth: 1,
                    borderColor: t.outlineVariant,
                    borderRadius: radii.md,
                    padding: 10,
                    gap: 6,
                  }}
                >
                  <View style={{ alignItems: 'flex-start' }}>
                    <View style={{ backgroundColor: palette.incoming, borderRadius: 10, width: 72, height: 18 }} />
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: palette.sent, borderRadius: 10, width: 64, height: 18 }} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>{meta.name}</Text>
                  <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: t.onSurfaceVariant }}>
                    {meta.description}
                  </Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? palette.accent : t.outlineVariant,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? (
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: palette.accent }} />
                  ) : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      )}

      <View style={{ marginTop: 24 }}>
        <PrimaryButton title="Apply theme" loading={saving} disabled={stored === null || userId === null} onPress={() => void handleApply()} />
      </View>
    </Screen>
  )
}
