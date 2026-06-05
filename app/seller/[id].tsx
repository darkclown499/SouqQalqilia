import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import { AdCard, EmptyState } from '@/components';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { fetchOrCreateConversation } from '@/services/chatService';
import { useAlert } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { timeAgoLong } from '@/utils/timeAgo';
import type { Ad } from '@/services/adsService';

const { width } = Dimensions.get('window');
const CARD_W = (width - Spacing.lg * 2 - Spacing.sm) / 2;

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
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const isAr = language === 'ar';

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const supabase = getSupabaseClient();

    Promise.all([
      supabase
        .from('user_profiles')
        .select('id, username, email, phone, avatar_url, is_verified')
        .eq('id', id)
        .single(),
      supabase
        .from('ads')
        .select(`
          id, user_id, category_id, title, price, location, condition,
          status, views, created_at, boosted_until, serial_number,
          categories(id, name, name_ar, icon, color),
          ad_images(id, url, position)
        `)
        .eq('user_id', id)
        .in('status', ['active', 'featured'])
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([profileRes, adsRes]) => {
      if (profileRes.data) setSeller(profileRes.data as SellerProfile);
      setAds((adsRes.data ?? []) as Ad[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleMessage = useCallback(async () => {
    if (!user) return router.push('/login');
    if (!seller || !ads[0]) return;
    // Find the first active ad to create a conversation around
    const targetAd = ads[0];
    setChatLoading(true);
    const { data, error } = await fetchOrCreateConversation(targetAd.id, seller.id);
    setChatLoading(false);
    if (error || !data) return showAlert(isAr ? 'خطأ' : 'Error', error ?? 'Failed to start chat');
    router.push(`/chat/${data.id}`);
  }, [user, seller, ads, router, showAlert, isAr]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!seller) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="person-off" size={52} color={colors.textMuted} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          {isAr ? 'المستخدم غير موجود' : 'User not found'}
        </Text>
        <Pressable style={[styles.backPill, { backgroundColor: colors.primaryGhost }]} onPress={() => router.back()}>
          <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={16} color={colors.primary} />
          <Text style={[styles.backPillText, { color: colors.primary }]}>
            {isAr ? 'رجوع' : 'Go Back'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const isPhoneUser = (seller.email ?? '').includes('@sms.souqqalqilya.local');
  const sellerName = seller.username ||
    (isPhoneUser
      ? (seller.phone || seller.email.replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : seller.email.split('@')[0]);
  const isOwn = user?.id === seller.id;
  const activeCount = ads.length;

  const renderAd = useCallback(({ item, index }: { item: Ad; index: number }) => (
    <View style={[styles.adWrapper, index % 2 === 0 ? { marginRight: Spacing.sm / 2 } : { marginLeft: Spacing.sm / 2 }]}>
      <AdCard
        ad={item}
        width={CARD_W}
        isFavorited={favIds.has(item.id)}
        onFavoritePress={user ? toggleFav : undefined}
      />
    </View>
  ), [favIds, user, toggleFav]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <FlatList
        data={ads}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={8}
        renderItem={renderAd}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* Back button */}
            <Pressable style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
            </Pressable>

            {/* Hero section */}
            <View style={[styles.hero, { backgroundColor: colors.primary }]}>
              {/* Avatar */}
              {seller.avatar_url ? (
                <Image source={{ uri: seller.avatar_url }} style={styles.avatar} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={styles.avatarInitial}>{sellerName.charAt(0).toUpperCase()}</Text>
                </View>
              )}

              {/* Name + badges */}
              <Text style={styles.sellerName} numberOfLines={1}>{sellerName}</Text>

              <View style={styles.badgesRow}>
                {seller.is_verified ? (
                  <View style={[styles.badge, { backgroundColor: 'rgba(37,99,235,0.35)' }]}>
                    <MaterialIcons name="verified" size={12} color="#93C5FD" />
                    <Text style={[styles.badgeText, { color: '#BFDBFE' }]}>
                      {isAr ? 'موثّق' : 'Verified'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Stats */}
              <View style={[styles.statsRow, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
                <View style={styles.statItem}>
                  <Text style={styles.statNum}>{activeCount}</Text>
                  <Text style={styles.statLabel}>{isAr ? 'إعلان نشط' : 'Active Ads'}</Text>
                </View>
              </View>
            </View>

            {/* Contact button (only for non-owners with at least one active ad) */}
            {!isOwn && ads.length > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.msgBtn, { backgroundColor: colors.primary, opacity: pressed || chatLoading ? 0.85 : 1 }]}
                onPress={handleMessage}
                disabled={chatLoading}
              >
                {chatLoading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="chat-bubble-outline" size={18} color="#fff" />}
                <Text style={styles.msgBtnText}>
                  {chatLoading ? (isAr ? 'جاري الفتح...' : 'Opening...') : (isAr ? 'مراسلة البائع' : 'Message Seller')}
                </Text>
              </Pressable>
            ) : null}

            {/* Listings section title */}
            <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="storefront" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {isAr ? 'إعلانات البائع' : 'Seller Listings'}
              </Text>
              {activeCount > 0 ? (
                <View style={[styles.countPill, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.countPillText, { color: colors.primary }]}>{activeCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <EmptyState
              icon="storefront"
              title={isAr ? 'لا توجد إعلانات نشطة' : 'No active listings'}
              subtitle={isAr ? 'لا يملك هذا البائع إعلانات نشطة حالياً' : 'This seller has no active listings right now'}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { fontSize: FontSize.lg, fontWeight: '600' },
  backPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full,
  },
  backPillText: { fontSize: FontSize.sm, fontWeight: '700' },

  // Header wrapper
  headerWrap: { marginBottom: Spacing.md },
  backBtn: {
    position: 'absolute', zIndex: 10,
    top: Spacing.md, left: Spacing.md,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center', paddingTop: 56,
    paddingBottom: Spacing.xxl, paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#fff' },
  sellerName: {
    fontSize: FontSize.xl, fontWeight: '800', color: '#fff',
    letterSpacing: -0.3, textAlign: 'center',
  },
  badgesRow: { flexDirection: 'row', gap: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.xl, paddingVertical: 12, paddingHorizontal: Spacing.xxl,
    width: '80%', marginTop: 4,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)' },

  // Message button
  msgBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: Spacing.lg, marginTop: -Spacing.xl,
    paddingVertical: 14, borderRadius: Radius.xl,
    ...Shadow.colored,
  },
  msgBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  // Section
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: Spacing.lg, paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  countPill: {
    borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3,
  },
  countPillText: { fontSize: FontSize.xs, fontWeight: '700' },

  // Ads grid
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  adWrapper: { flex: 1, marginBottom: Spacing.sm },
});
