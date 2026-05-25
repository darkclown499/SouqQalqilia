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
import { fetchAdById, fetchAds, Ad, AdImage, updateAdStatus, reportAd } from '@/services/adsService';
import { fetchOrCreateConversation } from '@/services/chatService';
import { getSupabaseClient } from '@/template';
import { PromotionModal } from '@/components/feature/PromotionModal';
import { ImageZoomGallery } from '@/components/feature/ImageZoomGallery';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
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
  { key: 'other', icon: 'more-horiz' as const },
];

export default function AdDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
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
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [relatedAds, setRelatedAds] = useState<Ad[]>([]);
  const [sellerVerified, setSellerVerified] = useState(false);

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
      }
      if (data?.category_id) {
        fetchAds({ categoryId: data.category_id, limit: 7 }).then(({ data: related }) => {
          setRelatedAds((related ?? []).filter(a => a.id !== id).slice(0, 6));
        });
      }
    });
  }, [id]);

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

  const handleShare = async () => {
    if (!ad) return;
    try {
      await Share.share({
        title: ad.title,
        message: isAr
          ? `${ad.title}\n₪${ad.price.toLocaleString()}\n\nشاهد هذا الإعلان على سوق قلقيلية`
          : `${ad.title}\n₪${ad.price.toLocaleString()}\n\nCheck this listing on Souq Qalqilya`,
      });
    } catch (_) {}
  };

  const handleReport = async () => {
    if (!user) return router.push('/login');
    if (!selectedReason) return showAlert(t.reportSelectReason, t.reportSelectReasonMsg);
    if (!ad) return;
    setReporting(true);
    const { error } = await reportAd(ad.id, selectedReason);
    setReporting(false);
    setReportVisible(false);
    setSelectedReason('');
    if (error && error.includes('unique')) {
      showAlert(t.reportAlready, t.reportAlreadyMsg);
    } else if (error) {
      showAlert('Error', error);
    } else {
      showAlert(t.reportSubmitted, t.reportSubmittedMsg);
    }
  };

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryVisible(true);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
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
  const sellerName = seller?.username || seller?.email?.split('@')[0] || 'Seller';
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
            router={router}
            user={user}
            showAlert={showAlert}
            relatedAds={relatedAds}
            favIds={favoriteIds}
            toggleFav={toggleFav}
            sellerVerified={sellerVerified}
          />
        </View>
      </ScrollView>

      {/* Back button — after ScrollView so it renders on top on Android */}
      <View style={[styles.backBtnWrap, { top: insets.top + 12, ...(isAr ? { right: Spacing.md, left: undefined } : { left: Spacing.md }) }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Top-right actions — after ScrollView so they render on top on Android */}
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
        <Pressable style={styles.iconBtn} onPress={handleShare} hitSlop={8}>
          <MaterialIcons name="share" size={18} color="#fff" />
        </Pressable>
        {!isOwner ? (
          <Pressable
            style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            onPress={() => setReportVisible(true)}
            hitSlop={8}
          >
            <MaterialIcons name="flag" size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {/* ── BOTTOM ACTION BAR ── */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }, Shadow.md]}>
        {isOwner ? (
          <View style={styles.ownerRow}>
            <View style={styles.ownerLabel}>
              <MaterialIcons name="storefront" size={16} color={colors.primary} />
              <Text style={[styles.ownerText, { color: colors.textSecondary }]}>{t.yourListing}</Text>
            </View>
            {ad.status === 'active' || ad.status === 'featured' ? (
              <Button
                label={t.markAsSold}
                variant="outline"
                size="sm"
                onPress={() =>
                  showAlert(t.markAsSold, t.markAsSoldConfirm, [
                    { text: t.cancel, style: 'cancel' },
                    { text: t.confirm, onPress: () => updateAdStatus(ad.id, 'sold').then(() => router.back()) },
                  ])
                }
              />
            ) : (
              <View style={[styles.soldChip, { backgroundColor: colors.accentLight }]}>
                <Text style={[styles.soldChipText, { color: colors.accentDark }]}>✓ {t.sold.toUpperCase()}</Text>
              </View>
            )}
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
                  <MaterialIcons
                    name={r.icon}
                    size={18}
                    color={selectedReason === r.key ? colors.error : colors.textMuted}
                  />
                  <Text style={[styles.reasonText, { color: selectedReason === r.key ? colors.error : colors.textSecondary, fontWeight: selectedReason === r.key ? '700' : '500' }]}>
                    {reasonLabels[r.key]}
                  </Text>
                  {selectedReason === r.key ? (
                    <MaterialIcons name="check-circle" size={16} color={colors.error} style={{ marginLeft: 'auto' }} />
                  ) : null}
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => { setReportVisible(false); setSelectedReason(''); }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmitBtn, { backgroundColor: colors.error, opacity: reporting ? 0.7 : 1 }]}
                onPress={handleReport}
                disabled={reporting}
              >
                <MaterialIcons name="flag" size={16} color="#fff" />
                <Text style={styles.modalSubmitText}>{reporting ? t.loading : t.report}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── PROMOTION MODAL ── */}
      <PromotionModal visible={promoteVisible} onClose={() => setPromoteVisible(false)} />

      {/* ── IMAGE ZOOM GALLERY ── */}
      {images.length > 0 ? (
        <ImageZoomGallery
          images={images}
          initialIndex={galleryIndex}
          visible={galleryVisible}
          onClose={() => setGalleryVisible(false)}
        />
      ) : null}
    </View>
  );
}

