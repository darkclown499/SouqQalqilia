import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Dimensions,
  ActivityIndicator, Linking, Modal, Share, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert } from '@/template';
import { Button, Badge } from '@/components';
import { fetchAdById, fetchAds, clearAdsCache, Ad, AdImage, updateAdStatus, reportAd } from '@/services/adsService';
import { blockUser, isUserBlocked, unblockUser } from '@/services/blockService';
import { fetchOrCreateConversation } from '@/services/chatService';
import { getSupabaseClient } from '@/template';
import { PromotionModal } from '@/components/feature/PromotionModal';
import { ImageZoomGallery } from '@/components/feature/ImageZoomGallery';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ShimmerBlock } from '@/components/feature/AdCard';
import { useLanguage } from '@/hooks/useLanguage';
import { timeAgoLong } from '@/utils/timeAgo';

const { width } = Dimensions.get('window');

function formatPrice(price: number) {
  return price === 0 ? 'Free' : `₪${price.toLocaleString()}`;
}

const REPORT_REASONS = [
  { key: 'fraud', icon: 'report-problem' as const },
  { key: 'inappropriate', icon: 'block' as const },
  { key: 'duplicate', icon: 'content-copy' as const },
  { key: 'abusive_user', icon: 'warning' as const },
  { key: 'other', icon: 'more-horiz' as const },
];

