import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Modal, TextInput, Platform, NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import {
  fetchAllActiveStores, fetchAllStoreRatings,
  checkStoreIsOpen, Store,
} from '@/services/storesService';
import {
  fetchStoreCategories, getStoreCategoryEmoji, getStoreCategoryName,
  StoreCategory,
} from '@/services/storeCategoriesService';
import { getBannersCache, setBannersCache, fetchActiveBanners, Banner } from '@/services/bannersService';
import { FontSize, Radius, Spacing } from '@/constants/theme';

// ── Screen width ──────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const SIDE_PAD = 16;
const STORE_CARD_W = Math.max(1, Math.floor((SCREEN_W - SIDE_PAD * 2 - CARD_GAP) / 2));

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. BANNER CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
function BannerCarousel({ banners, isRTL }: { banners: Banner[]; isRTL: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);
  const BANNER_H = Math.round(SCREEN_W * 0.54);

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

  const displayBanners = banners.length > 0 ? banners : [
    { id: '__p1', title: 'ادعوا الاصدقاء واربحوا', subtitle: 'خصومات حصرية لكل إحالة', image_url: '', link_url: '' },
    { id: '__p2', title: 'أفضل المتاجر المحلية', subtitle: 'اكتشف متاجر قلقيلية', image_url: '', link_url: '' },
  ] as Banner[];

  return (
    <View style={bc.wrap}>
      <ScrollView
        ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onScroll={handleScroll} scrollEventThrottle={16}
        onScrollBeginDrag={() => { userScrolling.current = true; }}
        onScrollEndDrag={() => { userScrolling.current = false; }}
        onMomentumScrollEnd={handleScroll}
      >
        {displayBanners.map((banner, i) => (
          <View key={banner.id} style={{ width: SCREEN_W, height: BANNER_H, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
            <View style={bc.slide}>
              {banner.image_url ? (
                <Image source={{ uri: banner.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} cachePolicy="disk" />
              ) : (
                <LinearGradient colors={i % 2 === 0 ? ['#0A6E5C', '#065f46'] : ['#1a4f7a', '#0d2d4a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
              {/* Pattern Overlay for empty banners to make them less boring */}
              {!banner.image_url && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.05)', opacity: 0.5, transform: [{ scale: 1.5 }, { rotate: '45deg' }] }]} />
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={bc.gradient} />
              <View style={[bc.textWrap, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                {banner.title ? <Text style={[bc.title, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{banner.title}</Text> : null}
                {banner.subtitle ? <Text style={[bc.sub, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{banner.subtitle}</Text> : null}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const bc = StyleSheet.create({
  wrap: { width: '100%', position: 'relative' },
  slide: { flex: 1, overflow: 'hidden', borderRadius: 16 },
  gradient: { ...StyleSheet.absoluteFillObject, top: '40%' },
  textWrap: { position: 'absolute', bottom: 20, left: 16, right: 16, gap: 4 },
  title: { fontSize: 18, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4, lineHeight: 24 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
});


// ─────────────────────────────────────────────────────────────────────────────
// 2. QUICK STORE CATEGORY CARD
// ─────────────────────────────────────────────────────────────────────────────
onst getIconName = (name: string) => {
  switch (name) {
    case 'زينة وهدايا': return 'gift-outline';
    case 'ألعاب وترفيه': return 'gamepad-variant-outline';
    case 'مأكولات وحلويات': return 'food-outline';
    case 'إلكترونيات': return 'cellphone';
    case 'سوبرماركت': return 'cart-outline';
    case 'حيوانات': return 'paw';
    case 'سيارات ومركبات': return 'car-outline';
    case 'وظائف': return 'briefcase-outline';
    case 'موضة': return 'tshirt-crew-outline';
    case 'أثاث': return 'sofa-outline';
    case 'رياضة': return 'soccer';
    case 'عقارات': return 'home-city-outline';
    case 'أخرى': return 'dots-horizontal';
    default: return 'store-outline';
  }
};

  return (
    <Pressable
      style={({ pressed }) => [
        qc.card,
        // ستايل عصري: خلفية شفافة وإطار أنيق عند التحديد
        isSelected 
          ? { backgroundColor: '#0A6E5C', borderColor: '#0A6E5C' } 
          : { backgroundColor: '#F8F9FA', borderColor: '#E9ECEF' },
        { opacity: pressed ? 0.9 : 1 },
      ]}
      onPress={onPress}
    >
      <MaterialCommunityIcons 
        name={getIconName(nameAr) as any} 
        size={24} 
        color={isSelected ? '#FFF' : '#495057'} 
      />
      <Text style={[qc.label, { color: isSelected ? '#FFF' : '#343A40' }]} numberOfLines={1}>
        {isAr ? nameAr : cat.name}
      </Text>
    </Pressable>
  );
}

// 3. تحديث الـ Styles ليتناسب مع الشكل الجديد
const qc = StyleSheet.create({
  card: {
    width: 85, alignItems: 'center', gap: 8,
    borderRadius: 16, padding: 12,
    borderWidth: 1,
    marginRight: 12,
    // ظل خفيف جداً
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  label: {
    fontSize: 12, fontWeight: '700', textAlign: 'center',
  },
});

const qc = StyleSheet.create({
  card: {
    width: 76, alignItems: 'center', gap: 7,
    backgroundColor: '#fff', borderRadius: 16, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
    marginRight: 10, borderWidth: 1.5, borderColor: 'transparent',
  },
  iconBg: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  label: {
    fontSize: 11, fontWeight: '800', textAlign: 'center',
    lineHeight: 14,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PREMIUM STORE CARD (REBUILT)
// ─────────────────────────────────────────────────────────────────────────────
function PremiumStoreCard({
  store, rating, isAr, isRTL, colors, onPress,
}: {
  store: Store; rating: { avg: number; count: number };
  isAr: boolean; isRTL: boolean; colors: any; onPress: () => void;
}) {
  const [isOpen, setIsOpen] = useState(() => checkStoreIsOpen(store));
  const name = isAr ? ((store as any).name_ar || store.name) : store.name;
  const storeColor = ((store as any).store_category?.color || (store as any).store_categories?.color) || '#0A6E5C';
  const isFeatured = store.is_featured;
  const isNew = rating.avg === 0; // نعتبره جديد إذا لم يحصل على تقييم بعد أو يمكن ربطها بـ store.is_new

  useEffect(() => {
    const t = setInterval(() => setIsOpen(checkStoreIsOpen(store)), 60_000);
    return () => clearInterval(t);
  }, [store]);

  return (
    <Pressable
      style={({ pressed }) => [psc.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      onPress={onPress}
    >
      {/* الغلاف والبادجات العائمة */}
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: storeColor }]} />
        )}
        <View style={psc.coverOverlay} />

        {/* Floating Badges */}
        <View style={[psc.badgesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {isNew && (
            <View style={[psc.badge, psc.newBadge]}>
              <Text style={psc.newBadgeText}>{isAr ? 'جديد' : 'New'}</Text>
            </View>
          )}
          {isFeatured && (
            <View style={[psc.badge, psc.vipBadge]}>
              <MaterialIcons name="star" size={10} color="#FFF" />
              <Text style={psc.vipBadgeText}>VIP</Text>
            </View>
          )}
        </View>
      </View>

      {/* لوجو المتجر بإطار ناصع */}
      <View style={psc.logoWrap}>
        <View style={psc.logoCircle}>
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

      <Text style={psc.name} numberOfLines={1}>{name}</Text>
      {store.address ? (
        <Text style={psc.address} numberOfLines={1}>{store.address}</Text>
      ) : null}

      {/* التاجز السفلية المدمجة (Pills) */}
      <View style={[psc.tagsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[psc.statusPill, { backgroundColor: isOpen ? '#ECFDF5' : '#FEF2F2', borderColor: isOpen ? '#D1FAE5' : '#FEE2E2' }]}>
          <View style={[psc.statusDot, { backgroundColor: isOpen ? '#10B981' : '#EF4444' }]} />
          <Text style={[psc.statusText, { color: isOpen ? '#059669' : '#DC2626' }]}>
            {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
          </Text>
        </View>

        {rating.avg > 0 && (
          <View style={[psc.ratingPill, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="star" size={12} color="#F59E0B" />
            <Text style={psc.ratingNum}>{rating.avg.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const psc = StyleSheet.create({
  card: {
    width: STORE_CARD_W, 
    backgroundColor: '#fff', 
    borderRadius: 18,
    overflow: 'hidden', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, 
    shadowRadius: 14, 
    elevation: 4, 
    marginBottom: 16,
  },
  bannerStrip: { height: 90, position: 'relative', backgroundColor: '#F3F4F6' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  
  // Floating Badges
  badgesRow: {
    position: 'absolute', top: 10, left: 10, right: 10,
    justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 2 },
  newBadge: { backgroundColor: '#EF4444' },
  newBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  vipBadge: { backgroundColor: '#F59E0B' },
  vipBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  // Logo with prominent shadow and border
  logoWrap: { 
    alignItems: 'center', marginTop: -32, marginBottom: 8, zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5 
  },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#fff', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  
  name: { fontSize: 15, fontWeight: '900', color: '#111827', textAlign: 'center', paddingHorizontal: 8, lineHeight: 20 },
  address: { fontSize: 11, color: '#6B7280', textAlign: 'center', paddingHorizontal: 8, marginTop: 4, lineHeight: 16 },
  
  // Tags Row
  tagsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 10, paddingVertical: 12,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  
  ratingPill: {
    backgroundColor: '#FFFBEB', borderColor: '#FEF3C7', borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  ratingNum: { fontSize: 11, fontWeight: '800', color: '#B45309' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CATEGORY BLOCK
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBlock({
  cat, stores, ratings, isAr, isRTL, colors, onStorePress,
}: {
  cat: StoreCategory; stores: Store[]; ratings: Record<string, { avg: number; count: number }>;
  isAr: boolean; isRTL: boolean; colors: any;
  onStorePress: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_COUNT = 4;
  const displayStores = expanded ? stores : stores.slice(0, INITIAL_COUNT);
  const hasMore = stores.length > INITIAL_COUNT;
  const catName = isAr ? (cat.name_ar || cat.name) : cat.name;
  const emoji = getStoreCategoryEmoji(cat.slug);

  return (
    <View style={cb.block}>
      <View style={[cb.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[cb.catDot, { backgroundColor: cat.color + '22' }]}>
          {emoji ? (
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
          ) : (
            <MaterialIcons name={cat.icon as any} size={18} color={cat.color} />
          )}
        </View>
        <Text style={[cb.title, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
          {catName}
        </Text>
        <Pressable
          style={cb.viewAllBtn}
          onPress={() => setExpanded(true)}
        >
          <Text style={cb.viewAllText}>{isAr ? 'عرض الكل' : 'View All'}</Text>
        </Pressable>
      </View>

      <View style={cb.grid}>
        {displayStores.map((store) => (
          <PremiumStoreCard
            key={store.id} store={store} rating={ratings[store.id] ?? { avg: 0, count: 0 }}
            isAr={isAr} isRTL={isRTL} colors={colors} onPress={() => onStorePress(store.id)}
          />
        ))}
        {displayStores.length % 2 !== 0 ? <View style={{ width: STORE_CARD_W }} /> : null}
      </View>

      {hasMore ? (
        <Pressable
          style={[cb.showMoreBtn, { borderColor: colors.borderLight }]}
          onPress={() => setExpanded(v => !v)}
        >
          <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={colors.primary} />
          <Text style={[cb.showMoreText, { color: colors.primary }]}>
            {expanded ? (isAr ? 'عرض أقل' : 'Show Less') : (isAr ? `اعرض المزيد (${stores.length - INITIAL_COUNT}+)` : `Show More (${stores.length - INITIAL_COUNT}+)`)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const cb = StyleSheet.create({
  block: { marginBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIDE_PAD, marginBottom: 14, gap: 10 },
  catDot: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 18, fontWeight: '900', lineHeight: 22 },
  
  // تم تعديل زر عرض الكل ليصبح أنيق وهادئ
  viewAllBtn: { backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  viewAllText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: SIDE_PAD, columnGap: CARD_GAP },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: SIDE_PAD, marginTop: 0, marginBottom: 4, borderWidth: 1.5, borderRadius: 14, paddingVertical: 11, borderStyle: 'dashed' },
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
      <LinearGradient colors={['#0A6E5C', '#065f46', '#064e3b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cta.gradient}>
        <View style={cta.deco1} />
        <View style={cta.deco2} />
        <View style={[cta.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={cta.iconWrap}><MaterialIcons name="store" size={28} color="#fff" /></View>
          <View style={[cta.textCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[cta.title, { textAlign: isRTL ? 'right' : 'left' }]}>{isAr ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}</Text>
            <Text style={[cta.sub, { textAlign: isRTL ? 'right' : 'left' }]}>{isAr ? 'انضم وابدأ البيع عبر التطبيق اليوم' : 'Join and start selling today'}</Text>
          </View>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="rgba(255,255,255,0.8)" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const cta = StyleSheet.create({
  wrap: { marginHorizontal: SIDE_PAD, marginBottom: 24, borderRadius: 18, overflow: 'hidden', shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 6 },
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
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [stores, setStores] = useState<Store[]>([]);
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([]);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerStore, setOwnerStore] = useState<any>(undefined);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const storeSearchInputRef = useRef<any>(null);
  const scrollRef = useRef<any>(null);

  const [nameGateVisible, setNameGateVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  useFocusEffect(
    useCallback(() => {
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
    const cached = getBannersCache('stores_directory');
    if (cached && cached.length > 0) setBanners(cached);

    Promise.all([
      fetchAllActiveStores(),
      fetchAllStoreRatings(),
      fetchActiveBanners('stores_directory'),
      fetchStoreCategories(),
    ]).then(([storesRes, ratingsMap, bannersRes, catsRes]) => {
      setStores(storesRes.data);
      setRatings(ratingsMap);
      if (bannersRes.data.length > 0) {
        setBanners(bannersRes.data);
        setBannersCache(bannersRes.data, 'stores_directory');
      }
      setStoreCategories(catsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (isNameInvalid(trimmed)) {
      setNameError(isAr ? 'الاسم يجب أن يحتوي على أحرف فقط بدون أرقام أو رموز' : 'Name must contain letters only, no digits or symbols');
      return;
    }
    setSavingName(true);
    setNameError('');
    const { error } = await getSupabaseClient().from('user_profiles').update({ username: trimmed }).eq('id', user!.id);
    setSavingName(false);
    if (error) setNameError(isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Error saving, try again');
    else setNameGateVisible(false);
  }, [editName, user, isAr]);

  const groupedStores = useMemo(() => {
    const catMap = new Map(storeCategories.map(c => [c.id, c]));
    const map = new Map<string, { cat: StoreCategory; stores: Store[] }>();

    for (const store of stores) {
      const joinedCat = (store as any).store_category as StoreCategory | null | undefined;
      const storeCatId = (store as any).store_category_id as string | null | undefined;
      const cat: StoreCategory = (joinedCat && joinedCat.id) ? joinedCat : (storeCatId ? catMap.get(storeCatId) : undefined) ?? FALLBACK_CAT;

      if (!map.has(cat.id)) map.set(cat.id, { cat, stores: [] });
      map.get(cat.id)!.stores.push(store);
    }
    return Array.from(map.values()).filter(g => g.stores.length > 0).sort((a, b) => a.cat.position - b.cat.position);
  }, [stores, storeCategories]);

  const filteredGroupedStores = useMemo(() => {
    if (!searchQuery.trim()) return groupedStores;
    const q = searchQuery.trim().toLowerCase();
    return groupedStores
      .map(group => ({
        ...group,
        stores: group.stores.filter(store => {
          const name = ((store as any).name || '').toLowerCase();
          const nameAr = ((store as any).name_ar || '').toLowerCase();
          const address = ((store as any).address || '').toLowerCase();
          return name.includes(q) || nameAr.includes(q) || address.includes(q);
        }),
      }))
      .filter(group => group.stores.length > 0);
  }, [groupedStores, searchQuery]);

  const displayedGroups = useMemo(() => {
    if (!selectedCatId) return filteredGroupedStores;
    return filteredGroupedStores.filter(g => g.cat.id === selectedCatId);
  }, [filteredGroupedStores, selectedCatId]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8, paddingBottom: 15 }]}>
        <View style={[s.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={s.headerIconBtn} onPress={() => storeSearchInputRef.current?.focus()} hitSlop={8}>
            <MaterialIcons name="search" size={22} color="#fff" />
          </Pressable>

          <Pressable style={[s.locationCenter, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="location-on" size={14} color="rgba(255,255,255,0.8)" />
            <View>
              <Text style={s.locationLabel}>{isAr ? 'التوصيل إلى' : 'Delivering to'}</Text>
              <Text style={s.locationName}>{isAr ? 'قلقيلية 📍' : 'Qalqilya 📍'}</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.75)" />
          </Pressable>

          <Pressable style={s.headerIconBtn} hitSlop={8} onPress={() => {}}>
            <MaterialIcons name="menu" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <BannerCarousel banners={banners} isRTL={isRTL} />

        <View style={[s.storeSearchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.storeSearchIcon, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="search" size={16} color={colors.primary} />
          </View>
          <TextInput
            ref={storeSearchInputRef}
            style={[s.storeSearchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? 'ابحث عن متجر أو عنوان...' : 'Search stores or address...'}
            placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search" autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><MaterialIcons name="close" size={16} color={colors.textMuted} /></Pressable>
          )}
        </View>

        {ownerStore !== undefined && ownerStore !== null && (
          <Pressable
            style={[s.ownerCard, {
              backgroundColor: ownerStore.is_approved ? colors.surface : '#F3F4F6',
              borderColor: ownerStore.is_approved ? colors.primary : '#D1D5DB',
            }]}
            onPress={() => router.push('/store-dashboard' as any)}
          >
            <View style={[s.ownerIconWrap, { backgroundColor: ownerStore.is_approved ? colors.primaryGhost : '#E5E7EB' }]}>
              <MaterialIcons name="storefront" size={20} color={ownerStore.is_approved ? colors.primary : '#4B5563'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.ownerName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                {isAr ? ((ownerStore as any).name_ar || ownerStore.name) : ownerStore.name}
              </Text>
              
              {/* تم تعديل لون وحالة "المتجر مغلق/قيد المراجعة" ليكون منطقياً (رمادي/أحمر بدلاً من الأخضر) */}
              <View style={[s.ownerBadge, {
                backgroundColor: ownerStore.is_approved ? '#D1FAE5' : '#FEE2E2',
                flexDirection: isRTL ? 'row-reverse' : 'row',
              }]}>
                <MaterialIcons name={ownerStore.is_approved ? 'check-circle' : 'info'} size={12} color={ownerStore.is_approved ? '#16a34a' : '#EF4444'} />
                <Text style={[s.ownerBadgeText, { color: ownerStore.is_approved ? '#16a34a' : '#EF4444' }]}>
                  {ownerStore.is_approved ? (isAr ? 'متجرك مفعّل ✓' : 'Active ✓') : (isAr ? 'متجرك غير مفعّل' : 'Store Inactive')}
                </Text>
              </View>
            </View>
            <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.primary} />
          </Pressable>
        )}

        {ownerStore === null && user && (
          <View style={{ marginTop: 16 }}>
            <RegisterStoreCTA isAr={isAr} isRTL={isRTL} onPress={() => router.push('/register-store' as any)} />
          </View>
        )}

        {storeCategories.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'شو ناقصك اليوم؟ 🛒' : "What do you need today? 🛒"}
            </Text>
            <ScrollView
              ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.catScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onContentSizeChange={() => { if (isRTL && scrollRef.current) scrollRef.current.scrollToEnd({ animated: false }); }}
            >
              <Pressable
                style={[qc.card, selectedCatId === null && { backgroundColor: '#E6F4F1', borderColor: '#0A6E5C', borderWidth: 1.5 }]}
                onPress={() => setSelectedCatId(null)}
              >
                <View style={[qc.iconBg, { backgroundColor: selectedCatId === null ? 'transparent' : '#0A6E5C1A' }]}>
                  <Text style={qc.emoji}>🏪</Text>
                </View>
                <Text style={[qc.label, { color: selectedCatId === null ? '#0A6E5C' : '#1a1a2e' }]}>{isAr ? 'الكل' : 'All'}</Text>
              </Pressable>

              {storeCategories.map(cat => (
                <QuickStoreCatCard key={cat.id} cat={cat} isAr={isAr} isSelected={selectedCatId === cat.id} onPress={() => setSelectedCatId(prev => prev === cat.id ? null : cat.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>{isAr ? 'جارٍ تحميل المتاجر...' : 'Loading stores...'}</Text>
          </View>
        ) : displayedGroups.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name={searchQuery.trim() ? 'search-off' : 'store'} size={44} color={colors.textMuted} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {searchQuery.trim() ? (isAr ? 'لا يوجد نتائج' : 'No Results Found') : (isAr ? 'لا توجد متاجر بعد' : 'No Stores Yet')}
            </Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>
              {searchQuery.trim() ? (isAr ? 'عذراً، لا يوجد متاجر مطابقة لبحثك' : 'Sorry, no stores match your search') : selectedCatId ? (isAr ? 'لا توجد متاجر في هذا التصنيف' : 'No stores in this category') : (isAr ? 'ترقبوا إضافة متاجر قريباً' : 'Stores are coming soon')}
            </Text>
            {(selectedCatId || searchQuery.trim()) && (
              <Pressable style={[s.clearFilterBtn, { borderColor: colors.primary }]} onPress={() => { setSelectedCatId(null); setSearchQuery(''); }}>
                <Text style={[s.clearFilterText, { color: colors.primary }]}>{isAr ? 'عرض كل المتاجر' : 'Show all stores'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {displayedGroups.map(group => (
              <CategoryBlock key={group.cat.id} cat={group.cat} stores={group.stores} ratings={ratings} isAr={isAr} isRTL={isRTL} colors={colors} onStorePress={(id) => router.push(`/store/${id}` as any)} />
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={nameGateVisible} animationType="fade" transparent onRequestClose={() => {}}>
        <View style={g.overlay}>
          <View style={[g.card, { backgroundColor: colors.surface }]}>
            <View style={[g.iconWrap, { backgroundColor: colors.primaryGhost }]}><MaterialIcons name="person" size={36} color={colors.primary} /></View>
            <Text style={[g.title, { color: colors.textPrimary }]}>{isAr ? 'أكمل ملفك الشخصي' : 'Complete Your Profile'}</Text>
            <Text style={[g.subtitle, { color: colors.textSecondary }]}>{isAr ? 'يرجى كتابة اسمك الحقيقي (بدون أرقام) للمتابعة' : 'Please enter your real name (no digits) to continue'}</Text>
            <TextInput style={[g.input, { borderColor: nameError ? colors.error : colors.border, color: colors.textPrimary, backgroundColor: colors.background, textAlign: isRTL ? 'right' : 'left' }]} placeholder={isAr ? 'اكتب اسمك الحقيقي' : 'Enter your real name'} placeholderTextColor={colors.textMuted} value={editName} onChangeText={t => { setEditName(t); setNameError(''); }} autoFocus maxLength={40} />
            {nameError && <Text style={[g.errorText, { color: colors.error }]}>{nameError}</Text>}
            <Pressable style={[g.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]} onPress={handleSaveName} disabled={savingName}>
              {savingName ? <ActivityIndicator color="#fff" size="small" /> : <><MaterialIcons name="check" size={18} color="#fff" /><Text style={g.saveBtnText}>{isAr ? 'حفظ الاسم' : 'Save Name'}</Text></>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SIDE_PAD, paddingBottom: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  locationCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  locationLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '500', textAlign: 'center' },
  locationName: { fontSize: 14, color: '#fff', fontWeight: '800', textAlign: 'center' },
  ownerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 12, marginHorizontal: SIDE_PAD, marginTop: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  ownerIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ownerName: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700' },
  section: { paddingTop: 22, paddingBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '800', lineHeight: 22, paddingHorizontal: SIDE_PAD, marginBottom: 14 },
  catScroll: { paddingHorizontal: SIDE_PAD, paddingBottom: 4 },
  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: FontSize.sm, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: SIDE_PAD },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  clearFilterBtn: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  clearFilterText: { fontSize: FontSize.sm, fontWeight: '700' },
  storeSearchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SIDE_PAD, marginTop: 16, marginBottom: 10, gap: 10, borderRadius: 16, backgroundColor: '#fff', borderWidth: 0, paddingHorizontal: 14, height: 50, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  storeSearchIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  storeSearchInput: { flex: 1, fontSize: 13, fontWeight: '600' },
});

const g = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 24, padding: 24, gap: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 20 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 21 },
  input: { width: '100%', height: 50, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md, marginTop: 4 },
  errorText: { fontSize: FontSize.xs, fontWeight: '600', alignSelf: 'flex-start' },
  saveBtn: { width: '100%', height: 50, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});