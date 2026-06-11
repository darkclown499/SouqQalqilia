import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  RefreshControl, Dimensions, Animated, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getSupabaseClient, useAuth } from '@/template';
import { fetchAds, Ad } from '@/services/adsService';
import { AdCard } from '@/components/feature/AdCard';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 16;
const COLUMN_GAP = 10;
const CARD_W = (SCREEN_W - H_PAD * 2 - COLUMN_GAP) / 2;
const COVER_H = 220;
const AVATAR_SIZE = 96;

// ── Skeleton shimmer ─────────────────────────────────────────────────────────
function SkeletonBox({ w = '100%' as number | string, h, br = 8, baseColor, style }: {
  w?: number | string; h: number; br?: number; baseColor: string; style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  return (
    <Animated.View style={[{ width: w as any, height: h, borderRadius: br, backgroundColor: baseColor, opacity }, style]} />
  );
}

function SellerSkeleton({ colors }: { colors: any }) {
  const base = colors.surfaceTint;
  const dark = colors.border;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SkeletonBox w={SCREEN_W} h={COVER_H} br={0} baseColor={dark} />
      <View style={{ alignItems: 'center', marginTop: -(AVATAR_SIZE / 2) - 4, marginBottom: 20, gap: 12 }}>
        <SkeletonBox w={AVATAR_SIZE + 8} h={AVATAR_SIZE + 8} br={(AVATAR_SIZE + 8) / 2} baseColor={dark} />
        <SkeletonBox w={160} h={20} br={10} baseColor={base} />
        <SkeletonBox w={110} h={14} br={6} baseColor={base} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: H_PAD, marginBottom: 20 }}>
        {[1, 2, 3].map(i => (
          <SkeletonBox key={i} w={(SCREEN_W - H_PAD * 2 - 20) / 3} h={88} br={18} baseColor={base} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: H_PAD, gap: COLUMN_GAP }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} w={CARD_W} h={200} br={14} baseColor={base} style={{ marginBottom: COLUMN_GAP }} />
        ))}
      </View>
    </View>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({ icon, value, label, color, bg, textColor, subColor }: {
  icon: string; value: string; label: string; color: string;
  bg: string; textColor: string; subColor: string;
}) {
  return (
    <View style={[chipS.wrap, { backgroundColor: bg }]}>
      <View style={[chipS.iconRing, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[chipS.value, { color: textColor }]}>{value}</Text>
      <Text style={[chipS.label, { color: subColor }]}>{label}</Text>
    </View>
  );
}
const chipS = StyleSheet.create({
  wrap: {
    flex: 1, borderRadius: Radius.xl,
    paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', gap: 5,
    ...Shadow.sm,
  },
  iconRing: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.4 },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
});

