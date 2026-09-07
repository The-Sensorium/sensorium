import { Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useTheme } from '../src/lib/use-theme'
import { Card, Screen } from '../src/components/ui'

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'email'; before: string; address: string; after: string }

const INTRO =
  'These Terms govern your use of Sensorium, a social platform that places you into a permanent group of eight people (“clusters”). By signing up you agree to these Terms. You must be at least 18 years old to use the service.'

const SECTIONS: { title: string; blocks: Block[] }[] = [
  {
    title: '1. The service',
    blocks: [
      {
        kind: 'p',
        text: 'Sensorium matches you into a cluster by birth date or location and provides tools for that group to interact: chat, signals for help, and votes. We may change, suspend, or discontinue any feature at any time.',
      },
    ],
  },
  {
    title: '2. Your account',
    blocks: [
      {
        kind: 'p',
        text: 'You are responsible for keeping your account credentials safe and for everything done on your account. You must not share accounts or provide false information, including an incorrect date of birth.',
      },
    ],
  },
  {
    title: '3. Acceptable use',
    blocks: [
      { kind: 'p', text: 'You agree not to use Sensorium to:' },
      {
        kind: 'bullets',
        items: [
          'harass, threaten, or impersonate others;',
          'share illegal, hateful, or sexually explicit content;',
          'spam or abuse the reporting, voting, or messaging systems;',
          'attempt to breach our security or collect data about other members.',
        ],
      },
    ],
  },
  {
    title: '4. Your content',
    blocks: [
      {
        kind: 'p',
        text: 'You keep whatever rights you have in your own posts. You grant Sensorium a limited license to store, display, and distribute your content solely for providing the service. We may remove content or suspend accounts that our moderation team determines violate these Terms.',
      },
    ],
  },
  {
    title: '5. Moderation and enforcement',
    blocks: [
      {
        kind: 'p',
        text: 'Members can report other members or specific messages. A report is reviewed by our moderation team, who may dismiss it or take action. Actions we may take include hiding or restoring a reported message, issuing a warning, suspending an account for up to 7 days, or permanently banning an account. Permanent bans are applied by administrators.',
      },
      {
        kind: 'p',
        text: 'If your account is suspended or banned, you can sign in to a restricted-account screen that shows your status and any suspension expiry. If you believe a decision is wrong, you can appeal from inside the app. If your message is hidden or your account is warned or suspended, we notify you in the app.',
      },
    ],
  },
  {
    title: '6. Termination',
    blocks: [
      {
        kind: 'p',
        text: 'You can leave a cluster or delete your account at any time from Settings. We may also suspend or terminate accounts for a breach of these Terms or to protect the community.',
      },
    ],
  },
  {
    title: '7. Disclaimers',
    blocks: [
      {
        kind: 'p',
        text: 'The service is provided “as is” and “as available.” To the extent permitted by law, we disclaim warranties about reliability, fitness, or uninterrupted availability, and our liability is limited to the amount you paid us (Sensorium is free today).',
      },
    ],
  },
  {
    title: '8. Changes & contact',
    blocks: [
      {
        kind: 'p',
        text: 'We may update these Terms, and the current version always applies; continued use after a change means you accept them.',
      },
      { kind: 'email', before: 'Questions? ', address: 'legal@sensorium.app', after: '' },
    ],
  },
]

export default function TermsScreen() {
  const t = useTheme()
  return (
    <Screen>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Terms of Service</Text>
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
    </Screen>
  )
}
