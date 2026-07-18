import { getSupabaseClient } from '@/template';

// ─── Types ────────────────────────────────────────────────────────────────────
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
