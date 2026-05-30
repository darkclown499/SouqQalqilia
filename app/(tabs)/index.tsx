
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Dimensions, RefreshControl, ActivityIndicator, Linking, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AdCard, EmptyState } from '@/components';
import { SkeletonGrid } from '@/components/feature/SkeletonCard';
import { InterstitialAdOverlay } from '@/components/feature/InterstitialAdOverlay';
import { useAds } from '@/hooks/useAds';
import { useCategories } from '@/hooks/useCategories';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { fetchActiveBanners, Banner } from '@/services/bannersService';
import { fetchActiveInterstitials, InterstitialAd } from '@/services/interstitialService';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';

const { width: SCREEN_W } = Dimensions.get('window');
// Responsive padding: small phones get tighter spacing
const H_PAD = SCREEN_W < 375 ? 12 : Spacing.lg;
const CARD_GAP = SCREEN_W < 375 ? 8 : Spacing.sm;
const CARD_WIDTH = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;
// Banner height: exact 720/1280 ratio matching the actual content width (after H_PAD margins)
// Container and image share the same ratio → cover fills perfectly with zero cropping
const CONTENT_W = SCREEN_W - H_PAD * 2;
const BANNER_H = Math.round(CONTENT_W * (720 / 1280));
const SPONSORED_INTERVAL = 8;

// Module-level cache: banners and interstitials rarely change, no need to
// re-fetch on every mount. Cleared only on explicit refresh.
let _bannersCache: Banner[] | null = null;
let _interstitialsCache: InterstitialAd[] | null = null;

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'boosted';

const SORT_OPTIONS: { key: SortOption; label: string; labelAr: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', labelAr: 'الأحدث', icon: 'schedule' },
  { key: 'price_asc', label: 'Price ↑', labelAr: 'سعر ↑', icon: 'trending-up' },
  { key: 'price_desc', label: 'Price ↓', labelAr: 'سعر ↓', icon: 'trending-down' },
  { key: 'boosted', label: 'Boosted', labelAr: 'معزز', icon: 'bolt' },
];



type FeedRow =
  | { type: 'pair'; left: Ad; right: Ad | null; id: string }
  | { type: 'sponsored'; id: string };

