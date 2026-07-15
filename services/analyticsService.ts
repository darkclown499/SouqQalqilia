import { getSupabaseClient } from '@/template';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ── الحصول على معرّف الجهاز الموحد ──
function getDeviceId(): string {
  if (Platform.OS === 'web') {
    // للويب: نستخدم localStorage لتخزين معرف فريد
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('device_id', id);
    }
    return id;
  }
  // للأجهزة (Android/iOS)
  return Device.osBuildId ?? Device.modelName ?? Device.modelId ?? `native_${Date.now()}`;
}

// ── تسجيل حدث (مثل النقر على زر) ──
export async function trackEvent(eventName: string, metadata?: Record<string, any>): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('app_statistics').insert({
      event_name: eventName,
      metadata: metadata || {},
      user_id: user?.id || null,
      device_id: getDeviceId(),
      created_at: new Date().toISOString(),
    });
  } catch { /* non-critical, never block the user */ }
}

// ── تسجيل زيارة صفحة ──
// ✅ تم إضافة 'offers' إلى القائمة
export async function trackPageView(page: 'home' | 'stores' | 'ad' | 'store' | 'profile' | 'offers'): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('app_visits').insert({
      device_id: getDeviceId(),
      user_id: user?.id || null,
      page: page,
      visited_at: new Date().toISOString(),
    });
  } catch { /* non-critical, never block the user */ }
}

// ── جلب إحصائيات الصفحات (لصفحة الإدارة) ──
export interface PageStats {
  page: string;
  unique_24h: number;
  total_24h: number;
  unique_7d: number;
  total_7d: number;
  unique_30d: number;
  total_30d: number;
}

export async function fetchPageStats(page: string): Promise<PageStats | null> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [unique24h, total24h, unique7d, total7d, unique30d, total30d] = await Promise.all([
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).eq('page', page).gte('visited_at', dayAgo),
      supabase.from('app_visits').select('id', { count: 'exact', head: true }).eq('page', page).gte('visited_at', dayAgo),
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).eq('page', page).gte('visited_at', weekAgo),
      supabase.from('app_visits').select('id', { count: 'exact', head: true }).eq('page', page).gte('visited_at', weekAgo),
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).eq('page', page).gte('visited_at', monthAgo),
      supabase.from('app_visits').select('id', { count: 'exact', head: true }).eq('page', page).gte('visited_at', monthAgo),
    ]);

    const uniqueCount = (data: any[]) => new Set(data.map((r: any) => r.device_id)).size;

    return {
      page,
      unique_24h: uniqueCount(unique24h.data ?? []),
      total_24h: total24h.count ?? 0,
      unique_7d: uniqueCount(unique7d.data ?? []),
      total_7d: total7d.count ?? 0,
      unique_30d: uniqueCount(unique30d.data ?? []),
      total_30d: total30d.count ?? 0,
    };
  } catch { return null; }
}

// ── جلب إحصائيات جميع الصفحات ──
export async function fetchAllPageStats(): Promise<PageStats[]> {
  // ✅ تم إضافة 'offers' إلى قائمة الصفحات
  const pages = ['home', 'stores', 'ad', 'store', 'profile', 'offers'] as const;
  const results = await Promise.all(pages.map(p => fetchPageStats(p)));
  return results.filter((r): r is PageStats => r !== null);
}

// ── جلب الإحصائيات العامة (DAU, WAU, MAU) ──
export interface GeneralStats {
  dau: number;
  wau: number;
  mau: number;
  totalVisits: number;
  totalUsers: number;
  activeAds: number;
  activeStores: number;
  trend: { date: string; count: number }[];
}

export async function fetchGeneralStats(): Promise<GeneralStats | null> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [dauRes, wauRes, mauRes, totalVisitsRes, usersRes, activeAdsRes, activeStoresRes] = await Promise.all([
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).gte('visited_at', todayStart),
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).gte('visited_at', weekAgo),
      supabase.from('app_visits').select('device_id', { count: 'exact', head: false }).gte('visited_at', monthAgo),
      supabase.from('app_visits').select('id', { count: 'exact', head: true }),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    const uniqueSet = (rows: any[]) => new Set(rows.map((r: any) => r.device_id)).size;
    const dau = uniqueSet(dauRes.data ?? []);
    const wau = uniqueSet(wauRes.data ?? []);
    const mau = uniqueSet(mauRes.data ?? []);
    const totalVisits = totalVisitsRes.count ?? 0;
    const totalUsers = usersRes.count ?? 0;
    const activeAds = activeAdsRes.count ?? 0;
    const activeStores = activeStoresRes.count ?? 0;

    // ── Trend ──
    const trendMap: Record<string, Set<string>> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = new Set();
    }
    (wauRes.data ?? []).forEach((row: any) => {
      const day = row.visited_at ? String(row.visited_at).slice(0, 10) : null;
      if (day && trendMap[day]) trendMap[day].add(row.device_id);
    });
    const trend = Object.entries(trendMap).map(([date, set]) => ({ date, count: set.size }));

    return { dau, wau, mau, trend, totalVisits, totalUsers, activeAds, activeStores };
  } catch { return null; }
}