// ── Inner scroll content extracted to avoid deeply nested JSX ──
function AdDetailScrollContent({
  ad, images, activeImage, setActiveImage, openGallery,
  isNew, isBoosted, isFree, hasPhone, isOwner,
  sellerName, seller, t, isAr, colors,
  onPromote, onReport, router, user, showAlert,
  relatedAds, favIds, toggleFav, sellerVerified,
}: any) {
  return (
    <View>
      {/* Image carousel */}
      <View style={[styles.carouselWrap, { backgroundColor: colors.surfaceTint }]}>
        {images.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row' }}>
              {images.map((img: AdImage, idx: number) => (
                <Pressable
                  key={img.id}
                  onPress={() => openGallery(idx)}
                  style={[{ display: idx === activeImage ? 'flex' : 'none' }]}
                >
                  <Image source={{ uri: img.url }} style={[styles.carouselImg, { width: width }]} contentFit="cover" transition={200} />
                </Pressable>
              ))}
            </View>
            {/* Navigation dots + swipe gesture via scroll */}
            <View style={styles.carouselScroll}>
              {images.map((img: AdImage, idx: number) => (
                <Pressable key={img.id} onPress={() => setActiveImage(idx)} style={styles.dotHitArea}>
                  <View style={[styles.dot, idx === activeImage && styles.dotActive]} />
                </Pressable>
              ))}
            </View>
            {/* Swipe handler overlay */}
            <View
              style={[styles.carouselOverlay, { width: width }]}
              onStartShouldSetResponder={() => true}
            />
            {/* Tap to zoom hint */}
            <View style={styles.zoomHint}>
              <MaterialIcons name="zoom-in" size={14} color="#fff" />
              <Text style={styles.zoomHintText}>{isAr ? 'اضغط للتكبير' : 'Tap to zoom'}</Text>
            </View>
            {/* Nav arrows */}
            {images.length > 1 ? (
              <>
                {activeImage > 0 ? (
                  <Pressable style={[styles.carouselArrow, styles.arrowLeft]} onPress={() => setActiveImage((i: number) => i - 1)}>
                    <MaterialIcons name="chevron-left" size={28} color="#fff" />
                  </Pressable>
                ) : null}
                {activeImage < images.length - 1 ? (
                  <Pressable style={[styles.carouselArrow, styles.arrowRight]} onPress={() => setActiveImage((i: number) => i + 1)}>
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
                <MaterialIcons
                  name={isNew ? 'fiber-new' : 'recycling'}
                  size={14}
                  color={isNew ? colors.primary : colors.textMuted}
                />
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

          {/* Serial number reference chip */}
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
          <View style={[styles.sellerCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <Text style={[styles.cardLabel, { color: colors.primary }]}>{t.seller}</Text>
            <View style={styles.sellerRow}>
              {seller?.avatar_url ? (
                <Image source={{ uri: seller.avatar_url }} style={styles.sellerAvatarImg} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.sellerAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.sellerAvatarText}>{sellerName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={[styles.sellerName, { color: colors.textPrimary }]}>{sellerName}</Text>
                {/* Email is hidden from public view for privacy */}
              </View>
              <View style={[styles.sellerBadge, { backgroundColor: sellerVerified ? '#DBEAFE' : colors.accentLight }]}>
                <MaterialIcons name={sellerVerified ? 'verified' : 'person'} size={14} color={sellerVerified ? '#2563EB' : colors.accent} />
                <Text style={[styles.sellerBadgeText, { color: sellerVerified ? '#1D4ED8' : colors.accentDark }]}>
                  {sellerVerified ? (isAr ? 'موثّق' : 'Verified') : 'Member'}
                </Text>
              </View>
            </View>
            {hasPhone && user && (
              <View style={[styles.phoneRow, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                <MaterialIcons name="phone" size={15} color={colors.primary} />
                <Text style={[styles.phoneText, { color: colors.textSecondary }]}>{ad.phone_number}</Text>
              </View>
            )}
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
                  {isAr ? 'ابدأ من 30 ₪ فقط' : 'Starting from 30 ₪ only'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#D97706" />
            </Pressable>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.relatedScroll, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
              >
                {relatedAds.map((rel: Ad) => {
                  const relImages = (rel.ad_images ?? []).sort((a: any, b: any) => a.position - b.position);
                  const relThumb = relImages[0]?.url;
                  const isFav = favIds?.has(rel.id);
                  return (
                    <Pressable
                      key={rel.id}
                      style={[styles.relatedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.replace(`/ad/${rel.id}`)}
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
                        <Text style={[styles.relatedName, { color: colors.textPrimary }]} numberOfLines={2}>
                          {rel.title}
                        </Text>
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
  errorText: { fontSize: FontSize.lg, marginTop: 12 },
  backBtnWrap: { position: 'absolute', zIndex: 10 },
  topRightBtns: { position: 'absolute', zIndex: 10, flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: {},
  carouselWrap: { height: 300, position: 'relative', overflow: 'hidden' },
  carouselImg: { height: 300 },
  carouselScroll: {
    position: 'absolute', bottom: 14, alignSelf: 'center',
    flexDirection: 'row', gap: 5, zIndex: 5,
  },
  dotHitArea: { padding: 4 },
  carouselOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, opacity: 0 },
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
  noImage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 300 },
  noImageText: { fontSize: FontSize.sm },
  dots: { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 20, borderRadius: 3 },
  counterPill: {
    position: 'absolute', bottom: 14, right: 14,
    backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 5,
  },
  counterText: { color: '#fff', fontSize: 11, fontWeight: '600' },
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
  sellerCard: { borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.md },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sellerAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  sellerAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  sellerAvatarText: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: FontSize.md, fontWeight: '700' },
  sellerEmail: { fontSize: FontSize.sm, marginTop: 2 },
  sellerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  sellerBadgeText: { fontSize: 10, fontWeight: '700' },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1,
  },
  phoneText: { fontSize: FontSize.sm, fontWeight: '500', letterSpacing: 0.2 },
  promoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  promoteBtnTitle: { fontSize: FontSize.md, fontWeight: '700' },
  promoteBtnSub: { fontSize: FontSize.xs, marginTop: 2 },
  bottomBar: { padding: Spacing.md, paddingHorizontal: Spacing.lg, borderTopWidth: 1 },
  ownerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ownerLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerText: { fontSize: FontSize.sm, fontWeight: '500' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
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

  // Related ads
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

  // Serial number
  serialRow: { marginTop: -4 },
  serialChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  serialText: { fontSize: FontSize.xs, fontWeight: '500', letterSpacing: 0.2 },
});
