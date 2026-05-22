
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  Platform, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
  useAnimatedScrollHandler,
  Easing,
} from 'react-native-reanimated';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import type { Language } from '@/constants/i18n';

const { width, height } = Dimensions.get('window');
export const ONBOARDING_SEEN_KEY = '@souq_onboarding_seen';

// ── Slide data ────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: '1',
    iconName: 'storefront' as const,
    gradient: ['#0A6E5C', '#0D9176', '#10A882'],
    accentColor: '#4EECD4',
    particleColor: 'rgba(255,255,255,0.12)',
    titleKey: 'onboarding1Title' as const,
    subKey: 'onboarding1Sub' as const,
    decorIcon1: 'sell' as const,
    decorIcon2: 'shopping-bag' as const,
    decorIcon3: 'local-offer' as const,
  },
  {
    id: '2',
    iconName: 'local-offer' as const,
    gradient: ['#D97706', '#F59E0B', '#FBBF24'],
    accentColor: '#FDE68A',
    particleColor: 'rgba(255,255,255,0.12)',
    titleKey: 'onboarding2Title' as const,
    subKey: 'onboarding2Sub' as const,
    decorIcon1: 'star' as const,
    decorIcon2: 'favorite' as const,
    decorIcon3: 'thumb-up' as const,
  },
  {
    id: '3',
    iconName: 'groups' as const,
    gradient: ['#075247', '#0A6E5C', '#0D8A72'],
    accentColor: '#6EF0D8',
    particleColor: 'rgba(255,255,255,0.12)',
    titleKey: 'onboarding3Title' as const,
    subKey: 'onboarding3Sub' as const,
    decorIcon1: 'handshake' as const,
    decorIcon2: 'people' as const,
    decorIcon3: 'location-on' as const,
    isLogo: true,
  },
];

// ── Floating decoration icon ─────────────────────────────────────────────────
function FloatingIcon({
  iconName, size, color, top, left, right, bottom, delay, rotateDir = 1,
}: {
  iconName: any; size: number; color: string;
  top?: number; left?: number; right?: number; bottom?: number;
  delay?: number; rotateDir?: number;
}) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay ?? 0, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(
      delay ?? 0,
      withRepeat(
        withSequence(
          withTiming(-12, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false
      )
    );
    rotate.value = withDelay(
      delay ?? 0,
      withRepeat(
        withSequence(
          withTiming(rotateDir * 8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(-rotateDir * 8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[
      styles.floatingIcon,
      { top, left, right, bottom },
      style,
    ]}>
      <MaterialIcons name={iconName} size={size} color={color} />
    </Animated.View>
  );
}

// ── Pulse ring ────────────────────────────────────────────────────────────────
function PulseRing({ size, color, delay }: { size: number; color: string; delay: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(0.5, { duration: 0 }),
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[
      styles.pulseRing,
      { width: size, height: size, borderRadius: size / 2, borderColor: color },
      style,
    ]} />
  );
}

// ── Main icon with bounce-in ──────────────────────────────────────────────────
function MainIcon({ iconName, accentColor, isActive }: {
  iconName: any; accentColor: string; isActive: boolean;
}) {
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-15);

  useEffect(() => {
    if (isActive) {
      scale.value = withSpring(1, { damping: 10, stiffness: 120 });
      rotate.value = withSpring(0, { damping: 14, stiffness: 100 });
    } else {
      scale.value = withTiming(0.3, { duration: 200 });
      rotate.value = withTiming(-15, { duration: 200 });
    }
  }, [isActive]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={style}>
      <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <View style={[styles.iconInner, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <MaterialIcons name={iconName} size={72} color="#fff" />
        </View>
        {/* Glow behind icon */}
        <View style={[styles.iconGlow, { backgroundColor: accentColor + '40' }]} />
      </View>
    </Animated.View>
  );
}

// ── Animated text block ───────────────────────────────────────────────────────
function SlideText({ title, subtitle, isActive }: {
  title: string; subtitle: string; isActive: boolean;
}) {
  const titleY = useSharedValue(40);
  const titleOp = useSharedValue(0);
  const subY = useSharedValue(40);
  const subOp = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      titleY.value = withDelay(120, withSpring(0, { damping: 14, stiffness: 120 }));
      titleOp.value = withDelay(120, withTiming(1, { duration: 400 }));
      subY.value = withDelay(240, withSpring(0, { damping: 14, stiffness: 120 }));
      subOp.value = withDelay(240, withTiming(1, { duration: 400 }));
    } else {
      titleY.value = withTiming(40, { duration: 180 });
      titleOp.value = withTiming(0, { duration: 180 });
      subY.value = withTiming(40, { duration: 180 });
      subOp.value = withTiming(0, { duration: 180 });
    }
  }, [isActive]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOp.value,
    transform: [{ translateY: titleY.value }],
  }));

  const subStyle = useAnimatedStyle(() => ({
    opacity: subOp.value,
    transform: [{ translateY: subY.value }],
  }));

  return (
    <View style={styles.textBlock}>
      <Animated.Text style={[styles.slideTitle, titleStyle]}>{title}</Animated.Text>
      <Animated.Text style={[styles.slideSub, subStyle]}>{subtitle}</Animated.Text>
    </View>
  );
}

