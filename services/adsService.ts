import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTLY_VIEWED_KEY = 'recently_viewed_ads_v1';

// ── Module-level ads cache ────────────────────────────────────────────────────
export interface AdsCache {
  data: Ad[];
  fetchedAt: number;
}
let _adsCache: AdsCache | null = null;
export const CACHE_TTL_MS = 90_000; // 90 seconds

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
type CacheListener = () => void;
const _cacheListeners = new Set<CacheListener>();

export function subscribeToCacheInvalidation(cb: CacheListener): () => void {
  _cacheListeners.add(cb);
  return () => _cacheListeners.delete(cb);
}

export function clearAdsCache(): void {
  _adsCache = null;
  _cacheListeners.forEach(cb => { try { cb(); } catch {} });
}

function extractImageUrls(ads: Ad[], maxAds = 50): string[] {
  const urls: string[] = [];
  ads.slice(0, maxAds).forEach(ad => {
    const sorted = (ad.ad_images ?? []).sort((a, b) => a.position - b.position);
    sorted.forEach(img => { if (img.url) urls.push(img.url); });
  });
  return urls;
}

async function loadRecentlyViewedUrls(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const recentAds: Ad[] = JSON.parse(raw);
    return extractImageUrls(recentAds, recentAds.length);
  } catch {
    return [];
  }
}

async function prefetchAdImages(feedAds: Ad[], recentUrls: string[]): Promise<void> {
  const feedUrls = extractImageUrls(feedAds, 50);
  const combined = Array.from(new Set([...feedUrls, ...recentUrls]));
  if (combined.length === 0) return;
  try {
    await Image.prefetch(combined, 'memory-disk');
  } catch { /* partial failure acceptable */ }
}

export async function preloadAds(): Promise<void> {
  const [{ data }, recentUrls] = await Promise.all([
    fetchAds({ limit: 50, offset: 0, sortBy: 'boosted' }),
    loadRecentlyViewedUrls(),
  ]);
  if (data.length > 0) setAdsCache(data);
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
  ad_type?: 'product_ad' | 'product_request';
  views: number;
  created_at: string;
  updated_at: string;
  boosted_until?: string | null;
  serial_number?: number | null;
  categories?: { id: string; name: string; name_ar?: string; icon: string; color: string };
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

  const SELECT = `
    id, user_id, category_id, title, description, price, location, phone_number, condition,
    status, views, created_at, boosted_until, serial_number, ad_type,
    categories(id, name, name_ar, icon, color),
    ad_images(id, url, position, blurhash)
  `;

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

  let regularQuery = supabase
    .from('ads')
    .select(SELECT)
    .in('status', ['active', 'featured'])
    .or(`boosted_until.is.null,boosted_until.lte.${now}`);
  regularQuery = applyFilters(regularQuery);
  regularQuery = regularQuery
    .order('status', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (offset === 0) {
    let boostQuery = supabase
      .from('ads')
      .select(SELECT)
      .in('status', ['active', 'featured'])
      .gt('boosted_until', now);
    boostQuery = applyFilters(boostQuery);
    boostQuery = boostQuery.order('boosted_until', { ascending: false });

    const [{ data: boosts, error: bErr }, { data: regulars, error: rErr }] =
      await Promise.all([boostQuery, regularQuery]);

    if (bErr && rErr) return { data: [], error: bErr.message };

    const boostIds = new Set((boosts ?? []).map((b: any) => b.id));
    const merged = [
      ...((boosts ?? []) as Ad[]),
      ...((regulars ?? []) as Ad[]).filter(r => !boostIds.has(r.id)),
    ];
    return { data: merged, error: rErr?.message ?? null };
  }

  const { data: regulars, error: rErr } = await regularQuery;
  if (rErr) return { data: [], error: rErr.message };
  return { data: (regulars ?? []) as Ad[], error: null };
}

/** Fetch ALL active ads (used by admin panel) */
export async function fetchAllActiveAds(): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ads')
    .select(`
      id, user_id, category_id, title, description, price, location, phone_number, condition,
      status, views, created_at, boosted_until, serial_number, ad_type,
      categories(id, name, name_ar, icon, color),
      ad_images(id, url, position, blurhash)
    `)
    .in('status', ['active', 'featured'])
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: data as Ad[], error: null };
}

export async function fetchAdById(id: string): Promise<{ data: Ad | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ads')
    .select(`
      *,
      categories(id, name, name_ar, icon, color),
      ad_images(id, url, position, blurhash),
      user_profiles(username, email, phone, avatar_url)
    `)
    .eq('id', id)
    .single();
  if (error) return { data: null, error: error.message };
  Promise.resolve(supabase.rpc('increment_ad_views', { ad_id: id })).catch(() => {});
  return { data: data as Ad, error: null };
}

export async function fetchMyAds(): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('ads')
    .select(`*, categories(id, name, name_ar, icon, color), ad_images(id, url, position, blurhash)`)
    .eq('user_id', user.id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: data as Ad[], error: null };
}

export async function createAd(
  input: CreateAdInput
): Promise<{ data: Ad | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
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
  clearAdsCache();
  return { data: data as Ad, error: null };
}

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

export async function updateAdStatus(
  adId: string,
  status: 'active' | 'sold' | 'deleted' | 'featured',
  boostedUntil?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const updates: any = { status };
  if (boostedUntil !== undefined) updates.boosted_until = boostedUntil;
  const { error } = await supabase.from('ads').update(updates).eq('id', adId);
  if (!error) clearAdsCache();
  return { error: error ? error.message : null };
}

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

export async function reportAd(
  adId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  await supabase.from('user_profiles').upsert({
    id: user.id,
    email: user.email ?? '',
    username: user.user_metadata?.username ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
  }, { onConflict: 'id', ignoreDuplicates: true });

  const { error } = await supabase
    .from('reports')
    .upsert(
      { ad_id: adId, reporter_id: user.id, reason },
      { onConflict: 'ad_id,reporter_id', ignoreDuplicates: true }
    );
  return { error: error ? error.message : null };
}
