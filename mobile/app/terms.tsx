import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import * as Linking from 'expo-linking'
import { useTheme } from '../src/lib/use-theme'
import { Card, Screen } from '../src/components/ui'
import { TERMS_DOCUMENT } from '../src/legal/content'

export default function TermsScreen() {
  const t = useTheme()
  return (
    <Screen>
      <Pressable
        onPress={() => {
          if (router.canGoBack()) router.back()
          else router.replace('/settings')
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}
      >
        <ArrowLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
          Back to settings
        </Text>
      </Pressable>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>{TERMS_DOCUMENT.title}</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Last updated {TERMS_DOCUMENT.updated}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant, marginBottom: 16 }}>
        {TERMS_DOCUMENT.intro}
      </Text>
      {TERMS_DOCUMENT.sections.map((s) => (
        <Card key={s.title}>
          <View style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>{s.title}</Text>
            {s.blocks.map((b, i) => {
              if (b.kind === 'p') {
                return (
                  <Text key={i} style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                    {b.text}
                  </Text>
                )
              }
              if (b.kind === 'bullets') {
                return (
                  <View key={i} style={{ marginTop: 8, gap: 4 }}>
                    {b.items.map((item, itemIndex) => (
                      <View key={itemIndex} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>•</Text>
                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                )
              }
              return (
                <Text key={i} style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
                  {b.before}
                  <Text
                    style={{ color: t.primary, textDecorationLine: 'underline' }}
                    onPress={() => void Linking.openURL(`mailto:${b.address}`)}
                  >
                    {b.address}
                  </Text>
                  {b.after}
                </Text>
              )
            })}
          </View>
        </Card>
      ))}
    </Screen>
  )
}
