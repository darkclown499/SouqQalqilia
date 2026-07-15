import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Linking, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { fetchOfferCategories, OfferCategory } from '@/services/offerCategoriesService';
import { trackPageView } from '@/services/analyticsService';
import { getSupabaseClient } from '@/template';
import { Ad } from '@/services/adsService';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIP_WIDTH = SCREEN_WIDTH - 24;

// ── Countdown helper ──────────────────────────────────────────────────────────
function getCountdownText(boostedUntil: string, isAr: boolean): string {
  const diff = new Date(boostedUntil).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (isAr) {
    if (days > 0) return `🔥 ينتهي خلال ${days} يوم${hours > 0 ? ` و${hours} ساعة` : ''}`;
    if (hours > 0) return `🔥 ينتهي خلال ${hours} ساعة${mins > 0 ? ` و${mins} دقيقة` : ''}`;
    return `🔥 ينتهي خلال ${mins} دقيقة`;
  } else {
    if (days > 0) return `🔥 Ends in ${days}d${hours > 0 ? ` ${hours}h` : ''}`;
    if (hours > 0) return `🔥 Ends in ${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
    return `🔥 Ends in ${mins}m`;
  }
}

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [offerCategories, setOfferCategories] = useState<OfferCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [boostedAds, setBoostedAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [adError, setAdError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const [currentVipIndex, setCurrentVipIndex] = useState(0);

  // ── Fetch boosted ads from backend ───────────────────────────────────────
  const fetchBoostedAds = useCallback(async () => {
    setAdError(null);
    setLoadingAds(true);
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('ads')
        .select(`
          id, user_id, category_id, title, description, price, location,
          phone_number, condition, status, views, created_at, boosted_until,
          serial_number, ad_type,
          categories(id, name, name_ar, icon, color),
          ad_images(id, url, position, blurhash),
          user_profiles(username, email, avatar_url)
        `)
        .in('status', ['active', 'featured'])
        .gt('boosted_until', now)
        .order('boosted_until', { ascending: false })
        .limit(50);

      if (error) {
        setAdError(isAr ? 'فشل تحميل العروض' : 'Failed to load offers');
      } else {
        setBoostedAds((data ?? []) as Ad[]);
      }
    } catch (e: any) {
      setAdError(e?.message ?? (isAr ? 'خطأ في الاتصال' : 'Connection error'));
    } finally {
      setLoadingAds(false);
    }
  }, [isAr]);

  useEffect(() => {
    fetchOfferCategories()
      .then(setOfferCategories)
      .finally(() => setIsLoadingCategories(false));
    fetchBoostedAds();
  }, [fetchBoostedAds]);

  useFocusEffect(
    React.useCallback(() => {
      trackPageView('offers');
    }, [])
  );

  // ── VIP ads: top 3 boosted ads for the carousel ──────────────────────────
  const vipAds = useMemo(() => boostedAds.slice(0, 3), [boostedAds]);

  // ── Masonry grid: remaining boosted ads ──────────────────────────────────
  const filteredAds = useMemo(() => {
    const remaining = boostedAds.slice(3);
    if (activeCategory === 'all') return remaining;
    return remaining.filter(ad => ad.categories?.name_ar === activeCategory || ad.categories?.name === activeCategory);
  }, [boostedAds, activeCategory]);

  const { leftCol, rightCol } = useMemo(() => {
    const left: Ad[] = [];
    const right: Ad[] = [];
    filteredAds.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return { leftCol: left, rightCol: right };
  }, [filteredAds]);

  // ── Auto-scroll VIP carousel ──────────────────────────────────────────────
  useEffect(() => {
    if (vipAds.length <= 1) return;
    const interval = setInterval(() => {
      const nextIndex = (currentVipIndex + 1) % vipAds.length;
      scrollViewRef.current?.scrollTo({
        x: nextIndex * (VIP_WIDTH + 12),
        animated: true,
      });
      setCurrentVipIndex(nextIndex);
    }, 3500);
    return () => clearInterval(interval);
  }, [currentVipIndex, vipAds.length]);

  const handleScrollEnd = (event: any) => {
    const contentOffsetX = Math.abs(event.nativeEvent.contentOffset.x);
    const newIndex = Math.round(contentOffsetX / (VIP_WIDTH + 12));
    setCurrentVipIndex(newIndex);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchBoostedAds();
    setIsRefreshing(false);
  }, [fetchBoostedAds]);

  const handleOpenLink = async (url: string) => {
    if (!url) return;
    try {
      if (url.toLowerCase().startsWith('http')) {
        await WebBrowser.openBrowserAsync(url, {
          toolbarColor: '#E11D48',
          enableBarCollapsing: true,
        });
      } else {
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const handleAdPress = useCallback((ad: Ad) => {
    router.push(`/ad/${ad.id}` as any);
  }, [router]);

  const getAdThumb = (ad: Ad): string | null => {
    const images = (ad.ad_images ?? []).sort((a, b) => a.position - b.position);
    return images[0]?.url ?? null;
  };

  const renderAdCard = (ad: Ad) => {
    const thumb = getAdThumb(ad);
    const countdown = ad.boosted_until ? getCountdownText(ad.boosted_until, isAr) : '';
    const catName = isAr ? (ad.categories?.name_ar || ad.categories?.name) : ad.categories?.name;

    return (
      <Pressable
        key={ad.id}
        style={styles.bannerCard}
        onPress={() => handleAdPress(ad)}
      >
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialIcons name="image" size={36} color="#6B7280" />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.gradientOverlay}
        />
        {countdown ? (
          <View style={styles.fireTag}>
            <Text style={styles.fireText}>{countdown}</Text>
          </View>
        ) : null}
        <View style={styles.bannerContent}>
          {catName ? (
            <Text style={styles.storeName} numberOfLines={1}>{catName}</Text>
          ) : null}
          <Text style={styles.bannerTitle} numberOfLines={2}>{ad.title}</Text>
          <Text style={styles.priceText}>₪{ad.price.toLocaleString()}</Text>
        </View>
      </Pressable>
    );
  };

  const renderVipCard = (ad: Ad) => {
    const thumb = getAdThumb(ad);
    const countdown = ad.boosted_until ? getCountdownText(ad.boosted_until, isAr) : '';

    return (
      <View key={ad.id} style={styles.vipBannerContainer}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F2937' }]} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.95)']}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.vipTag}>
          <FontAwesome5 name="crown" size={12} color="#B45309" />
          <Text style={styles.vipTagText}>{isAr ? 'عرض VIP' : 'VIP Offer'}</Text>
        </View>

        <View style={styles.vipContent}>
          {countdown ? (
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          ) : null}
          <Text style={styles.vipTitle} numberOfLines={2}>{ad.title}</Text>
          <Text style={styles.vipPrice}>₪{ad.price.toLocaleString()}</Text>

          <Pressable
            style={styles.vipButton}
            onPress={() => handleAdPress(ad)}
          >
            <Text style={styles.vipButtonText}>{isAr ? 'اكتشف العرض الآن' : 'View Offer'}</Text>
            <MaterialIcons name="local-activity" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Category chips based on real data ────────────────────────────────────
  const categoryChips = useMemo(() => {
    const cats = new Set<string>();
    boostedAds.slice(3).forEach(ad => {
      const name = isAr ? (ad.categories?.name_ar || ad.categories?.name) : ad.categories?.name;
      if (name) cats.add(name);
    });
    return Array.from(cats);
  }, [boostedAds, isAr]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <MaterialIcons name="chevron-right" size={28} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>{isAr ? 'أقوى العروض 🔥' : 'Hot Deals 🔥'}</Text>
        <Pressable
          onPress={handleRefresh}
          disabled={isRefreshing}
          style={[styles.headerBtn, styles.refreshBtn]}
        >
          {isRefreshing
            ? <ActivityIndicator size="small" color="#E11D48" />
            : <MaterialIcons name="refresh" size={22} color="#111827" />
          }
        </Pressable>
      </View>

      {categoryChips.length > 0 ? (
        <View style={styles.filtersWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScrollContent}
          >
            <Pressable
              onPress={() => setActiveCategory('all')}
              style={[styles.filterChip, activeCategory === 'all' && styles.activeFilterChip]}
            >
              <Text style={[styles.filterText, activeCategory === 'all' && styles.activeFilterText]}>
                {isAr ? 'الكل' : 'All'}
              </Text>
            </Pressable>
            {categoryChips.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[styles.filterChip, activeCategory === cat && styles.activeFilterChip]}
              >
                <Text style={[styles.filterText, activeCategory === cat && styles.activeFilterText]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#E11D48']}
            tintColor="#E11D48"
          />
        }
      >
        {loadingAds ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#E11D48" />
            <Text style={styles.loadingText}>
              {isAr ? 'جاري تحميل العروض...' : 'Loading offers...'}
            </Text>
          </View>
        ) : adError ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="error-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>{adError}</Text>
            <Pressable style={styles.retryBtn} onPress={fetchBoostedAds}>
              <Text style={styles.retryBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : boostedAds.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="local-offer" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {isAr ? 'لا توجد عروض حالياً' : 'No active offers right now'}
            </Text>
            <Text style={styles.emptySubText}>
              {isAr ? 'تابعنا لاحقاً لمعرفة أحدث العروض' : 'Check back later for new deals'}
            </Text>
          </View>
        ) : (
          <>
            {/* VIP Carousel */}
            {vipAds.length > 0 ? (
              <View style={styles.vipSliderWrapper}>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={VIP_WIDTH + 12}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleScrollEnd}
                  contentContainerStyle={styles.vipSliderContent}
                >
                  {vipAds.map(renderVipCard)}
                </ScrollView>

                {vipAds.length > 1 ? (
                  <View style={styles.paginationContainer}>
                    {vipAds.map((_, index) => (
                      <View
                        key={index}
                        style={[styles.dot, currentVipIndex === index && styles.activeDot]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Masonry Grid */}
            {filteredAds.length > 0 ? (
              <View style={styles.masonryContainer}>
                <View style={styles.column}>
                  {leftCol.map(ad => (
                    <View key={ad.id} style={{ height: 200, marginBottom: 12 }}>
                      {renderAdCard(ad)}
                    </View>
                  ))}
                </View>
                <View style={styles.column}>
                  {rightCol.map(ad => (
                    <View key={ad.id} style={{ height: 200, marginBottom: 12 }}>
                      {renderAdCard(ad)}
                    </View>
                  ))}
                </View>
              </View>
            ) : filteredAds.length === 0 && boostedAds.length > 3 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="filter-list" size={40} color="#D1D5DB" />
                <Text style={styles.emptyText}>
                  {isAr ? 'لا توجد عروض في هذا القسم' : 'No offers in this category'}
                </Text>
                <Pressable onPress={() => setActiveCategory('all')}>
                  <Text style={{ color: '#E11D48', fontWeight: '700', marginTop: 8 }}>
                    {isAr ? 'عرض الكل' : 'Show all'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
  },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  refreshBtn: { backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },

  filtersWrapper: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 10,
  },
  filtersScrollContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent',
  },
  activeFilterChip: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  activeFilterText: { color: '#E11D48', fontWeight: '900' },

  scrollContent: { padding: 12, paddingBottom: 40 },

  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  vipSliderWrapper: { marginBottom: 16 },
  vipSliderContent: { gap: 12 },
  vipBannerContainer: {
    width: VIP_WIDTH, height: 260, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#1F2937',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  vipTag: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 6,
  },
  vipTagText: { fontSize: 12, fontWeight: '900', color: '#B45309' },
  vipContent: { flex: 1, justifyContent: 'flex-end', padding: 16, alignItems: 'flex-end', gap: 6 },
  countdownBadge: {
    backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countdownText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  vipTitle: {
    color: '#ffffff', fontSize: 17, fontWeight: '900', textAlign: 'right', lineHeight: 24,
  },
  vipPrice: { color: '#FCD34D', fontSize: 16, fontWeight: '800' },
  vipButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E11D48',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, gap: 8,
  },
  vipButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  paginationContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  activeDot: { width: 24, backgroundColor: '#E11D48' },

  masonryContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { width: '48.5%' },
  bannerCard: {
    width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  gradientOverlay: { ...StyleSheet.absoluteFillObject, top: '40%' },
  fireTag: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(239,68,68,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  fireText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  bannerContent: { flex: 1, justifyContent: 'flex-end', padding: 12, alignItems: 'flex-end' },
  storeName: { color: '#D1D5DB', fontSize: 11, fontWeight: '700', marginBottom: 2, textAlign: 'right' },
  bannerTitle: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 18, textAlign: 'right' },
  priceText: { color: '#FCD34D', fontSize: 13, fontWeight: '800', marginTop: 2 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { marginTop: 4, fontSize: 15, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
  emptySubText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#E11D48',
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
