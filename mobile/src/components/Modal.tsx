import type { ReactNode } from 'react'
import { Modal as RNModal, Pressable, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function Modal({
  open,
  onClose,
  onShow,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  onShow?: () => void
  title: string
  children: ReactNode
}) {
  const t = useTheme()
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose} onShow={onShow}>
      {/* Backdrop and content are siblings: the backdrop Pressable closes on
          out-of-dialog taps only, while content taps never reach it. A nested
          Pressable would bubble content taps up to the backdrop close. */}
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View
          style={{ backgroundColor: t.surface, borderRadius: radii.xl, padding: 24, maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center' }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">{title}</Text>
            <Pressable
              accessibilityLabel="Close dialog"
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={8}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </View>
          <SafeAreaView>
            {/* Keyboard-aware scroll view from react-native-keyboard-controller:
                scrolls the focused field above the keyboard on both platforms
                via native contentInset (no layout thrash, no manual offsets). */}
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={16}>
              {children}
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </View>
    </RNModal>
  )
}
