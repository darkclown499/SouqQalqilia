import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTLY_VIEWED_KEY = 'recently_viewed_ads_v1';

// ── Module-level ads cache ────────────────────────────────────────────────────
// Populated by preloadAds() called from _layout.tsx right after auth.
// Home screen reads this immediately → zero loading delay on first visit.
export interface AdsCache {
  data: Ad[];
  fetchedAt: number;
}
let _adsCache: AdsCache | null = null;
export const CACHE_TTL_MS = 90_000; // 90 seconds — exported for useAds AppState guard

export function getAdsCache(): AdsCache | null {
  if (!_adsCache) return null;
  if (Date.now() - _adsCache.fetchedAt > CACHE_TTL_MS) {
    _adsCache = null;
    return null;
  }
  return _adsCache;
}

export function setAdsCache(data: Ad[]): void {
  _adsCache = { data, fetchedAt: Date.now() };
}

// ── Cache invalidation listeners ─────────────────────────────────────────────
// Any component can subscribe to be notified when the cache is cleared
// (e.g. after a boost/edit), allowing instant feed refresh without polling.
type CacheListener = () => void;
const _cacheListeners = new Set<CacheListener>();

export function subscribeToCacheInvalidation(cb: CacheListener): () => void {
  _cacheListeners.add(cb);
  return () => _cacheListeners.delete(cb);
}

export function clearAdsCache(): void {
  _adsCache = null;
  // Notify all subscribers immediately
  _cacheListeners.forEach(cb => { try { cb(); } catch {} });
}

/**
 * Extract all image URLs from an ad array (up to `maxAds` ads × all images).
 * Returns a flat array of non-empty URL strings.
 */
function extractImageUrls(ads: Ad[], maxAds = 50): string[] {
  const urls: string[] = [];
  ads.slice(0, maxAds).forEach(ad => {
    const sorted = (ad.ad_images ?? []).sort((a, b) => a.position - b.position);
    sorted.forEach(img => { if (img.url) urls.push(img.url); });
  });
  return urls;
}

/**
 * Load recently-viewed ads from AsyncStorage and extract their image URLs.
 * Silently returns [] on any error so it never blocks the startup pipeline.
 */
async function loadRecentlyViewedUrls(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const recentAds: Ad[] = JSON.parse(raw);
    return extractImageUrls(recentAds, recentAds.length); // prefetch all recently-viewed
  } catch {
    return [];
  }
}

/**
 * Prefetch ALL product image URLs into expo-image memory+disk cache.
 *
 * Combines:
 *   • Up to 50 main-feed ad images (boosted/featured first)
 *   • Recently-viewed ad images from AsyncStorage (so the 'Last Viewed'
 *     horizontal strip also renders instantly without grey placeholders)
 *
 * Deduplicates the combined set before issuing a single native batch call.
 * Awaited by the splash pipeline so the screen hides AFTER assets are cached.
 */
async function prefetchAdImages(feedAds: Ad[], recentUrls: string[]): Promise<void> {
  const feedUrls = extractImageUrls(feedAds, 50); // expanded to 50

  // Merge + deduplicate: Set preserves insertion order, feed URLs first
  const combined = Array.from(new Set([...feedUrls, ...recentUrls]));
  if (combined.length === 0) return;

  try {
    // 'memory-disk': cache to both layers so AdCard renders from RAM during
    // fast scrolling without re-decoding from disk each time.
    await Image.prefetch(combined, 'memory-disk');
  } catch {
    // Partial failure is acceptable — images stream lazily on first view
  }
}

/** Preload first page of ads into cache — awaited during startup pipeline.
 *
 * Fetches up to 50 ads (boosted/featured first) and combines their image
 * URLs with recently-viewed ad images from AsyncStorage before issuing a
 * single, deduplicated Image.prefetch() call. The splash screen stays
 * visible until every asset hits the memory+disk cache.
 */
export async function preloadAds(): Promise<void> {
  // Kick off recently-viewed hydration in parallel with the API fetch
  // so neither waits for the other unnecessarily.
  const [{ data }, recentUrls] = await Promise.all([
    fetchAds({ limit: 50, offset: 0, sortBy: 'boosted' }),
    loadRecentlyViewedUrls(),
  ]);

  if (data.length > 0) {
    setAdsCache(data);
  }

  // Always prefetch even if cache was already warm (recently-viewed may differ)
  await prefetchAdImages(data, recentUrls);
}

