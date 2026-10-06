import { useEffect, useState } from 'react'
import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarDays, Clock, Users, X } from 'lucide-react-native'
import { AgeRangeSlider, AGE_MAX, AGE_MIN } from './AgeRangeSlider'
import {
  useLocalCompatibleCount,
  useSetLocalAgePrefs,
} from '../features/matching'
import { useProfile } from '../lib/use-profile'
import { toErrorMessage } from '../lib/error'
import { radii } from '../lib/theme-tokens'
import { useResolvedScheme } from '../lib/theme-choice'
import { useTheme } from '../lib/use-theme'
import { ErrorText, PrimaryButton } from './ui'

/** Match preferences as a bottom sheet (not a pushed page): the Local queue
 * with its radius rows and counts stays visible underneath, and saving
 * updates the card in place. Follows the ProfileStatusSheet pattern. */
export function MatchPreferencesSheet({
  open,
  queueKey,
  onClose,
}: {
  open: boolean
  queueKey: string | null
  onClose: () => void
}) {
  const t = useTheme()
  const { bottom } = useSafeAreaInsets()

  return (
    <RNModal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable
          accessibilityLabel="Dismiss match preferences"
          onPress={onClose}
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel="Match preferences"
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottom + 16,
            maxHeight: '90%',
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss match preferences"
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{ alignSelf: 'stretch', minHeight: 48, justifyContent: 'center' }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: t.outlineVariant,
              }}
            />
          </Pressable>
          {open ? <MatchPreferencesForm queueKey={queueKey} onClose={onClose} /> : null}
        </View>
      </View>
    </RNModal>
  )
}

function MatchPreferencesForm({
  queueKey,
  onClose,
}: {
  queueKey: string | null
  onClose: () => void
}) {
  const t = useTheme()
  const profile = useProfile()
  const save = useSetLocalAgePrefs()
  // Warning amber, matching the Sun/Moon time cue and status dots: amber-500
  // light, amber-400 dark, with a 10% tinted wash behind it.
  const scheme = useResolvedScheme()
  const amber = scheme === 'dark' ? '#fbbf24' : '#b45309'
  const amberWash = scheme === 'dark' ? '#fbbf241a' : '#f59e0b1a'

  const savedMin = profile.data?.local_pref_age_min ?? null
  const savedMax = profile.data?.local_pref_age_max ?? null

  // Fresh draft per open (the form only mounts while the sheet is open), so
  // background profile refetches can never clobber an in-progress edit and
  // polls/timers die with the sheet.
  const [min, setMin] = useState(savedMin ?? AGE_MIN)
  const [max, setMax] = useState(savedMax ?? AGE_MAX)
  const [error, setError] = useState<string | null>(null)

  const narrowed = min !== AGE_MIN || max !== AGE_MAX
  // Debounce the draft before counting (same 300ms as web staff search), so
  // one query fires per pause instead of one per slider tick.
  const [debMin, setDebMin] = useState<number | null>(narrowed ? min : null)
  const [debMax, setDebMax] = useState<number | null>(narrowed ? max : null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebMin(narrowed ? min : null)
      setDebMax(narrowed ? max : null)
    }, 300)
    return () => clearTimeout(timer)
  }, [min, max, narrowed])
  const live = useLocalCompatibleCount(queueKey, debMin, debMax)

  async function onSave() {
    setError(null)
    try {
      const fullSpan = min === AGE_MIN && max === AGE_MAX
      await save.mutateAsync(fullSpan ? { min: null, max: null } : { min, max })
      onClose()
    } catch (err) {
      const raw = toErrorMessage(err, '').toLowerCase()
      setError(
        raw.includes('invalid_age_range')
          ? 'Choose an age range between 18 and 99, or Any age.'
          : toErrorMessage(err, 'Could not save preferences.'),
      )
    }
  }

  // Sticky footer: the form scrolls under a pinned Save button, so the
  // warning can never push the CTA into the gesture bar on small screens.
  return (
    <View style={{ flexShrink: 1 }}>
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
            Match preferences
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close match preferences"
            hitSlop={8}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
        <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          Choose the age range you’re comfortable being grouped with.
        </Text>

        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CalendarDays size={22} color={t.onSurface} strokeWidth={1.5} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.onSurface }}>Age range</Text>
          <Pressable
            onPress={() => {
              setMin(AGE_MIN)
              setMax(AGE_MAX)
            }}
            disabled={!narrowed}
            accessibilityRole="button"
            accessibilityLabel="Reset to any age"
            hitSlop={8}
            style={{ paddingVertical: 12, minHeight: 44, justifyContent: 'center', opacity: narrowed ? 1 : 0.4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Any age</Text>
          </Pressable>
        </View>

        <Text style={{ marginTop: 12, textAlign: 'center', fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface }} accessibilityLiveRegion="polite">
          {narrowed ? `${min} to ${max} years` : 'Any age'}
        </Text>

        <AgeRangeSlider
          min={min}
          max={max}
          onChange={(lo, hi) => {
            setMin(lo)
            setMax(hi)
          }}
        />

        <View style={{ marginTop: 20, flexDirection: 'row', gap: 12 }}>
          <Users size={22} color={t.primary} strokeWidth={1.5} />
          <View style={{ flex: 1 }}>
            <Text style={{ minHeight: 24, fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }} accessibilityLiveRegion="polite">
              {live.isError
                ? 'Match count unavailable right now.'
                : live.count != null
                  ? `${live.count} ${live.count === 1 ? 'person currently matches' : 'people currently match'}`
                  : null}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
              Join the Local queue to be grouped with 7 strangers who match your preferences.
            </Text>
          </View>
        </View>

        {narrowed ? (
          <View
            style={{
              marginTop: 16,
              flexDirection: 'row',
              gap: 12,
              backgroundColor: amberWash,
              borderRadius: radii.lg,
              padding: 16,
            }}
          >
            <Clock size={22} color={amber} strokeWidth={1.5} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: amber }}>
              Narrower preferences may take longer to form a cluster.
            </Text>
          </View>
        ) : null}

        <ErrorText message={error} />
      </ScrollView>
      <View style={{ paddingTop: 16 }}>
        <PrimaryButton
          title="Save preferences"
          loadingTitle="Saving…"
          loading={save.isPending}
          onPress={() => void onSave()}
        />
      </View>
    </View>
  )
}
