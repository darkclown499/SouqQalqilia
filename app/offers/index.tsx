import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Linking, RefreshControl, Platform, FlatList,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getSupabaseClient } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { trackPageView } from '@/services/analyticsService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  category: string | null;
  phone: string | null;
  store_name: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  is_vip?: boolean;
  card_size?: string;
  card_position?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = 16;
const COL_GAP = 12;
const DEFAULT_PHONE = '972599234230';

const CATEGORY_ICONS: Record<string, string> = {
  'الكل': 'apps',
  'مطاعم': 'restaurant',
  'سوبرماركت': 'local-grocery-store',
  'إلكترونيات': 'devices',
  'خضروات وفواكه': 'local-grocery-store',
  'زينة وهدايا': 'card-giftcard',
  'مستحضرات تجميل': 'spa',
  'وظائف': 'work',
  'رياضة': 'sports-soccer',
  'عقارات': 'real-estate-agent',
  'حيوانات': 'pets',
  'سيارات ومركبات': 'car-repair',
  'أثاث': 'table-rows',
};

const STATIC_CATEGORIES = [
  'الكل',
  'مطاعم',
  'سوبرماركت',
  'إلكترونيات',
  'خضروات وفواكه',
  'زينة وهدايا',
  'مستحضرات تجميل',
  'وظائف',
  'رياضة',
  'عقارات',
  'حيوانات',
  'سيارات ومركبات',
  'أثاث',
];

const BANNER_FALLBACK = 'https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=800&q=80';

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function openWhatsApp(phone: string | null, title: string | null, storeName: string | null) {
  const number = (phone ?? DEFAULT_PHONE).replace(/\D/g, '');
  const msg = encodeURIComponent(
    `مرحباً، أنا مهتم بالعرض: ${title ?? 'عرض خاص'}${storeName ? ` من ${storeName}` : ''}`
  );
  const waUrl = `https://wa.me/${number}?text=${msg}`;
  const waApp = `whatsapp://send?phone=${number}&text=${msg}`;

  try {
    const canApp = await Linking.canOpenURL(waApp);
    if (canApp) {
      await Linking.openURL(waApp);
    } else {
      await Linking.openURL(waUrl);
    }
  } catch {
    try {
      await Linking.openURL(waUrl);
    } catch {
      // Silent fail
    }
  }
}

