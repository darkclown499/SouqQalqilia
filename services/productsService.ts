import { getSupabaseClient } from '@/template';

// ─── Types ────────────────────────────────────────────────────────────────────
// ─── StoreProduct is an alias for Product (used in store detail screen) ─────
export type StoreProduct = {
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
  is_available: boolean;
  position: number;
  created_at: string;
  custom_category_id?: string | null;
};

export type Product = {
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
  is_available: boolean;
  position: number;
  created_at: string;
  custom_category_id?: string | null;
};

export type Store = {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  logo_url: string;
  banner_url: string;
  phone: string;
  whatsapp: string;
  address: string;
  is_active: boolean;
  is_featured: boolean;
  is_approved: boolean;
  opening_time: string;
  closing_time: string;
  rating: number;
  store_category_id?: string | null;
  created_at: string;
};

// ─── Fetch products by category (paginated) ───────────────────────────────────
export async function fetchProductsPaginated(
  categoryId: string,
  page: number = 1,
  limit: number = 20
): Promise<Product[]> {
  const supabase = getSupabaseClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('custom_category_id', categoryId)
    .eq('is_available', true)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

// ─── Fetch stores by store_category_id (paginated) ────────────────────────────
export async function fetchStoresPaginated(
  storeCategoryId: string,
  page: number = 1,
  limit: number = 20
): Promise<Store[]> {
  const supabase = getSupabaseClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('store_category_id', storeCategoryId)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('position', { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

// ─── Fetch all products for a store ───────────────────────────────────────────
export async function fetchProductsByStore(storeId: string): Promise<Product[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .order('position', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─── Fetch all products for a store (alias for backward compat) ─────────────
export async function fetchStoreProducts(storeId: string): Promise<{ data: StoreProduct[] }> {
  try {
    const data = await fetchProductsByStore(storeId);
    return { data: data as StoreProduct[] };
  } catch {
    return { data: [] };
  }
}

// ─── Fetch store rating ───────────────────────────────────────────────────────
export async function fetchStoreRating(storeId: string): Promise<{ avg: number; count: number }> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('store_ratings')
      .select('rating')
      .eq('store_id', storeId);
    if (error || !data || data.length === 0) return { avg: 0, count: 0 };
    const sum = data.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    return { avg: parseFloat((sum / data.length).toFixed(1)), count: data.length };
  } catch {
    return { avg: 0, count: 0 };
  }
}

// ─── Fetch single product by id ───────────────────────────────────────────────
export async function fetchProductById(id: string): Promise<Product | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
