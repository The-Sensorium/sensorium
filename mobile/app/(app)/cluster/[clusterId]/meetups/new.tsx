import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dimensions, Modal as RNModal, Pressable, Text, View, type GestureResponderEvent } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CalendarDays, CalendarPlus, Clock, Globe, Moon, MoreVertical, Plus, Sun, Trash2 } from 'lucide-react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useAuth } from '../../../../../src/auth-context'
import { useClusterMembers } from '../../../../../src/features/matching'
import { useCreateMeetup } from '../../../../../src/features/meetups'
import { Avatar } from '../../../../../src/components/Avatar'
import { ClusterSectionHeader } from '../../../../../src/components/ClusterMenu'
import { TimezonePicker } from '../../../../../src/components/TimezonePicker'
import { mutateWithRetry } from '../../../../../src/lib/mutate-retry'
import { toErrorMessage } from '../../../../../src/lib/error'
import { errorHaptic, successHaptic } from '../../../../../src/lib/haptics'
import { radii, shadowShape } from '../../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../../../src/lib/theme-choice'
import { Card, ErrorText, LoadingView, PrimaryButton, Screen, SecondaryButton } from '../../../../../src/components/ui'
import { MEETUP_ENABLED, MEETUP_MAX_SLOTS, MEETUP_SLOT_LENGTH_MS, defaultCustomStart, formatPillDate, isCustomSlotValid, previewSlotMembers } from '../../../../../src/lib/meetup'
import { defaultTimeZone, isValidTimeZone, zonedDateInput, zonedTimeInput, zonedTimeToISO } from '../../../../../src/lib/timezones'

interface CustomRow {
  day: Date | null
  time: Date | null
}

function defaultRow(): CustomRow {
  // Prefill next Saturday 7pm local; the picker edits day and time separately.
  const start = defaultCustomStart()
  return { day: start, time: start }
}

const MENU_WIDTH = 208

function menuPosition(x: number, y: number) {
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window')
  const menuHeight = 68
  const left = Math.min(Math.max(8, x - MENU_WIDTH + 32), Math.max(8, windowWidth - MENU_WIDTH - 8))
  const below = y + 8
  const top = Math.max(16, below + menuHeight > windowHeight - 16 ? y - menuHeight - 8 : below)
  return { left, top }
}

