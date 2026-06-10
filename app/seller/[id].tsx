
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
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
const H_PAD = Spacing.md;
const COLUMN_GAP = Spacing.sm;
const CARD_W = (SCREEN_W - H_PAD * 2 - COLUMN_GAP) / 2;

interface SellerProfile {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at?: string;
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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSeller = useCallback(async () => {
    if (!id) return;
    setLoadingProfile(true);
    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .select('id, username, email, phone, avatar_url, is_verified, created_at')
      .eq('id', id)
      .single();
    if (!error && data) setSeller(data as SellerProfile);
    setLoadingProfile(false);
  }, [id]);

  const loadAds = useCallback(async () => {
    if (!id) return;
    setLoadingAds(true);
    const { data } = await fetchAds({ userId: id, limit: 50 });
    setAds(data);
    setLoadingAds(false);
  }, [id]);

  useEffect(() => {
    loadSeller();
    loadAds();
  }, [loadSeller, loadAds]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSeller(), loadAds()]);
    setRefreshing(false);
  };

  // Derived
  const isPhoneUser = (seller?.email ?? '').includes('@sms.souqqalqilya.local');
  const displayName = seller?.username ||
    (isPhoneUser
      ? (seller?.phone || (seller?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : (seller?.email?.split('@')[0] ?? (isAr ? 'بائع' : 'Seller')));

  const joinDate = seller?.created_at
    ? new Date(seller.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long' })
    : null;

  const avatarLetter = displayName.charAt(0).toUpperCase();

  // ── Render ad item ──
  const renderItem = useCallback(({ item }: { item: Ad }) => (
    <View style={{ flex: 1 }}>
      <AdCard
        ad={item}
        width={CARD_W}
        isFavorited={favoriteIds.has(item.id)}
        onFavoritePress={toggleFav}
      />
    </View>
  ), [favoriteIds, toggleFav]);

  const keyExtractor = useCallback((item: Ad) => item.id, []);

  // ── Profile header ──
  const ListHeader = useCallback(() => (
    <View style={styles.headerCard}>
      {/* Cover band */}
      <View style={[styles.coverBand, { backgroundColor: colors.primary }]}>
        {/* Decorative circles */}
        <View style={[styles.coverCircle1, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />
        <View style={[styles.coverCircle2, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      </View>

      {/* Avatar overlapping the cover */}
      <View style={styles.avatarArea}>
        {loadingProfile ? (
          <View style={[styles.avatarRing, { borderColor: colors.background }]}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceTint }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          </View>
        ) : seller?.avatar_url ? (
          <View style={[styles.avatarRing, { borderColor: colors.background }]}>
            <Image
              source={{ uri: seller.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          </View>
        ) : (
          <View style={[styles.avatarRing, { borderColor: colors.background }]}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarLetter}>{avatarLetter}</Text>
            </View>
          </View>
        )}

        {/* Verified badge */}
        {seller?.is_verified ? (
          <View style={[styles.verifiedBadge, { borderColor: colors.background }]}>
            <MaterialIcons name="verified" size={14} color="#fff" />
          </View>
        ) : null}
      </View>

      {/* Name + badges */}
      <View style={[styles.infoBlock, { backgroundColor: colors.surface }]}>
        {!loadingProfile && seller ? (
          <>
            {/* Name row */}
            <View style={styles.nameRow}>
              <Text style={[styles.sellerName, { color: colors.textPrimary }]}>
                {displayName}
              </Text>
              {seller.is_verified ? (
                <View style={[styles.verifiedPill, { backgroundColor: '#DBEAFE' }]}>
                  <MaterialIcons name="verified" size={12} color="#2563EB" />
                  <Text style={[styles.verifiedLabel, { color: '#1D4ED8' }]}>
                    {isAr ? 'موثّق' : 'Verified'}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {/* Listings count */}
              <View style={[styles.statCard, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="storefront" size={18} color={colors.primary} />
                <Text style={[styles.statValue, { color: colors.primary }]}>{ads.length}</Text>
                <Text style={[styles.statLabel, { color: colors.primary }]}>
                  {isAr ? 'إعلان' : ads.length === 1 ? 'listing' : 'listings'}
                </Text>
              </View>

              {/* Member since */}
              {joinDate ? (
                <View style={[styles.statCard, { backgroundColor: colors.surfaceTint, flex: 2 }]}>
                  <MaterialIcons name="calendar-today" size={18} color={colors.textSecondary} />
                  <View>
                    <Text style={[styles.statValue, { color: colors.textPrimary, fontSize: FontSize.sm }]}>
                      {joinDate}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                      {isAr ? 'تاريخ الانضمام' : 'Member since'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.lg }} />
        )}
      </View>

      {/* Section title */}
      {!loadingAds && ads.length > 0 ? (
        <View style={[styles.sectionTitle, { backgroundColor: colors.surface, borderTopColor: colors.borderLight }]}>
          <MaterialIcons name="storefront" size={15} color={colors.primary} />
          <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]}>
            {isAr ? `إعلانات ${displayName}` : `${displayName}'s Listings`}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[styles.countBadgeText, { color: colors.primary }]}>{ads.length}</Text>
          </View>
        </View>
      ) : null}
    </View>
  ), [seller, loadingProfile, loadingAds, ads.length, displayName, joinDate, colors, isAr, avatarLetter]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Fixed back button ── */}
      <View style={[styles.backBar, { top: insets.top + 8 }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
        <View style={[styles.backTitleWrap, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
          <Text style={styles.backTitle} numberOfLines={1}>
            {loadingProfile ? (isAr ? 'ملف البائع' : 'Seller Profile') : displayName}
          </Text>
        </View>
      </View>

      {/* ── FlatList ── */}
      <FlatList<Ad>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          !loadingAds ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="storefront" size={36} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                {isAr ? 'لا توجد إعلانات نشطة' : 'No active listings'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {isAr ? 'لم يقم هذا البائع بنشر أي إعلانات بعد' : 'This seller has no listings yet'}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          )
        }
      />
    </View>
  );
}

const COVER_H = 140;
const AVATAR_SIZE = 90;
const AVATAR_OFFSET = AVATAR_SIZE / 2;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Back bar (overlay) ──
  backBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTitleWrap: {
    flex: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backTitle: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // ── Header card ──
  headerCard: {
    marginBottom: Spacing.md,
  },

  // Cover band
  coverBand: {
    height: COVER_H,
    overflow: 'hidden',
    position: 'relative',
  },
  coverCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -60,
    right: -40,
  },
  coverCircle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -50,
    left: 20,
  },

  // Avatar overlapping cover
  avatarArea: {
    position: 'absolute',
    top: COVER_H - AVATAR_OFFSET,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  avatarRing: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 3,
    overflow: 'hidden',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: SCREEN_W / 2 - AVATAR_OFFSET - 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  // Info block
  infoBlock: {
    paddingTop: AVATAR_OFFSET + Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: H_PAD,
    gap: Spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sellerName: {
    fontSize: FontSize.xl + 2,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  verifiedLabel: { fontSize: FontSize.xs, fontWeight: '700' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    lineHeight: 20,
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },

  // Section title inside header
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: H_PAD,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  sectionTitleText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  countBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countBadgeText: {
    fontSize: FontSize.xs,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
