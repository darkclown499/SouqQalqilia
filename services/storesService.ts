import { getSupabaseClient } from '@/template';

export interface Store {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  logo_url: string;
  phone: string;
  whatsapp: string;
  address: string;
  category_id: string;
  is_active: boolean;
  position: number;
  created_at: string;
}

export async function fetchStoresByCategory(categoryId: string): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
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
