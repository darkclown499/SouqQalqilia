import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, RefreshControl,
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

interface SellerProfile {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at?: string;
}

const COLUMN_GAP = Spacing.sm;

export default function SellerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  const { ids: favoriteIds, toggle: toggleFav } = useFavoriteIds();

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalAds, setTotalAds] = useState(0);

  const loadSeller = useCallback(async () => {
    if (!id) return;
    setLoadingProfile(true);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
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
    setTotalAds(data.length);
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

  // Derived seller display name
  const isPhoneUser = (seller?.email ?? '').includes('@sms.souqqalqilya.local');
  const displayName = seller?.username ||
    (isPhoneUser
      ? (seller?.phone || (seller?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : (seller?.email?.split('@')[0] ?? (isAr ? 'بائع' : 'Seller')));

  // Join date
  const joinDate = seller?.created_at
    ? new Date(seller.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long' })
    : null;

  // ── FlatList two-column renderItem ──
  const renderItem = useCallback(({ item, index }: { item: Ad; index: number }) => (
    <View style={[
      styles.cardWrapper,
      index % 2 === 0
        ? { marginRight: COLUMN_GAP / 2 }
        : { marginLeft: COLUMN_GAP / 2 },
    ]}>
      <AdCard
        ad={item}
        isFavorited={favoriteIds.has(item.id)}
        onFavoritePress={toggleFav}
      />
    </View>
  ), [favoriteIds, toggleFav]);

  const keyExtractor = useCallback((item: Ad) => item.id, []);

  // ── Header component ──
  const ListHeader = () => {
    if (loadingProfile) {
      return (
        <View style={[styles.profileSkeleton, { backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (!seller) return null;

    return (
      <View style={[styles.profileCard, { backgroundColor: colors.surface, ...Shadow.sm }]}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          {seller.avatar_url ? (
            <Image
              source={{ uri: seller.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarLetter}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Verified badge overlay */}
          {seller.is_verified ? (
            <View style={[styles.verifiedBadge, { backgroundColor: '#2563EB' }]}>
              <MaterialIcons name="verified" size={12} color="#fff" />
            </View>
          ) : null}
        </View>

        {/* Info */}
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.sellerName, { color: colors.textPrimary }]}>
              {displayName}
            </Text>
            {seller.is_verified ? (
              <View style={[styles.verifiedPill, { backgroundColor: '#DBEAFE' }]}>
                <MaterialIcons name="verified" size={12} color="#2563EB" />
                <Text style={[styles.verifiedText, { color: '#1D4ED8' }]}>
                  {isAr ? 'موثّق' : 'Verified'}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {/* Active listings count */}
            <View style={[styles.statChip, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="storefront" size={13} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.primary }]}>
                {totalAds} {isAr ? 'إعلان' : totalAds === 1 ? 'listing' : 'listings'}
              </Text>
            </View>

            {/* Join date */}
            {joinDate ? (
              <View style={[styles.statChip, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="calendar-today" size={13} color={colors.textMuted} />
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  {isAr ? `عضو منذ ${joinDate}` : `Member since ${joinDate}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Divider + section title */}
        <View style={[styles.sectionDivider, { borderTopColor: colors.border }]}>
          <MaterialIcons name="storefront" size={15} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {isAr ? `إعلانات ${displayName}` : `${displayName}'s Listings`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      {/* Back button */}
      <View style={[styles.backWrap, { top: insets.top + 10 }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: colors.surface, ...Shadow.sm }]} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {loadingProfile ? (isAr ? 'ملف البائع' : 'Seller Profile') : displayName}
        </Text>
      </View>

      {/* Main list */}
      <FlatList<Ad>
        data={ads}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 64 },
        ]}
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
              <MaterialIcons name="storefront" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد إعلانات نشطة' : 'No active listings'}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Back header
  backWrap: {
    position: 'absolute', left: Spacing.md, right: Spacing.md, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg, fontWeight: '700',
    flex: 1,
  },

  // Profile card
  profileCard: {
    borderRadius: Radius.xl,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  profileSkeleton: {
    height: 160, borderRadius: Radius.xl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarSection: {
    alignSelf: 'center',
    position: 'relative',
    width: 88, height: 88,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
  },
  avatarFallback: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 36, fontWeight: '800', color: '#fff',
  },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  profileInfo: {
    gap: Spacing.sm, alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, justifyContent: 'center', flexWrap: 'wrap',
  },
  sellerName: {
    fontSize: FontSize.xl, fontWeight: '800',
    textAlign: 'center',
  },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  verifiedText: { fontSize: FontSize.xs, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: Spacing.sm, justifyContent: 'center',
  },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  statLabel: { fontSize: FontSize.xs, fontWeight: '600' },

  // Section divider inside card
  sectionDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderTopWidth: 1, paddingTop: Spacing.md, marginTop: 4,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700' },

  // FlatList
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  row: {
    gap: COLUMN_GAP,
    marginBottom: COLUMN_GAP,
  },
  cardWrapper: { flex: 1 },

  emptyWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.xxl, gap: Spacing.md,
  },
  emptyText: { fontSize: FontSize.md, fontWeight: '500' },
});
