import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAlert, getSupabaseClient } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import {
  adminFetchAllAds, adminDeleteAd, adminUpdateAd,
  adminSetAdFeatured, adminFetchAllUsers, adminSetUserBlocked,
  adminBoostAd, adminSetUserAdmin, adminSetUserVerified, UserProfile,
} from '@/services/adminService';
import { fetchAllBanners, createBanner, deleteBanner, toggleBannerActive, updateBanner, Banner, BannerPlacement } from '@/services/bannersService';
import {
  fetchAllInterstitials, createInterstitial, updateInterstitial, deleteInterstitial, InterstitialAd,
} from '@/services/interstitialService';
import {
  adminFetchAllStores, adminCreateStore, adminUpdateStore, adminDeleteStore, Store,
} from '@/services/storesService';
import { pickImage, uploadImage } from '@/services/imageService';
import { useCategories } from '@/hooks/useCategories';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';
import { fetchPageStats, fetchGeneralStats, fetchAllPageStats, PageStats, GeneralStats } from '@/services/analyticsService';

// ── Error Boundary (محلي) ──────────────────────────────────────────────────
class AdminTabErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    console.error('[AdminTab] ❌ Error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <MaterialIcons name="error-outline" size={32} color="#EF4444" />
          <Text style={{ color: '#EF4444', marginTop: 8 }}>حدث خطأ في هذا التبويب</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Analytics Stats Component ──────────────────────────────────────────────
function AnalyticsTab({ isAr, colors }: { isAr: boolean; colors: any }) {
  const [stats, setStats] = useState<any>(null);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [dauRes, wauRes, mauRes, totalVisitsRes, usersRes, activeAdsRes, activeStoresRes] = await Promise.all([
        supabase.from('app_visits').select('device_id').gte('visited_at', todayStart),
        supabase.from('app_visits').select('device_id').gte('visited_at', weekAgo),
        supabase.from('app_visits').select('device_id').gte('visited_at', monthAgo),
        supabase.from('app_visits').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      if (controller.signal.aborted) return;

      const uniqueSet = (rows: any[]) => new Set(rows.map((r: any) => r.device_id)).size;
      const dau = uniqueSet(dauRes.data ?? []);
      const wau = uniqueSet(wauRes.data ?? []);
      const mau = uniqueSet(mauRes.data ?? []);
      const totalVisits = totalVisitsRes.count ?? 0;
      const totalUsers = usersRes.count ?? 0;
      const activeAds = activeAdsRes.count ?? 0;
      const activeStores = activeStoresRes.count ?? 0;

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

      if (controller.signal.aborted) return;
      setStats({ dau, wau, mau, trend, totalVisits, totalUsers, activeAds, activeStores });

      const [pages] = await Promise.all([fetchAllPageStats()]);
      if (controller.signal.aborted) return;
      setPageStats(pages || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('fetchStats error:', err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => { clearInterval(interval); if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [fetchStats]);

  const maxTrend = Math.max(...(stats?.trend?.map((t: any) => t.count) ?? [1]), 1);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}>
      {/* بطاقات الإحصائيات */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {[
          { label: isAr ? 'مستخدمين اليوم' : 'DAU', value: stats?.dau ?? 0, color: colors.primary },
          { label: isAr ? 'مستخدمين الأسبوع' : 'WAU', value: stats?.wau ?? 0, color: colors.accent },
          { label: isAr ? 'مستخدمين الشهر' : 'MAU', value: stats?.mau ?? 0, color: '#8B5CF6' },
        ].map((item, i) => (
          <View key={i} style={{ flex: 1, minWidth: '30%', backgroundColor: colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.textPrimary }}>{item.value}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* إحصائيات إضافية */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {[
          { label: isAr ? 'متاجر نشطة' : 'Stores', value: stats?.activeStores ?? 0, icon: 'storefront' },
          { label: isAr ? 'إعلانات نشطة' : 'Ads', value: stats?.activeAds ?? 0, icon: 'campaign' },
          { label: isAr ? 'مستخدمين' : 'Users', value: stats?.totalUsers ?? 0, icon: 'people' },
          { label: isAr ? 'زيارات' : 'Visits', value: stats?.totalVisits ?? 0, icon: 'visibility' },
        ].map((item, i) => (
          <View key={i} style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.sm, alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <MaterialIcons name={item.icon as any} size={20} color={colors.primary} />
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>{item.value}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* إحصائيات الصفحات */}
      {pageStats.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <View style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{isAr ? 'إحصائيات الصفحات' : 'Page Stats'}</Text>
          </View>
          {pageStats.map((stat) => {
            const pageName = isAr ? stat.page : stat.page;
            const icon = stat.page === 'home' ? 'home' : stat.page === 'stores' ? 'storefront' : 'web';
            return (
              <View key={stat.page} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                <MaterialIcons name={icon as any} size={16} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: FontSize.sm, color: colors.textPrimary }}>{pageName}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{stat.unique_24h} / {stat.total_24h}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ── تبويب الإعلانات ──────────────────────────────────────────────────────
function AdsTab({ colors, isAr, t }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (showLoading) setLoading(true);
    setRefreshing(false);

    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllAds({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setAds(data);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (!controller.signal.aborted) { if (showLoading) setLoading(false); }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(true); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const filtered = ads.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));

  const renderItem = ({ item }: { item: Ad }) => {
    const isFeatured = item.status === 'featured';
    const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
    return (
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm }}>
        <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{item.title}</Text>
        <Text style={{ fontSize: FontSize.xs, color: colors.textMuted }}>{item.price}₪ • {item.condition}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {isFeatured && <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: '#D97706', fontSize: 10 }}>{isAr ? 'مميز' : 'Featured'}</Text></View>}
          {isBoosted && <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: '#2563EB', fontSize: 10 }}>{isAr ? 'معزز' : 'Boosted'}</Text></View>}
          <Text style={{ fontSize: 10, color: colors.textMuted }}>{item.status}</Text>
        </View>
      </View>
    );
  };

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, margin: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }}
        placeholder={isAr ? 'ابحث...' : 'Search...'}
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(false); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد إعلانات' : 'No ads'}</Text></View>
        }
      />
    </View>
  );
}

// ── تبويب المستخدمين ─────────────────────────────────────────────────────
function UsersTab({ colors, isAr, t }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllUsers({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setUsers(data);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryGhost, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>{(item.username || item.email).charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{item.username || item.email.split('@')[0]}</Text>
            <Text style={{ fontSize: FontSize.xs, color: colors.textMuted }}>{item.email}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              {item.is_admin && <Text style={{ fontSize: 9, color: colors.primary }}>Admin</Text>}
              {item.is_verified && <Text style={{ fontSize: 9, color: '#2563EB' }}>✓</Text>}
              {item.is_blocked && <Text style={{ fontSize: 9, color: '#EF4444' }}>{isAr ? 'محظور' : 'Blocked'}</Text>}
            </View>
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: Spacing.md }}
      ListEmptyComponent={<View style={{ alignItems: 'center', padding: 40 }}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا يوجد مستخدمين' : 'No users'}</Text></View>}
    />
  );
}

// ── تبويب البانرات ──────────────────────────────────────────────────────
function BannersTab({ colors, isAr, t }: any) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([fetchAllBanners({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setBanners(data);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <FlatList
      data={banners}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={{ width: 50, height: 40, borderRadius: Radius.md }} contentFit="cover" />
          ) : (
            <View style={{ width: 50, height: 40, backgroundColor: colors.surfaceTint, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="image" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{item.title}</Text>
            <Text style={{ fontSize: FontSize.xs, color: colors.textMuted }}>{item.placement}</Text>
          </View>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.is_active ? '#22C55E' : '#EF4444' }} />
        </View>
      )}
      contentContainerStyle={{ padding: Spacing.md }}
    />
  );
}

// ── الصفحة الرئيسية للإدارة ─────────────────────────────────────────────
export default function AdminSimpleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'users' | 'banners'>('analytics');

  const TABS = [
    { key: 'analytics', label: isAr ? 'إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? 'إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'users', label: isAr ? 'مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? 'بانرات' : 'Banners', icon: 'view-carousel' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{isAr ? 'لوحة الإدارة' : 'Admin Panel'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: isActive ? colors.primary : colors.surfaceTint }}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={{ color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* المحتوى */}
      <AdminTabErrorBoundary>
        {activeTab === 'analytics' && <AnalyticsTab isAr={isAr} colors={colors} />}
        {activeTab === 'ads' && <AdsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'users' && <UsersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'banners' && <BannersTab colors={colors} isAr={isAr} t={t} />}
      </AdminTabErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
});