// ── Animated dot ──────────────────────────────────────────────────────────────
function Dot({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const dotW = useSharedValue(isActive ? 28 : 8);
  const dotOp = useSharedValue(isActive ? 1 : 0.4);

  useEffect(() => {
    dotW.value = withSpring(isActive ? 28 : 8, { damping: 12, stiffness: 160 });
    dotOp.value = withTiming(isActive ? 1 : 0.4, { duration: 250 });
  }, [isActive]);

  const style = useAnimatedStyle(() => ({
    width: dotW.value,
    opacity: dotOp.value,
  }));

  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

// ── Slide ─────────────────────────────────────────────────────────────────────
function Slide({ item, isActive }: { item: typeof SLIDES[0]; isActive: boolean }) {
  return (
    <View style={[styles.slide, { width }]}>
      {/* Illustration area */}
      <View style={styles.illustrationArea}>
        {/* Pulse rings */}
        <View style={styles.ringsWrap}>
          <PulseRing size={200} color="rgba(255,255,255,0.5)" delay={0} />
          <PulseRing size={200} color="rgba(255,255,255,0.4)" delay={600} />
          <PulseRing size={200} color="rgba(255,255,255,0.3)" delay={1200} />
        </View>

        {/* Floating decoration icons */}
        <FloatingIcon iconName={item.decorIcon1} size={28} color="rgba(255,255,255,0.55)" top={height * 0.06} left={width * 0.06} delay={200} />
        <FloatingIcon iconName={item.decorIcon2} size={22} color="rgba(255,255,255,0.4)" top={height * 0.12} right={width * 0.07} delay={500} rotateDir={-1} />
        <FloatingIcon iconName={item.decorIcon3} size={20} color="rgba(255,255,255,0.35)" top={height * 0.22} left={width * 0.12} delay={800} />

        {/* Main icon */}
        {item.isLogo ? (
          <Animated.View style={[
            styles.logoWrap,
            useAnimatedStyle(() => ({
              opacity: withTiming(isActive ? 1 : 0, { duration: 300 }),
              transform: [{ scale: withSpring(isActive ? 1 : 0.4, { damping: 10, stiffness: 120 }) }],
            })),
          ]}>
            <View style={styles.logoCard}>
              <Image
                source={require('@/assets/images/plankton-logo.png')}
                style={styles.logoImage}
                contentFit="contain"
                transition={300}
              />
            </View>
            <View style={styles.logoTag}>
              <Text style={styles.logoTagText}>Plankton Team</Text>
            </View>
          </Animated.View>
        ) : (
          <MainIcon iconName={item.iconName} accentColor={item.accentColor} isActive={isActive} />
        )}

        {/* Sparkle dots */}
        <View style={[styles.sparkle, { top: height * 0.04, right: width * 0.18, backgroundColor: item.accentColor }]} />
        <View style={[styles.sparkle, { top: height * 0.17, left: width * 0.2, backgroundColor: 'rgba(255,255,255,0.7)', width: 6, height: 6 }]} />
        <View style={[styles.sparkle, { bottom: 20, right: width * 0.25, backgroundColor: item.accentColor, opacity: 0.6 }]} />
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();

  const [currentIndex, setCurrentIndex] = useState(0);
  const isNavigatingRef = useRef(false);
  const scrollRef = useRef<Animated.ScrollView>(null);

  const isLast = currentIndex === SLIDES.length - 1;
  const isRTL = language === 'ar';
  const slide = SLIDES[currentIndex];

  // Background color transition
  const bgAnim = useSharedValue(0);
  useEffect(() => {
    bgAnim.value = withTiming(currentIndex, { duration: 500 });
  }, [currentIndex]);

  // Button animation
  const btnScale = useSharedValue(0.8);
  const btnOp = useSharedValue(0);
  const btnTranslateY = useSharedValue(20);

  useEffect(() => {
    if (isLast) {
      btnScale.value = withDelay(100, withSpring(1, { damping: 10, stiffness: 130 }));
      btnOp.value = withDelay(100, withTiming(1, { duration: 350 }));
      btnTranslateY.value = withDelay(100, withSpring(0, { damping: 12, stiffness: 140 }));
    } else {
      btnScale.value = withTiming(0.8, { duration: 200 });
      btnOp.value = withTiming(0, { duration: 200 });
      btnTranslateY.value = withTiming(20, { duration: 200 });
    }
  }, [isLast]);

  const btnAnimStyle = useAnimatedStyle(() => ({
    opacity: btnOp.value,
    transform: [
      { scale: btnScale.value },
      { translateY: btnTranslateY.value },
    ],
  }));

  // Next button opacity (non-last slides)
  const nextOp = useSharedValue(1);
  useEffect(() => {
    nextOp.value = withTiming(isLast ? 0 : 1, { duration: 200 });
  }, [isLast]);
  const nextAnimStyle = useAnimatedStyle(() => ({ opacity: nextOp.value }));

  const handleScrollEnd = useCallback((e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.max(0, Math.min(SLIDES.length - 1, Math.round(offsetX / width)));
    if (newIndex !== currentIndex) setCurrentIndex(newIndex);
  }, [currentIndex]);

  const goToSlide = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) goToSlide(currentIndex + 1);
  }, [currentIndex, goToSlide]);

  const finish = useCallback(async () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    try { await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch (_) {}
    router.replace('/(tabs)');
  }, [router]);

  const handleLangSwitch = useCallback((lang: Language) => {
    setLanguage(lang);
  }, [setLanguage]);

  const gradients = SLIDES.map(s => s.gradient[0]);

  // Gradient background interpolation via JS (simple color blend)
  const bgColors = ['#0A6E5C', '#D97706', '#075247'];
  const currentBg = bgColors[currentIndex] ?? '#0A6E5C';

  return (
    <View style={[styles.container, { backgroundColor: currentBg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Gradient overlay circles ────────────────────────────────────── */}
      <View style={[styles.bgCircle1, { backgroundColor: slide.accentColor + '20' }]} />
      <View style={[styles.bgCircle2, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.langRow}>
          {(['en', 'ar'] as Language[]).map(lang => (
            <Pressable
              key={lang}
              style={[
                styles.langPill,
                {
                  backgroundColor: language === lang ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.15)',
                  borderColor: language === lang ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)',
                },
              ]}
              onPress={() => handleLangSwitch(lang)}
              hitSlop={10}
            >
              <Text style={[styles.langPillText, { color: language === lang ? currentBg : 'rgba(255,255,255,0.9)' }]}>
                {lang === 'en' ? 'EN' : 'ع'}
              </Text>
            </Pressable>
          ))}
        </View>

        {!isLast ? (
          <Pressable onPress={finish} hitSlop={14}>
            <View style={styles.skipPill}>
              <Text style={styles.skipText}>{t.skip}</Text>
            </View>
          </Pressable>
        ) : <View style={{ width: 60 }} />}
      </View>

      {/* ── SLIDES SCROLL ───────────────────────────────────────────────── */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={{ width: width * SLIDES.length }}
      >
        {SLIDES.map((item, index) => (
          <Slide key={item.id} item={item} isActive={index === currentIndex} />
        ))}
      </Animated.ScrollView>

      {/* ── TEXT BELOW SLIDES ───────────────────────────────────────────── */}
      <View style={styles.textArea}>
        <SlideText
          key={currentIndex}
          title={t[slide.titleKey]}
          subtitle={t[slide.subKey]}
          isActive={true}
        />
      </View>

      {/* ── BOTTOM ──────────────────────────────────────────────────────── */}
      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Dot key={i} isActive={i === currentIndex} onPress={() => goToSlide(i)} />
          ))}
        </View>

        {/* Swipe hint (slides 1 & 2) */}
        {!isLast ? (
          <Animated.View style={[styles.swipeHintWrap, nextAnimStyle]}>
            <MaterialIcons name={isRTL ? 'swipe-left' : 'swipe-right'} size={22} color="rgba(255,255,255,0.5)" />
            <Text style={styles.swipeHintText}>
              {isRTL ? 'اسحب للتالي' : 'Swipe to continue'}
            </Text>
          </Animated.View>
        ) : null}

        {/* Get Started button (slide 3) */}
        <Animated.View style={[styles.startBtnWrap, btnAnimStyle]} pointerEvents={isLast ? 'auto' : 'none'}>
          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
            onPress={finish}
          >
            <Text style={styles.startBtnText}>{t.getStarted}</Text>
            <MaterialIcons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={22} color={SLIDES[2].gradient[0]} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ILLUSTRATION_HEIGHT = Math.min(height * 0.38, 300);

const styles = StyleSheet.create({
  container: { flex: 1 },

  bgCircle1: {
    position: 'absolute',
    width: width * 1.4,
    height: width * 1.4,
    borderRadius: width * 0.7,
    top: -width * 0.4,
    left: -width * 0.2,
  },
  bgCircle2: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    bottom: -width * 0.5,
    right: -width * 0.3,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 20,
  },
  langRow: { flexDirection: 'row', gap: Spacing.sm },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillText: { fontSize: FontSize.sm, fontWeight: '700' },
  skipPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  skipText: { fontSize: FontSize.sm, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  // Scroll
  scrollView: { flex: 0, height: ILLUSTRATION_HEIGHT },

  // Slide
  slide: {
    height: ILLUSTRATION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationArea: {
    width: width * 0.72,
    height: ILLUSTRATION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Pulse rings
  ringsWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1.5,
  },

  // Main icon
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    zIndex: 1,
  },

  // Logo slide
  logoWrap: {
    alignItems: 'center',
    gap: 16,
  },
  logoCard: {
    width: width * 0.62,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  logoImage: { width: '100%', height: '100%' },
  logoTag: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.full,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  logoTagText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.5 },

  // Floating icons
  floatingIcon: {
    position: 'absolute',
  },

  // Sparkle
  sparkle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Text area
  textArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  textBlock: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  slideTitle: {
    fontSize: FontSize.display,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 42,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  slideSub: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '400',
    paddingHorizontal: Spacing.sm,
  },

  // Bottom
  bottomArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    alignItems: 'center',
    gap: 16,
  },

  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
  },

  swipeHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },

  startBtnWrap: {
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: Spacing.lg,
    right: Spacing.lg,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: Radius.xl,
    paddingVertical: 18,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  startBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: '#0A6E5C',
  },
});
