import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdCard, EmptyState } from '@/components';
import { useAds } from '@/hooks/useAds';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useResponsive } from '@/hooks/useResponsive';

import { fetchAllActiveStores, Store } from '@/services/storesService';
import { fetchStoreCategories, StoreCategory } from '@/services/storeCategoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

// ─── Category Detail Screen ────────────────────────────────────────────────
export default function CategoryDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const { user } = useAuth();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const { numColumns, hPad, cardGap, cardWidth: CARD_WIDTH } = useResponsive();

  const { ads, loading: adsLoading, load: loadAds } = useAds();

  const [category, setCategory] = useState<StoreCategory | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load category & stores ──
  useEffect(() => {
    if (!slug) return;

    setLoading(true);

    Promise.all([fetchStoreCategories(), fetchAllActiveStores()])
      .then(([catsRes, storesRes]) => {
        const found = catsRes.data.find((c: StoreCategory) => c.slug === slug);
        setCategory(found || null);

        if (found) {
          const filtered = storesRes.data.filter(
            (s: Store) =>
              s.store_category_id === found.id ||
              s.category_id === found.id
          );
          setStores(filtered);
        } else {
          setStores([]);
        }
      })
      .catch((err) => {
        console.error('Error loading category:', err);
        setStores([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // ── Load ads ──
  useEffect(() => {
    if (category?.id) {
      loadAds({ categoryId: category.id });
    }
  }, [category?.id, loadAds]);

  // ── Navigate ──
  const handleStorePress = (storeId: string) => {
    router.push(`/store/${storeId}` as any);
  };

  // ── Render Store Card ──
  const renderStore = ({ item }: { item: Store }) => {
    const name = isAr ? item.name_ar || item.name : item.name;
    const isOpen = checkStoreIsOpen(item);
    const wa = item.whatsapp || item.phone;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.storeCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={() => handleStorePress(item.id)}
      >
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={styles.storeLogo} contentFit="cover" />
        ) : (
          <View style={[styles.storeLogoPlaceholder, { backgroundColor: colors.primaryGhost }]}>
            <Text style={styles.storeLogoEmoji}>🏪</Text>
          </View>
        )}

        <Text style={[styles.storeName, { color: colors.textPrimary }]} numberOfLines={2}>
          {name}
        </Text>

        <Text style={[styles.storeAddress, { color: colors.textMuted }]} numberOfLines={1}>
          {item.address || (isAr ? 'قلقيلية' : 'Qalqilya')}
        </Text>

        <View style={styles.storeMeta}>
          <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#DCFCE7' : '#FEE2E2' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOpen ? '#22C55E' : '#EF4444' }]} />
            <Text style={[styles.statusText, { color: isOpen ? '#16A34A' : '#DC2626' }]}>
              {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
            </Text>
          </View>
          <Text style={[styles.hoursText, { color: colors.textMuted }]}>
            {item.opening_time} - {item.closing_time}
          </Text>
        </View>

        {wa && (
          <Pressable
            style={styles.waBtn}
            onPress={() =>
              Linking.openURL(`https://wa.me/${wa.replace(/[^0-9]/g, '')}`).catch(() => {})
            }
          >
            <Text style={styles.waEmoji}>💬</Text>
            <Text style={styles.waText}>{isAr ? 'واتساب' : 'WhatsApp'}</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  // ── Render Ad ──
  const renderAd = useCallback(
    ({ item }: any) => (
      <View style={styles.adWrapper}>
        <AdCard
          ad={item}
          width={CARD_WIDTH}
          isFavorited={favIds.has(item.id)}
          onFavoritePress={user ? toggleFav : undefined}
        />
      </View>
    ),
    [favIds, user, toggleFav, CARD_WIDTH]
  );

  // ── Loading ──
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // ── Category not found ──
  if (!category) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="chevron-left" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{isAr ? 'تصنيف غير موجود' : 'Category Not Found'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="category" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {isAr ? 'التصنيف غير موجود' : 'Category not found'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Main UI ──
  const categoryName = isAr ? category.name_ar || category.name : category.name;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {categoryName}
        </Text>
        <Text style={styles.storeCount}>{stores.length}</Text>
      </View>

      <FlatList
        data={ads}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderAd}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: hPad }, // ✅ الأنماط الديناميكية هنا
        ]}
        columnWrapperStyle={
          numColumns > 1 ? { gap: cardGap, marginBottom: cardGap } : undefined
        }
        showsVerticalScrollIndicator={false}
        refreshing={adsLoading}
        onRefresh={() => category.id && loadAds({ categoryId: category.id })}
        ListHeaderComponent={
          stores.length > 0 ? (
            <View
              style={[
                styles.storesSection,
                {
                  backgroundColor: colors.surface,
                  marginHorizontal: -hPad, // ✅ ديناميكي
                  paddingHorizontal: hPad, // ✅ ديناميكي
                },
              ]}
            >
              <View
                style={[
                  styles.storesHeader,
                  { flexDirection: isRTL ? 'row-reverse' : 'row' },
                ]}
              >
                <View style={[styles.storesIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={styles.storesIcon}>🏪</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.storesTitle,
                      {
                        color: colors.textPrimary,
                        textAlign: isRTL ? 'right' : 'left',
                      },
                    ]}
                  >
                    {isAr ? `متاجر ${categoryName}` : `Stores in ${categoryName}`}
                  </Text>
                  <Text
                    style={[
                      styles.storesSub,
                      {
                        color: colors.textMuted,
                        textAlign: isRTL ? 'right' : 'left',
                      },
                    ]}
                  >
                    {isAr
                      ? `${stores.length} متجر`
                      : `${stores.length} store${stores.length !== 1 ? 's' : ''}`}
                  </Text>
                </View>
              </View>

              <FlatList
                horizontal
                data={stores}
                keyExtractor={(item) => item.id}
                renderItem={renderStore}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.storesScroll,
                  { flexDirection: isRTL ? 'row-reverse' : 'row' },
                ]}
                snapToInterval={160}
                decelerationRate="fast"
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !adsLoading ? (
            <EmptyState
              icon="search-off"
              title={isAr ? 'لا توجد إعلانات' : 'No ads in this category'}
              subtitle={isAr ? 'حاول مرة أخرى لاحقاً' : 'Try again later'}
            />
          ) : null
        }
      />
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function checkStoreIsOpen(store: Store): boolean {
  if (!store.opening_time || !store.closing_time) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = store.opening_time.split(':').map(Number);
  const [closeH, closeM] = store.closing_time.split(':').map(Number);
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  if (open < close) return current >= open && current < close;
  // Overnight
  return current >= open || current < close;
}

// ─── Styles ──────────────────────────────────────────────────────────────
// ✅ تم إزالة الخصائص التي تعتمد على `hPad` من هنا، وتم نقلها إلى JSX
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  storeCount: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  // ✅ لم تعد تحتوي على paddingHorizontal، سنضيفها في JSX
  listContent: {
    paddingVertical: Spacing.md,
    paddingBottom: 40,
  },

  // Stores Section
  storesSection: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    // marginHorizontal و paddingHorizontal يتم تعيينهما في JSX
  },
  storesHeader: {
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  storesIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storesIcon: { fontSize: 22 },
  storesTitle: { fontSize: FontSize.md, fontWeight: '700' },
  storesSub: { fontSize: FontSize.xs, marginTop: 2 },

  storesScroll: {
    gap: Spacing.md,
    paddingVertical: 4,
  },

  // Store Card
  storeCard: {
    width: 150,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    ...Shadow.xs,
  },
  storeLogo: { width: 56, height: 56, borderRadius: 28 },
  storeLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLogoEmoji: { fontSize: 26 },
  storeName: { fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  storeAddress: { fontSize: 10, textAlign: 'center' },

  storeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  hoursText: { fontSize: 9, color: '#9CA3AF' },

  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#25D36618',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  waEmoji: { fontSize: 12 },
  waText: { fontSize: 11, fontWeight: '700', color: '#25D366' },

  adWrapper: { flex: 1 },
  emptyText: { fontSize: 16, fontWeight: '500', textAlign: 'center', marginTop: 12 },
});