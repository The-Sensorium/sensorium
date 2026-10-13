import * as ImagePicker from 'expo-image-picker'

export interface PickedAvatar {
  uri: string
  mime: string
  width: number
  height: number
  fileSize?: number | null
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedAvatar {
  return {
    uri: asset.uri,
    mime: asset.mimeType ?? 'image/jpeg',
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fileSize: asset.fileSize ?? null,
  }
}

export async function pickAvatarFromLibrary(): Promise<PickedAvatar | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    throw new Error('Photo access was denied. Enable it in Settings to add a photo.')
  }
  const result = await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS })
  if (result.canceled || result.assets.length === 0) return null
  return toPicked(result.assets[0])
}

export async function takeAvatarPhoto(): Promise<PickedAvatar | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    throw new Error('Camera access was denied. Enable it in Settings to take a photo.')
  }
  const result = await ImagePicker.launchCameraAsync({ ...PICKER_OPTIONS })
  if (result.canceled || result.assets.length === 0) return null
  return toPicked(result.assets[0])
}
