import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, Linking, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import { fetchStoreProducts, fetchStoreRating, StoreProduct } from '@/services/productsService';
import { checkStoreIsOpen } from '@/services/storesService';
import { Spacing, FontSize, Radius } from '@/constants/theme';

// ── Cart types ────────────────────────────────────────────────────────────────
interface CartItem { product: StoreProduct; qty: number }
type OrderType = 'delivery' | 'pickup' | 'dine_in';

const ORDER_LABELS: Record<OrderType, { ar: string; en: string; icon: string }> = {
  delivery: { ar: 'توصيل للمنزل', en: 'Delivery', icon: 'delivery-dining' },
  pickup:   { ar: 'استلام من المتجر', en: 'Pickup', icon: 'shopping-bag' },
  dine_in:  { ar: 'تناول في المكان', en: 'Dine-in', icon: 'restaurant' },
};

// ── 2-Column Product Card ─────────────────────────────────────────────────────
function ProductCard({
  product, qty, onAdd, onRemove, isAr, isRTL, colors, disabled,
}: {
  product: StoreProduct; qty: number;
  onAdd: () => void; onRemove: () => void;
  isAr: boolean; isRTL: boolean; colors: any; disabled?: boolean;
}) {
  const name = isAr ? (product.name_ar || product.name) : product.name;
  const desc = isAr ? (product.description_ar || product.description) : product.description;
  const unavailable = disabled || !product.is_available;

  return (
    <View style={[gc.card, { backgroundColor: colors.surface, opacity: unavailable ? 0.55 : 1 }]}>
      {/* Product image */}
      <View style={gc.imgWrap}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={gc.img}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <View style={[gc.imgFallback, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="fastfood" size={32} color={colors.textMuted} />
          </View>
        )}
        {/* Not available tag */}
        {!product.is_available ? (
          <View style={gc.unavailableTag}>
            <Text style={gc.unavailableText}>{isAr ? 'نفذ' : 'N/A'}</Text>
          </View>
        ) : null}
      </View>

      {/* Info */}
      <View style={[gc.body, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[gc.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
          {name}
        </Text>
        {desc ? (
          <Text style={[gc.desc, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
            {desc}
          </Text>
        ) : null}
        {product.category_label_ar || product.category_label ? (
          <View style={[gc.catTag, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[gc.catTagText, { color: colors.primary }]} numberOfLines={1}>
              {isAr ? (product.category_label_ar || product.category_label) : product.category_label}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Price + add button */}
      <View style={[gc.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[gc.price, { color: colors.primary }]}>
          {product.price > 0 ? `${product.price}₪` : (isAr ? 'مجاني' : 'Free')}
        </Text>
        {/* Cart controls */}
        {!unavailable ? (
          qty > 0 ? (
            <View style={[gc.qtyRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable
                style={[gc.qtyBtnMinus, { backgroundColor: colors.error + '18' }]}
                onPress={onRemove} hitSlop={6}
              >
                <MaterialIcons name="remove" size={13} color={colors.error} />
              </Pressable>
              <View style={[gc.qtyBadge, { backgroundColor: colors.primary }]}>
                <Text style={gc.qtyBadgeText}>{qty}</Text>
              </View>
              <Pressable
                style={[gc.addBtn, { backgroundColor: colors.primary }]}
                onPress={onAdd} hitSlop={6}
              >
                <MaterialIcons name="add" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : (
            /* Floating + button */
            <Pressable
              style={[gc.addBtn, { backgroundColor: colors.primary }]}
              onPress={onAdd}
              hitSlop={4}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
            </Pressable>
          )
        ) : (
          <View style={[gc.closedTag, { backgroundColor: '#f3f4f6' }]}>
            <Text style={gc.closedTagText}>{isAr ? 'مغلق' : 'Closed'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Grid product card styles ──────────────────────────────────────────────────
const gc = StyleSheet.create({
  card: {
    flex: 1, borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  imgWrap: { height: 120, backgroundColor: '#f3f4f6', position: 'relative' },
  img: { width: '100%', height: 120 },
  imgFallback: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  unavailableTag: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  unavailableText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { padding: 10, gap: 4, flex: 1 },
  name: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  desc: { fontSize: 11, lineHeight: 15 },
  catTag: {
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', maxWidth: '100%',
  },
  catTagText: { fontSize: 10, fontWeight: '700' },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4,
  },
  price: { fontSize: 14, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qtyBtnMinus: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBadge: {
    minWidth: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  closedTag: {
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  closedTagText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [rating, setRating] = useState({ avg: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<string>('__all__');
  const [isOpen, setIsOpen] = useState(true);

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartVisible, setCartVisible] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'order_type'>('cart');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const cartAnim = useRef(new Animated.Value(0)).current;

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.product.price * i.qty, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const tabs = useMemo(() => {
    const labels = new Set<string>();
    products.forEach(p => {
      const label = isAr ? (p.category_label_ar || p.category_label) : p.category_label;
      if (label) labels.add(label);
    });
    return Array.from(labels);
  }, [products, isAr]);

  const filteredProducts = useMemo(() => {
    if (selectedTab === '__all__') return products;
    return products.filter(p => {
      const label = isAr ? (p.category_label_ar || p.category_label) : p.category_label;
      return label === selectedTab;
    });
  }, [products, selectedTab, isAr]);

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    // Async view increment
    getSupabaseClient()
      .from('stores').select('views_count').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          getSupabaseClient().from('stores')
            .update({ views_count: (data.views_count ?? 0) + 1 })
            .eq('id', id).then(() => {}).catch(() => {});
        }
      }).catch(() => {});

    Promise.all([
      getSupabaseClient().from('stores').select('*').eq('id', id).single(),
      fetchStoreProducts(id),
      fetchStoreRating(id),
    ]).then(([storeRes, productsRes, ratingRes]) => {
      if (storeRes.data) {
        setStore(storeRes.data);
        setIsOpen(checkStoreIsOpen(storeRes.data));
      }
      setProducts(productsRes.data);
      setRating(ratingRes);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!store) return;
    const tick = setInterval(() => setIsOpen(checkStoreIsOpen(store)), 60_000);
    return () => clearInterval(tick);
  }, [store]);

  useEffect(() => {
    if (cartCount > 0) {
      Animated.sequence([
        Animated.timing(cartAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(cartAnim, { toValue: 0, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [cartCount]);

  const addToCart = useCallback((product: StoreProduct) => {
    if (!isOpen) return;
    setCart(prev => {
      const existing = prev[product.id];
      return { ...prev, [product.id]: { product, qty: (existing?.qty ?? 0) + 1 } };
    });
  }, [isOpen]);

  const removeFromCart = useCallback((product: StoreProduct) => {
    setCart(prev => {
      const existing = prev[product.id];
      if (!existing || existing.qty <= 1) {
        const { [product.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [product.id]: { ...existing, qty: existing.qty - 1 } };
    });
  }, []);

  // ── WhatsApp checkout ───────────────────────────────────────────────────────
  const handleConfirmOrder = useCallback(() => {
    if (!store || !isOpen) return;
    getSupabaseClient().from('stores').select('whatsapp_clicks_count').eq('id', store.id).single()
      .then(({ data }) => {
        if (data) {
          getSupabaseClient().from('stores')
            .update({ whatsapp_clicks_count: (data.whatsapp_clicks_count ?? 0) + 1 })
            .eq('id', store.id).then(() => {}).catch(() => {});
        }
      }).catch(() => {});

    const userName = user?.username || user?.email?.split('@')[0] || 'عميل';
    const orderTypeLabel = isAr ? ORDER_LABELS[orderType].ar : ORDER_LABELS[orderType].en;
    const storeName = isAr ? (store.name_ar || store.name) : store.name;

    const lines = [
      isAr ? `🛒 طلب جديد من سوق قلقيلية` : `🛒 New Order from Souq Qalqilya`,
      '',
      isAr ? `👤 الاسم: ${userName}` : `👤 Name: ${userName}`,
      isAr ? `📋 نوع الطلب: ${orderTypeLabel}` : `📋 Order type: ${orderTypeLabel}`,
      isAr ? `🏪 المتجر: ${storeName}` : `🏪 Store: ${storeName}`,
      '',
      isAr ? '📝 المنتجات:' : '📝 Items:',
      ...cartItems.map(({ product, qty }) => {
        const pName = isAr ? (product.name_ar || product.name) : product.name;
        return `  • ${pName} × ${qty} = ${(product.price * qty).toFixed(2)}₪`;
      }),
      '',
      isAr ? `💰 المجموع: ${cartTotal.toFixed(2)}₪` : `💰 Total: ${cartTotal.toFixed(2)}₪`,
      '',
      isAr ? 'شكراً لطلبكم! 🙏' : 'Thank you for your order! 🙏',
    ];
    const message = encodeURIComponent(lines.join('\n'));
    const phone = (store.whatsapp || store.phone || '').replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${phone}?text=${message}`).catch(() => {});
    setCartVisible(false);
    setCart({});
    setCheckoutStep('cart');
  }, [store, user, orderType, cartItems, cartTotal, isAr, isOpen]);

  if (loading) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!store) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="store" size={44} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{isAr ? 'المتجر غير موجود' : 'Store not found'}</Text>
      </View>
    );
  }

  const storeName = isAr ? (store.name_ar || store.name) : store.name;
  const storeDesc = isAr ? (store.description_ar || store.description) : store.description;
  const cartBtnScale = cartAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.22, 1] });
  const hoursLabel = store.opening_time && store.closing_time
    ? `${store.opening_time} – ${store.closing_time}`
    : null;

  const COLUMN_GAP = 10;
  const HORIZONTAL_PAD = 16;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredProducts}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: COLUMN_GAP, paddingHorizontal: HORIZONTAL_PAD }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartCount > 0 && isOpen ? 110 : 40 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            qty={cart[item.id]?.qty ?? 0}
            onAdd={() => addToCart(item)}
            onRemove={() => removeFromCart(item)}
            isAr={isAr}
            isRTL={isRTL}
            colors={colors}
            disabled={!isOpen}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: COLUMN_GAP }} />}
        ListHeaderComponent={
          <View>
            {/* ── BANNER HEADER ── */}
            <View style={s.bannerWrap}>
              {store.banner_url ? (
                <Image source={{ uri: store.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              ) : store.logo_url ? (
                <Image source={{ uri: store.logo_url }} style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} contentFit="cover" transition={200} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} />
              )}
              <View style={s.bannerOverlay} />
              {/* Closed overlay */}
              {!isOpen ? (
                <View style={s.closedBanner}>
                  <View style={s.closedPill}>
                    <Text style={s.closedPillText}>مغلق حالياً 🔴</Text>
                  </View>
                </View>
              ) : null}
              {/* Back button */}
              <Pressable
                style={[s.backBtn, { marginTop: insets.top + 8 }]}
                onPress={() => router.back()}
                hitSlop={8}
              >
                <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={22} color="#fff" />
              </Pressable>
            </View>

            {/* ── OVERLAPPING INFO CARD (Talabat-style) ── */}
            <View style={[s.infoCard, { backgroundColor: colors.surface }]}>
              {/* Centered circular logo */}
              <View style={s.logoCircleWrap}>
                <View style={[s.logoCircle, {
                  borderColor: isOpen ? '#22c55e' : '#9ca3af',
                  backgroundColor: colors.surfaceTint,
                  opacity: isOpen ? 1 : 0.6,
                }]}>
                  {store.logo_url ? (
                    <Image source={{ uri: store.logo_url }} style={s.logoImg} contentFit="cover" transition={200} />
                  ) : (
                    <MaterialIcons name="storefront" size={34} color={colors.primary} />
                  )}
                </View>
              </View>

              {/* Store name centered */}
              <Text style={[s.storeName, { color: colors.textPrimary }]}>{storeName}</Text>

              {/* Address */}
              {store.address ? (
                <View style={[s.centerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <MaterialIcons name="location-on" size={13} color={colors.textMuted} />
                  <Text style={[s.addrText, { color: colors.textMuted }]}>{store.address}</Text>
                </View>
              ) : null}

              {/* Horizontal stats row */}
              <View style={[s.statsRow, { borderTopColor: colors.borderLight }]}>
                {/* Rating */}
                <View style={s.statItem}>
                  <Text style={s.statEmoji}>⭐</Text>
                  <Text style={[s.statNum, { color: colors.textPrimary }]}>
                    {rating.avg > 0 ? rating.avg.toFixed(1) : '—'}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>
                    {isAr ? 'التقييم' : 'Rating'}
                  </Text>
                </View>
                <View style={[s.statDivider, { backgroundColor: colors.borderLight }]} />
                {/* Hours */}
                <View style={s.statItem}>
                  <Text style={s.statEmoji}>⏰</Text>
                  <Text style={[s.statNum, { color: colors.textPrimary }]}>
                    {hoursLabel ?? '—'}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>
                    {isAr ? 'أوقات العمل' : 'Hours'}
                  </Text>
                </View>
                <View style={[s.statDivider, { backgroundColor: colors.borderLight }]} />
                {/* Live status */}
                <View style={s.statItem}>
                  <Text style={s.statEmoji}>{isOpen ? '🟢' : '🔴'}</Text>
                  <Text style={[s.statNum, { color: isOpen ? '#16a34a' : '#ef4444', fontWeight: '800' }]}>
                    {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>
                    {isAr ? 'الحالة' : 'Status'}
                  </Text>
                </View>
              </View>

              {/* Description */}
              {storeDesc ? (
                <Text style={[s.storeDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {storeDesc}
                </Text>
              ) : null}
            </View>

            {/* ── CATEGORY TABS ── */}
            {tabs.length > 0 ? (
              <View style={[s.tabsOuter, { borderBottomColor: colors.borderLight }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[s.tabsContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                >
                  <Pressable
                    style={[s.tab, selectedTab === '__all__' ? [s.tabActive, { borderColor: colors.primary }] : { borderColor: 'transparent' }]}
                    onPress={() => setSelectedTab('__all__')}
                  >
                    <Text style={[s.tabText, { color: selectedTab === '__all__' ? colors.primary : colors.textSecondary, fontWeight: selectedTab === '__all__' ? '700' : '500' }]}>
                      {isAr ? 'الكل' : 'All'}
                    </Text>
                  </Pressable>
                  {tabs.map(tab => (
                    <Pressable
                      key={tab}
                      style={[s.tab, selectedTab === tab ? [s.tabActive, { borderColor: colors.primary }] : { borderColor: 'transparent' }]}
                      onPress={() => setSelectedTab(tab)}
                    >
                      <Text style={[s.tabText, { color: selectedTab === tab ? colors.primary : colors.textSecondary, fontWeight: selectedTab === tab ? '700' : '500' }]}>
                        {tab}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Padding before grid */}
            <View style={{ height: 14 }} />
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <MaterialIcons name="fastfood" size={44} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>
              {isAr ? 'لا توجد منتجات بعد' : 'No products yet'}
            </Text>
          </View>
        }
      />

      {/* ── FLOATING CART BUTTON ── */}
      {cartCount > 0 && isOpen ? (
        <Animated.View style={[s.cartFab, { transform: [{ scale: cartBtnScale }] }]}>
          <Pressable
            style={[s.cartFabInner, { backgroundColor: colors.primary }]}
            onPress={() => { setCartVisible(true); setCheckoutStep('cart'); }}
          >
            <View style={s.cartCountBadge}>
              <Text style={s.cartCountText}>{cartCount}</Text>
            </View>
            <Text style={s.cartFabText}>
              {isAr ? 'عرض العربة' : 'View Cart'}
            </Text>
            <Text style={s.cartFabTotal}>{cartTotal.toFixed(2)}₪</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* ── CART / CHECKOUT MODAL ── */}
      <Modal visible={cartVisible} animationType="slide" transparent onRequestClose={() => setCartVisible(false)}>
        <View style={m.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCartVisible(false)} />
          <View style={[m.sheet, { backgroundColor: colors.surface }]}>
            <View style={[m.handle, { backgroundColor: colors.border }]} />

            {checkoutStep === 'cart' ? (
              <>
                <View style={[m.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
                  <MaterialIcons name="shopping-cart" size={22} color={colors.primary} />
                  <Text style={[m.titleText, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isAr ? 'عربة التسوق' : 'Cart'}
                  </Text>
                  <Pressable onPress={() => setCartVisible(false)} hitSlop={10}>
                    <MaterialIcons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={m.cartItems}>
                  {cartItems.map(({ product, qty }) => {
                    const pName = isAr ? (product.name_ar || product.name) : product.name;
                    return (
                      <View key={product.id} style={[m.cartItem, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
                        {product.image_url ? (
                          <Image source={{ uri: product.image_url }} style={m.cartThumb} contentFit="cover" transition={200} />
                        ) : (
                          <View style={[m.cartThumb, { backgroundColor: colors.surfaceTint, alignItems: 'center', justifyContent: 'center' }]}>
                            <MaterialIcons name="fastfood" size={16} color={colors.textMuted} />
                          </View>
                        )}
                        <Text style={[m.cartItemName, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                          {pName}
                        </Text>
                        <View style={[m.cartItemQty, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <Pressable onPress={() => removeFromCart(product)} hitSlop={8} style={[m.qtyBtnSm, { borderColor: colors.border }]}>
                            <MaterialIcons name="remove" size={13} color={colors.textMuted} />
                          </Pressable>
                          <Text style={[m.qtyNum, { color: colors.textPrimary }]}>{qty}</Text>
                          <Pressable onPress={() => addToCart(product)} hitSlop={8} style={[m.qtyBtnSm, { borderColor: colors.border }]}>
                            <MaterialIcons name="add" size={13} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={[m.cartItemPrice, { color: colors.primary }]}>
                          {(product.price * qty).toFixed(2)}₪
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={[m.totalRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderTopColor: colors.borderLight }]}>
                  <Text style={[m.totalLabel, { color: colors.textSecondary }]}>{isAr ? 'المجموع' : 'Total'}</Text>
                  <Text style={[m.totalPrice, { color: colors.primary }]}>{cartTotal.toFixed(2)}₪</Text>
                </View>
                <Pressable
                  style={[m.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setCheckoutStep('order_type')}
                >
                  <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                  <Text style={m.primaryBtnText}>{isAr ? 'متابعة الطلب' : 'Continue'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={[m.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
                  <Pressable onPress={() => setCheckoutStep('cart')} hitSlop={10}>
                    <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={22} color={colors.textMuted} />
                  </Pressable>
                  <Text style={[m.titleText, { color: colors.textPrimary, flex: 1, textAlign: 'center' }]}>
                    {isAr ? 'نوع الطلب' : 'Order Type'}
                  </Text>
                  <Pressable onPress={() => setCartVisible(false)} hitSlop={10}>
                    <MaterialIcons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={m.orderTypeList}>
                  {(Object.keys(ORDER_LABELS) as OrderType[]).map(type => {
                    const info = ORDER_LABELS[type];
                    const isSelected = orderType === type;
                    return (
                      <Pressable
                        key={type}
                        style={[m.orderTypeItem, {
                          backgroundColor: isSelected ? colors.primaryGhost : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                          flexDirection: isRTL ? 'row-reverse' : 'row',
                        }]}
                        onPress={() => setOrderType(type)}
                      >
                        <View style={[m.orderTypeIcon, { backgroundColor: isSelected ? colors.primary : colors.surfaceTint }]}>
                          <MaterialIcons name={info.icon as any} size={22} color={isSelected ? '#fff' : colors.textMuted} />
                        </View>
                        <Text style={[m.orderTypeLabel, { color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? '700' : '500' }]}>
                          {isAr ? info.ar : info.en}
                        </Text>
                        {isSelected ? <MaterialIcons name="check-circle" size={20} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={[m.primaryBtn, {
                    backgroundColor: isOpen ? '#16a34a' : '#9ca3af',
                    opacity: isOpen ? 1 : 0.7,
                  }]}
                  onPress={isOpen ? handleConfirmOrder : undefined}
                  disabled={!isOpen}
                >
                  <MaterialIcons name={isOpen ? 'chat' : 'block'} size={18} color="#fff" />
                  <Text style={m.primaryBtnText}>
                    {isOpen
                      ? (isAr ? 'تأكيد عبر واتساب' : 'Confirm via WhatsApp')
                      : (isAr ? 'المتجر مغلق حالياً' : 'Store is Closed')}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  // Banner
  bannerWrap: { height: 200, backgroundColor: '#1B5E20', position: 'relative' },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  closedBanner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedPill: {
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  closedPillText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  backBtn: {
    position: 'absolute', left: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Overlapping card
  infoCard: {
    marginTop: -40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  logoCircleWrap: {
    alignItems: 'center',
    marginTop: -40,
    marginBottom: 10,
  },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  logoImg: { width: 80, height: 80 },
  storeName: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4, lineHeight: 28 },
  centerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 },
  addrText: { fontSize: 13, textAlign: 'center' },

  // Stats row
  statsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, marginTop: 14, paddingTop: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statEmoji: { fontSize: 18 },
  statNum: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  statLabel: { fontSize: 11, textAlign: 'center' },
  statDivider: { width: 1, height: 48, alignSelf: 'center' },

  storeDesc: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10 },

  // Category tabs
  tabsOuter: { borderBottomWidth: 1, marginHorizontal: 0 },
  tabsContent: { paddingHorizontal: 16, gap: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2 },
  tabActive: {},
  tabText: { fontSize: FontSize.sm },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 40, gap: 12, paddingHorizontal: 16 },
  emptyText: { fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },

  // Floating cart button
  cartFab: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  cartFabInner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingVertical: 15, paddingHorizontal: 18, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 14, elevation: 12,
  },
  cartCountBadge: {
    minWidth: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  cartCountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cartFabText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  cartFabTotal: {
    color: '#fff', fontSize: FontSize.md, fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden',
  },
});

// ── Modal styles ──────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 48, maxHeight: '82%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, marginBottom: 4,
  },
  titleText: { fontSize: FontSize.lg, fontWeight: '700' },
  cartItems: { paddingHorizontal: Spacing.lg, paddingBottom: 8 },
  cartItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  cartThumb: { width: 40, height: 40, borderRadius: 8, flexShrink: 0 },
  cartItemName: { fontSize: FontSize.sm, fontWeight: '600', lineHeight: 18 },
  cartItemQty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtnSm: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  qtyNum: { fontSize: FontSize.sm, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  cartItemPrice: { fontSize: FontSize.sm, fontWeight: '800', minWidth: 55, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1,
  },
  totalLabel: { fontSize: FontSize.md, fontWeight: '600' },
  totalPrice: { fontSize: FontSize.xl, fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    height: 52, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  orderTypeList: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  orderTypeItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: 14, borderWidth: 1.5, padding: Spacing.md,
  },
  orderTypeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { flex: 1, fontSize: FontSize.md },
});
