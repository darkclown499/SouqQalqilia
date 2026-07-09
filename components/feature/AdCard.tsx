import React, { memo, useCallback, useMemo, useState, useRef, useEffect, FC } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

function isProductRequest(ad: Ad): boolean {
  return ad.ad_type === 'product_request';
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

// ── AdImage: isolated component so React key-prop causes full remount ─────────
// When FlatList recycles a cell with a new URL, key={url} forces a fresh
// mount — imgError resets automatically with no useEffect race conditions.
interface AdImageProps {
  url: string;
  blurhash?: string | null;
  height: number;
  priority: 'low' | 'normal' | 'high';
  isDark: boolean;
  colors: any;
  isAr: boolean;
}

const AdImage: FC<AdImageProps> = ({ url, blurhash, height, priority, isDark, colors, isAr }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <View style={[{ width: '100%', height }, adImgStyles.errorWrap, { backgroundColor: colors.surfaceTint }]}>
        <MaterialIcons name="broken-image" size={26} color={colors.border} />
        <Text style={[adImgStyles.errorText, { color: colors.textMuted }]}>
          {isAr ? 'تعذّر التحميل' : 'Failed to load'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: '100%', height }}
      contentFit="cover"
      transition={200}
      cachePolicy="disk"
      priority={priority}
      placeholder={blurhash ? { blurhash } : (isDark ? '#1e2a24' : '#e8f0ed')}
      placeholderContentFit="cover"
      onError={() => setError(true)}
    />
  );
};

const adImgStyles = StyleSheet.create({
  errorWrap: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 9, fontWeight: '600', marginTop: 4 },
});

// ── Category-specific styles for product request placeholders ─────────────────
interface RequestStyle {
  icon: string;
  iconFamily: 'material' | 'community';
  gradientColors: [string, string];
  iconColor: string;
}

const REQUEST_CATEGORY_STYLES: Record<string, RequestStyle> = {
  'سيارات ومركبات': { icon: 'directions-car', iconFamily: 'material', gradientColors: ['#E3F2FD', '#BBDEFB'], iconColor: '#1E88E5' },
  'سيارات':         { icon: 'directions-car', iconFamily: 'material', gradientColors: ['#E3F2FD', '#BBDEFB'], iconColor: '#1E88E5' },
  'عقارات':         { icon: 'home', iconFamily: 'material', gradientColors: ['#FFE0B2', '#FFCC80'], iconColor: '#FB8C00' },
  'إلكترونيات':     { icon: 'laptop', iconFamily: 'material', gradientColors: ['#E0F2F1', '#B2DFDB'], iconColor: '#00897B' },
  'هواتف':          { icon: 'smartphone', iconFamily: 'material', gradientColors: ['#E0F2F1', '#B2DFDB'], iconColor: '#00897B' },
  'وظائف':          { icon: 'work', iconFamily: 'material', gradientColors: ['#F3E5F5', '#E1BEE7'], iconColor: '#8E24AA' },
  'موضة':           { icon: 'checkroom', iconFamily: 'material', gradientColors: ['#FCE4EC', '#F8BBD0'], iconColor: '#D81B60' },
  'ملابس':          { icon: 'checkroom', iconFamily: 'material', gradientColors: ['#FCE4EC', '#F8BBD0'], iconColor: '#D81B60' },
  'مأكولات وحلويات':{ icon: 'restaurant', iconFamily: 'material', gradientColors: ['#FFF3E0', '#FFE0B2'], iconColor: '#F4511E' },
  'طعام':           { icon: 'restaurant', iconFamily: 'material', gradientColors: ['#FFF3E0', '#FFE0B2'], iconColor: '#F4511E' },
  'حيوانات':        { icon: 'pets', iconFamily: 'material', gradientColors: ['#E8F5E9', '#C8E6C9'], iconColor: '#43A047' },
  'زينة وهدايا':    { icon: 'card-giftcard', iconFamily: 'material', gradientColors: ['#FFFDE7', '#FFF9C4'], iconColor: '#FDD835' },
  'هدايا':          { icon: 'card-giftcard', iconFamily: 'material', gradientColors: ['#FFFDE7', '#FFF9C4'], iconColor: '#FDD835' },
  'أثاث':           { icon: 'chair', iconFamily: 'material', gradientColors: ['#FBE9E7', '#FFCCBC'], iconColor: '#E64A19' },
  'رياضة':          { icon: 'sports-soccer', iconFamily: 'material', gradientColors: ['#E8F5E9', '#C8E6C9'], iconColor: '#2E7D32' },
  'كتب':            { icon: 'menu-book', iconFamily: 'material', gradientColors: ['#EDE7F6', '#D1C4E9'], iconColor: '#5E35B1' },
  'أطفال':          { icon: 'child-care', iconFamily: 'material', gradientColors: ['#FCE4EC', '#F8BBD0'], iconColor: '#E91E63' },
  'مجوهرات':        { icon: 'diamond', iconFamily: 'material', gradientColors: ['#FFF8E1', '#FFECB3'], iconColor: '#FFB300' },
  'أدوات':          { icon: 'build', iconFamily: 'material', gradientColors: ['#EFEBE9', '#D7CCC8'], iconColor: '#6D4C41' },
  'خدمات':          { icon: 'miscellaneous-services', iconFamily: 'material', gradientColors: ['#E1F5FE', '#B3E5FC'], iconColor: '#0288D1' },
  'بيت وحديقة':     { icon: 'yard', iconFamily: 'material', gradientColors: ['#E8F5E9', '#DCEDC8'], iconColor: '#558B2F' },
};

