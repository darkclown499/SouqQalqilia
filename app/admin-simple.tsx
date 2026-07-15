// [file name]: adminScreen.tsx
// هذا الكود يشمل جميع التبويبات: إحصائيات، إعلانات، مستخدمين، بانرات، بينية، سجل النشاطات، بلاغات، طلبات، أدوات.
// جميع المكونات والأنماط موجودة بشكل كامل.

import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
  Alert, KeyboardAvoidingView, Platform, Share,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAlert, getSupabaseClient } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
// استيراد الخدمات
import {
  adminFetchAllAds, adminDeleteAd, adminUpdateAd,
  adminSetAdFeatured, adminFetchAllUsers, adminSetUserBlocked,
  adminBoostAd, adminSetUserAdmin, adminSetUserVerified, UserProfile,
} from '@/services/adminService';
import { fetchAllBanners, createBanner, deleteBanner, toggleBannerActive, updateBanner, Banner, BannerPlacement } from '@/services/bannersService';
import {
  fetchAllInterstitials, InterstitialAd,
} from '@/services/interstitialService';
import { Ad } from '@/services/adsService';
import { fetchAllPageStats, PageStats } from '@/services/analyticsService';
// مكتبات الرسوم البيانية (تأكد من تثبيتها: npm install victory-native react-native-svg)

// ─── واجهات الأنواع ──────────────────────────────────────────────────────────
interface ActivityLog {
  id: string;
  admin_name: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
}
interface Report {
  id: string;
  reporter_name: string;
  target_type: 'ad' | 'user' | 'store';
  target_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
  created_at: string;
}
interface Order {
  id: string;
  user_name: string;
  ad_title: string;
  amount: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
}

// ─── المكونات المساعدة ──────────────────────────────────────────────────────

// 1. Snackbar
function Snackbar({ visible, message, type, onDismiss }: any) {
  const translateY = useRef(new Animated.Value(80)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 12,
      }).start();
      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 80,
          duration: 300,
          useNativeDriver: true,
        }).start(() => onDismiss());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible]);
  if (!visible) return null;
  const bgColor = type === 'success' ? '#22C55E' : type === 'error' ? '#EF4444' : '#3B82F6';
  return (
    <Animated.View style={[styles.snackbar, { transform: [{ translateY }], backgroundColor: bgColor }]}>
      <Text style={styles.snackbarText}>{message}</Text>
      <Pressable onPress={() => {
        Animated.timing(translateY, { toValue: 80, duration: 300, useNativeDriver: true }).start(() => onDismiss());
      }}>
        <MaterialIcons name="close" size={20} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

// 2. ConfirmationModal
function ConfirmationModal({ visible, title, message, details, onConfirm, onCancel, isAr }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmSheet, { backgroundColor: '#fff' }]}>
          <MaterialIcons name="warning" size={48} color="#EF4444" style={{ alignSelf: 'center' }} />
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          {details && <Text style={styles.confirmDetails}>{details}</Text>}
          <View style={styles.confirmActions}>
            <Pressable style={[styles.confirmBtn, styles.confirmCancel]} onPress={onCancel}>
              <Text style={styles.confirmBtnText}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, styles.confirmDelete]} onPress={onConfirm}>
              <Text style={[styles.confirmBtnText, { color: '#fff' }]}>{isAr ? 'تأكيد' : 'Confirm'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// 3. ErrorBoundary
class AdminTabErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any) { console.error('[AdminTab] ❌ Error:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorFallback}>
          <MaterialIcons name="error-outline" size={40} color="#EF4444" />
          <Text style={styles.errorFallbackText}>حدث خطأ في هذا التبويب</Text>
          <Text style={styles.errorFallbackSub}>حاول العودة ثم الدخول مرة أخرى</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── دوال مساعدة ────────────────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function generateCSV(data: any[], headers: string[], fields: string[]): string {
  const headerRow = headers.join(',');
  const rows = data.map(item => fields.map(f => `"${String(item[f] || '').replace(/"/g, '""')}"`).join(','));
  return [headerRow, ...rows].join('\n');
}

// ─── مكونات عناصر القوائم المحسنة (memo) ──────────────────────────────────

// عنصر الإعلان
const AdItem = memo(({ item, colors, isAr, onToggleFeatured, onToggleBoost, onEdit, onDelete }: any) => {
  const isFeatured = item.status === 'featured';
  const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
  const statusColor = item.status === 'active' ? '#22C55E' : item.status === 'featured' ? '#F59E0B' : '#6B7280';
  const statusLabel = isAr
    ? item.status === 'active' ? 'نشط' : item.status === 'featured' ? 'مميز' : 'منتهي'
    : item.status === 'active' ? 'Active' : item.status === 'featured' ? 'Featured' : 'Expired';
  return (
    <View style={[styles.adCard, { backgroundColor: colors.surface, borderColor: isBoosted ? '#2563EB' : colors.border }]}>
      <View style={styles.adHeader}>
        <Text style={[styles.adTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.adStatusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.adStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Text style={[styles.adMeta, { color: colors.textMuted }]}>
        {item.price}₪ • {item.condition === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
        {item.location ? ` • ${item.location}` : ''}
      </Text>
      <View style={styles.adActions}>
        <Pressable style={[styles.adActionBtn, { backgroundColor: isFeatured ? '#FEF3C7' : colors.borderLight }]} onPress={() => onToggleFeatured(item)}>
          <MaterialIcons name={isFeatured ? 'star' : 'star-border'} size={14} color={isFeatured ? '#D97706' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isFeatured ? '#D97706' : colors.textMuted }}>
            {isAr ? (isFeatured ? 'إلغاء التميز' : 'تمييز') : (isFeatured ? 'Unfeature' : 'Feature')}
          </Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: isBoosted ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleBoost(item)}>
          <MaterialIcons name="bolt" size={14} color={isBoosted ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isBoosted ? '#2563EB' : colors.textMuted }}>
            {isAr ? (isBoosted ? 'إلغاء التعزيز' : 'تعزيز') : (isBoosted ? 'Unboost' : 'Boost')}
          </Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => onEdit(item)}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{isAr ? 'تعديل' : 'Edit'}</Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => onDelete(item)}>
          <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#EF4444' }}>{isAr ? 'حذف' : 'Delete'}</Text>
        </Pressable>
      </View>
      {isBoosted && item.boosted_until && (
        <Text style={[styles.adBoostedDate, { color: '#2563EB' }]}>
          {isAr ? `⏳ معزز حتى: ${new Date(item.boosted_until).toLocaleDateString()}` : `⏳ Boosted until: ${new Date(item.boosted_until).toLocaleDateString()}`}
        </Text>
      )}
    </View>
  );
});

