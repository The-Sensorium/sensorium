import type { ReactNode } from 'react'
import { Modal as RNModal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { PrimaryButton } from './ui'
/** Two-action confirmation as a bottom sheet (not a centered dialog): the
 * screen the decision depends on stays visible underneath. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  error,
  confirmTitle,
  confirmLoadingTitle,
  confirmIcon,
  cancelTitle = 'Cancel',
  loading,
  tone = 'primary',
  onConfirm,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  body?: string
  error?: string | null
  confirmTitle: string
  confirmLoadingTitle?: string
  confirmIcon?: ReactNode
  cancelTitle?: string
  loading?: boolean
  tone?: 'primary' | 'error'
  onConfirm: () => void
  children?: ReactNode
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
          accessibilityLabel={`Dismiss: ${title}`}
          onPress={onClose}
          disabled={loading}
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel={title}
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottom + 28,
            maxHeight: '90%',
          }}
        >
          <Pressable
            onPress={onClose}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${title}`}
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{ alignSelf: 'stretch', minHeight: 48, justifyContent: 'center', opacity: loading ? 0.6 : 1 }}
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
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
            {title}
          </Text>
          {body ? (
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
              {body}
            </Text>
          ) : null}
          {children}
          {error ? (
            <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, color: t.error }}>
              {error}
            </Text>
          ) : null}
          <View style={{ marginTop: 20 }}>
            <PrimaryButton
              title={confirmTitle}
              loadingTitle={confirmLoadingTitle}
              loading={loading}
              tone={tone}
              icon={confirmIcon}
              onPress={onConfirm}
            />
          </View>
          <Pressable
            onPress={onClose}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={cancelTitle}
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{ marginTop: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center', opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{cancelTitle}</Text>
          </Pressable>
        </View>
      </View>
    </RNModal>
  )
}