export default function AdDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  const { ids: favoriteIds, toggle: toggleFav } = useFavoriteIds();

  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [reportVisible, setReportVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [promoteVisible, setPromoteVisible] = useState(false);
  const [boostModalVisible, setBoostModalVisible] = useState(false);
  const [boostDays, setBoostDays] = useState<1 | 3 | 7>(1);
  const [boosting, setBoosting] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [relatedAds, setRelatedAds] = useState<Ad[]>([]);
  const [sellerAds, setSellerAds] = useState<Ad[]>([]);
  const [sellerVerified, setSellerVerified] = useState(false);
  const [isSellerBlocked, setIsSellerBlocked] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchAdById(id).then(({ data }) => {
      setAd(data);
      setLoading(false);
      if (data?.user_id) {
        getSupabaseClient()
          .from('user_profiles')
          .select('is_verified')
          .eq('id', data.user_id)
          .single()
          .then(({ data: p }) => setSellerVerified(!!p?.is_verified));
        isUserBlocked(data.user_id).then(setIsSellerBlocked);
      }
      if (data?.category_id) {
        fetchAds({ categoryId: data.category_id, limit: 7 }).then(({ data: related }) => {
          setRelatedAds((related ?? []).filter(a => a.id !== id).slice(0, 6));
        });
      }
      if (data?.user_id) {
        fetchAds({ userId: data.user_id, limit: 7 }).then(({ data: sAds }) => {
          setSellerAds((sAds ?? []).filter(a => a.id !== id).slice(0, 5));
        });
      }
    });
  }, [id]);

  const handleBoostAd = async () => {
    if (!ad || !user || boosting) return; // guard against double-tap
    setBoosting(true);
    // Immediately disable the button by keeping `boosting=true` until fully done
    try {
      const boostedUntil = new Date(Date.now() + boostDays * 24 * 60 * 60 * 1000).toISOString();
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('ads')
        .update({ status: 'featured', boosted_until: boostedUntil })
        .eq('id', ad.id);
      if (error) {
        showAlert(isAr ? 'خطأ في التمييز' : 'Boost Error', error.message);
        return;
      }
      // Update local state immediately
      setAd(prev => prev ? { ...prev, status: 'featured', boosted_until: boostedUntil } : prev);
      // Clear ads cache so feed refetches and boosted ad floats to top
      clearAdsCache();
      // Fire-and-forget: no need to block UX on this notification
      // (owner boosting their own ad — no recipient to notify externally)
      setBoostModalVisible(false);
      showAlert(
        isAr ? 'تم التفعيل! ⚡' : 'Boosted! ⚡',
        isAr
          ? `إعلانك مميز الآن لمدة ${boostDays} ${boostDays === 1 ? 'يوم' : 'أيام'}. سيظهر في أعلى قائمة الإعلانات.`
          : `Your ad is now boosted for ${boostDays} ${boostDays === 1 ? 'day' : 'days'}. It will appear at the top of listings.`
      );
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Boost failed');
    } finally {
      setBoosting(false);
    }
  };

  const handleChat = async () => {
    if (!user) return router.push('/login');
    if (!ad) return;
    if (ad.user_id === user.id) return showAlert(t.yourListing, 'You cannot contact yourself.');
    setChatLoading(true);
    const { data, error } = await fetchOrCreateConversation(ad.id, ad.user_id);
    setChatLoading(false);
    if (error || !data) return showAlert('Error', error ?? 'Failed to start chat.');
    router.push(`/chat/${data.id}`);
  };

  const handleWhatsApp = () => {
    if (!user) return router.push('/login');
    if (!ad) return;
    const phone = ad.phone_number?.trim();
    if (!phone) return showAlert(t.noPhoneNumber, t.noPhoneNumberMsg);
    const sanitized = phone.replace(/[\s\-()]/g, '');
    const url = `https://wa.me/${sanitized.replace('+', '')}`;
    Linking.openURL(url).catch(() => showAlert('Error', 'Could not open WhatsApp.'));
  };

  /** Build a shareable HTTPS link that redirects to the app (recognized by WhatsApp/Telegram as clickable) */
  const buildDeepLink = (adId: string): string =>
    `https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/functions/v1/ad-redirect?id=${adId}`;

  const handleShare = async () => {
    if (!ad) return;
    const deepLink = buildDeepLink(ad.id);
    const priceText = ad.price === 0 ? (isAr ? 'مجاني' : 'Free') : `₪${ad.price.toLocaleString()}`;
    try {
      await Share.share({
        title: ad.title,
        message: isAr
          ? `🛒 ${ad.title}\n💰 السعر: ${priceText}\n📍 ${ad.location || 'قلقيلية'}\n\nشاهد الإعلان على سوق قلقيلية:\n${deepLink}`
          : `🛒 ${ad.title}\n💰 Price: ${priceText}\n📍 ${ad.location || 'Qalqilya'}\n\nView on Souq Qalqilya:\n${deepLink}`,
        url: deepLink,   // iOS shows this as a tappable link in the share sheet
      });
    } catch (_) {}
  };

  /** Share directly to WhatsApp with full listing details + deep link */
  const handleShareWhatsApp = () => {
    if (!ad) return;
    const deepLink = buildDeepLink(ad.id);
    const priceText = ad.price === 0 ? (isAr ? 'مجاني' : 'Free') : `₪${ad.price.toLocaleString()}`;
    const desc = ad.description ? ad.description.slice(0, 100) + (ad.description.length > 100 ? '...' : '') : '';
    const msg = isAr
      ? `🛒 *${ad.title}*\n💰 السعر: ${priceText}\n📍 ${ad.location || 'قلقيلية'}\n\n${desc}\n\n🏪 افتح على سوق قلقيلية:\n${deepLink}`
      : `🛒 *${ad.title}*\n💰 Price: ${priceText}\n📍 ${ad.location || 'Qalqilya'}\n\n${desc}\n\n🏪 Open on Souq Qalqilya:\n${deepLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleReport = async () => {
    if (!user) return router.push('/login');
    if (!selectedReason) return showAlert(t.reportSelectReason, t.reportSelectReasonMsg);
    if (!ad || reporting) return;
    setReporting(true);
    try {
      const { error } = await reportAd(ad.id, selectedReason);
      // reportAd now uses upsert — only surface genuine errors, not duplicate-constraint ones
      if (error && (error.includes('unique') || error.includes('duplicate'))) {
        showAlert(t.reportAlready, t.reportAlreadyMsg);
      } else if (error) {
        showAlert(isAr ? 'خطأ في الإبلاغ' : 'Report Error', error);
      } else {
        setReportVisible(false);
        setSelectedReason('');
        showAlert(t.reportSubmitted, t.reportSubmittedMsg);
      }
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Report failed');
    } finally {
      setReporting(false);
    }
  };

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryVisible(true);
  };

  if (loading) {
    return (
      <View style={[styles.skeletonContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Gallery skeleton */}
        <ShimmerBlock style={styles.skeletonGallery} isDark={isDark} />
        {/* Content skeleton */}
        <View style={styles.skeletonContent}>
          {/* Price + condition row */}
          <View style={styles.skeletonRow}>
            <ShimmerBlock style={[styles.skeletonPrice, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
            <ShimmerBlock style={[styles.skeletonBadge, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
          </View>
          {/* Title */}
          <ShimmerBlock style={[styles.skeletonTitle, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
          <ShimmerBlock style={[styles.skeletonTitleShort, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
          {/* Meta chips */}
          <View style={styles.skeletonRow}>
            {[72, 90, 80].map((w, i) => (
              <ShimmerBlock key={i} style={[styles.skeletonChip, { width: w, backgroundColor: colors.surfaceTint }]} isDark={isDark} />
            ))}
          </View>
          {/* Description block */}
          <ShimmerBlock style={[styles.skeletonDescCard, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
          {/* Seller card */}
          <View style={[styles.skeletonSellerCard, { backgroundColor: colors.surfaceTint }]}>
            <ShimmerBlock style={[styles.skeletonAvatar, { backgroundColor: colors.border }]} isDark={isDark} />
            <View style={{ flex: 1, gap: 8 }}>
              <ShimmerBlock style={[styles.skeletonSellerName, { backgroundColor: colors.border }]} isDark={isDark} />
              <ShimmerBlock style={[styles.skeletonSellerSub, { backgroundColor: colors.border }]} isDark={isDark} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!ad) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="error-outline" size={52} color={colors.textMuted} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{t.listingNotFound}</Text>
        <Button label={t.goBack} variant="outline" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const images = (ad.ad_images ?? []).sort((a, b) => a.position - b.position);
  const seller = ad.user_profiles;
  const isPhoneUser = (seller?.email ?? '').includes('@sms.souqqalqilya.local');
  const sellerName = seller?.username ||
    (isPhoneUser
      ? (seller?.phone || (seller?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'))
      : (seller?.email?.split('@')[0] ?? 'Seller'));
  const isOwner = user?.id === ad.user_id;
  const isFree = ad.price === 0;
  const hasPhone = !!(ad.phone_number?.trim());
  const isNew = ad.condition === 'new';
  const isBoosted = ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now();
  const isFavorited = favoriteIds.has(ad.id);

  const reasonLabels: Record<string, string> = {
    fraud: t.reportReasonFraud,
    inappropriate: t.reportReasonInappropriate,
    duplicate: t.reportReasonDuplicate,
    abusive_user: t.reportReasonAbusiveUser,
    other: t.reportReasonOther,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View>
          <AdDetailScrollContent
            ad={ad}
            images={images}
            activeImage={activeImage}
            setActiveImage={setActiveImage}
            openGallery={openGallery}
            isNew={isNew}
            isBoosted={!!isBoosted}
            isFree={isFree}
            hasPhone={hasPhone}
            isOwner={isOwner}
            sellerName={sellerName}
            seller={seller}
            t={t}
            isAr={isAr}
            colors={colors}
            onPromote={() => setPromoteVisible(true)}
            onReport={() => setReportVisible(true)}
            onReportUser={() => { setSelectedReason('abusive_user'); setReportVisible(true); }}
            router={router}
            user={user}
            showAlert={showAlert}
            relatedAds={relatedAds}
            sellerAds={sellerAds}
            favIds={favoriteIds}
            toggleFav={toggleFav}
            sellerVerified={sellerVerified}
          />
        </View>
      </ScrollView>

      {/* Back button */}
      <View style={[styles.backBtnWrap, { top: insets.top + 12, ...(isAr ? { right: Spacing.md, left: undefined } : { left: Spacing.md }) }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Top-right actions */}
      <View style={[styles.topRightBtns, { top: insets.top + 12, ...(isAr ? { left: Spacing.md, right: undefined } : { right: Spacing.md }) }]}>
        {user && !isOwner ? (
          <Pressable
            style={[styles.iconBtn, { backgroundColor: isFavorited ? 'rgba(255,59,107,0.8)' : 'rgba(0,0,0,0.42)' }]}
            onPress={() => toggleFav(ad.id)}
            hitSlop={8}
          >
            <MaterialIcons name={isFavorited ? 'favorite' : 'favorite-border'} size={18} color="#fff" />
          </Pressable>
        ) : null}
        {/* Native share */}
        <Pressable style={styles.iconBtn} onPress={handleShare} hitSlop={8}>
          <MaterialIcons name="share" size={18} color="#fff" />
        </Pressable>
        {/* WhatsApp direct share */}
        <Pressable style={[styles.iconBtn, { backgroundColor: 'rgba(37,211,102,0.82)' }]} onPress={handleShareWhatsApp} hitSlop={8}>
          <MaterialIcons name="whatsapp" size={18} color="#fff" />
        </Pressable>
        {!isOwner ? (
          <Pressable
            style={[styles.iconBtn, { backgroundColor: isSellerBlocked ? 'rgba(37,99,235,0.75)' : 'rgba(0,0,0,0.4)' }]}
            onPress={() => {
              if (isSellerBlocked) {
                showAlert(
                  isAr ? 'رفع الحظر' : 'Unblock User',
                  isAr ? 'هل تريد رفع الحظر عن هذا المستخدم؟' : 'Unblock this user?',
                  [
                    { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
                    { text: isAr ? 'رفع الحظر' : 'Unblock', onPress: async () => { await unblockUser(ad!.user_id); setIsSellerBlocked(false); } },
                  ]
                );
              } else {
                showAlert(
                  isAr ? 'خيارات' : 'Options',
                  isAr ? 'ماذا تريد أن تفعل؟' : 'What would you like to do?',
                  [
                    { text: isAr ? 'إبلاغ عن الإعلان' : 'Report Listing', onPress: () => setReportVisible(true) },
                    { text: isAr ? 'حظر المستخدم' : 'Block User', style: 'destructive', onPress: async () => { const { error } = await blockUser(ad!.user_id); if (!error) { setIsSellerBlocked(true); showAlert(isAr ? 'تم الحظر' : 'Blocked', isAr ? 'تم حظر هذا المستخدم.' : 'User blocked.'); } } },
                    { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
                  ]
                );
              }
            }}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityLabel={isSellerBlocked ? 'Unblock user' : 'Report or block'}
            accessibilityRole="button"
          >
            <MaterialIcons name={isSellerBlocked ? 'lock-open' : 'flag'} size={20} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {/* ── BOTTOM ACTION BAR ── */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }, Shadow.md]}>
        {isOwner ? (
          <View style={styles.ownerRow}>
            <View style={styles.ownerLabel}>
              <MaterialIcons name="storefront" size={15} color={colors.primary} />
              <Text style={[styles.ownerText, { color: colors.textSecondary }]}>{t.yourListing}</Text>
            </View>
            <View style={styles.ownerBtns}>
              {/* Edit */}
              <Pressable
                style={[styles.adActionBtn, { backgroundColor: colors.primaryGhost, borderColor: colors.primary }]}
                onPress={() => router.push(`/edit-ad/${ad.id}` as any)}
              >
                <MaterialIcons name="edit" size={13} color={colors.primary} />
                <Text style={[styles.adActionBtnText, { color: colors.primary }]}>{isAr ? 'تعديل' : 'Edit'}</Text>
              </Pressable>
              {/* Boost */}
              {(ad.status === 'active' || ad.status === 'featured') ? (
                <Pressable
                  style={[styles.adActionBtn, { backgroundColor: '#FEF3C7', borderColor: '#D97706' }]}
                  onPress={() => setBoostModalVisible(true)}
                >
                  <MaterialIcons name="bolt" size={13} color="#D97706" />
                  <Text style={[styles.adActionBtnText, { color: '#D97706' }]}>{isAr ? 'تمييز' : 'Boost'}</Text>
                </Pressable>
              ) : null}
              {ad.status === 'active' || ad.status === 'featured' ? (
                <>
                  {/* Mark as sold */}
                  <Pressable
                    style={[styles.adActionBtn, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}
                    onPress={() => showAlert(t.markAsSold, t.markAsSoldConfirm, [
                      { text: t.cancel, style: 'cancel' },
                      { text: t.confirm, onPress: () => updateAdStatus(ad.id, 'sold').then(() => router.back()) },
                    ])}
                  >
                    <MaterialIcons name="check-circle-outline" size={13} color="#16A34A" />
                    <Text style={[styles.adActionBtnText, { color: '#16A34A' }]}>{t.markAsSold}</Text>
                  </Pressable>
                  {/* Delete */}
                  <Pressable
                    style={[styles.adActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                    onPress={() => showAlert(
                      isAr ? 'حذف الإعلان' : 'Delete Listing',
                      isAr ? `هل أنت متأكد من حذف "${ad.title}"؟` : `Delete "${ad.title}"?`,
                      [
                        { text: t.cancel, style: 'cancel' },
                        { text: isAr ? 'حذف' : 'Delete', style: 'destructive', onPress: () => updateAdStatus(ad.id, 'deleted').then(() => router.back()) },
                      ]
                    )}
                  >
                    <MaterialIcons name="delete-outline" size={13} color="#EF4444" />
                    <Text style={[styles.adActionBtnText, { color: '#EF4444' }]}>{isAr ? 'حذف' : 'Delete'}</Text>
                  </Pressable>
                </>
              ) : (
                <View style={[styles.soldChip, { backgroundColor: colors.accentLight }]}>
                  <Text style={[styles.soldChipText, { color: colors.accentDark }]}>✓ {t.sold.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.contactSection}>
            <Text style={[styles.contactLabel, { color: colors.textMuted }]}>{t.contactSeller}</Text>
            <View style={styles.contactButtons}>
              <Pressable
                style={[styles.chatBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleChat}
                disabled={chatLoading}
              >
                <MaterialIcons name="chat-bubble-outline" size={18} color="#fff" />
                <Text style={styles.chatBtnText}>
                  {chatLoading ? t.openingChat : t.chatWithSeller}
                </Text>
              </Pressable>

              {hasPhone ? (
                <Pressable
                  style={[styles.waBtn, { backgroundColor: '#25D366' }]}
                  onPress={handleWhatsApp}
                >
                  <MaterialIcons name="phone-in-talk" size={18} color="#fff" />
                  <Text style={[styles.waBtnText, { color: '#fff' }]}>{t.whatsappSeller}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      </View>

      {/* ── REPORT MODAL ── */}
      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReportVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <MaterialIcons name="flag" size={22} color={colors.error} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t.reportListing}</Text>
            </View>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>{t.reportReason}</Text>

            <View style={styles.reasonList}>
              {REPORT_REASONS.map(r => (
                <Pressable
                  key={r.key}
                  style={[
                    styles.reasonBtn,
                    {
                      backgroundColor: selectedReason === r.key ? colors.errorLight : colors.background,
                      borderColor: selectedReason === r.key ? colors.error : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedReason(r.key)}
                >
                  <MaterialIcons name={r.icon} size={18} color={selectedReason === r.key ? colors.error : colors.textMuted} />
                  <Text style={[styles.reasonText, { color: selectedReason === r.key ? colors.error : colors.textSecondary, fontWeight: selectedReason === r.key ? '700' : '500' }]}>
                    {reasonLabels[r.key]}
                  </Text>
                  {selectedReason === r.key ? <MaterialIcons name="check-circle" size={16} color={colors.error} style={{ marginLeft: 'auto' }} /> : null}
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setReportVisible(false); setSelectedReason(''); }}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
              </Pressable>
              <Pressable style={[styles.modalSubmitBtn, { backgroundColor: colors.error, opacity: reporting ? 0.7 : 1 }]} onPress={handleReport} disabled={reporting}>
                <MaterialIcons name="flag" size={16} color="#fff" />
                <Text style={styles.modalSubmitText}>{reporting ? t.loading : t.report}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── PROMOTION MODAL ── */}
      <PromotionModal visible={promoteVisible} onClose={() => setPromoteVisible(false)} />

      {/* ── BOOST DURATION PICKER MODAL ── */}
      <Modal
        visible={boostModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBoostModalVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={boostS.overlay} onPress={() => !boosting && setBoostModalVisible(false)}>
          <Pressable style={[boostS.sheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={[boostS.handle, { backgroundColor: colors.border }]} />
            <View style={boostS.headerRow}>
              <View style={[boostS.headerIcon, { backgroundColor: '#FFF7ED' }]}>
                <MaterialIcons name="bolt" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[boostS.title, { color: colors.textPrimary }]}>
                  {isAr ? 'تمييز الإعلان ⚡' : 'Boost this Ad ⚡'}
                </Text>
                <Text style={[boostS.sub, { color: colors.textMuted }]}>
                  {isAr ? 'اختر مدة التمييز' : 'Select boost duration'}
                </Text>
              </View>
            </View>

            {([1, 3, 7] as const).map(days => {
              const isSelected = boostDays === days;
              const label = isAr
                ? days === 1 ? 'يوم واحد' : days === 3 ? 'ثلاثة أيام' : 'سبعة أيام'
                : days === 1 ? '1 Day' : days === 3 ? '3 Days' : '7 Days';
              const sub = isAr
                ? days === 1 ? 'ظهور سريع لمدة 24 ساعة' : days === 3 ? 'ظهور معزز لثلاثة أيام' : 'البقاء في القمة لمدة أسبوع'
                : days === 1 ? '24-hour visibility boost' : days === 3 ? 'Enhanced exposure for 3 days' : 'Stay on top for a week';
              return (
                <Pressable
                  key={days}
                  style={[boostS.option, { borderColor: isSelected ? '#D97706' : colors.border, backgroundColor: isSelected ? '#FFF7ED' : colors.background }]}
                  onPress={() => setBoostDays(days)}
                >
                  <View style={[boostS.optIcon, { backgroundColor: isSelected ? '#FEF3C7' : colors.surfaceTint }]}>
                    <Text style={boostS.optEmoji}>{days === 1 ? '⚡' : days === 3 ? '🔥' : '🚀'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[boostS.optLabel, { color: isSelected ? '#92400E' : colors.textPrimary }]}>{label}</Text>
                    <Text style={[boostS.optSub, { color: isSelected ? '#B45309' : colors.textMuted }]}>{sub}</Text>
                  </View>
                  {isSelected ? <MaterialIcons name="check-circle" size={20} color="#D97706" /> : <View style={[boostS.optRadio, { borderColor: colors.border }]} />}
                </Pressable>
              );
            })}

            <Pressable
              style={[boostS.confirmBtn, { backgroundColor: '#D97706', opacity: boosting ? 0.7 : 1 }]}
              onPress={handleBoostAd}
              disabled={boosting}
            >
              {boosting
                ? <ActivityIndicator color="#fff" size="small" />
                : <MaterialIcons name="bolt" size={20} color="#fff" />}
              <Text style={boostS.confirmText}>
                {boosting ? (isAr ? 'جاري التفعيل...' : 'Activating...') : (isAr ? 'تفعيل التمييز' : 'Activate Boost')}
              </Text>
            </Pressable>

            <Pressable style={[boostS.cancelBtn, { backgroundColor: colors.background, opacity: boosting ? 0.4 : 1 }]} onPress={() => !boosting && setBoostModalVisible(false)} disabled={boosting}>
              <Text style={[boostS.cancelText, { color: colors.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── IMAGE ZOOM GALLERY ── */}
      {images.length > 0 ? (
        <ImageZoomGallery images={images} initialIndex={galleryIndex} visible={galleryVisible} onClose={() => setGalleryVisible(false)} />
      ) : null}
    </View>
  );
}

// ── Inner scroll content ──
function AdDetailScrollContent({
  ad, images, activeImage, setActiveImage, openGallery,
  isNew, isBoosted, isFree, hasPhone, isOwner,
  sellerName, seller, t, isAr, colors,
  onPromote, onReport, onReportUser, router, user, showAlert,
  relatedAds, sellerAds, favIds, toggleFav, sellerVerified,
}: any) {
  const carouselRef = React.useRef<FlatList<AdImage>>(null);

  return (
    <View>
      {/* ── IMAGE CAROUSEL — FlatList horizontal for native swipe ── */}
      <View style={[styles.carouselWrap, { backgroundColor: colors.surfaceTint }]}>
        {images.length > 0 ? (
          <>
            <FlatList<AdImage>
              ref={carouselRef}
              data={images}
              keyExtractor={(img) => img.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={0}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                setActiveImage(idx);
              }}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => openGallery(index)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
                  android_ripple={null}
                >
                  <Image source={{ uri: item.url }} style={[styles.carouselImg, { width }]} contentFit="cover" transition={150} cachePolicy="memory-disk" priority="high" />
                </Pressable>
              )}
            />
            {/* Tap to zoom hint */}
            <View style={styles.zoomHint} pointerEvents="none">
              <MaterialIcons name="zoom-in" size={14} color="#fff" />
              <Text style={styles.zoomHintText}>{isAr ? 'اضغط للتكبير' : 'Tap to zoom'}</Text>
            </View>
            {/* Navigation dots */}
            {images.length > 1 ? (
              <View style={styles.carouselScroll} pointerEvents="box-none">
                {(images as AdImage[]).map((_: AdImage, idx: number) => (
                  <Pressable key={idx} onPress={() => {
                    setActiveImage(idx);
                    carouselRef.current?.scrollToIndex({ index: idx, animated: true });
                  }} style={styles.dotHitArea}>
                    <View style={[styles.dot, idx === activeImage && styles.dotActive]} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {/* Nav arrows */}
            {images.length > 1 ? (
              <>
                {activeImage > 0 ? (
                  <Pressable style={[styles.carouselArrow, styles.arrowLeft]} onPress={() => {
                    const next = activeImage - 1;
                    setActiveImage(next);
                    carouselRef.current?.scrollToIndex({ index: next, animated: true });
                  }}>
                    <MaterialIcons name="chevron-left" size={28} color="#fff" />
                  </Pressable>
                ) : null}
                {activeImage < images.length - 1 ? (
                  <Pressable style={[styles.carouselArrow, styles.arrowRight]} onPress={() => {
                    const next = activeImage + 1;
                    setActiveImage(next);
                    carouselRef.current?.scrollToIndex({ index: next, animated: true });
                  }}>
                    <MaterialIcons name="chevron-right" size={28} color="#fff" />
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <Pressable style={styles.noImage} onPress={() => openGallery(0)}>
            <MaterialIcons name="image-not-supported" size={52} color={colors.textMuted} />
            <Text style={[styles.noImageText, { color: colors.textMuted }]}>{t.noPhotos}</Text>
          </Pressable>
        )}
        {ad.status === 'sold' ? (
          <View style={styles.soldOverlay}>
            <View style={[styles.soldBanner, { backgroundColor: colors.error }]}>
              <Text style={styles.soldBannerText}>SOLD</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={[styles.priceBadge, { backgroundColor: isFree ? colors.success : colors.primary }]}>
              <Text style={styles.priceText}>{isFree ? t.free : `₪${ad.price.toLocaleString()}`}</Text>
            </View>
            <View style={styles.badgesRow}>
              <View style={[styles.conditionBadge, {
                backgroundColor: isNew ? colors.primaryGhost : colors.surfaceTint,
                borderColor: isNew ? colors.primary : colors.border,
              }]}>
                <MaterialIcons name={isNew ? 'fiber-new' : 'recycling'} size={14} color={isNew ? colors.primary : colors.textMuted} />
                <Text style={[styles.conditionText, { color: isNew ? colors.primary : colors.textSecondary }]}>
                  {isNew ? t.conditionNew : t.conditionUsed}
                </Text>
              </View>
              {isBoosted ? (
                <View style={[styles.boostBadge, { backgroundColor: colors.accentLight }]}>
                  <MaterialIcons name="bolt" size={13} color={colors.accentDark} />
                  <Text style={[styles.boostText, { color: colors.accentDark }]}>{t.boosted}</Text>
                </View>
              ) : null}
              {ad.categories ? (
                <View style={[styles.catPill, { backgroundColor: ad.categories.color + '18' }]}>
                  <MaterialIcons name={ad.categories.icon as any} size={13} color={ad.categories.color} />
                  <Text style={[styles.catText, { color: ad.categories.color }]}>{ad.categories.name}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{ad.title}</Text>

          <View style={[styles.serialRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[styles.serialChip, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
              <MaterialIcons name="tag" size={13} color={colors.textMuted} />
              <Text style={[styles.serialText, { color: colors.textMuted }]}>
                {isAr ? `مرجع #${ad.serial_number}` : `Ref #${ad.serial_number}`}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            {[
              { icon: 'location-on', text: ad.location || 'No location', color: colors.primary },
              { icon: 'access-time', text: timeAgoLong(ad.created_at), color: colors.textMuted },
              { icon: 'visibility', text: `${ad.views} ${t.views}`, color: colors.textMuted },
            ].map((m, i) => (
              <View key={i} style={[styles.metaChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name={m.icon as any} size={14} color={m.color} />
                <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>{m.text}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.descCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <Text style={[styles.cardLabel, { color: colors.primary }]}>{t.description2}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>{ad.description}</Text>
          </View>

          {/* Seller card */}
          <View style={[styles.sellerCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.sm }]}>
            {/* Header label */}
            <View style={[styles.sellerCardHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[styles.sellerCardIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="storefront" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.cardLabel, { color: colors.primary }]}>{t.seller}</Text>
            </View>

            {/* Seller info row */}
            <Pressable
              style={[styles.sellerRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
              onPress={() => router.push(`/seller/${ad.user_id}` as any)}
              hitSlop={4}
            >
              {/* Avatar */}
              <View style={styles.sellerAvatarWrap}>
                {seller?.avatar_url ? (
                  <Image source={{ uri: seller.avatar_url }} style={styles.sellerAvatarImg} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.sellerAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.sellerAvatarText}>{sellerName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                {sellerVerified ? (
                  <View style={styles.sellerVerifiedDot}>
                    <MaterialIcons name="verified" size={12} color="#2563EB" />
                  </View>
                ) : null}
              </View>

              <View style={styles.sellerInfo}>
                <Text style={[styles.sellerName, { color: colors.textPrimary }]} numberOfLines={1}>{sellerName}</Text>
                <View style={[styles.sellerMeta, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.sellerBadge, { backgroundColor: sellerVerified ? '#DBEAFE' : colors.accentLight }]}>
                    <MaterialIcons name={sellerVerified ? 'verified' : 'person'} size={11} color={sellerVerified ? '#2563EB' : colors.accent} />
                    <Text style={[styles.sellerBadgeText, { color: sellerVerified ? '#1D4ED8' : colors.accentDark }]}>
                      {sellerVerified ? (isAr ? 'موثّق' : 'Verified') : 'Member'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* View profile arrow */}
              <View style={[styles.viewProfileBtn, { backgroundColor: colors.primaryGhost }]}>
                <Text style={[styles.sellerViewProfile, { color: colors.primary }]}>
                  {isAr ? 'عرض الملف الشخصي' : 'View Profile'}
                </Text>
                <MaterialIcons name={isAr ? 'chevron-left' : 'chevron-right'} size={16} color={colors.primary} />
              </View>
            </Pressable>

            {/* Phone row */}
            {hasPhone && user && (
              <View style={[styles.phoneRow, { backgroundColor: colors.surfaceTint, borderColor: colors.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <View style={[styles.phoneIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="phone" size={15} color={colors.primary} />
                </View>
                <Text style={[styles.phoneText, { color: colors.textSecondary }]}>{ad.phone_number}</Text>
              </View>
            )}

            {/* Report user */}
            {!isOwner && user ? (
              <Pressable
                style={[styles.reportUserBtn, { borderColor: colors.errorLight ?? '#FEE2E2', backgroundColor: colors.errorLight ?? '#FFF5F5', flexDirection: isAr ? 'row-reverse' : 'row' }]}
                onPress={onReportUser}
                hitSlop={4}
              >
                <MaterialIcons name="flag" size={14} color={colors.error ?? '#EF4444'} />
                <Text style={[styles.reportUserBtnText, { color: colors.error ?? '#EF4444' }]}>
                  {isAr ? 'الإبلاغ عن المستخدم' : 'Report User'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Promote button (owner only) */}
          {isOwner ? (
            <Pressable
              style={[styles.promoteBtn, { backgroundColor: '#FFF7ED', borderColor: '#D97706' }]}
              onPress={onPromote}
            >
              <MaterialIcons name="workspace-premium" size={18} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.promoteBtnTitle, { color: '#92400E' }]}>
                  {isAr ? 'روّج إعلانك' : 'Promote this listing'}
                </Text>
                <Text style={[styles.promoteBtnSub, { color: '#B45309' }]}>
                  {isAr ? 'تعزيز ظهور إعلانك' : 'Boost your listing visibility'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#D97706" />
            </Pressable>
          ) : null}

          {/* ── SELLER'S OTHER ADS ── */}
          {sellerAds && sellerAds.length > 0 ? (
            <View style={styles.relatedSection}>
              <View style={[styles.relatedHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="storefront" size={16} color={colors.primary} />
                <Text style={[styles.relatedTitle, { color: colors.textPrimary }]}>
                  {isAr ? `إعلانات أخرى لـ ${sellerName}` : `More from ${sellerName}`}
                </Text>
                <View style={[styles.relatedCount, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.relatedCountText, { color: colors.primary }]}>{sellerAds.length}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.relatedScroll, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                {sellerAds.map((rel: Ad) => {
                  const relImages = (rel.ad_images ?? []).sort((a: any, b: any) => a.position - b.position);
                  const relThumb = relImages[0]?.url;
                  return (
                    <Pressable
                      key={rel.id}
                      style={[styles.relatedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push(`/ad/${rel.id}` as any)}
                    >
                      {relThumb ? (
                        <Image source={{ uri: relThumb }} style={styles.relatedImg} contentFit="cover" transition={200} />
                      ) : (
                        <View style={[styles.relatedImgPlaceholder, { backgroundColor: colors.surfaceTint }]}>
                          <MaterialIcons name="image" size={28} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={styles.relatedInfo}>
                        <Text style={[styles.relatedPrice, { color: colors.primary }]}>
                          {rel.price === 0 ? (isAr ? 'مجاني' : 'Free') : `₪${rel.price.toLocaleString()}`}
                        </Text>
                        <Text style={[styles.relatedName, { color: colors.textPrimary }]} numberOfLines={2}>{rel.title}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* ── RELATED ADS ── */}
          {relatedAds && relatedAds.length > 0 ? (
            <View style={styles.relatedSection}>
              <View style={[styles.relatedHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="grid-view" size={16} color={colors.primary} />
                <Text style={[styles.relatedTitle, { color: colors.textPrimary }]}>
                  {isAr ? 'إعلانات مشابهة' : 'Related Listings'}
                </Text>
                <View style={[styles.relatedCount, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.relatedCountText, { color: colors.primary }]}>{relatedAds.length}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.relatedScroll, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                {relatedAds.map((rel: Ad) => {
                  const relImages = (rel.ad_images ?? []).sort((a: any, b: any) => a.position - b.position);
                  const relThumb = relImages[0]?.url;
                  const isFav = favIds?.has(rel.id);
                  return (
                    <Pressable
                      key={rel.id}
                      style={[styles.relatedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push(`/ad/${rel.id}` as any)}
                    >
                      {relThumb ? (
                        <Image source={{ uri: relThumb }} style={styles.relatedImg} contentFit="cover" transition={200} />
                      ) : (
                        <View style={[styles.relatedImgPlaceholder, { backgroundColor: colors.surfaceTint }]}>
                          <MaterialIcons name="image" size={28} color={colors.textMuted} />
                        </View>
                      )}
                      {toggleFav && user && user.id !== rel.user_id ? (
                        <Pressable
                          style={[styles.relatedFavBtn, { backgroundColor: isFav ? 'rgba(255,59,107,0.85)' : 'rgba(0,0,0,0.35)' }]}
                          onPress={() => toggleFav(rel.id)}
                          hitSlop={6}
                        >
                          <MaterialIcons name={isFav ? 'favorite' : 'favorite-border'} size={13} color="#fff" />
                        </Pressable>
                      ) : null}
                      <View style={styles.relatedInfo}>
                        <Text style={[styles.relatedPrice, { color: colors.primary }]}>
                          {rel.price === 0 ? (isAr ? 'مجاني' : 'Free') : `₪${rel.price.toLocaleString()}`}
                        </Text>
                        <Text style={[styles.relatedName, { color: colors.textPrimary }]} numberOfLines={2}>{rel.title}</Text>
                        {rel.location ? (
                          <View style={[styles.relatedLoc, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                            <MaterialIcons name="location-on" size={11} color={colors.textMuted} />
                            <Text style={[styles.relatedLocText, { color: colors.textMuted }]} numberOfLines={1}>{rel.location}</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Skeleton loading layout ──
  skeletonContainer: { flex: 1 },
  skeletonGallery: {
    width: '100%',
    height: 320,
    borderRadius: 0,
    backgroundColor: '#CBD5E1',
  },
  skeletonContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  skeletonPrice: {
    width: 88,
    height: 36,
    borderRadius: Radius.md,
  },
  skeletonBadge: {
    width: 70,
    height: 28,
    borderRadius: Radius.full,
  },
  skeletonTitle: {
    height: 22,
    borderRadius: 8,
    width: '90%',
  },
  skeletonTitleShort: {
    height: 22,
    borderRadius: 8,
    width: '65%',
  },
  skeletonChip: {
    height: 28,
    borderRadius: Radius.full,
  },
  skeletonDescCard: {
    height: 110,
    borderRadius: Radius.lg,
    width: '100%',
  },
  skeletonSellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  skeletonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    flexShrink: 0,
  },
  skeletonSellerName: {
    height: 14,
    borderRadius: 7,
    width: '60%',
  },
  skeletonSellerSub: {
    height: 10,
    borderRadius: 5,
    width: '40%',
  },
  errorText: { fontSize: FontSize.lg, marginTop: 12 },
  backBtnWrap: { position: 'absolute', zIndex: 20 },
  topRightBtns: { position: 'absolute', zIndex: 20, flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: {},
  carouselWrap: { height: 320, position: 'relative', overflow: 'hidden' },
  carouselImg: { height: 320 },
  carouselScroll: {
    position: 'absolute', bottom: 14, alignSelf: 'center',
    flexDirection: 'row', gap: 5, zIndex: 5,
  },
  dotHitArea: { padding: 4 },
  carouselArrow: {
    position: 'absolute', top: '40%', zIndex: 8,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  zoomHint: {
    position: 'absolute', top: 12, left: '50%', marginLeft: -52,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4, zIndex: 5,
  },
  zoomHintText: { color: '#fff', fontSize: 11, fontWeight: '500' },
  noImage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 320 },
  noImageText: { fontSize: FontSize.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 20, borderRadius: 3 },
  soldOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldBanner: {
    paddingHorizontal: 28, paddingVertical: 10,
    borderRadius: Radius.md, transform: [{ rotate: '-12deg' }],
  },
  soldBannerText: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '900', letterSpacing: 4 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  priceBadge: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  priceText: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  conditionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1.5,
  },
  conditionText: { fontSize: FontSize.xs, fontWeight: '700' },
  boostBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
  },
  boostText: { fontSize: FontSize.xs, fontWeight: '700' },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  catText: { fontSize: FontSize.sm, fontWeight: '600' },
  title: { fontSize: FontSize.xl, fontWeight: '800', lineHeight: 28, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, ...Shadow.xs,
  },
  metaChipText: { fontSize: FontSize.xs, fontWeight: '500' },
  descCard: { borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  cardLabel: { fontSize: FontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  description: { fontSize: FontSize.md, lineHeight: 24 },
  sellerCard: { borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.md, borderWidth: 1 },
  sellerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sellerCardIconWrap: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sellerAvatarWrap: { position: 'relative' },
  sellerAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  sellerAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  sellerAvatarText: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  sellerVerifiedDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  sellerInfo: { flex: 1, gap: 4 },
  sellerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sellerName: { fontSize: FontSize.md, fontWeight: '700' },
  sellerViewProfile: { fontSize: FontSize.xs, fontWeight: '600' },
  viewProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.lg, paddingHorizontal: 10, paddingVertical: 7 },
  sellerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  sellerBadgeText: { fontSize: 10, fontWeight: '700' },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1,
  },
  phoneIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  phoneText: { fontSize: FontSize.sm, fontWeight: '500', letterSpacing: 0.2, flex: 1 },
  promoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  promoteBtnTitle: { fontSize: FontSize.md, fontWeight: '700' },
  promoteBtnSub: { fontSize: FontSize.xs, marginTop: 2 },
  reportUserBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
    marginTop: 4,
  },
  reportUserBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  bottomBar: { padding: Spacing.md, paddingHorizontal: Spacing.lg, borderTopWidth: 1 },
  ownerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  ownerLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerText: { fontSize: FontSize.sm, fontWeight: '500' },
  ownerBtns: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  adActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5 },
  adActionBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
  soldChip: { borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  soldChipText: { fontSize: FontSize.sm, fontWeight: '700' },
  contactSection: { gap: Spacing.sm },
  contactLabel: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  contactButtons: { flexDirection: 'row', gap: Spacing.sm },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: Radius.lg,
    ...Shadow.colored,
  },
  chatBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
  waBtnText: { fontSize: FontSize.md, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 100 },
  modalSheet: {
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.2 },
  modalSub: { fontSize: FontSize.sm },
  reasonList: { gap: Spacing.sm },
  reasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1.5,
  },
  reasonText: { fontSize: FontSize.md, flex: 1 },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, height: 50, borderRadius: Radius.lg, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: FontSize.md, fontWeight: '600' },
  modalSubmitBtn: {
    flex: 2, height: 50, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  modalSubmitText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  relatedSection: { gap: Spacing.sm },
  relatedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  relatedTitle: { fontSize: FontSize.md, fontWeight: '700' },
  relatedCount: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  relatedCountText: { fontSize: FontSize.xs, fontWeight: '700' },
  relatedScroll: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: 4 },
  relatedCard: {
    width: 148, borderRadius: Radius.lg, borderWidth: 1,
    overflow: 'hidden', ...Shadow.xs,
  },
  relatedImg: { width: 148, height: 110 },
  relatedImgPlaceholder: { width: 148, height: 110, alignItems: 'center', justifyContent: 'center' },
  relatedFavBtn: {
    position: 'absolute', top: 7, right: 7,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  relatedInfo: { padding: Spacing.sm, gap: 3 },
  relatedPrice: { fontSize: FontSize.sm, fontWeight: '800' },
  relatedName: { fontSize: FontSize.sm, fontWeight: '600', lineHeight: 18 },
  relatedLoc: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  relatedLocText: { fontSize: 10 },
  serialRow: { marginTop: -4 },
  serialChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  serialText: { fontSize: FontSize.xs, fontWeight: '500', letterSpacing: 0.2 },
});

// ── Boost Modal StyleSheet ──────────────────────────────────────────────────
const boostS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: Spacing.lg, paddingBottom: 36, paddingTop: 12,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14, shadowRadius: 18, elevation: 22,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: FontSize.sm, marginTop: 2 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  optIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  optEmoji: { fontSize: 22 },
  optLabel: { fontSize: FontSize.md, fontWeight: '700' },
  optSub: { fontSize: FontSize.xs, marginTop: 2 },
  optRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 54, borderRadius: Radius.xl,
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    marginTop: 4,
  },
  confirmText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  cancelBtn: { height: 46, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FontSize.md, fontWeight: '700' },
});
