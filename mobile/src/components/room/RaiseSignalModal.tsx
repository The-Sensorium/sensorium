import { Pressable, Text, TextInput, View } from 'react-native'
import { Modal } from '../Modal'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { PrimaryButton } from '../ui'

const MAX_SIGNAL_PROMPT = 300

export function RaiseSignalModal({
  open,
  error,
  prompt,
  pending,
  onPromptChange,
  onClose,
  onRaise,
}: {
  open: boolean
  error: string | null
  prompt: string
  pending: boolean
  onPromptChange(value: string): void
  onClose(): void
  onRaise(): void
}) {
  const t = useTheme()
  return (
    <Modal open={open} onClose={onClose} title="Raise a signal">
      <View style={{ marginTop: 16, gap: 12 }}>
        <TextInput
          value={prompt}
          onChangeText={onPromptChange}
          maxLength={MAX_SIGNAL_PROMPT}
          multiline
          numberOfLines={4}
          autoFocus
          placeholder="What do you need help with?"
          placeholderTextColor={t.onSurfaceVariant}
          style={{
            backgroundColor: t.surfaceLowest,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 14,
            lineHeight: 22,
            minHeight: 104,
            textAlignVertical: 'top',
            color: t.onSurface,
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            {prompt.length}/{MAX_SIGNAL_PROMPT}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {error ? (
              <Text style={{ fontSize: 12, color: t.error }}>{error}</Text>
            ) : null}
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                Cancel
              </Text>
            </Pressable>
            <PrimaryButton
              title="Raise signal"
              loadingTitle="Raising…"
              loading={pending}
              onPress={onRaise}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}
