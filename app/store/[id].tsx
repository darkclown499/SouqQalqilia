import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Modal, Linking, Platform, Share, TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import Animated from 'react-native-reanimated';
import { useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { fetchStoreProducts, fetchStoreRating, StoreProduct } from '@/services/productsService';
import { checkStoreIsOpen } from '@/services/storesService';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { Dimensions } from 'react-native';
import { shortenUrl } from '@/utils/shortenUrl';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_H = 240;
const LOGO_SIZE = 84;
const HALF_LOGO = LOGO_SIZE / 2;

// ── Cart types ────────────────────────────────────────────────────────────────
interface CartItem { product: StoreProduct; qty: number }
type OrderType = 'delivery' | 'pickup';

const ORDER_LABELS: Record<OrderType, { ar: string; en: string; icon: string }> = {
  delivery: { ar: 'توصيل للمنزل', en: 'Delivery', icon: 'delivery-dining' },
  pickup:   { ar: 'استلام من المتجر', en: 'Pickup', icon: 'shopping-bag' },
};

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM PRODUCT CARD (Talabat-style)
// ─────────────────────────────────────────────────────────────────────────────
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
    <View style={[pc.card, { backgroundColor: '#fff', opacity: unavailable ? 0.56 : 1 }]}>
      {/* Product image — top half */}
      <View style={pc.imgWrap}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={pc.img}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <View style={[pc.imgFallback, { backgroundColor: '#F3F4F6' }]}>
            <MaterialIcons name="fastfood" size={28} color="#D1D5DB" />
          </View>
        )}
        {/* Unavailable tag */}
        {!product.is_available ? (
          <View style={pc.unavailableTag}>
            <Text style={pc.unavailableText}>{isAr ? 'نفذ' : 'N/A'}</Text>
          </View>
        ) : null}
      </View>

      {/* Card body */}
      <View style={[pc.body, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text
          style={[pc.name, { color: '#111827', textAlign: isRTL ? 'right' : 'left' }]}
          numberOfLines={2}
        >
          {name}
        </Text>
        {desc ? (
          <Text
            style={[pc.desc, { color: '#9CA3AF', textAlign: isRTL ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {desc}
          </Text>
        ) : null}
      </View>

      {/* Price row + add button */}
      <View style={[pc.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[pc.price, { color: colors.primary }]}>
          {product.price > 0 ? `${product.price}₪` : (isAr ? 'مجاني' : 'Free')}
        </Text>

        {!unavailable ? (
         qty > 0 ? (
            /* Qty controls */
            <View style={[pc.qtyRow, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
              {/* زر الناقص (أحمر) */}
              <Pressable 
                onPress={onRemove} 
                hitSlop={8}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <MaterialIcons name="remove" size={18} color="#EF4444" />
              </Pressable>

              {/* كمية المنتج */}
              <Text style={{ fontSize: 16, fontWeight: '800', marginHorizontal: 8, color: '#111827' }}>
                {qty}
              </Text>

              {/* زر الزائد (أخضر) */}
              <Pressable 
                onPress={onAdd} 
                hitSlop={8}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#22c55e',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <MaterialIcons name="add" size={18} color="#22c55e" />
              </Pressable>
            </View>
          ) : (
            /* + button only */
            <Pressable 
              onPress={onAdd} 
              hitSlop={8}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#22c55e',
                alignItems: 'center', justifyContent: 'center'
              }}
            >
              <MaterialIcons name="add" size={18} color="#22c55e" />
            </Pressable>
          )
        ) : (
          <View style={pc.closedTag}>
            <Text style={pc.closedTagText}>{isAr ? 'مغلق' : 'Closed'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  imgWrap: { width: '100%', height: 120, backgroundColor: '#F3F4F6', position: 'relative' },
  img: { width: '100%', height: 120 },
  imgFallback: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  unavailableTag: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  unavailableText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { paddingHorizontal: 9, paddingTop: 9, paddingBottom: 4, gap: 4, minHeight: 62 },
  name: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  desc: { fontSize: 11, lineHeight: 15 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 9, paddingBottom: 10, paddingTop: 4,
  },
  price: { fontSize: 14, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qtyMinus: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  qtyBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  addCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 4, elevation: 3,
  },
  closedTag: {
    backgroundColor: '#F3F4F6', borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  closedTagText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT SECTION (grouped by category)
// ─────────────────────────────────────────────────────────────────────────────
function ProductSection({
  label, products, cart, onAdd, onRemove, isAr, isRTL, colors, isOpen,
}: {
  label: string; products: StoreProduct[];
  cart: Record<string, CartItem>;
  onAdd: (p: StoreProduct) => void; onRemove: (p: StoreProduct) => void;
  isAr: boolean; isRTL: boolean; colors: any; isOpen: boolean;
}) {
  return (
    <View style={ps.wrap}>
      {/* Section header */}
      <View style={[ps.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[ps.headerDot, { backgroundColor: colors.primary }]} />
        <Text style={[ps.title, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
          {label}
        </Text>
      </View>

      {/* 2-column grid */}
      <View style={[ps.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {products.map(item => (
          <ProductCard
            key={item.id}
            product={item}
            qty={cart[item.id]?.qty ?? 0}
            onAdd={() => onAdd(item)}
            onRemove={() => onRemove(item)}
            isAr={isAr}
            isRTL={isRTL}
            colors={colors}
            disabled={!isOpen}
          />
        ))}
        {/* Odd count spacer */}
        {products.length % 2 !== 0 ? <View style={{ width: '48%' }} /> : null}
      </View>
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { marginBottom: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerDot: { width: 4, height: 22, borderRadius: 2, flexShrink: 0 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16, gap: 0,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
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
  const [isOpen, setIsOpen] = useState(true);
  const { ids: favoriteIds, toggle: toggleFav } = useFavoriteIds();
  const isFavorited = favoriteIds.has(id ?? '');
  const [shareLoading, setShareLoading] = useState(false);

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartVisible, setCartVisible] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'order_type'>('cart');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const cartAnim = useSharedValue(0);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.product.price * i.qty, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);

  // ── Group products by category_label_ar ──────────────────────────────────
  const groupedProducts = useMemo(() => {
    const map = new Map<string, StoreProduct[]>();
    const uncategorized: StoreProduct[] = [];

    for (const p of products) {
      const label = isAr
        ? (p.category_label_ar || p.category_label || '')
        : (p.category_label || p.category_label_ar || '');
      if (label) {
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(p);
      } else {
        uncategorized.push(p);
      }
    }
    const result: { label: string; items: StoreProduct[] }[] = [];
    map.forEach((items, label) => result.push({ label, items }));
    if (uncategorized.length > 0) {
      result.push({ label: isAr ? 'منتجات أخرى' : 'Other Products', items: uncategorized });
    }
    return result;
  }, [products, isAr]);

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) {
      // No id means invalid/malformed deep link — stop loading immediately
      setLoading(false);
      return;
    }
    // Fire-and-forget view increment
    // TODO: Replace with atomic RPC (increment_store_views) to prevent lost view counts
    // under concurrent access. Currently a read-then-write pattern with a race condition.
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
      cartAnim.value = withSequence(
        withTiming(1, { duration: 120 }),
        withSpring(0, { damping: 6 }),
      );
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

  const handleShare = useCallback(async () => {
    if (shareLoading || !store) return;
    setShareLoading(true);
    try {
      const storeName = isAr ? (store.name_ar || store.name) : store.name;
      const longUrl = `https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/store/${store.id}`;
      const shortLink = await shortenUrl(longUrl);
      await Share.share({
        message: isAr
          ? `شاهد متجر "${storeName}" على سوق قلقيلية! 🛒\n\n${shortLink}`
          : `Check out "${storeName}" on Souq Qalqilya! 🛒\n\n${shortLink}`,
        url: shortLink,
      });
    } catch { /* silent */ }
    finally { setShareLoading(false); }
  }, [store, isAr, shareLoading]);

  // ── WhatsApp checkout ───────────────────────────────────────────────────────
  // ── WhatsApp checkout ───────────────────────────────────────────────────────
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
    ];

    // إضافة رقم الهاتف إذا كان الطلب توصيل
    if (orderType === 'delivery' && customerPhone.trim().length > 0) {
      lines.push(isAr ? `📞 رقم التواصل: ${customerPhone}` : `📞 Phone: ${customerPhone}`);
    }

    lines.push(
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
    );

    if (orderNote && orderNote.trim().length > 0) {
      lines.push('');
      lines.push(isAr ? `📝 ملاحظات الزبون: ${orderNote}` : `📝 Notes: ${orderNote}`);
    }

    // إضافة التنبيه الإلزامي
    lines.push('');
    lines.push(isAr ? '⚠️ *الرجاء تأكيد الطلب*' : '⚠️ *Please confirm the order from the restaurant*');
    lines.push(isAr ? 'شكراً لكم! 🙏' : 'Thank you for your order! 🙏');

    const message = encodeURIComponent(lines.join('\n'));
    const phone = (store.whatsapp || store.phone || '').replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${phone}?text=${message}`).catch(() => {});
    setCartVisible(false);
    setCart({});
    setCheckoutStep('cart');
    setOrderNote('');
    setCustomerPhone(''); // تصفير الرقم بعد الطلب
  }, [store, user, orderType, cartItems, cartTotal, isAr, isOpen, orderNote, customerPhone]);

  // ── Animated style — MUST be declared before any conditional returns (Rules of Hooks) ──
  const cartBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + cartAnim.value * 0.18 }],
  }));

  // ── Guard: malformed deep link (id undefined/empty) ───────────────────────
  // Never stay in an infinite loading state — show an error and let the user go back.
  if (!id) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background }]}>
        <MaterialIcons name="error-outline" size={44} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>
          {isAr ? 'رابط غير صحيح' : 'Invalid link'}
        </Text>
        <Pressable
          style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, backgroundColor: colors.primary }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'العودة' : 'Go Back'}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!store) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background }]}>
        <MaterialIcons name="store" size={44} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>
          {isAr ? 'المتجر غير موجود' : 'Store not found'}
        </Text>
      </View>
    );
  }

  const storeName = isAr ? (store.name_ar || store.name) : store.name;
  const storeDesc = isAr ? (store.description_ar || store.description) : store.description;
  const hoursLabel = store.opening_time && store.closing_time
    ? `${store.opening_time} – ${store.closing_time}`
    : null;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartCount > 0 && isOpen ? 116 : 48 }}
      >
        {/* ═══════════════════════════════════════════════════════════
            SECTION 1 — FULL-BLEED BANNER (edge to edge, under status bar)
        ═══════════════════════════════════════════════════════════ */}
        <View style={[s.bannerWrap, { height: BANNER_H }]}>
          {store.banner_url ? (
            <Image
              source={{ uri: store.banner_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
            />
          ) : store.logo_url ? (
            <Image
              source={{ uri: store.logo_url }}
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} />
          )}

          {/* Gradient overlay — bottom fade */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={[StyleSheet.absoluteFill, { top: '40%' }]}
          />

          {/* ── Back button (absolute, safe-area aware) ── */}
          <Pressable
            style={[s.fabBtn, { top: insets.top + 10, left: isRTL ? undefined : 16, right: isRTL ? 16 : undefined }]}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <MaterialIcons
              name={isRTL ? 'chevron-right' : 'chevron-left'}
              size={22}
              color="#fff"
            />
          </Pressable>

          {/* ── Share button (absolute, safe-area aware) ── */}
          <Pressable
            style={[s.fabBtn, { top: insets.top + 10, right: isRTL ? undefined : 16, left: isRTL ? 16 : undefined, opacity: shareLoading ? 0.6 : 1 }]}
            onPress={handleShare}
            hitSlop={8}
            disabled={shareLoading}
          >
            {shareLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name="share" size={20} color="#fff" />}
          </Pressable>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2 — OVERLAPPING STORE INFO CARD (PREMIUM DESIGN)
        ═══════════════════════════════════════════════════════════ */}
        <View style={[s.infoCard, { backgroundColor: colors.surface }]}>

          {/* Circular logo — overlaps banner (With 3D Shadow) */}
          <View style={s.logoWrap}>
            <View style={[s.logoCircle, {
              borderColor: isOpen ? '#22c55e' : '#D1D5DB',
              backgroundColor: colors.surfaceTint,
              // إضافة الظل للوجو
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 6,
            }]}>
              {store.logo_url ? (
                <Image
                  source={{ uri: store.logo_url }}
                  style={s.logoImg}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <MaterialIcons name="storefront" size={36} color={colors.primary} />
              )}
            </View>
          </View>

          {/* Store name (Bigger and Bolder) */}
          <Text style={[s.storeName, { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 4, marginBottom: 2 }]}>
            {storeName}
          </Text>

          {/* Address */}
          {store.address ? (
            <View style={[s.centerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="location-on" size={14} color={colors.textMuted} />
              <Text style={[s.addrText, { color: colors.textMuted, fontSize: 13 }]} numberOfLines={1}>
                {store.address}
              </Text>
            </View>
          ) : null}

          {/* Status + hours + rating badges row */}
          <View style={[s.badgesRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 12 }]}>
            {/* Open/Closed pill */}
            <View style={[s.statusPill, { backgroundColor: isOpen ? '#DCFCE7' : '#F3F4F6' }]}>
              <View style={[s.statusDot, { backgroundColor: isOpen ? '#16a34a' : '#9CA3AF' }]} />
              <Text style={[s.statusText, { color: isOpen ? '#15803d' : '#6B7280' }]}>
                {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
              </Text>
            </View>

            {/* Hours badge */}
            {hoursLabel ? (
              <View style={[s.infoBadge, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="access-time" size={12} color={colors.textMuted} />
                <Text style={[s.infoBadgeText, { color: colors.textSecondary }]}>{hoursLabel}</Text>
              </View>
            ) : null}

            {/* Rating badge */}
            {rating.avg > 0 ? (
              <View style={[s.infoBadge, { backgroundColor: '#FFFBEB' }]}>
                <Text style={{ fontSize: 11 }}>⭐</Text>
                <Text style={[s.infoBadgeText, { color: '#92400E', fontWeight: '800' }]}>
                  {rating.avg.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Action icon row (Revamped for Conversion) */}
          <View style={[s.actionRow, { flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 16 }]}>
            
            {/* WhatsApp quick contact (Primary Button) */}
            {(store.whatsapp || store.owner_whatsapp || store.phone) ? (
              <Pressable
                style={{ 
                  flex: 1, 
                  backgroundColor: '#22c55e', 
                  borderRadius: 12, 
                  flexDirection: isRTL ? 'row-reverse' : 'row', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  paddingVertical: 12, 
                  gap: 8,
                  shadowColor: '#22c55e',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 2
                }}
                onPress={() => {
                  const phone = (store.whatsapp || store.owner_whatsapp || store.phone || '').replace(/\D/g, '');
                  Linking.openURL(`https://wa.me/${phone}`).catch(() => {});
                }}
              >
                <MaterialIcons name="chat" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>
                  {isAr ? 'تواصل مع المتجر' : 'Contact Store'}
                </Text>
              </Pressable>
            ) : null}

            {/* Favorite (Circle) */}
            <Pressable
              style={[s.actionCircle, {
                width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
                backgroundColor: isFavorited ? '#FEE2E2' : colors.surfaceTint,
                borderWidth: 1,
                borderColor: isFavorited ? '#EF4444' : colors.borderLight,
              }]}
              onPress={() => id && toggleFav(id)}
            >
              <MaterialIcons
                name={isFavorited ? 'favorite' : 'favorite-border'}
                size={22}
                color={isFavorited ? '#EF4444' : colors.textMuted}
              />
            </Pressable>

            {/* Share (Circle) */}
            <Pressable
              style={[s.actionCircle, { 
                width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
                backgroundColor: colors.surfaceTint, borderWidth: 1, borderColor: colors.borderLight, opacity: shareLoading ? 0.6 : 1 
              }]}
              onPress={handleShare}
              disabled={shareLoading}
            >
              {shareLoading
                ? <ActivityIndicator size="small" color={colors.textMuted} />
                : <MaterialIcons name="share" size={22} color={colors.textMuted} />}
            </Pressable>

          </View>

          {/* Description */}
          {storeDesc ? (
            <Text style={[s.storeDesc, { color: colors.textSecondary, marginTop: 16 }]} numberOfLines={3}>
              {storeDesc}
            </Text>
          ) : null}
        </View>
        {/* ═══════════════════════════════════════════════════════════
            SECTION 3 — MENU (Grouped vertically by category)
        ═══════════════════════════════════════════════════════════ */}
        {products.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={[s.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="fastfood" size={42} color={colors.textMuted} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {isAr ? 'لا توجد منتجات بعد' : 'No Products Yet'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>
              {isAr ? 'سيتم إضافة منتجات قريباً' : 'Products will be added soon'}
            </Text>
          </View>
        ) : (
          /* Menu section header */
          <View style={s.menuWrap}>
            <View style={[s.menuHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="restaurant-menu" size={18} color={colors.primary} />
              <Text style={[s.menuHeaderText, { color: colors.textPrimary }]}>
                {isAr ? 'قائمة الطلبات 🧾' : 'Menu 🧾'}
              </Text>
            </View>

            {groupedProducts.length > 0 ? (
              groupedProducts.map(group => (
                <ProductSection
                  key={group.label}
                  label={group.label}
                  products={group.items}
                  cart={cart}
                  onAdd={addToCart}
                  onRemove={removeFromCart}
                  isAr={isAr}
                  isRTL={isRTL}
                  colors={colors}
                  isOpen={isOpen}
                />
              ))
            ) : (
              /* No categories — flat 2-col grid */
              <ProductSection
                label={isAr ? 'جميع المنتجات' : 'All Products'}
                products={products}
                cart={cart}
                onAdd={addToCart}
                onRemove={removeFromCart}
                isAr={isAr}
                isRTL={isRTL}
                colors={colors}
                isOpen={isOpen}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* ── FLOATING CART BUTTON ── */}
      {cartCount > 0 && isOpen ? (
        <Animated.View style={[s.cartFab, cartBtnAnimStyle]}>
          <Pressable
            style={[s.cartFabInner, { backgroundColor: colors.primary }]}
            onPress={() => { setCartVisible(true); setCheckoutStep('cart'); }}
          >
            <View style={s.cartCountBadge}>
              <Text style={s.cartCountText}>{cartCount}</Text>
            </View>
            <Text style={s.cartFabLabel}>
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
                        <Text style={[m.cartItemName, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left', marginHorizontal: 8 }]}>
                          {pName}
                        </Text>
                        
                        {/* أزرار الكمية بالتصميم الجديد (أحمر وأخضر) */}
                        <View style={[m.cartItemQty, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
                          <Pressable 
                            onPress={() => removeFromCart(product)} 
                            hitSlop={8} 
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <MaterialIcons name="remove" size={16} color="#EF4444" />
                          </Pressable>
                          
                          <Text style={[m.qtyNum, { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginHorizontal: 8 }]}>{qty}</Text>
                          
                          <Pressable 
                            onPress={() => addToCart(product)} 
                            hitSlop={8} 
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#22c55e', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <MaterialIcons name="add" size={16} color="#22c55e" />
                          </Pressable>
                        </View>
                        
                        <Text style={[m.cartItemPrice, { color: colors.primary, minWidth: 60, textAlign: isRTL ? 'left' : 'right' }]}>
                          {(product.price * qty).toFixed(2)}₪
                        </Text>
                      </View>
                    );
                  })}

                  {/* ── حقل الملاحظات الجديد ── */}
                  <View style={{ marginTop: 20, paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, textAlign: isRTL ? 'right' : 'left' }}>
                      {isAr ? 'ملاحظات إضافية (اختياري)' : 'Order Notes (Optional)'}
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: colors.surfaceTint || '#F3F4F6',
                        borderRadius: 12,
                        padding: 14,
                        minHeight: 80,
                        textAlign: isRTL ? 'right' : 'left',
                        textAlignVertical: 'top',
                        color: colors.textPrimary,
                        fontSize: 14
                      }}
                      placeholder={isAr ? 'مثال: بدون بصل، التوصيل للباب الخلفي...' : 'e.g. No onions, deliver to back door...'}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      value={orderNote}
                      onChangeText={setOrderNote}
                    />
                  </View>
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

                {/* ── حقل رقم الهاتف (يظهر فقط للتوصيل) ── */}
                {orderType === 'delivery' ? (
                  <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, textAlign: isRTL ? 'right' : 'left' }}>
                      {isAr ? 'رقم الهاتف للتواصل *' : 'Contact Phone Number *'}
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: colors.surfaceTint || '#F3F4F6',
                        borderRadius: 12,
                        padding: 14,
                        textAlign: isRTL ? 'right' : 'left',
                        color: colors.textPrimary,
                        borderWidth: 1,
                        borderColor: colors.borderLight,
                        fontSize: 14
                      }}
                      placeholder={isAr ? 'أدخل رقم هاتفك...' : 'Enter your phone number...'}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      value={customerPhone}
                      onChangeText={setCustomerPhone}
                    />
                  </View>
                ) : null}

                {/* ── زر التأكيد (مبرمج عشان ما يشتغل إلا لو الرقم مدخل) ── */}
                <Pressable
                  style={[m.primaryBtn, {
                    backgroundColor: isOpen && (orderType !== 'delivery' || customerPhone.trim().length > 5) ? '#16a34a' : '#9CA3AF',
                    opacity: isOpen && (orderType !== 'delivery' || customerPhone.trim().length > 5) ? 1 : 0.7,
                  }]}
                  onPress={isOpen && (orderType !== 'delivery' || customerPhone.trim().length > 5) ? handleConfirmOrder : undefined}
                  disabled={!isOpen || (orderType === 'delivery' && customerPhone.trim().length <= 5)}
                >
                  <MaterialIcons name={isOpen ? 'chat' : 'block'} size={18} color="#fff" />
                  <Text style={m.primaryBtnText}>
                    {isOpen
                      ? (orderType === 'delivery' && customerPhone.trim().length <= 5 
                          ? (isAr ? 'يرجى إدخال رقم الهاتف' : 'Enter Phone Number')
                          : (isAr ? 'تأكيد عبر واتساب' : 'Confirm via WhatsApp'))
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

  // ── Banner ──
  bannerWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#0A6E5C',
  },

  // Floating action buttons (back + share)
  fabBtn: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.50)',
    alignItems: 'center', justifyContent: 'center',
  },

  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedPill: {
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 20,
    paddingHorizontal: 22, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
  },
  closedPillText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // ── Overlapping store info card ──
  infoCard: {
    marginTop: -(HALF_LOGO + 20),   // pulls card up to overlap banner
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 0,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
  },

  // Logo centered at the overlap point
  logoWrap: {
    alignItems: 'center',
    marginTop: -(HALF_LOGO),
    marginBottom: 12,
  },
  logoCircle: {
    width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2,
    borderWidth: 3.5,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  logoImg: { width: LOGO_SIZE, height: LOGO_SIZE },

  storeName: {
    fontSize: 22, fontWeight: '800', textAlign: 'center',
    letterSpacing: -0.4, lineHeight: 28, marginBottom: 4,
  },
  centerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, marginBottom: 10,
  },
  addrText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Status + hours + rating pills
  badgesRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '800' },
  infoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  infoBadgeText: { fontSize: 12, fontWeight: '600' },

  // Action icon row
  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 14, marginBottom: 12,
  },
  actionCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },

  storeDesc: {
    fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 2,
  },

  // ── Menu section ──
  menuWrap: { marginTop: 8 },
  menuHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  menuHeaderText: { fontSize: 17, fontWeight: '800', flex: 1 },

  // ── Empty state ──
  emptyWrap: {
    alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: 32,
  },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  // ── Floating cart button ──
  cartFab: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  cartFabInner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingVertical: 15, paddingHorizontal: 18, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 14, elevation: 12,
  },
  cartCountBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  cartCountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cartFabLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  cartFabTotal: {
    color: '#fff', fontSize: 15, fontWeight: '800',
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
