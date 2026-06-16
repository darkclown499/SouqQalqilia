import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { AdCard, EmptyState, Header } from '@/components';
import { useAds } from '@/hooks/useAds';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { fetchStoresByCategory, Store } from '@/services/storesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useResponsive } from '@/hooks/useResponsive';

export default function CategoryScreen() {
  const { categoryId, name } = useLocalSearchParams<{ categoryId: string; name: string }>();
  const { ads, loading, load } = useAds();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const { numColumns, hPad, cardGap, cardWidth: CARD_WIDTH } = useResponsive();
  const isAr = language === 'ar';

  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => { if (categoryId) load({ categoryId }); }, [categoryId, load]);

  useEffect(() => {
    if (!categoryId) return;
    fetchStoresByCategory(categoryId).then(({ data }) => setStores(data));
  }, [categoryId]);

  const renderAd = useCallback(({ item }: any) => (
    <View style={styles.adWrapper}>
      <AdCard
        ad={item}
        width={CARD_WIDTH}
        isFavorited={favIds.has(item.id)}
        onFavoritePress={user ? toggleFav : undefined}
      />
    </View>
  ), [favIds, user, toggleFav, CARD_WIDTH]);

  const StoresSection = stores.length > 0 ? (
    <View style={[styles.storesSection, { backgroundColor: colors.surface }]}>
      <View style={[styles.storesHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.storesIconWrap, { backgroundColor: colors.primaryGhost }]}>
          <Text style={styles.storesIcon}>🏪</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.storesTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {isAr ? 'متاجر هذا القسم' : 'Stores in This Category'}
          </Text>
          <Text style={[styles.storesSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {isAr ? `${stores.length} متجر` : `${stores.length} store${stores.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.storesList, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {stores.map(store => (
          <Pressable
            key={store.id}
            style={({ pressed }) => [styles.storeCard, { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.85 : 1, ...Shadow.xs }]}
            onPress={() => {
              const wa = store.whatsapp || store.phone;
              if (wa) Linking.openURL(`https://wa.me/${wa.replace(/[^0-9]/g, '')}`).catch(() => {});
            }}
          >
            {store.logo_url ? (
              <Image source={{ uri: store.logo_url }} style={styles.storeLogo} contentFit="cover" transition={200} cachePolicy="disk" />
            ) : (
              <View style={[styles.storeLogoPlaceholder, { backgroundColor: colors.primaryGhost }]}>
                <Text style={styles.storeLogoEmoji}>🏪</Text>
              </View>
            )}
            <Text style={[styles.storeName, { color: colors.textPrimary }]} numberOfLines={2}>
              {isAr && store.name_ar ? store.name_ar : store.name}
            </Text>
            {store.address ? (
              <Text style={[styles.storeAddr, { color: colors.textMuted }]} numberOfLines={1}>{store.address}</Text>
            ) : null}
            {(store.whatsapp || store.phone) ? (
              <View style={[styles.storeWaBtn, { backgroundColor: '#25D36618' }]}>
                <Text style={styles.storeWaEmoji}>💬</Text>
                <Text style={[styles.storeWaText, { color: '#25D366' }]}>{isAr ? 'واتساب' : 'WhatsApp'}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={decodeURIComponent(name ?? t.browseCategories)} showBack />
      <FlatList
        data={ads}
        keyExtractor={item => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderAd}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: hPad }]}
        columnWrapperStyle={numColumns > 1 ? { gap: cardGap, marginBottom: cardGap } : undefined}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => categoryId && load({ categoryId })}
        ListHeaderComponent={StoresSection}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="search-off"
              title={t.noListingsInCategory}
              subtitle={t.noListingsInCategorySub}
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: Spacing.lg, paddingBottom: 24 },
  adWrapper: { flex: 1 },

  // Stores section
  storesSection: { marginBottom: Spacing.md, paddingVertical: Spacing.md },
  storesHeader: {
    alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  storesIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  storesIcon: { fontSize: 22 },
  storesTitle: { fontSize: FontSize.md, fontWeight: '700' },
  storesSub: { fontSize: FontSize.xs, marginTop: 2 },
  storesList: { paddingHorizontal: Spacing.lg, gap: Spacing.md, alignItems: 'flex-start' },
  storeCard: {
    width: 130, borderRadius: Radius.xl, borderWidth: 1.5,
    padding: Spacing.md, alignItems: 'center', gap: 6,
  },
  storeLogo: { width: 56, height: 56, borderRadius: 28 },
  storeLogoPlaceholder: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  storeLogoEmoji: { fontSize: 26 },
  storeName: { fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  storeAddr: { fontSize: 10, textAlign: 'center' },
  storeWaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  storeWaEmoji: { fontSize: 12 },
  storeWaText: { fontSize: 11, fontWeight: '700' },
});
