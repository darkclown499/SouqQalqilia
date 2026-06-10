
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Dimensions, RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RECENTLY_VIEWED_KEY = 'recently_viewed_ads_v1';
const MAX_RECENTLY_VIEWED = 6;

async function addToRecentlyViewed(ad: Ad): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const existing: Ad[] = raw ? JSON.parse(raw) : [];
    const updated = [ad, ...existing.filter(a => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED);
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
import { fetchActiveBanners, getBannersCache, setBannersCache, Banner } from '@/services/bannersService';
import { fetchActiveInterstitials, InterstitialAd } from '@/services/interstitialService';
import { fetchBlockedIds, subscribeToBlockChanges } from '@/services/blockService';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = SCREEN_W < 375 ? 12 : Spacing.lg;
const CARD_GAP = SCREEN_W < 375 ? 8 : Spacing.sm;
const CARD_WIDTH = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;
const CONTENT_W = SCREEN_W - H_PAD * 2;
const BANNER_H = Math.round(CONTENT_W * (720 / 1280));
let _interstitialsCache: InterstitialAd[] | null = null;

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'boosted';

const SORT_OPTIONS: { key: SortOption; label: string; labelAr: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', labelAr: 'الأحدث', icon: 'schedule' },
  { key: 'price_asc', label: 'Price ↑', labelAr: 'سعر ↑', icon: 'trending-up' },
  { key: 'price_desc', label: 'Price ↓', labelAr: 'سعر ↓', icon: 'trending-down' },
  { key: 'boosted', label: 'Boosted', labelAr: 'معزز', icon: 'bolt' },
];

type FeedRow = { type: 'pair'; left: Ad; right: Ad | null; id: string };

function buildFeedRows(ads: Ad[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let adIndex = 0;
  while (adIndex < ads.length) {
    const left = ads[adIndex];
    const right = ads[adIndex + 1] ?? null;
    rows.push({ type: 'pair', left, right, id: left.id });
    adIndex += 2;
  }
  return rows;
}

function sortAds(ads: Ad[], sortBy: SortOption): Ad[] {
  const now = Date.now();
  const copy = [...ads];
  const boostedScore = (ad: Ad) => (ad.boosted_until && new Date(ad.boosted_until).getTime() > now ? 1 : 0);
  switch (sortBy) {
    case 'price_asc':
      return copy.sort((a, b) => { const bd = boostedScore(b) - boostedScore(a); return bd !== 0 ? bd : a.price - b.price; });
    case 'price_desc':
      return copy.sort((a, b) => { const bd = boostedScore(b) - boostedScore(a); return bd !== 0 ? bd : b.price - a.price; });
    case 'boosted':
      return copy.sort((a, b) => boostedScore(b) - boostedScore(a));
    default:
      return copy.sort((a, b) => { const bd = boostedScore(b) - boostedScore(a); return bd !== 0 ? bd : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  }
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { categories } = useCategories();
  const { ads, loading, loadingMore, hasMore, load, loadMore } = useAds();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Ad[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [banners, setBanners] = useState<Banner[]>(() => getBannersCache() ?? []);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortBar, setShowSortBar] = useState(false);
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>(_interstitialsCache ?? []);
  const [activeInterstitial, setActiveInterstitial] = useState<InterstitialAd | null>(null);
  const [interstitialVisible, setInterstitialVisible] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [totalAdsCount, setTotalAdsCount] = useState(0);
  const appStartTime = useRef(Date.now());
  const interstitialShown = useRef(false);

  useEffect(() => { loadRecentlyViewed().then(setRecentlyViewed); }, []);

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

  const isAr = language === 'ar';

  useEffect(() => { load({ categoryId: selectedCategory ?? undefined }); }, [selectedCategory, load]);

  useEffect(() => {
    if (!getBannersCache()) {
      fetchActiveBanners().then(({ data }) => {
        if (data.length > 0) { setBannersCache(data); setBanners(data); }
      });
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

  const sortedAds = useMemo(() => {
    return ads.filter(ad => !blockedIds.has(ad.user_id)); // Filter first
  }, [ads, blockedIds]);

  const sortedAndFilteredAds = useMemo(() => {
    return sortAds(sortedAds, sortBy); // Then sort
  }, [sortedAds, sortBy]);

  const feedRows = useMemo(() => buildFeedRows(sortedAndFilteredAds), [sortedAndFilteredAds]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadMore({ categoryId: selectedCategory ?? undefined });
  }, [loadingMore, hasMore, selectedCategory, loadMore]);

  const handleRefresh = useCallback(() => {
    load({ categoryId: selectedCategory ?? undefined });
  }, [load, selectedCategory]);

  const handleCategoryPress = useCallback((id: string | null) => {
    setSelectedCategory(id);
  }, []);

  const handleAdView = useCallback((ad: Ad) => {
    addToRecentlyViewed(ad);
    setRecentlyViewed(prev => [ad, ...prev.filter((a: Ad) => a.id !== ad.id)].slice(0, MAX_RECENTLY_VIEWED));
  }, []);

  const handleRecentAdPress = useCallback((ad: Ad) => {
    handleAdView(ad);
    router.push(`/ad/${ad.id}`);
  }, [handleAdView, router]);

  const renderRow = useCallback(({ item }: { item: FeedRow }) => {
    return (
      <View style={[styles.pairRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.adWrapper}>
          <AdCard
            ad={item.left}
            width={CARD_WIDTH}
            isFavorited={favIds.has(item.left.id)}
            onFavoritePress={user ? toggleFav : undefined}
            onAdPress={handleAdView} // Pass the handler
          />
        </View>
        {item.right ? (
          <View style={styles.adWrapper}>
            <AdCard
              ad={item.right}
              width={CARD_WIDTH}
              isFavorited={favIds.has(item.right.id)}
              onFavoritePress={user ? toggleFav : undefined}
              onAdPress={handleAdView} // Pass the handler
            />
          </View>
        ) : (
          <View style={styles.adWrapper} />
        )}
      </View>
    );
  }, [colors, isRTL, favIds, user, toggleFav, handleAdView]);

  const currentBanner = banners[featuredIndex] ?? banners[0];

  const ListHeader = useMemo(() => (
    <>
      {/* ── BANNER ── */}
      {currentBanner ? (
        <Pressable
          style={[styles.bannerWrap, { height: BANNER_H }]}
          onPress={() => router.push('/search')}
          // activeOpacity={0.95} // activeOpacity is not a prop of Pressable in React Native
        >
          <Image
            source={{ uri: currentBanner.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={600}
            cachePolicy="memory-disk"
          />
          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
          />
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
          {banners.length > 1 ? (
            <View style={styles.bannerDots}>
              {banners.map((_, i) => (
                <View key={i} style={[styles.bannerDot, i === featuredIndex && styles.bannerDotActive]} />
              ))}
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {/* ── RECENTLY VIEWED ── */}
      {recentlyViewed.length > 0 ? (
        <View style={styles.recentSection}>
          <View style={[styles.sectionHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.sectionIconDot, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="history" size={14} color={colors.primary} />
            </View>
            <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary }]}>
              {isAr ? 'آخر المشاهدات' : 'Recently Viewed'}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.recentList, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {recentlyViewed.map(ad => {
              const thumb = (ad.ad_images ?? []).sort((a: any, b: any) => a.position - b.position)[0]?.url;
              return (
                <Pressable
                  key={ad.id}
                  style={({ pressed }) => [styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                  onPress={() => handleRecentAdPress(ad)}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.recentImg} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.recentImgPh, { backgroundColor: colors.surfaceTint }]}>
                      <MaterialIcons name="image" size={22} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.recentInfo}>
                    <Text style={[styles.recentTitle, { color: colors.textSecondary }]} numberOfLines={2}>{ad.title}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ── CATEGORIES ── */}
      <View style={[styles.sectionHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row', paddingHorizontal: H_PAD }]}>
        <View style={[styles.sectionIconDot, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="grid-view" size={14} color={colors.primary} />
        </View>
        <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1 }]}>{t.categories}</Text>
        <Pressable style={[styles.seeAllBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.push('/(tabs)/categories')} hitSlop={6}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>{t.seeAll}</Text>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={15} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.catOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            style={[styles.catChip, selectedCategory === null
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surface, borderColor: colors.border }]}
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
                  : { backgroundColor: colors.surface, borderColor: colors.border }]}
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

      {/* ── LISTINGS HEADER ── */}
      <View style={[styles.listingsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', borderTopColor: colors.borderLight }]}>
        <View style={[styles.sectionIconDot, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="storefront" size={14} color={colors.primary} />
        </View>
        <Text style={[styles.sectionHeaderTitle, { color: colors.textPrimary, flex: 1 }]}>{isAr ? 'جميع الإعلانات' : 'All Listings'}</Text>
        <View style={[styles.countPill, { backgroundColor: colors.primaryGhost }]}>
          <Text style={[styles.countPillText, { color: colors.primary }]}>{totalAdsCount > 0 ? totalAdsCount : sortedAndFilteredAds.length}</Text>
        </View>
        {sortBy !== 'newest' ? (
          <View style={[styles.activeSortPill, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="sort" size={11} color="#fff" />
            <Text style={styles.activeSortText}>{isAr ? SORT_OPTIONS.find(s => s.key === sortBy)?.labelAr : SORT_OPTIONS.find(s => s.key === sortBy)?.label}</Text>
            <Pressable onPress={() => setSortBy('newest')} hitSlop={6}><MaterialIcons name="close" size={11} color="#fff" /></Pressable>
          </View>
        ) : null}
      </View>
    </>
  ), [currentBanner, banners, featuredIndex, isRTL, colors, t, categories, selectedCategory, language, sortBy, sortedAndFilteredAds.length, recentlyViewed, handleCategoryPress, handleRecentAdPress, router, setSortBy]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={[styles.headerTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Greeting + title */}
          <View style={styles.headerLeft}>
            {displayName ? (
              <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? `مرحباً بك، ${displayName} 👋` : `Welcome back, ${displayName} 👋`}
              </Text>
            ) : (
              <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'اكتشف أفضل العروض 🛍️' : 'Discover great deals 🛍️'}
              </Text>
            )}
            <Text style={[styles.appName, { textAlign: isRTL ? 'right' : 'left' }]}>{appTitle}</Text>
          </View>

          {/* Actions */}
          <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable
              style={[styles.headerIconBtn, showSortBar && { backgroundColor: 'rgba(255,255,255,0.28)' }]}
              onPress={() => setShowSortBar(v => !v)}
              hitSlop={6}
            >
              <MaterialIcons name="tune" size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.headerIconBtn}
              onPress={() => router.push('/search')}
              hitSlop={6}
            >
              <MaterialIcons name="search" size={20} color="#fff" />
            </Pressable>
          </View>
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

        {/* Sort bar */}
        {showSortBar ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.sortBarContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            style={styles.sortBar}
          >
            {SORT_OPTIONS.map(opt => {
              const isSelected = sortBy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.sortChip, {
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)',
                    borderColor: isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                  }]}
                  onPress={() => { setSortBy(opt.key); setShowSortBar(false); }}
                >
                  <MaterialIcons name={opt.icon as any} size={12} color={isSelected ? '#fff' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.sortChipText, { color: isSelected ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: isSelected ? '700' : '500' }]}>
                    {isAr ? opt.labelAr : opt.label}
                  </Text>
                  {isSelected ? <MaterialIcons name="check" size={11} color="#fff" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* ── CONTENT ── */}
      {loading && ads.length === 0 ? (
        <SkeletonHomeFeed />
      ) : (
        <FlatList
          data={feedRows}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={6}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
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
              <View style={styles.loadMoreIndicator}>
                {loadingMore ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──
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
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.6,
    lineHeight: 30,
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

  // Search bar
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

  // Sort bar
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

  // ── Banner ──
  bannerWrap: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    position: 'relative',
    backgroundColor: '#0A6E5C',
    ...Shadow.md,
  },
  bannerGradient: {
    // replaced by LinearGradient component above
    display: 'none',
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
  bannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  bannerCtaText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
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

  // ── Recently Viewed ──
  recentSection: { marginBottom: Spacing.lg },
  recentList: {
    paddingHorizontal: H_PAD,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  recentCard: {
    width: 120,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
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

  // ── Section headers ──
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

  // ── Categories ──
  catOuter: {
    marginBottom: Spacing.lg,
    marginHorizontal: -H_PAD,
  },
  catContent: {
    paddingHorizontal: H_PAD,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  catChipText: { fontSize: FontSize.xs },

  // ── Listings header ──
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

  // ── Feed ──
  listContent: { padding: H_PAD, paddingBottom: 36 },
  pairRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  adWrapper: { flex: 1 },

  // ── Footer ──
  loadMoreIndicator: { paddingVertical: 20, alignItems: 'center' },
  endOfList: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  endOfListText: { fontSize: FontSize.sm, fontWeight: '500' },
});

