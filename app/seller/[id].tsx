import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  RefreshControl, Dimensions, Animated, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getSupabaseClient } from '@/template';
import { fetchAds, Ad } from '@/services/adsService';
import { AdCard } from '@/components/feature/AdCard';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 14;
const COLUMN_GAP = 10;
const CARD_W = (SCREEN_W - H_PAD * 2 - COLUMN_GAP) / 2;
const COVER_H = 180;
const AVATAR_SIZE = 88;

// ── Skeleton shimmer box ────────────────────────────────────────────────────
function SkeletonBox({
  w = '100%' as number | string,
  h,
  br = 8,
  baseColor,
  style,
}: {
  w?: number | string;
  h: number;
  br?: number;
  baseColor: string;
  style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  return (
    <Animated.View
      style={[{ width: w as any, height: h, borderRadius: br, backgroundColor: baseColor, opacity }, style]}
    />
  );
}

// ── Skeleton: full seller page ──────────────────────────────────────────────
function SellerSkeleton({ colors }: { colors: any }) {
  const base = colors.surfaceTint;
  const baseDark = colors.border;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cover */}
      <SkeletonBox w={SCREEN_W} h={COVER_H} br={0} baseColor={baseDark} />

      {/* Avatar */}
      <View style={{ alignItems: 'center', marginTop: -(AVATAR_SIZE / 2) - 4, marginBottom: 20, gap: 10 }}>
        <SkeletonBox w={AVATAR_SIZE + 8} h={AVATAR_SIZE + 8} br={(AVATAR_SIZE + 8) / 2} baseColor={baseDark} />
        <SkeletonBox w={140} h={18} br={8} baseColor={base} />
        <SkeletonBox w={100} h={13} br={6} baseColor={base} />
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: H_PAD, marginBottom: 24 }}>
        {[1, 2].map(i => (
          <SkeletonBox key={i} w={(SCREEN_W - H_PAD * 2 - 10) / 2} h={80} br={16} baseColor={base} />
        ))}
      </View>

      {/* Grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: H_PAD, gap: COLUMN_GAP }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} w={CARD_W} h={200} br={14} baseColor={base} style={{ marginBottom: COLUMN_GAP }} />
        ))}
      </View>
    </View>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  icon,
  value,
  label,
  iconColor,
  bgColor,
  textColor,
  subColor,
}: {
  icon: string;
  value: string;
  label: string;
  iconColor: string;
  bgColor: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={[statStyles.card, { backgroundColor: bgColor, flex: 1 }]}>
      <View style={[statStyles.iconWrap, { backgroundColor: iconColor + '18' }]}>
        <MaterialIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={[statStyles.value, { color: textColor }]}>{value}</Text>
      <Text style={[statStyles.label, { color: subColor }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 6,
    ...Shadow.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
});

// ── Main screen ─────────────────────────────────────────────────────────────

interface SellerProfile {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export default function SellerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const { ids: favoriteIds, toggle: toggleFav } = useFavoriteIds();

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll-driven header opacity
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [0, COVER_H - 60], outputRange: [0, 1], extrapolate: 'clamp' });

  const load = useCallback(async (quiet = false) => {
    if (!id) return;
    if (!quiet) setPageLoading(true);

    const [profileRes, adsRes] = await Promise.all([
      getSupabaseClient()
        .from('user_profiles')
        .select('id, username, email, phone, avatar_url, is_verified')
        .eq('id', id)
        .single(),
      fetchAds({ userId: id, limit: 60 }),
    ]);

    if (!profileRes.error && profileRes.data) setSeller(profileRes.data as SellerProfile);
    setAds(adsRes.data ?? []);
    setPageLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  // ── Derived display values ──
  const isPhoneUser = (seller?.email ?? '').includes('@sms.souqqalqilya.local');
  const displayName = seller?.username ||
    (isPhoneUser
      ? (seller?.phone || (seller?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : (seller?.email?.split('@')[0] ?? (isAr ? 'بائع' : 'Seller')));

  const initials = displayName.slice(0, 2).toUpperCase();

  const joinDate = null; // created_at not available in user_profiles

  // ── Render ad item ──
  const renderItem = useCallback(({ item }: { item: Ad }) => (
    <AdCard
      ad={item}
      width={CARD_W}
      isFavorited={favoriteIds.has(item.id)}
      onFavoritePress={toggleFav}
    />
  ), [favoriteIds, toggleFav]);

  const keyExtractor = useCallback((item: Ad) => item.id, []);

  // ── List Header ──
  const ListHeader = (
    <View>
      {/* ── Cover + Avatar ─────────────────────────────────────────────── */}
      <View style={styles.coverWrap}>
        <LinearGradient
          colors={
            isDark
              ? ['#064d40', '#0a7a65', '#0DB896']
              : ['#054035', '#0A6E5C', '#0eb896']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverGradient}
        >
          {/* Decorative circles */}
          <View style={styles.deco1} />
          <View style={styles.deco2} />
          <View style={styles.deco3} />
        </LinearGradient>

        {/* Avatar */}
        <View style={[styles.avatarShell, { borderColor: colors.background, ...Shadow.lg }]}>
          {seller?.avatar_url ? (
            <Image
              source={{ uri: seller.avatar_url }}
              style={styles.avatarImg}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <LinearGradient
              colors={['#0A6E5C', '#0D9176']}
              style={styles.avatarImg}
            >
              <Text style={styles.avatarInitials}>{initials}</Text>
            </LinearGradient>
          )}
        </View>

        {/* Verified badge on avatar */}
        {seller?.is_verified ? (
          <View style={[styles.verifiedBadge, { borderColor: colors.background }]}>
            <MaterialIcons name="verified" size={13} color="#fff" />
          </View>
        ) : null}
      </View>

      {/* ── Name + Join Date ────────────────────────────────────────────── */}
      <View style={[styles.identityBlock, { backgroundColor: colors.background }]}>
        <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
        {joinDate ? (
          <View style={styles.joinRow}>
            <MaterialIcons name="calendar-today" size={12} color={colors.textMuted} />
            <Text style={[styles.joinText, { color: colors.textMuted }]}>
              {isAr ? `عضو منذ ${joinDate}` : `Member since ${joinDate}`}
            </Text>
          </View>
        ) : null}
        {seller?.is_verified ? (
          <View style={[styles.verifiedPill, { backgroundColor: '#DBEAFE' }]}>
            <MaterialIcons name="verified" size={11} color="#2563EB" />
            <Text style={[styles.verifiedLabel, { color: '#1D4ED8' }]}>
              {isAr ? 'بائع موثّق' : 'Verified Seller'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Stats Dashboard ─────────────────────────────────────────────── */}
      <View style={[styles.statsRow, { backgroundColor: colors.background }]}>
        <StatCard
          icon="storefront"
          value={String(ads.length)}
          label={isAr ? 'إعلان نشط' : ads.length === 1 ? 'Active listing' : 'Active listings'}
          iconColor={colors.primary}
          bgColor={colors.surface}
          textColor={colors.textPrimary}
          subColor={colors.textMuted}
        />
        <StatCard
          icon="star"
          value="4.8"
          label={isAr ? 'تقييم البائع' : 'Seller rating'}
          iconColor="#F59E0B"
          bgColor={colors.surface}
          textColor={colors.textPrimary}
          subColor={colors.textMuted}
        />
      </View>

      {/* ── Listings tab bar ─────────────────────────────────────────────── */}
      {ads.length > 0 ? (
        <View style={[styles.tabBar, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}>
          <View style={[styles.tabActive, { borderBottomColor: colors.primary }]}>
            <MaterialIcons name="grid-view" size={15} color={colors.primary} />
            <Text style={[styles.tabActiveText, { color: colors.primary }]}>
              {isAr ? `الإعلانات (${ads.length})` : `Listings (${ads.length})`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Spacer before grid ───────────────────────────────────────────── */}
      <View style={{ height: Spacing.sm, backgroundColor: colors.background }} />
    </View>
  );

  // ── Full-page skeleton while loading ──
  if (pageLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SellerSkeleton colors={colors} />
        {/* Back button */}
        <View style={[styles.backBar, { top: insets.top + 8 }]}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Animated sticky header (appears on scroll) ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            paddingTop: insets.top,
            backgroundColor: colors.primary,
            opacity: headerOpacity,
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.stickyTitle} numberOfLines={1}>{displayName}</Text>
      </Animated.View>

      {/* ── Back button (always visible) ── */}
      <View style={[styles.backBar, { top: insets.top + 8 }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
      </View>

      {/* ── Main FlatList ── */}
      <Animated.FlatList<Ad>
        data={ads}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={8}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="storefront" size={38} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {isAr ? 'لا توجد إعلانات نشطة' : 'No active listings'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {isAr ? 'لم يقم هذا البائع بنشر أي إعلانات بعد' : 'This seller has no listings yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Sticky header ──
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingBottom: 14,
    paddingHorizontal: H_PAD,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  stickyTitle: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
    marginLeft: 52, // leave space for back button
  },

  // ── Back button ──
  backBar: {
    position: 'absolute',
    left: H_PAD,
    zIndex: 30,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },

  // ── Cover / Avatar ──
  coverWrap: {
    alignItems: 'center',
    position: 'relative',
    marginBottom: AVATAR_SIZE / 2 + 8,
  },
  coverGradient: {
    width: '100%',
    height: COVER_H,
    overflow: 'hidden',
    position: 'relative',
  },
  deco1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -70,
    right: -50,
  },
  deco2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -60,
    left: -30,
  },
  deco3: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: 30,
    left: SCREEN_W * 0.4,
  },
  avatarShell: {
    position: 'absolute',
    bottom: -(AVATAR_SIZE / 2 + 4),
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    borderWidth: 4,
    overflow: 'hidden',
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -(AVATAR_SIZE / 2 - 6),
    right: SCREEN_W / 2 - (AVATAR_SIZE / 2) - 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    zIndex: 5,
  },

  // ── Identity block ──
  identityBlock: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    paddingBottom: Spacing.lg,
    paddingHorizontal: H_PAD,
  },
  sellerName: {
    fontSize: FontSize.xl + 2,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  joinText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 2,
  },
  verifiedLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
    paddingHorizontal: H_PAD,
    paddingBottom: Spacing.lg,
  },

  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    borderBottomWidth: 1,
  },
  tabActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    paddingHorizontal: 4,
  },
  tabActiveText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // ── FlatList ──
  listContent: {
    paddingHorizontal: H_PAD,
  },
  row: {
    gap: COLUMN_GAP,
    marginBottom: COLUMN_GAP,
  },

  // ── Empty ──
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
    paddingHorizontal: H_PAD,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
  },
});
