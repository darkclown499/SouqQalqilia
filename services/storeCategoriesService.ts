import { getSupabaseClient } from '@/template';

export interface StoreCategory {
  id: string;
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  image_url: string;
  slug: string;
  position: number;
  is_active: boolean;
  created_at: string;
}

// ── Module-level cache ────────────────────────────────────────────────────────
let _cache: StoreCategory[] | null = null;
let _fetchedAt = 0;
const CACHE_TTL = 10 * 60_000; // 10 minutes

export function getStoreCategoriesCache(): StoreCategory[] | null {
  if (!_cache) return null;
  if (Date.now() - _fetchedAt > CACHE_TTL) { _cache = null; return null; }
  return _cache;
}

export async function fetchStoreCategories(): Promise<{ data: StoreCategory[]; error: string | null }> {
  // Return cache if fresh
  const cached = getStoreCategoriesCache();
  if (cached) return { data: cached, error: null };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('store_categories')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) return { data: [], error: error.message };
  const result = (data ?? []) as StoreCategory[];
  _cache = result;
  _fetchedAt = Date.now();
  return { data: result, error: null };
}

/** Get display name for a store category */
export function getStoreCategoryName(cat: StoreCategory, language: string): string {
  if (language === 'ar' && cat.name_ar) return cat.name_ar;
  return cat.name;
}

/** Emoji map for common category slugs */
export function getStoreCategoryEmoji(slug: string): string {
  const map: Record<string, string> = {
    restaurants:   '🍽️',
    supermarkets:  '🛒',
    pharmacies:    '💊',
    sweets:        '🍰',
    bakeries:      '🥖',
    cafes:         '☕',
    burger:        '🍔',
    pizza:         '🍕',
    chicken:       '🍗',
    grills:        '🔥',
    falafel:       '🧆',
    juices:        '🍹',
    'electronics-s': '📱',
    'fashion-s':   '👗',
    'furniture-s': '🪑',
    beauty:        '💄',
  };
  return map[slug] ?? '';
}
