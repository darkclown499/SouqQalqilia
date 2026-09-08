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
      `)
      .neq('status', 'deleted')
      .order('serial_number', { ascending: false })
      .range(offset, offset + limit - 1);   // ← إضافة pagination

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
}): Promise<{ data: UserProfile[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  try {
    let query = supabase
      .from('user_profiles')
      .select('*')
      .order('email', { ascending: true })
      .range(offset, offset + limit - 1);   // ← pagination

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