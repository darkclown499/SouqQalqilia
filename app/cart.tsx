import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState } from '@/components';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCartSummary, clearStoreCart, StoreCartEntry } from '@/stores/cartStore';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const { carts, totalCount } = useCartSummary();

  const grandTotal = carts.reduce((sum, entry) => {
    return sum + Object.values(entry.items).reduce((s, i) => s + i.product.price * i.qty, 0);
  }, 0);

  const keyExtractor = useCallback((item: StoreCartEntry) => item.storeId, []);

  const handleClear = useCallback((entry: StoreCartEntry) => {
    Alert.alert(
      isAr ? 'إفراغ السلة' : 'Clear cart',
      isAr ? `هل تريد إفراغ سلة "${entry.storeName}"؟` : `Clear the cart for "${entry.storeName}"?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? 'إفراغ' : 'Clear', style: 'destructive', onPress: () => clearStoreCart(entry.storeId) },
      ]
    );
  }, [isAr]);

  const renderItem = useCallback(({ item }: { item: StoreCartEntry }) => {
    const itemsArr = Object.values(item.items);
    const qtyTotal = itemsArr.reduce((s, i) => s + i.qty, 0);
    const total = itemsArr.reduce((s, i) => s + i.product.price * i.qty, 0);
    const thumbs = itemsArr.filter(i => i.product.image_url).slice(0, 3);

        return (
      <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
        <Pressable
          style={[styles.cardTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={() => router.push(`/store/${item.storeId}` as any)}
        >
          <View style={styles.logoWrap}>
            {item.storeLogo ? (
              <Image source={{ uri: item.storeLogo }} style={styles.logo} contentFit="cover" />
            ) : (
              <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }]}>
                <MaterialIcons name="storefront" size={24} color={colors.textMuted} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.storeName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {item.storeName}
            </Text>
            <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]}>
              {thumbs.map((t, idx) => (
                <View key={idx} style={[styles.thumbWrap, idx > 0 && { marginStart: -14 }]}>
                  <Image source={{ uri: t.product.image_url! }} style={styles.thumb} contentFit="cover" />
                </View>
              ))}
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {isAr ? `${qtyTotal} منتج` : `${qtyTotal} items`}
              </Text>
            </View>
          </View>

          <Pressable onPress={() => handleClear(item)} hitSlop={10} style={[styles.trashBtn, { backgroundColor: colors.background }]}>
            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
          </Pressable>
        </Pressable>

        <Pressable
          style={[styles.continueBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={() => router.push(`/store/${item.storeId}` as any)}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent || colors.primary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.continueBtnText}>
            {isAr ? 'متابعة الطلب' : 'Continue order'}
          </Text>
          <Text style={styles.continueBtnTotal}>{total.toFixed(2)} ₪</Text>
          <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color="#fff" />
        </Pressable>
      </View>
    );
  }, [colors, isRTL, isAr, router, handleClear]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.borderLight }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: colors.background }]} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={colors.textPrimary} />
          </Pressable>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="shopping-cart" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isAr ? 'سلتي' : 'My Cart'}</Text>
          <View style={{ flex: 1 }} />
          {totalCount > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countText}>{totalCount}</Text>
            </View>
          ) : null}
        </View>

        {carts.length > 0 ? (
          <Text style={[styles.headerSummary, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {isAr
              ? `عندك سلة في ${carts.length} متجر • الإجمالي ${grandTotal.toFixed(2)} ₪`
              : `Items in ${carts.length} store(s) • Total ${grandTotal.toFixed(2)} ₪`}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={carts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="shopping-cart"
              title={isAr ? 'سلتك فاضية' : 'Your cart is empty'}
              subtitle={isAr ? 'أضف منتجات من أي متجر لتظهر هنا' : 'Add products from any store to see them here'}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: 14, borderBottomWidth: 1, gap: 6 },
  headerRow: { alignItems: 'center', gap: 10 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '900' },
  countBadge: {
    borderRadius: 999, minWidth: 24, height: 24, paddingHorizontal: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  headerSummary: { fontSize: 12.5, fontWeight: '600' },
  list: { padding: Spacing.lg, paddingBottom: 36, gap: 14 },
  card: {
    borderRadius: 18, padding: 12, gap: 12,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  cardTop: { alignItems: 'center', gap: 12 },
  logoWrap: { width: 54, height: 54, borderRadius: 14, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  storeName: { fontSize: 15, fontWeight: '800' },
  thumbWrap: {
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
  },
  thumb: { width: '100%', height: '100%' },
  metaText: { fontSize: 12, fontWeight: '600', marginStart: 4 },
  trashBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  continueBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 12, overflow: 'hidden',
  },
  continueBtnText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  continueBtnTotal: { fontSize: 13.5, fontWeight: '900', color: '#fff', opacity: 0.9 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xxl },
});
