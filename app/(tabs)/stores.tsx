import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Modal, TextInput, Platform, NativeScrollEvent,
  NativeSyntheticEvent, Image as RNImage, Linking
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
  fetchAllActiveStores, fetchAllStoreRatings,
  checkStoreIsOpen, Store,
} from '@/services/storesService';
import {
  fetchStoreCategories,
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

// ── Icon name resolver ────────────────────────────────────────────────────────
const get3DIconUrl = (name: string) => {
  const base = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/';
  switch (name) {
    case 'الكل': return base + 'Star/3D/star_3d.png'; // استخدمنا أيقونة النجمة المضمونة
    case 'العروض': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif';
    case 'زينة وهدايا': return base + 'Party%20popper/3D/party_popper_3d.png'; // أيقونة المفرقعات المضمونة
    case 'ألعاب وترفيه': return base + 'Video%20game/3D/video_game_3d.png';
    case 'مأكولات وحلويات': return base + 'Hamburger/3D/hamburger_3d.png';
    case 'إلكترونيات': return base + 'Mobile%20phone/3D/mobile_phone_3d.png';
    case 'سوبرماركت': return base + 'Shopping%20cart/3D/shopping_cart_3d.png';
    case 'صيدليات': return base + 'Pill/3D/pill_3d.png';
    case 'حيوانات': return base + 'Dog%20face/3D/dog_face_3d.png';
    case 'سيارات ومركبات': return base + 'Automobile/3D/automobile_3d.png';
    case 'وظائف': return base + 'Briefcase/3D/briefcase_3d.png';
    case 'موضة': return base + 'T-shirt/3D/t-shirt_3d.png';
    case 'أثاث': return base + 'Couch%20and%20lamp/3D/couch_and_lamp_3d.png';
    case 'رياضة': return base + 'Soccer%20ball/3D/soccer_ball_3d.png';
    case 'عقارات': return base + 'House/3D/house_3d.png';
    default: return base + 'Convenience%20store/3D/convenience_store_3d.png';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. BANNER CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
function BannerCarousel({ banners, isRTL }: { banners: Banner[]; isRTL: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolling = useRef(false);
  const BANNER_H = Math.round(SCREEN_W * 0.68);
  const displayBanners = banners || [];

  const startAuto = useCallback(() => {
    if (displayBanners.length <= 1) return;
    autoRef.current = setInterval(() => {
      if (userScrolling.current) return;
      setActiveIdx(prev => {
        const next = (prev + 1) % displayBanners.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
        return next;
      });
    }, 4500);
  }, [displayBanners.length]);

  useEffect(() => {
    startAuto();
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [startAuto]);

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
              {banner.image_url ? (
                <Image
                  source={{ uri: banner.image_url }}
                  cachePolicy="disk"
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                  transition={300}
                />
              ) : null}
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
}
// ─────────────────────────────────────────────────────────────────────────────
// 2. QUICK STORE CATEGORY CARD
// ─────────────────────────────────────────────────────────────────────────────


function QuickStoreCatCard({ cat, isAr, isSelected, onPress }: any) {
  const nameAr = cat.name_ar || cat.name;
  const targetImageUrl = cat.image_url || get3DIconUrl(nameAr);
  const activeColor = cat.color || '#B91C1C';

  return (
    <Pressable style={qc.card} onPress={onPress}>
      <View style={[
        qc.iconBg,
        isSelected && { borderColor: activeColor } // خلينا الخلفية بيضاء صلبة زي ما هي
      ]}>
        {/* الطبقة الشفافة اللي بتلون المربع بدون ما تخرب الأندرويد */}
        {isSelected && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: activeColor, opacity: 0.12, borderRadius: 14 }]} />
        )}
        <RNImage source={{ uri: targetImageUrl }} style={{ width: 48, height: 48 }} resizeMode="contain" />
      </View>
      <Text style={[qc.label, isSelected && { color: activeColor }]} numberOfLines={2}>
        {isAr ? nameAr : cat.name}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PREMIUM STORE CARD
// ─────────────────────────────────────────────────────────────────────────────
function PremiumStoreCard({ store, rating, isAr, onPress }: any) {
  const isOpen = checkStoreIsOpen(store);
  const name = isAr ? (store.name_ar || store.name) : store.name;

  return (
    <Pressable style={psc.card} onPress={onPress}>
      <View style={psc.imageWrap}>
        <Image source={{ uri: store.logo_url }} style={psc.logoImg} contentFit="contain" />
      </View>
      <View style={psc.infoWrap}>
        <Text style={psc.name} numberOfLines={1}>{name}</Text>
        <Text style={psc.address} numberOfLines={1}>{store.address || (isAr ? 'قلقيلية' : 'Qalqilya')}</Text>
        <View style={psc.bottomRow}>
          <Text style={[psc.statusText, { color: isOpen ? '#059669' : '#EA580C' }]}>
            {isOpen ? (isAr ? 'مفتوح ' : 'Open ') : (isAr ? 'يغلق قريبا ' : 'Closing soon ')}
            <Text style={psc.timeText}>{isAr ? 'حتى 00:00' : 'until 00:00'}</Text>
          </Text>
          {rating.avg > 0 && (
            <View style={psc.ratingWrap}>
              <Text style={psc.ratingCount}>(+{rating.count}) </Text>
              <Text style={psc.ratingScore}>{rating.avg.toFixed(1)} </Text>
              <MaterialIcons name="star" size={14} color="#1A1A1A" />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CATEGORY BLOCK
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBlock({ cat, stores, ratings, isAr, isRTL, onStorePress }: any) {
  const catName = isAr ? (cat.name_ar || cat.name) : cat.name;
  return (
    <View style={s.categoryContainer}>
      <Text style={[s.catTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{catName}</Text>
      <View style={s.gridContainer}>
        {stores.map((store: any) => (
          <StoreGridCard 
            key={store.id} 
            store={store} 
            rating={ratings[store.id] ?? { avg: 0 }} 
            isAr={isAr} 
            onPress={() => onStorePress(store.id)} 
          />
        ))}
      </View>
    </View>
  );
}

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
      <LinearGradient colors={['#B91C1C', '#991B1B', '#7F1D1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cta.gradient}>
        <View style={cta.deco1} />
        <View style={cta.deco2} />
        <View style={[cta.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={cta.iconWrap}>
            <MaterialIcons name="storefront" size={26} color="#FFFFFF" />
          </View>
          <View style={[cta.textCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[cta.title, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}
            </Text>
            <Text style={[cta.sub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'انضم وابدأ البيع عبر التطبيق اليوم' : 'Join and start selling today'}
            </Text>
          </View>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color="rgba(255,255,255,0.9)" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function StoreGridCard({ store, rating, isAr, onPress }: any) {
  const isOpen = checkStoreIsOpen(store);
  const name = isAr ? (store.name_ar || store.name) : store.name;
  
  return (
    <Pressable style={s.gridCard} onPress={onPress}>
      <View style={s.logoWrap}>
        <Image source={{ uri: store.logo_url }} style={s.logoImg} contentFit="contain" />
      </View>
      <Text style={s.storeName} numberOfLines={1}>{name}</Text>
      <Text style={s.storeAddress} numberOfLines={1}>{store.address || 'قلقيلية'}</Text>
      <View style={s.footerRow}>
        <Text style={{ fontSize: 12, color: isOpen ? '#059669' : '#EA580C', fontWeight: 'bold' }}>
          {isOpen ? 'مفتوح' : 'مغلق'}
        </Text>
        <Text style={s.ratingText}>★ {rating.avg.toFixed(1)}</Text>
      </View>
    </Pressable>
  );
}

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
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const scrollRef = useRef<any>(null);
  const catScrollRef = useRef<any>(null);

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
    // 1. تعيين البنرات الثابتة
    const localBanners = [
  { id: '1', image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80' },
  { id: '2', image_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80' },
  { id: '3', image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80' },
  { id: '4', image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80' },
];
    setBanners(localBanners);

    // 2. جلب باقي البيانات (المتاجر، التقييمات، والتصنيفات) من قاعدة البيانات
    Promise.all([
      fetchAllActiveStores(),
      fetchAllStoreRatings(),
      fetchStoreCategories(),
    ]).then(([storesRes, ratingsMap, catsRes]) => {
      setStores(storesRes.data);
      setRatings(ratingsMap);
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
      
      {/* 1. الشريط العلوي النظيف بدون الأزرار */}
      <View style={[s.header, { backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 15 }]}>
        <View style={[s.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          
          {isSearchVisible ? (
            <View style={{ flex: 1, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 }}>
              <TextInput
                autoFocus
                style={{ flex: 1, textAlign: isRTL ? 'right' : 'left', fontSize: 14 }}
                placeholder={isAr ? 'ابحث في المتاجر...' : 'Search stores...'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable onPress={() => { setIsSearchVisible(false); setSearchQuery(''); }}>
                <MaterialIcons name="close" size={22} color="#1A1A1A" />
              </Pressable>
            </View>
          ) : (
            <>
              {/* 1. أيقونة الدعم الفني (تحويل للواتساب) */}
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

              {/* 2. الزر المركزي (استنو المفاجئات) */}
              <View style={[s.locationCenter, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: '#F3F4F6', borderColor: 'transparent', paddingVertical: 6, paddingHorizontal: 16 }]}>
                <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '800' }}>
                  {isAr ? 'استنو المفاجئات 🎁' : 'Wait for Surprises 🎁'}
                </Text>
              </View>
              
              {/* 3. أيقونة البحث */}
              <Pressable hitSlop={8} onPress={() => setIsSearchVisible(true)}>
                <MaterialIcons name="search" size={28} color="#1A1A1A" />
              </Pressable>
            </>
          )}

        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        <BannerCarousel banners={banners} isRTL={isRTL} />


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
      {isAr ? 'شو ناقصك اليوم؟ 🤔' : "What are you craving today? 🤔"}
    </Text>
    <ScrollView
      ref={catScrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.catScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      onContentSizeChange={() => {
        if (isRTL && catScrollRef.current) {
          catScrollRef.current.scrollToEnd({ animated: false });
        }
      }}
    >
     {/* 1. خيار العروض */}
      <Pressable style={qc.card} onPress={() => router.push('/offers' as any)}>
        <View style={[qc.iconBg, selectedCatId === '__offers__' && { borderColor: '#EA580C' }]}>
          {selectedCatId === '__offers__' && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#EA580C', opacity: 0.12, borderRadius: 14 }]} />
          )}
          
          {/* النار المتحركة GIF بدون خلفيات ملونة */}
          <Image 
            source={{ uri: get3DIconUrl('العروض') }} 
            style={{ width: 55, height: 55, transform: [{ scale: 1.15 }], backgroundColor: 'transparent' }} 
            contentFit="contain" 
          />
        </View>
        <Text style={[qc.label, selectedCatId === '__offers__' ? { color: '#EA580C' } : { color: '#1A1A1A' }]} numberOfLines={2}>
          {isAr ? 'العروض' : 'Offers'}
        </Text>
      </Pressable>
      
      {/* 2. خيار عرض الكل (الافتراضي) */}
      <Pressable style={qc.card} onPress={() => setSelectedCatId(null)}>
        <View style={[qc.iconBg, selectedCatId === null && { borderColor: '#B91C1C' }]}>
          {selectedCatId === null && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#B91C1C', opacity: 0.12, borderRadius: 14 }]} />
          )}
          <RNImage source={{ uri: get3DIconUrl('الكل') }} style={{ width: 48, height: 48 }} resizeMode="contain" />
        </View>
        <Text style={[qc.label, selectedCatId === null && { color: '#B91C1C' }]} numberOfLines={2}>{isAr ? 'الكل' : 'All'}</Text>
      </Pressable>

      {/* 3. باقي التصنيفات */}
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
              {searchQuery.trim()
                ? (isAr ? 'عذراً، لا يوجد متاجر مطابقة لبحثك' : 'Sorry, no stores match your search')
                : selectedCatId
                  ? (isAr ? 'لا توجد متاجر في هذا التصنيف' : 'No stores in this category')
                  : (isAr ? 'ترقبوا إضافة متاجر قريباً' : 'Stores are coming soon')}
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
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={nameGateVisible} animationType="fade" transparent onRequestClose={() => {}}>
        <View style={g.overlay}>
          <View style={[g.card, { backgroundColor: colors.surface }]}>
            <View style={[g.iconWrap, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="person" size={36} color={colors.primary} />
            </View>
            <Text style={[g.title, { color: colors.textPrimary }]}>{isAr ? 'أكمل ملفك الشخصي' : 'Complete Your Profile'}</Text>
            <Text style={[g.subtitle, { color: colors.textSecondary }]}>{isAr ? 'يرجى كتابة اسمك الحقيقي (بدون أرقام) للمتابعة' : 'Please enter your real name (no digits) to continue'}</Text>
            <TextInput
              style={[g.input, { borderColor: nameError ? colors.error : colors.border, color: colors.textPrimary, backgroundColor: colors.background, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={isAr ? 'اكتب اسمك الحقيقي' : 'Enter your real name'}
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={t => { setEditName(t); setNameError(''); }}
              autoFocus
              maxLength={40}
            />
            {nameError ? <Text style={[g.errorText, { color: colors.error }]}>{nameError}</Text> : null}
            <Pressable style={[g.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]} onPress={handleSaveName} disabled={savingName}>
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

// ─────────────────────────────────────────────────────────────────────────────
// STYLESHEETS (single declaration each)
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
  catImage: { width: 45, height: 45 }, // تصغير المقاس قليلاً لضمان عدم خروجها عن حدود الحاوية
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', lineHeight: 18 },
});

const psc = StyleSheet.create({
  card: {
    width: 170, backgroundColor: '#FFFFFF', borderRadius: 16,
    marginRight: 12, marginLeft: 4, marginBottom: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  imageWrap: { height: 110, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 16 },
  logoImg: { width: '100%', height: '100%' },
  infoWrap: { padding: 12 },
  name: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 4 },
  address: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginBottom: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  statusText: { fontSize: 11, fontWeight: '800' },
  timeText: { color: '#9CA3AF', fontWeight: '500' },
  ratingWrap: { flexDirection: 'row', alignItems: 'center' },
  ratingScore: { fontSize: 12, fontWeight: '800', color: '#1A1A1A' },
  ratingCount: { fontSize: 11, color: '#9CA3AF' },
});

const cb = StyleSheet.create({
  block: { marginBottom: 20, backgroundColor: '#FFFFFF', borderRadius: 16, paddingTop: 16, paddingBottom: 8, marginHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  headerRow: { paddingHorizontal: 16, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  sponsored: { fontSize: 13, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  scrollContent: { paddingHorizontal: 16 },
});

const cta = StyleSheet.create({
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

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  locationCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  locationName: { fontSize: 14, color: '#fff', fontWeight: '800' },
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
  storeSearchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16, marginBottom: 10, gap: 10, borderRadius: 16, paddingHorizontal: 14, height: 50, borderWidth: 1 },
  storeSearchIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  storeSearchInput: { flex: 1, fontSize: 13, fontWeight: '600' },
  locationTextWrap: { alignItems: 'center' },
  locationTitle: { fontSize: 13, color: '#1A1A1A', fontWeight: '800' },
  locationSubtitle: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  homeIconWrap: { backgroundColor: '#F3F4F6', padding: 6, borderRadius: 15 },
  floatingButtonsWrap: { position: 'absolute', bottom: 20, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 100 },
  supportFab: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  scrollTopFab: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  categoryContainer: { paddingHorizontal: 16, marginBottom: 20 },
  catTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: {
    width: '48%', backgroundColor: '#fff', borderRadius: 16,
    padding: 12, marginBottom: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  logoWrap: { width: 70, height: 70, borderRadius: 35, overflow: 'hidden', marginBottom: 8, backgroundColor: '#F9FAFB' },
  logoImg: { width: '100%', height: '100%' },
  storeName: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  storeAddress: { fontSize: 10, color: '#6B7280', marginBottom: 8 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4 },
  ratingText: { fontSize: 11, fontWeight: 'bold' },
});

const g = StyleSheet.create({
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