import type { ReactNode } from 'react'
import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const t = useTheme()
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: t.surface, borderRadius: radii.xl, padding: 24, maxHeight: '85%' }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>{title}</Text>
            <Pressable
              accessibilityLabel="Close dialog"
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </View>
          <SafeAreaView>
            <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </RNModal>
  )
}
