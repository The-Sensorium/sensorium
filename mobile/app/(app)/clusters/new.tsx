import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft, Check, Search, Users } from 'lucide-react-native'
import { useProfile } from '../../../src/lib/use-profile'
import { Avatar } from '../../../src/components/Avatar'
import { Modal } from '../../../src/components/Modal'
import { toErrorMessage, inviteErrorMessage } from '../../../src/lib/error'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import {
  Card,
  ErrorText,
  LoadingView,
  PrimaryButton,
  Screen,
} from '../../../src/components/ui'
import {
  useCreateCluster,
  useEligibleComembers,
} from '../../../src/features/created-clusters'

const NAME_LIMIT = 50
const MIN_INVITEES = 2
const MAX_INVITEES = 7

const TITLES = ['Name your cluster', 'Invite people', 'Review your cluster'] as const
const SUBTITLES = [
  'Give your cluster a name.',
  'You can invite people you’ve previously shared a cluster with.',
  'You’ll send invitations to these people. The cluster becomes active once at least 3 members have joined.',
] as const

function StepProgress({ step }: { step: number }) {
  const t = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 20 }}
    >
      {[0, 1, 2].map((i) => {
        const active = i <= step
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? t.primary : 'transparent',
                borderWidth: active ? 0 : 1,
                borderColor: t.outlineVariant,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: active ? t.onPrimary : t.onSurfaceVariant }}>
                {i + 1}
              </Text>
            </View>
            {i < 2 ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.outlineVariant, marginHorizontal: 8, overflow: 'hidden' }}
              >
                {i < step ? <View style={{ flex: 1, backgroundColor: t.primary }} /> : null}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

