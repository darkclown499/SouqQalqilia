import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Linking, RefreshControl, Platform, FlatList,
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
  card_size?: string;       // small, medium, large, full
  card_position?: string;   // top, middle, bottom (يمكن استخدامه لترتيب العرض)
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 16;
const COL_GAP = 12;
const DEFAULT_PHONE = '972599234230';

// ── التصنيفات الثابتة حسب التصميم ──
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

// ── Banner placeholder fallback (لحالة عدم وجود صورة) ──────────────────────
const BANNER_FALLBACK = 'https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=800&q=80';

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Shuffle array
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp helper
// ─────────────────────────────────────────────────────────────────────────────

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
// Offer Item Component – يعرض العرض بحجم محدد من السيرفر
// ─────────────────────────────────────────────────────────────────────────────

const OfferItem = memo(({ offer, isAr }: { offer: Offer; isAr: boolean }) => {
  const size = offer.card_size || 'medium';

  // تحديد العرض والارتفاع بناءً على الحجم
  let width = SCREEN_W - H_PAD * 2;
  let height = 200;
  let borderRadius = 12;

  switch (size) {
    case 'full':
      width = SCREEN_W;
      height = 300; // تكبير البنر الكامل
      borderRadius = 0;
      break;
    case 'large':
      width = SCREEN_W - H_PAD * 2;
      height = 240;
      break;
    case 'medium':
      width = (SCREEN_W - H_PAD * 2) * 0.8;
      height = 200;
      break;
    case 'small':
      width = (SCREEN_W - H_PAD * 2) * 0.6;
      height = 160;
      break;
    default:
      width = SCREEN_W - H_PAD * 2;
      height = 200;
  }

  const handlePress = () => {
    // إذا كان هناك رقم هاتف، نفتح واتساب، وإلا نفتح الرابط إن وجد
    if (offer.phone) {
      openWhatsApp(offer.phone, offer.title, offer.store_name);
    } else if (offer.image_url) {
      // يمكن فتح الرابط أو الانتقال إلى تفاصيل العرض
      // هنا نفتح واتساب بالرقم الافتراضي
      openWhatsApp(DEFAULT_PHONE, offer.title, offer.store_name);
    }
  };

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
          marginVertical: 6,
          opacity: pressed ? 0.9 : 1,
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
      {offer.title && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={StyleSheet.absoluteFill}
        />
      )}
      {offer.title && (
        <View style={[styles.offerTextContainer, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
          {offer.store_name && (
            <Text style={[styles.offerStore, { textAlign: isAr ? 'right' : 'left' }]}>
              {offer.store_name}
            </Text>
          )}
          <Text style={[styles.offerTitle, { textAlign: isAr ? 'right' : 'left' }]}>
            {offer.title}
          </Text>
          {offer.description && (
            <Text style={[styles.offerDesc, { textAlign: isAr ? 'right' : 'left' }]}>
              {offer.description}
            </Text>
          )}
          {offer.is_vip && (
            <View style={styles.vipChip}>
              <Text style={styles.vipChipText}>VIP</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Banner Item Component (من جدول banners) – اختياري
// ─────────────────────────────────────────────────────────────────────────────

const BannerItem = memo(({ banner, isAr }: { banner: Banner; isAr: boolean }) => {
  const size = banner.size || 'medium';

  let width = SCREEN_W - H_PAD * 2;
  let height = 200;
  let borderRadius = 12;

  switch (size) {
    case 'full':
      width = SCREEN_W;
      height = 280;
      borderRadius = 0;
      break;
    case 'large':
      width = SCREEN_W - H_PAD * 2;
      height = 220;
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
      {banner.title && banner.showText !== false && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={StyleSheet.absoluteFill}
        />
      )}
      {banner.title && banner.showText !== false && (
        <View style={[styles.offerTextContainer, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.offerTitle, { textAlign: isAr ? 'right' : 'left' }]}>
            {banner.title}
          </Text>
          {banner.subtitle && (
            <Text style={[styles.offerDesc, { textAlign: isAr ? 'right' : 'left' }]}>
              {banner.subtitle}
            </Text>
          )}
          {banner.isVip && (
            <View style={styles.vipChip}>
              <Text style={styles.vipChipText}>VIP</Text>
            </View>
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
  const items = 3;
  const heights = [250, 200, 180];

  return (
    <View style={{ paddingHorizontal: H_PAD, gap: 12 }}>
      {Array(items).fill(0).map((_, i) => (
        <View
          key={i}
          style={[styles.skeletonItem, { width: SCREEN_W - H_PAD * 2, height: heights[i % heights.length] }]}
        />
      ))}
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

  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('الكل');

  // ── حالة البانرات من السيرفر (اختياري) ──
  const [banners, setBanners] = useState<Banner[]>([]);

  // ── Track page view ──────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      trackPageView('offers').catch(() => {});
    }, [])
  );

  // ── جلب البانرات من السيرفر (اختياري) ────────────────────────────────
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

  // ── Fetch Offers from Supabase ──────────────────────────────────────────
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
      const offersData = (data ?? []) as Offer[];

      // نأخذ جميع العروض (بدون تقسيم VIP)
      setAllOffers(offersData);
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

  // ── Categories ──────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const fromOffers = new Set<string>();
    allOffers.forEach(o => { if (o.category) fromOffers.add(o.category); });

    const combined = new Set(STATIC_CATEGORIES);
    fromOffers.forEach(cat => combined.add(cat));

    const result = Array.from(combined);
    const indexAll = result.indexOf('الكل');
    if (indexAll > 0) {
      result.splice(indexAll, 1);
      result.unshift('الكل');
    }
    return result;
  }, [allOffers]);

  // ── Filtered offers ──────────────────────────────────────────────────────
  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return allOffers;
    return allOffers.filter(o => o.category === activeCategory);
  }, [allOffers, activeCategory]);

  // ── ترتيب العروض حسب الحجم (كبير أولاً) ──────────────────────────────
  const sortedOffers = useMemo(() => {
    const order = { full: 0, large: 1, medium: 2, small: 3 };
    return [...filteredOffers].sort((a, b) => {
      const sizeA = a.card_size || 'medium';
      const sizeB = b.card_size || 'medium';
      return (order[sizeA as keyof typeof order] ?? 2) - (order[sizeB as keyof typeof order] ?? 2);
    });
  }, [filteredOffers]);

  // ── دمج البانرات مع العروض (اختياري) ──────────────────────────────────
  // يمكن عرض البانرات في الأعلى أو الأسفل. هنا نعرضها في الأعلى قبل العروض.
  const displayItems = useMemo(() => {
    const items: JSX.Element[] = [];

    // إضافة البانرات من جدول banners إذا وجدت
    if (banners.length > 0) {
      banners.forEach((banner, index) => {
        items.push(
          <BannerItem key={`banner-${banner.id || index}`} banner={banner} isAr={isAr} />
        );
      });
    }

    // إضافة العروض
    sortedOffers.forEach((offer) => {
      items.push(
        <OfferItem key={`offer-${offer.id}`} offer={offer} isAr={isAr} />
      );
    });

    return items;
  }, [banners, sortedOffers, isAr]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#1E293B' : '#FFFFFF';
  const headerBorder = isDark ? '#334155' : '#E2E8F0';
  const headerTitle = isDark ? '#F1F5F9' : '#111827';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
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

      {/* ── Category Filter Bar ── */}
      {categories.length > 0 && (
        <View style={[styles.filterBar, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
          <FlatList
            horizontal
            data={categories}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
            renderItem={({ item: cat }) => {
              const isActive = activeCategory === cat;
              return (
                <Pressable
                  onPress={() => setActiveCategory(cat)}
                  style={[
                    styles.chip,
                    isActive
                      ? {
                          backgroundColor: '#FFFFFF',
                          borderColor: '#EF4444',
                          borderWidth: 1.5,
                        }
                      : {
                          backgroundColor: '#F3F4F6',
                          borderColor: 'transparent',
                          borderWidth: 0,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isActive ? '#EF4444' : '#4B5563' },
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

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
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={[styles.centerTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {isAr ? 'لا توجد عروض حالياً' : 'No offers available'}
            </Text>
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

  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: H_PAD,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },

  body: {
    paddingTop: 16,
  },

  // Offer Item
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
    padding: 12,
  },
  offerStore: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  offerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  offerDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  vipChip: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  vipChipText: {
    color: '#1A1A1A',
    fontSize: 10,
    fontWeight: '900',
  },

  // Banner Item
  bannerItem: {
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
  },

  // Skeleton
  skeletonItem: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    opacity: 0.6,
  },

  // States
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
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
  showAllBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
  },
  showAllBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});