/** Prominent pill control that opens the native date/time picker. */
function PickerPill({
  icon,
  label,
  muted,
  onPress,
}: {
  icon: ReactNode
  label: string
  muted: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: t.surfaceContainer,
        borderWidth: 1,
        borderColor: t.outlineVariant,
        borderRadius: radii.pill,
        paddingHorizontal: 16,
        minHeight: 48,
        justifyContent: 'center',
      }}
    >
      {icon}
      <Text
        numberOfLines={1}
        style={{ fontSize: 15, lineHeight: 22, fontWeight: muted ? '400' : '600', color: muted ? t.onSurfaceVariant : t.onSurface }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Ballot builder: the proposer adds 2-5 custom times, each previewed per member. */
export default function NewMeetupScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const amber = scheme === 'dark' ? '#fbbf24' : '#b45309'
  const sky = scheme === 'dark' ? '#7dd3fc' : '#0369a1'
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const id = MEETUP_ENABLED ? clusterId || null : null
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const create = useCreateMeetup(id)
  const members = useClusterMembers(id)

  const deviceZone = useMemo(() => defaultTimeZone(), [])
  const selfMember = (members.data ?? []).find((m) => m.id === userId) ?? null
  const profileZone =
    selfMember && typeof selfMember.timezone === 'string' && isValidTimeZone(selfMember.timezone)
      ? selfMember.timezone
      : null
  const [zoneOverride, setZoneOverride] = useState('')
  const activeZone = zoneOverride || profileZone || deviceZone || 'UTC'

  const [rows, setRows] = useState<CustomRow[]>(() => [defaultRow()])
  const [touched, setTouched] = useState(false)
  const [picker, setPicker] = useState<{ index: number; mode: 'date' | 'time' } | null>(null)
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const maxDay = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d
  }, [])

  // While the ballot is still pristine, re-seed the prefill in the profile
  // zone once the roster arrives so the default reads naturally there.
  useEffect(() => {
    if (touched || !profileZone || profileZone === (deviceZone || 'UTC')) return
    const iso = defaultCustomStart().toISOString()
    const day = zonedDateInput(iso, profileZone)
    const time = zonedTimeInput(iso, profileZone)
    if (day && time) setRows([{ day: new Date(`${day}T${time}:00`), time: new Date(`${day}T${time}:00`) }])
  }, [touched, profileZone, deviceZone])

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const rowStates = useMemo(() => rows.map((row) => {
    if (!row.day || !row.time) return { row, iso: null as string | null, valid: false }
    const day = `${row.day.getFullYear()}-${pad2(row.day.getMonth() + 1)}-${pad2(row.day.getDate())}`
    const time = `${pad2(row.time.getHours())}:${pad2(row.time.getMinutes())}`
    const iso = zonedTimeToISO(day, time, activeZone)
    return { row, iso, valid: iso ? isCustomSlotValid(iso) : false }
  }), [rows, activeZone])
  const validSlots = useMemo(() => {
    const out: Array<{ starts_at: string; ends_at: string }> = []
    for (const s of rowStates) {
      if (s.valid && s.iso) {
        out.push({
          starts_at: s.iso,
          ends_at: new Date(new Date(s.iso).getTime() + MEETUP_SLOT_LENGTH_MS).toISOString(),
        })
      }
    }
    return out
  }, [rowStates])
  const canPropose = validSlots.length >= 2 && validSlots.length <= MEETUP_MAX_SLOTS

  function changeRows(updater: (cur: CustomRow[]) => CustomRow[]) {
    setTouched(true)
    setRows(updater)
  }

  function handlePickerValueChange(_event: unknown, selected: Date) {
    const current = picker
    setPicker(null)
    if (!selected || !current) return
    const index = current.index
    if (current.mode === 'date') {
      changeRows((cur) => cur.map((row, i) => (i === index ? { ...row, day: selected } : row)))
    } else {
      changeRows((cur) => cur.map((row, i) => (i === index ? { ...row, time: selected } : row)))
    }
  }

  function openMenu(index: number, e: GestureResponderEvent) {
    const { pageX, pageY } = e.nativeEvent
    const { width } = Dimensions.get('window')
    setPicker(null)
    setMenu({
      index,
      x: typeof pageX === 'number' ? pageX : width - 40,
      y: typeof pageY === 'number' ? pageY : 120,
    })
  }

  async function handlePropose() {
    if (!canPropose || !clusterId) return
    setError(null)
    try {
      const earliest = Math.min(...validSlots.map((s) => new Date(s.starts_at).getTime()))
      await mutateWithRetry(() =>
        create.mutateAsync({ slots: validSlots, votingClosesAt: new Date(earliest - 3600_000).toISOString() }),
      )
      successHaptic()
      router.push({ pathname: '/cluster/[clusterId]/meetups', params: { clusterId } })
    } catch (err) {
      errorHaptic()
      setError(toErrorMessage(err, 'Could not propose the meetup'))
    }
  }

  return (
    <Screen>
      <ClusterSectionHeader title="Propose times" clusterId={clusterId} section="meetups" />
      {members.isPending ? (
        <LoadingView label="Loading members…" />
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarPlus size={24} color={t.onPrimary} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface }}>Propose times</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>Agreed on times in chat? Put them on the ballot.</Text>
            </View>
          </View>
          <Text style={{ marginTop: 16, fontSize: 14, lineHeight: 20, color: t.onSurface }}>
            Add at least 2 times so the cluster has a choice.
          </Text>
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Globe size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.onSurfaceVariant }}>
              Meeting timezone
            </Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <TimezonePicker value={activeZone} onChange={(tz) => { setTouched(true); setZoneOverride(tz) }} />
          </View>
          <View style={{ marginTop: 12, gap: 12 }}>
            {rowStates.map(({ row, iso, valid }, index) => {
              const picked = row.day !== null || row.time !== null
              const dayLabel = row.day ? formatPillDate(row.day, false) : 'Pick a day'
              const timeLabel = row.time
                ? row.time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : 'Pick a time'
              return (
                <View
                  key={index}
                  testID="meetup-custom-row"
                  style={{ gap: 8, borderRadius: radii.md, backgroundColor: t.surfaceLow, borderWidth: 1, borderColor: t.outlineVariant, padding: 14 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }}>
                      Option {index + 1}
                    </Text>
                    <Pressable
                      accessibilityLabel={`More options for option ${index + 1}`}
                      accessibilityRole="button"
                      onPress={(e) => openMenu(index, e)}
                      hitSlop={8}
                      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MoreVertical size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PickerPill
                      icon={<CalendarDays size={18} color={t.onSurfaceVariant} strokeWidth={1.5} />}
                      label={dayLabel}
                      muted={!row.day}
                      onPress={() => { setMenu(null); setPicker({ index, mode: 'date' }) }}
                    />
                    <PickerPill
                      icon={<Clock size={18} color={t.onSurfaceVariant} strokeWidth={1.5} />}
                      label={timeLabel}
                      muted={!row.time}
                      onPress={() => { setMenu(null); setPicker({ index, mode: 'time' }) }}
                    />
                  </View>
                  {picked && !valid ? (
                    <Text style={{ fontSize: 12, lineHeight: 16, color: t.error }}>
                      Pick a time at least 3 hours out and within the next 7 days.
                    </Text>
                  ) : null}
                  {valid && iso ? (
                    <View style={{ gap: 8 }}>
                      <View style={{ height: 1, backgroundColor: t.outlineVariant, opacity: 0.4 }} />
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: t.onSurfaceVariant }}>
                        Local times for everyone
                      </Text>
                      {previewSlotMembers(members.data ?? [], iso).map((m) => {
                        return (
                          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Avatar name={m.display_name} src={m.avatar_url} size={32} />
                            <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurface, flexShrink: 1, flex: 1 }} numberOfLines={1}>
                              {m.display_name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {m.id === userId ? (
                                <View style={{ backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.onPrimary }}>
                                    You
                                  </Text>
                                </View>
                              ) : m.period && m.period !== 'day' ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: m.period === 'late' ? amber : sky, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                                  {m.period === 'late' ? (
                                    <Moon size={12} color={amber} strokeWidth={2} />
                                  ) : (
                                    <Sun size={12} color={sky} strokeWidth={2} />
                                  )}
                                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: m.period === 'late' ? amber : sky }}>
                                    {m.period === 'late' ? 'Late there' : 'Early there'}
                                  </Text>
                                </View>
                              ) : null}
                              <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                                {m.time ? `${m.day} ${m.time}` : 'No timezone set'}
                              </Text>
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
          {rows.length < MEETUP_MAX_SLOTS ? (
            <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <Pressable
                onPress={() => changeRows((cur) => [...cur, { day: null, time: null }])}
                accessibilityRole="button"
                accessibilityLabel="Add another time"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: t.outlineVariant,
                  borderRadius: radii.pill,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  minHeight: 44,
                }}
              >
                <Plus size={16} color={t.primary} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>
                  Add another time
                </Text>
              </Pressable>
            </View>
          ) : null}
          {picker ? (
            <DateTimePicker
              value={(picker.mode === 'date' ? rows[picker.index]?.day : rows[picker.index]?.time) ?? new Date()}
              mode={picker.mode}
              display="default"
              minimumDate={picker.mode === 'date' ? new Date() : undefined}
              maximumDate={picker.mode === 'date' ? maxDay : undefined}
              onValueChange={handlePickerValueChange}
              onDismiss={() => setPicker(null)}
            />
          ) : null}
          <ErrorText message={error} />
          <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            {validSlots.length === 0 ? (
              <>
                <Text style={{ fontWeight: '600', color: t.onSurface }}>No times added yet. </Text>
                <Text style={{ color: t.onSurfaceVariant }}>Add two to propose.</Text>
              </>
            ) : validSlots.length === 1 ? (
              <>
                <Text style={{ fontWeight: '600', color: t.onSurface }}>1 time added. </Text>
                <Text style={{ color: t.onSurfaceVariant }}>Add one more to propose.</Text>
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '600', color: t.onSurface }}>{validSlots.length} times added. </Text>
                <Text style={{ color: t.onSurfaceVariant }}>Ready to propose.</Text>
              </>
            )}
          </Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            <PrimaryButton
              title={
                validSlots.length === 0
                  ? 'Add at least two more times'
                  : validSlots.length === 1
                    ? 'Add at least one more time'
                    : `Propose ${validSlots.length} times`
              }
              loading={create.isPending}
              disabled={!canPropose}
              onPress={() => void handlePropose()}
            />
            <SecondaryButton title="Back" onPress={() => router.back()} />
          </View>
        </Card>
      )}
      {menu ? (
        <RNModal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setMenu(null)}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          accessibilityViewIsModal
        >
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => setMenu(null)}
              accessibilityLabel="Close option menu"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <View
              accessibilityLabel={`Options for option ${menu.index + 1}`}
              style={{
                position: 'absolute',
                ...menuPosition(menu.x, menu.y),
                width: MENU_WIDTH,
                backgroundColor: t.surfaceLowest,
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.xl,
                padding: 8,
                ...shadowShape,
                shadowColor: t.shadowColor,
              }}
            >
              <Pressable
                onPress={() => {
                  const index = menu.index
                  setMenu(null)
                  setPicker(null)
                  changeRows((cur) => cur.filter((_, i) => i !== index))
                }}
                disabled={rows.length <= 1}
                accessibilityLabel="Remove option"
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52, opacity: rows.length <= 1 ? 0.4 : 1 }}
              >
                <Trash2 size={18} color={rows.length <= 1 ? t.onSurfaceVariant : t.error} strokeWidth={1.5} />
                <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: rows.length <= 1 ? t.onSurfaceVariant : t.error }}>
                  Remove option
                </Text>
              </Pressable>
              {rows.length <= 1 ? (
                <Text style={{ paddingHorizontal: 12, paddingBottom: 8, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
                  Add another time to remove this one.
                </Text>
              ) : null}
            </View>
          </View>
        </RNModal>
      ) : null}
    </Screen>
  )
}
