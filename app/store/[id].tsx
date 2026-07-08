import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, Linking, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import { fetchStoreProducts, fetchStoreRating, StoreProduct } from '@/services/productsService';
import { checkStoreIsOpen } from '@/services/storesService';
import { Spacing, FontSize, Radius } from '@/constants/theme';

// ── Cart types ────────────────────────────────────────────────────────────────
interface CartItem {
  product: StoreProduct;
  qty: number;
}

type OrderType = 'delivery' | 'pickup' | 'dine_in';

const ORDER_LABELS: Record<OrderType, { ar: string; en: string; icon: string }> = {
  delivery: { ar: 'توصيل للمنزل', en: 'Delivery', icon: 'delivery-dining' },
  pickup: { ar: 'استلام من المتجر', en: 'Pickup', icon: 'shopping-bag' },
  dine_in: { ar: 'تناول في المكان', en: 'Dine-in', icon: 'restaurant' },
};

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({
  product, qty, onAdd, onRemove, isAr, isRTL, colors, disabled,
}: {
  product: StoreProduct; qty: number;
  onAdd: () => void; onRemove: () => void;
  isAr: boolean; isRTL: boolean; colors: any; disabled?: boolean;
}) {
  const name = isAr ? (product.name_ar || product.name) : product.name;
  const desc = isAr ? (product.description_ar || product.description) : product.description;

  return (
    <View style={[pc.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.55 : 1 }]}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={pc.img} contentFit="cover" transition={200} cachePolicy="disk" />
      ) : (
        <View style={[pc.imgPh, { backgroundColor: colors.surfaceTint }]}>
          <MaterialIcons name="fastfood" size={28} color={colors.textMuted} />
        </View>
      )}
      <View style={[pc.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[pc.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
          {name}
        </Text>
        {desc ? (
          <Text style={[pc.desc, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
        <View style={[pc.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[pc.price, { color: colors.primary }]}>
            {product.price > 0 ? `${product.price}₪` : (isAr ? 'مجاني' : 'Free')}
          </Text>
          {/* Qty controls — hidden when store is closed */}
          {!disabled ? (
            <View style={[pc.qtyRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {qty > 0 ? (
                <>
                  <Pressable style={[pc.qtyBtn, { backgroundColor: colors.error + '18', borderColor: colors.error + '44' }]} onPress={onRemove} hitSlop={6}>
                    <MaterialIcons name="remove" size={14} color={colors.error} />
                  </Pressable>
                  <View style={[pc.qtyBadge, { backgroundColor: colors.primary }]}>
                    <Text style={pc.qtyBadgeText}>{qty}</Text>
                  </View>
                </>
              ) : null}
              <Pressable style={[pc.qtyBtn, { backgroundColor: colors.primary }]} onPress={onAdd} hitSlop={6}>
                <MaterialIcons name="add" size={14} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View style={[pc.closedTag, { backgroundColor: '#f3f4f6' }]}>
              <Text style={pc.closedTagText}>{isAr ? 'مغلق' : 'Closed'}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

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
  // Live open/closed status — re-evaluated every 60 seconds
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

  // ── Tabs (product categories) ───────────────────────────────────────────────
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

  // ── Load data + track view ────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    // Fire view increment asynchronously — never blocks UI
    getSupabaseClient().rpc('increment_store_views', { store_id: id }).catch(() => {});

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

  // Re-check live status every 60 seconds
  useEffect(() => {
    if (!store) return;
    const tick = setInterval(() => setIsOpen(checkStoreIsOpen(store)), 60_000);
    return () => clearInterval(tick);
  }, [store]);

  // Animate cart button when cart changes
  useEffect(() => {
    if (cartCount > 0) {
      Animated.sequence([
        Animated.timing(cartAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(cartAnim, { toValue: 0, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [cartCount]);

  const addToCart = useCallback((product: StoreProduct) => {
    if (!isOpen) return; // blocked when store is closed
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
    // Track WhatsApp click asynchronously
    getSupabaseClient().rpc('increment_store_whatsapp_clicks', { store_id: store.id }).catch(() => {});
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
        const lineTotal = (product.price * qty).toFixed(2);
        return `  • ${pName} × ${qty} = ${lineTotal}₪`;
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

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── BANNER HEADER ── */}
      <View style={s.bannerWrap}>
        {store.banner_url ? (
          <Image source={{ uri: store.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : store.logo_url ? (
          <Image source={{ uri: store.logo_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} />
        )}
        <View style={s.bannerOverlay} />
        {/* Closed banner overlay */}
        {!isOpen ? (
          <View style={s.closedBannerOverlay}>
            <View style={s.closedPill}>
              <Text style={s.closedPillText}>مغلق حالياً 🔴</Text>
            </View>
          </View>
        ) : null}
        <Pressable
          style={[s.backBtn, { marginTop: insets.top + 8, backgroundColor: 'rgba(0,0,0,0.38)' }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={22} color="#fff" />
        </Pressable>
      </View>

      {/* ── STORE INFO CARD ── */}
      <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Circular logo with live-status border */}
        <View style={[
          s.logoCircle,
          {
            borderColor: isOpen ? '#22c55e' : '#9ca3af',
            backgroundColor: colors.surfaceTint,
            opacity: isOpen ? 1 : 0.5,
          },
        ]}>
          {store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={s.logoImg} contentFit="cover" transition={200} />
          ) : (
            <MaterialIcons name="storefront" size={32} color={colors.primary} />
          )}
        </View>
        <View style={[s.infoBody, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[s.storeName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {storeName}
          </Text>
          {store.address ? (
            <View style={[s.addrRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="location-on" size={13} color={colors.textMuted} />
              <Text style={[s.addrText, { color: colors.textMuted }]}>{store.address}</Text>
            </View>
          ) : null}
          {/* Star rating */}
          <View style={[s.ratingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={s.starIcon}>⭐</Text>
            <Text style={[s.ratingNum, { color: colors.textPrimary }]}>
              {rating.avg > 0 ? rating.avg.toFixed(1) : (isAr ? 'لا تقييمات' : 'No ratings')}
            </Text>
            {rating.count > 0 ? (
              <Text style={[s.ratingCount, { color: colors.textMuted }]}>
                ({rating.count} {isAr ? 'مراجعة' : 'reviews'})
              </Text>
            ) : null}
          </View>
          {/* Live status + hours */}
          <View style={[s.statusRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[s.statusDot, { backgroundColor: isOpen ? '#22c55e' : '#9ca3af' }]} />
            <Text style={[s.statusText, { color: isOpen ? '#16a34a' : '#6b7280' }]}>
              {isOpen ? (isAr ? 'مفتوح الآن' : 'Open Now') : (isAr ? 'مغلق حالياً' : 'Closed Now')}
            </Text>
            {hoursLabel ? (
              <Text style={[s.hoursText, { color: colors.textMuted }]}>· {hoursLabel}</Text>
            ) : null}
          </View>
          {storeDesc ? (
            <Text style={[s.storeDesc, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
              {storeDesc}
            </Text>
          ) : null}
        </View>
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

      {/* ── PRODUCT LIST ── */}
      <FlatList
        data={filteredProducts}
        keyExtractor={item => item.id}
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
        contentContainerStyle={[s.listContent, { paddingBottom: cartCount > 0 && isOpen ? 100 : 32 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <MaterialIcons name="fastfood" size={44} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>
              {isAr ? 'لا توجد منتجات بعد' : 'No products yet'}
            </Text>
          </View>
        }
      />

      {/* ── FLOATING CART BUTTON (hidden when closed) ── */}
      {cartCount > 0 && isOpen ? (
        <Animated.View style={[s.cartFab, { transform: [{ scale: cartBtnScale }] }]}>
          <Pressable
            style={[s.cartFabInner, { backgroundColor: colors.primary }]}
            onPress={() => { setCartVisible(true); setCheckoutStep('cart'); }}
          >
            <MaterialIcons name="shopping-cart" size={22} color="#fff" />
            <Text style={s.cartFabText}>
              {isAr ? 'عربة التسوق' : 'Cart'} · {cartCount}
            </Text>
            <View style={s.cartFabTotal}>
              <Text style={s.cartFabTotalText}>{cartTotal.toFixed(2)}₪</Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* ── CART / CHECKOUT MODAL ── */}
      <Modal
        visible={cartVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCartVisible(false)}
      >
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
                  <Text style={[m.totalLabel, { color: colors.textSecondary }]}>
                    {isAr ? 'المجموع' : 'Total'}
                  </Text>
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

                {/* WhatsApp confirm — disabled when closed */}
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

// ── Product card styles ───────────────────────────────────────────────────────
const pc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden',
    padding: Spacing.md,
  },
  img: { width: 80, height: 80, borderRadius: Radius.lg, flexShrink: 0 },
  imgPh: {
    width: 80, height: 80, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: FontSize.md, fontWeight: '700', lineHeight: 20 },
  desc: { fontSize: FontSize.xs, lineHeight: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontSize: FontSize.md, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  qtyBadge: {
    minWidth: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  closedTag: {
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  closedTagText: { fontSize: FontSize.xs, fontWeight: '700', color: '#6b7280' },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  bannerWrap: { height: 210, backgroundColor: '#1B5E20', position: 'relative' },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  closedBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedPill: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: Radius.full,
    paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  closedPillText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },

  backBtn: {
    position: 'absolute', left: 16, width: 38, height: 38,
    borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },

  infoCard: {
    marginHorizontal: Spacing.lg, marginTop: -36,
    borderRadius: Radius.xl, borderWidth: 1,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'flex-start',
    gap: Spacing.md, zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  logoCircle: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 3, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: -20,
  },
  logoImg: { width: 68, height: 68 },
  infoBody: { flex: 1, gap: 4, paddingTop: 4 },
  storeName: { fontSize: FontSize.lg, fontWeight: '800', lineHeight: 22 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addrText: { fontSize: FontSize.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  starIcon: { fontSize: 13 },
  ratingNum: { fontSize: FontSize.sm, fontWeight: '700' },
  ratingCount: { fontSize: FontSize.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  hoursText: { fontSize: FontSize.xs },
  storeDesc: { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },

  tabsOuter: { borderBottomWidth: 1, marginTop: Spacing.md },
  tabsContent: { paddingHorizontal: Spacing.lg, gap: 2 },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 2 },
  tabActive: {},
  tabText: { fontSize: FontSize.sm },

  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: FontSize.md, fontWeight: '600' },

  cartFab: { position: 'absolute', bottom: 24, left: Spacing.lg, right: Spacing.lg },
  cartFabInner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: Spacing.lg, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 14, elevation: 12,
  },
  cartFabText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  cartFabTotal: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  cartFabTotalText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
});

// ── Modal styles ──────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 48, maxHeight: '80%',
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
    height: 52, borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  orderTypeList: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  orderTypeItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md,
  },
  orderTypeIcon: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  orderTypeLabel: { flex: 1, fontSize: FontSize.md },
});
