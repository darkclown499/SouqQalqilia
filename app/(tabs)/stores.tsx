import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Modal, TextInput, Platform, NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCategories } from '@/hooks/useCategories';
import { useAuth, getSupabaseClient } from '@/template';
import {
  fetchAllActiveStores, fetchAllStoreRatings,
  checkStoreIsOpen, Store,
} from '@/services/storesService';
import { getBannersCache, fetchActiveBanners, Banner } from '@/services/bannersService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

// ── Screen width ──────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const SIDE_PAD = 16;
const STORE_CARD_W = Math.max(1, Math.floor((SCREEN_W - SIDE_PAD * 2 - CARD_GAP) / 2));

// ── Name validator ────────────────────────────────────────────────────────────
function isNameInvalid(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  return /[0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?`~]/.test(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BANNER CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
function BannerCarousel({ banners, isRTL }: { banners: Banner[]; isRTL: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);
  const BANNER_H = Math.round(SCREEN_W * 0.42);

  const startAuto = useCallback(() => {
    if (banners.length <= 1) return;
    autoRef.current = setInterval(() => {
      if (userScrolling.current) return;
      setActiveIdx(prev => {
        const next = (prev + 1) % banners.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
        return next;
      });
    }, 4500);
  }, [banners.length]);

  useEffect(() => {
    startAuto();
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [startAuto]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIdx(Math.max(0, Math.min(idx, banners.length - 1)));
  }, [banners.length]);

  // Placeholder banners when none exist
  const displayBanners = banners.length > 0 ? banners : [
    { id: '__p1', title: 'ادعوا الاصدقاء واربحوا', subtitle: 'خصومات حصرية لكل إحالة', image_url: '', link_url: '' },
    { id: '__p2', title: 'أفضل المتاجر المحلية', subtitle: 'اكتشف متاجر قلقيلية', image_url: '', link_url: '' },
  ] as Banner[];

  return (
    <View style={bc.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { userScrolling.current = true; }}
        onScrollEndDrag={() => { userScrolling.current = false; }}
        onMomentumScrollEnd={handleScroll}
      >
        {displayBanners.map((banner, i) => (
          <View key={banner.id} style={[bc.slide, { width: SCREEN_W, height: BANNER_H }]}>
            {banner.image_url ? (
              <Image
                source={{ uri: banner.image_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
                cachePolicy="disk"
              />
            ) : (
              <LinearGradient
                colors={i % 2 === 0 ? ['#0A6E5C', '#065f46'] : ['#1a4f7a', '#0d2d4a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.52)']}
              style={bc.gradient}
            />
            <View style={[bc.textWrap, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              {banner.title ? (
                <Text style={[bc.title, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                  {banner.title}
                </Text>
              ) : null}
              {banner.subtitle ? (
                <Text style={[bc.sub, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {banner.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={bc.dots}>
        {displayBanners.map((_, i) => (
          <Pressable
            key={i}
            style={[bc.dot, activeIdx === i ? bc.dotActive : bc.dotInactive]}
            onPress={() => {
              setActiveIdx(i);
              scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
            }}
          />
        ))}
      </View>
    </View>
  );
}

const bc = StyleSheet.create({
  wrap: { width: '100%', position: 'relative' },
  slide: { overflow: 'hidden' },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    top: '40%',
  },
  textWrap: {
    position: 'absolute', bottom: 36, left: 16, right: 16, gap: 4,
  },
  title: {
    fontSize: 18, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 24,
  },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  dots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 10, gap: 6, position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  dot: { height: 6, borderRadius: 3, transitionDuration: '200ms' } as any,
  dotActive: { width: 18, backgroundColor: '#fff' },
  dotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.45)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. QUICK CATEGORY CARD
// ─────────────────────────────────────────────────────────────────────────────
function QuickCatCard({
  cat, isAr, onPress,
}: { cat: any; isAr: boolean; onPress: () => void }) {
  const bgColor = cat.color || '#0A6E5C';

  return (
    <Pressable
      style={({ pressed }) => [qc.card, { opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
    >
      <View style={[qc.iconBg, { backgroundColor: bgColor + '18' }]}>
        <MaterialIcons name={cat.icon as any} size={26} color={bgColor} />
      </View>
      <Text style={qc.label} numberOfLines={2}>
        {isAr ? (cat.name_ar || cat.name) : cat.name}
      </Text>
    </Pressable>
  );
}

const qc = StyleSheet.create({
  card: {
    width: 76, alignItems: 'center', gap: 7,
    backgroundColor: '#fff',
    borderRadius: 16, padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    marginRight: 10,
  },
  iconBg: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 11, fontWeight: '700', textAlign: 'center',
    color: '#1a1a2e', lineHeight: 14,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PREMIUM STORE CARD (Talabat-style)
// ─────────────────────────────────────────────────────────────────────────────
function PremiumStoreCard({
  store, rating, isAr, isRTL, colors, onPress,
}: {
  store: Store; rating: { avg: number; count: number };
  isAr: boolean; isRTL: boolean; colors: any; onPress: () => void;
}) {
  const [isOpen, setIsOpen] = useState(() => checkStoreIsOpen(store));
  const name = isAr ? ((store as any).name_ar || store.name) : store.name;

  useEffect(() => {
    const t = setInterval(() => setIsOpen(checkStoreIsOpen(store)), 60_000);
    return () => clearInterval(t);
  }, [store]);

  return (
    <Pressable
      style={({ pressed }) => [psc.card, { opacity: pressed ? 0.93 : 1 }]}
      onPress={onPress}
    >
      {/* Top colored strip / banner */}
      <View style={psc.bannerStrip}>
        {(store as any).banner_url ? (
          <Image
            source={{ uri: (store as any).banner_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: (store as any).category_color || '#0A6E5C' }]} />
        )}
        {/* Dim overlay for closed */}
        {!isOpen ? (
          <View style={psc.closedOverlay} />
        ) : null}
      </View>

      {/* Circular Logo centered overlapping the strip */}
      <View style={psc.logoWrap}>
        <View style={[psc.logoCircle, { borderColor: isOpen ? '#22c55e' : '#d1d5db' }]}>
          {(store as any).logo_url ? (
            <Image
              source={{ uri: (store as any).logo_url }}
              style={psc.logoImg}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
            />
          ) : (
            <MaterialIcons name="storefront" size={26} color="#0A6E5C" />
          )}
        </View>
      </View>

      {/* Store Name */}
      <Text style={psc.name} numberOfLines={1}>{name}</Text>

      {/* Address */}
      {store.address ? (
        <Text style={psc.address} numberOfLines={1}>{store.address}</Text>
      ) : null}

      {/* Divider */}
      <View style={psc.divider} />

      {/* Rating + Status row */}
      <View style={[psc.bottomRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {rating.avg > 0 ? (
          <View style={[psc.ratingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={psc.star}>⭐</Text>
            <Text style={psc.ratingNum}>{rating.avg.toFixed(1)}</Text>
          </View>
        ) : (
          <Text style={psc.newText}>جديد ✦</Text>
        )}
        <View style={[psc.statusPill, { backgroundColor: isOpen ? '#DCFCE7' : '#F3F4F6' }]}>
          <View style={[psc.statusDot, { backgroundColor: isOpen ? '#16a34a' : '#9ca3af' }]} />
          <Text style={[psc.statusText, { color: isOpen ? '#15803d' : '#6b7280' }]}>
            {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const psc = StyleSheet.create({
  card: {
    width: STORE_CARD_W,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  bannerStrip: { height: 72, position: 'relative' },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  logoWrap: { alignItems: 'center', marginTop: -26, marginBottom: 8 },
  logoCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2.5, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  logoImg: { width: 52, height: 52 },
  name: {
    fontSize: 13, fontWeight: '800', color: '#111827',
    textAlign: 'center', paddingHorizontal: 8, lineHeight: 18,
  },
  address: {
    fontSize: 11, color: '#9ca3af', textAlign: 'center',
    paddingHorizontal: 8, marginTop: 3, lineHeight: 15,
  },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12, marginTop: 10 },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 9,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { fontSize: 11 },
  ratingNum: { fontSize: 12, fontWeight: '800', color: '#111827' },
  newText: { fontSize: 11, fontWeight: '700', color: '#0A6E5C' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: '800' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CATEGORY BLOCK (grouped stores section)
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBlock({
  catName, catEmoji, stores, ratings, isAr, isRTL, colors,
  onViewAll, onStorePress,
}: {
  catName: string; catEmoji?: string;
  stores: Store[]; ratings: Record<string, { avg: number; count: number }>;
  isAr: boolean; isRTL: boolean; colors: any;
  onViewAll: () => void; onStorePress: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_ROWS = 2; // 2 rows × 2 cols = 4 stores
  const INITIAL_COUNT = INITIAL_ROWS * 2;
  const displayStores = expanded ? stores : stores.slice(0, INITIAL_COUNT);
  const hasMore = stores.length > INITIAL_COUNT;

  return (
    <View style={cb.block}>
      {/* Block header */}
      <View style={[cb.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[cb.title, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
          {catName}{catEmoji ? ` ${catEmoji}` : ''}
        </Text>
        <Pressable
          style={[cb.viewAllBtn, { backgroundColor: '#FFF0F0', borderColor: '#FFCCC9' }]}
          onPress={onViewAll}
        >
          <Text style={cb.viewAllText}>{isAr ? 'عرض الكل' : 'View All'}</Text>
        </Pressable>
      </View>

      {/* 2-column grid */}
      <View style={cb.grid}>
        {displayStores.map((store, idx) => (
          <PremiumStoreCard
            key={store.id}
            store={store}
            rating={ratings[store.id] ?? { avg: 0, count: 0 }}
            isAr={isAr}
            isRTL={isRTL}
            colors={colors}
            onPress={() => onStorePress(store.id)}
          />
        ))}
        {/* Spacer if odd count to keep grid clean */}
        {displayStores.length % 2 !== 0 ? (
          <View style={{ width: STORE_CARD_W }} />
        ) : null}
      </View>

      {/* Show more / Show less */}
      {hasMore ? (
        <Pressable
          style={[cb.showMoreBtn, { borderColor: colors.borderLight }]}
          onPress={() => setExpanded(v => !v)}
        >
          <MaterialIcons
            name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={colors.primary}
          />
          <Text style={[cb.showMoreText, { color: colors.primary }]}>
            {expanded
              ? (isAr ? 'عرض أقل' : 'Show Less')
              : (isAr ? `اعرض المزيد (${stores.length - INITIAL_COUNT}+)` : `Show More (${stores.length - INITIAL_COUNT}+)`)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const cb = StyleSheet.create({
  block: { marginBottom: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SIDE_PAD, marginBottom: 14, gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  viewAllBtn: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  viewAllText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SIDE_PAD,
    gap: 0, // gap handled via card marginBottom
    columnGap: CARD_GAP,
  },
  showMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginHorizontal: SIDE_PAD, marginTop: 0, marginBottom: 4,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 11, borderStyle: 'dashed',
  },
  showMoreText: { fontSize: 13, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REGISTER CTA BANNER
// ─────────────────────────────────────────────────────────────────────────────
function RegisterStoreCTA({ isAr, isRTL, onPress }: {
  isAr: boolean; isRTL: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [cta.wrap, { opacity: pressed ? 0.9 : 1 }]}
      onPress={onPress}
    >
      <LinearGradient
        colors={['#0A6E5C', '#065f46', '#064e3b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cta.gradient}
      >
        <View style={cta.deco1} />
        <View style={cta.deco2} />
        <View style={[cta.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={cta.iconWrap}>
            <MaterialIcons name="store" size={28} color="#fff" />
          </View>
          <View style={[cta.textCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[cta.title, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}
            </Text>
            <Text style={[cta.sub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'انضم وابدأ البيع عبر التطبيق اليوم' : 'Join and start selling today'}
            </Text>
          </View>
          <MaterialIcons
            name={isRTL ? 'chevron-left' : 'chevron-right'}
            size={20} color="rgba(255,255,255,0.8)"
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const cta = StyleSheet.create({
  wrap: {
    marginHorizontal: SIDE_PAD, marginBottom: 24, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  gradient: { borderRadius: 18, overflow: 'hidden', padding: 16 },
  deco1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)', top: -55, right: -25 },
  deco2: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -18, left: 44 },
  content: { alignItems: 'center', gap: 12 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', flexShrink: 0 },
  textCol: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '800', color: '#fff', lineHeight: 20 },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { categories } = useCategories();
  const { user } = useAuth();

  const [stores, setStores] = useState<Store[]>([]);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerStore, setOwnerStore] = useState<any>(undefined);

  // ── Gatekeeper ──────────────────────────────────────────────────────────────
  const [nameGateVisible, setNameGateVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const isAr = language === 'ar';

  // ── Load everything ─────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      // Name gate check
      if (!user) return;
      getSupabaseClient()
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (isNameInvalid(data?.username ?? '')) {
            setEditName(data?.username ?? '');
            setNameGateVisible(true);
          }
        })
        .catch(() => {});

      // Owner store
      getSupabaseClient()
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()
        .then(({ data }) => setOwnerStore(data ?? null))
        .catch(() => setOwnerStore(null));
    }, [user?.id])
  );

  useEffect(() => {
    const cached = getBannersCache();
    if (cached && cached.length > 0) setBanners(cached);

    Promise.all([
      fetchAllActiveStores(),
      fetchAllStoreRatings(),
      fetchActiveBanners(),
    ]).then(([storesRes, ratingsMap, bannersRes]) => {
      setStores(storesRes.data);
      setRatings(ratingsMap);
      if (bannersRes.data.length > 0) setBanners(bannersRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (isNameInvalid(trimmed)) {
      setNameError(isAr
        ? 'الاسم يجب أن يحتوي على أحرف فقط بدون أرقام أو رموز'
        : 'Name must contain letters only, no digits or symbols');
      return;
    }
    setSavingName(true);
    setNameError('');
    const { error } = await getSupabaseClient()
      .from('user_profiles')
      .update({ username: trimmed })
      .eq('id', user!.id);
    setSavingName(false);
    if (error) {
      setNameError(isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Error saving, try again');
    } else {
      setNameGateVisible(false);
    }
  }, [editName, user, isAr]);

  // ── Group stores by category ────────────────────────────────────────────────
  const groupedStores = useMemo(() => {
    const map = new Map<string, { catId: string; catName: string; stores: Store[] }>();
    const catMap = new Map(categories.map(c => [c.id, c]));
    for (const store of stores) {
      const cat = catMap.get(store.category_id);
      if (!cat) continue;
      const catName = isAr ? (cat.name_ar || cat.name) : cat.name;
      if (!map.has(store.category_id)) {
        map.set(store.category_id, { catId: store.category_id, catName, stores: [] });
      }
      map.get(store.category_id)!.stores.push(store);
    }
    return Array.from(map.values()).filter(g => g.stores.length > 0);
  }, [stores, categories, isAr]);

  // Category emoji map
  const getCatEmoji = (slug?: string) => {
    if (!slug) return '';
    const map: Record<string, string> = {
      food: '🍽️', restaurant: '🍔', pizza: '🍕', sweets: '🍰',
      cafe: '☕', grocery: '🛒', pharmacy: '💊', electronics: '📱',
      fashion: '👗', sports: '⚽', beauty: '💄', furniture: '🪑',
    };
    for (const [key, emoji] of Object.entries(map)) {
      if (slug.includes(key)) return emoji;
    }
    return '';
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── CUSTOM HEADER ── */}
      <View style={[s.header, {
        backgroundColor: colors.primary,
        paddingTop: insets.top + 8,
      }]}>
        {/* Location row */}
        <View style={[s.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Search icon */}
          <Pressable
            style={s.headerIconBtn}
            onPress={() => router.push('/search' as any)}
            hitSlop={8}
          >
            <MaterialIcons name="search" size={22} color="#fff" />
          </Pressable>

          {/* Location center */}
          <Pressable style={[s.locationCenter, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="location-on" size={14} color="rgba(255,255,255,0.8)" />
            <View style={{ gap: 0 }}>
              <Text style={s.locationLabel}>
                {isAr ? 'التوصيل إلى' : 'Delivering to'}
              </Text>
              <Text style={s.locationName}>
                {isAr ? 'قلقيلية 📍' : 'Qalqilya 📍'}
              </Text>
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.75)" />
          </Pressable>

          {/* Hamburger */}
          <Pressable style={s.headerIconBtn} hitSlop={8} onPress={() => {}}>
            <MaterialIcons name="menu" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search bar */}
        <Pressable
          style={[s.searchBar, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
          onPress={() => router.push('/search' as any)}
        >
          <MaterialIcons name="search" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={s.searchBarText}>
            {isAr ? 'ابحث عن متجر أو منتج...' : 'Search for a store or product...'}
          </Text>
        </Pressable>
      </View>

      {/* ── MAIN SCROLL ── */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── 1. BANNER CAROUSEL ── */}
        <BannerCarousel banners={banners} isRTL={isRTL} />

        {/* ── Owner Store Card ── */}
        {ownerStore !== undefined && ownerStore !== null ? (
          <Pressable
            style={[s.ownerCard, {
              backgroundColor: ownerStore.is_approved ? colors.surface : '#FFFBEB',
              borderColor: ownerStore.is_approved ? colors.primary : '#F59E0B',
            }]}
            onPress={() => router.push('/store-dashboard' as any)}
          >
            <View style={[s.ownerIconWrap, { backgroundColor: ownerStore.is_approved ? colors.primaryGhost : '#FEF3C7' }]}>
              <MaterialIcons name="storefront" size={20} color={ownerStore.is_approved ? colors.primary : '#D97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.ownerName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                {isAr ? ((ownerStore as any).name_ar || ownerStore.name) : ownerStore.name}
              </Text>
              <View style={[s.ownerBadge, {
                backgroundColor: ownerStore.is_approved ? '#D1FAE5' : '#FEF3C7',
                flexDirection: isRTL ? 'row-reverse' : 'row',
              }]}>
                <MaterialIcons
                  name={ownerStore.is_approved ? 'check-circle' : 'access-time'}
                  size={10} color={ownerStore.is_approved ? '#16a34a' : '#D97706'}
                />
                <Text style={[s.ownerBadgeText, { color: ownerStore.is_approved ? '#16a34a' : '#D97706' }]}>
                  {ownerStore.is_approved
                    ? (isAr ? 'متجرك مفعّل ✓' : 'Active ✓')
                    : (isAr ? 'قيد المراجعة ⏳' : 'Under Review ⏳')}
                </Text>
              </View>
            </View>
            <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        {/* ── Register CTA (no store yet) ── */}
        {ownerStore === null && user ? (
          <View style={{ marginTop: 16 }}>
            <RegisterStoreCTA
              isAr={isAr} isRTL={isRTL}
              onPress={() => router.push('/register-store' as any)}
            />
          </View>
        ) : null}

        {/* ── 2. QUICK CATEGORIES ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {isAr ? 'شو جاي عبالك اليوم؟ 🤔' : "What are you craving? 🤔"}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.catScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          >
            {categories.map(cat => (
              <QuickCatCard
                key={cat.id}
                cat={cat}
                isAr={isAr}
                onPress={() => {
                  // Scroll to that category's block or filter
                }}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── 3. LOADING ── */}
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>
              {isAr ? 'جارٍ تحميل المتاجر...' : 'Loading stores...'}
            </Text>
          </View>
        ) : groupedStores.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="store" size={44} color={colors.textMuted} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {isAr ? 'لا توجد متاجر بعد' : 'No Stores Yet'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>
              {isAr ? 'ترقبوا إضافة متاجر قريباً' : 'Stores are coming soon'}
            </Text>
          </View>
        ) : (
          /* ── 4. GROUPED STORE SECTIONS ── */
          <>
            {groupedStores.map(group => {
              const cat = categories.find(c => c.id === group.catId);
              return (
                <CategoryBlock
                  key={group.catId}
                  catName={group.catName}
                  catEmoji={getCatEmoji(cat?.slug)}
                  stores={group.stores}
                  ratings={ratings}
                  isAr={isAr}
                  isRTL={isRTL}
                  colors={colors}
                  onViewAll={() => {}}
                  onStorePress={(id) => router.push(`/store/${id}` as any)}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ── NAME GATEKEEPER MODAL ── */}
      <Modal visible={nameGateVisible} animationType="fade" transparent onRequestClose={() => {}}>
        <View style={g.overlay}>
          <View style={[g.card, { backgroundColor: colors.surface }]}>
            <View style={[g.iconWrap, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="person" size={36} color={colors.primary} />
            </View>
            <Text style={[g.title, { color: colors.textPrimary }]}>
              {isAr ? 'أكمل ملفك الشخصي' : 'Complete Your Profile'}
            </Text>
            <Text style={[g.subtitle, { color: colors.textSecondary }]}>
              {isAr
                ? 'يرجى كتابة اسمك الحقيقي (بدون أرقام) للمتابعة'
                : 'Please enter your real name (no digits) to continue'}
            </Text>
            <TextInput
              style={[g.input, {
                borderColor: nameError ? colors.error : colors.border,
                color: colors.textPrimary,
                backgroundColor: colors.background,
                textAlign: isRTL ? 'right' : 'left',
              }]}
              placeholder={isAr ? 'اكتب اسمك الحقيقي' : 'Enter your real name'}
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={t => { setEditName(t); setNameError(''); }}
              autoFocus
              maxLength={40}
            />
            {nameError ? (
              <Text style={[g.errorText, { color: colors.error }]}>{nameError}</Text>
            ) : null}
            <Pressable
              style={[g.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]}
              onPress={handleSaveName}
              disabled={savingName}
            >
              {savingName
                ? <ActivityIndicator color="#fff" size="small" />
                : <><MaterialIcons name="check" size={18} color="#fff" /><Text style={g.saveBtnText}>{isAr ? 'حفظ الاسم' : 'Save Name'}</Text></>
              }
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: SIDE_PAD,
    paddingBottom: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  locationCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingHorizontal: 12,
  },
  locationLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.65)',
    fontWeight: '500', textAlign: 'center',
  },
  locationName: {
    fontSize: 14, color: '#fff', fontWeight: '800', textAlign: 'center',
  },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchBarText: {
    fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: '500', flex: 1,
  },

  // Owner card
  ownerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, padding: 12,
    marginHorizontal: SIDE_PAD, marginTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  ownerIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ownerName: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700' },

  // Quick categories section
  section: { paddingTop: 22, paddingBottom: 6 },
  sectionTitle: {
    fontSize: 17, fontWeight: '800', lineHeight: 22,
    paddingHorizontal: SIDE_PAD, marginBottom: 14,
  },
  catScroll: {
    paddingHorizontal: SIDE_PAD, paddingBottom: 4, gap: 0,
  },

  // Loading / empty
  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: FontSize.sm, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: SIDE_PAD },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});

// Gatekeeper modal styles
const g = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', borderRadius: 24,
    padding: 24, gap: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 20,
  },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 21 },
  input: {
    width: '100%', height: 50, borderWidth: 1.5,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    fontSize: FontSize.md, marginTop: 4,
  },
  errorText: { fontSize: FontSize.xs, fontWeight: '600', alignSelf: 'flex-start' },
  saveBtn: {
    width: '100%', height: 50, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 4,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
