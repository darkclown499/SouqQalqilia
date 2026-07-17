import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Dimensions,
  ActivityIndicator, Linking, RefreshControl, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getSupabaseClient } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { trackPageView } from '@/services/analyticsService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  category: string | null;
  phone: string | null;
  card_size: 'large' | 'medium' | 'small';
  store_name: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 12;
const COL_GAP = 10;
const LARGE_H = 220;
const MEDIUM_H = 170;
const SMALL_H = 130;
const HALF_W = (SCREEN_W - H_PAD * 2 - COL_GAP) / 2;
const DEFAULT_PHONE = '972599234230';

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp helper
// ─────────────────────────────────────────────────────────────────────────────

async function openWhatsApp(phone: string | null, title: string | null, storeName: string | null) {
  const number = (phone ?? DEFAULT_PHONE).replace(/\D/g, '');
  const msg = encodeURIComponent(
    `مرحباً، أنا مهتم بالعرض: ${title ?? 'عرض خاص'}${storeName ? ` من ${storeName}` : ''}`
  );
  const waUrl = `https://wa.me/${number}?text=${msg}`;
  const waApp = `whatsapp://send?phone=${number}&text=${msg}`;

  try {
    const canApp = await Linking.canOpenURL(waApp);
    if (canApp) {
      await Linking.openURL(waApp);
    } else {
      await Linking.openURL(waUrl);
    }
  } catch {
    try {
      await Linking.openURL(waUrl);
    } catch {
      // Silent fail - user will see nothing, but we tried both methods
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Components (memoized)
// ─────────────────────────────────────────────────────────────────────────────

const OfferCard = memo(function OfferCard({
  offer,
  width,
  height,
}: {
  offer: Offer;
  width: number;
  height: number;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => openWhatsApp(offer.phone, offer.title, offer.store_name)}
      style={[
        styles.card,
        { width, height },
        pressed && { opacity: 0.88, transform: [{ scale: 0.975 }] },
      ]}
    >
      {/* Background image */}
      <Image
        source={{ uri: offer.image_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
      />

      {/* Dark gradient overlay */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Category badge top-right */}
      {offer.category ? (
        <View style={styles.catBadge}>
          <Text style={styles.catBadgeText}>{offer.category}</Text>
        </View>
      ) : null}

      {/* Bottom text */}
      <View style={styles.cardBottom}>
        {offer.store_name ? (
          <Text style={styles.cardStore} numberOfLines={1}>{offer.store_name}</Text>
        ) : null}
        {offer.title ? (
          <Text style={styles.cardTitle} numberOfLines={height < 150 ? 1 : 2}>
            {offer.title}
          </Text>
        ) : null}
        {offer.description && height >= 160 ? (
          <Text style={styles.cardDesc} numberOfLines={1}>{offer.description}</Text>
        ) : null}
        {/* WhatsApp icon */}
        <View style={styles.waRow}>
          <MaterialIcons name="chat" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.waHint}>واتساب</Text>
        </View>
      </View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <>
      {/* Large skeleton */}
      <View style={[styles.skeleton, { width: SCREEN_W - H_PAD * 2, height: LARGE_H, marginBottom: COL_GAP }]} />
      {/* Two medium skeletons */}
      <View style={{ flexDirection: 'row', gap: COL_GAP, marginBottom: COL_GAP }}>
        <View style={[styles.skeleton, { width: HALF_W, height: MEDIUM_H }]} />
        <View style={[styles.skeleton, { width: HALF_W, height: MEDIUM_H }]} />
      </View>
      {/* Two small skeletons */}
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>
        <View style={[styles.skeleton, { width: HALF_W, height: SMALL_H }]} />
        <View style={[styles.skeleton, { width: HALF_W, height: SMALL_H }]} />
      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid layout builder
// ─────────────────────────────────────────────────────────────────────────────

type GridRow =
  | { type: 'large'; offer: Offer }
  | { type: 'pair'; left: Offer; right: Offer }
  | { type: 'single'; offer: Offer; size: 'medium' | 'small' };

function buildGrid(offers: Offer[]): GridRow[] {
  const rows: GridRow[] = [];

  // Group by size: large first, then medium, then small
  const large = offers.filter(o => o.card_size === 'large');
  const medium = offers.filter(o => o.card_size === 'medium');
  const small = offers.filter(o => o.card_size === 'small');

  large.forEach(o => rows.push({ type: 'large', offer: o }));

  for (let i = 0; i < medium.length; i += 2) {
    if (medium[i + 1]) {
      rows.push({ type: 'pair', left: medium[i], right: medium[i + 1] });
    } else {
      rows.push({ type: 'single', offer: medium[i], size: 'medium' });
    }
  }

  for (let i = 0; i < small.length; i += 2) {
    if (small[i + 1]) {
      rows.push({ type: 'pair', left: small[i], right: small[i + 1] });
    } else {
      rows.push({ type: 'single', offer: small[i], size: 'small' });
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // ── Track page view ──────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      trackPageView('offers').catch(() => {});
      return () => {};
    }, [])
  );

  // ── Fetch from Supabase ──────────────────────────────────────────────────
  const fetchOffers = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: dbError } = await supabase
        .from('offers')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (dbError) throw new Error(dbError.message);
      setOffers((data ?? []) as Offer[]);
    } catch (e: any) {
      setError(isAr ? 'فشل تحميل العروض. تحقق من اتصالك.' : 'Failed to load offers. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAr]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOffers(false);
  }, [fetchOffers]);

  // ── Categories from data ─────────────────────────────────────────────────
  const categories = useMemo(() => {
    const set = new Set<string>();
    offers.forEach(o => { if (o.category) set.add(o.category); });
    return Array.from(set);
  }, [offers]);

  // ── Filtered + grid ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (activeCategory === 'all') return offers;
    return offers.filter(o => o.category === activeCategory);
  }, [offers, activeCategory]);

  const gridRows = useMemo(() => buildGrid(filtered), [filtered]);

  // ── Heights by size ──────────────────────────────────────────────────────
  const heightFor = useCallback((size: 'large' | 'medium' | 'small') => {
    if (size === 'large') return LARGE_H;
    if (size === 'medium') return MEDIUM_H;
    return SMALL_H;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#1E293B' : '#FFFFFF';
  const headerBorder = isDark ? '#334155' : '#E2E8F0';
  const headerTitle = isDark ? '#F1F5F9' : '#111827';
  const chipBg = isDark ? '#1E293B' : '#F1F5F9';
  const chipBorder = isDark ? '#334155' : '#E2E8F0';
  const chipText = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons
            name={isAr ? 'chevron-right' : 'chevron-left'}
            size={28}
            color={headerTitle}
          />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: headerTitle }]}>
            {isAr ? 'العروض' : 'Offers'}
          </Text>
          {offers.length > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countBadgeText}>{offers.length}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={handleRefresh}
          hitSlop={12}
          disabled={refreshing}
          style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <MaterialIcons name="refresh" size={22} color={headerTitle} />
          }
        </Pressable>
      </View>

      {/* ── Category filter bar ─────────────────────────────────────────── */}
      {categories.length > 0 ? (
        <View style={[styles.filterBar, { backgroundColor: headerBg, borderBottomColor: headerBorder }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {/* "All" chip */}
            <Pressable
              onPress={() => setActiveCategory('all')}
              style={[
                styles.chip,
                {
                  backgroundColor: activeCategory === 'all' ? colors.primary : chipBg,
                  borderColor: activeCategory === 'all' ? colors.primary : chipBorder,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: activeCategory === 'all' ? '#FFFFFF' : chipText }]}>
                {isAr ? 'الكل' : 'All'}
              </Text>
            </Pressable>

            {categories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: activeCategory === cat ? colors.primary : chipBg,
                    borderColor: activeCategory === cat ? colors.primary : chipBorder,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: activeCategory === cat ? '#FFFFFF' : chipText }]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Loading */}
        {loading ? (
          <SkeletonCards />
        ) : error ? (
          // Error state
          <View style={styles.centerBox}>
            <MaterialIcons name="wifi-off" size={52} color="#CBD5E1" />
            <Text style={[styles.centerTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {isAr ? 'تعذّر تحميل العروض' : 'Could not load offers'}
            </Text>
            <Text style={[styles.centerSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              {error}
            </Text>
            <Pressable
              onPress={() => fetchOffers()}
              style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          // Empty state
          <View style={styles.centerBox}>
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={[styles.centerTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {activeCategory === 'all'
                ? (isAr ? 'لا توجد عروض حالياً' : 'No offers available')
                : (isAr ? `لا يوجد عروض في "${activeCategory}"` : `No offers in "${activeCategory}"`)
              }
            </Text>
            {activeCategory !== 'all' ? (
              <Pressable onPress={() => setActiveCategory('all')} style={[styles.showAllBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.showAllBtnText}>{isAr ? 'عرض الكل' : 'Show all'}</Text>
              </Pressable>
            ) : (
              <Text style={[styles.centerSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                {isAr ? 'تابعنا لاحقاً للاطلاع على أحدث العروض' : 'Check back later for new deals'}
              </Text>
            )}
          </View>
        ) : (
          // Grid
          <View style={styles.grid}>
            {gridRows.map((row, idx) => {
              if (row.type === 'large') {
                return (
                  <View key={row.offer.id} style={[styles.rowLarge, idx > 0 && { marginTop: COL_GAP }]}>
                    <OfferCard offer={row.offer} width={SCREEN_W - H_PAD * 2} height={LARGE_H} />
                  </View>
                );
              }
              if (row.type === 'pair') {
                const h = row.left.card_size === 'medium' ? MEDIUM_H : SMALL_H;
                return (
                  <View key={`${row.left.id}-${row.right.id}`} style={[styles.rowPair, idx > 0 && { marginTop: COL_GAP }]}>
                    <OfferCard offer={row.left} width={HALF_W} height={h} />
                    <OfferCard offer={row.right} width={HALF_W} height={h} />
                  </View>
                );
              }
              // single
              const h = heightFor(row.size);
              return (
                <View key={row.offer.id} style={[styles.rowSingle, idx > 0 && { marginTop: COL_GAP }]}>
                  <OfferCard offer={row.offer} width={HALF_W} height={h} />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Filter bar
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: H_PAD,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Body
  body: {
    padding: H_PAD,
    paddingTop: 14,
  },

  // Grid
  grid: {},
  rowLarge: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  rowPair: {
    flexDirection: 'row',
    gap: COL_GAP,
  },
  rowSingle: {},

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  catBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(10,110,92,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  catBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  cardBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 11,
    alignItems: 'flex-end',
    gap: 2,
  },
  cardStore: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 18,
  },
  cardDesc: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    textAlign: 'right',
  },
  waRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  waHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
  },

  // Skeleton
  skeleton: {
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    opacity: 0.7,
  },

  // States
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  showAllBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
  },
  showAllBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});