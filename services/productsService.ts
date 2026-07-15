import { getSupabaseClient } from '@/template';

export interface StoreProduct {
  id: string;
  store_id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  price: number;
  image_url: string;
  category_label: string;
  category_label_ar: string;
  custom_category_id?: string | null;
  is_available: boolean;
  position: number;
  created_at: string;
}

export interface StoreWithRating {
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
  position: number;
  avg_rating: number;
  rating_count: number;
}

export async function fetchStoreProducts(
  storeId: string,
  includeUnavailable = false,
): Promise<{ data: StoreProduct[]; error: string | null }> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('store_products')
    .select('*')
    .eq('store_id', storeId)
    .order('position', { ascending: true });
  if (!includeUnavailable) {
    query = query.eq('is_available', true);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data as StoreProduct[], error: null };
}

export async function fetchStoreRating(storeId: string): Promise<{ avg: number; count: number }> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('store_ratings')
    .select('rating')
    .eq('store_id', storeId);
  if (!data || data.length === 0) return { avg: 0, count: 0 };
  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return { avg: Math.round((sum / data.length) * 10) / 10, count: data.length };
}

export async function submitStoreRating(storeId: string, userId: string, rating: number): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('store_ratings')
    .upsert({ store_id: storeId, user_id: userId, rating }, { onConflict: 'store_id,user_id' });
  return { error: error ? error.message : null };
}