function buildFeedRows(ads: Ad[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let adIndex = 0;
  let pairCount = 0;
  while (adIndex < ads.length) {
    // Inject sponsored row every SPONSORED_INTERVAL ads
    if (pairCount > 0 && pairCount * 2 % SPONSORED_INTERVAL === 0) {
      rows.push({ type: 'sponsored', id: `sponsored_${pairCount}` });
    }
    const left = ads[adIndex];
    const right = ads[adIndex + 1] ?? null;
    rows.push({ type: 'pair', left, right, id: left.id });
    adIndex += 2;
    pairCount++;
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
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [banners, setBanners] = useState<Banner[]>(_bannersCache ?? []);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortBar, setShowSortBar] = useState(false);
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>(_interstitialsCache ?? []);
  const [activeInterstitial, setActiveInterstitial] = useState<InterstitialAd | null>(null);
  const [interstitialVisible, setInterstitialVisible] = useState(false);
  const appStartTime = useRef(Date.now());
  const interstitialShown = useRef(false);

  const isAr = language === 'ar';

  useEffect(() => { load({ categoryId: selectedCategory ?? undefined }); }, [selectedCategory, load]);

  useEffect(() => {
    // Use cache if available, otherwise fetch independently for speed
    if (!_bannersCache) {
      fetchActiveBanners().then(({ data }) => {
        if (data.length > 0) {
          _bannersCache = data;
          setBanners(data);
        }
      });
    }
    if (!_interstitialsCache) {
      fetchActiveInterstitials().then(({ data }) => {
        if (data.length > 0) {
          _interstitialsCache = data;
          setInterstitials(data);
        }
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

  // Memoize expensive sort + inject operations
  const sortedAds = useMemo(() => sortAds(ads, sortBy), [ads, sortBy]);
  const feedRows = useMemo(() => buildFeedRows(sortedAds), [sortedAds]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadMore({ categoryId: selectedCategory ?? undefined });
    }
  }, [loadingMore, hasMore, selectedCategory, loadMore]);

  const handleRefresh = useCallback(() => {
    load({ categoryId: selectedCategory ?? undefined });
  }, [load, selectedCategory]);

  const handleCategoryPress = useCallback((id: string | null) => {
    setSelectedCategory(id);
  }, []);

  const renderRow = useCallback(({ item }: { item: FeedRow }) => {
    if (item.type === 'sponsored') {
      return (
        <Pressable
          style={[styles.sponsoredCard, { backgroundColor: colors.surface, borderColor: colors.primary + '40', ...Shadow.sm }]}
          onPress={() => Linking.openURL('https://wa.me/972559886886').catch(() => {})}
        >
          <View style={[styles.sponsoredIconWrap, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="campaign" size={20} color={colors.primary} />
          </View>
          <View style={styles.sponsoredContent}>
            <View style={[styles.sponsoredLabel, { backgroundColor: colors.primary }]}>
              <Text style={styles.sponsoredLabelText}>{t.sponsored}</Text>
            </View>
            <Text style={[styles.sponsoredTitle, { color: colors.textPrimary }]}>
              {isAr ? 'اعرض إعلانك هنا' : 'Advertise Here'}
            </Text>
            <Text style={[styles.sponsoredSub, { color: colors.textMuted }]}>
              {isAr ? 'تواصل معنا لتعزيز إعلانك' : 'Boost your listing for more visibility'}
            </Text>
          </View>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
        </Pressable>
      );
    }
    // pair row
    return (
      <View style={[styles.pairRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.adWrapper}>
          <AdCard
            ad={item.left}
            width={CARD_WIDTH}
            isFavorited={favIds.has(item.left.id)}
            onFavoritePress={user ? toggleFav : undefined}
          />
        </View>
        {item.right ? (
          <View style={styles.adWrapper}>
            <AdCard
              ad={item.right}
              width={CARD_WIDTH}
              isFavorited={favIds.has(item.right.id)}
              onFavoritePress={user ? toggleFav : undefined}
            />
          </View>
        ) : (
          <View style={styles.adWrapper} />
        )}
      </View>
    );
  }, [colors, t, isRTL, isAr, favIds, user, toggleFav, router]);

  const currentBanner = banners[featuredIndex] ?? banners[0];

  const ListHeader = useMemo(() => (
    <>
      {currentBanner ? (
        <Pressable
          style={[styles.bannerWrap, { height: BANNER_H, ...Shadow.md }]}
          onPress={() => router.push('/search')}
        >
          <Image
            source={{ uri: currentBanner.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={600}
          />
          {/* Bottom content — title + subtitle only, no overlays */}
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

          {/* Pagination dots */}
          {banners.length > 1 ? (
            <View style={styles.bannerDots}>
              {banners.map((_, i) => (
                <View key={i} style={[styles.bannerDot, i === featuredIndex && styles.bannerDotActive]} />
              ))}
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t.categories}</Text>
        <Pressable style={[styles.seeAllBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.push('/(tabs)/categories')}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>{t.seeAll}</Text>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={15} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.catOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            style={[styles.catChip, selectedCategory === null ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
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
                style={[styles.catChip, isSelected ? { backgroundColor: cat.color, borderColor: cat.color } : { backgroundColor: colors.surface, borderColor: colors.border }]}
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

      <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.sectionTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t.latestListings}</Text>
          <View style={[styles.countPill, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[styles.countPillText, { color: colors.primary }]}>{ads.length}</Text>
          </View>
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
  ), [currentBanner, banners, featuredIndex, isRTL, colors, t, categories, selectedCategory, language, sortBy, ads.length, handleCategoryPress, router]); // Dependency array is now correct. The /*eslint-disable-next-line react-hooks/exhaustive-deps*/ comment is not needed.

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={[styles.headerTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
              {displayName ? (isAr ? `مرحباً، ${displayName} 👋` : `Hi, ${displayName} 👋`) : (isAr ? 'اكتشف العروض 🛍️' : 'Discover Deals 🛍️')}
            </Text>
            <View style={[styles.appNameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.appName, { textAlign: isRTL ? 'right' : 'left' }]}>{appTitle}</Text>
            </View>
          </View>
          <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable style={[styles.headerBtn, showSortBar && { backgroundColor: 'rgba(255,255,255,0.28)' }]} onPress={() => setShowSortBar(v => !v)} hitSlop={6}>
              <MaterialIcons name="tune" size={20} color="#fff" />
            </Pressable>
            <Pressable style={styles.headerBtn} onPress={() => router.push('/search')} hitSlop={6}>
              <MaterialIcons name="search" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.95)', ...Shadow.sm, flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.push('/search')} activeOpacity={0.85}>
          <View style={[styles.searchIconWrap, { backgroundColor: colors.primary + '22' }]}>
            <MaterialIcons name="search" size={16} color={isDark ? 'rgba(255,255,255,0.7)' : colors.primary} />
          </View>
          <Text style={[styles.searchPlaceholder, { color: isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.searchPlaceholder}</Text>
          <View style={[styles.filterChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.primaryGhost }]}>
            <MaterialIcons name="filter-list" size={13} color={isDark ? 'rgba(255,255,255,0.7)' : colors.primary} />
            <Text style={[styles.filterChipText, { color: isDark ? 'rgba(255,255,255,0.7)' : colors.primary }]}>{isAr ? 'فلتر' : 'Filter'}</Text>
          </View>
        </Pressable>

        {showSortBar ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.sortBarContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} style={styles.sortBar}>
            {SORT_OPTIONS.map(opt => {
              const isSelected = sortBy === opt.key;
              return (
                <Pressable key={opt.key} style={[styles.sortChip, { backgroundColor: isSelected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)', borderColor: isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }]} onPress={() => { setSortBy(opt.key); setShowSortBar(false); }}>
                  <MaterialIcons name={opt.icon as any} size={12} color={isSelected ? '#fff' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.sortChipText, { color: isSelected ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: isSelected ? '700' : '500' }]}>{isAr ? opt.labelAr : opt.label}</Text>
                  {isSelected ? <MaterialIcons name="check" size={11} color="#fff" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* ── CONTENT ── */}
      {loading && ads.length === 0 ? (
        <SkeletonGrid count={6} />
      ) : (
        <FlatList
          data={feedRows}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          windowSize={7}
          maxToRenderPerBatch={6}
          initialNumToRender={6}
          updateCellsBatchingPeriod={60}
          removeClippedSubviews={Platform.OS === 'android'}

          refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                style={[styles.loadMoreBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="expand-more" size={18} color={colors.primary} />
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      {isAr ? 'تحميل المزيد' : 'Load More'}
                    </Text>
                  </>
                )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  comingSoonBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  comingSoonText: { fontSize: 11, fontWeight: '600' },
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, paddingTop: Spacing.sm },
  headerTop: { justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  headerLeft: { flex: 1 },
  greeting: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginBottom: 2, fontWeight: '500' },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.6, lineHeight: 30 },
  betaBadge: { backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 4, elevation: 3 },
  betaBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, lineHeight: 13 },
  headerActions: { gap: 8 },
  headerBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.xl, height: 48, paddingHorizontal: Spacing.sm, gap: 8 },
  searchIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  searchPlaceholder: { flex: 1, fontSize: FontSize.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '700' },
  sortBar: { marginTop: Spacing.sm },
  sortBarContent: { gap: Spacing.sm, paddingBottom: 2, paddingTop: 2 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  sortChipText: { fontSize: FontSize.xs },
  listContent: { padding: H_PAD, paddingBottom: 36 },
  pairRow: { flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP },
  adWrapper: { flex: 1 },
  sponsoredCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, marginBottom: Spacing.md },
  sponsoredIconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sponsoredContent: { flex: 1, gap: 4 },
  sponsoredLabel: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  sponsoredLabelText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  sponsoredTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  sponsoredSub: { fontSize: FontSize.xs },
  bannerWrap: { width: '100%', borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.lg + 4, position: 'relative', backgroundColor: '#0A6E5C' },
  bannerContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, paddingBottom: Spacing.lg, gap: 5 },
  bannerTitle: { fontSize: FontSize.xl + 2, fontWeight: '800', color: '#fff', letterSpacing: -0.5, lineHeight: 28, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  bannerSubtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)', fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bannerDots: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', gap: 5 },
  bannerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  bannerDotActive: { backgroundColor: '#fff', width: 22, borderRadius: 4 },
  sectionRow: { justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitleRow: { alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', letterSpacing: -0.2 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: { fontSize: FontSize.sm, fontWeight: '600' },
  countPill: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  countPillText: { fontSize: FontSize.xs, fontWeight: '700' },
  activeSortPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  activeSortText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  catOuter: { marginBottom: Spacing.lg, marginHorizontal: -H_PAD },
  catContent: { paddingHorizontal: H_PAD, gap: Spacing.sm, alignItems: 'center' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  catChipText: { fontSize: FontSize.xs },
  loadMoreIndicator: { paddingVertical: 20, alignItems: 'center' },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: H_PAD, marginBottom: 24, marginTop: 8,
    paddingVertical: 14, borderRadius: Radius.xl,
    borderWidth: 1.5,
  },
  loadMoreText: { fontSize: FontSize.md, fontWeight: '700' },
  endOfList: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 20,
  },
  endOfListText: { fontSize: FontSize.sm, fontWeight: '500' },
});
