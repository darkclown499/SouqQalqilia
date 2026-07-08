import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCategories } from '@/hooks/useCategories';
import { useAuth, getSupabaseClient } from '@/template';
import { fetchStoresByCategory, Store } from '@/services/storesService';
import { fetchStoreRating } from '@/services/productsService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

// ── Name validator: no digits or special symbols ──────────────────────────────
function isNameInvalid(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  // Allow Arabic letters, English letters, spaces and dashes only
  return /[0-9!@#$%^&*()_+=\[\]{};':"\\|,.<>/?`~]/.test(name);
}

// ── Store card with banner, circular logo, rating ─────────────────────────────
function StoreCard({
  store, rating, onPress, isAr, isRTL, colors,
}: {
  store: Store; rating: { avg: number; count: number };
  onPress: () => void; isAr: boolean; isRTL: boolean; colors: any;
}) {
  const name = isAr ? ((store as any).name_ar || store.name) : store.name;
  const address = store.address;

  return (
    <Pressable
      style={({ pressed }) => [sc.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.92 : 1 }]}
      onPress={onPress}
    >
      {/* Banner */}
      <View style={sc.bannerArea}>
        {(store as any).banner_url ? (
          <Image source={{ uri: (store as any).banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="disk" />
        ) : store.logo_url ? (
          <Image source={{ uri: store.logo_url }} style={[StyleSheet.absoluteFill, { opacity: 0.45 }]} contentFit="cover" transition={200} cachePolicy="disk" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primaryGhost }]} />
        )}
        <View style={sc.bannerGradient} />
      </View>

      {/* Circular logo */}
      <View style={[sc.logoCircle, { borderColor: colors.surface, backgroundColor: colors.surfaceTint }]}>
        {store.logo_url ? (
          <Image source={{ uri: store.logo_url }} style={sc.logoImg} contentFit="cover" transition={200} />
        ) : (
          <MaterialIcons name="storefront" size={26} color={colors.primary} />
        )}
      </View>

      {/* Info */}
      <View style={[sc.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[sc.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
          {name}
        </Text>
        {address ? (
          <View style={[sc.addrRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="location-on" size={12} color={colors.textMuted} />
            <Text style={[sc.addrText, { color: colors.textMuted }]} numberOfLines={1}>{address}</Text>
          </View>
        ) : null}
        {/* Star rating */}
        <View style={[sc.ratingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={sc.star}>⭐</Text>
          <Text style={[sc.ratingNum, { color: colors.textPrimary }]}>
            {rating.avg > 0 ? rating.avg.toFixed(1) : (isAr ? 'جديد' : 'New')}
          </Text>
          {rating.count > 0 ? (
            <Text style={[sc.ratingCount, { color: colors.textMuted }]}>
              ({rating.count} {isAr ? 'مراجعة' : 'reviews'})
            </Text>
          ) : null}
        </View>
      </View>

      {/* Arrow */}
      <View style={sc.arrowWrap}>
        <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

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

  // ── Gatekeeper ──────────────────────────────────────────────────────────────
  const [nameGateVisible, setNameGateVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const checkedRef = useRef(false);

  const isAr = language === 'ar';

  // Check name on every tab focus
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

  // Load stores + ratings when category changes
  useEffect(() => {
    if (!selectedCategoryId) return;
    setLoading(true);
    fetchStoresByCategory(selectedCategoryId)
      .then(async ({ data }) => {
        setStores(data);
        // Load ratings in parallel
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
          contentContainerStyle={[s.catBar, { flexDirection: 'row' }]}
        >
          {categories.map(cat => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <View key={cat.id} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                <Pressable
                  style={[s.catChip, {
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)',
                    borderColor: isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                  }]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <MaterialIcons name={cat.icon as any} size={13} color={isSelected ? '#fff' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[s.catChipText, { color: isSelected ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: isSelected ? '700' : '500' }]}>
                    {getCategoryName(cat, language)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Section label */}
      {selectedCategory ? (
        <View style={[s.sectionLabel, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
          <MaterialIcons name={selectedCategory.icon as any} size={16} color={selectedCategory.color} />
          <Text style={[s.sectionLabelText, { color: colors.textPrimary }]}>
            {getCategoryName(selectedCategory, language)}
          </Text>
          <View style={[s.sectionCount, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[s.sectionCountText, { color: colors.primary }]}>{stores.length}</Text>
          </View>
        </View>
      ) : null}

      {/* Store list */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          renderItem={renderStore}
          contentContainerStyle={[s.listContent, { paddingHorizontal: Spacing.lg, paddingBottom: 32 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={[s.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="store" size={44} color={colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {isAr ? 'لا توجد متاجر' : 'No Stores'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد متاجر في هذا التصنيف حالياً' : 'No stores in this category yet'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── NAME GATEKEEPER MODAL ── */}
      <Modal
        visible={nameGateVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {/* non-dismissable */}}
      >
        <View style={g.overlay}>
          <View style={[g.card, { backgroundColor: colors.surface }]}>
            {/* Icon */}
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
              {savingName ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={g.saveBtnText}>{isAr ? 'حفظ الاسم' : 'Save Name'}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Store card styles ─────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  card: {
    borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  bannerArea: { height: 110, backgroundColor: '#e8f5e9', position: 'relative' },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  logoCircle: {
    position: 'absolute', top: 70, left: 16,
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14, shadowRadius: 6, elevation: 4,
  },
  logoImg: { width: 60, height: 60 },
  info: {
    paddingTop: 38, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 4,
  },
  name: { fontSize: FontSize.md, fontWeight: '700' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addrText: { fontSize: FontSize.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  star: { fontSize: 13 },
  ratingNum: { fontSize: FontSize.sm, fontWeight: '700' },
  ratingCount: { fontSize: FontSize.xs },
  arrowWrap: { position: 'absolute', right: 14, top: 120 },
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
  headerTop: {
    alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md,
  },
  headerIconWrap: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitles: { flex: 1 },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 2 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },

  catBar: { gap: Spacing.sm, paddingBottom: 4, alignItems: 'center', flexDirection: 'row' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1,
  },
  catChipText: { fontSize: FontSize.xs },

  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1,
  },
  sectionLabelText: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  sectionCount: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  sectionCountText: { fontSize: FontSize.xs, fontWeight: '700' },

  listContent: { paddingTop: Spacing.md },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyWrap: {
    alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xxl, gap: Spacing.md, paddingTop: 60,
  },
  emptyIllus: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
});

// ── Gatekeeper modal styles ───────────────────────────────────────────────────
const g = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  card: {
    width: '100%', borderRadius: 24,
    padding: Spacing.xl, gap: Spacing.md, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 20,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 21 },
  input: {
    width: '100%', height: 50, borderWidth: 1.5,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    fontSize: FontSize.md, marginTop: 4,
  },
  errorText: { fontSize: FontSize.xs, fontWeight: '600', alignSelf: 'flex-start' },
  saveBtn: {
    width: '100%', height: 50, borderRadius: Radius.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 4,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
