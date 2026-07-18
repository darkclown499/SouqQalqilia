import { getSupabaseClient } from '@/template';
import { Image } from 'expo-image';
import { Linking } from 'react-native';

// ── Placement types ──────────────────────────────────────────────────────────
export type BannerPlacement = 'home' | 'stores' | 'offers';

// link_type values:
// 'none'           → غير قابل للنقر
// 'external'       → رابط خارجي (http/https)
// 'whatsapp'       → رقم واتساب (link_target = رقم الهاتف)
// 'instagram'      → رابط إنستغرام
// 'snapchat'       → رابط سناب شات
// 'internal_ad'    → إعلان داخلي (link_target = ad id)
// 'internal_store' → متجر داخلي (link_target = store id)
export type BannerLinkType =
  | 'none'
  | 'external'
  | 'whatsapp'
  | 'instagram'
  | 'snapchat'
  | 'internal_ad'
  | 'internal_store';

// card_size: 'small' | 'medium' | 'large' | 'full'
export type BannerCardSize = 'small' | 'medium' | 'large' | 'full';

// card_position (for offers page): 'top' | 'middle' | 'bottom'
export type BannerCardPosition = 'top' | 'middle' | 'bottom';

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;          // legacy – kept for backwards compat
  is_active: boolean;
  position: number;
  placement: BannerPlacement;
  created_at: string;
  updated_at?: string;
  start_date?: string | null;
  end_date?: string | null;

  // ── New fields ──
  link_type: BannerLinkType;
  link_target: string;       // URL, phone, ad id or store id
  is_clickable: boolean;
  is_vip: boolean;
  show_text: boolean;        // whether to show title/subtitle overlay
  card_size: BannerCardSize;
  card_position: BannerCardPosition;
}

export interface CreateBannerInput {
  title?: string;
  subtitle?: string;
  image_url: string;
  link_url?: string;
  placement: BannerPlacement;
  link_type?: BannerLinkType;
  link_target?: string;
  is_clickable?: boolean;
  is_vip?: boolean;
  show_text?: boolean;
  card_size?: BannerCardSize;
  card_position?: BannerCardPosition;
}

// ── Module-level banners cache (keyed by placement) ───────────────────────────
type PlacementCache = Record<BannerPlacement, Banner[] | null>;
const _bannersCache: PlacementCache = { home: null, stores: null, offers: null };
const _bannersFetchedAt: Record<BannerPlacement, number> = { home: 0, stores: 0, offers: 0 };
const CACHE_TTL_MS = 5 * 60_000;

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

export function invalidateBannersCache(placement?: BannerPlacement): void {
  if (placement) {
    _bannersCache[placement] = null;
  } else {
    _bannersCache.home = null;
    _bannersCache.stores = null;
    _bannersCache.offers = null;
  }
}

/** Preload banners into cache for all placements */
export async function preloadBanners(): Promise<void> {
  await Promise.all(
    (['home', 'stores', 'offers'] as BannerPlacement[]).map(async (placement) => {
      if (getBannersCache(placement)) return;
      const { data } = await fetchActiveBanners(placement);
      if (data.length > 0) {
        setBannersCache(data, placement);
        data.forEach(b => {
          if (b.image_url) Image.prefetch(b.image_url, { cachePolicy: 'disk' }).catch(() => {});
        });
      }
    })
  );
}

/** Fetch active banners for a specific placement */
export async function fetchActiveBanners(
  placement: BannerPlacement = 'home',
  options?: { signal?: AbortSignal }
): Promise<{ data: Banner[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  let query = supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .eq('placement', placement)
    .order('position', { ascending: true });
  if (options?.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  // Filter by date range if set
  const filtered = (data as Banner[]).filter(b => {
    if (b.start_date && b.start_date > now) return false;
    if (b.end_date && b.end_date < now) return false;
    return true;
  });
  return { data: filtered, error: null };
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
  const payload = {
    title: input.title ?? '',
    subtitle: input.subtitle ?? '',
    image_url: input.image_url,
    link_url: input.link_url ?? '',
    placement: input.placement,
    position: nextPosition,
    link_type: input.link_type ?? 'none',
    link_target: input.link_target ?? '',
    is_clickable: input.is_clickable ?? false,
    is_vip: input.is_vip ?? false,
    show_text: input.show_text ?? true,
    card_size: input.card_size ?? 'medium',
    card_position: input.card_position ?? 'middle',
  };
  const { error } = await supabase.from('banners').insert(payload);
  invalidateBannersCache(input.placement);
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

// ── Banner click handler ──────────────────────────────────────────────────────
// Returns a function to call when a banner is pressed, or null if not clickable
export function getBannerPressHandler(
  banner: Banner,
  router: any
): (() => void) | null {
  if (!banner.is_clickable || banner.link_type === 'none') return null;

  return () => {
    const target = banner.link_target?.trim() || banner.link_url?.trim() || '';

    switch (banner.link_type) {
      case 'internal_ad':
        if (target) router.push(`/ad/${target}`);
        break;

      case 'internal_store':
        if (target) router.push(`/store/${target}`);
        break;

      case 'whatsapp': {
        const phone = target.replace(/\D/g, '');
        if (phone) {
          const waUrl = `https://wa.me/${phone}`;
          Linking.openURL(`whatsapp://send?phone=${phone}`)
            .catch(() => Linking.openURL(waUrl).catch(() => {}));
        }
        break;
      }

      case 'instagram': {
        const instaUrl = target.startsWith('http') ? target : `https://www.instagram.com/${target.replace('@', '')}`;
        Linking.openURL(`instagram://user?username=${target.replace('@', '')}`)
          .catch(() => Linking.openURL(instaUrl).catch(() => {}));
        break;
      }

      case 'snapchat': {
        const snapUrl = target.startsWith('http') ? target : `https://www.snapchat.com/add/${target.replace('@', '')}`;
        Linking.openURL(`snapchat://add/${target.replace('@', '')}`)
          .catch(() => Linking.openURL(snapUrl).catch(() => {}));
        break;
      }

      case 'external':
      default: {
        if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
          Linking.openURL(target).catch(() => {});
        }
        break;
      }
    }
  };
}
