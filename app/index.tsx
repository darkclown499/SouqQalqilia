// ── Preload ads for guest users (no auth) ───────────────────────────────────
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { getSupabaseClient } from '@/template'; // ✅ استيراد ثابت
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Preload immediately ──────────────────────────────────────────────────────
preloadAds().catch(() => {});
preloadBanners().catch(() => {});

// ── Track app visit (DAU/WAU/MAU) ────────────────────────────────────────────
const DEVICE_ID_KEY = 'app_device_id_v1';

async function trackVisit() {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    await supabase.from('app_visits').insert({ device_id: deviceId, user_id: userId });
  } catch { /* silent */ }
}

import { Redirect } from 'expo-router';
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');

const BG = '#0A6E5C';
const GOLD = '#E8C060';
const WHITE_DIM = 'rgba(255,255,255,0.65)';

const LOADING_MESSAGES = [
  'جاري تحميل خيرات قلقيلية...',
  'ثوانٍ وتصبح أسواق المدينة بين يديك...',
  'نجلب لك أفضل العروض...',
  'سوق قلقيلية في انتظارك...',
];

// ─── Loading Dots (مفصول لتحسين الأداء) ──────────────────────────────────────
const LoadingDots = memo(function LoadingDots() {
  const dots = [
    useRef(new Animated.Value(0.4)).current,
    useRef(new Animated.Value(0.4)).current,
    useRef(new Animated.Value(0.4)).current,
  ];
  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.4, duration: 400, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 200),
        ])
      ).start();
    });
  }, []);
  return (
    <View style={styles.dotsWrap}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.loadingDot, { opacity: d, backgroundColor: i === 1 ? GOLD : 'rgba(255,255,255,0.8)' }]} />
      ))}
    </View>
  );
});

