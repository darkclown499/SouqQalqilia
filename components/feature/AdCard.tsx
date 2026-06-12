import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Ad } from '@/services/adsService';
import { Radius, FontSize, Spacing, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { getCategoryName } from '@/services/categoriesService';
import { timeAgo } from '@/utils/timeAgo';

const { width: SCREEN_W } = Dimensions.get('window');
// Image height scales proportionally: taller on larger phones
const IMG_H = Math.round(SCREEN_W * 0.265);
const CLAMP_IMG_H = Math.max(130, Math.min(IMG_H, 190));

interface AdCardProps {
  ad: Ad;
  width?: number;
  sponsored?: boolean;
  isFavorited?: boolean;
  onFavoritePress?: (adId: string) => void;
  onAdPress?: (ad: Ad) => void;
  isBlocked?: boolean;
}

function formatPrice(price: number, isAr: boolean) {
  if (price === 0) return isAr ? 'مجاني' : 'Free';
  return `₪${price.toLocaleString()}`;
}

// Neutral grey blurhash placeholder — renders instantly while image loads
const PLACEHOLDER_BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

export const AdCard = memo(function AdCard({ ad, width, sponsored, isFavorited = false, onFavoritePress, onAdPress, isBlocked = false }: AdCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const [imgError, setImgError] = useState(false);

  // ── All derived values memoized to prevent recalculation on every render ─
  const sortedImages = useMemo(
    () => (ad.ad_images ? [...ad.ad_images].sort((a, b) => a.position - b.position) : []),
    [ad.ad_images]
  );
  const firstImage = sortedImages[0];
  const isFree = ad.price === 0;
  const isBoosted = useMemo(
    () => !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now()),
    [ad.boosted_until]
  );
  const isFeatured = ad.status === 'featured';
  const isSold = ad.status === 'sold';
  const isNew = ad.condition === 'new';

  const catName = useMemo(
    () => (ad.categories ? getCategoryName(ad.categories as any, language) : null),
    [ad.categories, language]
  );
  const catColor = ad.categories?.color ?? colors.primary;

  // ── Location display helpers memoized ────────────────────────────────────
  const MAIN_CITY = 'قلقيلية';
  const QALQILYA_LOCATIONS_SET = useMemo(() => new Set(['عزون','كفر قدوم','جيوس','حبلة','كفر ثلث','عزون عتمة','إماتين','كفر لاقف','النبي إلياس','جيت','جينصافوط','حجة','باقة الحطب','الفندق','راس عطية','راس الطيرة','صير','فلامية','مغارة الضبعة','عزبة الطبيب','عزبة سلمان','عزبة الأشقر','واد الرشا','المدور']), []);
  const rawLocation = ad.location ?? '';
  const locationDerived = useMemo(() => {
    const dashIdx = rawLocation.indexOf(' - ');
    const cityPart = dashIdx > -1 ? rawLocation.slice(0, dashIdx).trim() : rawLocation.trim();
    const isMainCity = cityPart === MAIN_CITY || cityPart === 'قلقيلية المدينة';
    const isVillage = QALQILYA_LOCATIONS_SET.has(cityPart) && !isMainCity;
    const locationLabel = isMainCity ? 'قلقيلية المدينة' : (cityPart || rawLocation);
    const locationIconColor = isMainCity ? colors.primary : (isVillage ? '#D97706' : colors.textMuted);
    const locationIconName: 'location-city' | 'location-on' = isMainCity ? 'location-city' : 'location-on';
    return { locationLabel, locationIconColor, locationIconName };
  }, [rawLocation, colors.primary, QALQILYA_LOCATIONS_SET]);
  const { locationLabel, locationIconColor, locationIconName } = locationDerived;

  const handlePress = useCallback(() => {
    onAdPress?.(ad);
    router.push(`/ad/${ad.id}`);
  }, [ad, onAdPress, router]);

  const handleFavorite = useCallback((e: any) => {
    e.stopPropagation?.();
    onFavoritePress?.(ad.id);
  }, [ad.id, onFavoritePress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          width: width ?? undefined,
          opacity: pressed ? 0.92 : 1,
          transform: pressed ? [{ scale: 0.975 }] : [],
          ...Shadow.sm,
        },
        isBoosted ? { borderWidth: 2, borderColor: colors.accent } : { borderWidth: 1, borderColor: colors.border },
        sponsored ? { borderColor: colors.primary + '66' } : null,
      ]}
      onPress={handlePress}
    >
      {/* ── IMAGE ── */}
      <View style={styles.imageWrap}>
        {firstImage && !imgError ? (
          <Image
            source={{ uri: firstImage.url }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={firstImage.url}
            priority={isFeatured || isBoosted ? 'high' : 'normal'}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            placeholderContentFit="cover"
            responsivePolicy="live"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name={imgError ? 'broken-image' : 'camera-alt'} size={26} color={colors.border} />
            {imgError ? (
              <Text style={[styles.imgErrorText, { color: colors.textMuted }]}>
                {isAr ? 'تعذّر التحميل' : 'Failed to load'}
              </Text>
            ) : null}
          </View>
        )}

        {/* Top-left: condition */}
        <View style={[
          styles.topLeft,
          { backgroundColor: isNew ? colors.primary : 'rgba(0,0,0,0.48)' },
        ]}>
          <MaterialIcons
            name={isNew ? 'fiber-new' : 'recycling'}
            size={10}
            color="#fff"
          />
          <Text style={styles.badgeText}>
            {isNew ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
          </Text>
        </View>

        {/* Top-right: boosted badge — stacks above featured so both are visible */}
        {isBoosted ? (
          <View style={[styles.topRight, { backgroundColor: colors.accent, zIndex: 10 }]}>
            <MaterialIcons name="bolt" size={10} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'مميز ⚡' : 'Top ⚡'}</Text>
          </View>
        ) : isFeatured ? (
          <View style={[styles.topRight, { backgroundColor: '#7C3AED', zIndex: 10 }]}>
            <MaterialIcons name="workspace-premium" size={10} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'بارز ★' : 'Featured ★'}</Text>
          </View>
        ) : null}

        {/* Favorite button — always at top-right when no boost/featured badge;
             shifted down slightly when badge occupies that corner */}
        {onFavoritePress ? (
          <Pressable
            style={[
              (isBoosted || isFeatured) ? styles.heartBtnAlt : styles.heartBtn,
              { backgroundColor: isFavorited ? '#FF3B6B' : 'rgba(0,0,0,0.38)', zIndex: 11 },
            ]}
            onPress={handleFavorite}
            hitSlop={10}
          >
            <MaterialIcons
              name={isFavorited ? 'favorite' : 'favorite-border'}
              size={14}
              color="#fff"
            />
          </Pressable>
        ) : null}

        {/* Image count pill */}
        {sortedImages.length > 1 ? (
          <View style={styles.imgCount}>
            <MaterialIcons name="photo-library" size={9} color="rgba(255,255,255,0.85)" />
            <Text style={styles.imgCountText}>{sortedImages.length}</Text>
          </View>
        ) : null}

        {/* Sold overlay */}
        {isSold ? (
          <View style={styles.soldOverlay}>
            <View style={[styles.soldBanner, { backgroundColor: colors.error }]}>
              <Text style={styles.soldBannerText}>{isAr ? 'مباع' : 'SOLD'}</Text>
            </View>
          </View>
        ) : null}

        {/* Blocked user overlay */}
        {isBlocked ? (
          <View style={styles.blockedOverlay}>
            <View style={styles.blockedBanner}>
              <MaterialIcons name="block" size={13} color="#fff" />
              <Text style={styles.blockedBannerText}>{isAr ? 'مستخدم محظور' : 'Blocked User'}</Text>
            </View>
          </View>
        ) : null}

        {/* Sponsored label */}
        {sponsored ? (
          <View style={[styles.sponsoredBadge, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="campaign" size={9} color={colors.primary} />
            <Text style={[styles.sponsoredText, { color: colors.primary }]}>
              {isAr ? 'ممول' : 'Ad'}
            </Text>
          </View>
        ) : null}

        {/* Price badge overlaid on bottom of image */}
        <View style={[
          styles.priceBadge,
          { backgroundColor: isFree ? '#22C55E' : colors.primary },
          isRTL ? { right: 8, left: undefined } : { left: 8 },
        ]}>
          <Text style={styles.priceText}>{formatPrice(ad.price, isAr)}</Text>
        </View>
      </View>

      {/* ── INFO ── */}
      <View style={styles.info}>
        {/* Title */}
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {ad.title}
        </Text>

        {/* Location */}
        {rawLocation ? (
          <View style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.locationIconWrap, { backgroundColor: locationIconColor + '18' }]}>
              <MaterialIcons name={locationIconName} size={10} color={locationIconColor} />
            </View>
            <Text style={[styles.locationText, { color: colors.textSecondary, fontWeight: '600' }]} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
        ) : null}

        {/* Footer: category + time */}
        <View style={[styles.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {catName ? (
            <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
              <MaterialIcons name={(ad.categories as any)?.icon ?? 'category'} size={9} color={catColor} />
              <Text style={[styles.catText, { color: catColor }]} numberOfLines={1}>
                {catName}
              </Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <Text style={[styles.timeText, { color: colors.textMuted }]}>
            {timeAgo(ad.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flex: 1,
  },
  // Featured card gets a premium purple border — applied via inline style in the
  // Pressable wrapper so it can reference the `isFeatured` runtime value.
  imageWrap: { position: 'relative', zIndex: 0 },
  image: { width: '100%', height: CLAMP_IMG_H },
  imagePlaceholder: {
    width: '100%', height: CLAMP_IMG_H,
    alignItems: 'center', justifyContent: 'center',
  },

  // Badges — all use zIndex so they always sit above image content
  topLeft: {
    position: 'absolute', top: 7, left: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
    zIndex: 10,
    elevation: 5,
  },
  topRight: {
    position: 'absolute', top: 7, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
    zIndex: 10,
    elevation: 5,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },

  // Heart buttons — zIndex 11 ensures they render above the badge (zIndex 10)
  heartBtn: {
    position: 'absolute', top: 7, right: 7,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 11, elevation: 6,
  },
  heartBtnAlt: {
    // Offset below the badge row so both are tappable without overlap
    position: 'absolute', top: 36, right: 7,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 11, elevation: 6,
  },

  // Image count
  imgCount: {
    position: 'absolute', bottom: 32, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.xs, paddingHorizontal: 5, paddingVertical: 2,
  },
  imgCountText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Blocked overlay
  blockedOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  blockedBannerText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  // Sold overlay
  soldOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldBanner: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: Radius.sm, transform: [{ rotate: '-12deg' }],
  },
  soldBannerText: { color: '#fff', fontSize: FontSize.md, fontWeight: '900', letterSpacing: 3 },

  // Sponsored
  sponsoredBadge: {
    position: 'absolute', bottom: 32, left: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.xs, paddingHorizontal: 5, paddingVertical: 2,
  },
  sponsoredText: { fontSize: 9, fontWeight: '700' },

  // Price badge
  priceBadge: {
    position: 'absolute', bottom: 7,
    borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4,
  },
  priceText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },

  // Info
  info: { padding: SCREEN_W < 375 ? 8 : 10, gap: 4 },
  title: { fontSize: SCREEN_W < 375 ? FontSize.xs + 1 : FontSize.sm, fontWeight: '700', lineHeight: 19 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationIconWrap: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  locationText: { fontSize: 10, flex: 1 },
  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 4, marginTop: 2,
  },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2,
    flex: 1, maxWidth: '72%',
  },
  catText: { fontSize: 9, fontWeight: '700', flexShrink: 1 },
  timeText: { fontSize: 9, fontWeight: '500', flexShrink: 0 },
  imgErrorText: { fontSize: 9, fontWeight: '600', marginTop: 4 },
});
