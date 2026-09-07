import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link, type Href } from 'expo-router'
import { radii, shadowSoft, spacing } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { BrandWordmark } from './BrandWordmark'
import { GoogleMark } from './GoogleMark'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  const t = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: spacing.containerMargin,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <BrandWordmark />
          <View
            style={{
              marginTop: spacing.gutter,
              backgroundColor: t.surfaceLowest,
              borderRadius: radii.xl,
              padding: spacing.containerMargin,
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>{title}</Text>
            {subtitle ? (
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  lineHeight: 20,
                  color: t.onSurfaceVariant,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
            <View style={{ marginTop: spacing.gutter }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const t = useTheme()
  return (
    <View style={{ marginBottom: spacing.gutter }}>
      <Text
        style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, marginBottom: 6 }}
      >
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        placeholderTextColor={t.onSurfaceVariant}
        style={{
          backgroundColor: t.surfaceContainer,
          borderWidth: 1,
          borderColor: t.outlineVariant,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 14,
          color: t.onSurface,
        }}
        {...props}
      />
    </View>
  )
}

export function PrimaryButton({
  title,
  loadingTitle,
  onPress,
  loading,
  disabled,
}: {
  title: string
  loadingTitle?: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}) {
  const t = useTheme()
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={{
        backgroundColor: t.primary,
        borderRadius: radii.pill,
        paddingHorizontal: 24,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: inactive ? 0.6 : 1,
      }}
    >
      <Text style={{ color: t.onPrimary, fontSize: 14, fontWeight: '600' }}>
        {loading ? (loadingTitle ?? 'Please wait…') : title}
      </Text>
    </Pressable>
  )
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string
  onPress: () => void
  disabled?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: t.onSurfaceVariant,
        borderRadius: radii.pill,
        paddingHorizontal: 24,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '600', color: t.onSurface }}>{title}</Text>
    </Pressable>
  )
}

export function GoogleButton({
  title = 'Continue with Google',
  onPress,
  loading,
  disabled,
}: {
  title?: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}) {
  const t = useTheme()
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={{
        flexDirection: 'row',
        gap: 8,
        borderWidth: 1,
        borderColor: t.outlineVariant,
        borderRadius: radii.pill,
        paddingHorizontal: 24,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: inactive ? 0.6 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={t.primary} />
      ) : (
        <GoogleMark size={20} />
      )}
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{title}</Text>
    </Pressable>
  )
}

export function OrDivider() {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.outlineVariant }} />
      <Text style={{ marginHorizontal: 8, fontSize: 12, color: t.onSurfaceVariant }}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.outlineVariant }} />
    </View>
  )
}

export function AuthLink({ href, children }: { href: Href; children: ReactNode }) {
  const t = useTheme()
  return (
    <Link href={href} style={{ color: t.primary, fontWeight: '600', fontSize: 14 }}>
      {children}
    </Link>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  const t = useTheme()
  if (!message) return null
  return <Text style={{ fontSize: 14, color: t.error, marginBottom: spacing.gutter }}>{message}</Text>
}

export function Screen({ children, avoiding }: { children: ReactNode; avoiding?: boolean }) {
  const t = useTheme()
  const body = (
    <ScrollView
      contentContainerStyle={{ padding: spacing.containerMargin, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      {avoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  )
}

export function Card({ children, plain }: { children: ReactNode; plain?: boolean }) {
  const t = useTheme()
  return (
    <View
      style={
        plain
          ? {
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: t.outlineVariant,
              borderRadius: radii.xl,
              padding: 20,
              marginBottom: 16,
            }
          : {
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.xl,
              padding: 20,
              marginBottom: 16,
              ...shadowSoft,
            }
      }
    >
      {children}
    </View>
  )
}

export function LoadingView({ label }: { label?: string }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ActivityIndicator size="small" color={t.primary} />
      <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{label ?? 'Loading…'}</Text>
    </View>
  )
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const t = useTheme()
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
          {value} of {max}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{pct}%</Text>
      </View>
      <View
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 4,
          backgroundColor: t.surfaceContainer,
        }}
      >
        <View
          style={{
            height: '100%',
            borderRadius: 4,
            backgroundColor: t.primary,
            width: `${pct}%`,
          }}
        />
      </View>
    </View>
  )
}

export function MutedCenter({ children }: { children: ReactNode }) {
  const t = useTheme()
  return (
    <Text style={{ textAlign: 'center', fontSize: 14, color: t.onSurfaceVariant }}>
      {children}
    </Text>
  )
}
