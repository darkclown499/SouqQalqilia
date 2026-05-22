
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
    bg: '#0A6E5C',
    accentColor: '#4EECD4',
    titleKey: 'onboarding1Title' as const,
    subKey: 'onboarding1Sub' as const,
    decorIcon1: 'sell' as const,
    decorIcon2: 'shopping-bag' as const,
    decorIcon3: 'local-offer' as const,
  },
  {
    id: '2',
    iconName: 'local-offer' as const,
    bg: '#D97706',
    accentColor: '#FDE68A',
    titleKey: 'onboarding2Title' as const,
    subKey: 'onboarding2Sub' as const,
    decorIcon1: 'star' as const,
    decorIcon2: 'favorite' as const,
    decorIcon3: 'thumb-up' as const,
  },
  {
    id: '3',
    iconName: 'groups' as const,
    bg: '#075247',
    accentColor: '#6EF0D8',
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
  iconName, size, color, top, left, right, delay, rotateDir = 1,
}: {
  iconName: any; size: number; color: string;
  top?: number; left?: number; right?: number;
  delay?: number; rotateDir?: number;
}) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay ?? 0, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(delay ?? 0,
      withRepeat(withSequence(
        withTiming(-14, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ), -1, false)
    );
    rotate.value = withDelay(delay ?? 0,
      withRepeat(withSequence(
        withTiming(rotateDir * 8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-rotateDir * 8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ), -1, false)
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.floatingIcon, { top, left, right }, style]}>
      <MaterialIcons name={iconName} size={size} color={color} />
    </Animated.View>
  );
}

