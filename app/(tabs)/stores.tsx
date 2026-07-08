import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Linking, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCategories } from '@/hooks/useCategories';
import { fetchStoresByCategory, Store } from '@/services/storesService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { categories } = useCategories();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);

  const isAr = language === 'ar';

  // Auto-select first category when categories load
  useEffect(() => {
    if (categories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setLoading(true);
    fetchStoresByCategory(selectedCategoryId)
      .then(({ data }) => setStores(data))
      .finally(() => setLoading(false));
  }, [selectedCategoryId]);

  const handleWhatsApp = useCallback((phone: string) => {
    const clean = phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${clean}`).catch(() => {});
  }, []);

  const handleCall = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  }, []);

  const renderStore = useCallback(({ item }: { item: Store }) => {
    const name = isAr ? (item.name_ar || item.name) : item.name;
    const desc = isAr ? (item.description_ar || item.description) : item.description;

    return (
      <View style={[s.storeCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]}>
        <View style={[s.storeCardInner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Logo */}
          <View style={[s.logoWrap, { backgroundColor: colors.surfaceTint }]}>
            {item.logo_url ? (
              <Image
                source={{ uri: item.logo_url }}
                style={s.logo}
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
              />
            ) : (
              <MaterialIcons name="storefront" size={30} color={colors.primary} />
            )}
          </View>

          {/* Info */}
          <View style={[s.storeInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[s.storeName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {name}
            </Text>
            {item.address ? (
              <View style={[s.addressRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="location-on" size={12} color={colors.textMuted} />
                <Text style={[s.addressText, { color: colors.textMuted }]} numberOfLines={1}>{item.address}</Text>
              </View>
            ) : null}
            {desc ? (
              <Text style={[s.storeDesc, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                {desc}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Actions */}
        {(item.phone || item.whatsapp) ? (
          <View style={[s.actionRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderTopColor: colors.borderLight }]}>
            {item.phone ? (
              <Pressable
                style={({ pressed }) => [s.actionBtn, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border }]}
                onPress={() => handleCall(item.phone)}
              >
                <MaterialIcons name="phone" size={15} color={colors.primary} />
                <Text style={[s.actionBtnText, { color: colors.primary }]}>{isAr ? 'اتصال' : 'Call'}</Text>
              </Pressable>
            ) : null}
            {item.whatsapp ? (
              <Pressable
                style={({ pressed }) => [s.actionBtn, { backgroundColor: pressed ? '#dcfce7' : '#f0fdf4', borderColor: '#86efac' }]}
                onPress={() => handleWhatsApp(item.whatsapp)}
              >
                <MaterialIcons name="chat" size={15} color="#16a34a" />
                <Text style={[s.actionBtnText, { color: '#16a34a' }]}>WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }, [colors, isRTL, isAr, handleCall, handleWhatsApp]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
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
    </View>
  );
}

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
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerIconWrap: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitles: { flex: 1 },
  headerSub: {
    fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 2,
  },
  headerTitle: {
    fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4,
  },
  catBar: {
    gap: Spacing.sm,
    paddingBottom: 4,
    alignItems: 'center',
    flexDirection: 'row',
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  catChipText: { fontSize: FontSize.xs },

  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionLabelText: {
    fontSize: FontSize.md, fontWeight: '700', flex: 1,
  },
  sectionCount: {
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },
  sectionCountText: { fontSize: FontSize.xs, fontWeight: '700' },

  listContent: { paddingTop: Spacing.md },

  storeCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  storeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  logoWrap: {
    width: 64, height: 64, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  logo: { width: 64, height: 64 },
  storeInfo: { flex: 1, gap: 4 },
  storeName: { fontSize: FontSize.md, fontWeight: '700', lineHeight: 20 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addressText: { fontSize: FontSize.xs },
  storeDesc: { fontSize: FontSize.xs, lineHeight: 17 },

  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1,
  },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '700' },

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
