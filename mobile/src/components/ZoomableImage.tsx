import { useCallback } from 'react'
import { Image, Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native'
import { GestureViewer } from 'react-native-gesture-image-viewer'

export function ZoomableImage({
  uri,
  accessibilityLabel,
  open,
  onClose,
}: {
  uri: string
  accessibilityLabel?: string
  open: boolean
  onClose: () => void
}) {
  const renderItem = useCallback(
    (imageUrl: string) => (
      <Image
        source={{ uri: imageUrl }}
        accessibilityLabel={accessibilityLabel}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
    ),
    [accessibilityLabel],
  )

  return (
    <RNModal
      visible={open}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'black' }}>
        <GestureViewer
          data={[uri]}
          initialIndex={0}
          renderItem={renderItem}
          ListComponent={ScrollView}
          onDismiss={onClose}
        />
        <Pressable
          accessibilityLabel="Close viewer"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 48,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', color: 'white' }}>×</Text>
        </Pressable>
      </View>
    </RNModal>
  )
}
