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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from 'react-native-reanimated';

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
  card_size?: 'large' | 'medium' | 'small'; // قد نهمله بعد الآن
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
const H_PAD = 12;
const COL_GAP = 10;
const DEFAULT_PHONE = '972599234230';
const CAROUSEL_AUTO_INTERVAL = 4000;

// ✅ التصنيفات الجديدة (ثابتة)
const STATIC_CATEGORIES = [
  'الكل',
  'خضروات وفواكه',
  'زينة وهدايا',
  'مستحضرات تجميل',
  'وظائف',
  'رياضة',
  'عقارات',
  'حيوانات',
  'سيارات ومركبات',
  'أثاث',
  'حلويات',
  'عصائر',
  'مطاعم',
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
// Grid Item Component (مع صورة في الأعلى ونصوص في الأسفل)
// ─────────────────────────────────────────────────────────────────────────────

const GridOfferItem = memo(function GridOfferItem({
  offer,
  width,
  height,
  vip = false,
}: {
  offer: Offer;
  width: number;
  height: number;
  vip?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  // نسبة الصورة إلى الارتفاع: 70% للصورة، 30% للنصوص
  const imageHeight = height * 0.7;
  const textHeight = height * 0.3;

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => openWhatsApp(offer.phone, offer.title, offer.store_name)}
      style={[
        styles.gridItem,
        { width, height },
        pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
        vip && styles.vipGridItem,
      ]}
    >
      {/* صورة العرض */}
      <View style={[styles.gridImageWrap, { height: imageHeight }]}>
        <Image
          source={{ uri: offer.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
        {vip && (
          <View style={styles.vipBadge}>
            <MaterialIcons name="stars" size={14} color="#FFD700" />
            <Text style={styles.vipBadgeText}>VIP</Text>
          </View>
        )}
        {offer.category && (
          <View style={[styles.catBadge, vip && styles.catBadgeVip]}>
            <Text style={styles.catBadgeText}>{offer.category}</Text>
          </View>
        )}
        {/* أيقونة واتساب تظهر فوق الصورة */}
        <View style={styles.waIconOverlay}>
          <MaterialIcons name="chat" size={14} color="#fff" />
        </View>
      </View>

      {/* النصوص أسفل الصورة */}
      <View style={[styles.gridTextWrap, { height: textHeight }]}>
        {offer.store_name && (
          <Text style={[styles.gridStore, vip && styles.vipText]} numberOfLines={1}>
            {offer.store_name}
          </Text>
        )}
        {offer.title && (
          <Text style={[styles.gridTitle, vip && styles.vipTitle]} numberOfLines={2}>
            {offer.title}
          </Text>
        )}
        {offer.description && (
          <Text style={styles.gridDesc} numberOfLines={1}>
            {offer.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Carousel Component (VIP offers)
// ─────────────────────────────────────────────────────────────────────────────

const Carousel = memo(function Carousel({ offers, isAr }: { offers: Offer[]; isAr: boolean }) {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const autoTimer = useRef<NodeJS.Timeout | null>(null);
  const isScrolling = useRef(false);

  const CAROUSEL_H = Math.min(280, SCREEN_W * 0.68);

  const startAutoScroll = useCallback(() => {
    if (offers.length <= 1) return;
    if (autoTimer.current) clearInterval(autoTimer.current);
    autoTimer.current = setInterval(() => {
      if (isScrolling.current) return;
      const next = (currentIndex + 1) % offers.length;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    }, CAROUSEL_AUTO_INTERVAL);
  }, [currentIndex, offers.length]);

  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [startAutoScroll]);

  const onScrollBeginDrag = () => { isScrolling.current = true; };
  const onScrollEndDrag = () => { isScrolling.current = false; };
  const onMomentumScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrentIndex(idx);
  };

  if (offers.length === 0) return null;

  const renderItem = ({ item }: { item: Offer }) => (
    <View style={{ width: SCREEN_W, paddingHorizontal: H_PAD, alignItems: 'center' }}>
      <View style={[styles.carouselCard, { height: CAROUSEL_H }]}>
        <Image
          source={{ uri: item.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.3, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.carouselBadge}>
          <MaterialIcons name="stars" size={14} color="#FFD700" />
          <Text style={styles.carouselBadgeText}>VIP</Text>
        </View>
        <View style={styles.carouselBottom}>
          {item.store_name && (
            <Text style={styles.carouselStore} numberOfLines={1}>{item.store_name}</Text>
          )}
          {item.title && (
            <Text style={styles.carouselTitle} numberOfLines={2}>{item.title}</Text>
          )}
          <Pressable
            style={styles.carouselWaBtn}
            onPress={() => openWhatsApp(item.phone, item.title, item.store_name)}
          >
            <MaterialIcons name="chat" size={16} color="#fff" />
            <Text style={styles.carouselWaText}>واتساب</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.carouselWrap}>
      <FlatList
        ref={flatListRef}
        data={offers}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
      />
      {offers.length > 1 && (
        <View style={styles.pagination}>
          {offers.map((_, i) => (
            <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader (محاكاة الشبكة)
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  const ITEMS = 6;
  const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
  const itemHeight = itemWidth * 1.3; // نسبة عرض إلى ارتفاع

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP }}>
      {Array(ITEMS).fill(0).map((_, i) => (
        <View key={i} style={[styles.skeletonItem, { width: itemWidth, height: itemHeight }]} />
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

  // Carousel offers (VIP)
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

      // فصل العروض: أول 3 عروض تكون VIP (كاروسيل) والباقي عادي
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

  // ── Categories: استخدم القائمة الثابتة مع إضافة أي تصنيفات إضافية من البيانات ──
  const categories = useMemo(() => {
    // استخراج التصنيفات الفريدة من العروض
    const fromOffers = new Set<string>();
    allOffers.forEach(o => { if (o.category) fromOffers.add(o.category); });

    // دمج مع القائمة الثابتة (مع إزالة المكررات)
    const combined = new Set(STATIC_CATEGORIES);
    fromOffers.forEach(cat => combined.add(cat));

    // نريد أن يظهر "الكل" في البداية
    const result = Array.from(combined);
    // نقل "الكل" إلى البداية إذا لم يكن بالفعل
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

  // ── Build grid rows (عمودين متساويين) ──────────────────────────────────
  const gridData = useMemo(() => {
    // نأخذ العروض المصفاة ونقسمها إلى أزواج (صفوف)
    const rows = [];
    for (let i = 0; i < filteredOffers.length; i += 2) {
      const row = filteredOffers.slice(i, i + 2);
      rows.push(row);
    }
    return rows;
  }, [filteredOffers]);

  // ── عرض البطاقات في الشبكة ─────────────────────────────────────────────
  const itemWidth = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
  const itemHeight = itemWidth * 1.3;

  const renderRow = ({ item: row }: { item: Offer[] }) => {
    return (
      <View style={[styles.gridRow, { gap: COL_GAP }]}>
        {row.map((offer, idx) => {
          // نجعل أول عنصر في الصف الأول VIP إذا كان أول صف
          const isVip = (row.length === 2 && idx === 0 && filteredOffers[0] === offer);
          return (
            <GridOfferItem
              key={offer.id}
              offer={offer}
              width={itemWidth}
              height={itemHeight}
              vip={isVip}
            />
          );
        })}
        {/* في حالة وجود عنصر واحد في الصف، نضيف عنصرًا فارغًا للحفاظ على التنسيق */}
        {row.length === 1 && (
          <View style={{ width: itemWidth, height: itemHeight }} />
        )}
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#1E293B' : '#FFFFFF';
  const headerBorder = isDark ? '#334155' : '#E2E8F0';
  const headerTitle = isDark ? '#F1F5F9' : '#111827';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name={isAr ? 'chevron-right' : 'chevron-left'} size={28} color={headerTitle} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: headerTitle }]}>
            {isAr ? 'العروض' : 'Offers'}
          </Text>
          {allOffers.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countBadgeText}>{allOffers.length}</Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={handleRefresh}
          hitSlop={12}
          disabled={refreshing}
          style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="refresh" size={22} color={headerTitle} />
          )}
        </Pressable>
      </View>

      {/* Category filter bar - باستخدام FlatList */}
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
                    {
                      backgroundColor: isActive ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                      borderColor: isActive ? colors.primary : (isDark ? '#334155' : '#E2E8F0'),
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: isActive ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B') }]}>
                    {cat}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {/* Body */}
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
            {/* Carousel VIP */}
            {carouselOffers.length > 0 && <Carousel offers={carouselOffers} isAr={isAr} />}

            {/* Grid */}
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
              <FlatList
                data={gridData}
                keyExtractor={(_, index) => `row-${index}`}
                renderItem={renderRow}
                scrollEnabled={false}
                contentContainerStyle={{ gap: COL_GAP }}
              />
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Filter bar
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: H_PAD,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Body
  body: {
    padding: H_PAD,
    paddingTop: 14,
  },

  // Carousel
  carouselWrap: {
    marginBottom: 18,
  },
  carouselCard: {
    width: SCREEN_W - H_PAD * 2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  carouselBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 2,
  },
  carouselBadgeText: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '900',
  },
  carouselBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    alignItems: 'flex-end',
  },
  carouselStore: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  carouselTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  carouselWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37,211,102,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 6,
  },
  carouselWaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  dotActive: {
    backgroundColor: '#0A6E5C',
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    marginBottom: COL_GAP,
  },
  gridItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  vipGridItem: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  gridImageWrap: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  gridTextWrap: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  gridStore: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 16,
  },
  gridDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  vipText: {
    color: '#B45309',
  },
  vipTitle: {
    color: '#1A1A1A',
    fontWeight: '800',
  },

  // Badges
  vipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,215,0,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    zIndex: 2,
  },
  vipBadgeText: {
    color: '#1A1A1A',
    fontSize: 9,
    fontWeight: '800',
  },
  catBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(10,110,92,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 2,
  },
  catBadgeVip: {
    backgroundColor: 'rgba(255,215,0,0.85)',
  },
  catBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  waIconOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(37,211,102,0.85)',
    borderRadius: 12,
    padding: 4,
    zIndex: 2,
  },

  // Skeleton
  skeletonItem: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    opacity: 0.7,
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