export interface AdImage {
  id: string;
  ad_id: string;
  url: string;
  position: number;
  blurhash?: string | null;
}

export interface Ad {
  id: string;
  user_id: string;
  category_id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  phone_number: string;
  condition: 'new' | 'used';
  status: 'active' | 'sold' | 'deleted' | 'featured';
  views: number;
  created_at: string;
  updated_at: string;
  boosted_until?: string | null;
  serial_number?: number | null;
  categories?: { id: string; name: string; icon: string; color: string };
  ad_images?: AdImage[];
  user_profiles?: { username: string; email: string; phone?: string; avatar_url?: string | null };
}

export interface CreateAdInput {
  category_id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  phone_number: string;
  condition: 'new' | 'used';
}

/** Fetch latest active ads (with category + first image only), boosted ads first.
 *
 * Strategy for absolute boosted pinning:
 *   1. Fetch ALL currently-active boosted ads (no limit) — these always lead the list.
 *   2. Fetch regular (non-boosted) ads with pagination offset adjusted to exclude boosts.
 *   3. Merge: boosts first (sorted by furthest expiry), then regular ads.
 *
 * This guarantees boosted ads stay at the top regardless of how many new ads are posted.
 */
export async function fetchAds(params?: {
  categoryId?: string;
  userId?: string;
  search?: string;
  maxPrice?: number;
  minPrice?: number;
  condition?: 'new' | 'used' | null;
  location?: string;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'boosted';
  limit?: number;
  offset?: number;
}): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const sortBy = params?.sortBy ?? 'newest';
  const now = new Date().toISOString();

  // Shared select fragment
  const SELECT = `
    id, user_id, category_id, title, price, location, condition,
    status, views, created_at, boosted_until, serial_number,
    categories(id, name, name_ar, icon, color),
    ad_images(id, url, position, blurhash)
  `;

  // ── Helper: apply common filters to a query ───────────────────────────────
  function applyFilters(q: any) {
    if (params?.categoryId) q = q.eq('category_id', params.categoryId);
    if (params?.userId)     q = q.eq('user_id', params.userId);
    if (params?.search)     q = q.ilike('title', `%${params.search}%`);
    if (params?.maxPrice !== undefined && params.maxPrice >= 0) q = q.lte('price', params.maxPrice);
    if (params?.minPrice !== undefined && params.minPrice > 0)  q = q.gte('price', params.minPrice);
    if (params?.condition)  q = q.eq('condition', params.condition);
    if (params?.location) {
      const prefix = params.location === 'قلقيلية المدينة' ? 'قلقيلية' : params.location;
      q = q.ilike('location', `${prefix}%`);
    }
    return q;
  }

  // For price sorts we use the original single-query path (price order takes precedence)
  if (sortBy === 'price_asc' || sortBy === 'price_desc') {
    let query = supabase
      .from('ads')
      .select(SELECT)
      .in('status', ['active', 'featured']);
    query = applyFilters(query);
    query = query
      .order('status', { ascending: false })
      .order('price', { ascending: sortBy === 'price_asc' })
      .range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: data as Ad[], error: null };
  }

  // ── Two-query approach for default / boosted sort ────────────────────────
  //
  // QUERY A: All currently-active boosts (boosted_until > now).
  //          No pagination — we always show ALL active boosts at the top.
  let boostQuery = supabase
    .from('ads')
    .select(SELECT)
    .in('status', ['active', 'featured'])
    .gt('boosted_until', now);
  boostQuery = applyFilters(boostQuery);
  boostQuery = boostQuery.order('boosted_until', { ascending: false }); // furthest expiry first

  // QUERY B: Non-boosted ads (no active boost), paginated.
  //          offset is adjusted so page 2+ skips past the right number of regular ads.
  let regularQuery = supabase
    .from('ads')
    .select(SELECT)
    .in('status', ['active', 'featured'])
    .or(`boosted_until.is.null,boosted_until.lte.${now}`);
  regularQuery = applyFilters(regularQuery);
  regularQuery = regularQuery
    .order('status', { ascending: false })      // featured before active
    .order('created_at', { ascending: false })  // newest first within group
    .range(offset, offset + limit - 1);

  const [{ data: boosts, error: bErr }, { data: regulars, error: rErr }] =
    await Promise.all([boostQuery, regularQuery]);

  if (bErr && rErr) return { data: [], error: bErr.message };

  // Merge: boosts (already sorted by expiry) then regular ads
  const merged = [
    ...((boosts ?? []) as Ad[]),
    ...((regulars ?? []) as Ad[]),
  ];

  return { data: merged, error: rErr?.message ?? null };
}

