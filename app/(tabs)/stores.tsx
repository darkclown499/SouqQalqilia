import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCategories } from '@/hooks/useCategories';
import { useAuth, getSupabaseClient } from '@/template';
import { fetchStoresByCategory, checkStoreIsOpen, Store } from '@/services/storesService';
import { fetchStoreRating } from '@/services/productsService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

// ── Name validator ────────────────────────────────────────────────────────────
function isNameInvalid(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  return /[0-9!@#$%^&*()_+=\[\]{};':"\\|,.<>/?`~]/.test(name);
}

// ── Premium Store Card ────────────────────────────────────────────────────────
function StoreCard({
  store, rating, onPress, isAr, isRTL, colors,
}: {
  store: Store; rating: { avg: number; count: number };
  onPress: () => void; isAr: boolean; isRTL: boolean; colors: any;
}) {
  const [isOpen, setIsOpen] = useState(() => checkStoreIsOpen(store));
  const name = isAr ? ((store as any).name_ar || store.name) : store.name;
  const address = store.address;

  // Re-evaluate open/closed every 60 s
  useEffect(() => {
    const t = setInterval(() => setIsOpen(checkStoreIsOpen(store)), 60_000);
    return () => clearInterval(t);
  }, [store]);

  const hoursLabel = store.opening_time && store.closing_time
    ? `${store.opening_time} – ${store.closing_time}`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [sc.card, { backgroundColor: colors.surface, opacity: pressed ? 0.93 : 1 }]}
      onPress={onPress}
    >
      {/* Closed dimming overlay */}
      {!isOpen ? <View style={sc.closedOverlay} /> : null}

      <View style={[sc.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {/* Circular Logo with status ring */}
        <View style={[sc.logoRing, { borderColor: isOpen ? '#22c55e' : '#d1d5db' }]}>
          {store.logo_url ? (
            <Image
              source={{ uri: store.logo_url }}
              style={sc.logoImg}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
            />
          ) : (
            <View style={[sc.logoFallback, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="storefront" size={30} color={colors.primary} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={[sc.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text
            style={[sc.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {name}
          </Text>

          {address ? (
            <View style={[sc.row2, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="location-on" size={12} color={colors.textMuted} />
              <Text style={[sc.address, { color: colors.textMuted }]} numberOfLines={1}>{address}</Text>
            </View>
          ) : null}

          {/* Rating + hours */}
          <View style={[sc.row2, { flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }]}>
            {rating.avg > 0 ? (
              <View style={[sc.row2, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={sc.starEmoji}>⭐</Text>
                <Text style={[sc.ratingNum, { color: colors.textPrimary }]}>
                  {rating.avg.toFixed(1)}
                </Text>
                {rating.count > 0 ? (
                  <Text style={[sc.ratingCount, { color: colors.textMuted }]}>({rating.count})</Text>
                ) : null}
              </View>
            ) : (
              <Text style={[sc.newBadge, { color: colors.primary }]}>
                {isAr ? '✦ جديد' : '✦ New'}
              </Text>
            )}
            {hoursLabel ? (
              <Text style={[sc.hours, { color: colors.textMuted }]}>{hoursLabel}</Text>
            ) : null}
          </View>
        </View>

        {/* Status tag + arrow */}
        <View style={[sc.rightCol, { alignItems: 'center', gap: 8 }]}>
          <View style={[sc.statusTag, { backgroundColor: isOpen ? '#DCFCE7' : '#F3F4F6' }]}>
            <View style={[sc.statusDot, { backgroundColor: isOpen ? '#16a34a' : '#9ca3af' }]} />
            <Text style={[sc.statusText, { color: isOpen ? '#15803d' : '#6b7280' }]}>
              {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
            </Text>
          </View>
          <MaterialIcons
            name={isRTL ? 'chevron-left' : 'chevron-right'}
            size={18}
            color={colors.textMuted}
          />
        </View>
      </View>

      {/* Banner strip at bottom */}
      {(store as any).banner_url ? (
        <View style={sc.bannerStrip}>
          <Image
            source={{ uri: (store as any).banner_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
          <View style={sc.bannerGradient} />
        </View>
      ) : null}
    </Pressable>
  );
}

const sc = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  logoRing: {
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 2.5,
    overflow: 'hidden',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  logoImg: { width: 74, height: 74 },
  logoFallback: {
    width: 74, height: 74,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, gap: 5 },
  name: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  starEmoji: { fontSize: 12 },
  ratingNum: { fontSize: 13, fontWeight: '700' },
  ratingCount: { fontSize: 11 },
  newBadge: { fontSize: 12, fontWeight: '700' },
  hours: { fontSize: 11 },
  rightCol: { flexShrink: 0, alignItems: 'center', gap: 6 },
  statusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontWeight: '800' },
  bannerStrip: { height: 56, position: 'relative', overflow: 'hidden' },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});

// ── Register CTA Banner ───────────────────────────────────────────────────────
function RegisterStoreCTA({ isAr, isRTL, colors, onPress }: {
  isAr: boolean; isRTL: boolean; colors: any; onPress: () => void;
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
            <MaterialIcons name="store" size={30} color="#fff" />
          </View>
          <View style={[cta.textCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <View style={cta.badge}>
              <MaterialIcons name="star" size={10} color="#F59E0B" />
              <Text style={cta.badgeText}>{isAr ? 'فرصة تجارية' : 'Business Opportunity'}</Text>
            </View>
            <Text style={[cta.title, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}
            </Text>
            <Text style={[cta.sub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr
                ? 'انضم وابدأ البيع عبر التطبيق اليوم'
                : 'Join and start selling through the app today'}
            </Text>
          </View>
          <MaterialIcons
            name={isRTL ? 'chevron-left' : 'chevron-right'}
            size={22} color="rgba(255,255,255,0.8)"
          />
        </View>
        <View style={[cta.steps, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {[
            { icon: 'assignment', label: isAr ? 'أرسل الطلب' : 'Submit' },
            { icon: 'verified', label: isAr ? 'مراجعة 24 ساعة' : 'Review 24h' },
            { icon: 'rocket-launch', label: isAr ? 'ابدأ البيع!' : 'Start Selling!' },
          ].map((step, i) => (
            <View key={i} style={[cta.stepItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {i > 0 ? <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={11} color="rgba(255,255,255,0.35)" /> : null}
              <View style={cta.stepPill}>
                <MaterialIcons name={step.icon as any} size={11} color="#F59E0B" />
                <Text style={cta.stepText}>{step.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const cta = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, overflow: 'hidden', ...Shadow.lg },
  gradient: { borderRadius: 18, overflow: 'hidden', padding: 16, gap: 12 },
  deco1: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -30 },
  deco2: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -20, left: 50 },
  content: { alignItems: 'center', gap: 12 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', flexShrink: 0 },
  textCol: { flex: 1, gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#FDE68A' },
  title: { fontSize: FontSize.md, fontWeight: '800', color: '#fff', letterSpacing: -0.2, lineHeight: 22 },
  sub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
  steps: { gap: 5, flexWrap: 'wrap' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stepPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  stepText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { categories } = useCategories();
  const { user } = useAuth();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [loading, setLoading] = useState(false);
  const [ownerStore, setOwnerStore] = useState<Store | null | undefined>(undefined);

  // ── Gatekeeper ──────────────────────────────────────────────────────────────
  const [nameGateVisible, setNameGateVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const isAr = language === 'ar';

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getSupabaseClient()
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          const name = data?.username ?? '';
          if (isNameInvalid(name)) {
            setEditName(name);
            setNameGateVisible(true);
          }
        })
        .catch(() => {});
      getSupabaseClient()
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()
        .then(({ data }) => setOwnerStore(data as Store | null))
        .catch(() => setOwnerStore(null));
    }, [user?.id])
  );

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (isNameInvalid(trimmed)) {
      setNameError(isAr ? 'الاسم يجب أن يحتوي على أحرف فقط بدون أرقام أو رموز' : 'Name must contain letters only, no digits or symbols');
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

  // Auto-select first category
  useEffect(() => {
    if (categories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories]);

  // ── Load stores + ratings ─────────────────────────────────────────────────
  // BUG FIX: fetchStoresByCategory already filters by category_id + is_active + is_approved
  // so the list is always strictly scoped to the selected category.
  useEffect(() => {
    if (!selectedCategoryId) return;
    setStores([]);
    setLoading(true);
    fetchStoresByCategory(selectedCategoryId)
      .then(async ({ data }) => {
        setStores(data);
        const ratingResults = await Promise.all(
          data.map(store => fetchStoreRating(store.id).then(r => ({ id: store.id, r })))
        );
        const map: Record<string, { avg: number; count: number }> = {};
        ratingResults.forEach(({ id, r }) => { map[id] = r; });
        setRatings(map);
      })
      .finally(() => setLoading(false));
  }, [selectedCategoryId]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const renderStore = useCallback(({ item }: { item: Store }) => (
    <StoreCard
      store={item}
      rating={ratings[item.id] ?? { avg: 0, count: 0 }}
      onPress={() => router.push(`/store/${item.id}` as any)}
      isAr={isAr}
      isRTL={isRTL}
      colors={colors}
    />
  ), [colors, isRTL, isAr, ratings, router]);

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={[s.header, { backgroundColor: colors.primary }]}>
        <View style={s.headerDeco1} pointerEvents="none" />
        <View style={s.headerDeco2} pointerEvents="none" />

        <View style={[s.headerTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[s.headerIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <MaterialIcons name="storefront" size={26} color="#fff" />
          </View>
          <View style={[s.headerTitles, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[s.headerSub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'تسوق من' : 'Shop from'}
            </Text>
            <Text style={[s.headerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'المتاجر المحلية' : 'Local Stores'}
            </Text>
          </View>
        </View>

        {/* Category pill bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          contentContainerStyle={[s.catBar]}
        >
          {categories.map(cat => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <View key={cat.id} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                <Pressable
                  style={[s.catChip, {
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                    borderColor: isSelected ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.20)',
                  }]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <MaterialIcons name={cat.icon as any} size={13} color={isSelected ? '#fff' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[s.catChipText, {
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.75)',
                    fontWeight: isSelected ? '700' : '500',
                  }]}>
                    {getCategoryName(cat, language)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* ── SECTION LABEL ── */}
      {selectedCategory ? (
        <View style={[s.sectionBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[s.sectionDot, { backgroundColor: selectedCategory.color }]} />
          <Text style={[s.sectionText, { color: colors.textPrimary }]}>
            {getCategoryName(selectedCategory, language)}
          </Text>
          <View style={[s.sectionPill, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[s.sectionCount, { color: colors.primary }]}>{stores.length}</Text>
          </View>
        </View>
      ) : null}

      {/* ── LIST ── */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>
            {isAr ? 'جارٍ تحميل المتاجر...' : 'Loading stores...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          renderItem={renderStore}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Register CTA — shown when user has no store yet */}
              {ownerStore === null && user ? (
                <RegisterStoreCTA
                  isAr={isAr}
                  isRTL={isRTL}
                  colors={colors}
                  onPress={() => router.push('/register-store' as any)}
                />
              ) : null}

              {/* Owner store card */}
              {ownerStore !== undefined && ownerStore !== null ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[s.ownerLabel, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isAr ? 'متجرك' : 'Your Store'}
                  </Text>
                  <Pressable
                    style={[oss.card, {
                      backgroundColor: ownerStore.is_approved ? colors.surface : '#FFFBEB',
                      borderColor: ownerStore.is_approved ? colors.primary : '#F59E0B',
                    }]}
                    onPress={() => router.push('/store-dashboard' as any)}
                  >
                    <View style={[oss.iconWrap, { backgroundColor: ownerStore.is_approved ? colors.primaryGhost : '#FEF3C7' }]}>
                      <MaterialIcons name="storefront" size={22} color={ownerStore.is_approved ? colors.primary : '#D97706'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[oss.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                        {isAr ? ((ownerStore as any).name_ar || ownerStore.name) : ownerStore.name}
                      </Text>
                      <View style={[oss.badge, {
                        backgroundColor: ownerStore.is_approved ? '#D1FAE5' : '#FEF3C7',
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                      }]}>
                        <MaterialIcons
                          name={ownerStore.is_approved ? 'check-circle' : 'access-time'}
                          size={11}
                          color={ownerStore.is_approved ? '#16a34a' : '#D97706'}
                        />
                        <Text style={[oss.badgeText, { color: ownerStore.is_approved ? '#16a34a' : '#D97706' }]}>
                          {ownerStore.is_approved
                            ? (isAr ? 'مفعّل ✓' : 'Active ✓')
                            : (isAr ? 'قيد المراجعة ⏳' : 'Under Review ⏳')}
                        </Text>
                      </View>
                    </View>
                    <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={[s.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="store" size={44} color={colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {isAr ? 'لا توجد متاجر' : 'No Stores Yet'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد متاجر في هذا التصنيف حالياً' : 'No stores in this category yet'}
              </Text>
              {ownerStore === null && user ? (
                <Pressable
                  style={[s.emptyCtaBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/register-store' as any)}
                >
                  <MaterialIcons name="store" size={16} color="#fff" />
                  <Text style={s.emptyCtaBtnText}>{isAr ? 'سجّل متجرك الآن' : 'Register Your Store'}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}

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
                ? 'يرجى كتابة اسمك الحقيقي (بدون أرقام) للتمكن من الطلب'
                : 'Please enter your real name (no digits) to place orders'}
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
              onChangeText={text => { setEditName(text); setNameError(''); }}
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

// ── Owner store mini card ─────────────────────────────────────────────────────
const oss = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    overflow: 'hidden',
  },
  headerDeco1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -50,
  },
  headerDeco2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: 10, left: -25,
  },
  headerTop: { alignItems: 'center', gap: 12, marginBottom: 12 },
  headerIconWrap: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1 },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 2 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  catBar: { flexDirection: 'row', gap: 8, paddingBottom: 4, alignItems: 'center' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  catChipText: { fontSize: FontSize.xs },

  sectionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: 10, borderBottomWidth: 1,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionText: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  sectionPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  sectionCount: { fontSize: FontSize.xs, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText: { fontSize: FontSize.sm, fontWeight: '500' },

  ownerLabel: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  emptyCtaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20,
    marginTop: 4,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  emptyCtaBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
});

// ── Gatekeeper modal styles ───────────────────────────────────────────────────
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
