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

export async function fetchOfferCategories(): Promise<OfferCategory[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('offer_categories')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) {
      console.warn('fetchOfferCategories error:', error.message);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.warn('fetchOfferCategories exception:', err);
    return [];
  }
}