/** Fetch a single ad by ID */
export async function fetchAdById(id: string): Promise<{ data: Ad | null; error: string | null }> {
  const supabase = getSupabaseClient();
  // Use .maybeSingle() — returns null (no error) when 0 rows, avoids PGRST116
  const { data, error } = await supabase
    .from('ads')
    .select(`
      *,
      categories(id, name, icon, color),
      ad_images(id, url, position, blurhash),
      user_profiles(username, email, phone, avatar_url)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  // Increment views atomically (fire-and-forget)
  supabase.rpc('increment_ad_views', { ad_id: id }).catch(() => {});
  return { data: data as Ad, error: null };
}

/** Fetch ads by current user */
export async function fetchMyAds(): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('ads')
    .select(`*, categories(id, name, icon, color), ad_images(id, url, position, blurhash)`)
    .eq('user_id', user.id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: data as Ad[], error: null };
}

/** Create a new ad */
export async function createAd(
  input: CreateAdInput
): Promise<{ data: Ad | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Ensure user_profiles row exists (trigger may have failed for some users)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    // Re-create missing profile so the FK constraint is satisfied
    await supabase.from('user_profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      username: user.user_metadata?.username ?? user.email?.split('@')[0] ?? '',
    }, { onConflict: 'id' });
  }

  const { data, error } = await supabase
    .from('ads')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  // Invalidate cache so the new ad appears in the home feed immediately
  clearAdsCache();
  return { data: data as Ad, error: null };
}

/** Save image URLs for an ad */
export async function saveAdImages(
  adId: string,
  urls: string[],
  blurhashes?: (string | null | undefined)[]
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const rows = urls.map((url, position) => ({
    ad_id: adId,
    url,
    position,
    blurhash: blurhashes?.[position] ?? null,
  }));
  const { error } = await supabase.from('ad_images').insert(rows);
  return { error: error ? error.message : null };
}

/** Mark ad as sold or deleted — also clears the ads cache so home screen refreshes */
export async function updateAdStatus(
  adId: string,
  status: 'active' | 'sold' | 'deleted' | 'featured',
  boostedUntil?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const updates: any = { status };
  if (boostedUntil !== undefined) updates.boosted_until = boostedUntil;
  const { error } = await supabase.from('ads').update(updates).eq('id', adId);
  if (!error) clearAdsCache(); // Force home screen to reload fresh data
  return { error: error ? error.message : null };
}

/** Update editable fields of an ad (owner only via RLS) */
export async function updateAd(
  adId: string,
  updates: Partial<Pick<Ad, 'title' | 'description' | 'price' | 'location' | 'category_id' | 'condition' | 'phone_number'>>
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('ads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', adId);
  if (!error) clearAdsCache();
  return { error: error ? error.message : null };
}

/** Report a listing */
export async function reportAd(
  adId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Ensure user_profiles row exists before inserting report (FK constraint)
  await supabase.from('user_profiles').upsert({
    id: user.id,
    email: user.email ?? '',
    username: user.user_metadata?.username ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
  }, { onConflict: 'id', ignoreDuplicates: true });

  // Upsert prevents duplicate-constraint errors if user tries to report twice
  const { error } = await supabase
    .from('reports')
    .upsert(
      { ad_id: adId, reporter_id: user.id, reason },
      { onConflict: 'ad_id,reporter_id', ignoreDuplicates: true }
    );
  return { error: error ? error.message : null };
}
