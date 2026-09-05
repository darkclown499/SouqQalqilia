import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { EmptyState } from '@/components';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useOrderHistory, OrderHistoryEntry } from '@/stores/orderHistoryStore';

function formatDate(ts: number, isAr: boolean): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return (isAr ? 'اليوم • ' : 'Today • ') + time;
  return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short' }) + ' • ' + time;
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const orders = useOrderHistory();

  const keyExtractor = useCallback((item: OrderHistoryEntry) => item.id, []);

  const renderItem = useCallback(({ item }: { item: OrderHistoryEntry }) => {
    const preview = item.items.slice(0, 2).map(i => `${i.name} ×${i.qty}`).join('، ');
    const extra = item.items.length > 2 ? (isAr ? ` +${item.items.length - 2}` : ` +${item.items.length - 2}`) : '';
    const isDelivery = item.orderType === 'delivery';

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, shadowColor: '#000' }]}
        onPress={() => router.push(`/store/${item.storeId}` as any)}
      >
        <View style={[styles.accentStripe, { backgroundColor: isDelivery ? '#F59E0B' : colors.primary }]} />

        <View style={[styles.cardRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.logoWrap}>
            {item.storeLogo ? (
              <Image source={{ uri: item.storeLogo }} style={styles.logo} contentFit="cover" />
            ) : (
              <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }]}>
                <MaterialIcons name="storefront" size={22} color={colors.textMuted} />
              </View>
            )}
          </View>

          <View style={{ flex: 1, gap: 3 }}>
            <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]}>
              <Text style={[styles.storeName, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.storeName}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: isDelivery ? '#FEF3C7' : colors.primaryGhost }]}>
                <MaterialIcons
                  name={isDelivery ? 'delivery-dining' : 'shopping-bag'}
                  size={11}
                  color={isDelivery ? '#D97706' : colors.primary}
                />
                <Text style={[styles.typeBadgeText, { color: isDelivery ? '#D97706' : colors.primary }]}>
                  {isDelivery ? (isAr ? 'توصيل' : 'Delivery') : (isAr ? 'استلام' : 'Pickup')}
                </Text>
              </View>
            </View>
            <Text style={[styles.previewText, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {preview}{extra}
            </Text>
            <Text style={[styles.dateText, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
              {formatDate(item.createdAt, isAr)}
            </Text>
          </View>

          <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', gap: 2 }}>
            <Text style={[styles.totalText, { color: colors.primary }]}>{item.total.toFixed(2)} ₪</Text>
            <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={16} color={colors.textMuted} />
          </View>
        </View>
      </Pressable>
    );
  }, [colors, isRTL, isAr, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.borderLight }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: colors.background }]} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={colors.textPrimary} />
          </Pressable>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isAr ? 'طلباتي' : 'My Orders'}</Text>
          <View style={{ flex: 1 }} />
          {orders.length > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countText}>{orders.length}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="receipt-long"
              title={isAr ? 'لا توجد طلبات سابقة' : 'No past orders'}
              subtitle={isAr ? 'طلباتك المؤكدة عبر واتساب رح تظهر هون' : 'Orders you confirm via WhatsApp will show up here'}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
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
  list: { padding: Spacing.lg, paddingBottom: 36, gap: 12 },
  card: {
    borderRadius: 16, padding: 12, overflow: 'hidden',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accentStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardRow: { alignItems: 'center', gap: 10 },
  logoWrap: { width: 46, height: 46, borderRadius: 12, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  storeName: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  dateText: { fontSize: 11, marginTop: 1 },
  previewText: { fontSize: 12, marginTop: 1 },
  totalText: { fontSize: 14, fontWeight: '900' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xxl },
});
