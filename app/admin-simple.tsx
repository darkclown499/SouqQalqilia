import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
  Alert, KeyboardAvoidingView, Platform,
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

// ── Error Boundary ──────────────────────────────────────────────────────────
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

// ─── Analytics Tab ──────────────────────────────────────────────────────────
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

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</Text>
      </View>
    );
  }

  // أيقونات للصفحات
  const pageIcons: Record<string, string> = {
    home: 'home',
    stores: 'storefront',
    ad: 'campaign',
    store: 'store',
    profile: 'person',
    offers: 'local-offer',
    search: 'search',
    categories: 'category',
  };

  const pageNames: Record<string, string> = {
    home: isAr ? 'الرئيسية' : 'Home',
    stores: isAr ? 'المتاجر' : 'Stores',
    ad: isAr ? 'الإعلان' : 'Ad',
    store: isAr ? 'المتجر' : 'Store',
    profile: isAr ? 'الملف الشخصي' : 'Profile',
    offers: isAr ? 'العروض' : 'Offers',
    search: isAr ? 'البحث' : 'Search',
    categories: isAr ? 'التصنيفات' : 'Categories',
  };

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>
          {isAr ? '📊 إحصائيات عامة' : '📊 General Stats'}
        </Text>
        {lastUpdated && (
          <Text style={{ fontSize: 10, color: colors.textMuted }}>
            {isAr ? 'آخر تحديث: ' : 'Updated: '}
            {lastUpdated.toLocaleTimeString(isAr ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* بطاقات الإحصائيات الرئيسية - 3 أعمدة */}
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        {[
          { label: isAr ? 'مستخدمين اليوم' : 'Today', value: stats?.dau ?? 0, icon: 'today', color: '#3B82F6' },
          { label: isAr ? 'مستخدمين الأسبوع' : 'This Week', value: stats?.wau ?? 0, icon: 'date-range', color: '#8B5CF6' },
          { label: isAr ? 'مستخدمين الشهر' : 'This Month', value: stats?.mau ?? 0, icon: 'calendar-month', color: '#10B981' },
        ].map((item, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.sm, alignItems: 'center' }}>
            <MaterialIcons name={item.icon as any} size={18} color={item.color} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>{item.value}</Text>
            <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* إحصائيات إضافية - 2 أعمدة */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {[
          { label: isAr ? '🛒 متاجر نشطة' : 'Active Stores', value: stats?.activeStores ?? 0, icon: 'storefront' },
          { label: isAr ? '📢 إعلانات نشطة' : 'Active Ads', value: stats?.activeAds ?? 0, icon: 'campaign' },
          { label: isAr ? '👤 مستخدمين مسجلين' : 'Registered Users', value: stats?.totalUsers ?? 0, icon: 'people' },
          { label: isAr ? '👁️ إجمالي الزيارات' : 'Total Visits', value: stats?.totalVisits ?? 0, icon: 'visibility' },
        ].map((item, i) => (
          <View key={i} style={{ flex: 1, minWidth: '47%', backgroundColor: colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryGhost, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name={item.icon as any} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>{item.value}</Text>
              <Text style={{ fontSize: 9, color: colors.textMuted }}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* إحصائيات الصفحات */}
      <View style={{ backgroundColor: colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="analytics" size={18} color={colors.primary} />
          <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{isAr ? 'إحصائيات الصفحات' : 'Page Statistics'}</Text>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>{isAr ? 'فريد' : 'Unique'}</Text>
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>{isAr ? 'إجمالي' : 'Total'}</Text>
          </View>
        </View>
        {(pageStats || []).length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: FontSize.sm }}>{isAr ? 'لا توجد بيانات' : 'No data yet'}</Text>
          </View>
        ) : (
          (pageStats || []).map((stat, index) => {
            const icon = pageIcons[stat.page] || 'web';
            const name = pageNames[stat.page] || stat.page;
            const isLast = index === (pageStats || []).length - 1;
            return (
              <View
                key={stat.page}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: Spacing.md,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: colors.borderLight,
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryGhost, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name={icon as any} size={16} color={colors.primary} />
                </View>
                <Text style={{ flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: colors.textPrimary }}>{name}</Text>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary, minWidth: 30, textAlign: 'center' }}>
                  {stat.unique_24h || 0}
                </Text>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textMuted, minWidth: 30, textAlign: 'center' }}>
                  {stat.total_24h || 0}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ backgroundColor: colors.surfaceTint, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: colors.borderLight }}>
        <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>
          {isAr
            ? '📌 الفريد: عدد الزوار المختلفين (جهاز واحد) • الإجمالي: عدد الزيارات الكلي (يشمل التكرار)'
            : '📌 Unique: distinct visitors (per device) • Total: total visits (includes repeats)'}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Ad Edit Modal ─────────────────────────────────────────────────────────
function AdEditModal({ visible, ad, onClose, onSave, isAr, colors }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<'new' | 'used'>('new');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ad) {
      setTitle(ad.title || '');
      setDescription(ad.description || '');
      setPrice(String(ad.price || 0));
      setLocation(ad.location || '');
      setCondition(ad.condition || 'new');
    }
  }, [ad]);

  const handleSave = async () => {
    if (!ad) return;
    setSaving(true);
    try {
      await onSave(ad.id, {
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price) || 0,
        location: location.trim(),
        condition,
      });
      setSaving(false);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, maxHeight: '90%' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: Spacing.md }}>
              <MaterialIcons name="edit" size={20} color={colors.primary} />
              <Text style={{ fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{isAr ? 'تعديل الإعلان' : 'Edit Ad'}</Text>
              <Pressable onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={22} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.sm, paddingVertical: Spacing.md }}>
              <View>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{isAr ? 'العنوان' : 'Title'}</Text>
                <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }} value={title} onChangeText={setTitle} />
              </View>
              <View>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{isAr ? 'الوصف' : 'Description'}</Text>
                <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background, height: 80, textAlignVertical: 'top' }} value={description} onChangeText={setDescription} multiline />
              </View>
              <View>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{isAr ? 'السعر (₪)' : 'Price (₪)'}</Text>
                <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }} value={price} onChangeText={setPrice} keyboardType="numeric" />
              </View>
              <View>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{isAr ? 'الموقع' : 'Location'}</Text>
                <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }} value={location} onChangeText={setLocation} />
              </View>
              <View>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{isAr ? 'الحالة' : 'Condition'}</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  {(['new', 'used'] as const).map(c => (
                    <Pressable key={c} style={{ flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: condition === c ? colors.primary : colors.border, backgroundColor: condition === c ? colors.primary : colors.background }} onPress={() => setCondition(c)}>
                      <Text style={{ textAlign: 'center', color: condition === c ? '#fff' : colors.textSecondary, fontWeight: '700' }}>{c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable style={{ marginTop: Spacing.sm, paddingVertical: 14, borderRadius: Radius.full, backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{isAr ? 'حفظ التغييرات' : 'Save Changes'}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Ads Tab ──────────────────────────────────────────────────────────────────
function AdsTab({ colors, isAr, t }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
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
      setAds(data || []);
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

  const handleToggleFeatured = async (ad: Ad) => {
    const isFeatured = ad.status === 'featured';
    const { error } = await adminSetAdFeatured(ad.id, !isFeatured);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData(false);
  };

  const handleToggleBoost = async (ad: Ad) => {
    const isBoosted = !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now());
    const { error } = await adminBoostAd(ad.id, !isBoosted);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData(false);
  };

  const handleDeleteAd = async (ad: Ad) => {
    Alert.alert(
      isAr ? 'حذف الإعلان' : 'Delete Ad',
      isAr ? `هل تريد حذف "${ad.title}"؟` : `Delete "${ad.title}"?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await adminDeleteAd(ad.id);
            if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
            loadData(false);
          },
        },
      ]
    );
  };

  const handleEditAd = (ad: Ad) => {
    setEditingAd(ad);
    setEditModalVisible(true);
  };

  const handleSaveAdEdit = async (id: string, updates: any) => {
    const { error } = await adminUpdateAd(id, updates);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData(false);
  };

  const renderItem = ({ item }: { item: Ad }) => {
    const isFeatured = item.status === 'featured';
    const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
    const statusColor = item.status === 'active' ? '#22C55E' : item.status === 'featured' ? '#F59E0B' : '#6B7280';
    const statusLabel = isAr
      ? item.status === 'active' ? 'نشط' : item.status === 'featured' ? 'مميز' : 'منتهي'
      : item.status === 'active' ? 'Active' : item.status === 'featured' ? 'Featured' : 'Expired';

    return (
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: isBoosted ? '#2563EB' : colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{item.title}</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
          <Text style={{ fontSize: 9, fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
        </View>
        <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, marginTop: 2 }}>{item.price}₪ • {item.condition === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}</Text>
        {item.location && <Text style={{ fontSize: 10, color: colors.textMuted }}>{item.location}</Text>}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Pressable style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: isFeatured ? '#FEF3C7' : colors.borderLight }} onPress={() => handleToggleFeatured(item)}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: isFeatured ? '#D97706' : colors.textMuted }}>{isAr ? (isFeatured ? 'إلغاء التميز' : 'تمييز') : (isFeatured ? 'Unfeature' : 'Feature')}</Text>
          </Pressable>
          <Pressable style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: isBoosted ? '#DBEAFE' : colors.borderLight }} onPress={() => handleToggleBoost(item)}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: isBoosted ? '#2563EB' : colors.textMuted }}>{isAr ? (isBoosted ? 'إلغاء التعزيز' : 'تعزيز') : (isBoosted ? 'Unboost' : 'Boost')}</Text>
          </Pressable>
          <Pressable style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: colors.primaryGhost }} onPress={() => handleEditAd(item)}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{isAr ? 'تعديل' : 'Edit'}</Text>
          </Pressable>
          <Pressable style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: '#FEE2E2' }} onPress={() => handleDeleteAd(item)}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#EF4444' }}>{isAr ? 'حذف' : 'Delete'}</Text>
          </Pressable>
        </View>
        {isBoosted && (
          <Text style={{ fontSize: 9, color: '#2563EB', marginTop: 4 }}>
            {isAr ? `معزز حتى: ${new Date(item.boosted_until!).toLocaleDateString()}` : `Boosted until: ${new Date(item.boosted_until!).toLocaleDateString()}`}
          </Text>
        )}
      </View>
    );
  };

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, margin: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }}
        placeholder={isAr ? '🔍 ابحث عن إعلان...' : '🔍 Search ads...'}
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(false); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}>
            <MaterialIcons name="campaign" size={44} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد إعلانات' : 'No ads found'}</Text>
          </View>
        }
      />
      <AdEditModal visible={editModalVisible} ad={editingAd} onClose={() => { setEditModalVisible(false); setEditingAd(null); }} onSave={handleSaveAdEdit} isAr={isAr} colors={colors} />
    </View>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ colors, isAr, t }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllUsers({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setUsers(data || []);
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

  const filtered = users.filter(u =>
    (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleAdmin = async (user: UserProfile) => {
    const { error } = await adminSetUserAdmin(user.id, !user.is_admin);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData();
  };

  const handleToggleVerified = async (user: UserProfile) => {
    const { error } = await adminSetUserVerified(user.id, !user.is_verified);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData();
  };

  const handleToggleBlocked = async (user: UserProfile) => {
    const { error } = await adminSetUserBlocked(user.id, !user.is_blocked);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    loadData();
  };

  const renderItem = ({ item }: { item: UserProfile }) => {
    const displayName = item.username || item.email.split('@')[0] || 'User';
    return (
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: item.is_admin ? colors.primary : colors.primaryGhost, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: item.is_admin ? '#fff' : colors.primary }}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{displayName}</Text>
            <Text style={{ fontSize: FontSize.xs, color: colors.textMuted }}>{item.email}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {item.is_admin && <View style={{ backgroundColor: colors.primaryGhost, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: colors.primary, fontWeight: '700' }}>Admin</Text></View>}
              {item.is_verified && <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#2563EB', fontWeight: '700' }}>✓ {isAr ? 'موثّق' : 'Verified'}</Text></View>}
              {item.is_blocked && <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#EF4444', fontWeight: '700' }}>{isAr ? 'محظور' : 'Blocked'}</Text></View>}
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 10 }}>
          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: item.is_admin ? colors.primaryGhost : colors.borderLight }} onPress={() => handleToggleAdmin(item)}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: item.is_admin ? colors.primary : colors.textMuted }}>{isAr ? (item.is_admin ? 'إلغاء الإدارة' : 'جعله مدير') : (item.is_admin ? 'Revoke Admin' : 'Make Admin')}</Text>
          </Pressable>
          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: item.is_verified ? '#DBEAFE' : colors.borderLight }} onPress={() => handleToggleVerified(item)}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: item.is_verified ? '#2563EB' : colors.textMuted }}>{isAr ? (item.is_verified ? 'إلغاء التوثيق' : 'توثيق') : (item.is_verified ? 'Unverify' : 'Verify')}</Text>
          </Pressable>
          <Pressable style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: item.is_blocked ? '#FEE2E2' : colors.borderLight }} onPress={() => handleToggleBlocked(item)}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: item.is_blocked ? '#EF4444' : colors.textMuted }}>{isAr ? (item.is_blocked ? 'رفع الحظر' : 'حظر') : (item.is_blocked ? 'Unblock' : 'Block')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, margin: Spacing.md, color: colors.textPrimary, backgroundColor: colors.background }}
        placeholder={isAr ? '🔍 ابحث عن مستخدم...' : '🔍 Search users...'}
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}>
            <MaterialIcons name="people" size={44} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا يوجد مستخدمين' : 'No users found'}</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Banners Tab ──────────────────────────────────────────────────────────────
function BannersTab({ colors, isAr, t }: any) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bnTitle, setBnTitle] = useState('');
  const [bnSubtitle, setBnSubtitle] = useState('');
  const [bnImageUrl, setBnImageUrl] = useState('');
  const [bnLinkUrl, setBnLinkUrl] = useState('');
  const [bnPlacement, setBnPlacement] = useState<BannerPlacement>('home');
  const [bnSaving, setBnSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([fetchAllBanners({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setBanners(data || []);
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

  const resetForm = () => {
    setEditingBanner(null);
    setBnTitle('');
    setBnSubtitle('');
    setBnImageUrl('');
    setBnLinkUrl('');
    setBnPlacement('home');
    setShowForm(false);
  };

  const handlePickImage = async () => {
    setImageUploading(true);
    try {
      const result = await pickImage('gallery');
      if (result && result.base64) {
        const { url } = await uploadImage(result.base64, 'banner', `banner_${Date.now()}`);
        if (url) setBnImageUrl(url);
      }
    } catch (e) {
      console.warn('Image pick error:', e);
    } finally {
      setImageUploading(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!bnTitle.trim() || !bnImageUrl.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان ورابط الصورة مطلوبان' : 'Title and image URL are required');
      return;
    }
    setBnSaving(true);
    const payload = {
      title: bnTitle.trim(),
      subtitle: bnSubtitle.trim(),
      image_url: bnImageUrl.trim(),
      link_url: bnLinkUrl.trim() || null,
      placement: editingBanner ? editingBanner.placement : bnPlacement,
    };
    const { error } = editingBanner
      ? await updateBanner(editingBanner.id, payload)
      : await createBanner(payload);
    setBnSaving(false);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    resetForm();
    loadData();
  };

  const handleToggleActive = async (banner: Banner) => {
    await toggleBannerActive(banner.id, !banner.is_active);
    loadData();
  };

  const handleDeleteBanner = async (banner: Banner) => {
    Alert.alert(
      isAr ? 'حذف البانر' : 'Delete Banner',
      isAr ? `هل تريد حذف "${banner.title}"؟` : `Delete "${banner.title}"?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? 'حذف' : 'Delete', style: 'destructive', onPress: async () => { await deleteBanner(banner.id); loadData(); } }
      ]
    );
  };

  const openEditForm = (banner: Banner) => {
    setEditingBanner(banner);
    setBnTitle(banner.title);
    setBnSubtitle(banner.subtitle || '');
    setBnImageUrl(banner.image_url);
    setBnLinkUrl(banner.link_url || '');
    setBnPlacement(banner.placement || 'home');
    setShowForm(true);
  };

  const renderItem = ({ item }: { item: Banner }) => (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={{ width: 56, height: 44, borderRadius: Radius.md }} contentFit="cover" />
      ) : (
        <View style={{ width: 56, height: 44, backgroundColor: colors.surfaceTint, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="image" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{item.title}</Text>
        <Text style={{ fontSize: FontSize.xs, color: colors.textMuted }}>{item.placement || 'home'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => handleToggleActive(item)} hitSlop={4}>
          <MaterialIcons name={item.is_active ? 'visibility' : 'visibility-off'} size={18} color={item.is_active ? '#22C55E' : '#EF4444'} />
        </Pressable>
        <Pressable onPress={() => openEditForm(item)} hitSlop={4}>
          <MaterialIcons name="edit" size={18} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => handleDeleteBanner(item)} hitSlop={4}>
          <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={{ margin: Spacing.md, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: colors.primary, alignItems: 'center' }} onPress={() => setShowForm(true)}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? '+ إضافة بانر جديد' : '+ Add New Banner'}</Text>
      </Pressable>

      {showForm && (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Text style={{ fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary }}>{editingBanner ? (isAr ? 'تعديل البانر' : 'Edit Banner') : (isAr ? 'إضافة بانر' : 'Add Banner')}</Text>
            <Pressable onPress={resetForm}><MaterialIcons name="close" size={20} color={colors.textMuted} /></Pressable>
          </View>
          <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.sm, color: colors.textPrimary, backgroundColor: colors.background, marginBottom: Spacing.sm }} placeholder={isAr ? 'العنوان *' : 'Title *'} placeholderTextColor={colors.textMuted} value={bnTitle} onChangeText={setBnTitle} />
          <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.sm, color: colors.textPrimary, backgroundColor: colors.background, marginBottom: Spacing.sm }} placeholder={isAr ? 'النص الفرعي' : 'Subtitle'} placeholderTextColor={colors.textMuted} value={bnSubtitle} onChangeText={setBnSubtitle} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.sm }}>
            <TextInput style={{ flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.sm, color: colors.textPrimary, backgroundColor: colors.background }} placeholder={isAr ? 'رابط الصورة *' : 'Image URL *'} placeholderTextColor={colors.textMuted} value={bnImageUrl} onChangeText={setBnImageUrl} />
            <Pressable style={{ paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.primaryGhost, borderRadius: Radius.md }} onPress={handlePickImage} disabled={imageUploading}>
              {imageUploading ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="upload" size={20} color={colors.primary} />}
            </Pressable>
          </View>
          <TextInput style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.sm, color: colors.textPrimary, backgroundColor: colors.background, marginBottom: Spacing.sm }} placeholder={isAr ? 'رابط الوجهة (اختياري)' : 'Link URL (optional)'} placeholderTextColor={colors.textMuted} value={bnLinkUrl} onChangeText={setBnLinkUrl} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.sm }}>
            {(['home', 'stores_directory'] as BannerPlacement[]).map(p => (
              <Pressable key={p} style={{ flex: 1, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1.5, borderColor: bnPlacement === p ? colors.primary : colors.border, backgroundColor: bnPlacement === p ? colors.primary : colors.background }} onPress={() => setBnPlacement(p)}>
                <Text style={{ textAlign: 'center', color: bnPlacement === p ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>{p === 'home' ? (isAr ? 'الرئيسية' : 'Home') : (isAr ? 'المتاجر' : 'Stores')}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={{ paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: colors.primary, opacity: bnSaving ? 0.7 : 1 }} onPress={handleSaveBanner} disabled={bnSaving}>
            {bnSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{isAr ? 'حفظ' : 'Save'}</Text>}
          </Pressable>
        </View>
      )}

      <FlatList
        data={banners}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40 }}>
            <MaterialIcons name="view-carousel" size={44} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد بانرات' : 'No banners'}</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'users' | 'banners'>('analytics');

  const TABS = [
    { key: 'analytics', label: isAr ? '📊 إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? '📢 إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'users', label: isAr ? '👤 مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? '🖼️ بانرات' : 'Banners', icon: 'view-carousel' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{isAr ? '⚙️ لوحة الإدارة' : '⚙️ Admin Panel'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: isActive ? colors.primary : colors.surfaceTint, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={{ color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }}>{tab.label}</Text>
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