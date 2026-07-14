import { getSupabaseClient } from '@/template';

export interface LocalCategory {
  id: string;
  store_id: string;
  name: string;
  name_ar: string;
  position: number;
  created_at?: string;
}

/**
 * Fetch product categories for a specific store.
 * Falls back to an empty array if the table doesn't exist or the query fails.
 */
export async function getLocalCategories(storeId: string): Promise<LocalCategory[]> {
  if (!storeId) return [];

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('store_product_categories')
      .select('*')
      .eq('store_id', storeId)
      .order('position', { ascending: true });

    if (error || !data) return [];
    return data as LocalCategory[];
  } catch {
    return [];
  }
}
