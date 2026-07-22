import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions, FlatList,
  ActivityIndicator, Modal, TextInput, Platform, NativeScrollEvent,
  NativeSyntheticEvent, Linking, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import {
  fetchAllActiveStores,
  checkStoreIsOpen,
  Store,
} from '@/services/storesService';
import {
  fetchStoreCategories,
  StoreCategory,
} from '@/services/storeCategoriesService';
import { Banner, fetchActiveBanners } from '@/services/bannersService';
import NetInfo from '@react-native-community/netinfo';
import { trackPageView } from '@/services/analyticsService';

// ── Utility: Shuffle array (Fisher-Yates) ──────────────────────────────────
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ── Screen width ──────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');

// ── Module-level fallback category ────────────────────────────────────────────
const FALLBACK_CAT: StoreCategory = {
  id: '__others__', name: 'Others', name_ar: 'أخرى', icon: 'store',
  color: '#6B7280', image_url: '', slug: 'others',
  position: 9999, is_active: true, created_at: '',
};

// ── Name validator ────────────────────────────────────────────────────────────
function isNameInvalid(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  return /[0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?`~]/.test(name);
}

// ── 3D Icon URL Map ──────────────────────────────────────────────────────────
const ICON_URL_MAP = new Map<string, string>([
  ['الكل', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Star/3D/star_3d.png'],
  ['العروض', 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif'],
  ['زينة وهدايا', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Party%20popper/3D/party_popper_3d.png'],
  ['ألعاب وترفيه', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Video%20game/3D/video_game_3d.png'],
  ['مأكولات وحلويات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hamburger/3D/hamburger_3d.png'],
  ['إلكترونيات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Mobile%20phone/3D/mobile_phone_3d.png'],
  ['سوبرماركت', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shopping%20cart/3D/shopping_cart_3d.png'],
  ['صيدليات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Pill/3D/pill_3d.png'],
  ['حيوانات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Dog%20face/3D/dog_face_3d.png'],
  ['سيارات ومركبات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Automobile/3D/automobile_3d.png'],
  ['وظائف', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Briefcase/3D/briefcase_3d.png'],
  ['موضة', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/T-shirt/3D/t-shirt_3d.png'],
  ['أثاث', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Couch%20and%20lamp/3D/couch_and_lamp_3d.png'],
  ['رياضة', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Soccer%20ball/3D/soccer_ball_3d.png'],
  ['عقارات', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/House/3D/house_3d.png'],
  ['خضروات وفواكه', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Apple/3D/apple_3d.png'],
  ['مستحضرات تجميل', 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Lipstick/3D/lipstick_3d.png'],
]);

const DEFAULT_ICON_URL = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Convenience%20store/3D/convenience_store_3d.png';

const get3DIconUrl = (name: string): string => {
  return ICON_URL_MAP.get(name) ?? DEFAULT_ICON_URL;
};

// ── Fallback banners (تظهر عند عدم وجود بيانات من السيرفر) ──────────────
const FALLBACK_BANNERS_STORES: Banner[] = [
  {
    id: 'fb-store-1',
    image_url: 'https://picsum.photos/seed/store1/800/200',
    title: 'مرحباً في المتاجر',
    subtitle: 'اكتشف أفضل المتاجر',
    link_url: '/search',
    type: 'internal',
    size: 'large',
    position: 'top',
    showText: true,
    isVip: false,
  },
  {
    id: 'fb-store-2',
    image_url: 'https://picsum.photos/seed/store2/800/200',
    title: 'عروض المتاجر',
    subtitle: 'تسوق واستفد من العروض',
    link_url: '/offers',
    type: 'internal',
    size: 'large',
    position: 'middle',
    showText: true,
    isVip: true,
  },
];

// ── Banner placeholder fallback (لحالة عدم وجود صورة) ──────────────────────
const BANNER_FALLBACK = 'https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=800&q=80';

// ── Function to fetch store ratings map ─────────────────────────────────────
async function fetchStoreRatingsMap(): Promise<Record<string, { avg: number; count: number }>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('store_ratings')
      .select('store_id, rating');
    if (error) return {};
    const map: Record<string, { total: number; count: number }> = {};
    for (const row of data || []) {
      if (!map[row.store_id]) map[row.store_id] = { total: 0, count: 0 };
      map[row.store_id].total += row.rating;
      map[row.store_id].count += 1;
    }
    const result: Record<string, { avg: number; count: number }> = {};
    for (const [id, stats] of Object.entries(map)) {
      result[id] = { avg: stats.total / stats.count, count: stats.count };
    }
    return result;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BANNER CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
const BannerCarousel = React.memo(({ banners, isRTL }: { banners: Banner[]; isRTL: boolean }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);
  const BANNER_H = Math.round(SCREEN_W * 0.68);
  const displayBanners = banners || [];

  useEffect(() => {
    if (displayBanners.length <= 1) return;

    const startAuto = () => {
      if (autoRef.current) clearInterval(autoRef.current);
      autoRef.current = setInterval(() => {
        if (userScrolling.current) return;
        setActiveIdx(prev => {
          const next = (prev + 1) % displayBanners.length;
          scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
          return next;
        });
      }, 4500);
    };
    startAuto();

    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [displayBanners.length]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIdx(Math.max(0, Math.min(idx, displayBanners.length - 1)));
  }, [displayBanners.length]);

  return (
    <View style={[bc.wrap, { height: BANNER_H }]}>
      <ScrollView
        horizontal
        pagingEnabled
        ref={scrollRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={() => { userScrolling.current = true; }}
        onScrollEndDrag={() => { userScrolling.current = false; }}
        onMomentumScrollEnd={handleScroll}
      >
        {displayBanners.map((banner, i) => (
          <View key={banner.id || i} style={{ width: SCREEN_W, height: BANNER_H }}>
            <View style={bc.slide}>
              <Image
                source={{ uri: banner.image_url || BANNER_FALLBACK }}
                cachePolicy="disk"
                contentFit="cover"
                style={StyleSheet.absoluteFill}
                transition={300}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={bc.paginationWrap}>
        {displayBanners.map((_, i) => (
          <View key={i} style={[bc.dot, activeIdx === i && bc.activeDot]} />
        ))}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. QUICK STORE CATEGORY CARD
// ─────────────────────────────────────────────────────────────────────────────
const QuickStoreCatCard = React.memo(({ cat, isAr, isSelected, onPress }: any) => {
  const nameAr = cat.name_ar || cat.name;
  const targetImageUrl = cat.image_url || get3DIconUrl(nameAr);
  const activeColor = cat.color || '#B91C1C';

  return (
    <Pressable style={qc.card} onPress={onPress}>
      <View style={[
        qc.iconBg,
        isSelected && { borderColor: activeColor }
      ]}>
        {isSelected && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: activeColor, opacity: 0.12, borderRadius: 14 }]} />
        )}
        <Image
          source={{ uri: targetImageUrl }}
          style={{ width: 48, height: 48 }}
          contentFit="contain"
          transition={100}
        />
      </View>
      <Text style={[qc.label, isSelected && { color: activeColor }]} numberOfLines={2}>
        {isAr ? nameAr : cat.name}
      </Text>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VIP STORE CARD (تم تعديلها لعرض الوجو فقط)
// ─────────────────────────────────────────────────────────────────────────────
const VIPStoreCard = React.memo(({ store, rating, isAr, onPress }: any) => {
  const isOpen = checkStoreIsOpen(store);
  const name = isAr ? (store.name_ar || store.name) : store.name;

  return (
    <Pressable 
      style={({ pressed }) => [vip.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]} 
      onPress={onPress}
    >
      <LinearGradient
        colors={['#FFD700', '#F59E0B', '#D97706']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={vip.goldBorder}
      >
        <View style={vip.inner}>
          {/* ✅ استخدام الوجو كصورة خلفية بدلاً من البنر */}
          <Image 
            source={{ uri: store.logo_url }} 
            style={StyleSheet.absoluteFill} 
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          
          <View style={vip.vipBadge}>
            <MaterialIcons name="stars" size={12} color="#FFD700" />
            <Text style={vip.vipBadgeText}>VIP</Text>
          </View>

          <View style={vip.content}>
            {/* ✅ إزالة الوجو الصغير الدائري لتجنب التكرار (أو يمكن تركه حسب الرغبة) */}
            <Text style={vip.name} numberOfLines={1}>{name}</Text>
            <Text style={vip.address} numberOfLines={1}>{store.address || (isAr ? 'قلقيلية' : 'Qalqilya')}</Text>
            
            <View style={vip.bottomRow}>
              <View style={vip.statusBadge}>
                <View style={[vip.statusDot, { backgroundColor: isOpen ? '#22C55E' : '#EF4444' }]} />
                <Text style={[vip.statusText, { color: isOpen ? '#22C55E' : '#EF4444' }]}>
                  {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
                </Text>
              </View>
              {rating?.avg > 0 && (
                <View style={vip.ratingWrap}>
                  <MaterialIcons name="star" size={14} color="#FFD700" />
                  <Text style={vip.ratingText}>{rating.avg.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
});

// ── VIP Stores Strip ────────────────────────────────────────────────────────
const VIPStoresStrip = React.memo(({ stores, ratings, isAr, isRTL, onStorePress }: any) => {
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const CARD_WIDTH = Math.min(214, SCREEN_W * 0.55);

  const repeatedStores = useMemo(() => {
    if (stores.length === 0) return [];
    if (stores.length < 3) {
      return [...stores, ...stores, ...stores];
    }
    return stores;
  }, [stores]);

  useEffect(() => {
    if (repeatedStores.length === 0) return;

    const startAutoScroll = () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = setInterval(() => {
        if (repeatedStores.length === 0) return;

        let nextOffset = scrollX.current + CARD_WIDTH + 14;
        const maxOffset = (repeatedStores.length - 1) * (CARD_WIDTH + 14);

        if (nextOffset > maxOffset) {
          nextOffset = 0;
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }

        scrollX.current = nextOffset;
        flatListRef.current?.scrollToOffset({
          offset: nextOffset,
          animated: true,
        });
      }, 2000);
    };

    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [repeatedStores, CARD_WIDTH]);

  const handleScroll = useCallback((event: any) => {
    scrollX.current = event.nativeEvent.contentOffset.x;
  }, []);

  if (stores.length === 0) return null;

  return (
    <View style={vip.stripWrap}>
      <View style={[vip.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <LinearGradient colors={['#FFD700', '#F59E0B']} style={vip.headerAccent} />
        <Text style={vip.headerTitle}>
          {isAr ? '🏆 مقترحات من سوق قلقيلية' : '🏆 Souq Qalqilya Picks'}
        </Text>
        <View style={vip.headerLine} />
      </View>

      <FlatList
        ref={flatListRef}
        horizontal
        data={repeatedStores}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <VIPStoreCard
            store={item}
            rating={ratings[item.id] ?? { avg: 0 }}
            isAr={isAr}
            onPress={() => onStorePress(item.id)}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[vip.scrollContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        snapToInterval={CARD_WIDTH + 14}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
    </View>
  );
});

// ── VIP Styles ──────────────────────────────────────────────────────────────
const vip = StyleSheet.create({
  stripWrap: { marginBottom: 32, marginTop: 4 },
  headerRow: { alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  headerAccent: { width: 4, height: 24, borderRadius: 2 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.3 },
  headerLine: { flex: 1, height: 1, backgroundColor: '#F3F4F6', marginLeft: 8 },
  scrollContent: { paddingHorizontal: 16, gap: 14 },
  card: { width: 200, height: 240, borderRadius: 18, overflow: 'hidden', marginHorizontal: 2 },
  goldBorder: { flex: 1, padding: 2, borderRadius: 18 },
  inner: { flex: 1, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  vipBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12,
    zIndex: 5,
  },
  vipBadgeText: { color: '#FFD700', fontSize: 10, fontWeight: '800' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, zIndex: 2 },
  logoWrap: {
    width: 85,
    height: 85,
    borderRadius: 42.5,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  name: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  address: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', marginTop: 2 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  ratingWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  ratingText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STORE VERTICAL CARD (تم تعديلها لعرض الوجو فقط)
// ─────────────────────────────────────────────────────────────────────────────
const StoreVerticalCard = React.memo(({ store, rating, isAr, onPress }: any) => {
  const isOpen = checkStoreIsOpen(store);
  const name = isAr ? (store.name_ar || store.name) : store.name;
  const address = store.address || (isAr ? 'قلقيلية' : 'Qalqilya');

  return (
    <Pressable
      style={({ pressed }) => [svcStyles.card, { opacity: pressed ? 0.9 : 1 }]}
      onPress={onPress}
    >
      <View style={svcStyles.imageWrap}>
        {/* ✅ استخدام الوجو فقط، إزالة البنر */}
        {store.logo_url ? (
          <Image
            source={{ uri: store.logo_url }}
            style={svcStyles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={svcStyles.imagePlaceholder}>
            <MaterialIcons name="storefront" size={32} color="#D1D5DB" />
          </View>
        )}
        {store.is_featured && (
          <View style={svcStyles.vipBadge}>
            <MaterialIcons name="stars" size={10} color="#FFD700" />
            <Text style={svcStyles.vipBadgeText}>VIP</Text>
          </View>
        )}
      </View>

      <View style={svcStyles.infoWrap}>
        <View style={svcStyles.headerRow}>
          <Text style={svcStyles.name} numberOfLines={1}>{name}</Text>
          <View style={[svcStyles.statusBadge, { backgroundColor: isOpen ? '#DCFCE7' : '#FEE2E2' }]}>
            <View style={[svcStyles.statusDot, { backgroundColor: isOpen ? '#22C55E' : '#EF4444' }]} />
            <Text style={[svcStyles.statusText, { color: isOpen ? '#16A34A' : '#DC2626' }]}>
              {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
            </Text>
          </View>
        </View>

        <Text style={svcStyles.address} numberOfLines={1}>
          <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
          {address}
        </Text>

        <View style={svcStyles.footerRow}>
          <View style={svcStyles.ratingWrap}>
            <MaterialIcons name="star" size={14} color="#F59E0B" />
            <Text style={svcStyles.ratingText}>{rating?.avg?.toFixed(1) ?? '0.0'}</Text>
            <Text style={svcStyles.ratingCount}>({rating?.count ?? 0})</Text>
          </View>
          <Text style={svcStyles.hours}>
            <MaterialIcons name="access-time" size={12} color="#9CA3AF" />
            {store.opening_time} - {store.closing_time}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const svcStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: 'center',
  },
  imageWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    marginRight: 12,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  vipBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vipBadgeText: {
    color: '#FFD700',
    fontSize: 8,
    fontWeight: '800',
  },
  infoWrap: { flex: 1, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  address: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  ratingWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  ratingCount: { fontSize: 11, color: '#9CA3AF' },
  hours: { fontSize: 11, color: '#9CA3AF' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CATEGORY BLOCK
// ─────────────────────────────────────────────────────────────────────────────
const CategoryBlock = React.memo(({ cat, stores, ratings, isAr, isRTL, onStorePress, colors }: any) => {
  const catName = isAr ? (cat.name_ar || cat.name) : cat.name;
  const [showAll, setShowAll] = useState(false);
  const hasMore = stores.length > 4;
  const router = useRouter();

  const displayStores = useMemo(() => {
    return showAll ? stores : stores.slice(0, 4);
  }, [stores, showAll]);

  const handleViewAll = useCallback(() => {
    const slug = cat.slug || cat.id;
    router.push(`/category/${slug}?type=store` as any);
  }, [cat, router]);

  const renderItem = useCallback(({ item }: any) => (
    <StoreVerticalCard
      store={item}
      rating={ratings[item.id] ?? { avg: 0, count: 0 }}
      isAr={isAr}
      onPress={() => onStorePress(item.id)}
    />
  ), [ratings, isAr, onStorePress]);

  return (
    <View style={styles.categoryContainer}>
      <View style={[styles.catHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.catTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
          {catName}
        </Text>
        {hasMore && (
          <Pressable onPress={handleViewAll} hitSlop={6}>
            <Text style={[styles.catMoreText, { color: colors.primary }]}>
              {isAr ? 'عرض الكل' : 'View All'}
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={displayStores}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        contentContainerStyle={{ paddingBottom: 4 }}
      />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. REGISTER CTA BANNER
// ─────────────────────────────────────────────────────────────────────────────
function RegisterStoreCTA({ isAr, isRTL, onPress }: {
  isAr: boolean; isRTL: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [ctaStyles.wrap, { opacity: pressed ? 0.9 : 1 }]}
      onPress={onPress}
    >
      <LinearGradient colors={['#B91C1C', '#991B1B', '#7F1D1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ctaStyles.gradient}>
        <View style={ctaStyles.deco1} />
        <View style={ctaStyles.deco2} />
        <View style={[ctaStyles.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={ctaStyles.iconWrap}>
            <MaterialIcons name="storefront" size={26} color="#FFFFFF" />
          </View>
          <View style={[ctaStyles.textCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[ctaStyles.title, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}
            </Text>
            <Text style={[ctaStyles.sub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'انضم وابدأ البيع عبر التطبيق اليوم' : 'Join and start selling today'}
            </Text>
          </View>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color="rgba(255,255,255,0.9)" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const ctaStyles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 20, borderRadius: 16, shadowColor: '#B91C1C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  gradient: { borderRadius: 16, overflow: 'hidden', padding: 16 },
  deco1: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)', top: -40, right: -20 },
  deco2: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -10, left: 30 },
  content: { alignItems: 'center', gap: 12 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function StoresScreen() {
  const [featuredStoreIds, setFeaturedStoreIds] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [stores, setStores] = useState<Store[]>([]);
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([]);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerStore, setOwnerStore] = useState<any>(null);
  const [ownerStoreLoading, setOwnerStoreLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const scrollRef = useRef<any>(null);
  const catScrollRef = useRef<any>(null);

  const [nameGateVisible, setNameGateVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const [isOnline, setIsOnline] = useState(true);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── مراقبة حالة الاتصال ──
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsubscribe;
  }, []);

  // ── Load data function (مع جلب البانرات من السيرفر) ──
  const loadData = useCallback(async (showLoading = true) => {
    if (!isMountedRef.current) return;
    if (showLoading) setLoading(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      // ✅ جلب البانرات من السيرفر مع فولباك
      let fetchedBanners: Banner[] = [];
      try {
        const bannersRes = await fetchActiveBanners('stores', { signal });
        if (!signal.aborted && isMountedRef.current) {
          fetchedBanners = bannersRes.data || [];
        }
      } catch (bannerErr) {
        console.warn('⚠️ فشل جلب بانرات المتاجر:', bannerErr);
      }

      if (!signal.aborted && isMountedRef.current) {
        if (fetchedBanners.length > 0) {
          setBanners(shuffleArray(fetchedBanners));
          console.log('✅ تم تحديث بانرات المتاجر من السيرفر');
        } else {
          setBanners(FALLBACK_BANNERS_STORES);
          console.log('🔄 استخدام فولباك بانرات المتاجر');
        }
      }

      // جلب بقية البيانات
      const [storesRes, ratingsMap, catsRes] = await Promise.all([
        fetchAllActiveStores(),
        fetchStoreRatingsMap(),
        fetchStoreCategories(),
      ]);

      if (signal.aborted || !isMountedRef.current) return;

      const shuffledStores = shuffleArray(storesRes.data);
      if (signal.aborted || !isMountedRef.current) return;
      setStores(shuffledStores);
      setRatings(ratingsMap);
      setStoreCategories(catsRes.data);

      const featuredIds = shuffledStores
        .filter((storeItem: any) => storeItem.is_featured === true)
        .map((storeItem: any) => storeItem.id);
      if (signal.aborted || !isMountedRef.current) return;
      setFeaturedStoreIds(new Set(featuredIds));
    } catch (err) {
      if (signal.aborted || !isMountedRef.current) return;
      console.error('Failed to load stores data:', err);
      setError(isAr ? 'فشل تحميل المتاجر، يرجى المحاولة لاحقاً' : 'Failed to load stores, please try again');
    } finally {
      if (isMountedRef.current && showLoading && !signal.aborted) {
        setLoading(false);
      }
    }
  }, [isAr]);

  // ── useFocusEffect for owner store and analytics ──
  useFocusEffect(
    useCallback(() => {
      // ✅ Track page view - تم تفعيلها
      try {
        trackPageView('stores');
      } catch (error) {
        // تجاهل أخطاء التتبع
        console.warn('⚠️ trackPageView error:', error);
      }

      if (!user) {
        setOwnerStoreLoading(false);
        return;
      }

      setOwnerStoreLoading(true);
      const controller = new AbortController();

      const fetchUserData = async () => {
        try {
          const supabase = getSupabaseClient();

          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', user.id)
            .single();

          if (!controller.signal.aborted) {
            if (profile && isNameInvalid(profile.username ?? '')) {
              setEditName(profile.username ?? '');
              setNameGateVisible(true);
            }
          }

          const { data: store } = await supabase
            .from('stores')
            .select('*')
            .eq('owner_id', user.id)
            .maybeSingle();

          if (!controller.signal.aborted) {
            setOwnerStore(store ?? null);
            setOwnerStoreLoading(false);
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            setOwnerStore(null);
            setOwnerStoreLoading(false);
          }
        }
      };

      fetchUserData();
      return () => controller.abort();
    }, [user])
  );

  // ── إعادة خلط البانرات عند التركيز (اختياري) ──
  useFocusEffect(
    useCallback(() => {
      // نعيد خلط البانرات إذا كانت موجودة من السيرفر أو الفولباك
      if (banners.length > 1) {
        setBanners(prev => shuffleArray(prev));
      }
    }, [banners])
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ── Initial load ──
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // ── Refresh handler ──
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }, [loadData]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (isNameInvalid(trimmed)) {
      setNameError(isAr ? 'الاسم يجب أن يحتوي على أحرف فقط بدون أرقام أو رموز' : 'Name must contain letters only, no digits or symbols');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      const { error } = await getSupabaseClient().from('user_profiles').update({ username: trimmed }).eq('id', user!.id);
      if (error) throw error;
      setNameGateVisible(false);
    } catch (err) {
      setNameError(isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Error saving, try again');
    } finally {
      setSavingName(false);
    }
  }, [editName, user, isAr]);

  // ── Group stores by category ──
  const groupedStores = useMemo(() => {
    const catMap = new Map(storeCategories.map(c => [c.id, c]));
    const map = new Map<string, { cat: StoreCategory; stores: Store[] }>();

    for (const storeItem of stores) {
      const joinedCat = (storeItem as any).store_category as StoreCategory | null | undefined;
      const storeCatId = (storeItem as any).store_category_id as string | null | undefined;
      const cat: StoreCategory = (joinedCat && joinedCat.id) ? joinedCat : (storeCatId ? catMap.get(storeCatId) : undefined) ?? FALLBACK_CAT;

      if (!map.has(cat.id)) map.set(cat.id, { cat, stores: [] });
      map.get(cat.id)!.stores.push(storeItem);
    }
    return Array.from(map.values()).filter(g => g.stores.length > 0).sort((a, b) => a.cat.position - b.cat.position);
  }, [stores, storeCategories]);

  const filteredGroupedStores = useMemo(() => {
    if (!searchQuery.trim()) return groupedStores;
    const q = searchQuery.trim().toLowerCase();
    return groupedStores
      .map(group => ({
        ...group,
        stores: group.stores.filter(storeItem => {
          const name = ((storeItem as any).name || '').toLowerCase();
          const nameAr = ((storeItem as any).name_ar || '').toLowerCase();
          const address = ((storeItem as any).address || '').toLowerCase();
          return name.includes(q) || nameAr.includes(q) || address.includes(q);
        }),
      }))
      .filter(group => group.stores.length > 0);
  }, [groupedStores, searchQuery]);

  const displayedGroups = useMemo(() => {
    if (!selectedCatId) return filteredGroupedStores;
    return filteredGroupedStores.filter(g => g.cat.id === selectedCatId);
  }, [filteredGroupedStores, selectedCatId]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearchVisible(false);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 15 }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          
          {isSearchVisible ? (
            <View style={{ flex: 1, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 }}>
              <TextInput
                autoFocus
                style={{ flex: 1, textAlign: isRTL ? 'right' : 'left', fontSize: 14 }}
                placeholder={isAr ? 'ابحث في المتاجر...' : 'Search stores...'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable onPress={handleClearSearch}>
                <MaterialIcons name="close" size={22} color="#1A1A1A" />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable 
                hitSlop={8} 
                onPress={() => {
                  const msg = 'مرحبا سوق قلقليلية احتاج استفسر عن اكم شغلة في المتاجر';
                  const url = `whatsapp://send?phone=+972559886886&text=${encodeURIComponent(msg)}`;
                  Linking.openURL(url).catch(() => Linking.openURL(`https://wa.me/972559886886?text=${encodeURIComponent(msg)}`));
                }}
              >
                <MaterialCommunityIcons name="whatsapp" size={28} color="#25D366" />
              </Pressable>

              <View style={[styles.locationCenter, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: '#F3F4F6', borderColor: 'transparent', paddingVertical: 6, paddingHorizontal: 16 }]}>
                <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '800' }}>
                  {isAr ? 'استنو المفاجئات 🎁' : 'Wait for Surprises 🎁'}
                </Text>
              </View>
              
              <Pressable hitSlop={8} onPress={() => setIsSearchVisible(true)}>
                <MaterialIcons name="search" size={28} color="#1A1A1A" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={16} color="#92400E" />
          <Text style={styles.offlineText}>
            {isAr ? 'أنت غير متصل، يتم عرض البيانات المخزنة' : 'You are offline, showing cached data'}
          </Text>
        </View>
      )}

      <ScrollView 
        ref={scrollRef} 
        style={{ flex: 1 }} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <BannerCarousel banners={banners} isRTL={isRTL} />

        {ownerStore !== null && !ownerStoreLoading && (
          <Pressable
            style={[styles.ownerCard, {
              backgroundColor: (ownerStore as any).is_approved ? colors.surface : '#F3F4F6',
              borderColor: (ownerStore as any).is_approved ? colors.primary : '#D1D5DB',
            }]}
            onPress={() => router.push('/store-dashboard' as any)}
          >
            <View style={[styles.ownerIconWrap, { backgroundColor: (ownerStore as any).is_approved ? colors.primaryGhost : '#E5E7EB' }]}>
              <MaterialIcons name="storefront" size={20} color={(ownerStore as any).is_approved ? colors.primary : '#4B5563'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ownerName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                {isAr ? ((ownerStore as any).name_ar || ownerStore.name) : ownerStore.name}
              </Text>
              <View style={[styles.ownerBadge, {
                backgroundColor: (ownerStore as any).is_approved ? '#D1FAE5' : '#FEE2E2',
                flexDirection: isRTL ? 'row-reverse' : 'row',
              }]}>
                <MaterialIcons name={(ownerStore as any).is_approved ? 'check-circle' : 'info'} size={12} color={(ownerStore as any).is_approved ? '#16a34a' : '#EF4444'} />
                <Text style={[styles.ownerBadgeText, { color: (ownerStore as any).is_approved ? '#16a34a' : '#EF4444' }]}>
                  {(ownerStore as any).is_approved ? (isAr ? 'متجرك مفعّل ✓' : 'Active ✓') : (isAr ? 'متجرك غير مفعّل' : 'Store Inactive')}
                </Text>
              </View>
            </View>
            <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.primary} />
          </Pressable>
        )}

        {ownerStore === null && user && !ownerStoreLoading && (
          <View style={{ marginTop: 16 }}>
            <RegisterStoreCTA isAr={isAr} isRTL={isRTL} onPress={() => router.push('/register-store' as any)} />
          </View>
        )}

        {storeCategories.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'شو ناقصك اليوم؟ 🤔' : "What are you craving today? 🤔"}
            </Text>
            <ScrollView
              ref={catScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.catScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onContentSizeChange={() => {
                if (isRTL && catScrollRef.current) {
                  catScrollRef.current.scrollToEnd({ animated: false });
                }
              }}
            >
              <Pressable style={qc.card} onPress={() => setSelectedCatId(null)}>
                <View style={[qc.iconBg, selectedCatId === null && { borderColor: '#B91C1C' }]}>
                  {selectedCatId === null && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#B91C1C', opacity: 0.12, borderRadius: 14 }]} />
                  )}
                  <Image source={{ uri: get3DIconUrl('الكل') }} style={{ width: 48, height: 48 }} contentFit="contain" />
                </View>
                <Text style={[qc.label, selectedCatId === null && { color: '#B91C1C' }]} numberOfLines={2}>{isAr ? 'الكل' : 'All'}</Text>
              </Pressable>

              {storeCategories.filter(cat => cat.name_ar !== 'أخرى' && cat.name !== 'Others').map(cat => (
                <QuickStoreCatCard
                  key={cat.id}
                  cat={cat}
                  isAr={isAr}
                  isSelected={selectedCatId === cat.id}
                  onPress={() => setSelectedCatId(cat.id)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── VIP Section ── */}
        <VIPStoresStrip 
          stores={stores.filter(storeItem => featuredStoreIds.has(storeItem.id))} 
          ratings={ratings} 
          isAr={isAr} 
          isRTL={isRTL} 
          onStorePress={(id: string) => router.push(`/store/${id}` as any)} 
        />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>{isAr ? 'جارٍ تحميل المتاجر...' : 'Loading stores...'}</Text>
          </View>
        ) : error ? (
          <View style={[styles.emptyWrap, { paddingTop: 40 }]}>
            <View style={[styles.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="error-outline" size={44} color={colors.error || '#EF4444'} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{isAr ? 'حدث خطأ' : 'Error'}</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>{error}</Text>
            <Pressable style={[styles.clearFilterBtn, { borderColor: colors.primary }]} onPress={handleRefresh}>
              <Text style={[styles.clearFilterText, { color: colors.primary }]}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : displayedGroups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name={searchQuery.trim() ? 'search-off' : 'store'} size={44} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {searchQuery.trim() ? (isAr ? 'لا يوجد نتائج' : 'No Results Found') : (isAr ? 'لا توجد متاجر بعد' : 'No Stores Yet')}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {searchQuery.trim()
                ? (isAr ? 'عذراً، لا يوجد متاجر مطابقة لبحثك' : 'Sorry, no stores match your search')
                : selectedCatId
                  ? (isAr ? 'لا توجد متاجر في هذا التصنيف' : 'No stores in this category')
                  : (isAr ? 'ترقبوا إضافة متاجر قريباً' : 'Stores are coming soon')}
            </Text>
            {(selectedCatId || searchQuery.trim()) && (
              <Pressable style={[styles.clearFilterBtn, { borderColor: colors.primary }]} onPress={() => { setSelectedCatId(null); setSearchQuery(''); }}>
                <Text style={[styles.clearFilterText, { color: colors.primary }]}>{isAr ? 'عرض كل المتاجر' : 'Show all stores'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          displayedGroups.map(group => (
            <CategoryBlock
              key={group.cat.id}
              cat={group.cat}
              stores={group.stores}
              ratings={ratings}
              isAr={isAr}
              isRTL={isRTL}
              colors={colors}
              onStorePress={(id: string) => router.push(`/store/${id}` as any)}
            />
          ))
        )}
      </ScrollView>

      {/* Modal with onRequestClose */}
      <Modal visible={nameGateVisible} animationType="fade" transparent onRequestClose={() => setNameGateVisible(false)}>
        <View style={gStyles.overlay}>
          <View style={[gStyles.card, { backgroundColor: colors.surface }]}>
            <View style={[gStyles.iconWrap, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="person" size={36} color={colors.primary} />
            </View>
            <Text style={[gStyles.title, { color: colors.textPrimary }]}>{isAr ? 'أكمل ملفك الشخصي' : 'Complete Your Profile'}</Text>
            <Text style={[gStyles.subtitle, { color: colors.textSecondary }]}>{isAr ? 'يرجى كتابة اسمك الحقيقي (بدون أرقام) للمتابعة' : 'Please enter your real name (no digits) to continue'}</Text>
            <TextInput
              style={[gStyles.input, { borderColor: nameError ? colors.error : colors.border, color: colors.textPrimary, backgroundColor: colors.background, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={isAr ? 'اكتب اسمك الحقيقي' : 'Enter your real name'}
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={t => { setEditName(t); setNameError(''); }}
              autoFocus
              maxLength={40}
            />
            {nameError ? <Text style={[gStyles.errorText, { color: colors.error }]}>{nameError}</Text> : null}
            <Pressable style={[gStyles.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]} onPress={handleSaveName} disabled={savingName}>
              {savingName
                ? <ActivityIndicator color="#fff" size="small" />
                : <><MaterialIcons name="check" size={18} color="#fff" /><Text style={gStyles.saveBtnText}>{isAr ? 'حفظ الاسم' : 'Save Name'}</Text></>
              }
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLESHEETS
// ─────────────────────────────────────────────────────────────────────────────
const bc = StyleSheet.create({
  wrap: { width: '100%', position: 'relative' },
  slide: { flex: 1, overflow: 'hidden', borderRadius: 0 },
  paginationWrap: { flexDirection: 'row', position: 'absolute', top: 16, alignSelf: 'center', gap: 6, zIndex: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  activeDot: { backgroundColor: '#FFFFFF', width: 8, height: 8, borderRadius: 4, borderColor: 'transparent' },
});

const qc = StyleSheet.create({
  card: { width: 85, alignItems: 'center', marginRight: 12, marginLeft: 4 },
  iconBg: {
    width: 75, height: 75, borderRadius: 16, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', lineHeight: 18 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  ownerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 12, marginHorizontal: 16, marginTop: 16 },
  ownerIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  ownerName: { fontSize: 14, fontWeight: '700' },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700' },
  section: { paddingTop: 22, paddingBottom: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '900', paddingHorizontal: 16, marginBottom: 16 },
  catScroll: { paddingHorizontal: 16, paddingBottom: 4 },
  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: 16 },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  clearFilterBtn: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  clearFilterText: { fontSize: 14, fontWeight: '700' },
  categoryContainer: { paddingHorizontal: 16, marginBottom: 20 },
  catHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  catTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  catMoreText: { fontSize: 13, fontWeight: '700' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  offlineText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});

const gStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 24, padding: 24, gap: 12, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  input: { width: '100%', height: 50, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, fontSize: 14, marginTop: 4 },
  errorText: { fontSize: 12, fontWeight: '600' },
  saveBtn: { width: '100%', height: 50, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});