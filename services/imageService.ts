import { getSupabaseClient } from '@/template';
import { STORAGE_BUCKET } from '@/constants/config';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export async function pickImage(source: 'camera' | 'gallery' = 'gallery'): Promise<{ uri: string; base64: string } | null> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return null;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1080 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return { uri: manipulated.uri, base64: manipulated.base64 ?? '' };
    } catch {
      return { uri: asset.uri, base64: '' };
    }
  }

  // Gallery
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],     // images only — never video; avoids READ_MEDIA_VIDEO
    quality: 1,
    base64: false,
    allowsEditing: true,
    aspect: [4, 3],
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return { uri: manipulated.uri, base64: manipulated.base64 ?? '' };
  } catch {
    // Fallback: return the raw asset URI — no second picker call to avoid
    // triggering a second READ_MEDIA_IMAGES permission request on Android
    if (!asset.uri) return null;
    return { uri: asset.uri, base64: '' };
  }
}

export async function uploadImage(
  base64: string,
  userId: string,
  fileName: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = getSupabaseClient();

  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  // Always use unique filename to bust CDN cache for avatar updates
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `${userId}/${uniqueSuffix}_${fileName}.jpg`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, byteArray, { contentType: 'image/jpeg', upsert: false });

  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}