// ── Info row item ─────────────────────────────────────────────────────────────
function InfoRow({ icon, value, color, bg }: {
  icon: string; value: string; color: string; bg: string;
}) {
  return (
    <View style={infoS.row}>
      <View style={[infoS.icon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon as any} size={15} color={color} />
      </View>
      <Text style={[infoS.text, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const infoS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
});

// ── Seller profile interface ──────────────────────────────────────────────────
interface SellerProfile {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SellerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const { ids: favoriteIds, toggle: toggleFav } = useFavoriteIds();

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [COVER_H - 80, COVER_H - 20], outputRange: [0, 1], extrapolate: 'clamp' });
  const coverScale = scrollY.interpolate({ inputRange: [-80, 0], outputRange: [1.3, 1], extrapolate: 'clamp' });

  const load = useCallback(async (quiet = false) => {
    if (!id) return;
    if (!quiet) setPageLoading(true);
    const [profileRes, adsRes] = await Promise.all([
      getSupabaseClient()
        .from('user_profiles')
        .select('id, username, email, phone, avatar_url, banner_url, is_verified')
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

  // Derived display values
  const isPhoneUser = (seller?.email ?? '').includes('@sms.souqqalqilya.local');
  const displayName = seller?.username ||
    (isPhoneUser
      ? (seller?.phone || (seller?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : (seller?.email?.split('@')[0] ?? (isAr ? 'بائع' : 'Seller')));
  const initials = displayName.slice(0, 2).toUpperCase();

  const activeAds = ads.filter(a => a.status === 'active' || a.status === 'featured');
  const isOwnProfile = user?.id === id;

  const handleWhatsApp = useCallback(() => {
    const phone = seller?.phone?.trim();
    if (!phone) return;
    const sanitized = phone.replace(/[\s\-()]/g, '').replace('+', '');
    Linking.openURL(`https://wa.me/${sanitized}`).catch(() => {});
  }, [seller?.phone]);

  const renderItem = useCallback(({ item }: { item: Ad }) => (
    <AdCard
      ad={item}
      width={CARD_W}
      isFavorited={favoriteIds.has(item.id)}
      onFavoritePress={toggleFav}
    />
  ), [favoriteIds, toggleFav]);

  const keyExtractor = useCallback((item: Ad) => item.id, []);

  const ListHeader = useMemo(() => (
    <View>
      {/* ── COVER PHOTO ── */}
      <View style={styles.coverContainer}>
        <Animated.View style={[styles.coverInner, { transform: [{ scale: coverScale }] }]}>
          {seller?.banner_url ? (
            <Image
              source={{ uri: seller.banner_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={400}
            />
          ) : null}
          <LinearGradient
            colors={
              seller?.banner_url
                ? ['transparent', 'transparent', 'rgba(0,0,0,0.55)']
                : (isDark
                    ? ['#064d40', '#0a7a65', '#0DB896']
                    : ['#054035', '#0A6E5C', '#15a88a'])
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Decorative circles on gradient-only cover */}
          {!seller?.banner_url ? (
            <>
              <View style={styles.deco1} />
              <View style={styles.deco2} />
              <View style={styles.deco3} />
            </>
          ) : null}
        </Animated.View>

        {/* Avatar ring */}
        <View style={[styles.avatarOuter, { borderColor: colors.background, ...Shadow.lg }]}>
          {seller?.avatar_url ? (
            <Image
              source={{ uri: seller.avatar_url }}
              style={styles.avatarImg}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <LinearGradient
              colors={['#0A6E5C', '#0eb896']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarImg}
            >
              <Text style={styles.avatarInitials}>{initials}</Text>
            </LinearGradient>
          )}
        </View>

        {/* Verified checkmark on avatar */}
        {seller?.is_verified ? (
          <View style={[styles.verifiedDot, { borderColor: colors.background }]}>
            <MaterialIcons name="verified" size={12} color="#fff" />
          </View>
        ) : null}
      </View>

      {/* ── IDENTITY ── */}
      <View style={[styles.identityBlock, { backgroundColor: colors.background }]}>
        {/* Name row */}
        <View style={styles.nameRow}>
          <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          {seller?.is_verified ? (
            <MaterialIcons name="verified" size={20} color="#2563EB" />
          ) : null}
        </View>

        {/* Verified label */}
        {seller?.is_verified ? (
          <View style={[styles.verifiedPill, { backgroundColor: '#DBEAFE' }]}>
            <MaterialIcons name="shield" size={11} color="#2563EB" />
            <Text style={[styles.verifiedLabel, { color: '#1D4ED8' }]}>
              {isAr ? 'بائع موثّق ومعتمد' : 'Verified & Trusted Seller'}
            </Text>
          </View>
        ) : (
          <View style={[styles.memberPill, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="person" size={11} color={colors.primary} />
            <Text style={[styles.verifiedLabel, { color: colors.primary }]}>
              {isAr ? 'عضو في سوق قلقيلية' : 'Souq Qalqilya Member'}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {!isOwnProfile && seller?.phone ? (
          <Pressable
            style={({ pressed }) => [styles.waButton, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleWhatsApp}
          >
            <View style={styles.waIconBadge}>
              <MaterialIcons name="whatsapp" size={18} color="#fff" />
            </View>
            <Text style={styles.waButtonText}>
              {isAr ? 'تواصل عبر واتساب' : 'Contact via WhatsApp'}
            </Text>
            <MaterialIcons name={isAr ? 'chevron-left' : 'chevron-right'} size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        ) : null}

        {/* Edit own profile shortcut */}
        {isOwnProfile ? (
          <Pressable
            style={({ pressed }) => [styles.editProfileBtn, { backgroundColor: colors.primaryGhost, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <MaterialIcons name="edit" size={15} color={colors.primary} />
            <Text style={[styles.editProfileBtnText, { color: colors.primary }]}>
              {isAr ? 'تعديل ملفي الشخصي' : 'Edit My Profile'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── STATS ── */}
      <View style={[styles.statsSection, { backgroundColor: colors.background }]}>
        <View style={styles.statsRow}>
          <StatChip
            icon="storefront"
            value={String(activeAds.length)}
            label={isAr ? 'إعلان نشط' : 'Listings'}
            color={colors.primary}
            bg={colors.surface}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
          />
          <StatChip
            icon="sell"
            value={String(ads.length)}
            label={isAr ? 'إجمالي الإعلانات' : 'Total Ads'}
            color="#7C3AED"
            bg={colors.surface}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
          />
          <StatChip
            icon="star-rate"
            value="★ جديد"
            label={isAr ? 'التقييم' : 'Rating'}
            color="#F59E0B"
            bg={colors.surface}
            textColor={colors.textPrimary}
            subColor={colors.textMuted}
          />
        </View>
      </View>

      {/* ── LISTINGS HEADER ── */}
      {ads.length > 0 ? (
        <View style={[styles.sectionHeader, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}>
          <View style={[styles.sectionIconWrap, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="grid-view" size={15} color={colors.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {isAr ? 'إعلانات البائع' : 'Seller Listings'}
          </Text>
          <View style={[styles.countPill, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[styles.countPillText, { color: colors.primary }]}>{activeAds.length}</Text>
          </View>
        </View>
      ) : null}

      <View style={{ height: Spacing.sm }} />
    </View>
  ), [
    ads.length, activeAds.length, colors, displayName, initials, isAr, isDark,
    seller?.avatar_url, seller?.banner_url, seller?.is_verified, seller?.phone,
    isOwnProfile, handleWhatsApp, coverScale, router,
  ]);

  if (pageLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SellerSkeleton colors={colors} />
        <View style={[styles.backBar, { top: insets.top + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky header on scroll */}
      <Animated.View
        style={[styles.stickyHeader, { paddingTop: insets.top, backgroundColor: colors.primary, opacity: headerOpacity }]}
        pointerEvents="none"
      >
        <View style={styles.stickyContent}>
          {seller?.avatar_url ? (
            <Image source={{ uri: seller.avatar_url }} style={styles.stickyAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.stickyAvatarPh, { backgroundColor: colors.primaryDark }]}>
              <Text style={styles.stickyAvatarText}>{initials.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.stickyTitle} numberOfLines={1}>{displayName}</Text>
          {seller?.is_verified ? (
            <MaterialIcons name="verified" size={14} color="rgba(255,255,255,0.85)" />
          ) : null}
        </View>
      </Animated.View>

      {/* Back button */}
      <View style={[styles.backBar, { top: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
      </View>

      {/* FlatList */}
      <Animated.FlatList<Ad>
        data={activeAds}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl, paddingHorizontal: H_PAD }}
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
            <LinearGradient
              colors={[colors.primaryGhost, colors.surfaceTint]}
              style={styles.emptyIconWrap}
            >
              <MaterialIcons name="storefront" size={42} color={colors.primary} />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {isAr ? 'لا توجد إعلانات نشطة' : 'No Active Listings'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {isAr
                ? 'لم يقم هذا البائع بنشر أي إعلانات بعد'
                : 'This seller has no active listings yet'}
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
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingBottom: 14, paddingHorizontal: H_PAD,
  },
  stickyContent: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginLeft: 52, // space for back button
  },
  stickyAvatar: { width: 28, height: 28, borderRadius: 14 },
  stickyAvatarPh: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stickyAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stickyTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', flex: 1 },

  // ── Back button ──
  backBar: { position: 'absolute', left: H_PAD, zIndex: 30 },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.sm,
  },

  // ── Cover ──
  coverContainer: {
    height: COVER_H,
    alignItems: 'center',
    marginBottom: AVATAR_SIZE / 2 + 16,
    overflow: 'visible',
  },
  coverInner: {
    width: '100%',
    height: COVER_H,
    overflow: 'hidden',
  },
  deco1: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -90, right: -60,
  },
  deco2: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -70, left: -40,
  },
  deco3: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)', top: 40, left: SCREEN_W * 0.38,
  },

  // Avatar
  avatarOuter: {
    position: 'absolute',
    bottom: -(AVATAR_SIZE / 2 + 10),
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    borderWidth: 4,
    overflow: 'hidden',
    zIndex: 10,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: '#fff' },
  verifiedDot: {
    position: 'absolute',
    bottom: -(AVATAR_SIZE / 2 - 4),
    right: SCREEN_W / 2 - AVATAR_SIZE / 2 - 12,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, zIndex: 15,
  },

  // ── Identity ──
  identityBlock: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: Spacing.lg,
    paddingHorizontal: H_PAD,
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    justifyContent: 'center',
  },
  sellerName: {
    fontSize: FontSize.xl + 3,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  memberPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  verifiedLabel: { fontSize: FontSize.xs, fontWeight: '700' },

  // WA button
  waButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#25D366',
    borderRadius: Radius.xl,
    paddingHorizontal: 18, paddingVertical: 13,
    gap: 10, marginTop: 4,
    width: '90%',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  waIconBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  waButtonText: { flex: 1, color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  // Edit profile button
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: Radius.lg, paddingHorizontal: 18, paddingVertical: 12,
    marginTop: 4, width: '90%', justifyContent: 'center',
  },
  editProfileBtnText: { fontSize: FontSize.sm, fontWeight: '700' },

  // ── Stats ──
  statsSection: {
    paddingHorizontal: H_PAD,
    paddingBottom: Spacing.lg,
    paddingTop: 4,
  },
  statsRow: { flexDirection: 'row', gap: 10 },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: H_PAD, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  countPill: {
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },
  countPillText: { fontSize: FontSize.xs, fontWeight: '800' },

  // ── FlatList row ──
  row: { gap: COLUMN_GAP, marginBottom: COLUMN_GAP },

  // ── Empty ──
  emptyWrap: {
    alignItems: 'center', paddingVertical: 60,
    gap: Spacing.md, paddingHorizontal: H_PAD * 2,
  },
  emptyIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: {
    fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm, textAlign: 'center', lineHeight: 21, maxWidth: 260,
  },
});
