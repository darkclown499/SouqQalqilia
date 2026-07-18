import { getSupabaseClient } from '@/template';

export interface OfferCategory {
  id: string;
  name: string;
  name_ar: string;
  icon?: string | null;
  color?: string | null;
  slug: string;
  position?: number;
  is_active?: boolean;
  created_at?: string;
}

// Legacy export
export async function fetchOfferCategories(): Promise<OfferCategory[]> {
  return offerCategoriesService.fetchActive().then(r => r.data);
}

// Full service object
export const offerCategoriesService = {
  async fetchActive(): Promise<{ data: OfferCategory[]; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('offer_categories')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true });
      if (error) return { data: [], error: error.message };
      return { data: (data ?? []) as OfferCategory[], error: null };
    } catch (e: any) {
      return { data: [], error: e?.message ?? 'Unknown error' };
    }
  },

  async fetchAll(): Promise<{ data: OfferCategory[]; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('offer_categories')
        .select('*')
        .order('position', { ascending: true });
      if (error) return { data: [], error: error.message };
      return { data: (data ?? []) as OfferCategory[], error: null };
    } catch (e: any) {
      return { data: [], error: e?.message ?? 'Unknown error' };
    }
  },

  async create(input: { name: string; name_ar: string; slug: string; icon?: string; color?: string; position?: number }): Promise<{ error: string | null }> {
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('offer_categories')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0;
    const { error } = await supabase.from('offer_categories').insert({
      ...input,
      position: input.position ?? nextPos,
      is_active: true,
    });
    return { error: error ? error.message : null };
  },

  async update(id: string, updates: Partial<OfferCategory>): Promise<{ error: string | null }> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('offer_categories').update(updates).eq('id', id);
    return { error: error ? error.message : null };
  },

  async delete(id: string): Promise<{ error: string | null }> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('offer_categories').delete().eq('id', id);
    return { error: error ? error.message : null };
  },

  async toggle(id: string, isActive: boolean): Promise<{ error: string | null }> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('offer_categories').update({ is_active: isActive }).eq('id', id);
    return { error: error ? error.message : null };
  },
};