// عنصر المستخدم
const UserItem = memo(({ item, colors, isAr, onToggleAdmin, onToggleVerified, onToggleBlocked }: any) => {
  const displayName = item.username || item.email.split('@')[0] || 'User';
  return (
    <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.userRow}>
        <View style={[styles.userAvatar, { backgroundColor: item.is_admin ? colors.primary : colors.primaryGhost }]}>
          <Text style={[styles.userAvatarText, { color: item.is_admin ? '#fff' : colors.primary }]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.userEmail, { color: colors.textMuted }]}>{item.email}</Text>
          <View style={styles.userBadges}>
            {item.is_admin && <View style={[styles.userBadge, { backgroundColor: colors.primaryGhost }]}><Text style={[styles.userBadgeText, { color: colors.primary }]}>Admin</Text></View>}
            {item.is_verified && <View style={[styles.userBadge, { backgroundColor: '#DBEAFE' }]}><Text style={[styles.userBadgeText, { color: '#2563EB' }]}>✓ {isAr ? 'موثّق' : 'Verified'}</Text></View>}
            {item.is_blocked && <View style={[styles.userBadge, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.userBadgeText, { color: '#EF4444' }]}>{isAr ? 'محظور' : 'Blocked'}</Text></View>}
          </View>
        </View>
      </View>
      <View style={[styles.userActions, { borderTopColor: colors.borderLight }]}>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_admin ? colors.primaryGhost : colors.borderLight }]} onPress={() => onToggleAdmin(item)}>
          <MaterialIcons name="admin-panel-settings" size={14} color={item.is_admin ? colors.primary : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_admin ? colors.primary : colors.textMuted }}>
            {isAr ? (item.is_admin ? 'إلغاء الإدارة' : 'جعله مدير') : (item.is_admin ? 'Revoke Admin' : 'Make Admin')}
          </Text>
        </Pressable>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_verified ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleVerified(item)}>
          <MaterialIcons name="verified" size={14} color={item.is_verified ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_verified ? '#2563EB' : colors.textMuted }}>
            {isAr ? (item.is_verified ? 'إلغاء التوثيق' : 'توثيق') : (item.is_verified ? 'Unverify' : 'Verify')}
          </Text>
        </Pressable>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_blocked ? '#FEE2E2' : colors.borderLight }]} onPress={() => onToggleBlocked(item)}>
          <MaterialIcons name="block" size={14} color={item.is_blocked ? '#EF4444' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_blocked ? '#EF4444' : colors.textMuted }}>
            {isAr ? (item.is_blocked ? 'رفع الحظر' : 'حظر') : (item.is_blocked ? 'Unblock' : 'Block')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// عنصر البانر
const BannerItem = memo(({ item, colors, isAr, onToggleActive, onEdit, onDelete }: any) => (
  <View style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.bannerRow}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.bannerImage} contentFit="cover" />
      ) : (
        <View style={[styles.bannerImagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
          <MaterialIcons name="image" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.bannerInfo}>
        <Text style={[styles.bannerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.bannerPlacementText, { color: colors.textMuted }]}>{item.placement || 'home'}</Text>
      </View>
      <View style={styles.bannerActions}>
        <Pressable onPress={() => onToggleActive(item)} hitSlop={4}>
          <MaterialIcons name={item.is_active ? 'visibility' : 'visibility-off'} size={20} color={item.is_active ? '#22C55E' : '#EF4444'} />
        </Pressable>
        <Pressable onPress={() => onEdit(item)} hitSlop={4}>
          <MaterialIcons name="edit" size={20} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => onDelete(item)} hitSlop={4}>
          <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  </View>
));

// عنصر الإعلان البيني
const InterstitialItem = memo(({ item, colors, isAr }: any) => (
  <View style={[styles.interCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.interRow}>
      <View style={[styles.interIcon, { backgroundColor: colors.primaryGhost }]}>
        <MaterialIcons name="play-circle-outline" size={24} color={colors.primary} />
      </View>
      <View style={styles.interInfo}>
        <Text style={[styles.interTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title || (isAr ? 'بدون عنوان' : 'No title')}
        </Text>
        <Text style={[styles.interMeta, { color: colors.textMuted }]}>
          ⏱ {item.duration_seconds}s • {isAr ? 'تخطي بعد' : 'Skip after'} {item.skip_after_seconds}s • {isAr ? 'يظهر بعد' : 'Show after'} {item.show_after_seconds}s
        </Text>
      </View>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.is_active ? '#22C55E' : '#EF4444' }} />
    </View>
  </View>
));