export default function NewClusterScreen() {
  const t = useTheme()
  const profile = useProfile()
  const eligible = useEligibleComembers()
  const create = useCreateCluster()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [capped, setCapped] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const trimmed = name.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= NAME_LIMIT

  const people = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = eligible.data ?? []
    if (!q) return list
    return list.filter((p) => (p.display_name ?? '').toLowerCase().includes(q))
  }, [eligible.data, search])

  const selectedPeople = useMemo(() => {
    const byId = new Map((eligible.data ?? []).map((p) => [p.user_id, p]))
    return selected.flatMap((id) => {
      const p = byId.get(id)
      return p ? [p] : []
    })
  }, [eligible.data, selected])

  function toggle(id: string) {
    if (selected.includes(id)) {
      setCapped(false)
      setSelected(selected.filter((s) => s !== id))
    } else if (selected.length >= MAX_INVITEES) {
      setCapped(true)
    } else {
      setSelected([...selected, id])
    }
  }

  async function send(clusterName: string) {
    // Submit exactly the roster shown on the review step.
    try {
      const clusterId = await create.mutateAsync({
        name: clusterName,
        inviteeIds: selectedPeople.map((p) => p.user_id),
      })
      router.replace({ pathname: '/cluster/[clusterId]/members', params: { clusterId } })
    } catch {
      // Surfaced via create.error below.
    }
  }

  const error = inviteErrorMessage(create.error, '') || toErrorMessage(eligible.error, '')

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (step === 0 ? router.back() : setStep(step - 1))}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, justifyContent: 'center', paddingRight: 8 }}
        >
          <ArrowLeft size={18} color={t.primary} strokeWidth={2} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>
            Back
          </Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
        {TITLES[step]}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
        Step {step + 1} of 3
      </Text>
      <StepProgress step={step} />
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, marginBottom: 16 }}>
        {SUBTITLES[step]}
      </Text>
      <ErrorText message={error || null} />

      {step === 0 ? (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 6 }}>
            Cluster name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={NAME_LIMIT}
            placeholder="Late Night Crew"
            placeholderTextColor={t.onSurfaceVariant}
            accessibilityLabel="Cluster name"
            style={{
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: t.onSurface,
              minHeight: 48,
            }}
          />
          <Text style={{ marginTop: 4, fontSize: 12, textAlign: 'right', color: t.onSurfaceVariant }}>
            {trimmed.length}/{NAME_LIMIT}
          </Text>
          <View style={{ marginTop: 16 }}>
            <PrimaryButton title="Continue" disabled={!nameValid} quietDisabled onPress={() => setStep(1)} />
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 12,
              minHeight: 48,
              marginBottom: 12,
            }}
          >
            <Search size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search people…"
              placeholderTextColor={t.onSurfaceVariant}
              accessibilityLabel="Search people"
              style={{ flex: 1, fontSize: 16, color: t.onSurface, minHeight: 48 }}
            />
          </View>

          {eligible.isLoading ? (
            <LoadingView label="Loading people…" />
          ) : (eligible.data ?? []).length === 0 ? (
            <Card plain>
              <View style={{ alignItems: 'center', padding: 16 }}>
                <Users size={24} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ marginTop: 12, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
                  No one to invite yet. You’ll see people here after you’ve shared a cluster with
                  them.
                </Text>
              </View>
            </Card>
          ) : (
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 8 }}>
                People you’ve shared clusters with
              </Text>
              {people.map((person) => {
                const checked = selected.includes(person.user_id)
                return (
                  <Pressable
                    key={person.user_id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={person.display_name}
                    onPress={() => toggle(person.user_id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      backgroundColor: t.surface,
                      borderWidth: 1,
                      borderColor: checked ? t.primary : t.outlineVariant,
                      borderRadius: radii.md,
                      padding: 12,
                      marginBottom: 8,
                      minHeight: 56,
                    }}
                  >
                    <Avatar name={person.display_name} src={person.avatar_url} size={44} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                      {person.display_name}
                    </Text>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: checked ? t.primary : 'transparent',
                        borderWidth: checked ? 0 : 1,
                        borderColor: t.outlineVariant,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked ? <Check size={16} color={t.onPrimary} strokeWidth={2.5} /> : null}
                    </View>
                  </Pressable>
                )
              })}
              {people.length === 0 ? (
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                  No matches for “{search.trim()}”.
                </Text>
              ) : null}
            </View>
          )}

          <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
            {selected.length} selected
            {selected.length > 0 && selected.length < MIN_INVITEES ? ' · pick at least 2' : ''}
            {capped ? ` · up to ${MAX_INVITEES} people per cluster` : ''}
          </Text>
          <View style={{ marginTop: 16 }}>
            <PrimaryButton
              title="Continue"
              disabled={selected.length < MIN_INVITEES}
              quietDisabled
              onPress={() => setStep(2)}
            />
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Card>
            <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
              Cluster name
            </Text>
            <Text style={{ marginTop: 4, fontSize: 18, fontWeight: '600', color: t.onSurface }}>
              {trimmed}
            </Text>
          </Card>
          <Card>
            <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
              Invitations ({selectedPeople.length} {selectedPeople.length === 1 ? 'person' : 'people'})
            </Text>
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
              <Avatar
                name={profile.data?.display_name ?? 'You'}
                src={profile.data?.avatar_url ?? null}
                size={40}
              />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                You
              </Text>
              <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.primary }}>Creator</Text>
              </View>
            </View>
            {selectedPeople.map((person) => (
              <View key={person.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                <Avatar name={person.display_name} src={person.avatar_url} size={40} />
                <Text style={{ flex: 1, fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                  {person.display_name}
                </Text>
              </View>
            ))}
          </Card>
          <View style={{ marginTop: 16 }}>
            <PrimaryButton
              title="Send invitations"
              loadingTitle="Sending…"
              loading={create.isPending}
              onPress={() => setConfirmOpen(true)}
            />
          </View>
        </View>
      ) : null}
      <Modal open={confirmOpen} onClose={() => { if (!create.isPending) setConfirmOpen(false) }} title="Send invitations?">
        <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          {selectedPeople.length === 1
            ? `Invite ${selectedPeople[0]?.display_name ?? 'this member'} to “${trimmed}”? They’ll be notified right away.`
            : `Invite ${selectedPeople.length} people to “${trimmed}”? They’ll all be notified right away.`}
        </Text>
        {create.error ? (
          <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, color: t.error }}>
            {inviteErrorMessage(create.error, 'Could not send the invitations. Please try again.')}
          </Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Pressable
            onPress={() => setConfirmOpen(false)}
            disabled={create.isPending}
            hitSlop={8}
            style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: create.isPending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <PrimaryButton
            title="Send"
            loadingTitle="Sending…"
            loading={create.isPending}
            onPress={() => void send(trimmed)}
          />
        </View>
      </Modal>
    </Screen>
  )
}
