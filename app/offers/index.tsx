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
import { fetchActiveBanners, getBannersCache, setBannersCache, Banner } from '@/services/bannersService';

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

// أيقونات التصنيفات
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

// ─────────────────────────────────────────────────────────────────────────────
// Banner Carousel Component (عروض متعددة مع نقاط تنقل)
// ─────────────────────────────────────────────────────────────────────────────

const BannerCarousel = memo(({ offers, isAr }: { offers: Offer[]; isAr: boolean }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<FlatList>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);

  // بدء التمرير التلقائي
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
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(Math.min(index, offers.length - 1));
  };

  const renderItem = ({ item }: { item: Offer }) => (
    <View style={{ width: SCREEN_W, height: SCREEN_H * 0.6 }}>
      <Image
        source={{ uri: item.image_url || BANNER_FALLBACK }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={500}
        cachePolicy="disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bannerTextContainer, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
        {item.store_name && (
          <Text style={[styles.offerStore, { textAlign: isAr ? 'right' : 'left' }]}>
            {item.store_name}
          </Text>
        )}
        <Text style={[styles.offerTitle, { textAlign: isAr ? 'right' : 'left', fontSize: 36 }]}>
          {item.title}
        </Text>
        {item.description && (
          <Text style={[styles.offerDesc, { textAlign: isAr ? 'right' : 'left', fontSize: 20 }]}>
            {item.description}
          </Text>
        )}
        {item.is_vip && (
          <LinearGradient
            colors={['#FFD700', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vipChipGradient}
          >
            <Text style={styles.vipChipText}>👑 VIP</Text>
          </LinearGradient>
        )}
        <View style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>
            {isAr ? 'اكتشف العرض الآن' : 'Discover Now'}
          </Text>
          <MaterialIcons name="arrow-forward" size={20} color="#1A1A1A" />
        </View>
      </View>
    </View>
  );

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
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
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
// Offer Item Component (لباقي العروض)
// ─────────────────────────────────────────────────────────────────────────────

const OfferItem = memo(({ offer, isAr }: { offer: Offer; isAr: boolean }) => {
  const size = offer.card_size || 'medium';

  let width = SCREEN_W - H_PAD * 2;
  let height = 240;
  let borderRadius = 14;
  let titleFontSize = 24;
  let descFontSize = 16;

  switch (size) {
    case 'full':
      width = SCREEN_W;
      height = SCREEN_H * 0.6;
      borderRadius = 0;
      titleFontSize = 36;
      descFontSize = 20;
      break;
    case 'large':
      width = SCREEN_W - H_PAD * 2;
      height = 320;
      borderRadius = 16;
      titleFontSize = 28;
      descFontSize = 17;
      break;
    case 'medium':
      width = (SCREEN_W - H_PAD * 2) * 0.85;
      height = 240;
      borderRadius = 14;
      titleFontSize = 22;
      descFontSize = 15;
      break;
    case 'small':
      width = (SCREEN_W - H_PAD * 2) * 0.65;
      height = 180;
      borderRadius = 12;
      titleFontSize = 18;
      descFontSize = 13;
      break;
    default:
      width = SCREEN_W - H_PAD * 2;
      height = 240;
      borderRadius = 14;
      titleFontSize = 24;
      descFontSize = 16;
  }

  const handlePress = () => {
    if (offer.phone) {
      openWhatsApp(offer.phone, offer.title, offer.store_name);
    } else {
      openWhatsApp(DEFAULT_PHONE, offer.title, offer.store_name);
    }
  };

  const isLarge = size === 'full' || size === 'large';

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.offerItem,
        {
          width,
          height,
          borderRadius,
          alignSelf: 'center',
          marginVertical: isLarge ? 0 : 6,
          opacity: pressed ? 0.95 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: isLarge ? 12 : 6 },
          shadowOpacity: isLarge ? 0.5 : 0.3,
          shadowRadius: isLarge ? 30 : 16,
          elevation: isLarge ? 20 : 8,
        },
      ]}
    >
      <Image
        source={{ uri: offer.image_url || BANNER_FALLBACK }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
        cachePolicy="disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      {isLarge && (
        <View style={styles.goldFrame}>
          <LinearGradient
            colors={['#FFD700', '#FFA500', '#FFD700']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.goldLine, styles.goldLineTop]}
          />
          <LinearGradient
            colors={['#FFD700', '#FFA500', '#FFD700']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.goldLine, styles.goldLineBottom]}
          />
        </View>
      )}
      {offer.title && (
        <View style={[styles.offerTextContainer, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
          {offer.store_name && (
            <Text style={[styles.offerStore, { textAlign: isAr ? 'right' : 'left' }]}>
              {offer.store_name}
            </Text>
          )}
          <Text style={[styles.offerTitle, { textAlign: isAr ? 'right' : 'left', fontSize: titleFontSize }]}>
            {offer.title}
          </Text>
          {offer.description && (
            <Text style={[styles.offerDesc, { textAlign: isAr ? 'right' : 'left', fontSize: descFontSize }]}>
              {offer.description}
            </Text>
          )}
          {offer.is_vip && (
            <LinearGradient
              colors={['#FFD700', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.vipChipGradient}
            >
              <Text style={styles.vipChipText}>👑 VIP</Text>
            </LinearGradient>
          )}
          {isLarge && (
            <View style={styles.ctaButton}>
              <Text style={styles.ctaButtonText}>
                {isAr ? 'عرض المزيد' : 'Show More'}
              </Text>
              <MaterialIcons name="arrow-forward" size={20} color="#1A1A1A" />
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Banner Item Component (من جدول banners)
// ─────────────────────────────────────────────────────────────────────────────

const BannerItem = memo(({ banner, isAr }: { banner: Banner; isAr: boolean }) => {
  const size = banner.size || 'medium';

  let width = SCREEN_W - H_PAD * 2;
  let height = 200;
  let borderRadius = 12;

  switch (size) {
    case 'full':
      width = SCREEN_W;
      height = SCREEN_H * 0.5;
      borderRadius = 0;
      break;
    case 'large':
      width = SCREEN_W - H_PAD * 2;
      height = 260;
      break;
    case 'medium':
      width = (SCREEN_W - H_PAD * 2) * 0.8;
      height = 180;
      break;
    case 'small':
      width = (SCREEN_W - H_PAD * 2) * 0.6;
      height = 150;
      break;
    default:
      width = SCREEN_W - H_PAD * 2;
      height = 200;
  }

  const handlePress = () => {
    if (banner.link_url) {
      if (banner.link_url.startsWith('http') || banner.link_url.startsWith('https')) {
        Linking.openURL(banner.link_url).catch(() => {});
      } else {
        Linking.openURL(banner.link_url).catch(() => {});
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.bannerItem,
        {
          width,
          height,
          borderRadius,
          alignSelf: 'center',
          marginVertical: 6,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Image
        source={{ uri: banner.image_url || BANNER_FALLBACK }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        cachePolicy="disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      {banner.title && banner.showText !== false && (
        <View style={[styles.offerTextContainer, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.offerTitle, { textAlign: isAr ? 'right' : 'left', fontSize: 22 }]}>
            {banner.title}
          </Text>
          {banner.subtitle && (
            <Text style={[styles.offerDesc, { textAlign: isAr ? 'right' : 'left', fontSize: 16 }]}>
              {banner.subtitle}
            </Text>
          )}
          {banner.isVip && (
            <LinearGradient
              colors={['#FFD700', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.vipChipGradient}
            >
              <Text style={styles.vipChipText}>👑 VIP</Text>
            </LinearGradient>
          )}
        </View>
      )}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <View style={{ paddingHorizontal: 0, gap: 12 }}>
      <View style={[styles.skeletonItem, { width: SCREEN_W, height: SCREEN_H * 0.6 }]} />
      <View style={[styles.skeletonItem, { width: SCREEN_W - H_PAD * 2, height: 240, alignSelf: 'center', borderRadius: 14 }]} />
      <View style={[styles.skeletonItem, { width: SCREEN_W - H_PAD * 2, height: 200, alignSelf: 'center', borderRadius: 14 }]} />
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
  const [banners, setBanners] = useState<Banner[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trackPageView('offers').catch(() => {});
    }, [])
  );

  // ── جلب البانرات ──
  useEffect(() => {
    const cached = getBannersCache('offers');
    if (cached && cached.length > 0) {
      setBanners(cached);
      return;
    }

    const controller = new AbortController();
    fetchActiveBanners('offers', { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          if (data && data.length > 0) {
            const shuffled = shuffleArray(data);
            setBannersCache(shuffled, 'offers');
            setBanners(shuffled);
          } else {
            setBanners([]);
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('⚠️ فشل جلب بانرات العروض:', err);
        setBanners([]);
      });

    return () => controller.abort();
  }, []);

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

  // ── Categories مع عدد العروض ──
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
    // إضافة تصنيفات من العروض غير الموجودة في القائمة الثابتة
    for (const [cat, count] of map.entries()) {
      if (!STATIC_CATEGORIES.includes(cat)) {
        result.push({ name: cat, count });
      }
    }
    return result;
  }, [filteredBySearch]);

  // ── Filtered offers حسب التصنيف والبحث ──
  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return filteredBySearch;
    return filteredBySearch.filter(o => o.category === activeCategory);
  }, [filteredBySearch, activeCategory]);

  // ── ترتيب العروض حسب الحجم ──
  const sortedOffers = useMemo(() => {
    const order = { full: 0, large: 1, medium: 2, small: 3 };
    return [...filteredOffers].sort((a, b) => {
      const sizeA = a.card_size || 'medium';
      const sizeB = b.card_size || 'medium';
      return (order[sizeA as keyof typeof order] ?? 2) - (order[sizeB as keyof typeof order] ?? 2);
    });
  }, [filteredOffers]);

  // ── Carousel offers (أول 5 عروض كبيرة) ──
  const carouselOffers = useMemo(() => {
    const fullOffers = sortedOffers.filter(o => o.card_size === 'full' || o.card_size === 'large');
    if (fullOffers.length > 0) return fullOffers.slice(0, 5);
    return sortedOffers.slice(0, 5);
  }, [sortedOffers]);

  // ── باقي العروض (بعد الكاروسيل) ──
  const remainingOffers = useMemo(() => {
    const carouselIds = new Set(carouselOffers.map(o => o.id));
    return sortedOffers.filter(o => !carouselIds.has(o.id));
  }, [sortedOffers, carouselOffers]);

  // ── دمج البانرات مع العروض ──
  const displayItems = useMemo(() => {
    const items: JSX.Element[] = [];

    // إذا كانت هناك بانرات من جدول banners نعرضها
    if (banners.length > 0) {
      const sortedBanners = [...banners].sort((a, b) => {
        const order = { full: 0, large: 1, medium: 2, small: 3 };
        const sizeA = a.size || 'medium';
        const sizeB = b.size || 'medium';
        return (order[sizeA as keyof typeof order] ?? 2) - (order[sizeB as keyof typeof order] ?? 2);
      });
      sortedBanners.forEach((banner, index) => {
        items.push(
          <BannerItem key={`banner-${banner.id || index}`} banner={banner} isAr={isAr} />
        );
      });
    } else if (carouselOffers.length > 0) {
      // كاروسيل العروض
      items.push(
        <BannerCarousel key="carousel" offers={carouselOffers} isAr={isAr} />
      );
    }

    // باقي العروض
    remainingOffers.forEach((offer) => {
      items.push(
        <OfferItem key={`offer-${offer.id}`} offer={offer} isAr={isAr} />
      );
    });

    return items;
  }, [banners, carouselOffers, remainingOffers, isAr]);

  const handleAddOffer = useCallback(() => {
    router.push('/admin/offers');
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
          <View style={{ paddingHorizontal: 0 }}>
            {displayItems}
          </View>
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

  // ── Banner Carousel ──
  bannerTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
  },
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

  // ── Offer Item ──
  offerItem: {
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
  },
  offerTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  offerStore: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 1,
  },
  offerTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    letterSpacing: 0.5,
  },
  offerDesc: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  vipChipGradient: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'flex-start',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  vipChipText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '800',
  },

  // ── Gold Frame ──
  goldFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    pointerEvents: 'none',
  },
  goldLine: {
    height: 3,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  goldLineTop: {
    top: 0,
  },
  goldLineBottom: {
    bottom: 0,
  },

  // ── Banner Item ──
  bannerItem: {
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
  },

  // ── Skeleton ──
  skeletonItem: {
    backgroundColor: '#E5E7EB',
    opacity: 0.6,
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
  emptyEmoji: {
    fontSize: 52,
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