// ── Pulse ring ────────────────────────────────────────────────────────────────
function PulseRing({ size, color, delay }: { size: number; color: string; delay: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(delay,
      withRepeat(withSequence(
        withTiming(1.7, { duration: 1800, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ), -1, false)
    );
    opacity.value = withDelay(delay,
      withRepeat(withSequence(
        withTiming(0, { duration: 1800, easing: Easing.out(Easing.ease) }),
        withTiming(0.5, { duration: 0 }),
      ), -1, false)
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

// ── Main icon ─────────────────────────────────────────────────────────────────
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
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <View style={[styles.iconInner, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <MaterialIcons name={iconName} size={80} color="#fff" />
        </View>
        <View style={[styles.iconGlow, { backgroundColor: accentColor + '40' }]} />
      </View>
    </Animated.View>
  );
}

// ── Animated text block ───────────────────────────────────────────────────────
function SlideText({ title, subtitle }: { title: string; subtitle: string }) {
  const titleY = useSharedValue(40);
  const titleOp = useSharedValue(0);
  const subY = useSharedValue(40);
  const subOp = useSharedValue(0);

  useEffect(() => {
    titleY.value = withDelay(100, withSpring(0, { damping: 14, stiffness: 120 }));
    titleOp.value = withDelay(100, withTiming(1, { duration: 400 }));
    subY.value = withDelay(220, withSpring(0, { damping: 14, stiffness: 120 }));
    subOp.value = withDelay(220, withTiming(1, { duration: 400 }));

    return () => {
      titleY.value = withTiming(40, { duration: 180 });
      titleOp.value = withTiming(0, { duration: 180 });
      subY.value = withTiming(40, { duration: 180 });
      subOp.value = withTiming(0, { duration: 180 });
    };
  }, []);

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

// ── Full-screen Slide (fills the ScrollView page) ────────────────────────────
function Slide({ item, isActive }: { item: typeof SLIDES[0]; isActive: boolean }) {
  return (
    <View style={[styles.slide, { width }]}>
      {/* Decorative rings — centered on screen */}
      <View style={styles.ringsWrap}>
        <PulseRing size={220} color="rgba(255,255,255,0.5)" delay={0} />
        <PulseRing size={220} color="rgba(255,255,255,0.35)" delay={600} />
        <PulseRing size={220} color="rgba(255,255,255,0.2)" delay={1200} />
      </View>

      {/* Floating icons */}
      <FloatingIcon iconName={item.decorIcon1} size={30} color="rgba(255,255,255,0.5)"
        top={height * 0.14} left={width * 0.08} delay={200} />
      <FloatingIcon iconName={item.decorIcon2} size={24} color="rgba(255,255,255,0.38)"
        top={height * 0.2} right={width * 0.08} delay={500} rotateDir={-1} />
      <FloatingIcon iconName={item.decorIcon3} size={20} color="rgba(255,255,255,0.3)"
        top={height * 0.32} left={width * 0.14} delay={800} />

      {/* Sparkle dots */}
      <View style={[styles.sparkle, { top: height * 0.1, right: width * 0.2, backgroundColor: item.accentColor }]} />
      <View style={[styles.sparkle, { top: height * 0.28, left: width * 0.22, backgroundColor: 'rgba(255,255,255,0.7)', width: 6, height: 6 }]} />

      {/* Main content — centered */}
      <View style={styles.iconWrap}>
        {item.isLogo ? (
          <LogoSlide isActive={isActive} />
        ) : (
          <MainIcon iconName={item.iconName} accentColor={item.accentColor} isActive={isActive} />
        )}
      </View>
    </View>
  );
}

function LogoSlide({ isActive }: { isActive: boolean }) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      scale.value = withSpring(1, { damping: 10, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      scale.value = withTiming(0.4, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [isActive]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.logoWrap, style]}>
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

  // Animate bg color change
  const bgColors = ['#0A6E5C', '#D97706', '#075247'];
  const currentBg = bgColors[currentIndex] ?? '#0A6E5C';

  // Start button animation
  const btnScale = useSharedValue(0.8);
  const btnOp = useSharedValue(0);
  const btnY = useSharedValue(30);

  useEffect(() => {
    if (isLast) {
      btnScale.value = withDelay(120, withSpring(1, { damping: 10, stiffness: 130 }));
      btnOp.value = withDelay(120, withTiming(1, { duration: 350 }));
      btnY.value = withDelay(120, withSpring(0, { damping: 12, stiffness: 140 }));
    } else {
      btnScale.value = withTiming(0.8, { duration: 200 });
      btnOp.value = withTiming(0, { duration: 200 });
      btnY.value = withTiming(30, { duration: 200 });
    }
  }, [isLast]);

  const btnAnimStyle = useAnimatedStyle(() => ({
    opacity: btnOp.value,
    transform: [{ scale: btnScale.value }, { translateY: btnY.value }],
  }));

  // Swipe hint animation
  const hintOp = useSharedValue(1);
  useEffect(() => {
    hintOp.value = withTiming(isLast ? 0 : 1, { duration: 200 });
  }, [isLast]);
  const hintAnimStyle = useAnimatedStyle(() => ({ opacity: hintOp.value }));

  const handleScrollEnd = useCallback((e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.max(0, Math.min(SLIDES.length - 1, Math.round(offsetX / width)));
    if (newIndex !== currentIndex) setCurrentIndex(newIndex);
  }, [currentIndex]);

  const goToSlide = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  }, []);

  const finish = useCallback(async () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    try { await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch (_) {}
    router.replace('/(tabs)');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: currentBg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Background decorative circles */}
      <View style={[styles.bgCircle1, { backgroundColor: slide.accentColor + '18' }]} />
      <View style={[styles.bgCircle2, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />

      {/* ── FULL-SCREEN HORIZONTAL SCROLL ─────────────────────────────── */}
      {/* This covers the ENTIRE screen so the user can swipe anywhere */}
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
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: width * SLIDES.length }}
      >
        {SLIDES.map((item, index) => (
          <Slide key={item.id} item={item} isActive={index === currentIndex} />
        ))}
      </Animated.ScrollView>

      {/* ── TOP BAR (overlay, non-scroll) ───────────────────────────────── */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.langRow} pointerEvents="auto">
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
              onPress={() => setLanguage(lang)}
              hitSlop={10}
            >
              <Text style={[styles.langPillText, { color: language === lang ? currentBg : 'rgba(255,255,255,0.9)' }]}>
                {lang === 'en' ? 'EN' : 'ع'}
              </Text>
            </Pressable>
          ))}
        </View>

        {!isLast ? (
          <Pressable onPress={finish} hitSlop={14} pointerEvents="auto">
            <View style={styles.skipPill}>
              <Text style={styles.skipText}>{t.skip}</Text>
            </View>
          </Pressable>
        ) : <View style={{ width: 60 }} />}
      </View>

      {/* ── BOTTOM OVERLAY (text + dots + button) ───────────────────────── */}
      <View
        style={[styles.bottomOverlay, { paddingBottom: Math.max(insets.bottom, 24) + 12 }]}
        pointerEvents="box-none"
      >
        {/* Text */}
        <View style={styles.textArea} pointerEvents="none">
          <SlideText
            key={currentIndex}
            title={t[slide.titleKey]}
            subtitle={t[slide.subKey]}
          />
        </View>

        {/* Dots */}
        <View style={styles.dots} pointerEvents="auto">
          {SLIDES.map((_, i) => (
            <Dot key={i} isActive={i === currentIndex} onPress={() => goToSlide(i)} />
          ))}
        </View>

        {/* Swipe hint */}
        <Animated.View style={[styles.swipeHintWrap, hintAnimStyle]} pointerEvents="none">
          <MaterialIcons
            name={isRTL ? 'swipe-left' : 'swipe-right'}
            size={22}
            color="rgba(255,255,255,0.5)"
          />
          <Text style={styles.swipeHintText}>
            {isRTL ? 'اسحب في أي مكان للتالي' : 'Swipe anywhere to continue'}
          </Text>
        </Animated.View>

        {/* Get Started (last slide) */}
        <Animated.View
          style={[styles.startBtnWrap, btnAnimStyle]}
          pointerEvents={isLast ? 'auto' : 'none'}
        >
          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
            onPress={finish}
          >
            <Text style={styles.startBtnText}>{t.getStarted}</Text>
            <MaterialIcons
              name={isRTL ? 'arrow-back' : 'arrow-forward'}
              size={22}
              color={SLIDES[2].bg}
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  bgCircle1: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width * 0.75,
    top: -width * 0.5,
    left: -width * 0.25,
  },
  bgCircle2: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.3,
    borderRadius: width * 0.65,
    bottom: -width * 0.5,
    right: -width * 0.3,
  },

  // Slide — full screen
  slide: {
    height,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Rings — centered on screen
  ringsWrap: {
    position: 'absolute',
    top: height * 0.22,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1.5,
  },

  // Floating icons
  floatingIcon: { position: 'absolute' },

  // Sparkle
  sparkle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Icon centered at ~35% from top
  iconWrap: {
    position: 'absolute',
    top: height * 0.22,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Main icon
  iconContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconInner: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconGlow: {
    position: 'absolute',
    width: 136,
    height: 136,
    borderRadius: 68,
    zIndex: 1,
  },

  // Logo slide
  logoWrap: { alignItems: 'center', gap: 16 },
  logoCard: {
    width: width * 0.65,
    height: 130,
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

  // TOP BAR overlay
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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

  // BOTTOM OVERLAY
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: 14,
  },

  // Text
  textArea: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 4,
  },
  textBlock: { alignItems: 'center', gap: Spacing.md },
  slideTitle: {
    fontSize: FontSize.display,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 44,
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

  // Dots
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

  // Swipe hint
  swipeHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },

  // Start button
  startBtnWrap: {
    width: '100%',
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
