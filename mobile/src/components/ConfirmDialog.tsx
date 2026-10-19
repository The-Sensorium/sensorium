import type { ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, Text, View } from 'react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { lightHaptic } from '../lib/haptics'

/** Centered confirmation dialog with stacked full-width actions, mirroring the
 * native camera delete prompt: title, body, then confirm above cancel. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  error,
  confirmTitle,
  confirmLoadingTitle,
  cancelTitle = 'Cancel',
  loading,
  disabled,
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
  cancelTitle?: string
  loading?: boolean
  disabled?: boolean
  tone?: 'primary' | 'error'
  onConfirm: () => void
  children?: ReactNode
}) {
  const t = useTheme()
  const inactive = Boolean(loading || disabled)
  const confirmColor = tone === 'error' ? t.destructive : t.primary
  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
        <Pressable
          accessibilityLabel={`Dismiss: ${title}`}
          onPress={onClose}
          disabled={inactive}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%' }}
        >
          <View
            accessibilityLabel={title}
            style={{
              backgroundColor: t.surfaceLowest,
              borderRadius: radii.xl,
              padding: 20,
              width: '100%',
              maxWidth: 400,
              alignSelf: 'center',
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface, textAlign: 'center' }}
            >
              {title}
            </Text>
            {body ? (
              <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant, textAlign: 'center' }}>
                {body}
              </Text>
            ) : null}
            {children ? <View style={{ marginTop: 16 }}>{children}</View> : null}
            {error ? (
              <Text
                accessibilityRole="alert"
                style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.error, textAlign: 'center' }}
              >
                {error}
              </Text>
            ) : null}
            <View style={{ marginTop: 24, gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmTitle}
                accessibilityState={{ disabled: inactive, busy: loading ?? false }}
                onPress={() => {
                  lightHaptic()
                  onConfirm()
                }}
                disabled={inactive}
                style={{
                  minHeight: 52,
                  borderRadius: radii.lg,
                  backgroundColor: t.surfaceHigh,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: inactive ? 0.6 : 1,
                }}
              >
                {loading ? <ActivityIndicator size="small" color={confirmColor} /> : null}
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: confirmColor }}>
                  {loading ? (confirmLoadingTitle ?? 'Please wait…') : confirmTitle}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cancelTitle}
                onPress={onClose}
                disabled={loading}
                style={{
                  minHeight: 52,
                  borderRadius: radii.lg,
                  backgroundColor: t.surfaceHigh,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>
                  {cancelTitle}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  )
}
