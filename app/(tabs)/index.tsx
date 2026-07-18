import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Dimensions, RefreshControl, ActivityIndicator, Platform, TextInput, Linking, Modal, Animated
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingOffersButton from '@/components/FloatingOffersButton';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { trackEvent, trackPageView } from '@/services/analyticsService';
import { fetchFeaturedStores, checkStoreIsOpen, Store as StoreType } from '@/services/storesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AdCard, EmptyState } from '@/components';
import { SkeletonHomeFeed } from '@/components/feature/SkeletonCard';
import { InterstitialAdOverlay } from '@/components/feature/InterstitialAdOverlay';
import { useAds } from '@/hooks/useAds';
import { useCategories } from '@/hooks/useCategories';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { useResponsive } from '@/hooks/useResponsive';
import { fetchActiveBanners, getBannersCache, setBannersCache, getBannerPressHandler, Banner } from '@/services/bannersService';
import { fetchActiveInterstitials, InterstitialAd } from '@/services/interstitialService';
import { fetchBlockedIds, subscribeToBlockChanges } from '@/services/blockService';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useConversations } from '@/hooks/useChat';

// ── Featured Stores Strip ───────────────────────────────────────────────────
function FeaturedStoresStrip({ isAr, isRTL, colors, onPress }: {
  isAr: boolean; isRTL: boolean; colors: any;
  onPress: (storeId: string) => void;
}) {
  const [stores, setStores] = React.useState<StoreType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const flatListRef = React.useRef<FlatList>(null);
  const scrollIndex = React.useRef(0);
  const shimmer = React.useRef(new Animated.Value(0.35)).current;
  const isMounted = React.useRef(true);

  const renderStoreItem = useCallback(({ item: store }: { item: StoreType }) => {
    const bannerImage = store.banner || store.banner_url || store.cover || store.cover_url || store.logo_url;
    const isOpen = checkStoreIsOpen ? checkStoreIsOpen(store) : true;
    const statusColor = isOpen ? '#10B981' : '#EF4444';

    return (
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            try {
              const H = require('expo-haptics');
              H.impactAsync(H.ImpactFeedbackStyle.Light);
            } catch (_) {}
          }
          onPress(store.id);
        }}
        style={({ pressed }) => ({
          width: 150, height: 200, borderRadius: 18,
          backgroundColor: colors.surface,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 6,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <View style={{
          flex: 1, borderRadius: 18, overflow: 'hidden',
          borderWidth: 1.4, borderColor: 'rgba(245,158,11,0.3)',
        }}>
          <Image
            source={{ uri: bannerImage }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />

          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <LinearGradient
            colors={['#FFD966', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute', top: 12,
              ...(isRTL ? { left: 12 } : { right: 12 }),
              borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3,
              flexDirection: 'row', alignItems: 'center', gap: 2, zIndex: 2,
              shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 3,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 8 }}>★</Text>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 }}>VIP</Text>
          </LinearGradient>

          <View style={{
            position: 'absolute', bottom: 10,
            ...(isRTL ? { right: 10 } : { left: 10 }),
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
            paddingHorizontal: 7, paddingVertical: 3, zIndex: 2,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
              {isAr ? (isOpen ? 'مفتوح' : 'مغلق') : (isOpen ? 'Open' : 'Closed')}
            </Text>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 }}>
            <View style={{
              width: 74, height: 74, borderRadius: 37,
              backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
            }}>
              <View style={{
                width: 68, height: 68, borderRadius: 34,
                borderWidth: 2, borderColor: statusColor,
                overflow: 'hidden', backgroundColor: '#fff',
              }}>
                <Image source={{ uri: store.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </View>
            </View>

            <Text style={{
              color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center',
              marginTop: 10,
              textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
            }} numberOfLines={1}>
              {isAr ? (store.name_ar || store.name) : store.name}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }, [colors.surface, isAr, isRTL, onPress]);

  React.useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    fetchFeaturedStores({ signal: controller.signal })
      .then(({ data }) => {
        if (isMounted.current) {
          setStores(shuffleArray(data));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (isMounted.current) setLoading(false);
        console.warn('fetchFeaturedStores error:', err);
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading]);

  React.useEffect(() => {
    if (stores.length <= 1) return;
    const timer = setInterval(() => {
      scrollIndex.current = (scrollIndex.current + 1) % stores.length;
      flatListRef.current?.scrollToOffset({
        offset: scrollIndex.current * 164,
        animated: true,
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [stores]);

  if (!loading && stores.length === 0) return null;

  return (
    <View style={{ marginBottom: 28, marginTop: 8 }}>
      <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 16 }}>
        <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: colors.primary }} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left', letterSpacing: -0.3 }}>
          {isAr ? 'متاجر مميزة' : 'Featured Stores'}
        </Text>
      </View>

      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {[1, 2, 3].map((key) => (
            <Animated.View key={key} style={{ width: 150, height: 200, backgroundColor: colors.surfaceTint, borderRadius: 18, opacity: shimmer }} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          data={stores}
          snapToInterval={164}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
          renderItem={renderStoreItem}
          keyExtractor={(item) => item.id}
        />
      )}
    </View>
  );
}

// ── Banner Carousel (مفصول بـ React.memo لتحسين الأداء) ──────────────────
const BannerCarousel = React.memo(({
  banners,
  featuredIndex,
  bannerHeight,
  hPad,
  isRTL,
  colors,
  router,
}: {
  banners: Banner[];
  featuredIndex: number;
  bannerHeight: number;
  hPad: number;
  isRTL: boolean;
  colors: any;
  router: any;
}) => {
  const currentBanner = banners[featuredIndex] ?? banners[0];
  if (!currentBanner) return null;

  const handlePress = () => {
    trackEvent('banner_click').catch(() => {});
    const link = currentBanner.link_url?.trim();
    if (link && (link.startsWith('http://') || link.startsWith('https://'))) {
      Linking.openURL(link).catch(() => {});
    } else {
      router.push('/search');
    }
  };

  return (
    <Pressable
      style={[styles.bannerWrap, { height: bannerHeight, marginHorizontal: hPad, marginTop: Spacing.md }]}
      onPress={handlePress}
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
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function loadSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('loadSearchHistory error:', e);
    return [];
  }
}

async function saveSearchHistory(query: string, current: string[]): Promise<string[]> {
  try {
    const deduped = [query, ...current.filter(q => q !== query)].slice(0, MAX_SEARCH_HISTORY);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(deduped));
    return deduped;
  } catch (e) {
    console.warn('saveSearchHistory error:', e);
    return current;
  }
}

async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (e) {
    console.warn('clearSearchHistory error:', e);
  }
}

async function addToRecentlyViewed(ad: Ad): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: Ad[] = raw ? JSON.parse(raw) : [];
    const updated = [ad, ...existing.filter(a => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('addToRecentlyViewed error:', e);
  }
}

async function removeFromRecentlyViewed(adId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: Ad[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter(a => a.id !== adId);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('removeFromRecentlyViewed error:', e);
  }
}

async function loadRecentlyViewed(): Promise<Ad[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('loadRecentlyViewed error:', e);
    return [];
  }
}

const RECENTLY_VIEWED_KEY = 'recently_viewed_ads_v1';
const MAX_RECENTLY_VIEWED = 6;
const SEARCH_HISTORY_KEY = 'search_history_v1';
const MAX_SEARCH_HISTORY = 8;

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
    rows.push({ type, ads: chunk, id: chunk[0]?.id || `row-${i}` });
    i += numCols;
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const searchHeight = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [48, 0],
    extrapolate: 'clamp',
  });
  const searchOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { categories } = useCategories();
  const { ads, loading, loadingMore, hasMore, load, loadMore } = useAds();
  const { hPad, cardGap, cardWidth, cardWidthLg, numColumns, bannerHeight, isTablet, isDesktop } = useResponsive();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const { conversations, loading: convLoading, reload, unreadCount } = useConversations({
    enabled: !!user
  });

  const [isOnline, setIsOnline] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Ad[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const currentBanner = banners[featuredIndex] ?? banners[0];
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [filterVisible, setFilterVisible] = useState(false);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const [draftArea, setDraftArea] = useState<string | null>(null);
  const [draftMaxPrice, setDraftMaxPrice] = useState('');
  const [draftCondition, setDraftCondition] = useState<Condition>(null);
  const [appliedArea, setAppliedArea] = useState<string | null>(null);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState<number | undefined>(undefined);
  const [appliedCondition, setAppliedCondition] = useState<Condition>(null);

  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>([]);
  const [activeInterstitial, setActiveInterstitial] = useState<InterstitialAd | null>(null);
  const [interstitialVisible, setInterstitialVisible] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [totalAdsCount, setTotalAdsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [conversationsSheetVisible, setConversationsSheetVisible] = useState(false);

  const requestIdRef = useRef(0);

  const appStartTime = useRef(Date.now());
  const interstitialShown = useRef(false);

  const activeFilterCount = [appliedArea, appliedMaxPrice !== undefined ? '1' : null, appliedCondition].filter(Boolean).length;
  const isAr = language === 'ar';
  const appTitle = useMemo(() => isAr ? 'سوق قلقيلية' : 'Souq Qalqilya', [isAr]);

  useFocusEffect(
    useCallback(() => {
      trackPageView('home');
    }, [])
  );

  // Online status
  useEffect(() => {
    NetInfo.fetch().then(s => setIsOnline(s.isConnected !== false));
    const unsub = NetInfo.addEventListener(s => setIsOnline(s.isConnected !== false));
    return unsub;
  }, []);

  // Load recent and search history
  useEffect(() => {
    loadRecentlyViewed().then(setRecentlyViewed);
    loadSearchHistory().then(setSearchHistory);
  }, []);

  // Count total ads
  useEffect(() => {
    getSupabaseClient()
      .from('ads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .then(({ count }) => { if (count !== null) setTotalAdsCount(count); })
      .catch((e) => console.warn('totalAdsCount error:', e));
  }, []);

  // Blocked ids
  useEffect(() => {
    if (user) fetchBlockedIds().then(ids => setBlockedIds(new Set(ids))).catch(console.warn);
  }, [user?.id]);

  useEffect(() => {
    const unsub = subscribeToBlockChanges(() => {
      if (user) fetchBlockedIds().then(ids => setBlockedIds(new Set(ids))).catch(console.warn);
    });
    return unsub;
  }, [user?.id]);

  // Main data loading with race condition prevention
  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    setError(null);
    load({
      categoryId: selectedCategory ?? undefined,
      location: appliedArea ?? undefined,
      maxPrice: appliedMaxPrice,
      condition: appliedCondition ?? undefined,
      sortBy,
    }).then(() => {
      if (currentRequestId === requestIdRef.current) {
        setError(null);
      }
    }).catch((err) => {
      if (currentRequestId === requestIdRef.current) {
        setError(err.message || 'Failed to load listings');
      }
    });
  }, [selectedCategory, sortBy, appliedArea, appliedMaxPrice, appliedCondition, load]);

  // Banners
  useEffect(() => {
    const cached = getBannersCache('home');
    if (cached && cached.length > 0) {
      setBanners(cached);
      return;
    }
    const controller = new AbortController();
    fetchActiveBanners('home', { signal: controller.signal })
      .then(({ data }) => {
        if (data.length > 0) {
          const shuffled = shuffleArray(data);
          setBannersCache(shuffled, 'home');
          setBanners(shuffled);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('fetchActiveBanners error:', err);
      });
    return () => controller.abort();
  }, []);

  // Auto-rotate banners
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setFeaturedIndex(i => (i + 1) % banners.length), 3500);
    return () => clearInterval(timer);
  }, [banners.length]);

  // Fetch interstitials
  useEffect(() => {
    const controller = new AbortController();
    fetchActiveInterstitials({ signal: controller.signal })
      .then(({ data }) => {
        if (data.length > 0) setInterstitials(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('fetchActiveInterstitials error:', err);
      });
    return () => controller.abort();
  }, []);

  // Interstitial timer
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
    setError(null);
    load({
      categoryId: selectedCategory ?? undefined,
      location: appliedArea ?? undefined,
      maxPrice: appliedMaxPrice,
      condition: appliedCondition ?? undefined,
      sortBy,
    }).catch((err) => setError(err.message || 'Failed to refresh'));
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
    setFilterVisible(false);
  }, []);

  // ✅ FIX: Add navigation to ad detail page
  const handleAdView = useCallback((ad: Ad) => {
    addToRecentlyViewed(ad);
    setRecentlyViewed(prev => [ad, ...prev.filter((a: Ad) => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED));
    // ✅ الانتقال إلى صفحة تفاصيل الإعلان
    router.push(`/ad/${ad.id}`);
  }, [router]);

  const handleRecentAdPress = useCallback((ad: Ad) => {
    handleAdView(ad);
    // already navigates, so we can just call handleAdView
  }, [handleAdView]);

  const handleRemoveRecent = useCallback((adId: string) => {
    removeFromRecentlyViewed(adId);
    setRecentlyViewed(prev => prev.filter(a => a.id !== adId));
  }, []);

  const handleClearAllRecent = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY);
      setRecentlyViewed([]);
    } catch (e) {
      console.warn('handleClearAllRecent error:', e);
    }
  }, []);

  const handleSearchHistoryChipPress = useCallback((query: string) => {
    saveSearchHistory(query, searchHistory).then(setSearchHistory);
    router.push({
      pathname: '/search',
      params: {
        q: query,
        category: selectedCategory || '',
        location: appliedArea || '',
        maxPrice: appliedMaxPrice?.toString() || '',
        condition: appliedCondition || '',
        sort: sortBy,
      }
    } as any);
  }, [searchHistory, router, selectedCategory, appliedArea, appliedMaxPrice, appliedCondition, sortBy]);

  const handleClearSearchHistory = useCallback(async () => {
    await clearSearchHistory();
    setSearchHistory([]);
  }, []);

  const rowHeight = useMemo(() => {
    const cw = (isTablet || isDesktop) ? cardWidthLg : cardWidth;
    const imgH = Math.max(130, Math.min(Math.round(cw * 0.75), 200));
    return imgH + 92 + 10;
  }, [cardWidth, cardWidthLg, isTablet, isDesktop]);

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
        {Array.from({ length: numColumns - cols }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.adWrapper} />
        ))}
      </View>
    );
  }, [isRTL, favIds, user, toggleFav, handleAdView, cardGap, hPad, activeCardWidth, numColumns]);

  const handleFeaturedStorePress = useCallback((storeId: string) => {
    router.push(`/store/${storeId}` as any);
  }, [router]);

  const featuredStoresNode = useMemo(() => (
    <FeaturedStoresStrip
      isAr={isAr}
      isRTL={isRTL}
      colors={colors}
      onPress={handleFeaturedStorePress}
    />
  ), [isAr, isRTL, colors, handleFeaturedStorePress]);

  // ✅ دالة معالجة الضغط على أيقونة المحادثة (مع التحقق من تسجيل الدخول)
  const handleChatPress = useCallback(() => {
    if (!user) {
      showAlert(
        isAr ? 'تسجيل الدخول مطلوب' : 'Login Required',
        isAr ? 'يرجى تسجيل الدخول للوصول إلى المحادثات' : 'Please log in to access conversations',
        [
          { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
          {
            text: isAr ? 'تسجيل الدخول' : 'Login',
            onPress: () => router.push('/login'),
          },
        ]
      );
      return;
    }
    router.push('/messages');
  }, [user, router, showAlert, isAr]);

  const handleConversationPress = useCallback((conversationId: string) => {
    router.push(`/chat/${conversationId}` as any);
  }, [router]);

  const getItemLayout = useCallback((_data: any, index: number) => {
    const height = rowHeight + cardGap;
    return { length: height, offset: height * index, index };
  }, [rowHeight, cardGap]);

  const ListHeader = useMemo(() => (
    <>
      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <MaterialIcons name="error-outline" size={18} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <Pressable onPress={() => setError(null)} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={colors.error} />
          </Pressable>
        </View>
      ) : null}

      <BannerCarousel
        banners={banners}
        featuredIndex={featuredIndex}
        bannerHeight={bannerHeight}
        hPad={hPad}
        isRTL={isRTL}
        colors={colors}
        router={router}
      />

      {featuredStoresNode}

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
          contentContainerStyle={[
            styles.catContent,
            {
              flexDirection: isRTL ? 'row-reverse' : 'row',
              paddingHorizontal: hPad,
            }
          ]}
        >
          <Pressable
            style={[styles.catChip, selectedCategory === null
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}
            onPress={() => handleCategoryPress(null)}
          >
            <MaterialIcons name="apps" size={14} color={selectedCategory === null ? '#fff' : colors.textMuted} />
            <Text style={[styles.catChipText, { color: selectedCategory === null ? '#fff' : colors.textSecondary, fontWeight: selectedCategory === null ? '700' : '500' }]}>{t.all}</Text>
          </Pressable>

          {categories.map(cat => {
            const isSelected = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
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
            );
          })}
        </ScrollView>
      </View>

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
  ), [currentBanner, banners, featuredIndex, isRTL, colors, t, categories, selectedCategory, language, sortBy, totalAdsCount, recentlyViewed, searchHistory, activeFilterCount, handleCategoryPress, handleRecentAdPress, handleRemoveRecent, handleClearAllRecent, handleSearchHistoryChipPress, handleClearSearchHistory, handleOpenFilter, handleClearFilters, featuredStoresNode, router, error, hPad, isAr, setSortBy, bannerHeight]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.primary, overflow: 'hidden' }]}>
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
              <MaterialCommunityIcons name="filter-variant" size={20} color="#fff" />
              {activeFilterCount > 0 ? (
                <View style={styles.filterDot}>
                  <Text style={styles.filterDotText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>

            {/* ✅ أيقونة المحادثة / القفل حسب حالة المستخدم */}
            <Pressable style={styles.headerIconBtn} onPress={handleChatPress} hitSlop={6}>
              {user ? (
                <>
                  <MaterialCommunityIcons name="chat" size={20} color="#fff" />
                  {unreadCount > 0 && (
                    <View style={styles.filterDot}>
                      <Text style={styles.filterDotText}>
                        {unreadCount > 9 ? '9+' : String(unreadCount)}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <MaterialCommunityIcons name="lock" size={20} color="#fff" />
              )}
            </Pressable>

            <Pressable
              style={[styles.headerIconBtn, { backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }]}
              onPress={() => router.push('/ai-support')}
              hitSlop={6}
            >
              <MaterialCommunityIcons name="robot" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Animated.View style={{ height: searchHeight, opacity: searchOpacity, overflow: 'hidden' }}>
          <Pressable
            style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.96)', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => {
              router.push({
                pathname: '/search',
                params: {
                  category: selectedCategory || '',
                  location: appliedArea || '',
                  maxPrice: appliedMaxPrice?.toString() || '',
                  condition: appliedCondition || '',
                  sort: sortBy,
                }
              } as any);
            }}
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
        </Animated.View>
      </View>

      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={15} color="#92400E" />
          <Text style={styles.offlineBannerText}>
            {isAr ? 'أنت غير متصل — يتم عرض البيانات المحفوظة' : 'You are offline — showing cached data'}
          </Text>
        </View>
      ) : null}

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
          removeClippedSubviews={true}
          getItemLayout={getItemLayout}
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

      {/* Filter sheet */}
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

            <Pressable
              style={[fStyles.applyBtn, { backgroundColor: colors.primary }]}
              onPress={handleApplyFilters}
            >
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={fStyles.applyBtnText}>{isAr ? 'تطبيق الفلاتر' : 'Apply Filters'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Area picker */}
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
    flexDirection: 'row',
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
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.lg, marginVertical: Spacing.sm,
    padding: 12, borderRadius: Radius.md, borderWidth: 1,
    gap: 8,
  },
  errorText: { flex: 1, fontSize: FontSize.sm, fontWeight: '500' },
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