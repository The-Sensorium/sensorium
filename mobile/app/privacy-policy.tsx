import { Pressable, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useTheme } from '../src/lib/use-theme'
import { Card, Screen } from '../src/components/ui'

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'email'; before: string; address: string; after: string }

const INTRO =
  'Sensorium connects you with a small, permanent group of people (a “cluster”). This policy explains what personal data we collect, why, and the choices you have. You must be at least 18 years old to use Sensorium.'

const SECTIONS: { title: string; blocks: Block[] }[] = [
  {
    title: '1. What we collect',
    blocks: [
      {
        kind: 'p',
        text: 'When you create an account we collect your email, display name, date of birth, country, and any details you add to your profile. If you enable Local matching, we store a coarse location (city area) and the matching radius you choose, never your precise coordinates. We also record your activity on the service, such as messages, reactions, signals, votes, and notifications.',
      },
      {
        kind: 'p',
        text: 'Only your birth year is shown to other members. Month and day are used internally for matching and are never displayed.',
      },
    ],
  },
  {
    title: '2. How we use your data',
    blocks: [
      {
        kind: 'p',
        text: 'We use the data we collect to provide, personalize, and protect our service, including:',
      },
      {
        kind: 'bullets',
        items: [
          'creating and matching clusters based on birth date or location;',
          'operating cluster chat, signals, votes, and notifications;',
          'moderating content and responding to reports of misconduct;',
          'improving the product and keeping it secure.',
        ],
      },
    ],
  },
  {
    title: '3. Data sharing',
    blocks: [
      {
        kind: 'p',
        text: 'We do not sell your personal data. Within a cluster, your profile and answers to the introduction phase are visible only to that cluster. Reports you submit are shared only with our moderation team.',
      },
    ],
  },
  {
    title: '4. Storage and deletion',
    blocks: [
      {
        kind: 'p',
        text: 'Data is stored by our hosted infrastructure provider and kept while you have an active account. You can delete your account at any time from Settings, which removes your profile, memberships, and the content you own. Some records may be retained where required by law or to investigate reported abuse.',
      },
      {
        kind: 'p',
        text: 'Moderation records, including reports and the actions taken on them, are retained for up to 24 months so we can keep our community safe. If you delete your account, we remove the personal identifiers from those records rather than destroy the audit trail. When a message is hidden or your account is warned or suspended, we notify you in the app; a permanent ban ends your access, so it is communicated through the affected account’s restricted screen instead.',
      },
    ],
  },
  {
    title: '5. Age restriction',
    blocks: [
      {
        kind: 'p',
        text: 'Sensorium is not intended for anyone under 18. We require your date of birth and restrict accounts that do not meet the minimum age.',
      },
    ],
  },
  {
    title: '6. Security & changes',
    blocks: [
      {
        kind: 'p',
        text: 'We use industry-standard safeguards and store data through a managed, verified platform. We may update this policy and will refresh the date at the top whenever we do.',
      },
    ],
  },
  {
    title: '7. Contact',
    blocks: [
      { kind: 'email', before: 'Questions about this policy? Reach out at ', address: 'privacy@sensorium.app', after: '.' },
    ],
  },
]

export default function PrivacyPolicyScreen() {
  const t = useTheme()
  return (
    <Screen>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Privacy Policy</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Last updated August 20, 2026
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant, marginBottom: 16 }}>
        {INTRO}
      </Text>
      {SECTIONS.map((s) => (
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
                    {b.items.map((item) => (
                      <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
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
      <View style={{ alignItems: 'center', padding: 12 }}>
        <Pressable onPress={() => void Linking.openURL('mailto:privacy@sensorium.app')}>
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>Questions? Email us anytime.</Text>
        </Pressable>
      </View>
    </Screen>
  )
}
