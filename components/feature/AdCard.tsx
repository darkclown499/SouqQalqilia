import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
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
}

function formatPrice(price: number, isAr: boolean) {
  if (price === 0) return isAr ? 'مجاني' : 'Free';
  return `₪${price.toLocaleString()}`;
}

export const AdCard = memo(function AdCard({ ad, width, sponsored, isFavorited = false, onFavoritePress }: AdCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  const sortedImages = ad.ad_images?.sort((a, b) => a.position - b.position) ?? [];
  const firstImage = sortedImages[0];
  const isFree = ad.price === 0;
  const isBoosted = ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now();
  const isFeatured = ad.status === 'featured';
  const isSold = ad.status === 'sold';
  const isNew = ad.condition === 'new';

  const catName = ad.categories ? getCategoryName(ad.categories as any, language) : null;
  const catColor = ad.categories?.color ?? colors.primary;

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
      onPress={() => router.push(`/ad/${ad.id}`)}
    >
      {/* ── IMAGE ── */}
      <View style={styles.imageWrap}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage.url }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="camera-alt" size={26} color={colors.border} />
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

        {/* Top-right: boosted OR featured label */}
        {isBoosted ? (
          <View style={[styles.topRight, { backgroundColor: colors.accent }]}>
            <MaterialIcons name="bolt" size={10} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'مميز' : 'Top'}</Text>
          </View>
        ) : isFeatured ? (
          <View style={[styles.topRight, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="star" size={10} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'بارز' : 'Pick'}</Text>
          </View>
        ) : null}

        {/* Favorite button (top-right when no boost badge) */}
        {onFavoritePress && !isBoosted && !isFeatured ? (
          <Pressable
            style={[styles.heartBtn, {
              backgroundColor: isFavorited ? '#FF3B6B' : 'rgba(0,0,0,0.38)',
            }]}
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

        {/* Favorite when there IS a boost/featured badge - place differently */}
        {onFavoritePress && (isBoosted || isFeatured) ? (
          <Pressable
            style={[styles.heartBtnAlt, {
              backgroundColor: isFavorited ? '#FF3B6B' : 'rgba(0,0,0,0.38)',
            }]}
            onPress={handleFavorite}
            hitSlop={10}
          >
            <MaterialIcons
              name={isFavorited ? 'favorite' : 'favorite-border'}
              size={13}
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
        {ad.location ? (
          <View style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialIcons name="location-on" size={11} color={colors.textMuted} />
            <Text style={[styles.locationText, { color: colors.textMuted }]} numberOfLines={1}>
              {ad.location}
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
  imageWrap: { position: 'relative' },
  image: { width: '100%', height: CLAMP_IMG_H },
  imagePlaceholder: {
    width: '100%', height: CLAMP_IMG_H,
    alignItems: 'center', justifyContent: 'center',
  },

  // Badges
  topLeft: {
    position: 'absolute', top: 7, left: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
  },
  topRight: {
    position: 'absolute', top: 7, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },

  // Heart buttons
  heartBtn: {
    position: 'absolute', top: 7, right: 7,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  heartBtnAlt: {
    position: 'absolute', top: 34, right: 7,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },

  // Image count
  imgCount: {
    position: 'absolute', bottom: 32, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.xs, paddingHorizontal: 5, paddingVertical: 2,
  },
  imgCountText: { color: '#fff', fontSize: 9, fontWeight: '700' },

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
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
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
});
