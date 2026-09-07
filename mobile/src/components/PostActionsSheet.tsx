import { Modal as RNModal, Pressable, Text, View } from 'react-native'
import { Flag, Pencil, Trash2 } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function PostActionsSheet({
  open,
  mine,
  onClose,
  onEdit,
  onDelete,
  onReport,
}: {
  open: boolean
  mine: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
}) {
  const t = useTheme()
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 8,
            paddingTop: 8,
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.outlineVariant,
              marginBottom: 8,
            }}
          />
          {mine ? (
            <>
              <SheetRow label="Edit" onPress={onEdit}>
                <Pencil size={18} color={t.onSurface} strokeWidth={1.5} />
              </SheetRow>
              <SheetRow label="Delete" danger onPress={onDelete}>
                <Trash2 size={18} color={t.error} strokeWidth={1.5} />
              </SheetRow>
            </>
          ) : (
            <SheetRow label="Report" danger onPress={onReport}>
              <Flag size={18} color={t.error} strokeWidth={1.5} />
            </SheetRow>
          )}
          <Pressable
            onPress={onClose}
            style={{ marginTop: 8, backgroundColor: t.surfaceContainer, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </RNModal>
  )
}

function SheetRow({
  label,
  danger,
  onPress,
  children,
}: {
  label: string
  danger?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
    >
      {children}
      <Text style={{ fontSize: 15, color: danger ? t.error : t.onSurface }}>{label}</Text>
    </Pressable>
  )
}
