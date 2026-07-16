import { getSupabaseClient } from '@/template';

export interface LocalCategory {
  id: string;
  store_id: string;
  name: string;
  name_ar: string;
  type?: string;
  color?: string;
  icon?: string | null;
  position: number;
  is_active?: boolean;
  created_at?: string;
}

/**
 * Fetch product categories for a specific store from local_categories table.
 */
export async function getLocalCategories(storeId: string): Promise<LocalCategory[]> {
  if (!storeId) return [];
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('local_categories')
      .select('*')
      .eq('store_id', storeId)
      .order('position', { ascending: true });
    if (error || !data) return [];
    return data as LocalCategory[];
  } catch {
    return [];
  }
}

/**
 * Insert a new local category for a store.
 */
export async function addLocalCategory(
  storeId: string,
  name: string,
  nameAr: string,
): Promise<{ data: LocalCategory | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('local_categories')
      .insert({
        store_id: storeId,
        name: name.trim(),
        name_ar: nameAr.trim(),
        type: 'category',
        color: '#6B7280',
        position: 0,
        is_active: true,
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as LocalCategory, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? 'Unknown error' };
  }
}

/**
 * Update an existing local category.
 */
export async function updateLocalCategory(
  id: string,
  name: string,
  nameAr: string,
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('local_categories')
      .update({ name: name.trim(), name_ar: nameAr.trim() })
      .eq('id', id);
    return { error: error ? error.message : null };
  } catch (e: any) {
    return { error: e?.message ?? 'Unknown error' };
  }
}

/**
 * Delete a local category by id.
 */
export async function deleteLocalCategory(id: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('local_categories')
      .delete()
      .eq('id', id);
    return { error: error ? error.message : null };
  } catch (e: any) {
    return { error: e?.message ?? 'Unknown error' };
  }
}
