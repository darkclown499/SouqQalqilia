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
// VIP Banner Component
// ─────────────────────────────────────────────────────────────────────────────

const VIPBanner = memo(({ offer, isAr }: { offer: Offer; isAr: boolean }) => {
  if (!offer) return null;

  return (
    <Pressable
      style={styles.vipBannerContainer}
      onPress={() => openWhatsApp(offer.phone, offer.title, offer.store_name)}
    >
      <Image
        source={{ uri: offer.image_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* شارة VIP */}
      <View style={[styles.vipBadge, { alignSelf: isAr ? 'flex-end' : 'flex-start' }]}>
        <Text style={styles.vipBadgeText}>عرض VIP 👑</Text>
      </View>

      <View style={[styles.vipContent, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
        <Text style={styles.vipSponsor}>الراعي الرسمي</Text>
        <Text style={styles.vipTitle} numberOfLines={2}>
          {offer.title || 'عرض حصري'}
        </Text>
        {offer.description && (
          <Text style={styles.vipDescription} numberOfLines={2}>
            {offer.description}
          </Text>
        )}
        <View style={styles.vipCta}>
          <Text style={styles.vipCtaText}>اكتشف العرض الآن</Text>
          <MaterialIcons name="arrow-forward" size={16} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Grid Item Component (Masonry card)
// ─────────────────────────────────────────────────────────────────────────────

const GridOfferItem = memo(function GridOfferItem({
  offer,
  width,
  height,
}: {
  offer: Offer;
  width: number;
  height: number;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => openWhatsApp(offer.phone, offer.title, offer.store_name)}
      style={[
        styles.gridItem,
        { width, height },
        pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
      ]}
    >
      <Image
        source={{ uri: offer.image_url || 'https://via.placeholder.com/300x200/cccccc/666666?text=No+Image' }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* شارة "لقطة 🔥" */}
      <View style={[styles.gridBadge, { alignSelf: 'flex-start' }]}>
        <Text style={styles.gridBadgeText}>لقطة 🔥</Text>
      </View>

      {/* النصوص في الأسفل */}
      <View style={styles.gridBottom}>
        {offer.store_name && (
          <Text style={styles.gridStore} numberOfLines={1}>
            {offer.store_name}
          </Text>
        )}
        {offer.title && (
          <Text style={styles.gridTitle} numberOfLines={2}>
            {offer.title}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  const items = 6;
  const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
  // ارتفاعات عشوائية للهيكل العظمي
  const heights = [200, 240, 210, 260, 190, 230];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP, paddingHorizontal: H_PAD }}>
      {Array(items).fill(0).map((_, i) => (
        <View
          key={i}
          style={[styles.skeletonItem, { width: itemWidth, height: heights[i % heights.length] }]}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
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

  // Carousel offers (VIP) - نستخدم أول عنصر كـ VIP Banner
  const [carouselOffers, setCarouselOffers] = useState<Offer[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  // ── Track page view ──────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      trackPageView('offers').catch(() => {});
    }, [])
  );

  // ── Fetch from Supabase ──────────────────────────────────────────────────
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

      // أول 3 عروض كـ VIP (نأخذ الأول للبانر، والباقي للكاروسيل)
      const vipCount = Math.min(3, offersData.length);
      const vip = offersData.slice(0, vipCount);
      const normal = offersData.slice(vipCount);

      setAllOffers(offersData);
      setCarouselOffers(vip.map(o => ({ ...o, is_vip: true })));
      setOffers(normal);
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
    if (activeCategory === 'الكل') return offers;
    return offers.filter(o => o.category === activeCategory);
  }, [offers, activeCategory]);

  // ── Masonry Layout: تقسيم إلى عمودين مع ارتفاعات مختلفة ──────────────
  const masonryData = useMemo(() => {
    const col1: Offer[] = [];
    const col2: Offer[] = [];
    filteredOffers.forEach((item, index) => {
      if (index % 2 === 0) col1.push(item);
      else col2.push(item);
    });
    return { col1, col2 };
  }, [filteredOffers]);

  // ── ارتفاعات عشوائية للبطاقات (تأثير Masonry) ─────────────────────────
  const getRandomHeight = (index: number) => {
    const base = 200;
    const variations = [0, 30, 60, -20, 40, -10, 50, 20];
    return base + (variations[index % variations.length] || 0);
  };

  // ── عرض العمود ──────────────────────────────────────────────────────────
  const renderColumn = (columnData: Offer[], columnIndex: number) => {
    const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;

    return (
      <View style={{ flex: 1, gap: COL_GAP }}>
        {columnData.map((offer, idx) => {
          const height = getRandomHeight(idx + columnIndex * 100);
          return (
            <GridOfferItem
              key={offer.id}
              offer={offer}
              width={itemWidth}
              height={height}
            />
          );
        })}
      </View>
    );
  };

  // ── VIP Banner (أول عرض من carouselOffers) ─────────────────────────────
  const vipOffer = carouselOffers.length > 0 ? carouselOffers[0] : null;

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
        {/* أيقونة التحديث (يسار) */}
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

        {/* العنوان في المنتصف */}
        <Text style={[styles.headerTitle, { color: headerTitle }]}>
          {isAr ? 'أقوى العروض 🔥' : 'Best Offers 🔥'}
        </Text>

        {/* أيقونة الرجوع (يمين) */}
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
          <SkeletonGrid />
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
        ) : (
          <>
            {/* ── VIP Banner ── */}
            {vipOffer && <VIPBanner offer={vipOffer} isAr={isAr} />}

            {/* ── عرض كاروسيل VIP (اختياري، يمكن إضافته إذا أردنا عرض أكثر من عرض VIP) ── */}
            {/* هنا يمكن إضافة Carousel للعروض VIP المتبقية */}

            {/* ── Grid (Masonry) ── */}
            {filteredOffers.length === 0 ? (
              <View style={[styles.centerBox, { paddingTop: 40 }]}>
                <Text style={styles.emptyEmoji}>🏷️</Text>
                <Text style={[styles.centerTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {activeCategory === 'الكل'
                    ? (isAr ? 'لا توجد عروض حالياً' : 'No offers available')
                    : (isAr ? `لا يوجد عروض في "${activeCategory}"` : `No offers in "${activeCategory}"`)}
                </Text>
                {activeCategory !== 'الكل' && (
                  <Pressable onPress={() => setActiveCategory('الكل')} style={[styles.showAllBtn, { backgroundColor: colors.primary }]}>
                    <Text style={styles.showAllBtnText}>{isAr ? 'عرض الكل' : 'Show all'}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={[styles.masonryContainer, { gap: COL_GAP }]}>
                {renderColumn(masonryData.col1, 0)}
                {renderColumn(masonryData.col2, 1)}
              </View>
            )}
          </>
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

  // Header
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

  // Filter bar
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

  // Body
  body: {
    paddingTop: 16,
  },

  // VIP Banner
  vipBannerContainer: {
    marginHorizontal: H_PAD,
    marginBottom: 20,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  vipBadge: {
    position: 'absolute',
    top: 12,
    backgroundColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 12,
    zIndex: 2,
  },
  vipBadgeText: {
    color: '#1F2937',
    fontSize: 12,
    fontWeight: '800',
  },
  vipContent: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 2,
  },
  vipSponsor: {
    color: '#F97316',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  vipTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginBottom: 4,
  },
  vipDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },
  vipCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  vipCtaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Masonry Grid
  masonryContainer: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
  },

  // Grid Item
  gridItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  gridBadge: {
    position: 'absolute',
    top: 8,
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginHorizontal: 8,
    zIndex: 2,
  },
  gridBadgeText: {
    color: '#1F2937',
    fontSize: 10,
    fontWeight: '800',
  },
  gridBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  gridStore: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  gridTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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