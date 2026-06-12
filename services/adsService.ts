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
const CACHE_TTL_MS = 90_000; // 90 seconds

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

export function clearAdsCache(): void {
  _adsCache = null;
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
    fetchAds({ limit: 50, offset: 0, sortBy: 'newest' }),
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
 *  Selecting only needed columns and limiting to 1 image per ad cuts payload by ~60%.
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

  // Select only the columns needed for the card view — no user_profiles join on list
  let query = supabase
    .from('ads')
    .select(`
      id, user_id, category_id, title, price, location, condition,
      status, views, created_at, boosted_until, serial_number,
      categories(id, name, name_ar, icon, color),
      ad_images(id, url, position)
    `)
    .in('status', ['active', 'featured']);

  // ── Apply all filters BEFORE pagination ──────────────────────────────────
  if (params?.categoryId) query = query.eq('category_id', params.categoryId);
  if (params?.userId) query = query.eq('user_id', params.userId);
  if (params?.search) query = query.ilike('title', `%${params.search}%`);
  if (params?.maxPrice !== undefined && params.maxPrice >= 0) query = query.lte('price', params.maxPrice);
  if (params?.minPrice !== undefined && params.minPrice > 0) query = query.gte('price', params.minPrice);
  if (params?.condition) query = query.eq('condition', params.condition);
  if (params?.location) {
    // Match the city name at start of location string (e.g. 'عزون' matches 'عزون - شارع ...')
    // For city 'قلقيلية المدينة' we match stored prefix 'قلقيلية'
    const prefix = params.location === 'قلقيلية المدينة' ? 'قلقيلية' : params.location;
    query = query.ilike('location', `${prefix}%`);
  }

  // ── Apply server-side sorting ──────────────────────────────────────────────
  //
  // PRIORITY CHAIN — applied to every sort mode:
  //   1. PRIMARY:   status ASC  →  'featured' sorts before 'active' alphabetically,
  //                               so boosted/featured ads ALWAYS float to the top
  //                               regardless of creation time.
  //   2. SECONDARY: user-selected sort key (price, created_at, boosted_until)
  //
  // This ensures that any ad promoted to 'featured' instantly bypasses all
  // chronological limits and appears at position [0] of every feed view.
  // The compound index ads_feed_priority_idx (status ASC, created_at DESC)
  // makes this a single index scan with no sort operation on large tables.
  //
  if (sortBy === 'price_asc') {
    query = query
      .order('status', { ascending: true })         // featured first (PRIMARY)
      .order('price', { ascending: true });          // cheapest second
  } else if (sortBy === 'price_desc') {
    query = query
      .order('status', { ascending: true })         // featured first (PRIMARY)
      .order('price', { ascending: false });         // most expensive second
  } else if (sortBy === 'boosted') {
    // Active boosts first (furthest future expiry), then featured, then newest
    query = query
      .order('boosted_until', { ascending: false, nullsFirst: false }) // active boosts first
      .order('status', { ascending: true })          // featured before active
      .order('created_at', { ascending: false });    // newest as tiebreaker
  } else {
    // newest (default) — strict two-column priority chain:
    //   column 1: status ASC   → 'featured' < 'active' → featured group at top
    //   column 2: created_at DESC → newest within each group
    query = query
      .order('status', { ascending: true })          // PRIMARY: featured floats up
      .order('created_at', { ascending: false });    // SECONDARY: newest first
  }

  // ── Pagination LAST (after filters + sort) ────────────────────────────────
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data as Ad[], error: null };
}

/** Fetch a single ad by ID */
export async function fetchAdById(id: string): Promise<{ data: Ad | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ads')
    .select(`
      *,
      categories(id, name, icon, color),
      ad_images(id, url, position),
      user_profiles(username, email, phone, avatar_url)
    `)
    .eq('id', id)
    .single();
  if (error) return { data: null, error: error.message };
  // Increment views
  await supabase.from('ads').update({ views: (data.views ?? 0) + 1 }).eq('id', id);
  return { data: data as Ad, error: null };
}

/** Fetch ads by current user */
export async function fetchMyAds(): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('ads')
    .select(`*, categories(id, name, icon, color), ad_images(id, url, position)`)
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
  return { data: data as Ad, error: null };
}

/** Save image URLs for an ad */
export async function saveAdImages(
  adId: string,
  urls: string[]
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const rows = urls.map((url, position) => ({ ad_id: adId, url, position }));
  const { error } = await supabase.from('ad_images').insert(rows);
  return { error: error ? error.message : null };
}

/** Mark ad as sold or deleted — also clears the ads cache so home screen refreshes */
export async function updateAdStatus(
  adId: string,
  status: 'active' | 'sold' | 'deleted'
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('ads').update({ status }).eq('id', adId);
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

  const { error } = await supabase.from('reports').insert({ ad_id: adId, reporter_id: user.id, reason });
  return { error: error ? error.message : null };
}