const DEFAULT_REQUEST_STYLE: RequestStyle = {
  icon: 'search', iconFamily: 'material',
  gradientColors: ['#ECEFF1', '#CFD8DC'], iconColor: '#546E7A',
};

function getRequestStyle(categoryName: string | null | undefined): RequestStyle {
  if (!categoryName) return DEFAULT_REQUEST_STYLE;
  const direct = REQUEST_CATEGORY_STYLES[categoryName.trim()];
  if (direct) return direct;
  // Partial match
  for (const key of Object.keys(REQUEST_CATEGORY_STYLES)) {
    if (categoryName.includes(key) || key.includes(categoryName)) {
      return REQUEST_CATEGORY_STYLES[key];
    }
  }
  return DEFAULT_REQUEST_STYLE;
}

// ── Native Arabic request placeholder ────────────────────────────────────────
interface RequestPlaceholderProps {
  height: number;
  categoryName: string | null;
  title?: string | null;
  description?: string | null;
  isAr: boolean;
}

const RequestPlaceholder: FC<RequestPlaceholderProps> = ({ height, categoryName, title, description, isAr }) => {
  const style = getRequestStyle(categoryName);
  const truncatedDesc = description
    ? (description.length > 50 ? description.slice(0, 50) + '…' : description)
    : null;

  return (
    <View style={[reqPh.container, { height, backgroundColor: style.gradientColors[0] }]}>
      {/* Large background icon — translucent watermark */}
      <View style={reqPh.bgIconWrap} pointerEvents="none">
        <MaterialIcons
          name={style.icon as any}
          size={96}
          color={style.iconColor}
          style={{ opacity: 0.12 }}
        />
      </View>

      {/* Top pill badge: مطلوب • category */}
      <View style={reqPh.pillBadge}>
        <Text style={reqPh.pillBadgeText}>
          {categoryName ? `مطلوب • ${categoryName}` : 'مطلوب'}
        </Text>
      </View>

      {/* Foreground icon */}
      <MaterialIcons
        name={style.icon as any}
        size={30}
        color={style.iconColor}
        style={{ opacity: 0.88 }}
      />

      {/* Post title — large bold Arabic */}
      {title ? (
        <Text style={reqPh.titleText} numberOfLines={2}>
          {title}
        </Text>
      ) : (
        <Text style={reqPh.wantedText}>مطلوب</Text>
      )}

      {/* Description snippet */}
      {truncatedDesc ? (
        <Text style={reqPh.descText} numberOfLines={2}>
          {truncatedDesc}
        </Text>
      ) : null}
    </View>
  );
};

const reqPh = StyleSheet.create({
  container: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingHorizontal: 14, paddingVertical: 10,
    position: 'relative', overflow: 'hidden',
  },
  bgIconWrap: {
    position: 'absolute',
    top: '50%', left: '50%',
    transform: [{ translateX: -48 }, { translateY: -48 }],
  },
  pillBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  pillBadgeText: {
    color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4,
  },
  titleText: {
    fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#fff',
    lineHeight: 25, letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.22)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  wantedText: {
    fontSize: 24, fontWeight: '900', textAlign: 'center', color: '#fff',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  descText: {
    fontSize: 11, fontWeight: '500', textAlign: 'center',
    color: 'rgba(255,255,255,0.72)', lineHeight: 15, paddingHorizontal: 4,
  },
  catText: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
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

  // ── isRequest MUST be declared before any useMemo that references it ──────
  const isRequest = isProductRequest(ad);

  const sortedImages = useMemo(
    () => (ad.ad_images ? [...ad.ad_images].sort((a, b) => a.position - b.position) : []),
    [ad.ad_images]
  );
  const rawFirstImage = sortedImages[0];
  // For product requests, skip external placeholder URLs (placehold.co / WANTED) — render native UI instead
  const isPlaceholderUrl = (url?: string) =>
    !url || url.includes('placehold.co') || url.toUpperCase().includes('WANTED');
  const firstImage = (isRequest && isPlaceholderUrl(rawFirstImage?.url)) ? undefined : rawFirstImage;

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
  // isRequest already declared above — do not re-declare here

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
        {firstImage ? (
          /* ── AdImage: key=url forces full remount on cell recycle ─────────── */
          /* This guarantees error state resets cleanly with zero race conditions */
          <AdImage
            key={firstImage.url}
            url={firstImage.url}
            blurhash={firstImage.blurhash}
            height={clampImgH}
            priority={isFeatured || isBoosted ? 'high' : 'normal'}
            isDark={isDark}
            colors={colors}
            isAr={isAr}
          />
        ) : isRequest ? (
          /* ── Request with no image — show native Arabic gradient placeholder ── */
          <RequestPlaceholder
            height={clampImgH}
            categoryName={catName}
            title={ad.title}
            description={ad.description}
            isAr={isAr}
          />
        ) : (
          /* ── No image at all — show shimmer ─────────────────────────────── */
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

        {/* Price / Request badge */}
        <View style={[
          styles.priceBadge,
          {
            backgroundColor: isRequest
              ? '#F57C00'
              : isFree ? '#22C55E' : colors.primary,
          },
          isRTL ? { right: 8, left: undefined } : { left: 8 },
        ]}>
          {isRequest ? (
            <Text style={[styles.priceText, { fontWeight: '900' }]}>{'مطلوب'}</Text>
          ) : (
            <Text style={styles.priceText}>{formatPrice(ad.price, isAr)}</Text>
          )}
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
  imgErrorText: { fontSize: 9, fontWeight: '600', marginTop: 4 }, // kept for legacy reference
});
