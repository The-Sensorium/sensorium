import { Pressable, Text, View } from 'react-native'
import { radii, spacing } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { Field } from './ui'

const PRONOUN_PRESETS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns']

export function PronounField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme()
  const custom = value !== '' && !PRONOUN_PRESETS.includes(value)
  const options = ["Don't share", ...PRONOUN_PRESETS, 'Something else']

  function selected(option: string): boolean {
    if (option === "Don't share") return value === ''
    if (option === 'Something else') return custom
    return value === option
  }

  function pick(option: string) {
    if (option === "Don't share") onChange('')
    else if (option === 'Something else') onChange(custom ? value : ' ')
    else onChange(option)
  }

  return (
    <View style={{ marginBottom: spacing.gutter }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 6 }}>
        Pronouns
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const active = selected(option)
          return (
            <Pressable
              key={option}
              onPress={() => pick(option)}
              style={{
                borderWidth: 1,
                borderColor: active ? t.primary : t.outlineVariant,
                backgroundColor: active ? t.primary : t.surface,
                borderRadius: radii.pill,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: active ? t.onPrimary : t.onSurface }}
              >
                {option}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {custom ? (
        <View style={{ marginTop: 8 }}>
          <Field
            label="Custom pronouns"
            value={value === ' ' ? '' : value}
            onChangeText={onChange}
            maxLength={40}
            placeholder="e.g. ze/zir"
          />
        </View>
      ) : null}
    </View>
  )
}
