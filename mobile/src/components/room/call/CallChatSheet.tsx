import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { InCallChat } from './InCallChat'
import { radii } from '../../../lib/theme-tokens'
import { useTheme } from '../../../lib/use-theme'

/**
 * Bottom-sheet chat surface. Always mounted (hidden with `display: none`) so
 * `InCallChat`'s LiveKit `useChat` subscription survives closing the sheet —
 * on Android a `Modal` unmounts its children, which would drop the session
 * history and any messages received while the sheet was closed.
 */
export function CallChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme()
  return (
    <View
      pointerEvents={open ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        display: open ? 'flex' : 'none',
      }}
    >
      <Pressable
        accessibilityLabel="Close chat"
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          height: '60%',
          backgroundColor: t.surface,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
          padding: 16,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.onSurface }}>Messages</Text>
          <Pressable
            accessibilityLabel="Close chat"
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
        <InCallChat />
      </KeyboardAvoidingView>
    </View>
  )
}
