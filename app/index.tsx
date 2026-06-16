// ── Preload ads for guest users (no auth) ───────────────────────────────────
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
preloadAds().catch(() => {});
preloadBanners().catch(() => {});

// ── Track app visit (DAU/WAU/MAU) ────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
const DEVICE_ID_KEY = 'app_device_id_v1';
async function trackVisit() {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    const { getSupabaseClient } = require('@/template');
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    await supabase.from('app_visits').insert({ device_id: deviceId, user_id: userId });
  } catch { /* silent */ }
}

import { Redirect } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  withDelay, Easing, runOnJS,
} from 'react-native-reanimated';
import LottiePlayer from '@/components/feature/LottiePlayer';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

const BG_START  = '#054035';
const BG_END    = '#0A6E5C';
const GOLD      = '#E8C060';
const GOLD_SOFT = 'rgba(232,192,96,0.18)';

// ─── Custom Splash Screen ────────────────────────────────────────────────────
/**
 * Two-gate approach:
 *  Gate 1 — dataReady: auth session + preload complete
 *  Gate 2 — animDone: Lottie finished at least one loop
 * Navigation fires only when BOTH gates are open.
 */
interface SplashProps {
  onComplete: () => void;
}

function MarketplaceSplash({ onComplete }: SplashProps) {
  const insets = useSafeAreaInsets();
  // ── Shared animation values ───────────────────────────────────────────────
  const screenOpacity  = useSharedValue(1);
  const logoScale      = useSharedValue(0.78);
  const logoOpacity    = useSharedValue(0);
  const lottieOpacity  = useSharedValue(0);
  const lottieScale    = useSharedValue(0.85);
  const textOpacity    = useSharedValue(0);
  const textY          = useSharedValue(18);
  const subtextOpacity = useSharedValue(0);
  const ring1Scale     = useSharedValue(0.6);
  const ring1Opacity   = useSharedValue(0);
  const ring2Scale     = useSharedValue(0.5);
  const ring2Opacity   = useSharedValue(0);
  const dotsOpacity    = useSharedValue(0);
  const shimmerX       = useSharedValue(-120);

  // ── Gate tracking ─────────────────────────────────────────────────────────
  const dataReadyRef = useRef(false);
  const animDoneRef  = useRef(false);
  const completedRef = useRef(false);

  const tryComplete = useCallback(() => {
    if (dataReadyRef.current && animDoneRef.current && !completedRef.current) {
      completedRef.current = true;
      // Smooth fade-out → then notify parent
      screenOpacity.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onComplete)();
      });
    }
  }, [onComplete, screenOpacity]);

  // ── Data / auth preloading ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const MINIMUM_DISPLAY_MS = 2800; // ensure splash shows for at least 2.8 s
    const startTime = Date.now();

    async function load() {
      try {
        const { getSupabaseClient } = require('@/template');
        const supabase = getSupabaseClient();
        await Promise.all([
          supabase.auth.getSession(),
          preloadAds(),
          preloadBanners(),
        ]);
      } catch { /* non-blocking */ }

      if (cancelled) return;

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MINIMUM_DISPLAY_MS - elapsed);
      setTimeout(() => {
        if (!cancelled) {
          dataReadyRef.current = true;
          tryComplete();
        }
      }, remaining);
    }

    load();
    return () => { cancelled = true; };
  }, [tryComplete]);

  // ── Lottie animation-finished callback ────────────────────────────────────
  const onAnimationFinish = useCallback(() => {
    animDoneRef.current = true;
    tryComplete();
  }, [tryComplete]);

  // ── Entrance choreography ─────────────────────────────────────────────────
  useEffect(() => {
    // Step 1 (0ms): rings pulse in
    ring1Opacity.value = withTiming(1, { duration: 500 });
    ring1Scale.value   = withSpring(1, { damping: 12, stiffness: 80 });
    ring2Opacity.value = withDelay(120, withTiming(1, { duration: 500 }));
    ring2Scale.value   = withDelay(120, withSpring(1, { damping: 14, stiffness: 70 }));

    // Step 2 (180ms): logo slides in
    logoOpacity.value = withDelay(180, withTiming(1, { duration: 500 }));
    logoScale.value   = withDelay(180, withSpring(1, { damping: 12, stiffness: 100 }));

    // Step 3 (420ms): Lottie fades in and scales up
    lottieOpacity.value = withDelay(420, withTiming(1, { duration: 480 }));
    lottieScale.value   = withDelay(420, withSpring(1, { damping: 14, stiffness: 90 }));

    // Step 4 (720ms): headline text rises in
    textOpacity.value = withDelay(720, withTiming(1, { duration: 500 }));
    textY.value       = withDelay(720, withSpring(0, { damping: 18, stiffness: 120 }));

    // Step 5 (980ms): subtitle + dots
    subtextOpacity.value = withDelay(980, withTiming(1, { duration: 450 }));
    dotsOpacity.value    = withDelay(1100, withTiming(1, { duration: 380 }));

    // Shimmer loop on progress bar
    const loopShimmer = () => {
      shimmerX.value = -120;
      shimmerX.value = withTiming(W * 0.72 + 120, {
        duration: 1400,
        easing: Easing.linear,
      }, (done) => { if (done) runOnJS(loopShimmer)(); });
    };
    const t = setTimeout(loopShimmer, 1300);
    return () => clearTimeout(t);
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────
  const containerStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const logoStyle      = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const lottieWrapStyle = useAnimatedStyle(() => ({
    opacity: lottieOpacity.value,
    transform: [{ scale: lottieScale.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));
  const subtextStyle    = useAnimatedStyle(() => ({ opacity: subtextOpacity.value }));
  const ring1Style      = useAnimatedStyle(() => ({
    opacity: ring1Opacity.value,
    transform: [{ scale: ring1Scale.value }],
  }));
  const ring2Style      = useAnimatedStyle(() => ({
    opacity: ring2Opacity.value,
    transform: [{ scale: ring2Scale.value }],
  }));
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.value }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <Animated.View style={[styles.fullScreen, containerStyle]}>
      <LinearGradient
        colors={[BG_START, BG_END, '#0D9176']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative blurred orbs */}
      <View style={[styles.orb, styles.orbTop]}    pointerEvents="none" />
      <View style={[styles.orb, styles.orbBottom]} pointerEvents="none" />

      {/* Pulsing rings */}
      <Animated.View style={[styles.ring, styles.ring1, ring1Style]} pointerEvents="none" />
      <Animated.View style={[styles.ring, styles.ring2, ring2Style]} pointerEvents="none" />

      {/* ── Logo (top) ── */}
      <Animated.View style={[styles.logoWrap, logoStyle, { marginTop: insets.top + 20 }]}>
        <Image
          source={require('@/assets/images/app-logo-transparent.png')}
          style={styles.logoImg}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>

      {/* ── Lottie animation ── */}
      <Animated.View style={[styles.lottieWrap, lottieWrapStyle]}>
        <View style={styles.lottieBg}>
          <LottiePlayer
            size={W * 0.42}
            onAnimationFinish={onAnimationFinish}
          />
        </View>
        {/* Gold accent ring around Lottie */}
        <View style={styles.lottieRing} pointerEvents="none" />
      </Animated.View>

      {/* ── Main headline ── */}
      <Animated.Text style={[styles.headline, textStyle]}>
        سوقك في جيبك... جاري التجهيز 🚀
      </Animated.Text>

      {/* ── Subtitle ── */}
      <Animated.Text style={[styles.subtitle, subtextStyle]}>
        اشتري وبيع في قلقيلية بكل سهولة
      </Animated.Text>

      {/* ── Bottom area ── */}
      <Animated.View style={[styles.bottomWrap, dotsStyle, { paddingBottom: insets.bottom + 32 }]}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={styles.progressFillFull} />
          <Animated.View style={[styles.progressShimmer, shimmerStyle]} />
        </View>

        {/* App brand */}
        <Text style={styles.brandLabel}>سوق قلقيلية · Souq Qalqilya</Text>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function RootScreen() {
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashComplete = useCallback(() => {
    // Hide native splash exactly once here
    SplashScreen.hideAsync().catch(() => {});
    trackVisit();
    setSplashDone(true);
  }, []);

  if (!splashDone) {
    return <MarketplaceSplash onComplete={handleSplashComplete} />;
  }

  return <AuthGate />;
}

// ─── Auth-aware gate: check username before routing ──────────────────────────
function AuthGate() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { getSupabaseClient } = require('@/template');
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setTarget('/(tabs)');
          return;
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', session.user.id)
          .maybeSingle();
        const isPhoneUser = (session.user.email ?? '').includes('@sms.souqqalqilya.local');
        const hasName = profile?.username && profile.username.trim().length > 0;
        if (isPhoneUser && !hasName) {
          if (!cancelled) setTarget('/complete-profile');
        } else {
          if (!cancelled) setTarget('/(tabs)');
        }
      } catch {
        if (!cancelled) setTarget('/(tabs)');
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  if (!target) return null;
  return <Redirect href={target as any} />;
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Decorative orbs ──
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orbTop: {
    width: W * 0.9,
    height: W * 0.9,
    top: -W * 0.3,
    right: -W * 0.25,
  },
  orbBottom: {
    width: W * 0.75,
    height: W * 0.75,
    bottom: -W * 0.35,
    left: -W * 0.22,
  },

  // ── Pulsing rings ──
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ring1: {
    width: W * 0.88,
    height: W * 0.88,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  ring2: {
    width: W * 0.66,
    height: W * 0.66,
    borderColor: 'rgba(232,192,96,0.14)',
  },

  // ── Logo ──
  logoWrap: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  logoImg: {
    width: W * 0.19,
    height: W * 0.19,
    marginTop: 36,
  },

  // ── Lottie ──
  lottieWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: 0,
  },
  lottieBg: {
    width: W * 0.50,
    height: W * 0.50,
    borderRadius: W * 0.25,
    backgroundColor: GOLD_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lottie: {
    width: W * 0.42,
    height: W * 0.42,
  },
  lottieRing: {
    position: 'absolute',
    width: W * 0.54,
    height: W * 0.54,
    borderRadius: W * 0.27,
    borderWidth: 1.5,
    borderColor: GOLD,
    opacity: 0.32,
  },

  // ── Text ──
  headline: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 28,
    marginTop: 16,
    paddingHorizontal: 28,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: GOLD,
    textAlign: 'center',
    letterSpacing: 0.4,
    marginTop: 6,
    opacity: 0.9,
  },

  // ── Bottom ──
  bottomWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 40,
  },
  progressTrack: {
    width: W * 0.6,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFillFull: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GOLD,
    borderRadius: 99,
    opacity: 0.75,
  },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 99,
  },
  brandLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
