import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, FlatList,
  Platform, StatusBar, I18nManager,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import type { Language } from '@/constants/i18n';

const { width } = Dimensions.get('window');
export const ONBOARDING_SEEN_KEY = '@souq_onboarding_seen';

const SLIDES = [
  {
    id: '1',
    iconName: 'storefront' as const,
    iconBg: '#0A6E5C',
    titleKey: 'onboarding1Title' as const,
    subKey: 'onboarding1Sub' as const,
  },
  {
    id: '2',
    iconName: 'local-offer' as const,
    iconBg: '#F59E0B',
    titleKey: 'onboarding2Title' as const,
    subKey: 'onboarding2Sub' as const,
  },
  {
    id: '3',
    iconName: 'groups' as const,
    iconBg: '#0A6E5C',
    titleKey: 'onboarding3Title' as const,
    subKey: 'onboarding3Sub' as const,
    isLogo: true,
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language, setLanguage } = useLanguage();

  const [currentIndex, setCurrentIndex] = useState(0);
  const isNavigatingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  // Animated value tracking scroll offset for dot animation
  const scrollX = useSharedValue(0);

  // Button entrance animation for last slide
  const btnOpacity = useSharedValue(0);
  const btnTranslateY = useSharedValue(20);

  const isLast = currentIndex === SLIDES.length - 1;
  const isRTL = language === 'ar';

  // Animate Get Started button in/out
  useEffect(() => {
    if (isLast) {
      btnOpacity.value = withTiming(1, { duration: 350 });
      btnTranslateY.value = withSpring(0, { damping: 14, stiffness: 160 });
    } else {
      btnOpacity.value = withTiming(0, { duration: 200 });
      btnTranslateY.value = withTiming(16, { duration: 200 });
    }
  }, [isLast]);

  const btnAnimStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ translateY: btnTranslateY.value }],
  }));

  // Reset navigation lock on index change
  useEffect(() => {
    isNavigatingRef.current = false;
  }, [currentIndex]);

  const finish = useCallback(async (source: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    } catch (_) {}
    router.replace('/beta-warning');
  }, [router]);

  const handleLangSwitch = useCallback((lang: Language) => {
    setLanguage(lang);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: currentIndex, animated: false });
    });
  }, [setLanguage, currentIndex]);

  // Swipe detection — accounts for RTL where scroll direction is flipped
  const handleScrollEnd = useCallback((e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(offsetX / width);

    // On RTL devices FlatList may invert scroll offset on some platforms
    const newIndex = isRTL
      ? Math.max(0, Math.min(SLIDES.length - 1, rawIndex))
      : Math.max(0, Math.min(SLIDES.length - 1, rawIndex));

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, isRTL]);

  // Dot press
  const handleDotPress = useCallback((i: number) => {
    flatListRef.current?.scrollToIndex({ index: i, animated: true });
    setCurrentIndex(i);
  }, []);

  const currentSlide = SLIDES[currentIndex];

  // Swipe hint arrow direction:
  // Arabic (RTL): swipe RIGHT  → forward = chevron_left pointing right gesture hint
  // English (LTR): swipe LEFT → forward = chevron_right pointing left gesture hint
  const swipeHintIcon = isRTL ? 'chevron-right' : 'chevron-left';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ── TOP BAR: Language + Skip ─────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.langRow}>
          {(['en', 'ar'] as Language[]).map(lang => (
            <Pressable
              key={lang}
              style={[
                styles.langPill,
                {
                  backgroundColor: language === lang ? colors.primary : colors.surface,
                  borderColor: language === lang ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleLangSwitch(lang)}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityLabel={`Switch to ${lang === 'en' ? 'English' : 'Arabic'}`}
            >
              <Text style={[styles.langPillText, { color: language === lang ? '#fff' : colors.textSecondary }]}>
                {lang === 'en' ? 'English' : 'العربية'}
              </Text>
            </Pressable>
          ))}
        </View>

        {!isLast ? (
          <Pressable
            onPress={() => finish('skip-button')}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            accessibilityLabel="Skip onboarding"
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]}>{t.skip}</Text>
          </Pressable>
        ) : (
          // Placeholder to keep layout stable
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      {/* ── SLIDES ───────────────────────────────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={(e) => {
          scrollX.value = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.illustrationWrap, { backgroundColor: colors.surface, ...Shadow.lg }]}>
              {(item as any).isLogo ? (
                <>
                  <View style={[styles.logoContainer, { backgroundColor: '#0A6E5C10' }]}>
                    <Image
                      source={require('@/assets/images/plankton-logo.png')}
                      style={styles.logoImage}
                      contentFit="contain"
                      transition={300}
                    />
                  </View>
                  <View style={[styles.logoTagWrap, { backgroundColor: colors.primary }]}>
                    <Text style={styles.logoTagText}>Plankton Team</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.illustrationCircle, { backgroundColor: item.iconBg + '18' }]}>
                    <View style={[styles.illustrationInner, { backgroundColor: item.iconBg }]}>
                      <MaterialIcons name={item.iconName} size={52} color="#fff" />
                    </View>
                  </View>
                  <View style={[styles.ring1, { borderColor: item.iconBg + '25' }]} />
                  <View style={[styles.ring2, { borderColor: item.iconBg + '15' }]} />
                </>
              )}
            </View>

            <View style={styles.textArea}>
              <Text style={[styles.slideTitle, { color: colors.textPrimary }]}>
                {t[item.titleKey]}
              </Text>
              <Text style={[styles.slideSub, { color: colors.textSecondary }]}>
                {t[item.subKey]}
              </Text>
            </View>
          </View>
        )}
      />

      {/* ── BOTTOM AREA ──────────────────────────────────────────────────── */}
      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 20) + Spacing.md }]}>

        {/* Swipe hint — shows on slides 1 and 2 only */}
        {!isLast ? (
          <View style={styles.swipeHintRow}>
            {isRTL ? (
              // Arabic: hint to swipe RIGHT
              <>
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} style={{ opacity: 0.5 }} />
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} style={{ opacity: 0.7 }} />
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
                <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
                  {language === 'ar' ? 'اسحب يميناً' : 'Swipe right'}
                </Text>
              </>
            ) : (
              // English: hint to swipe LEFT
              <>
                <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
                  Swipe left
                </Text>
                <MaterialIcons name="chevron-left" size={20} color={colors.textMuted} />
                <MaterialIcons name="chevron-left" size={20} color={colors.textMuted} style={{ opacity: 0.7 }} />
                <MaterialIcons name="chevron-left" size={20} color={colors.textMuted} style={{ opacity: 0.5 }} />
              </>
            )}
          </View>
        ) : (
          <View style={styles.swipeHintRow} />
        )}

        {/* Pagination dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const dotAnimStyle = useAnimatedStyle(() => {
              const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
              const dotWidth = interpolate(
                scrollX.value,
                inputRange,
                [8, 28, 8],
                Extrapolation.CLAMP
              );
              const opacity = interpolate(
                scrollX.value,
                inputRange,
                [0.4, 1, 0.4],
                Extrapolation.CLAMP
              );
              return { width: dotWidth, opacity };
            });

            return (
              <Pressable
                key={i}
                onPress={() => handleDotPress(i)}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                accessibilityLabel={`Go to slide ${i + 1}`}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    { backgroundColor: SLIDES[i].iconBg },
                    dotAnimStyle,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Get Started button — animated in on last slide */}
        <Animated.View style={[styles.btnWrap, btnAnimStyle]} pointerEvents={isLast ? 'auto' : 'none'}>
          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor: currentSlide.iconBg,
                opacity: pressed ? 0.88 : 1,
                ...Shadow.colored,
              },
            ]}
            onPress={() => finish('get-started')}
            accessibilityLabel="Get Started"
            accessibilityRole="button"
          >
            <Text style={[styles.startBtnText, { writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
              {t.getStarted}
            </Text>
            <MaterialIcons
              name={isRTL ? 'arrow-back' : 'arrow-forward'}
              size={22}
              color="#fff"
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 10,
  },
  langRow: { flexDirection: 'row', gap: Spacing.sm },
  langPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillText: { fontSize: FontSize.sm, fontWeight: '600' },
  skipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    minHeight: 44,
    textAlignVertical: 'center',
    lineHeight: 44,
  },
  skipPlaceholder: { width: 60, height: 44 },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
  },
  illustrationWrap: {
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  illustrationCircle: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationInner: {
    width: width * 0.36,
    height: width * 0.36,
    borderRadius: width * 0.18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring1: {
    position: 'absolute',
    width: width * 0.62,
    height: width * 0.62,
    borderRadius: width * 0.31,
    borderWidth: 1.5,
  },
  ring2: {
    position: 'absolute',
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    borderWidth: 1,
  },

  logoContainer: {
    width: width * 0.58,
    height: width * 0.38,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 16,
  },
  logoImage: { width: '100%', height: '100%' },
  logoTagWrap: {
    position: 'absolute',
    bottom: 14,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  logoTagText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.3 },

  textArea: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  slideTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  slideSub: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },

  // ── Bottom area ───────────────────────────────────────────────────────────
  bottomArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
  },

  // Swipe hint
  swipeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 28,
  },
  swipeHintText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginHorizontal: 4,
  },

  // Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    minHeight: 20,
  },
  dot: {
    height: 8,
    borderRadius: Radius.full,
  },

  // Get Started button
  btnWrap: {
    width: '100%',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.xl,
    paddingVertical: 18,
    minHeight: 58,
    width: '100%',
  },
  startBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
});
