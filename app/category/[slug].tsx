import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Linking,
  RefreshControl,
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load category & stores ──────────────────────────────────────────────
  const loadCategoryData = useCallback(async () => {
    if (!slug) return;

    try {
      setLoadError(null);
      const [catsRes, storesRes] = await Promise.all([
        fetchStoreCategories(),
        fetchAllActiveStores(),
      ]);

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
    } catch (err) {
      console.error('Error loading category:', err);
      setLoadError(isAr ? 'فشل تحميل التصنيف' : 'Failed to load category');
      setStores([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug, isAr]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    loadCategoryData();
  }, [loadCategoryData]);

  // ── Load ads when category is available ──────────────────────────────────
  useEffect(() => {
    if (category?.id) {
      loadAds({ categoryId: category.id });
    }
  }, [category?.id, loadAds]);

  // ── Refresh (pull-to-refresh) ────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadCategoryData();
  }, [loadCategoryData]);

  // ── Navigate ──────────────────────────────────────────────────────────────
  const handleStorePress = (storeId: string) => {
    router.push(`/store/${storeId}` as any);
  };

  // ── Render Store Card (Grid) ─────────────────────────────────────────────
  const renderStore = ({ item }: { item: Store }) => {
    const name = isAr ? item.name_ar || item.name : item.name;
    const isOpen = checkStoreIsOpen(item);
    const wa = item.whatsapp || item.phone;
    const isVIP = item.is_featured === true || (item as any).is_vip === true;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.storeCard,
          {
            backgroundColor: colors.surface,
            borderColor: isVIP ? '#FFD700' : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={() => handleStorePress(item.id)}
      >
        <View style={styles.logoWrapper}>
          {item.logo_url ? (
            <Image source={{ uri: item.logo_url }} style={styles.storeLogo} contentFit="cover" />
          ) : (
            <View style={[styles.storeLogoPlaceholder, { backgroundColor: colors.primaryGhost }]}>
              <Text style={styles.storeLogoEmoji}>🏪</Text>
            </View>
          )}

          {isVIP && (
            <View style={styles.vipBadge}>
              <MaterialIcons name="stars" size={10} color="#FFD700" />
              <Text style={styles.vipBadgeText}>VIP</Text>
            </View>
          )}
        </View>

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

  // ── Render Ad Strip ──────────────────────────────────────────────────────
  const renderAdStrip = useCallback(() => {
    if (ads.length === 0) return null;

    return (
      <View style={styles.adStrip}>
        <FlatList
          horizontal
          data={ads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.adWrapper, { width: CARD_WIDTH }]}>
              <AdCard
                ad={item}
                width={CARD_WIDTH}
                isFavorited={favIds.has(item.id)}
                onFavoritePress={user ? toggleFav : undefined}
              />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.adScrollContent,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
          snapToInterval={CARD_WIDTH + 12}
          decelerationRate="fast"
        />
      </View>
    );
  }, [ads, favIds, user, toggleFav, CARD_WIDTH, isRTL]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {isAr ? 'جارٍ تحميل التصنيف...' : 'Loading category...'}
        </Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (loadError && !category) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{isAr ? 'خطأ' : 'Error'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{loadError}</Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              loadCategoryData();
            }}
          >
            <Text style={styles.retryBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Category not found ────────────────────────────────────────────────────
  if (!category) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#fff" />
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

  // ── Main UI ──────────────────────────────────────────────────────────────
  const categoryName = isAr ? category.name_ar || category.name : category.name;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {categoryName}
        </Text>
        <Text style={styles.storeCount}>{stores.length}</Text>
      </View>

      {/* Main FlatList */}
      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        numColumns={2}
        key="stores-grid"
        renderItem={renderStore}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: hPad },
        ]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={renderAdStrip}
        ListEmptyComponent={
          <EmptyState
            icon="store-off"
            title={isAr ? 'لا توجد متاجر' : 'No stores'}
            subtitle={
              isAr
                ? 'لا توجد متاجر في هذا التصنيف حالياً'
                : 'No stores in this category at the moment'
            }
          />
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
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },

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

  listContent: {
    paddingVertical: Spacing.md,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  adStrip: {
    marginBottom: Spacing.md,
    paddingVertical: 8,
  },
  adScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  adWrapper: {
    flex: 1,
  },

  storeCard: {
    width: '48%',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    ...Shadow.xs,
  },

  logoWrapper: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 4,
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

  vipBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  vipBadgeText: {
    color: '#FFD700',
    fontSize: 8,
    fontWeight: '800',
  },

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

  emptyText: { fontSize: 16, fontWeight: '500', textAlign: 'center', marginTop: 12 },

  loadingText: { fontSize: FontSize.md, fontWeight: '500', marginTop: 8 },
  errorText: { fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.full, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});