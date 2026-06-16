import React, { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Ad } from '@/services/adsService';
import { Radius, FontSize, Spacing, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useResponsive } from '@/hooks/useResponsive';
import { getCategoryName } from '@/services/categoriesService';
import { timeAgo } from '@/utils/timeAgo';

// Initial screen width — used only for static StyleSheet.create() fallbacks.
// All layout-sensitive values are computed reactively inside the component.
const { width: INIT_W } = Dimensions.get('window');
const INIT_CLAMP_IMG_H = Math.max(130, Math.min(Math.round(INIT_W * 0.265), 200));

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

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
interface ShimmerBlockProps {
  style: object;
  isDark?: boolean;
}

export function ShimmerBlock({ style, isDark = false }: ShimmerBlockProps) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const { width: screenW } = useResponsive();
  const sweepColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.42)';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <View style={[shimStyles.base, style]}>
      <Animated.View
        style={[
          shimStyles.sweep,
          {
            transform: [{
              translateX: shimmer.interpolate({
                inputRange: [0, 1],
                outputRange: [-screenW, screenW],
              }),
            }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', sweepColor, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[shimStyles.gradient, { width: screenW }]}
        />
      </Animated.View>
    </View>
  );
}

const shimStyles = StyleSheet.create({
  base: { overflow: 'hidden', backgroundColor: '#E2E8F0' },
  sweep: { ...StyleSheet.absoluteFillObject },
  gradient: { flex: 1, width: INIT_W },
});



export const AdCard = memo(function AdCard({
  ad, width, sponsored, isFavorited = false,
  onFavoritePress, onAdPress, isBlocked = false,
}: AdCardProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { language, isRTL } = useLanguage();
  const { width: screenW, isTablet, isDesktop } = useResponsive();
  const isAr = language === 'ar';
  const [imgError, setImgError] = useState(false);

  // Must be declared before the ref that reads it
  const sortedImages = useMemo(
    () => (ad.ad_images ? [...ad.ad_images].sort((a, b) => a.position - b.position) : []),
    [ad.ad_images]
  );
  const firstImage = sortedImages[0];
  const firstImageUrl = firstImage?.url;

  // Reset imgError whenever the image URL changes (e.g. FlatList cell recycled)
  const firstImageUrlRef = React.useRef<string | undefined>(undefined);
  if (firstImageUrlRef.current !== firstImageUrl) {
    firstImageUrlRef.current = firstImageUrl;
    if (imgError) setImgError(false); // safe synchronous reset during render
  }

  // Reactive image height: scales with live screen width
  const clampImgH = useMemo(
    () => Math.max(130, Math.min(Math.round(screenW * (isTablet || isDesktop ? 0.20 : 0.265)), 220)),
    [screenW, isTablet, isDesktop]
  );

  // Info padding scales with screen size
  const infoPad = screenW < 375 ? 8 : isTablet ? 12 : 10;
  const titleSize = screenW < 375 ? FontSize.xs + 1 : isTablet ? FontSize.md : FontSize.sm;

  const isBoosted = useMemo(
    () => !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now()),
    [ad.boosted_until]
  );
  const isFeatured = ad.status === 'featured';
  const isSold = ad.status === 'sold';
  const isNew = ad.condition === 'new';
  const isFree = ad.price === 0;

  const catName = useMemo(
    () => (ad.categories ? getCategoryName(ad.categories as any, language) : null),
    [ad.categories, language]
  );
  const catColor = ad.categories?.color ?? colors.primary;

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
            style={{ width: '100%', height: clampImgH }}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
            recyclingKey={firstImage.url}
            priority={isFeatured || isBoosted ? 'high' : 'normal'}
            responsivePolicy="live"
            placeholder={firstImage.blurhash ? { blurhash: firstImage.blurhash } : undefined}
            placeholderContentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : imgError ? (
          <View style={[{ width: '100%', height: clampImgH }, styles.imagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="broken-image" size={26} color={colors.border} />
            <Text style={[styles.imgErrorText, { color: colors.textMuted }]}>
              {isAr ? 'تعذّر التحميل' : 'Failed to load'}
            </Text>
          </View>
        ) : (
          <ShimmerBlock
            style={{ width: '100%', height: clampImgH, borderRadius: 0, backgroundColor: colors.surfaceTint }}
            isDark={isDark}
          />
        )}

        {/* Condition badge */}
        <View style={[styles.topLeft, { backgroundColor: isNew ? colors.primary : 'rgba(0,0,0,0.48)' }]}>
          <MaterialIcons name={isNew ? 'fiber-new' : 'recycling'} size={10} color="#fff" />
          <Text style={styles.badgeText}>{isNew ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}</Text>
        </View>

        {/* Boost / Featured badge */}
        {isBoosted ? (
          <View style={[styles.topRight, { backgroundColor: colors.accent, zIndex: 10 }]}>
            <MaterialIcons name="bolt" size={11} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'مميز' : 'Top'}</Text>
          </View>
        ) : isFeatured ? (
          <View style={[styles.topRight, { backgroundColor: '#7C3AED', zIndex: 10 }]}>
            <MaterialIcons name="workspace-premium" size={11} color="#fff" />
            <Text style={styles.badgeText}>{isAr ? 'بارز' : 'Featured'}</Text>
          </View>
        ) : null}

        {/* Favorite button */}
        {onFavoritePress ? (
          <Pressable
            style={[
              (isBoosted || isFeatured) ? styles.heartBtnAlt : styles.heartBtn,
              { backgroundColor: isFavorited ? '#FF3B6B' : 'rgba(0,0,0,0.38)', zIndex: 11 },
            ]}
            onPress={handleFavorite}
            hitSlop={10}
          >
            <MaterialIcons name={isFavorited ? 'favorite' : 'favorite-border'} size={14} color="#fff" />
          </Pressable>
        ) : null}

        {/* Sold overlay */}
        {isSold ? (
          <View style={styles.soldOverlay}>
            <View style={[styles.soldBanner, { backgroundColor: colors.error }]}>
              <Text style={styles.soldBannerText}>{isAr ? 'مباع' : 'SOLD'}</Text>
            </View>
          </View>
        ) : null}

        {/* Blocked overlay */}
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
            <Text style={[styles.sponsoredText, { color: colors.primary }]}>{isAr ? 'ممول' : 'Ad'}</Text>
          </View>
        ) : null}

        {/* Price badge */}
        <View style={[
          styles.priceBadge,
          { backgroundColor: isFree ? '#22C55E' : colors.primary },
          isRTL ? { right: 8, left: undefined } : { left: 8 },
        ]}>
          <Text style={styles.priceText}>{formatPrice(ad.price, isAr)}</Text>
        </View>
      </View>

      {/* ── INFO ── */}
      <View style={[styles.info, { padding: infoPad }]}>
        <Text style={[styles.title, { color: colors.textPrimary, fontSize: titleSize }]} numberOfLines={2}>
          {ad.title}
        </Text>

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

        <View style={[styles.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {catName ? (
            <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
              <MaterialIcons name={(ad.categories as any)?.icon ?? 'category'} size={9} color={catColor} />
              <Text style={[styles.catText, { color: catColor }]} numberOfLines={1}>{catName}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{timeAgo(ad.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', flex: 1 },
  imageWrap: { position: 'relative', zIndex: 0 },
  shimmerImage: { borderRadius: 0 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  shimmerTitle: { height: 14, borderRadius: 7, width: '80%', alignSelf: 'flex-start', marginBottom: 4 },
  shimmerSubline: { height: 10, borderRadius: 5, width: '55%', alignSelf: 'flex-start' },
  topLeft: {
    position: 'absolute', top: 7, left: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
    zIndex: 10, elevation: 5,
  },
  topRight: {
    position: 'absolute', top: 7, right: 7,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 3,
    zIndex: 10, elevation: 5,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },
  heartBtn: {
    position: 'absolute', top: 7, right: 7,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 11, elevation: 6,
  },
  heartBtnAlt: {
    position: 'absolute', top: 36, right: 7,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 11, elevation: 6,
  },
  blockedOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm,
  },
  blockedBannerText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  soldOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldBanner: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: Radius.sm, transform: [{ rotate: '-12deg' }] },
  soldBannerText: { color: '#fff', fontSize: FontSize.md, fontWeight: '900', letterSpacing: 3 },
  sponsoredBadge: {
    position: 'absolute', bottom: 32, left: 7,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.xs, paddingHorizontal: 5, paddingVertical: 2,
  },
  sponsoredText: { fontSize: 9, fontWeight: '700' },
  serialBadge: {
    position: 'absolute', bottom: 32,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: Radius.xs, paddingHorizontal: 5, paddingVertical: 2, zIndex: 9,
  },
  serialBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: 8, fontWeight: '700', letterSpacing: 0.2 },
  priceBadge: { position: 'absolute', bottom: 7, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  priceText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
  info: { gap: 4 },
  title: { fontWeight: '700', lineHeight: 19 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationIconWrap: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  locationText: { fontSize: 10, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, flex: 1, maxWidth: '72%' },
  catText: { fontSize: 9, fontWeight: '700', flexShrink: 1 },
  timeText: { fontSize: 9, fontWeight: '500', flexShrink: 0 },
  imgErrorText: { fontSize: 9, fontWeight: '600', marginTop: 4 },
});
