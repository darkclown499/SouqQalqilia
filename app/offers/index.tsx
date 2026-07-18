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
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { trackPageView } from '@/services/analyticsService';
import {
  fetchActiveBanners, getBannersCache, setBannersCache, getBannerPressHandler,
  Banner,
} from '@/services/bannersService';
import { getSupabaseClient } from '@/template';
import { offerCategoriesService } from '@/services/offerCategoriesService';

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
  card_size?: string;
}

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 16;
const COL_GAP = 12;
const DEFAULT_PHONE = '972599234230';

// ── Card size → height ───────────────────────────────────────────────────────
const CARD_SIZE_HEIGHT: Record<string, number> = {
  small: 140,
  medium: 200,
  large: 280,
  full: Math.round(SCREEN_W * 0.75),
};

// ── WhatsApp helper ──────────────────────────────────────────────────────────
async function openWhatsApp(phone: string | null, title: string | null, storeName: string | null) {
  const number = (phone ?? DEFAULT_PHONE).replace(/\D/g, '');
  const msg = encodeURIComponent(
    `مرحباً، أنا مهتم بالعرض: ${title ?? 'عرض خاص'}${storeName ? ` من ${storeName}` : ''}`
  );
  const waApp = `whatsapp://send?phone=${number}&text=${msg}`;
  const waUrl = `https://wa.me/${number}?text=${msg}`;
  try {
    const canApp = await Linking.canOpenURL(waApp);
    if (canApp) { await Linking.openURL(waApp); } else { await Linking.openURL(waUrl); }
  } catch { try { await Linking.openURL(waUrl); } catch { /* silent */ } }
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS PAGE BANNER — full control system
// ─────────────────────────────────────────────────────────────────────────────
const OfferBannerItem = memo(({ banner, router }: { banner: Banner; router: any }) => {
  const pressHandler = getBannerPressHandler(banner, router);
  const h = CARD_SIZE_HEIGHT[banner.card_size] ?? CARD_SIZE_HEIGHT.medium;

  const inner = (
    <View style={[ob.card, { height: h }]}>
      <Image
        source={{ uri: banner.image_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />

      {/* VIP badge */}
      {banner.is_vip && (
        <View style={ob.vipBadge}>
          <Text style={ob.vipBadgeText}>VIP 👑</Text>
        </View>
      )}

      {/* Gradient + text overlay (optional) */}
      {banner.show_text && (banner.title || banner.subtitle) ? (
        <>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[ob.textBlock, positionStyle(banner.card_position)]}>
            {banner.title ? (
              <Text style={ob.title} numberOfLines={2}>{banner.title}</Text>
            ) : null}
            {banner.subtitle ? (
              <Text style={ob.subtitle} numberOfLines={1}>{banner.subtitle}</Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Click indicator */}
      {banner.is_clickable && banner.link_type !== 'none' ? (
        <View style={ob.clickBadge}>
          <MaterialIcons name="open-in-new" size={12} color="#fff" />
        </View>
      ) : null}
    </View>
  );

  if (pressHandler) {
    return (
      <Pressable
        onPress={pressHandler}
        style={({ pressed }) => [ob.wrap, { opacity: pressed ? 0.9 : 1 }]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={ob.wrap}>{inner}</View>;
});

function positionStyle(pos: string): any {
  if (pos === 'top') return { top: 12 };
  if (pos === 'middle') return { top: '40%' };
  return { bottom: 14 };
}

const ob = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, marginBottom: 14 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A2E', position: 'relative' },
  vipBadge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: '#FDE68A', borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 5, zIndex: 3,
  },
  vipBadgeText: { color: '#1F2937', fontSize: 11, fontWeight: '800' },
  textBlock: {
    position: 'absolute', left: 14, right: 14, zIndex: 2,
    gap: 4,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 24, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '500' },
  clickBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    padding: 5, zIndex: 3,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Grid Offer Item (regular offers from offers table)
// ─────────────────────────────────────────────────────────────────────────────
const GridOfferItem = memo(function GridOfferItem({
  offer, width, height,
}: { offer: Offer; width: number; height: number }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => openWhatsApp(offer.phone, offer.title, offer.store_name)}
      style={[styles.gridItem, { width, height }, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
    >
      <Image
        source={{ uri: offer.image_url || 'https://via.placeholder.com/300x200' }}
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
      <View style={[styles.gridBadge, { alignSelf: 'flex-start' }]}>
        <Text style={styles.gridBadgeText}>لقطة 🔥</Text>
      </View>
      <View style={styles.gridBottom}>
        {offer.store_name ? <Text style={styles.gridStore} numberOfLines={1}>{offer.store_name}</Text> : null}
        {offer.title ? <Text style={styles.gridTitle} numberOfLines={2}>{offer.title}</Text> : null}
        {offer.description ? <Text style={styles.gridDesc} numberOfLines={1}>{offer.description}</Text> : null}
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonGrid() {
  const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
  const heights = [200, 240, 210, 260, 190, 230];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP, paddingHorizontal: H_PAD }}>
      {Array(6).fill(0).map((_, i) => (
        <View key={i} style={[styles.skeletonItem, { width: itemWidth, height: heights[i % heights.length] }]} />
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

  // Banners specifically for offers page
  const [offersBanners, setOffersBanners] = useState<Banner[]>([]);

  // Dynamic categories from offer_categories table
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { trackPageView('offers').catch(() => {}); }, []));

  // ── Load offer page banners ──────────────────────────────────────────────
  const loadBanners = useCallback(async () => {
    const cached = getBannersCache('offers');
    if (cached) { setOffersBanners(cached); return; }
    const { data } = await fetchActiveBanners('offers');
    if (data.length > 0) {
      setBannersCache(data, 'offers');
      setOffersBanners(data);
    }
  }, []);

  // ── Load dynamic categories ──────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    try {
      const { data } = await offerCategoriesService.fetchActive();
      if (data && data.length > 0) {
        const names = data.map((c: any) => isAr ? c.name_ar : c.name).filter(Boolean);
        setDynamicCategories(names);
      }
    } catch { /* use static fallback */ }
  }, [isAr]);

  // ── Fetch offers from Supabase ───────────────────────────────────────────
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
    loadBanners();
    loadCategories();
  }, [fetchOffers, loadBanners, loadCategories]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOffers(false);
    loadBanners();
  }, [fetchOffers, loadBanners]);

  // ── Categories: dynamic + static fallback ───────────────────────────────
  const categories = useMemo(() => {
    const base = ['الكل'];
    if (dynamicCategories.length > 0) {
      return [...base, ...dynamicCategories];
    }
    // fallback: build from offers
    const fromOffers = new Set<string>();
    allOffers.forEach(o => { if (o.category) fromOffers.add(o.category); });
    return [...base, ...Array.from(fromOffers)];
  }, [dynamicCategories, allOffers]);

  // ── Filtered offers ──────────────────────────────────────────────────────
  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return allOffers;
    return allOffers.filter(o => o.category === activeCategory);
  }, [allOffers, activeCategory]);

  // ── Masonry ──────────────────────────────────────────────────────────────
  const masonryData = useMemo(() => {
    const col1: Offer[] = [];
    const col2: Offer[] = [];
    filteredOffers.forEach((item, i) => { if (i % 2 === 0) col1.push(item); else col2.push(item); });
    return { col1, col2 };
  }, [filteredOffers]);

  const getItemHeight = (index: number) => {
    const heights = [200, 240, 210, 260, 190, 230];
    return heights[index % heights.length];
  };

  const renderColumn = (columnData: Offer[], columnIndex: number) => {
    const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
    return (
      <View style={{ flex: 1, gap: COL_GAP }}>
        {columnData.map((offer, idx) => (
          <GridOfferItem
            key={offer.id}
            offer={offer}
            width={itemWidth}
            height={getItemHeight(idx + columnIndex * 100)}
          />
        ))}
      </View>
    );
  };

  // ── Banner groups by position ────────────────────────────────────────────
  const topBanners = useMemo(() => offersBanners.filter(b => b.card_position === 'top'), [offersBanners]);
  const middleBanners = useMemo(() => offersBanners.filter(b => b.card_position === 'middle' || (!b.card_position)), [offersBanners]);
  const bottomBanners = useMemo(() => offersBanners.filter(b => b.card_position === 'bottom'), [offersBanners]);

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#1E293B' : '#FFFFFF';
  const headerBorder = isDark ? '#334155' : '#E2E8F0';
  const headerTitle = isDark ? '#F1F5F9' : '#111827';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerIconBtn}>
          <MaterialIcons name={isAr ? 'chevron-right' : 'chevron-left'} size={28} color={headerTitle} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: headerTitle }]}>
          {isAr ? 'أقوى العروض 🔥' : 'Best Offers 🔥'}
        </Text>
        <Pressable onPress={handleRefresh} hitSlop={12} disabled={refreshing} style={styles.headerIconBtn}>
          {refreshing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <MaterialIcons name="refresh" size={24} color={headerTitle} />}
        </Pressable>
      </View>

      {/* ── Category Filter Bar ── */}
      {categories.length > 1 && (
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
                  style={[styles.chip,
                    isActive
                      ? { backgroundColor: '#FFFFFF', borderColor: '#EF4444', borderWidth: 1.5 }
                      : { backgroundColor: '#F3F4F6', borderColor: 'transparent', borderWidth: 0 },
                  ]}
                >
                  <Text style={[styles.chipText, { color: isActive ? '#EF4444' : '#4B5563' }]}>{cat}</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
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
            {/* TOP banners */}
            {topBanners.map(b => <OfferBannerItem key={b.id} banner={b} router={router} />)}

            {/* MIDDLE banners */}
            {middleBanners.map(b => <OfferBannerItem key={b.id} banner={b} router={router} />)}

            {/* Grid offers */}
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

            {/* BOTTOM banners */}
            {bottomBanners.map(b => <OfferBannerItem key={b.id} banner={b} router={router} />)}
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  filterBar: { borderBottomWidth: 1, paddingVertical: 10 },
  filterScroll: { paddingHorizontal: H_PAD, gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  body: { paddingTop: 16 },
  masonryContainer: { flexDirection: 'row', paddingHorizontal: H_PAD },
  gridItem: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#E5E7EB', position: 'relative' },
  gridBadge: { position: 'absolute', top: 8, backgroundColor: '#FDE68A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginHorizontal: 8, zIndex: 2 },
  gridBadgeText: { color: '#1F2937', fontSize: 10, fontWeight: '800' },
  gridBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 },
  gridStore: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  gridTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  gridDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginTop: 2 },
  skeletonItem: { backgroundColor: '#E5E7EB', borderRadius: 12, opacity: 0.6 },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 52, marginBottom: 4 },
  centerTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  centerSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  showAllBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10 },
  showAllBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