// ─── Phase 1: Launch Screen ──────────────────────────────────────────────────
function LaunchPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.82)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY     = useRef(new Animated.Value(14)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 100, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(sloganOpacity, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(sloganY, { toValue: 0, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, 500);

    const t = setTimeout(() => {
      Animated.timing(screenOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onDone());
    }, 1750);

    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[styles.fullScreen, { backgroundColor: BG, opacity: screenOpacity }]}>
      <View style={styles.glow} />
      <Animated.View style={[styles.logoCenter, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Image source={require('@/assets/images/app-logo-transparent.png')} style={styles.logoImgMain} contentFit="contain" transition={0} />
      </Animated.View>
      <Animated.View style={[styles.sloganWrap, { opacity: sloganOpacity, transform: [{ translateY: sloganY }], bottom: insets.bottom + 64 }]}>
        <View style={styles.sloganLine} />
        <Text style={styles.sloganText}>سوق قلقيلية.. خيرات بلادنا بين يديك</Text>
        <View style={styles.sloganLine} />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Phase 2: Loading Screen ─────────────────────────────────────────────────
function LoadingPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const logoY         = useRef(new Animated.Value(20)).current;
  const logoOpacity   = useRef(new Animated.Value(0)).current;
  const barWidth      = useRef(new Animated.Value(0)).current;
  const shimmerX      = useRef(new Animated.Value(-200)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [msgIndex, setMsgIndex] = useState(0);
  const msgOpacity = useRef(new Animated.Value(0)).current;

  // ✅ الانتظار حتى اكتمال التحميل الفعلي مع مهلة زمنية
  useEffect(() => {
    let isMounted = true;
    let loadingComplete = false;

    Animated.timing(screenOpacity, { toValue: 1, duration: 280, useNativeDriver: true }).start(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 450, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(barWidth, { toValue: W * 0.68, duration: 2200, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: false }),
        ]).start();
        Animated.loop(
          Animated.sequence([
            Animated.timing(shimmerX, { toValue: W * 0.75, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
            Animated.timing(shimmerX, { toValue: -200, duration: 0, useNativeDriver: true }),
            Animated.delay(400),
          ])
        ).start();
      });
    });

    Animated.timing(msgOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    const cycle = setInterval(() => {
      if (!isMounted) return;
      Animated.timing(msgOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        if (!isMounted) return;
        setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
        Animated.timing(msgOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
      });
    }, 1600);

    // ✅ انتظار اكتمال التحميل الفعلي مع مهلة زمنية قصوى
    const MAX_LOAD_TIME = 5000;
    const loadPromise = Promise.all([
      preloadAds().catch(() => {}),
      preloadBanners().catch(() => {}),
    ]).then(() => {
      loadingComplete = true;
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, MAX_LOAD_TIME);
    });

    Promise.race([loadPromise, timeoutPromise]).then(() => {
      if (!isMounted) return;
      // تأخير بسيط لضمان رؤية المستخدم للشريط مكتملاً
      setTimeout(() => {
        if (!isMounted) return;
        clearInterval(cycle);
        Animated.timing(screenOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
          if (isMounted) onDone();
        });
      }, 400);
    });

    return () => {
      isMounted = false;
      clearInterval(cycle);
    };
  }, []);

  return (
    <Animated.View style={[styles.fullScreen, { backgroundColor: BG, opacity: screenOpacity }]}>
      <View style={styles.glow} />
      <Animated.View style={[styles.logoAboveCenter, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
        <Image source={require('@/assets/images/app-logo-transparent.png')} style={styles.logoImgLoading} contentFit="contain" transition={0} />
        <Text style={styles.appTitleLoading}>سوق قلقيلية</Text>
      </Animated.View>
      <Animated.View style={[styles.bottomContent, { opacity: contentOpacity, paddingBottom: insets.bottom + 80 }]}>
        <Animated.Text style={[styles.loadingMsg, { opacity: msgOpacity }]}>{LOADING_MESSAGES[msgIndex]}</Animated.Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth }]}>
            <Animated.View style={[styles.progressShimmer, { transform: [{ translateX: shimmerX }] }]} />
          </Animated.View>
        </View>
        <LoadingDots />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function RootScreen() {
  const [phase, setPhase] = useState<'launch' | 'loading' | 'done'>('launch');
  const trackingDone = useRef(false);

  // Track visit once after splash
  useEffect(() => {
    if (phase === 'done' && !trackingDone.current) {
      trackingDone.current = true;
      trackVisit();
    }
  }, [phase]);

  if (phase === 'launch') return <LaunchPhase onDone={() => setPhase('loading')} />;
  if (phase === 'loading') return <LoadingPhase onDone={() => setPhase('done')} />;
  return <AuthGate />;
}

// ─── Auth-aware gate: check username before routing ──────────────────────────
function AuthGate() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (!cancelled) setTarget('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', session.user.id)
          .maybeSingle();

        // ✅ تحقق عام لجميع المستخدمين (ليس فقط هاتف)
        const hasName = profile?.username && profile.username.trim().length > 0;

        if (!hasName) {
          if (!cancelled) setTarget('/complete-profile');
        } else {
          if (!cancelled) setTarget('/(tabs)');
        }
      } catch (err) {
        console.error('AuthGate error:', err);
        if (!cancelled) setTarget('/login');
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  if (!target) return null;
  return <Redirect href={target as any} />;
}

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: W * 1.2, height: W * 1.2,
    borderRadius: W * 0.6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: H * 0.5 - W * 0.6,
    left: -W * 0.1,
  },
  logoCenter: { alignItems: 'center', justifyContent: 'center' },
  logoImgMain: { width: W * 0.46, height: W * 0.46 },
  sloganWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 10 },
  sloganLine: { width: 48, height: 1.5, backgroundColor: GOLD, opacity: 0.7, borderRadius: 99 },
  sloganText: { color: GOLD, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.4, lineHeight: 26 },
  logoAboveCenter: { alignItems: 'center', marginTop: -H * 0.1, gap: 14 },
  logoImgLoading: { width: W * 0.36, height: W * 0.36 },
  appTitleLoading: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center', opacity: 0.95 },
  bottomContent: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  loadingMsg: { color: WHITE_DIM, fontSize: 13.5, fontWeight: '500', textAlign: 'center', letterSpacing: 0.2, lineHeight: 20 },
  progressTrack: { width: W * 0.68, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: GOLD, borderRadius: 99, overflow: 'hidden' },
  progressShimmer: { position: 'absolute', top: 0, width: 80, height: '100%', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 99 },
  dotsWrap: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
  loadingDot: { width: 7, height: 7, borderRadius: 3.5 },
});