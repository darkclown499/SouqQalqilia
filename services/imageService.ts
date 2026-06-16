import { getSupabaseClient } from '@/template';
import { STORAGE_BUCKET } from '@/constants/config';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image as ExpoImage } from 'expo-image';

// ── Compression constants ─────────────────────────────────────────────────────
// Max width for all uploaded images. Camera photos from modern phones can be
// 4000–8000px wide and 5–15 MB each. Resizing to 1024px at 75% JPEG quality
// keeps them under ~200 KB — a ~95% reduction that survives all network conditions
// and eliminates White-Screen / OOM crashes from large in-memory bitmaps.
const COMPRESS_WIDTH = 1080;
const COMPRESS_QUALITY = 0.78;
const COMPRESS_FALLBACK_QUALITY = 0.62; // used when resize fails (low-memory devices)

/**
 * Compress a raw image URI to ≤1024px wide, 75% JPEG quality.
 * Falls back to quality-only pass if resize fails.
 * Returns the compressed URI + base64, or throws if both passes fail.
 */
async function compressImage(
  uri: string,
  withBase64: boolean,
): Promise<{ uri: string; base64: string | undefined }> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: COMPRESS_WIDTH } }],
      { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG, base64: withBase64 },
    );
    return { uri: result.uri, base64: result.base64 };
  } catch {
    // Resize failed (e.g. very low-memory device) — try quality-only pass
    const fallback = await manipulateAsync(
      uri,
      [],
      { compress: COMPRESS_FALLBACK_QUALITY, format: SaveFormat.JPEG, base64: withBase64 },
    );
    return { uri: fallback.uri, base64: fallback.base64 };
  }
}

/**
 * Generate a blurhash string from an image URI.
 * Uses a 32px thumbnail for fast encoding — never blocks the upload pipeline.
 */
export async function generateBlurhash(uri: string): Promise<string | null> {
  try {
    const thumb = await manipulateAsync(
      uri,
      [{ resize: { width: 32 } }],
      { compress: 0.5, format: SaveFormat.JPEG, base64: false }
    );
    const hash = await (ExpoImage as any).generateBlurhashAsync?.(thumb.uri, [4, 3]);
    return hash ?? null;
  } catch {
    return null;
  }
}

/**
 * Pick up to `limit` images from the gallery in a single system-picker session.
 * Each image is compressed to ≤1024px / 75% JPEG before being returned.
 * Returns an array of { uri, base64 } objects (up to `limit` items).
 */
export async function pickMultipleImages(limit = 3): Promise<{ uri: string; base64: string }[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,        // always receive full-quality — we do our own compression
    base64: false,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });

  if (result.canceled || !result.assets?.length) return [];

  // Compress all selected assets sequentially (parallel would spike RAM)
  const processed: { uri: string; base64: string }[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    try {
      const compressed = await compressImage(asset.uri, true);
      processed.push({ uri: compressed.uri, base64: compressed.base64 ?? '' });
    } catch {
      // Both compression passes failed — include raw URI with empty base64.
      // uploadImage() will attempt a server-side re-compress via sourceUri.
      if (asset.uri) processed.push({ uri: asset.uri, base64: '' });
    }
  }
  return processed;
}

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
      const compressed = await compressImage(asset.uri, true);
      return { uri: compressed.uri, base64: compressed.base64 ?? '' };
    } catch {
      // Both passes failed — return raw URI; uploadImage() handles the fallback
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
    const compressed = await compressImage(asset.uri, true);
    return { uri: compressed.uri, base64: compressed.base64 ?? '' };
  } catch {
    // Both compression passes failed — return raw URI so the caller still gets
    // a result. uploadImage() will attempt a second compress via sourceUri.
    // Never return null here to avoid triggering a second permission dialog on Android.
    if (!asset.uri) return null;
    return { uri: asset.uri, base64: '' };
  }
}

/**
 * Upload a compressed image to Supabase Storage.
 *
 * Safety net: if `base64` is empty (compression failed in the picker),
 * and `sourceUri` is provided, this function attempts one final compression
 * pass before uploading — ensuring we NEVER send a raw full-resolution file.
 *
 * Always returns a permanent PUBLIC URL (not a signed URL) so expo-image
 * disk cache entries never expire.
 */
export async function uploadImage(
  base64: string,
  userId: string,
  fileName: string,
  /** Source URI — used as last-resort fallback when base64 is empty */
  sourceUri?: string,
): Promise<{ url: string | null; blurhash: string | null; error: string | null }> {
  const supabase = getSupabaseClient();

  // ── Compression safety net ─────────────────────────────────────────────────
  // If the picker failed to produce base64 (low-memory fallback), try once more.
  let effectiveBase64 = base64;
  if (!effectiveBase64 && sourceUri) {
    try {
      const recompressed = await compressImage(sourceUri, true);
      effectiveBase64 = recompressed.base64 ?? '';
    } catch {
      // Both compression passes failed — surface error instead of uploading
      // an uncontrolled raw file that could exceed Supabase's 1 MB row limit.
    }
  }

  if (!effectiveBase64) {
    return { url: null, blurhash: null, error: 'Image compression failed. Please try again.' };
  }

  const byteCharacters = atob(effectiveBase64);
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

  if (error) {
    // Clean up any partial object that was written before the error
    supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
    return { url: null, blurhash: null, error: error.message };
  }

  // getPublicUrl returns a permanent URL (no expiry) — safe for disk cache keys
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, blurhash: null, error: null };
}
