
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
import { getLocalCategories, LocalCategory } from '@/services/localCategoriesService';

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
// PRODUCT CARD (Orgadastyle clean layout)
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
    <View style={[pc.card, { opacity: unavailable ? 0.6 : 1 }]}>
      {/* Product Image */}
      <View style={pc.imgWrap}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={pc.img} contentFit="contain" transition={200} />
        ) : (
          <View style={[pc.imgFallback, { backgroundColor: '#F9FAFB' }]}>
            <MaterialIcons name="fastfood" size={32} color="#D1D5DB" />
          </View>
        )}
        
        {!unavailable ? (
          <Pressable style={[pc.addCircle, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={onAdd} hitSlop={8}>
            <MaterialIcons name="shopping-bag" size={18} color="#fff" />
            <View style={pc.addCircleCheck}>
              <MaterialIcons name="check" size={8} color={colors.primary} />
            </View>
            {qty > 0 ? (
  <View style={pc.qtyBadge}>
    <Text style={pc.qtyBadgeText}>{qty}</Text>
  </View>
) : null}
          </Pressable>
        ) : null}
      </View>

      {/* Product Details */}
      <View style={[pc.body, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[pc.name, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
          {name}
        </Text>
        {desc ? (
          <Text style={[pc.desc, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
        
        {/* Price Row */}
        <View style={[pc.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={pc.priceLabel}>{isAr ? 'السعر:' : 'Price:'}</Text>
          <Text style={[pc.price, { color: colors.primary }]}>
            {product.price > 0
              ? `${product.price} ₪`
              : (isAr ? 'مجاني' : 'Free')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    width: '48%',
    borderRadius: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'visible', // ضروري للزر العائم
  },
  imgWrap: { width: '100%', height: 110, padding: 10, position: 'relative', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  img: { width: '100%', height: '100%' },
  imgFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  addCircle: {
    position: 'absolute', bottom: -12, left: 12, // يطفو في الأسفل على اليسار
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#BE123C',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#BE123C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4, zIndex: 10,
  },
  addCircleCheck: { position: 'absolute', top: 6, right: 6, backgroundColor: '#fff', width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qtyBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#111827', minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  qtyBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  body: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12, gap: 4 },
  name: { fontSize: 13, fontWeight: '800', lineHeight: 18, color: '#111827' },
  desc: { fontSize: 10, lineHeight: 14, minHeight: 28, color: '#6B7280' },
  priceRow: { alignItems: 'center', gap: 4, marginTop: 4 },
  priceLabel: { fontSize: 11, color: '#9CA3AF' },
  price: { fontSize: 15, fontWeight: '900', color: '#BE123C' },
});

// ── Product Section Styles ──
const ps = StyleSheet.create({
  wrap: { marginBottom: 20 },
  header: { paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '900', color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  moreBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 4, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
  },
  moreBtnText: { fontSize: 14, fontWeight: '800', marginHorizontal: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT SECTION (Grouped by category)
// ─────────────────────────────────────────────────────────────────────────────
function ProductSection({
  label, products, cart, onAdd, onRemove, isAr, isRTL, colors, isOpen,
}: {
  label: string; products: StoreProduct[];
  cart: Record<string, CartItem>;
  onAdd: (p: StoreProduct) => void; onRemove: (p: StoreProduct) => void;
  isAr: boolean; isRTL: boolean; colors: any; isOpen: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMore = products.length > 6;
  const visibleProducts = isExpanded ? products : products.slice(0, 6);

  return (
    <View style={ps.wrap}>
      <View style={[ps.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[ps.title, { textAlign: isRTL ? 'right' : 'left' }]}>
          {label}
        </Text>
      </View>


      <View style={[ps.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {visibleProducts.map(item => (
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
        {visibleProducts.length % 2 !== 0 ? <View style={{ width: '48%' }} /> : null}
      </View>

      {hasMore && (
        <Pressable 
          style={[ps.moreBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]} 
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Text style={[ps.moreBtnText, { color: colors.primary }]}>
            {isExpanded 
              ? (isAr ? 'عرض أقل' : 'Show Less') 
              : (isAr ? 'عرض المزيد' : 'View More')}
          </Text>
          <MaterialIcons 
            name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
            size={20} 
            color={colors.primary} 
          />
        </Pressable>
      )}
    </View>
  );
}



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
  const [customCategories, setCustomCategories] = useState<LocalCategory[]>([]);

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
  
  // 1. المنتجات حسب التصنيفات المخصصة
  for (const cat of customCategories) {
    const catName = isAr ? cat.name_ar : cat.name;
    const items = products.filter(p => p.custom_category_id === cat.id);
    if (items.length > 0) {
      map.set(catName, items);
    }
  }

  // 2. المنتجات التي لها تصنيف قديم (category_label) ولكن ليست في customCategories
  for (const p of products) {
    if (p.custom_category_id) continue;
    const label = isAr
      ? (p.category_label_ar || p.category_label || '')
      : (p.category_label || p.category_label_ar || '');
    if (label) {
      if (!map.has(label)) {
        map.set(label, []);
      }
      // تجنب التكرار
      const existingItems = map.get(label) || [];
      if (!existingItems.some(item => item.id === p.id)) {
        map.get(label)!.push(p);
      }
    }
  }

  // 3. المنتجات بدون تصنيف
  const uncategorized = products.filter(p => 
    !p.custom_category_id && 
    !(isAr ? (p.category_label_ar || p.category_label || '') : (p.category_label || p.category_label_ar || ''))
  );
  
  const result: { label: string; items: StoreProduct[] }[] = [];
  map.forEach((items, label) => result.push({ label, items }));
  if (uncategorized.length > 0) {
    result.push({ label: isAr ? 'منتجات أخرى' : 'Other Products', items: uncategorized });
  }
  return result;
}, [products, customCategories, isAr]);

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
  if (!id) {
    setLoading(false);
    return;
  }
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
    getLocalCategories(id), // ← أضف هذا
  ]).then(([storeRes, productsRes, ratingRes, categoriesRes]) => {
    if (storeRes.data) {
      setStore(storeRes.data);
      setIsOpen(checkStoreIsOpen(storeRes.data));
    }
    setProducts(productsRes.data);
    setRating(ratingRes);
    setCustomCategories(categoriesRes); // ← أضف هذا
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
    setCustomerPhone(''); 
  }, [store, user, orderType, cartItems, cartTotal, isAr, isOpen, orderNote, customerPhone]);

  const cartBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + cartAnim.value * 0.18 }],
  }));

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
        <View style={s.heroContainer}>
          {/* الغلاف العلوي */}
          <View style={[s.bannerWrap, { height: 240, backgroundColor: colors.surface }]}>
            {store.banner_url ? (
              <Image source={{ uri: store.banner_url }} style={StyleSheet.absoluteFill} contentFit="contain" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
            )}
            <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent']} style={StyleSheet.absoluteFill} />
            
            
            <View style={[s.headerOverlay, { paddingTop: insets.top + 10, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              
              <Pressable style={s.headerBtn} onPress={() => router.back()}>
                <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#111827" />
              </Pressable>
              
             
             <View style={[s.headerActionsRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
  <Pressable style={s.headerBtn} onPress={() => id && toggleFav(id)}>
    <MaterialIcons name={isFavorited ? 'favorite' : 'favorite-border'} size={20} color={isFavorited ? colors.primary : '#111827'} />
  </Pressable>
  <Pressable style={s.headerBtn} onPress={handleShare}>
    <MaterialIcons name="share" size={18} color="#111827" />
  </Pressable>
</View>


      
          <View style={s.overlapWrapper}>
            <View style={[s.sideBadge, { right: 16 }]}>
              <View style={[s.modernPill, { borderColor: colors.primary }]}>
                <MaterialIcons name="access-time" size={14} color={colors.primary} />
                <Text style={[s.modernPillText, { color: colors.primary, marginLeft: 4 }]}>{hoursLabel || '01:00 - 10:30'}</Text>
              </View>
            </View>

  
            <View style={s.logoWrap}>
              {store.logo_url ? (
                <Image source={{ uri: store.logo_url }} style={s.mainLogo} contentFit="cover" />
              ) : (
                <MaterialIcons name="storefront" size={40} color={colors.primary} />
              )}
            </View>

            <View style={[s.sideBadge, { left: 16 }]}>
              <View style={[s.modernPill, { borderColor: isOpen ? '#16A34A' : colors.textMuted }]}>
                <View style={[s.statusDot, { backgroundColor: isOpen ? '#16A34A' : colors.textMuted }]} />
                <Text style={[s.modernPillText, { color: isOpen ? '#16A34A' : colors.textMuted, marginLeft: 4 }]}>
                  {isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed')}
                </Text>
              </View>
            </View>
          </View>

          
         <View style={s.storeDetails}>
  <Text style={s.storeNameTxt}>{storeName}</Text>
  
  {/* زر واتساب المميز - بتأثير 3D وتدرج */}
<Pressable
  style={({ pressed }) => [
    s.whatsappBtn,
    {
      opacity: pressed ? 0.9 : 1,
      transform: [{ scale: pressed ? 0.96 : 1 }],
    },
  ]}
  onPress={() => {
    const userName = user?.username || user?.email?.split('@')[0] || (isAr ? 'عميل' : 'Customer');
    const msg = isAr 
      ? `مرحباً، أنا ${userName} من تطبيق سوق قلقيلية، أود الاستفسار عن...`
      : `Hello, I'm ${userName} from Souq Qalqilya app, I would like to ask about...`;
    const phone = (store.whatsapp || store.phone || '').replace(/\D/g, '');
    if (phone) {
      Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
    } else {
      alert(isAr ? 'لا يوجد رقم واتساب لهذا المتجر' : 'No WhatsApp number for this store');
    }
  }}
>
  <LinearGradient
    colors={['#25D366', '#128C7E']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={[s.whatsappGradient, { borderRadius: 30 }]}
  >
    <MaterialIcons name="whatsapp" size={26} color="#fff" style={{ marginRight: 8 }} />
    <Text style={s.whatsappBtnText}>
      {isAr ? 'تواصل مع المتجر' : 'Contact Store'}
    </Text>
    <MaterialIcons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 4 }} />
  </LinearGradient>
</Pressable>

  {/* باقي المحتوى (الموقع، الوصف) */}
  <View style={s.locationRow}>
    <MaterialIcons name="place" size={16} color={colors.primary} />
    <Text style={s.locationTxt}>{store.address || (isAr ? 'قلقيلية - شارع نابلس' : 'Qalqilya')}</Text>
  </View>
</View>


            {storeDesc ? (
              <Text style={s.storeDescTxt} numberOfLines={2}>{storeDesc}</Text>
            ) : null}
          </View>{/* end heroContainer */}

          {/* ── PRODUCTS ── */}
          {products.length === 0 ? (
            <View style={s.emptyWrap}>
              <View style={[s.emptyIllus, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="fastfood" size={36} color={colors.primary} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {isAr ? 'لا توجد منتجات بعد' : 'No products yet'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                {isAr ? 'تابع هذا المتجر لمعرفة العروض القادمة' : 'Follow this store for upcoming offers'}
              </Text>
            </View>
          ) : (
            <View style={s.menuWrap}>
              {/* Header */}
              <View style={[s.menuHeaderRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="restaurant-menu" size={20} color={colors.primary} />
                <Text style={[s.menuHeaderText, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isAr ? 'قائمة المنتجات' : 'Products'}
                </Text>
                {!isOpen ? (
                  <View style={[s.closedPill, { borderColor: colors.textMuted }]}>
                    <Text style={[s.closedPillText, { fontSize: 11 }]}>
                      {isAr ? 'المتجر مغلق' : 'Closed'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {groupedProducts.map(({ label, items }) => (
                <ProductSection
                  key={label}
                  label={label}
                  products={items}
                  cart={cart}
                  onAdd={addToCart}
                  onRemove={removeFromCart}
                  isAr={isAr}
                  isRTL={isRTL}
                  colors={colors}
                  isOpen={isOpen}
                />
              ))}
            </View>
          )}
        </ScrollView>

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

const s = StyleSheet.create({

whatsappBtn: {
  marginTop: 8,
  marginBottom: 4,
  shadowColor: '#25D366',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.4,
  shadowRadius: 12,
  elevation: 8,
},
whatsappGradient: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 24,
  paddingVertical: 14,
  borderRadius: 30,
  gap: 4,
},
whatsappBtnText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '800',
  letterSpacing: 0.5,
},
  container: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  heroContainer: { paddingBottom: 24 },
  bannerWrap: { width: '100%', position: 'relative' },
  fabBtn: { position: 'absolute', zIndex: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  
  overlapWrapper: { width: '100%', alignItems: 'center', marginTop: -50, zIndex: 10 },
sideBadge: { position: 'absolute', top: 20, alignItems: 'center' },
modernPill: {
  flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff',
  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
},
  modernPillText: { fontSize: 12, fontWeight: '800' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  
  logoWrap: { width: 130, height: 130, borderRadius: 65, borderWidth: 4, borderColor: '#fff', backgroundColor: '#fff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  mainLogo: { width: '100%', height: '100%' },

  storeDetails: { marginTop: 12, alignItems: 'center' },
  storeNameTxt: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationTxt: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  // تنسيقات أزرار الهيدر الجديدة
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, zIndex: 20
  },
  headerActionsRight: { alignItems: 'center', gap: 10 },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
  },

  // تنسيقات تفاصيل المتجر الجديدة
  storeDescTxt: { 
    fontSize: 13, color: '#6B7280', textAlign: 'center', 
    marginTop: 10, paddingHorizontal: 32, lineHeight: 20 
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

  menuWrap: { marginTop: 8 },
  menuHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  menuHeaderText: { fontSize: 17, fontWeight: '800', flex: 1 },

  emptyWrap: {
    alignItems: 'center', paddingTop: 60, gap: 14, paddingHorizontal: 32,
  },
  emptyIllus: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

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
