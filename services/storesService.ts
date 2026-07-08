import { getSupabaseClient } from '@/template';

export interface Store {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  logo_url: string;
  banner_url: string;
  phone: string;
  whatsapp: string;
  address: string;
  category_id: string;
  is_active: boolean;
  is_featured: boolean;
  opening_time: string;  // 'HH:MM' 24h format
  closing_time: string;  // 'HH:MM' 24h format
  position: number;
  created_at: string;
}

// ── Live status helper ────────────────────────────────────────────────────────
// Returns true if the current device time is between opening_time and closing_time.
// Handles overnight ranges (e.g. 22:00 – 02:00) correctly.
export function checkStoreIsOpen(store: Pick<Store, 'opening_time' | 'closing_time'>): boolean {
  const { opening_time, closing_time } = store;
  if (!opening_time || !closing_time) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const parse = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const open = parse(opening_time);
  const close = parse(closing_time);
  return open <= close ? (cur >= open && cur < close) : (cur >= open || cur < close);
}

// ── Fetch up to 15 featured stores (shuffled client-side) ───────────────────
export async function fetchFeaturedStores(): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('position', { ascending: true })
    .limit(15);
  if (error) return { data: [], error: error.message };
  // Fisher-Yates shuffle on the client
  const arr = (data ?? []) as Store[];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { data: arr, error: null };
}

export async function fetchStoresByCategory(categoryId: string): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .eq('is_approved', true)
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}

export async function adminFetchAllStores(): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*, categories(name, name_ar, icon, color)')
    .order('category_id', { ascending: true })
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}

export async function adminCreateStore(store: Omit<Store, 'id' | 'created_at'>): Promise<{ data: Store | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('stores').insert(store).select().single();
  if (error) return { data: null, error: error.message };
  return { data: data as Store, error: null };
}

export async function adminUpdateStore(id: string, updates: Partial<Store>): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('stores').update(updates).eq('id', id);
  return { error: error ? error.message : null };
}

export async function adminDeleteStore(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('stores').delete().eq('id', id);
  return { error: error ? error.message : null };
}

// ── Fetch ALL active + approved stores (for grouped feed) ─────────────────────
export async function fetchAllActiveStores(): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .eq('is_approved', true)
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}

// ── Batch-fetch all store ratings in one query ────────────────────────────────
export async function fetchAllStoreRatings(): Promise<Record<string, { avg: number; count: number }>> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('store_ratings')
    .select('store_id, rating');
  if (!data || data.length === 0) return {};
  const map: Record<string, { sum: number; count: number }> = {};
  for (const row of data) {
    if (!map[row.store_id]) map[row.store_id] = { sum: 0, count: 0 };
    map[row.store_id].sum += row.rating;
    map[row.store_id].count += 1;
  }
  const result: Record<string, { avg: number; count: number }> = {};
  for (const [id, { sum, count }] of Object.entries(map)) {
    result[id] = { avg: parseFloat((sum / count).toFixed(1)), count };
  }
  return result;
}