// ─── حساب ارتفاع العرض حسب حجمه ────────────────────────────────────────────
function getOfferHeight(size: string): number {
  switch (size) {
    case 'full':
      return 360;
    case 'large':
      return 300;
    case 'medium':
      return 240;
    case 'small':
      return 180;
    default:
      return 220;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carousel Component (للعروض الكبيرة Full/Large) – بدون تعتيم
// ─────────────────────────────────────────────────────────────────────────────

const OfferCarousel = memo(({ offers, isAr }: { offers: Offer[]; isAr: boolean }) => {
  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width);
  const [screenH, setScreenH] = useState(() => Dimensions.get('window').height);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreenW(window.width);
      setScreenH(window.height);
    });
    return () => sub?.remove();
  }, []);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<FlatList>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);

  useEffect(() => {
    if (offers.length <= 1) return;
    const startAutoScroll = () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      autoTimer.current = setInterval(() => {
        if (userScrolling.current) return;
        const nextIndex = (activeIndex + 1) % offers.length;
        setActiveIndex(nextIndex);
        scrollRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      }, 4000);
    };
    startAutoScroll();
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [offers.length, activeIndex]);

  const onScrollBeginDrag = () => { userScrolling.current = true; };
  const onScrollEndDrag = () => { userScrolling.current = false; };
  const onMomentumScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / screenW);
    setActiveIndex(Math.min(index, offers.length - 1));
  };

  const renderItem = ({ item }: { item: Offer }) => {
    const isVip = item.is_vip || false;
    return (
      <Pressable
        style={{ width: screenW, height: screenH * 0.5 }}
        onPress={() => {
          if (item.phone) {
            openWhatsApp(item.phone, item.title, item.store_name);
          } else {
            openWhatsApp(DEFAULT_PHONE, item.title, item.store_name);
          }
        }}
      >
        <Image
          source={{ uri: item.image_url || BANNER_FALLBACK }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={500}
          cachePolicy="disk"
        />
        {/* ❌ تم إزالة التدرج الأسود بالكامل */}
        {isVip && (
          <View style={[styles.vipBadgeCarousel, { alignSelf: isAr ? 'flex-end' : 'flex-start' }]}>
            <Text style={styles.vipBadgeText}>VIP</Text>
          </View>
        )}
      </Pressable>
    );
  };

  if (offers.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <FlatList
        ref={scrollRef}
        horizontal
        pagingEnabled
        data={offers}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: screenW, offset: screenW * index, index })}
      />
      {offers.length > 1 && (
        <View style={[styles.paginationDots, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {offers.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                activeIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Offer Item Component (للشبكة الماسونية) – بدون تعتيم
// ─────────────────────────────────────────────────────────────────────────────

const OfferItem = memo(({ offer, isAr, width, height }: { offer: Offer; isAr: boolean; width: number; height: number }) => {
  const isVip = offer.is_vip || false;

  const handlePress = () => {
    if (offer.phone) {
      openWhatsApp(offer.phone, offer.title, offer.store_name);
    } else {
      openWhatsApp(DEFAULT_PHONE, offer.title, offer.store_name);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.masonryItem,
        {
          width,
          height,
          opacity: pressed ? 0.95 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Image
        source={{ uri: offer.image_url || BANNER_FALLBACK }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        cachePolicy="disk"
      />
      {/* ❌ تم إزالة التدرج الأسود بالكامل */}
      {isVip && (
        <View style={[styles.vipBadgeMasonry, { alignSelf: isAr ? 'flex-end' : 'flex-start' }]}>
          <Text style={styles.vipBadgeTextSmall}>VIP</Text>
        </View>
      )}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonLoader() {
  const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
  return (
    <View style={{ paddingHorizontal: H_PAD, gap: COL_GAP }}>
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>
        <View style={[styles.skeletonItem, { width: itemWidth, height: 240 }]} />
        <View style={[styles.skeletonItem, { width: itemWidth, height: 180 }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>
        <View style={[styles.skeletonItem, { width: itemWidth, height: 200 }]} />
        <View style={[styles.skeletonItem, { width: itemWidth, height: 260 }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const isRTL = language === 'ar';

  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenW(window.width));
    return () => sub?.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackPageView('offers').catch(() => {});
    }, [])
  );

  // ── جلب العروض ──
  const fetchOffers = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: dbError } = await supabase
        .from('offers')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (dbError) throw new Error(dbError.message);
      setAllOffers((data ?? []) as Offer[]);
    } catch (e: any) {
      setError(isAr ? 'فشل تحميل العروض. تحقق من اتصالك.' : 'Failed to load offers. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAr]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOffers(false);
  }, [fetchOffers]);

  // ── البحث والتصفية ──
  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return allOffers;
    const q = searchQuery.trim().toLowerCase();
    return allOffers.filter(o =>
      (o.title?.toLowerCase().includes(q) ||
       o.description?.toLowerCase().includes(q) ||
       o.store_name?.toLowerCase().includes(q) ||
       o.category?.toLowerCase().includes(q))
    );
  }, [allOffers, searchQuery]);

  // ── Categories ──
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    filteredBySearch.forEach(o => {
      const cat = o.category || 'أخرى';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    const result = STATIC_CATEGORIES.map(cat => ({
      name: cat,
      count: map.get(cat) || 0,
    }));
    for (const [cat, count] of map.entries()) {
      if (!STATIC_CATEGORIES.includes(cat)) {
        result.push({ name: cat, count });
      }
    }
    return result;
  }, [filteredBySearch]);

  // ── Filtered offers حسب التصنيف ──
  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return filteredBySearch;
    return filteredBySearch.filter(o => o.category === activeCategory);
  }, [filteredBySearch, activeCategory]);

  // ── العروض الكبيرة للكاروسيل ──
  const carouselOffers = useMemo(() => {
    return filteredOffers
      .filter(o => o.card_size === 'full' || o.card_size === 'large')
      .slice(0, 5);
  }, [filteredOffers]);

  // ── باقي العروض للشبكة الماسونية ──
  const remainingOffers = useMemo(() => {
    const carouselIds = new Set(carouselOffers.map(o => o.id));
    return filteredOffers.filter(o => !carouselIds.has(o.id));
  }, [carouselOffers, filteredOffers]);

  // ── توزيع العروض على عمودين (ماسوني) ──
  const masonryColumns = useMemo(() => {
    const col1: Offer[] = [];
    const col2: Offer[] = [];
    let height1 = 0;
    let height2 = 0;

    remainingOffers.forEach((offer) => {
      const h = getOfferHeight(offer.card_size || 'medium');
      if (height1 <= height2) {
        col1.push(offer);
        height1 += h + COL_GAP;
      } else {
        col2.push(offer);
        height2 += h + COL_GAP;
      }
    });

    return { col1, col2 };
  }, [remainingOffers]);

  // ── دمج العناصر للعرض ──
  const displayItems = useMemo(() => {
    const items: JSX.Element[] = [];
    const itemWidth = (screenW - H_PAD * 2 - COL_GAP) / 2;

    // 1. الكاروسيل
    if (carouselOffers.length > 0) {
      items.push(
        <OfferCarousel key="carousel" offers={carouselOffers} isAr={isAr} />
      );
    }

    // 2. الشبكة الماسونية (عمودين)
    if (masonryColumns.col1.length > 0 || masonryColumns.col2.length > 0) {
      const renderColumn = (offers: Offer[], columnIndex: number) => {
        return (
          <View key={`col-${columnIndex}`} style={{ flex: 1, gap: COL_GAP }}>
            {offers.map((offer) => {
              const height = getOfferHeight(offer.card_size || 'medium');
              return (
                <OfferItem
                  key={offer.id}
                  offer={offer}
                  isAr={isAr}
                  width={itemWidth}
                  height={height}
                />
              );
            })}
          </View>
        );
      };

      items.push(
        <View
          key="masonry"
          style={[
            styles.masonryRow,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          {renderColumn(masonryColumns.col1, 0)}
          {renderColumn(masonryColumns.col2, 1)}
        </View>
      );
    }

    return items;
  }, [carouselOffers, masonryColumns, isAr, isRTL, screenW]);

  const handleAddOffer = useCallback(() => {
    router.push('/support-form');
  }, [router]);

  const toggleSearch = useCallback(() => {
    setIsSearchVisible(prev => !prev);
    if (isSearchVisible) setSearchQuery('');
  }, [isSearchVisible]);

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#1E293B' : '#FFFFFF';
  const headerBorder = isDark ? '#334155' : '#E2E8F0';
  const headerTitle = isDark ? '#F1F5F9' : '#111827';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={handleRefresh}
            hitSlop={12}
            disabled={refreshing}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="refresh" size={24} color={headerTitle} />
            )}
          </Pressable>
          <Pressable
            onPress={toggleSearch}
            hitSlop={12}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name={isSearchVisible ? 'close' : 'search'} size={24} color={headerTitle} />
          </Pressable>
          <Pressable
            onPress={handleAddOffer}
            hitSlop={12}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="add" size={28} color={headerTitle} />
          </Pressable>
        </View>

        <Text style={[styles.headerTitle, { color: headerTitle }]}>
          {isAr ? 'أقوى العروض 🔥' : 'Best Offers 🔥'}
        </Text>

        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name={isAr ? 'chevron-right' : 'chevron-left'} size={28} color={headerTitle} />
        </Pressable>
      </View>

      {/* ── شريط البحث ── */}
      {isSearchVisible && (
        <View style={[styles.searchBar, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={isAr ? 'ابحث عن عرض...' : 'Search offers...'}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Category Filter Bar ── */}
      <View style={[styles.filterBar, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
        <FlatList
          horizontal
          data={categoriesWithCount}
          keyExtractor={(item) => item.name}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          renderItem={({ item: { name, count } }) => {
            const isActive = activeCategory === name;
            const iconName = CATEGORY_ICONS[name] || 'category';
            return (
              <Pressable
                onPress={() => setActiveCategory(name)}
                style={[
                  styles.chip,
                  isActive
                    ? { backgroundColor: '#FFFFFF', borderColor: '#EF4444', borderWidth: 1.5 }
                    : { backgroundColor: '#F3F4F6', borderColor: 'transparent', borderWidth: 0 },
                ]}
              >
                <MaterialIcons name={iconName as any} size={14} color={isActive ? '#EF4444' : '#4B5563'} />
                <Text
                  style={[
                    styles.chipText,
                    { color: isActive ? '#EF4444' : '#4B5563' },
                  ]}
                >
                  {name}
                </Text>
                {count > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      {/* ── عدد العروض المعروضة ── */}
      <View style={[styles.statsRow, { flexDirection: isRTL ? 'row-reverse' : 'row', paddingHorizontal: H_PAD }]}>
        <Text style={[styles.statsText, { color: colors.textMuted }]}>
          {filteredOffers.length} {isAr ? 'عرض' : 'offers'}
          {searchQuery.trim() ? ` • "${searchQuery}"` : ''}
        </Text>
        <Text style={[styles.statsText, { color: colors.textMuted }]}>
          {isAr ? 'تم تحديثه' : 'Updated'} {new Date().toLocaleDateString()}
        </Text>
      </View>

      {/* ── Body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {loading ? (
          <SkeletonLoader />
        ) : error ? (
          <View style={styles.centerBox}>
            <MaterialIcons name="wifi-off" size={52} color="#CBD5E1" />
            <Text style={[styles.centerTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {isAr ? 'تعذّر تحميل العروض' : 'Could not load offers'}
            </Text>
            <Text style={[styles.centerSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>{error}</Text>
            <Pressable
              onPress={() => fetchOffers()}
              style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : displayItems.length === 0 ? (
          <View style={[styles.centerBox, { paddingTop: 40 }]}>
            <View style={styles.emptyIllustration}>
              <MaterialIcons name="local-offer" size={64} color="#CBD5E1" />
            </View>
            <Text style={[styles.centerTitle, { color: isDark ? '#F1F5F9' : '#1F2937' }]}>
              {isAr ? 'لا توجد عروض حالياً' : 'No offers available'}
            </Text>
            <Text style={[styles.centerSub, { color: isDark ? '#94A3B8' : '#6B7280' }]}>
              {isAr ? 'كن أول من يضيف عرضاً واستفد من الخصومات' : 'Be the first to add an offer and enjoy discounts'}
            </Text>
            <Pressable
              onPress={handleAddOffer}
              style={[styles.addOfferBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.addOfferBtnText}>
                {isAr ? 'أضف عرضاً جديداً' : 'Add New Offer'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 0 }}>{displayItems}</View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
  },

  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: H_PAD,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  statsText: {
    fontSize: 12,
    fontWeight: '500',
  },

  body: {
    paddingTop: 0,
  },

  // ── Carousel ──
  paginationDots: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  activeDot: {
    backgroundColor: '#FFFFFF',
    width: 12,
    height: 8,
    borderRadius: 4,
  },
  vipBadgeCarousel: {
    position: 'absolute',
    top: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 16,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  vipBadgeText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Masonry ──
  masonryRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: COL_GAP,
  },
  masonryItem: {
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 0,
    borderRadius: 14,
    position: 'relative',
  },
  vipBadgeMasonry: {
    position: 'absolute',
    top: 10,
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginHorizontal: 10,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  vipBadgeTextSmall: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // ── Skeleton ──
  skeletonItem: {
    backgroundColor: '#E5E7EB',
    opacity: 0.6,
    borderRadius: 14,
  },

  // ── States ──
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  addOfferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addOfferBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});