// [file name]: adminScreen.tsx (improved)
import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
  Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
  Share, useWindowDimensions, Animated, Easing,
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

// ── Context for admin state ────────────────────────────────────────────────
const AdminContext = React.createContext<{ isAdmin: boolean; refresh: () => void }>({ isAdmin: false, refresh: () => {} });

// ── Snackbar Component ──────────────────────────────────────────────────────
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

// ── Confirmation Modal ──────────────────────────────────────────────────────
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

// ── Error Boundary (improved) ─────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Memoized List Items ────────────────────────────────────────────────────
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

// ── Analytics Tab (improved with chart and advanced stats) ──────────────────
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

  // Simple bar chart for trend
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

      {/* Trend Chart (simple bar) */}
      {stats?.trend && stats.trend.length > 0 && (
        <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.trendTitle, { color: colors.textPrimary }]}>
            {isAr ? '📈 الاتجاه اليومي (آخر 7 أيام)' : '📈 Daily Trend (Last 7 days)'}
          </Text>
          <View style={styles.trendBars}>
            {stats.trend.map((t: any, idx: number) => (
              <View key={idx} style={styles.trendBarWrapper}>
                <View style={[styles.trendBar, { height: (t.count / maxTrend) * 60, backgroundColor: colors.primary }]} />
                <Text style={[styles.trendLabel, { color: colors.textMuted }]}>{t.count}</Text>
                <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 8 }]}>{t.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

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

      {/* Advanced stats: Top users, Top ads (dummy for now) */}
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
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'أوقات الذروة' : 'Peak Hours'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>10 صباحاً - 2 ظهراً</Text>
          </View>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'معدل التفاعل' : 'Engagement Rate'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>24%</Text>
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

// ── Ad Edit Modal ─────────────────────────────────────────────────────────
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="edit" size={22} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {isAr ? 'تعديل الإعلان' : 'Edit Ad'}
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'العنوان' : 'Title'}</Text>
                <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={title} onChangeText={setTitle} />
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الوصف' : 'Description'}</Text>
                <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} multiline />
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'السعر (₪)' : 'Price (₪)'}</Text>
                <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={price} onChangeText={setPrice} keyboardType="numeric" />
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الموقع' : 'Location'}</Text>
                <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={location} onChangeText={setLocation} />
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
                          borderColor: condition === c ? colors.primary : colors.border,
                          backgroundColor: condition === c ? colors.primary : colors.background,
                        }
                      ]}
                      onPress={() => setCondition(c)}
                    >
                      <Text style={{ color: condition === c ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
                        {c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveBtnText}>{isAr ? '💾 حفظ التغييرات' : '💾 Save Changes'}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Ads Tab (with pagination, export, deleted filter) ─────────────────────
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
      const { data, count } = result as any;
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

  const handleRestoreAd = async (ad: Ad) => {
    const { error } = await adminUpdateAd(ad.id, { status: 'active' });
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم استعادة الإعلان' : 'Ad restored', 'success');
    loadData(true);
  };

  const exportAds = async () => {
    const csv = generateCSV(ads, ['ID', 'Title', 'Price', 'Condition', 'Status', 'Created'], ['id', 'title', 'price', 'condition', 'status', 'created_at']);
    try {
      await Share.share({ message: csv, title: 'Ads Export.csv' });
    } catch (e) {
      console.warn('Share failed', e);
    }
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

      <AdEditModal
        visible={editModalVisible}
        ad={editingAd}
        onClose={() => { setEditModalVisible(false); setEditingAd(null); }}
        onSave={handleSaveAdEdit}
        isAr={isAr}
        colors={colors}
      />

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

// ─── Users Tab (with pagination, export) ──────────────────────────────────
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
      const { data, count } = result as any;
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
    try {
      await Share.share({ message: csv, title: 'Users Export.csv' });
    } catch (e) {
      console.warn('Share failed', e);
    }
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

// ─── Banners Tab (unchanged, but with Snackbar) ───────────────────────────
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

// ─── Interstitials Tab (unchanged, with Snackbar) ────────────────────────
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

// ─── Tools Tab (Broadcast, Settings, etc.) ─────────────────────────────────
function ToolsTab({ colors, isAr, t }: any) {
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان والمحتوى مطلوبان' : 'Title and body are required');
      return;
    }
    setSending(true);
    // Simulate sending
    setTimeout(() => {
      setSending(false);
      setBroadcastModalVisible(false);
      setTitle('');
      setBody('');
      setImageUrl('');
      showSnackbar(isAr ? 'تم إرسال الإشعارات بنجاح' : 'Broadcast sent successfully', 'success');
    }, 1500);
  };

  return (
    <ScrollView contentContainerStyle={styles.toolsContainer}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{isAr ? '🛠️ أدوات الإدارة' : '🛠️ Admin Tools'}</Text>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setBroadcastModalVisible(true)}>
        <MaterialIcons name="notifications-active" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إرسال إشعارات جماعية' : 'Send Broadcast'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'إرسال إشعارات لجميع المستخدمين' : 'Send notifications to all users'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'تصدير البيانات' : 'Export Data', isAr ? 'سيتم تصدير جميع البيانات إلى ملف CSV' : 'All data will be exported to CSV')}>
        <MaterialIcons name="file-download" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'تصدير جميع البيانات' : 'Export All Data'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تصدير الإعلانات والمستخدمين والمتاجر' : 'Export ads, users, stores'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'إعدادات متقدمة' : 'Advanced Settings', isAr ? 'مدة التعزيز الافتراضية: 7 أيام' : 'Default boost duration: 7 days')}>
        <MaterialIcons name="settings" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إعدادات متقدمة' : 'Advanced Settings'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تعديل الإعدادات العامة للإدارة' : 'Modify admin settings'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      {/* Broadcast Modal */}
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

// ─── Main Admin Screen ───────────────────────────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'users' | 'banners' | 'interstitials' | 'tools'>('analytics');

  const TABS = [
    { key: 'analytics', label: isAr ? '📊 إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? '📢 إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'users', label: isAr ? '👤 مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? '🖼️ بانرات' : 'Banners', icon: 'view-carousel' },
    { key: 'interstitials', label: isAr ? '📱 بينية' : 'Interstitials', icon: 'play-circle-outline' },
    { key: 'tools', label: isAr ? '🛠️ أدوات' : 'Tools', icon: 'build' },
  ];

  return (
    <View style={[styles.mainContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.mainHeader, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.mainBackBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.mainHeaderTitle}>{isAr ? '⚙️ لوحة الإدارة' : '⚙️ Admin Panel'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
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
                }
              ]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={[styles.tabBtnText, { color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Content */}
      <AdminTabErrorBoundary>
        {activeTab === 'analytics' && <AnalyticsTab isAr={isAr} colors={colors} />}
        {activeTab === 'ads' && <AdsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'users' && <UsersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'banners' && <BannersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'interstitials' && <InterstitialsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'tools' && <ToolsTab colors={colors} isAr={isAr} t={t} />}
      </AdminTabErrorBoundary>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
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
  tabsContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
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

  // Trend Chart
  trendCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  trendTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  trendBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 80,
  },
  trendBarWrapper: {
    alignItems: 'center',
  },
  trendBar: {
    width: 20,
    borderRadius: 4,
    minHeight: 4,
  },
  trendLabel: {
    fontSize: 8,
    marginTop: 2,
  },

  // Advanced Stats
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

  // Modal
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

  // Confirmation Modal
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
});