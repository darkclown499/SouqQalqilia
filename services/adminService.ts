import { getSupabaseClient } from '@/template';
import { Ad } from './adsService';

export interface UserProfile {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  is_verified: boolean;
  avatar_url?: string | null;
  created_at?: string;
}

/** Check if current user is admin */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  return data?.is_admin === true;
}

/**
 * Admin fetch all ads with AbortSignal support
 */
/**
 * Admin fetch all ads with AbortSignal support + pagination
 */
export async function adminFetchAllAds(opts?: {
  signal?: AbortSignal;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  search?: string;
  sortBy?: 'newest' | 'price_desc' | 'price_asc' | 'views_desc';
  status?: 'active' | 'featured' | 'sold';
  categoryId?: string;
  noViewsOnly?: boolean;
}): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const limit = opts?.limit ?? 50;   // قيمة افتراضية
  const offset = opts?.offset ?? 0;

  try {
    let query = supabase
      .from('ads')
      .select(`
        *,
        categories(id, name, name_ar, icon, color),
        ad_images(id, url, position),
        user_profiles(username, email, phone)
      `);

    // ✅ مُصلَّح: "عرض المحذوفات" كان زر ميت لأن هاد الفلتر كان يستثنيها دايماً بلا شرط
    if (!opts?.includeDeleted) {
      query = query.neq('status', 'deleted');
    }

    // ✅ جديد: بحث حقيقي بقاعدة البيانات (العنوان + الوصف) بدل الاقتصار على الصفحة المحمّلة فقط
    if (opts?.search?.trim()) {
      const term = opts.search.trim();
      query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }

    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.categoryId) query = query.eq('category_id', opts.categoryId);
    if (opts?.noViewsOnly) query = query.or('views.is.null,views.eq.0');

    switch (opts?.sortBy) {
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'price_asc': query = query.order('price', { ascending: true }); break;
      case 'views_desc': query = query.order('views', { ascending: false }); break;
      default: query = query.order('serial_number', { ascending: false });
    }
    query = query.range(offset, offset + limit - 1);

    if (opts?.signal) {
      query = query.abortSignal(opts.signal);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: data as Ad[], error: null };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { data: [], error: 'aborted' };
    }
    return { data: [], error: err?.message || 'Failed to fetch ads' };
  }
}

/** إحصائيات سريعة لتبويب الإعلانات (إجمالي / نشط / مميز / معزز) */
export async function adminFetchAdsQuickStats(): Promise<{
  total: number; active: number; featured: number; boosted: number;
}> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const [totalRes, activeRes, featuredRes, boostedRes] = await Promise.all([
    supabase.from('ads').select('id', { count: 'exact', head: true }).neq('status', 'deleted'),
    supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'featured'),
    supabase.from('ads').select('id', { count: 'exact', head: true }).gt('boosted_until', nowIso),
  ]);
  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    featured: featuredRes.count ?? 0,
    boosted: boostedRes.count ?? 0,
  };
}

/** أرقام الإعلانات (ad_id) اللي عليها بلاغات معلّقة — لربط تبويب الإعلانات بتبويب البلاغات */
export async function adminFetchReportedAdIds(): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.from('reports').select('ad_id').eq('status', 'pending');
  return new Set((data ?? []).map((r: any) => r.ad_id).filter(Boolean));
}

/** Admin delete any ad */
export async function adminDeleteAd(adId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('ads').update({ status: 'deleted' }).eq('id', adId);
  return { error: error ? error.message : null };
}

/** Admin update full ad (title, description, price, location) */
export async function adminUpdateAd(adId: string, updates: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  condition?: 'new' | 'used';
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('ads').update(updates).eq('id', adId);
  return { error: error ? error.message : null };
}

/** Admin update ad title (legacy) */
export async function adminUpdateAdTitle(adId: string, title: string): Promise<{ error: string | null }> {
  return adminUpdateAd(adId, { title });
}

/** Admin set ad featured status */
export async function adminSetAdFeatured(adId: string, featured: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('ads')
    .update({ status: featured ? 'featured' : 'active' })
    .eq('id', adId);
  return { error: error ? error.message : null };
}

