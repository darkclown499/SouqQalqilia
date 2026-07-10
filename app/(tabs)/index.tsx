
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Dimensions, RefreshControl, ActivityIndicator, Platform, TextInput, Linking, Modal,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingOffersButton from '@/components/FloatingOffersButton';

const RECENTLY_VIEWED_KEY = 'recently_viewed_ads_v1';
const MAX_RECENTLY_VIEWED = 6;
const SEARCH_HISTORY_KEY = 'search_history_v1';
const MAX_SEARCH_HISTORY = 8;

async function loadSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveSearchHistory(query: string, current: string[]): Promise<string[]> {
  try {
    const deduped = [query, ...current.filter(q => q !== query)].slice(0, MAX_SEARCH_HISTORY);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(deduped));
    return deduped;
  } catch { return current; }
}

async function clearSearchHistory(): Promise<void> {
  try { await AsyncStorage.removeItem(SEARCH_HISTORY_KEY); } catch { /* ignore */ }
}

async function addToRecentlyViewed(ad: Ad): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: Ad[] = raw ? JSON.parse(raw) : [];
    const updated = [ad, ...existing.filter(a => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

async function removeFromRecentlyViewed(adId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: Ad[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter(a => a.id !== adId);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

async function loadRecentlyViewed(): Promise<Ad[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AdCard, EmptyState } from '@/components';
import { SkeletonHomeFeed } from '@/components/feature/SkeletonCard';
import { InterstitialAdOverlay } from '@/components/feature/InterstitialAdOverlay';
import { useAds } from '@/hooks/useAds';
import { useCategories } from '@/hooks/useCategories';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { useResponsive } from '@/hooks/useResponsive';
import { fetchActiveBanners, getBannersCache, setBannersCache, Banner } from '@/services/bannersService';
import { fetchActiveInterstitials, InterstitialAd } from '@/services/interstitialService';
import { fetchBlockedIds, subscribeToBlockChanges } from '@/services/blockService';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import { trackEvent } from '@/services/analyticsService';
import { fetchFeaturedStores, checkStoreIsOpen, Store as StoreType } from '@/services/storesService';

// Dimensions are now computed reactively via useResponsive() inside the component.
// Snapshot used only for getItemLayout estimation (close enough; recalculates on resize).
import { Dimensions as _RNDims } from 'react-native';
const _initW = _RNDims.get('window').width;
const _initHPad = _initW < 375 ? 12 : Spacing.lg;
const _initCardGap = _initW < 375 ? 8 : 10;
const _initCardW = (_initW - _initHPad * 2 - _initCardGap) / 2;
const _initImgH = Math.max(130, Math.min(Math.round(_initCardW * 0.75), 200));
const _initCardInfoH = 92;
const _initRowH = _initImgH + _initCardInfoH + _initCardGap;
let _interstitialsCache: InterstitialAd[] | null = null;

const FEATURED_STORES = [
  { id: '1', name: 'سوبرماركت التوفير', logo: 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?q=80&w=150&auto=format&fit=crop', cover: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?q=80&w=400&auto=format&fit=crop' },
  { id: '2', name: 'بوتيك الأناقة', logo: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=150&auto=format&fit=crop', cover: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=400&auto=format&fit=crop' },
  { id: '3', name: 'مطعم البيك', logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=150&auto=format&fit=crop', cover: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=400&auto=format&fit=crop' },
];

// ── Featured Stores Strip ───────────────────────────────────────────────────
function FeaturedStoresStrip({ isAr, isRTL, colors, onPress }: {
  isAr: boolean; isRTL: boolean; colors: any;
  onPress: (storeId: string) => void;
}) {
  const [stores, setStores] = React.useState<StoreType[]>([]);
  const flatRef = React.useRef<FlatList<StoreType>>(null);
  const scrollXRef = React.useRef(0);
  const isPausedRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const totalWidthRef = React.useRef(0); // estimated total scrollable width

  React.useEffect(() => {
    fetchFeaturedStores().then(({ data }) => {
      setStores(data);
      // Double the array for seamless looping when many stores are available
      if (data.length >= 3) {
        setStores([...data, ...data]);
      }
    });
  }, []);

  // W6 fix: clear any existing timer before starting a new interval so that
  // doubling the stores array (for loop) doesn't stack multiple setInterval calls.
  React.useEffect(() => {
    if (stores.length === 0) return;
    const CARD_W = 104; // card + gap
    const HALF = stores.length / 2;
    totalWidthRef.current = CARD_W * HALF;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      scrollXRef.current += 1;
      // When we have scrolled past the first copy, jump back silently
      if (scrollXRef.current >= totalWidthRef.current) {
        scrollXRef.current = 0;
        flatRef.current?.scrollToOffset({ offset: 0, animated: false });
        return;
      }
      flatRef.current?.scrollToOffset({ offset: scrollXRef.current, animated: false });
    }, 20);

    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [stores.length]);

  const resumeAfterPause = React.useCallback(() => {
    isPausedRef.current = true;
    // Resume after 4 seconds of no interaction
    const resume = setTimeout(() => { isPausedRef.current = false; }, 4000);
    return () => clearTimeout(resume);
  }, []);

  if (stores.length === 0) return null;

  return (
    <View style={fs.wrapper}>
      <View style={[fs.labelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[fs.labelDot, { backgroundColor: '#f59e0b' }]} />
        <Text style={[fs.labelText, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
          {isAr ? 'متاجر مميزة' : 'Featured Stores'}
        </Text>
        <View style={[fs.liveBadge, { backgroundColor: '#fef3c7' }]}>
          <View style={fs.liveDot} />
          <Text style={[fs.liveText, { color: '#92400e' }]}>{isAr ? 'مباشر' : 'Live'}</Text>
        </View>
      </View>
      <FlatList
        ref={flatRef}
        data={stores}
        horizontal
        keyExtractor={(item, i) => `${item.id}-${i}`}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { isPausedRef.current = true; }}
        onScrollEndDrag={(e) => {
          scrollXRef.current = e.nativeEvent.contentOffset.x;
          resumeAfterPause();
        }}
        onMomentumScrollEnd={(e) => {
          scrollXRef.current = e.nativeEvent.contentOffset.x;
        }}
        contentContainerStyle={[fs.listContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        renderItem={({ item: store }) => {
          const open = checkStoreIsOpen(store);
          const name = isAr ? (store.name_ar || store.name) : store.name;
          return (
            <Pressable
              style={({ pressed }) => [fs.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.88 : (open ? 1 : 0.5) }]}
              onPress={() => onPress(store.id)}
            >
              {/* Circular logo with live border */}
              <View style={[fs.logoWrap, {
                borderColor: open ? '#22c55e' : '#9ca3af',
                borderWidth: 2.5,
                backgroundColor: colors.surfaceTint,
              }]}>
                {store.logo_url ? (
                  <Image source={{ uri: store.logo_url }} style={fs.logo} contentFit="cover" transition={200} cachePolicy="disk" />
                ) : (
                  <MaterialIcons name="storefront" size={22} color={colors.primary} />
                )}
                {/* Status dot */}
                <View style={[fs.statusDot, { backgroundColor: open ? '#22c55e' : '#9ca3af', borderColor: colors.surface }]} />
              </View>
              <Text style={[fs.storeName, { color: colors.textPrimary }]} numberOfLines={2}>
                {name}
              </Text>
              {/* Closed label */}
              {!open ? (
                <View style={fs.closedBadge}>
                  <Text style={fs.closedBadgeText}>مغلق 🔴</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const fs = StyleSheet.create({
  wrapper: { marginBottom: Spacing.lg },
  labelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },
  labelDot: { width: 4, height: 20, borderRadius: 2 },
  labelText: { fontSize: FontSize.md + 1, fontWeight: '700', flex: 1 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  liveText: { fontSize: 11, fontWeight: '700' },
  listContent: {
    paddingHorizontal: Spacing.lg, gap: 12, paddingRight: Spacing.xl,
  },
  card: {
    width: 92, alignItems: 'center', gap: 6,
    borderRadius: Radius.xl, borderWidth: 1,
    padding: Spacing.sm, paddingTop: Spacing.md,
  },
  logoWrap: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible', position: 'relative',
  },
  logo: { width: 54, height: 54, borderRadius: 27 },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
  },
  storeName: {
    fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 15,
  },
  closedBadge: {
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  closedBadgeText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
});

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'boosted';
type Condition = 'new' | 'used' | null;

const SORT_OPTIONS: { key: SortOption; label: string; labelAr: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', labelAr: 'الأحدث', icon: 'schedule' },
  { key: 'price_asc', label: 'Price ↑', labelAr: 'سعر ↑', icon: 'trending-up' },
  { key: 'price_desc', label: 'Price ↓', labelAr: 'سعر ↓', icon: 'trending-down' },
  { key: 'boosted', label: 'Boosted', labelAr: 'معزز', icon: 'bolt' },
];

const QALQILYA_LOCATIONS = [
  'قلقيلية المدينة', 'عزون', 'كفر قدوم', 'جيوس', 'حبلة', 'كفر ثلث',
  'عزون عتمة', 'إماتين', 'كفر لاقف', 'النبي إلياس', 'جيت', 'جينصافوط',
  'حجة', 'باقة الحطب', 'الفندق', 'راس عطية', 'راس الطيرة', 'صير',
  'فلامية', 'مغارة الضبعة', 'عزبة الطبيب', 'عزبة سلمان',
  'عزبة الأشقر', 'واد الرشا', 'المدور',
];

// Tablet/desktop: 3 or 4 columns → triplet/quad rows
type FeedRow = {
  type: 'pair' | 'triple' | 'quad';
  ads: Ad[];
  id: string;
};

function buildFeedRows(ads: Ad[], numCols: number): FeedRow[] {
  const rows: FeedRow[] = [];
  let i = 0;
  while (i < ads.length) {
    const chunk = ads.slice(i, i + numCols);
    const type = numCols === 4 ? 'quad' : numCols === 3 ? 'triple' : 'pair';
    rows.push({ type, ads: chunk, id: chunk[0].id });
    i += numCols;
  }
  return rows;
}

function FeaturedVIPStrip({ isRTL, colors }: { isRTL: boolean; colors: any }) {
  return (
    <View style={vip.container}>
      <View style={[vip.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[vip.title, { color: colors.textPrimary }]}>⭐ متاجر مميزة</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={vip.scrollContent} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
        {FEATURED_STORES.map((store) => (
          <Pressable key={store.id} style={[vip.card, isRTL ? { transform: [{ scaleX: -1 }] } : undefined]}>
            <Image source={{ uri: store.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
            <View style={vip.vipBadge}><Text style={vip.vipBadgeText}>VIP</Text></View>
            <View style={vip.cardContent}>
              <View style={vip.logoWrap}><Image source={{ uri: store.logo }} style={vip.logo} /></View>
              <Text style={vip.storeName} numberOfLines={1}>{store.name}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { categories } = useCategories();
  const { ads, loading, loadingMore, hasMore, load, loadMore } = useAds();
  const { hPad, cardGap, cardWidth, cardWidthLg, numColumns, bannerHeight, isTablet, isDesktop } = useResponsive();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();

  const [isOnline, setIsOnline] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Ad[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [banners, setBanners] = useState<Banner[]>(() => getBannersCache('home') ?? []);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterVisible, setFilterVisible] = useState(false);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const [draftArea, setDraftArea] = useState<string | null>(null);
  const [draftMaxPrice, setDraftMaxPrice] = useState('');
  const [draftCondition, setDraftCondition] = useState<Condition>(null);
  const [appliedArea, setAppliedArea] = useState<string | null>(null);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState<number | undefined>(undefined);
  const [appliedCondition, setAppliedCondition] = useState<Condition>(null);

  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>(_interstitialsCache ?? []);
  const [activeInterstitial, setActiveInterstitial] = useState<InterstitialAd | null>(null);
  const [interstitialVisible, setInterstitialVisible] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [totalAdsCount, setTotalAdsCount] = useState(0);

  // ── Notification bell state ───────────────────────────────────────────────
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<Array<{
    id: string;
    conversationId: string;
    senderName: string;
    messagePreview: string;
    createdAt: string;
  }>>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const fetchUnreadMessages = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('messages')
        .select(`
          id, content, message_type, conversation_id, created_at,
          conversations!inner(buyer_id, seller_id),
          user_profiles!messages_sender_id_fkey(username, email)
        `)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`, { referencedTable: 'conversations' })
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setUnreadMessages(data.map((m: any) => ({
          id: m.id,
          conversationId: m.conversation_id,
          senderName: m.user_profiles?.username || m.user_profiles?.email?.split('@')[0] || 'مستخدم',
          messagePreview: m.message_type === 'image' ? '📷 صورة' : (m.content?.slice(0, 60) ?? ''),
          createdAt: m.created_at,
        })));
      }
    } catch { /* silent */ } finally {
      setNotifLoading(false);
    }
  }, [user]);

  const handleBellPress = useCallback(() => {
    setNotifModalVisible(true);
    fetchUnreadMessages();
  }, [fetchUnreadMessages]);
  const appStartTime = useRef(Date.now());
  const interstitialShown = useRef(false);

  const activeFilterCount = [appliedArea, appliedMaxPrice !== undefined ? '1' : null, appliedCondition].filter(Boolean).length;
  const isAr = language === 'ar';

  useEffect(() => {
    NetInfo.fetch().then(s => setIsOnline(s.isConnected !== false));
    const unsub = NetInfo.addEventListener(s => setIsOnline(s.isConnected !== false));
    return unsub;
  }, []);

  useEffect(() => {
    loadRecentlyViewed().then(setRecentlyViewed);
    loadSearchHistory().then(setSearchHistory);
  }, []);

  useEffect(() => {
    getSupabaseClient()
      .from('ads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .then(({ count }) => { if (count !== null) setTotalAdsCount(count); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) fetchBlockedIds().then(ids => setBlockedIds(new Set(ids)));
  }, [user?.id]);

  useEffect(() => {
    const unsub = subscribeToBlockChanges(() => {
      if (user) fetchBlockedIds().then(ids => setBlockedIds(new Set(ids)));
    });
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    load({
      categoryId: selectedCategory ?? undefined,
      location: appliedArea ?? undefined,
      maxPrice: appliedMaxPrice,
      condition: appliedCondition ?? undefined,
      sortBy,
    });
  }, [selectedCategory, sortBy, appliedArea, appliedMaxPrice, appliedCondition, load]);

  useEffect(() => {
    if (!getBannersCache('home')) {
      fetchActiveBanners('home').then(({ data }) => {
        if (data.length > 0) { setBannersCache(data, 'home'); setBanners(data); }
      });
    } else {
      setBanners(getBannersCache('home') ?? []);
    }
    if (!_interstitialsCache) {
      fetchActiveInterstitials().then(({ data }) => {
        if (data.length > 0) { _interstitialsCache = data; setInterstitials(data); }
      });
    }
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setFeaturedIndex(i => (i + 1) % banners.length), 3500);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    if (interstitials.length === 0 || interstitialShown.current) return;
    const check = setInterval(() => {
      if (interstitialShown.current) { clearInterval(check); return; }
      const elapsed = (Date.now() - appStartTime.current) / 1000;
      const ad = interstitials[0];
      if (elapsed >= ad.show_after_seconds) {
        clearInterval(check);
        interstitialShown.current = true;
        setActiveInterstitial(ad);
        setInterstitialVisible(true);
      }
    }, 5000);
    return () => clearInterval(check);
  }, [interstitials]);

  const displayName = user?.username || user?.email?.split('@')[0] || '';
  const appTitle = isAr ? 'سوق قلقيلية' : 'Souq Qalqilya';

  const filteredAds = useMemo(() => ads.filter(ad => !blockedIds.has(ad.user_id)), [ads, blockedIds]);
  const feedRows = useMemo(() => buildFeedRows(filteredAds, numColumns), [filteredAds, numColumns]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadMore({
        categoryId: selectedCategory ?? undefined,
        location: appliedArea ?? undefined,
        maxPrice: appliedMaxPrice,
        condition: appliedCondition ?? undefined,
        sortBy,
      });
    }
  }, [loadingMore, hasMore, selectedCategory, appliedArea, appliedMaxPrice, appliedCondition, sortBy, loadMore]);

  const handleRefresh = useCallback(() => {
    load({
      categoryId: selectedCategory ?? undefined,
      location: appliedArea ?? undefined,
      maxPrice: appliedMaxPrice,
      condition: appliedCondition ?? undefined,
      sortBy,
    });
  }, [load, selectedCategory, appliedArea, appliedMaxPrice, appliedCondition, sortBy]);

  const handleCategoryPress = useCallback((id: string | null) => {
    setSelectedCategory(id);
  }, []);

  const handleOpenFilter = useCallback(() => {
    setDraftArea(appliedArea);
    setDraftMaxPrice(appliedMaxPrice !== undefined ? String(appliedMaxPrice) : '');
    setDraftCondition(appliedCondition);
    setFilterVisible(true);
  }, [appliedArea, appliedMaxPrice, appliedCondition]);

  const handleApplyFilters = useCallback(() => {
    const parsedMax = draftMaxPrice.trim() ? parseFloat(draftMaxPrice) : undefined;
    setAppliedArea(draftArea);
    setAppliedMaxPrice(isNaN(parsedMax as number) ? undefined : parsedMax);
    setAppliedCondition(draftCondition);
    setFilterVisible(false);
  }, [draftMaxPrice, draftArea, draftCondition]);

  const handleClearFilters = useCallback(() => {
    setDraftArea(null);
    setDraftMaxPrice('');
    setDraftCondition(null);
    setAppliedArea(null);
    setAppliedMaxPrice(undefined);
    setAppliedCondition(null);
  }, []);

  const handleAdView = useCallback((ad: Ad) => {
    addToRecentlyViewed(ad);
    setRecentlyViewed(prev => [ad, ...prev.filter((a: Ad) => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED));
  }, []);

  const handleRecentAdPress = useCallback((ad: Ad) => {
    handleAdView(ad);
    router.push(`/ad/${ad.id}`);
  }, [handleAdView, router]);

  const handleRemoveRecent = useCallback((adId: string) => {
    removeFromRecentlyViewed(adId);
    setRecentlyViewed(prev => prev.filter(a => a.id !== adId));
  }, []);

  const handleClearAllRecent = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY);
      setRecentlyViewed([]);
    } catch { /* ignore */ }
  }, []);

  const handleSearchHistoryChipPress = useCallback((query: string) => {
    saveSearchHistory(query, searchHistory).then(setSearchHistory);
    router.push({ pathname: '/search', params: { q: query } } as any);
  }, [searchHistory, router]);

  const handleClearSearchHistory = useCallback(async () => {
    await clearSearchHistory();
    setSearchHistory([]);
  }, []);

  // ── Reactive row height for getItemLayout (W1 fix) ───────────────────────────
  // Derived from live useResponsive() values so it adapts correctly on rotation,
  // tablet split-screen, and desktop resizing — not stale from module load time.
  const rowHeight = useMemo(() => {
    const cw = (isTablet || isDesktop) ? cardWidthLg : cardWidth;
    const imgH = Math.max(130, Math.min(Math.round(cw * 0.75), 200));
    return imgH + _initCardInfoH + _initCardGap;
  }, [cardWidth, cardWidthLg, isTablet, isDesktop]);

  // Card width depends on number of columns
  const activeCardWidth = (isTablet || isDesktop) ? cardWidthLg : cardWidth;

  const renderRow = useCallback(({ item }: { item: FeedRow }) => {
    const cols = item.ads.length;
    return (
      <View style={[styles.pairRow, { flexDirection: isRTL ? 'row-reverse' : 'row', gap: cardGap, marginBottom: cardGap, paddingHorizontal: hPad }]}>
        {item.ads.map(ad => (
          <View key={ad.id} style={styles.adWrapper}>
            <AdCard
              ad={ad}
              width={activeCardWidth}
              isFavorited={favIds.has(ad.id)}
              onFavoritePress={user ? toggleFav : undefined}
              onAdPress={handleAdView}
            />
          </View>
        ))}
        {/* Fill empty cells to maintain grid alignment */}
        {Array.from({ length: numColumns - cols }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.adWrapper} />
        ))}
      </View>
    );
  }, [isRTL, favIds, user, toggleFav, handleAdView, cardGap, hPad, activeCardWidth, numColumns]);

  const currentBanner = banners[featuredIndex] ?? banners[0];
  const handleFeaturedStorePress = useCallback((storeId: string) => {
    router.push(`/store/${storeId}` as any);
  }, [router]);

  // FeaturedStoresStrip is kept as a stable node outside ListHeader useMemo
  // so its internal auto-scroll interval never resets when ads list changes.
  const featuredStoresNode = (
    <FeaturedStoresStrip
      isAr={isAr}
      isRTL={isRTL}
      colors={colors}
      onPress={handleFeaturedStorePress}
    />
  );

  const ListHeader = useMemo(() => (
    <>
      {/* ── BANNER ── */}
      {currentBanner ? (
        <Pressable
          style={[styles.bannerWrap, { height: bannerHeight, marginHorizontal: hPad, marginTop: Spacing.md }]}
          onPress={() => {
            trackEvent('banner_click').catch(() => {});
            if (currentBanner.link_url?.trim()) {
              Linking.openURL(currentBanner.link_url.trim()).catch(() => {});
            } else {
              router.push('/search');
            }
          }}
        >
          <Image
            source={{ uri: currentBanner.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
            cachePolicy="disk"
            priority="high"
          />
          {(currentBanner.title || currentBanner.subtitle) ? (
            <View style={[styles.bannerContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.bannerTitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                {currentBanner.title}
              </Text>
              {currentBanner.subtitle ? (
                <Text style={[styles.bannerSubtitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {currentBanner.subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
        <FeaturedVIPStrip isRTL={isRTL} colors={colors} />
      ) : null}

      {/* ── FEATURED STORES STRIP: rendered as a stable component reference ──
           NOT inlined here to prevent remounting the auto-scroll interval
           every time filteredAds.length or other dependencies change. ── */}
      {featuredStoresNode}

      {/* ── RECENTLY VIEWED ── */}
      {recentlyViewed.length > 0 ? (
        <View style={styles.recentSection}>
          <View style={[styles.sectionHeaderRow, { flexDirection: isAr ? 'row-reverse' : 'row', paddingHorizontal: hPad }]}>
            <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left' }]}>
              {isAr ? 'آخر المشاهدات' : 'Recently Viewed'}
            </Text>
            <Pressable
              onPress={handleClearAllRecent}
              hitSlop={8}
              style={[styles.clearHistoryBtn, { backgroundColor: colors.surfaceTint }]}
            >
              <MaterialIcons name="delete-sweep" size={13} color={colors.error ?? '#EF4444'} />
              <Text style={[styles.clearHistoryText, { color: colors.error ?? '#EF4444' }]}>
                {isAr ? 'حذف الجميع' : 'Clear all'}
              </Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.recentList, { flexDirection: isRTL ? 'row-reverse' : 'row', paddingHorizontal: hPad }]}>
            {recentlyViewed.map(ad => {
              const thumb = (ad.ad_images ?? []).sort((a: any, b: any) => a.position - b.position)[0]?.url;
              return (
                <View key={ad.id} style={styles.recentCardWrap}>
                  <Pressable
                    style={({ pressed }) => [styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                    onPress={() => handleRecentAdPress(ad)}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.recentImg} contentFit="cover" transition={200} cachePolicy="disk" />
                    ) : (
                      <View style={[styles.recentImgPh, { backgroundColor: colors.surfaceTint }]}>
                        <MaterialIcons name="image" size={22} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.recentInfo}>
                      <Text style={[styles.recentTitle, { color: colors.textSecondary }]} numberOfLines={2}>{ad.title}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[styles.recentRemoveBtn, { backgroundColor: colors.error }]}
                    onPress={() => handleRemoveRecent(ad.id)}
                    hitSlop={4}
                  >
                    <MaterialIcons name="close" size={10} color="#fff" />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ── CATEGORIES ── */}
      <View style={[styles.sectionHeaderRow, { flexDirection: isAr ? 'row-reverse' : 'row', paddingHorizontal: hPad }]}>
        <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
        <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left' }]}>{t.categories}</Text>
        <Pressable style={[styles.seeAllBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.push('/(tabs)/categories')} hitSlop={6}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>{t.seeAll}</Text>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={15} color={colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.catOuter, { marginHorizontal: -hPad }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          contentContainerStyle={[styles.catContent, { flexDirection: 'row', paddingHorizontal: hPad }]}
        >
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Pressable
              style={[styles.catChip, selectedCategory === null
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}
              onPress={() => handleCategoryPress(null)}
            >
              <MaterialIcons name="apps" size={14} color={selectedCategory === null ? '#fff' : colors.textMuted} />
              <Text style={[styles.catChipText, { color: selectedCategory === null ? '#fff' : colors.textSecondary, fontWeight: selectedCategory === null ? '700' : '500' }]}>{t.all}</Text>
            </Pressable>
          </View>
          {(isRTL ? [...categories].reverse() : categories).map(cat => {
            const isSelected = selectedCategory === cat.id;
            return (
              <View key={cat.id} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                <Pressable
                  style={[styles.catChip, isSelected
                    ? { backgroundColor: cat.color, borderColor: cat.color }
                    : { backgroundColor: cat.color + '12', borderColor: cat.color + '45' }]}
                  onPress={() => handleCategoryPress(cat.id === selectedCategory ? null : cat.id)}
                >
                  <MaterialIcons name={cat.icon as any} size={14} color={isSelected ? '#fff' : cat.color} />
                  <Text style={[styles.catChipText, { color: isSelected ? '#fff' : colors.textSecondary, fontWeight: isSelected ? '700' : '500' }]}>
                    {getCategoryName(cat, language)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* ── SEARCH HISTORY CHIPS ── */}
      {searchHistory.length > 0 ? (
        <View style={[styles.historySection, { paddingHorizontal: hPad }]}>
          <View style={[styles.historyHeaderRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left' }]}>
              {isAr ? 'عمليات البحث السابقة' : 'Recent Searches'}
            </Text>
            <Pressable onPress={handleClearSearchHistory} hitSlop={8} style={[styles.clearHistoryBtn, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="delete-sweep" size={13} color={colors.textMuted} />
              <Text style={[styles.clearHistoryText, { color: colors.textMuted }]}>{isAr ? 'مسح الكل' : 'Clear all'}</Text>
            </Pressable>
          </View>
          <View style={styles.historyChips}>
            {searchHistory.map((q, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.historyChip, { backgroundColor: pressed ? colors.primary : colors.surface, borderColor: pressed ? colors.primary : colors.border }]}
                onPress={() => handleSearchHistoryChipPress(q)}
              >
                <MaterialIcons name="search" size={12} color={colors.textMuted} />
                <Text style={[styles.historyChipText, { color: colors.textSecondary }]} numberOfLines={1}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── LISTINGS HEADER ── */}
      <View style={[styles.listingsHeader, { flexDirection: isAr ? 'row-reverse' : 'row', borderTopColor: colors.borderLight, paddingHorizontal: hPad }]}>
        <View style={[styles.sectionAccent, { backgroundColor: colors.accent }]} />
        <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'جميع الإعلانات' : 'All Listings'}</Text>
        <View style={[styles.countPill, { backgroundColor: colors.primaryGhost }]}>
          <Text style={[styles.countPillText, { color: colors.primary }]}>
            {activeFilterCount > 0 ? filteredAds.length : (totalAdsCount > 0 ? totalAdsCount : filteredAds.length)}
          </Text>
        </View>
        {sortBy !== 'newest' ? (
          <View style={[styles.activeSortPill, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="sort" size={11} color="#fff" />
            <Text style={styles.activeSortText}>{isAr ? SORT_OPTIONS.find(s => s.key === sortBy)?.labelAr : SORT_OPTIONS.find(s => s.key === sortBy)?.label}</Text>
            <Pressable onPress={() => setSortBy('newest')} hitSlop={6}><MaterialIcons name="close" size={11} color="#fff" /></Pressable>
          </View>
        ) : null}
        {activeFilterCount > 0 ? (
          <Pressable
            style={[styles.activeSortPill, { backgroundColor: colors.accent, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={handleOpenFilter}
          >
            <MaterialIcons name="filter-list" size={11} color="#fff" />
            <Text style={styles.activeSortText}>
              {activeFilterCount} {isAr ? 'فلتر' : activeFilterCount === 1 ? 'filter' : 'filters'}
            </Text>
            <Pressable onPress={handleClearFilters} hitSlop={6}><MaterialIcons name="close" size={11} color="#fff" /></Pressable>
          </Pressable>
        ) : null}
      </View>
    </>
  ), [currentBanner, banners, featuredIndex, isRTL, colors, t, categories, selectedCategory, language, sortBy, totalAdsCount, recentlyViewed, searchHistory, activeFilterCount, handleCategoryPress, handleRecentAdPress, handleRemoveRecent, handleClearAllRecent, handleSearchHistoryChipPress, handleClearSearchHistory, handleOpenFilter, handleClearFilters, featuredStoresNode, router, setSortBy]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary, overflow: 'hidden' }]}>
        {/* Decorative circles */}
        <View style={styles.headerDeco1} pointerEvents="none" />
        <View style={styles.headerDeco2} pointerEvents="none" />

        <View style={[styles.headerTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.appBrand, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.appBrandDot} />
              <Text style={styles.appBrandLabel}>{isAr ? 'السوق الرسمي' : 'Official Marketplace'}</Text>
            </View>
            <Text style={[styles.appName, { textAlign: isRTL ? 'right' : 'left' }]}>{appTitle}</Text>
            {displayName ? (
              <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? `أهلاً، ${displayName} 👋` : `Hi, ${displayName} 👋`}
              </Text>
            ) : (
              <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'اكتشف أفضل العروض 🛍️' : 'Discover great deals 🛍️'}
              </Text>
            )}
          </View>

          <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable
              style={[styles.headerIconBtn, activeFilterCount > 0 && { backgroundColor: 'rgba(255,255,255,0.28)' }]}
              onPress={handleOpenFilter}
              hitSlop={6}
            >
              <MaterialIcons name="tune" size={20} color="#fff" />
              {activeFilterCount > 0 ? (
                <View style={styles.filterDot}>
                  <Text style={styles.filterDotText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={handleBellPress} hitSlop={6}>
              <MaterialIcons name="notifications" size={20} color="#fff" />
              {unreadMessages.length > 0 && !notifModalVisible ? (
                <View style={styles.filterDot}>
                  <Text style={styles.filterDotText}>
                    {unreadMessages.length > 9 ? '9+' : String(unreadMessages.length)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={() => router.push('/ai-support')} hitSlop={6}>
              <MaterialIcons name="smart-toy" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Stats chips */}
        <View style={[styles.headerStatsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {totalAdsCount > 0 ? (
            <View style={styles.headerStatChip}>
              <MaterialIcons name="storefront" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.headerStatText}>
                {totalAdsCount.toLocaleString()} {isAr ? 'إعلان نشط' : 'active listings'}
              </Text>
            </View>
          ) : null}
          <View style={styles.headerStatChip}>
            <MaterialIcons name="location-on" size={11} color="rgba(255,255,255,0.85)" />
            <Text style={styles.headerStatText}>{isAr ? 'قلقيلية والمحيط' : 'Qalqilya Region'}</Text>
          </View>
          {activeFilterCount > 0 ? (
            <View style={[styles.headerStatChip, { backgroundColor: 'rgba(245,158,11,0.3)' }]}>
              <MaterialIcons name="filter-list" size={11} color="#FDE68A" />
              <Text style={[styles.headerStatText, { color: '#FDE68A' }]}>
                {activeFilterCount} {isAr ? 'فلتر نشط' : activeFilterCount === 1 ? 'filter' : 'filters'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Search bar */}
        <Pressable
          style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.96)', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={() => router.push('/search')}
        >
          <View style={[styles.searchIconWrap, { backgroundColor: colors.primary + '22' }]}>
            <MaterialIcons name="search" size={16} color={isDark ? 'rgba(255,255,255,0.7)' : colors.primary} />
          </View>
          <Text style={[styles.searchPlaceholder, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t.searchPlaceholder}
          </Text>
          <View style={[styles.filterChipInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.primaryGhost }]}>
            <MaterialIcons name="filter-list" size={13} color={isDark ? 'rgba(255,255,255,0.7)' : colors.primary} />
            <Text style={[styles.filterChipText, { color: isDark ? 'rgba(255,255,255,0.7)' : colors.primary }]}>{isAr ? 'فلتر' : 'Filter'}</Text>
          </View>
        </Pressable>

     {/* ── إغلاق الهيدر العلوي بنجاح ── */}
      </View>

      {/* ── OFFLINE BANNER ── */}
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={15} color="#92400E" />
          <Text style={styles.offlineBannerText}>
            {isAr ? 'أنت غير متصل — يتم عرض البيانات المحفوظة' : 'You are offline — showing cached data'}
          </Text>
        </View>
      ) : null}

      {/* ── CONTENT ── */}
      {loading && ads.length === 0 ? (
        <SkeletonHomeFeed />
      ) : (
        <FlatList
          data={feedRows}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={[styles.listContent, { paddingBottom: 36 }]}
          showsVerticalScrollIndicator={false}
          windowSize={11}
          maxToRenderPerBatch={4}
          initialNumToRender={4}
          updateCellsBatchingPeriod={30}
          key={numColumns}
          removeClippedSubviews={false}
          getItemLayout={(_data, index) => ({
            length: rowHeight,
            offset: rowHeight * index,
            index,
          })}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={ListHeader}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                style={[styles.loadMoreBtn, { backgroundColor: colors.surface, borderColor: colors.primary, marginHorizontal: hPad }]}
                onPress={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <MaterialIcons name="expand-more" size={20} color={colors.primary} />
                )}
                <Text style={[styles.loadMoreBtnText, { color: colors.primary }]}>
                  {loadingMore
                    ? (isAr ? 'جاري التحميل...' : 'Loading...')
                    : (isAr ? 'عرض المزيد' : 'Show More')}
                </Text>
              </Pressable>
            ) : ads.length > 0 ? (
              <View style={styles.endOfList}>
                <MaterialIcons name="check-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.endOfListText, { color: colors.textMuted }]}>
                  {isAr ? 'تم عرض جميع الإعلانات' : 'All listings shown'}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? <EmptyState icon="storefront" title={t.noListings} subtitle={t.noListingsSub} /> : null
          }
        />
      )}

      <InterstitialAdOverlay ad={activeInterstitial} visible={interstitialVisible} onClose={() => setInterstitialVisible(false)} />

      {/* ── NOTIFICATION MODAL ── */}
      <Modal
        visible={notifModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={nStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotifModalVisible(false)} />
          <View style={[nStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[nStyles.handle, { backgroundColor: colors.border }]} />

            {/* Modal Header */}
            <View style={[nStyles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <View style={[nStyles.titleIcon, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="notifications" size={20} color={colors.primary} />
              </View>
              <Text style={[nStyles.titleText, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'الرسائل غير المقروءة' : 'Unread Messages'}
              </Text>
              <Pressable onPress={() => setNotifModalVisible(false)} hitSlop={10}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Content */}
            {notifLoading ? (
              <View style={nStyles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : unreadMessages.length === 0 ? (
              <View style={nStyles.emptyWrap}>
                <MaterialIcons name="mark-chat-read" size={44} color={colors.textMuted} />
                <Text style={[nStyles.emptyText, { color: colors.textMuted }]}>
                  {isAr ? 'لا توجد رسائل غير مقروءة' : 'No unread messages'}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={nStyles.listContent}>
                {unreadMessages.map((msg) => (
                  <Pressable
                    key={msg.id}
                    style={({ pressed }) => [nStyles.notifItem, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.borderLight }]}
                    onPress={() => {
                      setNotifModalVisible(false);
                      router.push(`/chat/${msg.conversationId}` as any);
                    }}
                  >
                    <View style={[nStyles.notifAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={nStyles.notifAvatarText}>
                        {msg.senderName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[nStyles.notifBody, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                      <Text style={[nStyles.notifTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                        {isAr ? `تم إرسال رسالة من ${msg.senderName}` : `Message from ${msg.senderName}`}
                      </Text>
                      <Text style={[nStyles.notifPreview, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                        {msg.messagePreview}
                      </Text>
                    </View>
                    <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── FILTER BOTTOM SHEET ── */}
      {filterVisible ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]} pointerEvents="box-none">
          <Pressable style={fStyles.overlay} onPress={() => setFilterVisible(false)} />
          <View style={[fStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[fStyles.handle, { backgroundColor: colors.border }]} />

            <View style={[fStyles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="tune" size={20} color={colors.primary} />
              <Text style={[fStyles.sheetTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'فلترة الإعلانات' : 'Filter Listings'}
              </Text>
              <Pressable onPress={handleClearFilters} hitSlop={8}>
                <Text style={[fStyles.clearAll, { color: colors.error }]}>{isAr ? 'مسح الكل' : 'Clear all'}</Text>
              </Pressable>
            </View>

            <Text style={[fStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'المنطقة أو القرية' : 'Area / Village'}
            </Text>
            <Pressable
              style={({ pressed }) => [fStyles.areaSelector, { borderColor: draftArea ? colors.primary : colors.border, backgroundColor: pressed ? colors.primaryGhost : colors.background, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => setAreaPickerVisible(true)}
            >
              <View style={[fStyles.areaSelectorIcon, { backgroundColor: draftArea ? colors.primary : colors.surfaceTint }]}>
                <MaterialIcons name={draftArea === 'قلقيلية المدينة' ? 'location-city' : 'location-on'} size={14} color={draftArea ? '#fff' : colors.textMuted} />
              </View>
              <Text style={[fStyles.areaSelectorText, { color: draftArea ? colors.primary : colors.textMuted, flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                {draftArea ?? (isAr ? 'جميع المناطق' : 'All areas')}
              </Text>
              {draftArea ? (
                <Pressable onPress={() => setDraftArea(null)} hitSlop={6}>
                  <MaterialIcons name="close" size={16} color={colors.primary} />
                </Pressable>
              ) : (
                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.textMuted} />
              )}
            </Pressable>

            <Text style={[fStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'الحالة' : 'Condition'}
            </Text>
            <View style={[fStyles.condRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {([null, 'new', 'used'] as Condition[]).map(c => {
                const isSelected = draftCondition === c;
                const label = c === null ? (isAr ? 'الكل' : 'All') : c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used');
                return (
                  <Pressable
                    key={c ?? 'all'}
                    style={[fStyles.condChip, { flex: 1, backgroundColor: isSelected ? colors.primary : colors.background, borderColor: isSelected ? colors.primary : colors.border }]}
                    onPress={() => setDraftCondition(c)}
                  >
                    {c !== null ? <MaterialIcons name={c === 'new' ? 'fiber-new' : 'recycling'} size={14} color={isSelected ? '#fff' : colors.textMuted} /> : null}
                    <Text style={[fStyles.condText, { color: isSelected ? '#fff' : colors.textSecondary, fontWeight: isSelected ? '700' : '500' }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[fStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'الحد الأقصى للسعر (₪)' : 'Max Price (₪)'}
            </Text>
            <TextInput
              style={[fStyles.priceInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={isAr ? 'أي سعر' : 'Any price'}
              placeholderTextColor={colors.textMuted}
              value={draftMaxPrice}
              onChangeText={setDraftMaxPrice}
              keyboardType="numeric"
            />

            <Pressable style={[fStyles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApplyFilters}>
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={fStyles.applyBtnText}>{isAr ? 'تطبيق الفلاتر' : 'Apply Filters'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── AREA PICKER MODAL ── */}
      {areaPickerVisible ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 200 }]} pointerEvents="box-none">
          <Pressable style={fStyles.overlay} onPress={() => setAreaPickerVisible(false)} />
          <View style={[fStyles.areaSheet, { backgroundColor: colors.surface }]}>
            <View style={[fStyles.handle, { backgroundColor: colors.border }]} />
            <View style={[fStyles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="location-on" size={20} color={colors.primary} />
              <Text style={[fStyles.sheetTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'اختر المنطقة' : 'Select Area'}
              </Text>
              <Pressable onPress={() => setAreaPickerVisible(false)} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={fStyles.areaList}>
              <Pressable
                style={({ pressed }) => [fStyles.areaItem, { borderColor: draftArea === null ? colors.primary : colors.borderLight, backgroundColor: draftArea === null ? colors.primaryGhost : (pressed ? colors.surfaceTint : colors.background) }]}
                onPress={() => { setDraftArea(null); setAreaPickerVisible(false); }}
              >
                <View style={[fStyles.areaIcon, { backgroundColor: draftArea === null ? colors.primary : colors.surfaceTint }]}>
                  <MaterialIcons name="location-searching" size={16} color={draftArea === null ? '#fff' : colors.textMuted} />
                </View>
                <Text style={[fStyles.areaText, { color: draftArea === null ? colors.primary : colors.textPrimary, fontWeight: draftArea === null ? '700' : '500' }]}>
                  {isAr ? 'جميع المناطق' : 'All Areas'}
                </Text>
                {draftArea === null ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}
              </Pressable>
              {QALQILYA_LOCATIONS.map(loc => {
                const isSel = draftArea === loc;
                const isMainCity = loc === 'قلقيلية المدينة';
                return (
                  <Pressable
                    key={loc}
                    style={({ pressed }) => [fStyles.areaItem, { borderColor: isSel ? colors.primary : colors.borderLight, backgroundColor: isSel ? colors.primaryGhost : (pressed ? colors.surfaceTint : colors.background) }]}
                    onPress={() => { setDraftArea(loc); setAreaPickerVisible(false); }}
                  >
                    <View style={[fStyles.areaIcon, { backgroundColor: isSel ? colors.primary : (isMainCity ? colors.primaryGhost : colors.surfaceTint) }]}>
                      <MaterialIcons name={isMainCity ? 'location-city' : 'location-on'} size={16} color={isSel ? '#fff' : (isMainCity ? colors.primary : colors.textMuted)} />
                    </View>
                    <Text style={[fStyles.areaText, { color: isSel ? colors.primary : colors.textPrimary, fontWeight: isSel ? '700' : '500', flex: 1 }]}>{loc}</Text>
                    {isMainCity && !isSel ? (
                      <View style={[fStyles.cityBadge, { backgroundColor: colors.primaryGhost }]}>
                        <Text style={[fStyles.cityBadgeText, { color: colors.primary }]}>{isAr ? 'مدينة' : 'City'}</Text>
                      </View>
                    ) : null}
                    {isSel ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
    <FloatingOffersButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  offlineBannerText: {
    color: '#92400E', fontSize: FontSize.xs, fontWeight: '600', flex: 1,
  },

  filterDot: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
  },
  filterDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  headerTop: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerLeft: { flex: 1, gap: 2 },
  greeting: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '500',
    marginTop: 2,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  headerActions: { gap: 8 },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    height: 48,
    paddingHorizontal: Spacing.sm,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  searchIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPlaceholder: { flex: 1, fontSize: FontSize.sm },
  filterChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '700' },

  sortBar: { marginTop: Spacing.sm },
  sortBarContent: { gap: Spacing.sm, paddingBottom: 2, paddingTop: 2 },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  sortChipText: { fontSize: FontSize.xs },

  bannerWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    position: 'relative',
    backgroundColor: '#0A6E5C',
    ...Shadow.lg,
  },
  bannerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: 6,
  },
  bannerTitle: {
    fontSize: FontSize.xl + 2,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bannerSubtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerDots: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    gap: 5,
  },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bannerDotActive: { backgroundColor: '#fff', width: 22, borderRadius: 4 },

  recentSection: { marginBottom: Spacing.lg },
  recentList: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  recentCardWrap: {
    position: 'relative',
    width: 120,
  },
  recentCard: {
    width: 120,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recentRemoveBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  recentImg: { width: 120, height: 88 },
  recentImgPh: {
    width: 120,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInfo: { padding: 8, gap: 3 },
  recentTitle: { fontSize: FontSize.xs, fontWeight: '600', lineHeight: 15 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionIconDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontSize: FontSize.md + 1,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: { fontSize: FontSize.sm, fontWeight: '600' },

  catOuter: {
    marginBottom: Spacing.lg,
  },
  catContent: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  catChipText: { fontSize: FontSize.xs },

  listingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderTopWidth: 1,
  },
  countPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  countPillText: { fontSize: FontSize.xs, fontWeight: '700' },
  activeSortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 4,
  },
  activeSortText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },

  listContent: { paddingTop: 0 },
  pairRow: {
    flexDirection: 'row',
  },
  adWrapper: { flex: 1 },

  // ── Load More button ──
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 8, marginTop: 4,
    paddingVertical: 13, borderRadius: Radius.xl, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  loadMoreBtnText: { fontSize: FontSize.md, fontWeight: '700' },

  endOfList: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  endOfListText: { fontSize: FontSize.sm, fontWeight: '500' },

  // ── Search history ──
  historySection: { marginBottom: Spacing.lg },
  historyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  clearHistoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5,
  },
  clearHistoryText: { fontSize: FontSize.xs, fontWeight: '600' },
  historyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  historyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  historyChipText: { fontSize: FontSize.xs, fontWeight: '600', maxWidth: 130 },

  // ── Header enhancements ─────────────────────────────────────────────────────
  headerDeco1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -85, right: -55,
  },
  headerDeco2: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: 12, left: -28,
  },
  appBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  appBrandDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F59E0B' },
  appBrandLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600', letterSpacing: 0.5 },
  headerStatsRow: { flexDirection: 'row', gap: 7, marginBottom: Spacing.md, flexWrap: 'wrap' },
  headerStatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  headerStatText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  sectionAccent: { width: 4, height: 20, borderRadius: 2 },
});

// ── Notification Modal Styles ─────────────────────────────────────────────────
const nStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 48,
    maxHeight: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, marginBottom: 4,
  },
  titleIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  titleText: { fontSize: FontSize.lg, fontWeight: '700' },
  loadingWrap: { padding: 40, alignItems: 'center' },
  emptyWrap: { padding: 48, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm, paddingBottom: 8 },
  notifItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1,
  },
  notifAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  notifBody: { flex: 1, gap: 3 },
  notifTitle: { fontSize: FontSize.sm, fontWeight: '700', lineHeight: 18 },
  notifPreview: { fontSize: FontSize.xs, lineHeight: 16 },
});

// ── Filter Sheet Styles ────────────────────────────────────────────────────────
const fStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 12,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  titleRow: { alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: 1 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  clearAll: { fontSize: FontSize.xs, fontWeight: '700' },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: -4 },
  areaSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 11, paddingHorizontal: 12 },
  areaSelectorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  areaSelectorText: { fontSize: FontSize.md, fontWeight: '600' },
  condRow: { flexDirection: 'row', gap: Spacing.sm },
  condChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11, borderRadius: Radius.md, borderWidth: 1.5,
  },
  condText: { fontSize: FontSize.sm },
  priceInput: {
    height: 48, borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, fontSize: FontSize.md,
  },
  applyBtn: {
    height: 50, borderRadius: Radius.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 4,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
  areaSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 40, maxHeight: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 24,
  },
  areaList: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  areaItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5 },
  areaIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  areaText: { fontSize: FontSize.md },
  cityBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  cityBadgeText: { fontSize: 10, fontWeight: '700' },
});
const vip = StyleSheet.create({
  container: { marginTop: 16, marginBottom: 8 },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '900' },
  scrollContent: { paddingHorizontal: 16, gap: 12 },
  card: { width: 130, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  vipBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  vipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  cardContent: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 10 },
  logoWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', padding: 2, marginBottom: 6 },
  logo: { width: '100%', height: '100%', borderRadius: 21 },
  storeName: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
