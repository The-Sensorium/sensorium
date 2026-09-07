import { useState } from 'react'
import { FlatList, Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { CalendarDays } from 'lucide-react-native'
import { COUNTRIES, countryName } from '../../lib/countries'
import { MIN_AGE, type OnboardingDraft } from '../../lib/onboarding-draft'
import { radii, spacing } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Field } from '../ui'
import { PronounField } from '../PronounField'

function CountryField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)) : COUNTRIES

  return (
    <View style={{ marginBottom: spacing.gutter }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 6 }}>
        Country
      </Text>
      <Pressable
        onPress={() => {
          setQuery('')
          setOpen(true)
        }}
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ fontSize: 14, color: value ? t.onSurface : t.onSurfaceVariant }}>
          {value ? countryName(value) : 'Select your country…'}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
          <View style={{ padding: spacing.gutter }}>
            <Field label="Search" value={query} onChangeText={setQuery} placeholder="Start typing…" />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.code)
                  setOpen(false)
                }}
                style={{ paddingHorizontal: spacing.containerMargin, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, color: t.onSurface }}>{item.name}</Text>
              </Pressable>
            )}
          />
          <Pressable
            onPress={() => setOpen(false)}
            style={{ padding: spacing.gutter, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Close</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  )
}



function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function DobField({ value, onChange }: { value: string; onChange: (dob: string) => void }) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - MIN_AGE)

  return (
    <View style={{ marginBottom: spacing.gutter }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 6 }}>
        Date of birth
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: t.surfaceContainer,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <CalendarDays size={18} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 16, color: value ? t.onSurface : t.onSurfaceVariant }}>
          {value || 'Select your date of birth'}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parseISODate(value) ?? maxDob}
          mode="date"
          display="default"
          maximumDate={maxDob}
          onValueChange={(_, selected) => {
            setOpen(false)
            onChange(toISODate(selected))
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  )
}

export function StepProfile({
  draft,
  patch,
}: {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}) {
  const t = useTheme()
  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - MIN_AGE)
  const maxDobStr = toISODate(maxDob)

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>
        Tell us about yourself
      </Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        This is how you’ll appear to the people in your clusters.
      </Text>
      <Field
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) => patch({ displayName })}
        maxLength={60}
        placeholder="How should people call you?"
        autoCapitalize="words"
      />
      <PronounField value={draft.pronouns} onChange={(pronouns) => patch({ pronouns })} />
      <DobField value={draft.dob} onChange={(dob) => patch({ dob })} />
      <Text style={{ fontSize: 12, color: t.onSurfaceVariant, marginTop: -8, marginBottom: 16 }}>
        You must be at least {MIN_AGE} (born on or before {maxDobStr}). It can’t be changed later.
        Only your birth year is ever shown to cluster members.
      </Text>
      <CountryField value={draft.countryCode} onChange={(countryCode) => patch({ countryCode })} />
    </View>
  )
}