/** Admin boost an ad (appear at top for N days) */
export async function adminBoostAd(adId: string, boost: boolean, days = 7): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const boostedUntil = boost ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase
    .from('ads')
    .update({ boosted_until: boostedUntil })
    .eq('id', adId);
  return { error: error ? error.message : null };
}

/**
 * Admin fetch all users with AbortSignal support
 */
export async function adminFetchAllUsers(opts?: {
  signal?: AbortSignal;
  limit?: number;
  offset?: number;
  search?: string;
  role?: 'admin' | 'verified' | 'blocked';
  sortBy?: 'email' | 'newest' | 'oldest';
}): Promise<{ data: UserProfile[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  try {
    let query = supabase.from('user_profiles').select('*');

    // ✅ جديد: بحث حقيقي بقاعدة البيانات (اسم المستخدم + الإيميل + الهاتف) بدل الاقتصار على الصفحة المحمّلة
    if (opts?.search?.trim()) {
      const term = opts.search.trim();
      query = query.or(`username.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    if (opts?.role === 'admin') query = query.eq('is_admin', true);
    if (opts?.role === 'verified') query = query.eq('is_verified', true);
    if (opts?.role === 'blocked') query = query.eq('is_blocked', true);

    switch (opts?.sortBy) {
      case 'newest': query = query.order('created_at', { ascending: false }); break;
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      default: query = query.order('email', { ascending: true });
    }

    query = query.range(offset, offset + limit - 1);   // ← pagination

    if (opts?.signal) {
      query = query.abortSignal(opts.signal);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: data as UserProfile[], error: null };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { data: [], error: 'aborted' };
    }
    return { data: [], error: err?.message || 'Failed to fetch users' };
  }
}

/** إحصائيات سريعة لتبويب المستخدمين */
export async function adminFetchUsersQuickStats(): Promise<{ total: number; verified: number; blocked: number; admins: number }> {
  const supabase = getSupabaseClient();
  const [totalRes, verifiedRes, blockedRes, adminsRes] = await Promise.all([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_verified', true),
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_blocked', true),
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true),
  ]);
  return {
    total: totalRes.count ?? 0,
    verified: verifiedRes.count ?? 0,
    blocked: blockedRes.count ?? 0,
    admins: adminsRes.count ?? 0,
  };
}

/** آخر زيارة لكل مستخدم من مجموعة IDs محدّدة (من app_visits.user_id) */
export async function adminFetchLastSeen(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('app_visits')
    .select('user_id, visited_at')
    .in('user_id', userIds)
    .order('visited_at', { ascending: false });
  const result: Record<string, string> = {};
  (data ?? []).forEach((r: any) => {
    if (r.user_id && !result[r.user_id]) result[r.user_id] = r.visited_at;
  });
  return result;
}

/** عدد المفضلات لكل مستخدم من مجموعة IDs محدّدة */
export async function adminFetchUserFavoriteCounts(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const supabase = getSupabaseClient();
  const { data } = await supabase.from('favorites').select('user_id').in('user_id', userIds);
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  return counts;
}

/** عدد إعلانات كل مستخدم (لمجموعة IDs محدّدة — تُستخدم لعرض مستوى النشاط بجانب كل مستخدم) */
export async function adminFetchUserAdCounts(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const supabase = getSupabaseClient();
  const { data } = await supabase.from('ads').select('user_id').in('user_id', userIds).neq('status', 'deleted');
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  return counts;
}

/** Admin block/unblock user */
export async function adminSetUserBlocked(userId: string, blocked: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ is_blocked: blocked })
    .eq('id', userId);
  return { error: error ? error.message : null };
}

/** Admin grant/revoke admin */
export async function adminSetUserAdmin(userId: string, isAdmin: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ is_admin: isAdmin })
    .eq('id', userId);
  return { error: error ? error.message : null };
}

/** Grant admin by email */
export async function grantAdminByEmail(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ is_admin: true })
    .eq('email', email);
  return { error: error ? error.message : null };
}

/** Admin toggle verified seller badge */
export async function adminSetUserVerified(userId: string, verified: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ is_verified: verified })
    .eq('id', userId);
  return { error: error ? error.message : null };
}