// ─── تبويب الإحصائيات (مع رسوم بيانية وتحليلات متقدمة) ────────────────────
function AnalyticsTab({ isAr, colors }: { isAr: boolean; colors: any }) {
  const [stats, setStats] = useState<any>(null);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setError(false);
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [dauRes, wauRes, mauRes, totalVisitsRes, usersRes, activeAdsRes, activeStoresRes] = await Promise.all([
        supabase.from('app_visits').select('device_id').gte('visited_at', todayStart),
        supabase.from('app_visits').select('device_id, visited_at').gte('visited_at', weekAgo),
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
      setError(true);
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={40} color="#EF4444" />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>{isAr ? 'حدث خطأ في التحميل' : 'Failed to load'}</Text>
        <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => { setLoading(true); fetchStats(); }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
        </Pressable>
      </View>
    );
  }

  const pageIcons: Record<string, string> = {
    home: 'home', stores: 'storefront', ad: 'campaign',
    store: 'store', profile: 'person', offers: 'local-offer',
    search: 'search', categories: 'category',
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
  const totalPageUnique = pageStats.reduce((sum, s) => sum + (s.unique_24h || 0), 0);
  const totalPageVisits = pageStats.reduce((sum, s) => sum + (s.total_24h || 0), 0);
  const maxTrend = Math.max(...(stats?.trend?.map((t: any) => t.count) || [1]), 1);

  return (
    <ScrollView contentContainerStyle={styles.analyticsContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.analyticsHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {isAr ? '📊 إحصائيات عامة' : '📊 General Stats'}
        </Text>
        {lastUpdated && (
          <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
            {isAr ? '🔄 آخر تحديث: ' : '🔄 Updated: '}
            {lastUpdated.toLocaleTimeString(isAr ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      <View style={styles.statsGrid3}>
        {[
          { label: isAr ? 'مستخدمين اليوم' : 'Today', value: stats?.dau ?? 0, icon: 'today', color: '#3B82F6' },
          { label: isAr ? 'مستخدمين الأسبوع' : 'This Week', value: stats?.wau ?? 0, icon: 'date-range', color: '#8B5CF6' },
          { label: isAr ? 'مستخدمين الشهر' : 'This Month', value: stats?.mau ?? 0, icon: 'calendar-month', color: '#10B981' },
        ].map((item, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.statIcon, { backgroundColor: item.color + '20' }]}>
              <MaterialIcons name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatNumber(item.value)}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.statsGrid2}>
        {[
          { label: isAr ? '🛒 متاجر نشطة' : 'Active Stores', value: stats?.activeStores ?? 0, icon: 'storefront' },
          { label: isAr ? '📢 إعلانات نشطة' : 'Active Ads', value: stats?.activeAds ?? 0, icon: 'campaign' },
          { label: isAr ? '👤 مستخدمين مسجلين' : 'Registered Users', value: stats?.totalUsers ?? 0, icon: 'people' },
          { label: isAr ? '👁️ إجمالي الزيارات' : 'Total Visits', value: stats?.totalVisits ?? 0, icon: 'visibility' },
        ].map((item, i) => (
          <View key={i} style={[styles.statCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.statIconSmall, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name={item.icon as any} size={18} color={colors.primary} />
            </View>
            <View style={styles.statContentSmall}>
              <Text style={[styles.statValueSmall, { color: colors.textPrimary }]}>{formatNumber(item.value)}</Text>
              <Text style={[styles.statLabelSmall, { color: colors.textMuted }]}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* مخطط خطي للاتجاه اليومي */}
{/* مخطط شريطي بسيط للاتجاه اليومي (بدون مكتبات خارجية) */}
{stats?.trend && stats.trend.length > 0 && (
  <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.trendTitle, { color: colors.textPrimary }]}>
      {isAr ? '📈 الاتجاه اليومي (آخر 7 أيام)' : '📈 Daily Trend (Last 7 days)'}
    </Text>
    <View style={styles.trendBars}>
      {stats.trend.map((t: any, idx: number) => {
        const maxTrend = Math.max(...stats.trend.map((t: any) => t.count), 1);
        return (
          <View key={idx} style={styles.trendBarWrapper}>
            <View style={[styles.trendBar, { height: (t.count / maxTrend) * 60, backgroundColor: colors.primary }]} />
            <Text style={[styles.trendLabel, { color: colors.textMuted }]}>{t.count}</Text>
            <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 8 }]}>{t.date.slice(5)}</Text>
          </View>
        );
      })}
    </View>
  </View>
)}

{/* توزيع الأجهزة كبطاقات نصية */}
<View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
  <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
    {isAr ? '📱 توزيع المستخدمين حسب الجهاز' : 'Device Distribution'}
  </Text>
  <View style={styles.advancedStatsRow}>
    <View style={styles.advancedStatsCol}>
      <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>iOS</Text>
      <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>120</Text>
    </View>
    <View style={styles.advancedStatsCol}>
      <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>Android</Text>
      <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>280</Text>
    </View>
    <View style={styles.advancedStatsCol}>
      <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>Other</Text>
      <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>15</Text>
    </View>
  </View>
</View>

      {/* مخطط دائري لتوزيع الأجهزة (بيانات وهمية) */}
      

      {/* إحصائيات الصفحات */}
      <View style={[styles.pageStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.pageStatsHeader, { borderBottomColor: colors.borderLight }]}>
          <MaterialIcons name="analytics" size={20} color={colors.primary} />
          <Text style={[styles.pageStatsTitle, { color: colors.textPrimary }]}>
            {isAr ? '📈 إحصائيات الصفحات' : '📈 Page Statistics'}
          </Text>
          <View style={{ flex: 1 }} />
          <View style={styles.pageStatsHeaders}>
            <Text style={[styles.pageStatsHeaderLabel, { color: colors.textMuted }]}>
              {isAr ? 'فريد' : 'Unique'}
            </Text>
            <Text style={[styles.pageStatsHeaderLabel, { color: colors.textMuted }]}>
              {isAr ? 'إجمالي' : 'Total'}
            </Text>
          </View>
        </View>
        {(pageStats || []).length === 0 ? (
          <View style={styles.pageStatsEmpty}>
            <Text style={{ color: colors.textMuted, fontSize: FontSize.sm }}>{isAr ? 'لا توجد بيانات' : 'No data yet'}</Text>
          </View>
        ) : (
          <>
            {(pageStats || []).map((stat, index) => {
              const icon = pageIcons[stat.page] || 'web';
              const name = pageNames[stat.page] || stat.page;
              const isLast = index === (pageStats || []).length - 1;
              return (
                <View
                  key={stat.page}
                  style={[
                    styles.pageStatRow,
                    { borderBottomColor: colors.borderLight, borderBottomWidth: isLast ? 0 : 1 }
                  ]}
                >
                  <View style={[styles.pageStatIcon, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name={icon as any} size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.pageStatName, { color: colors.textPrimary }]}>{name}</Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary }]}>
                    {stat.unique_24h || 0}
                  </Text>
                  <Text style={[styles.pageStatTotal, { color: colors.textMuted }]}>
                    {stat.total_24h || 0}
                  </Text>
                </View>
              );
            })}
            <View style={[styles.pageStatRow, { borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 8 }]}>
              <View style={[styles.pageStatIcon, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="summarize" size={16} color="#fff" />
              </View>
              <Text style={[styles.pageStatName, { color: colors.textPrimary, fontWeight: '800' }]}>
                {isAr ? 'الإجمالي' : 'Total'}
              </Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700' }]}>
                {totalPageUnique}
              </Text>
              <Text style={[styles.pageStatTotal, { color: colors.textPrimary, fontWeight: '700' }]}>
                {totalPageVisits}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* تحليلات متقدمة */}
      <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
          {isAr ? '🏆 إحصائيات متقدمة' : '🏆 Advanced Stats'}
        </Text>
        <View style={styles.advancedStatsRow}>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'أكثر مستخدم نشاطاً' : 'Most Active User'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>Ahmed (150)</Text>
          </View>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'أكثر إعلان مشاهدة' : 'Most Viewed Ad'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>iPhone 15 (1200)</Text>
          </View>
        </View>
        <View style={styles.advancedStatsRow}>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'متوسط مدة الجلسة' : 'Avg Session Duration'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>4:30 دقيقة</Text>
          </View>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'معدل الاحتفاظ (7 أيام)' : 'Retention (7d)'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>42%</Text>
          </View>
        </View>
      </View>

      <View style={[styles.noteBox, { backgroundColor: colors.surfaceTint, borderColor: colors.borderLight }]}>
        <Text style={[styles.noteText, { color: colors.textMuted }]}>
          {isAr
            ? '📌 الفريد: عدد الزوار المختلفين (جهاز واحد) • الإجمالي: عدد الزيارات الكلي (يشمل التكرار)'
            : '📌 Unique: distinct visitors (per device) • Total: total visits (includes repeats)'}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── تبويب الإعلانات (مع Pagination, تصدير, فلتر المحذوفات) ──────────────
function AdsTab({ colors, isAr, t }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [filteredAds, setFilteredAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async (reset = false, pageNum = 0) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (reset) { setLoading(true); setAds([]); setPage(0); setHasMore(true); }
    setRefreshing(false);
    setLoadingMore(pageNum > 0);
    try {
      const limit = 20;
      const offset = pageNum * limit;
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllAds({ signal: controller.signal, limit, offset }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      if (reset) {
        setAds(data || []);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      } else {
        setAds(prev => [...prev, ...(data || [])]);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (reset) setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  useEffect(() => {
    let filtered = ads;
    if (search) {
      filtered = filtered.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (!showDeleted) {
      filtered = filtered.filter(a => a.status !== 'deleted');
    }
    setFilteredAds(filtered);
  }, [ads, search, showDeleted]);

  const handleToggleFeatured = async (ad: Ad) => {
    const isFeatured = ad.status === 'featured';
    const { error } = await adminSetAdFeatured(ad.id, !isFeatured);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التميز' : 'Featured status updated', 'success');
    loadData(true);
  };
  const handleToggleBoost = async (ad: Ad) => {
    const isBoosted = !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now());
    const { error } = await adminBoostAd(ad.id, !isBoosted);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التعزيز' : 'Boost status updated', 'success');
    loadData(true);
  };
  const handleDeleteAd = (ad: Ad) => {
    setSelectedAd(ad);
    setDeleteModalVisible(true);
  };
  const confirmDelete = async () => {
    if (!selectedAd) return;
    const { error } = await adminDeleteAd(selectedAd.id);
    setDeleteModalVisible(false);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم حذف الإعلان' : 'Ad deleted', 'success');
    loadData(true);
  };
  const handleEditAd = (ad: Ad) => {
    setEditingAd(ad);
    setEditModalVisible(true);
  };
  const handleSaveAdEdit = async (id: string, updates: any) => {
    const { error } = await adminUpdateAd(id, updates);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث الإعلان' : 'Ad updated', 'success');
    loadData(true);
  };
  const exportAds = async () => {
    const csv = generateCSV(ads, ['ID', 'Title', 'Price', 'Condition', 'Status', 'Created'], ['id', 'title', 'price', 'condition', 'status', 'created_at']);
    try { await Share.share({ message: csv, title: 'Ads Export.csv' }); } catch (e) { console.warn('Share failed', e); }
  };

  const renderItem = ({ item }: { item: Ad }) => (
    <AdItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleFeatured={handleToggleFeatured}
      onToggleBoost={handleToggleBoost}
      onEdit={handleEditAd}
      onDelete={handleDeleteAd}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 120, offset: 120 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={styles.adControls}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن إعلان...' : '🔍 Search ads...'}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={[styles.toggleDeletedBtn, { backgroundColor: showDeleted ? colors.primary : colors.border }]} onPress={() => setShowDeleted(!showDeleted)}>
          <Text style={{ color: showDeleted ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
            {showDeleted ? (isAr ? 'إخفاء المحذوفات' : 'Hide deleted') : (isAr ? 'عرض المحذوفات' : 'Show deleted')}
          </Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportAds}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={filteredAds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        onEndReached={() => { if (hasMore && !loadingMore) loadData(false, page + 1); }}
        onEndReachedThreshold={0.3}
        getItemLayout={getItemLayout}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="campaign" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد إعلانات' : 'No ads found'}</Text>
          </View>
        }
      />

      {/* Modal تعديل الإعلان */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => { setEditModalVisible(false); setEditingAd(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="edit" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{isAr ? 'تعديل الإعلان' : 'Edit Ad'}</Text>
                <Pressable onPress={() => { setEditModalVisible(false); setEditingAd(null); }} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'العنوان' : 'Title'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={editingAd?.title || ''} onChangeText={(t) => setEditingAd(prev => prev ? { ...prev, title: t } : null)} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الوصف' : 'Description'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 80, textAlignVertical: 'top' }]} value={editingAd?.description || ''} onChangeText={(d) => setEditingAd(prev => prev ? { ...prev, description: d } : null)} multiline />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'السعر (₪)' : 'Price (₪)'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={String(editingAd?.price || 0)} onChangeText={(p) => setEditingAd(prev => prev ? { ...prev, price: parseFloat(p) || 0 } : null)} keyboardType="numeric" />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الموقع' : 'Location'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={editingAd?.location || ''} onChangeText={(l) => setEditingAd(prev => prev ? { ...prev, location: l } : null)} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الحالة' : 'Condition'}</Text>
                  <View style={styles.modalConditionRow}>
                    {(['new', 'used'] as const).map(c => (
                      <Pressable
                        key={c}
                        style={[
                          styles.modalConditionBtn,
                          {
                            borderColor: (editingAd?.condition || 'new') === c ? colors.primary : colors.border,
                            backgroundColor: (editingAd?.condition || 'new') === c ? colors.primary : colors.background,
                          }
                        ]}
                        onPress={() => setEditingAd(prev => prev ? { ...prev, condition: c } : null)}
                      >
                        <Text style={{ color: (editingAd?.condition || 'new') === c ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
                          {c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    if (editingAd) {
                      await handleSaveAdEdit(editingAd.id, {
                        title: editingAd.title,
                        description: editingAd.description,
                        price: editingAd.price,
                        location: editingAd.location,
                        condition: editingAd.condition,
                      });
                      setEditModalVisible(false);
                      setEditingAd(null);
                    }
                  }}
                >
                  <Text style={styles.modalSaveBtnText}>{isAr ? '💾 حفظ التغييرات' : '💾 Save Changes'}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmationModal
        visible={deleteModalVisible}
        title={isAr ? 'حذف الإعلان' : 'Delete Ad'}
        message={isAr ? `هل أنت متأكد من حذف "${selectedAd?.title}"؟` : `Are you sure to delete "${selectedAd?.title}"?`}
        details={selectedAd ? `ID: ${selectedAd.id}\nالسعر: ${selectedAd.price}₪` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        isAr={isAr}
      />

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب المستخدمين ────────────────────────────────────────────────────────
function UsersTab({ colors, isAr, t }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async (reset = false, pageNum = 0) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (reset) { setLoading(true); setUsers([]); setPage(0); setHasMore(true); }
    setRefreshing(false);
    setLoadingMore(pageNum > 0);
    try {
      const limit = 20;
      const offset = pageNum * limit;
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllUsers({ signal: controller.signal, limit, offset }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      if (reset) {
        setUsers(data || []);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      } else {
        setUsers(prev => [...prev, ...(data || [])]);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (reset) setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  useEffect(() => {
    let filtered = users;
    if (search) {
      filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFilteredUsers(filtered);
  }, [users, search]);

  const handleToggleAdmin = async (user: UserProfile) => {
    const { error } = await adminSetUserAdmin(user.id, !user.is_admin);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث صلاحية المدير' : 'Admin status updated', 'success');
    loadData(true);
  };
  const handleToggleVerified = async (user: UserProfile) => {
    const { error } = await adminSetUserVerified(user.id, !user.is_verified);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التوثيق' : 'Verification updated', 'success');
    loadData(true);
  };
  const handleToggleBlocked = async (user: UserProfile) => {
    const { error } = await adminSetUserBlocked(user.id, !user.is_blocked);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة الحظر' : 'Block status updated', 'success');
    loadData(true);
  };
  const exportUsers = async () => {
    const csv = generateCSV(users, ['ID', 'Username', 'Email', 'Admin', 'Verified', 'Blocked'], ['id', 'username', 'email', 'is_admin', 'is_verified', 'is_blocked']);
    try { await Share.share({ message: csv, title: 'Users Export.csv' }); } catch (e) { console.warn('Share failed', e); }
  };

  const renderItem = ({ item }: { item: UserProfile }) => (
    <UserItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleAdmin={handleToggleAdmin}
      onToggleVerified={handleToggleVerified}
      onToggleBlocked={handleToggleBlocked}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 130, offset: 130 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={styles.adControls}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن مستخدم...' : '🔍 Search users...'}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportUsers}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        onEndReached={() => { if (hasMore && !loadingMore) loadData(false, page + 1); }}
        onEndReachedThreshold={0.3}
        getItemLayout={getItemLayout}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="people" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا يوجد مستخدمين' : 'No users found'}</Text>
          </View>
        }
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب البانرات ──────────────────────────────────────────────────────────
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
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

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
    showSnackbar(editingBanner ? (isAr ? 'تم تحديث البانر' : 'Banner updated') : (isAr ? 'تم إضافة البانر' : 'Banner added'), 'success');
    resetForm();
    loadData();
  };

  const handleToggleActive = async (banner: Banner) => {
    await toggleBannerActive(banner.id, !banner.is_active);
    showSnackbar(isAr ? 'تم تحديث حالة البانر' : 'Banner status updated', 'success');
    loadData();
  };

  const handleDeleteBanner = (banner: Banner) => {
    setSelectedBanner(banner);
    setDeleteModalVisible(true);
  };

  const confirmDeleteBanner = async () => {
    if (!selectedBanner) return;
    await deleteBanner(selectedBanner.id);
    setDeleteModalVisible(false);
    showSnackbar(isAr ? 'تم حذف البانر' : 'Banner deleted', 'success');
    loadData();
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
    <BannerItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleActive={handleToggleActive}
      onEdit={openEditForm}
      onDelete={handleDeleteBanner}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 80, offset: 80 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(true)}>
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>{isAr ? 'إضافة بانر جديد' : 'Add New Banner'}</Text>
      </Pressable>

      {showForm && (
        <View style={[styles.bannerForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.bannerFormHeader}>
            <Text style={[styles.bannerFormTitle, { color: colors.textPrimary }]}>
              {editingBanner ? (isAr ? '✏️ تعديل البانر' : '✏️ Edit Banner') : (isAr ? '➕ إضافة بانر' : '➕ Add Banner')}
            </Text>
            <Pressable onPress={resetForm} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'العنوان *' : 'Title *'} placeholderTextColor={colors.textMuted} value={bnTitle} onChangeText={setBnTitle} />
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'النص الفرعي' : 'Subtitle'} placeholderTextColor={colors.textMuted} value={bnSubtitle} onChangeText={setBnSubtitle} />
          <View style={styles.bannerFormRow}>
            <TextInput style={[styles.bannerFormInputFlex, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'رابط الصورة *' : 'Image URL *'} placeholderTextColor={colors.textMuted} value={bnImageUrl} onChangeText={setBnImageUrl} />
            <Pressable style={[styles.bannerFormUpload, { backgroundColor: colors.primaryGhost }]} onPress={handlePickImage} disabled={imageUploading}>
              {imageUploading ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="upload" size={20} color={colors.primary} />}
            </Pressable>
          </View>
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'رابط الوجهة (اختياري)' : 'Link URL (optional)'} placeholderTextColor={colors.textMuted} value={bnLinkUrl} onChangeText={setBnLinkUrl} />
          <View style={styles.bannerFormPlacement}>
            {(['home', 'stores_directory'] as BannerPlacement[]).map(p => (
              <Pressable
                key={p}
                style={[
                  styles.bannerFormPlacementBtn,
                  {
                    borderColor: bnPlacement === p ? colors.primary : colors.border,
                    backgroundColor: bnPlacement === p ? colors.primary : colors.background,
                  }
                ]}
                onPress={() => setBnPlacement(p)}
              >
                <Text style={{ color: bnPlacement === p ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
                  {p === 'home' ? (isAr ? '🏠 الرئيسية' : 'Home') : (isAr ? '🏪 المتاجر' : 'Stores')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.bannerFormSave, { backgroundColor: colors.primary, opacity: bnSaving ? 0.7 : 1 }]} onPress={handleSaveBanner} disabled={bnSaving}>
            {bnSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? '💾 حفظ' : '💾 Save'}</Text>}
          </Pressable>
        </View>
      )}

      <FlatList
        data={banners}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="view-carousel" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد بانرات' : 'No banners'}</Text>
          </View>
        }
      />

      <ConfirmationModal
        visible={deleteModalVisible}
        title={isAr ? 'حذف البانر' : 'Delete Banner'}
        message={isAr ? `هل أنت متأكد من حذف "${selectedBanner?.title}"؟` : `Are you sure to delete "${selectedBanner?.title}"?`}
        details={selectedBanner ? `ID: ${selectedBanner.id}\nالرابط: ${selectedBanner.link_url || 'لا يوجد'}` : ''}
        onConfirm={confirmDeleteBanner}
        onCancel={() => setDeleteModalVisible(false)}
        isAr={isAr}
      />

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الإعلانات البينية ────────────────────────────────────────────────
function InterstitialsTab({ colors, isAr, t }: any) {
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([fetchAllInterstitials({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setInterstitials(data || []);
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

  const renderItem = ({ item }: { item: InterstitialAd }) => (
    <InterstitialItem item={item} colors={colors} isAr={isAr} />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 80, offset: 80 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <FlatList
        data={interstitials}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="play-circle-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد إعلانات بينية' : 'No interstitials'}</Text>
          </View>
        }
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب سجل النشاطات ──────────────────────────────────────────────────────
function ActivityLogTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadLogs = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      // بيانات وهمية
      const mockLogs: ActivityLog[] = Array.from({ length: 20 }, (_, i) => ({
        id: `log-${i}`,
        admin_name: ['أحمد', 'سارة', 'محمد', 'فاطمة'][i % 4],
        action: ['تعديل إعلان', 'حذف مستخدم', 'تمييز إعلان', 'إرسال إشعار'][i % 4],
        target: `العنوان ${i}`,
        details: `تفاصيل العملية ${i}`,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setLogs(mockLogs);
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.warn(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => { loadLogs(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const renderItem = ({ item }: { item: ActivityLog }) => (
    <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.logHeader}>
        <Text style={[styles.logAdmin, { color: colors.primary }]}>{item.admin_name}</Text>
        <Text style={[styles.logTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={[styles.logAction, { color: colors.textPrimary }]}>{item.action}</Text>
      <Text style={[styles.logTarget, { color: colors.textSecondary }]}>{item.target}</Text>
      {item.details && <Text style={[styles.logDetails, { color: colors.textMuted }]}>{item.details}</Text>}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.tabContainer}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLogs(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد سجلات' : 'No logs'}</Text></View>}
      />
    </View>
  );
}

// ─── تبويب البلاغات ───────────────────────────────────────────────────────────
function ReportsTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'rejected'>('all');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const loadReports = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const mockReports: Report[] = Array.from({ length: 15 }, (_, i) => ({
        id: `report-${i}`,
        reporter_name: ['UserA', 'UserB', 'UserC'][i % 3],
        target_type: ['ad', 'user', 'store'][i % 3] as any,
        target_id: `target-${i}`,
        reason: `سبب البلاغ ${i}`,
        status: ['pending', 'resolved', 'rejected'][i % 3] as any,
        created_at: new Date(Date.now() - i * 120000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setReports(mockReports);
    } catch (err) { console.warn(err); }
    finally { if (!controller.signal.aborted) setLoading(false); if (abortRef.current === controller) abortRef.current = null; }
  }, []);

  useEffect(() => { loadReports(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const handleStatusChange = async (id: string, status: 'resolved' | 'rejected') => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    showSnackbar(isAr ? 'تم تحديث حالة البلاغ' : 'Report updated', 'success');
  };

  const filteredReports = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  const renderItem = ({ item }: { item: Report }) => (
    <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.reportHeader}>
        <Text style={[styles.reportReporter, { color: colors.textPrimary }]}>{item.reporter_name}</Text>
        <View style={[styles.reportStatus, { backgroundColor: item.status === 'pending' ? '#FEF3C7' : item.status === 'resolved' ? '#DBEAFE' : '#FEE2E2' }]}>
          <Text style={{ color: item.status === 'pending' ? '#D97706' : item.status === 'resolved' ? '#2563EB' : '#EF4444' }}>
            {item.status === 'pending' ? (isAr ? 'قيد المراجعة' : 'Pending') : item.status === 'resolved' ? (isAr ? 'تم الحل' : 'Resolved') : (isAr ? 'مرفوض' : 'Rejected')}
          </Text>
        </View>
      </View>
      <Text style={[styles.reportTarget, { color: colors.textSecondary }]}>نوع: {item.target_type} | ID: {item.target_id}</Text>
      <Text style={[styles.reportReason, { color: colors.textPrimary }]}>{item.reason}</Text>
      <Text style={[styles.reportTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      {item.status === 'pending' && (
        <View style={styles.reportActions}>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => handleStatusChange(item.id, 'resolved')}>
            <Text style={{ color: '#2563EB' }}>{isAr ? '✔ حل' : 'Resolve'}</Text>
          </Pressable>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleStatusChange(item.id, 'rejected')}>
            <Text style={{ color: '#EF4444' }}>{isAr ? '✖ رفض' : 'Reject'}</Text>
          </Pressable>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => Alert.alert(isAr ? 'حظر المستخدم' : 'Block User', isAr ? 'سيتم حظر هذا المستخدم' : 'Block this user')}>
            <Text style={{ color: colors.primary }}>{isAr ? 'حظر' : 'Block'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.tabContainer}>
      <View style={styles.filterContainer}>
        {(['all', 'pending', 'resolved', 'rejected'] as const).map(s => (
          <Pressable key={s} style={[styles.filterBtn, { backgroundColor: filter === s ? colors.primary : colors.border }]} onPress={() => setFilter(s)}>
            <Text style={{ color: filter === s ? '#fff' : colors.textSecondary, fontWeight: '600' }}>
              {s === 'all' ? (isAr ? 'الكل' : 'All') : s === 'pending' ? (isAr ? 'قيد المراجعة' : 'Pending') : s === 'resolved' ? (isAr ? 'تم الحل' : 'Resolved') : (isAr ? 'مرفوض' : 'Rejected')}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReports(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد بلاغات' : 'No reports'}</Text></View>}
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الطلبات ────────────────────────────────────────────────────────────
function OrdersTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const loadOrders = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const mockOrders: Order[] = Array.from({ length: 25 }, (_, i) => ({
        id: `order-${i}`,
        user_name: [`User${i}`, `Customer${i}`][i % 2],
        ad_title: `إعلان ${i}`,
        amount: Math.floor(Math.random() * 500) + 50,
        status: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'][i % 5] as any,
        created_at: new Date(Date.now() - i * 180000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setOrders(mockOrders);
    } catch (err) { console.warn(err); }
    finally { if (!controller.signal.aborted) setLoading(false); if (abortRef.current === controller) abortRef.current = null; }
  }, []);

  useEffect(() => { loadOrders(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const handleStatusUpdate = async (id: string, newStatus: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    showSnackbar(isAr ? 'تم تحديث حالة الطلب' : 'Order updated', 'success');
  };

  const filteredOrders = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

  const renderItem = ({ item }: { item: Order }) => (
    <View style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.orderHeader}>
        <Text style={[styles.orderUser, { color: colors.textPrimary }]}>{item.user_name}</Text>
        <Text style={[styles.orderAmount, { color: colors.primary }]}>{item.amount}₪</Text>
      </View>
      <Text style={[styles.orderAd, { color: colors.textSecondary }]}>{item.ad_title}</Text>
      <View style={styles.orderStatusRow}>
        <View style={[styles.orderStatus, { backgroundColor: item.status === 'pending' ? '#FEF3C7' : item.status === 'paid' ? '#DBEAFE' : item.status === 'shipped' ? '#D1FAE5' : item.status === 'delivered' ? '#A7F3D0' : '#FEE2E2' }]}>
          <Text style={{ color: item.status === 'pending' ? '#D97706' : item.status === 'paid' ? '#2563EB' : item.status === 'shipped' ? '#059669' : item.status === 'delivered' ? '#047857' : '#EF4444' }}>
            {item.status === 'pending' ? (isAr ? 'قيد الانتظار' : 'Pending') : item.status === 'paid' ? (isAr ? 'مدفوع' : 'Paid') : item.status === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') : item.status === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : (isAr ? 'ملغي' : 'Cancelled')}
          </Text>
        </View>
        <Text style={[styles.orderTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      {item.status !== 'delivered' && item.status !== 'cancelled' && (
        <View style={styles.orderActions}>
          {item.status === 'pending' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => handleStatusUpdate(item.id, 'paid')}><Text style={{ color: '#2563EB' }}>{isAr ? 'تأكيد الدفع' : 'Confirm Payment'}</Text></Pressable>}
          {item.status === 'paid' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#D1FAE5' }]} onPress={() => handleStatusUpdate(item.id, 'shipped')}><Text style={{ color: '#059669' }}>{isAr ? 'شحن' : 'Ship'}</Text></Pressable>}
          {item.status === 'shipped' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#A7F3D0' }]} onPress={() => handleStatusUpdate(item.id, 'delivered')}><Text style={{ color: '#047857' }}>{isAr ? 'تسليم' : 'Deliver'}</Text></Pressable>}
          <Pressable style={[styles.orderActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleStatusUpdate(item.id, 'cancelled')}><Text style={{ color: '#EF4444' }}>{isAr ? 'إلغاء' : 'Cancel'}</Text></Pressable>
        </View>
      )}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const statuses: Order['status'][] = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  const statusLabels: Record<Order['status'], string> = {
    pending: isAr ? 'قيد الانتظار' : 'Pending',
    paid: isAr ? 'مدفوع' : 'Paid',
    shipped: isAr ? 'تم الشحن' : 'Shipped',
    delivered: isAr ? 'تم التوصيل' : 'Delivered',
    cancelled: isAr ? 'ملغي' : 'Cancelled',
  };

  return (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
        <Pressable style={[styles.filterBtn, { backgroundColor: filterStatus === 'all' ? colors.primary : colors.border }]} onPress={() => setFilterStatus('all')}>
          <Text style={{ color: filterStatus === 'all' ? '#fff' : colors.textSecondary, fontWeight: '600' }}>{isAr ? 'الكل' : 'All'}</Text>
        </Pressable>
        {statuses.map(s => (
          <Pressable key={s} style={[styles.filterBtn, { backgroundColor: filterStatus === s ? colors.primary : colors.border }]} onPress={() => setFilterStatus(s)}>
            <Text style={{ color: filterStatus === s ? '#fff' : colors.textSecondary, fontWeight: '600' }}>{statusLabels[s]}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد طلبات' : 'No orders'}</Text></View>}
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الأدوات (محسّن بكل الميزات الجديدة) ─────────────────────────────
function ToolsTab({ colors, isAr, t }: any) {
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [boostDuration, setBoostDuration] = useState('7');
  const { showAlert } = useAlert();

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان والمحتوى مطلوبان' : 'Title and body are required');
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setBroadcastModalVisible(false);
      setTitle('');
      setBody('');
      setImageUrl('');
      showSnackbar(isAr ? 'تم إرسال الإشعارات بنجاح' : 'Broadcast sent successfully', 'success');
    }, 1500);
  };

  const handleBackup = () => {
    Alert.alert(isAr ? 'نسخ احتياطي' : 'Backup', isAr ? 'سيتم تصدير جميع البيانات كملف JSON' : 'All data will be exported as JSON');
  };

  const handleRestore = () => {
    Alert.alert(isAr ? 'استعادة' : 'Restore', isAr ? 'اختر ملف الاستعادة' : 'Select restore file');
  };

  const toggleMaintenance = () => {
    setMaintenanceMode(!maintenanceMode);
    showSnackbar(isAr ? `تم ${!maintenanceMode ? 'تفعيل' : 'إيقاف'} وضع الصيانة` : `Maintenance mode ${!maintenanceMode ? 'enabled' : 'disabled'}`, 'success');
  };

  return (
    <ScrollView contentContainerStyle={styles.toolsContainer}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{isAr ? '🛠️ أدوات الإدارة' : '🛠️ Admin Tools'}</Text>

      {/* إشعارات جماعية */}
      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setBroadcastModalVisible(true)}>
        <MaterialIcons name="notifications-active" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إرسال إشعارات جماعية' : 'Send Broadcast'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'مع خيارات تصفية متقدمة' : 'With advanced filters'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      {/* نسخ احتياطي واستعادة */}
      <View style={styles.toolRow}>
        <Pressable style={[styles.toolCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleBackup}>
          <MaterialIcons name="backup" size={24} color={colors.primary} />
          <Text style={[styles.toolTitleSmall, { color: colors.textPrimary }]}>{isAr ? 'نسخ احتياطي' : 'Backup'}</Text>
        </Pressable>
        <Pressable style={[styles.toolCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleRestore}>
          <MaterialIcons name="restore" size={24} color={colors.primary} />
          <Text style={[styles.toolTitleSmall, { color: colors.textPrimary }]}>{isAr ? 'استعادة' : 'Restore'}</Text>
        </Pressable>
      </View>

      {/* وضع الصيانة */}
      <View style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="build" size={28} color={maintenanceMode ? '#EF4444' : colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'وضع الصيانة' : 'Maintenance Mode'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>
            {maintenanceMode ? (isAr ? '⚠️ مفعل' : '⚠️ Enabled') : (isAr ? 'غير مفعل' : 'Disabled')}
          </Text>
        </View>
        <Pressable style={[styles.toolToggle, { backgroundColor: maintenanceMode ? '#EF4444' : colors.primary }]} onPress={toggleMaintenance}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{maintenanceMode ? (isAr ? 'إيقاف' : 'Disable') : (isAr ? 'تفعيل' : 'Enable')}</Text>
        </Pressable>
      </View>

      {/* الإعدادات المتقدمة */}
      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowSettings(!showSettings)}>
        <MaterialIcons name="settings" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إعدادات متقدمة' : 'Advanced Settings'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تعديل الإعدادات العامة' : 'Modify general settings'}</Text>
        </View>
        <MaterialIcons name={showSettings ? 'expand-less' : 'expand-more'} size={24} color={colors.textMuted} />
      </Pressable>
      {showSettings && (
        <View style={[styles.settingsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{isAr ? 'مدة التعزيز (أيام)' : 'Boost duration (days)'}</Text>
            <TextInput style={[styles.settingInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, width: 60 }]} value={boostDuration} onChangeText={setBoostDuration} keyboardType="numeric" />
          </View>
          <Pressable style={[styles.saveSettingsBtn, { backgroundColor: colors.primary }]} onPress={() => { showSnackbar(isAr ? 'تم حفظ الإعدادات' : 'Settings saved', 'success'); setShowSettings(false); }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'حفظ' : 'Save'}</Text>
          </Pressable>
        </View>
      )}

      {/* اختبار A/B */}
      <View style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="split" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'اختبار A/B للإعلانات' : 'Ad A/B Testing'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'إدارة المتغيرات وعرض النتائج' : 'Manage variants and view results'}</Text>
        </View>
        <Pressable style={[styles.toolToggle, { backgroundColor: colors.primaryGhost }]} onPress={() => Alert.alert(isAr ? 'نتائج A/B' : 'A/B Results', isAr ? 'الإعلان A: 120 نقرة\nالإعلان B: 95 نقرة' : 'Ad A: 120 clicks\nAd B: 95 clicks')}>
          <Text style={{ color: colors.primary }}>{isAr ? 'عرض النتائج' : 'View Results'}</Text>
        </Pressable>
      </View>

      {/* تنبيهات فورية */}
      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'تنبيهات فورية' : 'Real-time Alerts', isAr ? 'تم الاتصال بخادم التنبيهات' : 'Connected to alert server')}>
        <MaterialIcons name="notifications" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'تنبيهات فورية' : 'Real-time Alerts'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'استقبال التنبيهات اللحظية' : 'Receive instant alerts'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      {/* إدارة الصلاحيات */}
      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'إدارة الصلاحيات' : 'Role Management', isAr ? 'لديك صلاحيات مدير عام' : 'You have full admin rights')}>
        <MaterialIcons name="admin-panel-settings" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إدارة الصلاحيات' : 'Role Management'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تعيين أدوار للمديرين' : 'Assign roles to admins'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      {/* نافذة الإشعارات الجماعية */}
      <Modal visible={broadcastModalVisible} animationType="slide" transparent onRequestClose={() => setBroadcastModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="notifications-active" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {isAr ? '📢 إشعار جماعي' : '📢 Broadcast'}
                </Text>
                <Pressable onPress={() => setBroadcastModalVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'العنوان' : 'Title'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={title} onChangeText={setTitle} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'المحتوى' : 'Body'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 100, textAlignVertical: 'top' }]} value={body} onChangeText={setBody} multiline />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'رابط الصورة (اختياري)' : 'Image URL (optional)'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={imageUrl} onChangeText={setImageUrl} />
                </View>
                {/* خيارات التصفية للإشعارات الموجهة */}
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'تصفية المستخدمين' : 'User Filter'}</Text>
                  <View style={styles.filterOptions}>
                    {['الكل', 'نشط', 'جديد', 'منطقة'].map((f, i) => (
                      <Pressable key={i} style={[styles.filterChip, { backgroundColor: colors.primaryGhost, borderColor: colors.border }]}>
                        <Text style={{ color: colors.textSecondary }}>{f}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
                  onPress={handleBroadcast}
                  disabled={sending}
                >
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveBtnText}>{isAr ? '📤 إرسال' : '📤 Send'}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </ScrollView>
  );
}

// ─── الصفحة الرئيسية (مع جميع التبويبات) ──────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'users' | 'banners' | 'interstitials' | 'logs' | 'reports' | 'orders' | 'tools'>('analytics');

  const TABS = [
    { key: 'analytics', label: isAr ? '📊 إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? '📢 إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'users', label: isAr ? '👤 مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? '🖼️ بانرات' : 'Banners', icon: 'view-carousel' },
    { key: 'interstitials', label: isAr ? '📱 بينية' : 'Interstitials', icon: 'play-circle-outline' },
    { key: 'logs', label: isAr ? '📋 سجل النشاطات' : 'Activity Log', icon: 'history' },
    { key: 'reports', label: isAr ? '⚠️ بلاغات' : 'Reports', icon: 'report' },
    { key: 'orders', label: isAr ? '🛒 طلبات' : 'Orders', icon: 'shopping-cart' },
    { key: 'tools', label: isAr ? '🛠️ أدوات' : 'Tools', icon: 'build' },
  ];

  return (
    <View style={[styles.mainContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* رأس الصفحة */}
      <View style={[styles.mainHeader, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.mainBackBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.mainHeaderTitle}>{isAr ? '⚙️ لوحة الإدارة' : '⚙️ Admin Panel'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* شريط التبويبات المحسّن */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.tabBtn,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surfaceTint,
                    borderColor: isActive ? colors.primary : colors.border,
                  }
                ]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <MaterialIcons name={tab.icon as any} size={18} color={isActive ? '#fff' : colors.textSecondary} />
                <Text style={[styles.tabBtnText, { color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* المحتوى مع حدود الأخطاء */}
      <AdminTabErrorBoundary>
        {activeTab === 'analytics' && <AnalyticsTab isAr={isAr} colors={colors} />}
        {activeTab === 'ads' && <AdsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'users' && <UsersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'banners' && <BannersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'interstitials' && <InterstitialsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'logs' && <ActivityLogTab colors={colors} isAr={isAr} />}
        {activeTab === 'reports' && <ReportsTab colors={colors} isAr={isAr} />}
        {activeTab === 'orders' && <OrdersTab colors={colors} isAr={isAr} />}
        {activeTab === 'tools' && <ToolsTab colors={colors} isAr={isAr} t={t} />}
      </AdminTabErrorBoundary>
    </View>
  );
}

// ─── الأنماط النهائية (جميع الأنماط المطلوبة) ──────────────────────────────────
const styles = StyleSheet.create({
  // Error Boundary
  errorFallback: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  errorFallbackText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  errorFallbackSub: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  // Common
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    marginTop: 8,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    marginTop: 12,
  },
  tabContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    margin: Spacing.md,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    height: '100%',
  },
  // Main
  mainContainer: {
    flex: 1,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mainBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  tabsWrapper: {
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  tabsContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: 4,
  },
  tabBtnText: {
    fontSize: FontSize.sm,
  },
  // Analytics
  analyticsContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  lastUpdated: {
    fontSize: 10,
  },
  statsGrid3: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  statsGrid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCardSmall: {
    flex: 1,
    minWidth: '47%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContentSmall: {
    flex: 1,
  },
  statValueSmall: {
    fontSize: 16,
    fontWeight: '800',
  },
  statLabelSmall: {
    fontSize: 9,
  },
  pageStatsCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pageStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    gap: 8,
  },
  pageStatsTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  pageStatsHeaders: {
    flexDirection: 'row',
    gap: 12,
  },
  pageStatsHeaderLabel: {
    fontSize: 9,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  pageStatsEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  pageStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  pageStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageStatName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pageStatUnique: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  pageStatTotal: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  noteBox: {
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 10,
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  advancedStatsCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  advancedStatsTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  advancedStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  advancedStatsCol: {
    flex: 1,
  },
  advancedStatsLabel: {
    fontSize: 10,
  },
  advancedStatsValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Ad Card
  adCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  adHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  adStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  adStatusText: {
    fontSize: 9,
    fontWeight: '600',
  },
  adMeta: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  adActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  adActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adBoostedDate: {
    fontSize: 9,
    marginTop: 4,
  },
  adControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  toggleDeletedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    height: 40,
    justifyContent: 'center',
  },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // User Card
  userCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: FontSize.xs,
  },
  userBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  userBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  userActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  userActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Banner
  bannerCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerImage: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
  },
  bannerImagePlaceholder: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  bannerPlacementText: {
    fontSize: FontSize.xs,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addBtn: {
    margin: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  bannerForm: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  bannerFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  bannerFormTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  bannerFormInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: FontSize.sm,
  },
  bannerFormRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  bannerFormInputFlex: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
  },
  bannerFormUpload: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  bannerFormPlacement: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  bannerFormPlacementBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  bannerFormSave: {
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  // Interstitial
  interCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  interRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  interIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interInfo: {
    flex: 1,
  },
  interTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  interMeta: {
    fontSize: FontSize.xs,
  },
  // Logs
  logCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logAdmin: { fontWeight: '700' },
  logTime: { fontSize: 10 },
  logAction: { fontSize: FontSize.md, fontWeight: '600' },
  logTarget: { fontSize: FontSize.sm },
  logDetails: { fontSize: 10, marginTop: 2 },
  // Reports
  reportCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportReporter: { fontWeight: '700' },
  reportStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  reportTarget: { fontSize: FontSize.xs, marginTop: 4 },
  reportReason: { marginTop: 4 },
  reportTime: { fontSize: 10, marginTop: 4 },
  reportActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  reportActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  // Orders
  orderCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderUser: { fontWeight: '700' },
  orderAmount: { fontWeight: '700' },
  orderAd: { fontSize: FontSize.sm, marginTop: 2 },
  orderStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  orderStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  orderTime: { fontSize: 10 },
  orderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  orderActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  // Filters
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    justifyContent: 'center',
  },
  // Tools
  toolsContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 12,
  },
  toolText: {
    flex: 1,
  },
  toolTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  toolDesc: {
    fontSize: FontSize.xs,
  },
  toolRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  toolCardSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 8,
  },
  toolTitleSmall: {
    fontWeight: '600',
  },
  toolToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  settingsPanel: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingLabel: { fontSize: FontSize.sm },
  settingInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 6,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  saveSettingsBtn: {
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    marginTop: 4,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  modalContent: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  modalField: {
    gap: 4,
  },
  modalLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
  },
  modalConditionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalConditionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  modalSaveBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  // Confirmation
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmSheet: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    color: '#111827',
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    color: '#4B5563',
  },
  confirmDetails: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  confirmCancel: {
    backgroundColor: '#F3F4F6',
  },
  confirmDelete: {
    backgroundColor: '#EF4444',
  },
  confirmBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadow.medium,
  },
  snackbarText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
});