import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';

export type BannerPlacement = 'home' | 'stores_directory';

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
  position: number;
  placement: BannerPlacement;
  created_at: string;
}

export interface CreateBannerInput {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  placement: BannerPlacement;
}

// ── Module-level banners cache (keyed by placement) ───────────────────────────
type PlacementCache = Record<BannerPlacement, Banner[] | null>;
const _bannersCache: PlacementCache = { home: null, stores_directory: null };
const _bannersFetchedAt: Record<BannerPlacement, number> = { home: 0, stores_directory: 0 };
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export function getBannersCache(placement: BannerPlacement = 'home'): Banner[] | null {
  if (!_bannersCache[placement]) return null;
  if (Date.now() - _bannersFetchedAt[placement] > CACHE_TTL_MS) {
    _bannersCache[placement] = null;
    return null;
  }
  return _bannersCache[placement];
}

export function setBannersCache(data: Banner[], placement: BannerPlacement = 'home'): void {
  _bannersCache[placement] = data;
  _bannersFetchedAt[placement] = Date.now();
}

export function invalidateBannersCache(): void {
  _bannersCache.home = null;
  _bannersCache.stores_directory = null;
}

/** Preload banners into cache for a specific placement — call right after auth resolves */
export async function preloadBanners(): Promise<void> {
  // Preload both placements in parallel
  await Promise.all([
    (async () => {
      if (getBannersCache('home')) return;
      const { data } = await fetchActiveBanners('home');
      if (data.length > 0) {
        setBannersCache(data, 'home');
        data.forEach(b => {
          if (b.image_url) Image.prefetch(b.image_url, { cachePolicy: 'disk' }).catch(() => {});
        });
      }
    })(),
    (async () => {
      if (getBannersCache('stores_directory')) return;
      const { data } = await fetchActiveBanners('stores_directory');
      if (data.length > 0) {
        setBannersCache(data, 'stores_directory');
        data.forEach(b => {
          if (b.image_url) Image.prefetch(b.image_url, { cachePolicy: 'disk' }).catch(() => {});
        });
      }
    })(),
  ]);
}

/** Fetch active banners for a specific placement */
export async function fetchActiveBanners(
  placement: BannerPlacement = 'home',
  options?: { signal?: AbortSignal }
): Promise<{ data: Banner[]; error: string | null }> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .eq('placement', placement)
    .order('position', { ascending: true });
  if (options?.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data as Banner[], error: null };
}

/** Fetch ALL banners (admin use) — optionally filter by placement */
export async function fetchAllBanners(
  placement?: BannerPlacement
): Promise<{ data: Banner[]; error: string | null }> {
  const supabase = getSupabaseClient();
  let query = supabase.from('banners').select('*').order('position', { ascending: true });
  if (placement) query = query.eq('placement', placement);
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data as Banner[], error: null };
}

export async function createBanner(
  input: CreateBannerInput
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('banners')
    .select('position')
    .eq('placement', input.placement)
    .order('position', { ascending: false })
    .limit(1);
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { error } = await supabase.from('banners').insert({ ...input, position: nextPosition });
  invalidateBannersCache();
  return { error: error ? error.message : null };
}

export async function updateBanner(
  id: string,
  updates: Partial<Banner>
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').update(updates).eq('id', id);
  invalidateBannersCache();
  return { error: error ? error.message : null };
}

export async function deleteBanner(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').delete().eq('id', id);
  invalidateBannersCache();
  return { error: error ? error.message : null };
}

export async function toggleBannerActive(
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('banners').update({ is_active: isActive }).eq('id', id);
  invalidateBannersCache();
  return { error: error ? error.message : null };
}
