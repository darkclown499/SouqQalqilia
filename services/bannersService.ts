import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';

// ── Module-level banners cache ────────────────────────────────────────────────
let _bannersCache: Banner[] | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let _bannersFetchedAt = 0;

export function getBannersCache(): Banner[] | null {
  if (!_bannersCache) return null;
  if (Date.now() - _bannersFetchedAt > CACHE_TTL_MS) {
    _bannersCache = null;
    return null;
  }
  return _bannersCache;
}

export function setBannersCache(data: Banner[]): void {
  _bannersCache = data;
  _bannersFetchedAt = Date.now();
}

/** Preload banners into cache — call right after auth resolves */
export async function preloadBanners(): Promise<void> {
  if (getBannersCache()) return;
  const { data } = await fetchActiveBanners();
  if (data.length > 0) {
    setBannersCache(data);
    // Prefetch banner images into expo-image disk cache for instant display
    data.forEach(b => {
      if (b.image_url) {
        Image.prefetch(b.image_url, { cachePolicy: 'disk' }).catch(() => {});
      }
    });
  }
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
  position: number;
  created_at: string;
}

export interface CreateBannerInput {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
}

export async function fetchActiveBanners(): Promise<{ data: Banner[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Banner[], error: null };
}

export async function fetchAllBanners(): Promise<{ data: Banner[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Banner[], error: null };
}

export async function createBanner(input: CreateBannerInput): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase.from('banners').select('position').order('position', { ascending: false }).limit(1);
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { error } = await supabase.from('banners').insert({ ...input, position: nextPosition });
  return { error: error ? error.message : null };
}

export async function updateBanner(id: string, updates: Partial<Banner>): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').update(updates).eq('id', id);
  return { error: error ? error.message : null };
}

export async function deleteBanner(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').delete().eq('id', id);
  return { error: error ? error.message : null };
}

export async function toggleBannerActive(id: string, isActive: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').update({ is_active: isActive }).eq('id', id);
  return { error: error ? error.message : null };
}
