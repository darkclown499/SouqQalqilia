import { getSupabaseClient } from '@/template';

export interface Category {
  id: string;
  name: string;
  name_ar: string;
  icon: string;
  slug: string;
  color: string;
}

export async function fetchCategories(): Promise<{ data: Category[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: data as Category[], error: null };
}

/** Returns the localized name for a category */
export function getCategoryName(category: Category, language: string): string {
  if (language === 'ar' && category.name_ar) return category.name_ar;
  return category.name;
}

/** Static fallback name map for known slugs */
export const CATEGORY_NAMES: Record<string, { en: string; ar: string }> = {
  'cars-vehicles':       { en: 'Cars & Vehicles',       ar: 'سيارات ومركبات' },
  'electronics':         { en: 'Electronics',           ar: 'إلكترونيات' },
  'fashion':             { en: 'Fashion',               ar: 'موضة' },
  'furniture':           { en: 'Furniture',             ar: 'أثاث' },
  'jobs':                { en: 'Jobs',                  ar: 'وظائف' },
  'real-estate':         { en: 'Real Estate',           ar: 'عقارات' },
  'sports':              { en: 'Sports',                ar: 'رياضة' },
  'games-entertainment': { en: 'Games & Entertainment', ar: 'ألعاب وترفيه' },
  'others':              { en: 'Others',                ar: 'أخرى' },
};
