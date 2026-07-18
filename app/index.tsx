// ── Preload ads for guest users (no auth) ───────────────────────────────────
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { getSupabaseClient } from '@/template';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useColorScheme, Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState, memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// ── Constants ──────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = 'app_device_id_v1';
const CACHE_ADS_KEY = 'cached_ads';
const CACHE_BANNERS_KEY = 'cached_banners';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MAX_LOAD_TIME = 5000;
const SKIP_DELAY = 3000; // show skip after 3 sec

// ── Colors (supports dark mode) ──────────────────────────────────────────
const getColors = (scheme: 'light' | 'dark') => ({
  BG: scheme === 'dark' ? '#064235' : '#0A6E5C',
  GOLD: '#E8C060',
  WHITE_DIM: scheme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.65)',
  TEXT: scheme === 'dark' ? '#fff' : '#fff',
});

// ── Utility: Retry with exponential backoff ──────────────────────────────
async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((res) => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

// ── Caching helpers ──────────────────────────────────────────────────────
async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {}
}

// ── Preload with caching & retry ────────────────────────────────────────
async function preloadWithCache() {
  const [cachedAds, cachedBanners] = await Promise.all([
    getCachedData(CACHE_ADS_KEY),
    getCachedData(CACHE_BANNERS_KEY),
  ]);

  const loadFresh = async () => {
    try {
      const [ads, banners] = await Promise.all([
        retry(preloadAds, 2, 500),
        retry(preloadBanners, 2, 500),
      ]);
      await Promise.all([
        setCachedData(CACHE_ADS_KEY, ads),
        setCachedData(CACHE_BANNERS_KEY, banners),
      ]);
      return true;
    } catch (error) {
      console.warn('Preload failed:', error);
      return false;
    }
  };

  if (cachedAds && cachedBanners) {
    loadFresh().catch(() => {});
    return true;
  }

  return loadFresh();
}

// ── Track app visit (offline-first) ─────────────────────────────────────
async function trackVisit() {
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    await supabase.from('app_visits').insert({ device_id: deviceId, user_id: userId });
  } catch (error) {
    console.warn('Track visit error:', error);
  }
}

// ─── 3D Scene Component (platform-specific, safe for web) ──────────────────
import ThreeScene from '@/components/feature/ThreeScene';

// ─── Loading Dots ──────────────────────────────────────────────────────
const LoadingDots = memo(function LoadingDots() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
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
    return () => dots.forEach(d => d.stopAnimation?.());
  }, []);
  return (
    <View style={styles.dotsWrap}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.loadingDot,
            {
              opacity: d,
              backgroundColor: i === 1 ? colors.GOLD : 'rgba(255,255,255,0.8)',
            },
          ]}
          accessibilityLabel="تحميل"
        />
      ))}
    </View>
  );
});

// ─── Phase 1: Launch Screen ─────────────────────────────────────────────
function LaunchPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY = useRef(new Animated.Value(14)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        damping: 14,
        stiffness: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(sloganOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sloganY, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 500);

    const t = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => onDone());
    }, 1750);

    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View
      style={[styles.fullScreen, { backgroundColor: colors.BG, opacity: screenOpacity }]}
    >
      <View style={styles.glow} />
      <Animated.View
        style={[
          styles.logoCenter,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Image
          source={require('@/assets/images/app-logo-transparent.png')}
          style={styles.logoImgMain}
          contentFit="contain"
          transition={0}
          cacheKey="launch-logo"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sloganWrap,
          {
            opacity: sloganOpacity,
            transform: [{ translateY: sloganY }],
            bottom: insets.bottom + 64,
          },
        ]}
        accessibilityLabel="شعار التطبيق"
      >
        <View style={[styles.sloganLine, { backgroundColor: colors.GOLD }]} />
        <Text style={[styles.sloganText, { color: colors.GOLD }]}>
          سوق قلقيلية.. خيرات بلادنا بين يديك
        </Text>
        <View style={[styles.sloganLine, { backgroundColor: colors.GOLD }]} />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Phase 2: Loading Screen ─────────────────────────────────────────────
function LoadingPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const logoY = useRef(new Animated.Value(20)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-200)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [msgIndex, setMsgIndex] = useState(0);
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const [loadingError, setLoadingError] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const LOADING_MESSAGES = [
    'جاري تحميل خيرات قلقيلية...',
    'ثوانٍ وتصبح أسواق المدينة بين يديك...',
    'نجلب لك أفضل العروض...',
    'سوق قلقيلية في انتظارك...',
  ];

  const handleRetry = useCallback(() => {
    setLoadingError(false);
    startLoading();
  }, []);

  const startLoading = useCallback(() => {
    abortControllerRef.current = new AbortController();
    let loadingComplete = false;

    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoY, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(barWidth, {
            toValue: W * 0.68,
            duration: 2200,
            easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
            useNativeDriver: false,
          }),
        ]).start();
        Animated.loop(
          Animated.sequence([
            Animated.timing(shimmerX, {
              toValue: W * 0.75,
              duration: 1000,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            Animated.timing(shimmerX, {
              toValue: -200,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.delay(400),
          ])
        ).start();
      });
    });

    Animated.timing(msgOpacity, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();

    const cycle = setInterval(() => {
      if (!isMountedRef.current) return;
      Animated.timing(msgOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(() => {
        if (!isMountedRef.current) return;
        setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
        Animated.timing(msgOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }).start();
      });
    }, 1600);

    const skipTimer = setTimeout(() => {
      if (isMountedRef.current) setShowSkip(true);
    }, SKIP_DELAY);

    const loadPromise = preloadWithCache()
      .then((success) => {
        loadingComplete = true;
        if (!success) setLoadingError(true);
      })
      .catch(() => {
        setLoadingError(true);
      });

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, MAX_LOAD_TIME);
    });

    const abortPromise = new Promise<void>((_, reject) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.signal.addEventListener('abort', () =>
          reject(new Error('Aborted'))
        );
      }
    });

    Promise.race([loadPromise, timeoutPromise, abortPromise])
      .then(() => {
        if (!isMountedRef.current) return;
        setTimeout(() => {
          if (!isMountedRef.current) return;
          clearInterval(cycle);
          clearTimeout(skipTimer);
          Animated.timing(screenOpacity, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }).start(() => {
            if (isMountedRef.current) onDone();
          });
        }, 400);
      })
      .catch((err) => {
        if (err.message === 'Aborted') return;
        console.warn('Loading error:', err);
        setLoadingError(true);
      });

    return () => {
      clearInterval(cycle);
      clearTimeout(skipTimer);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [W, onDone]);

  useEffect(() => {
    isMountedRef.current = true;
    startLoading();
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [startLoading]);

  const handleSkip = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    onDone();
  }, [onDone]);

  if (loadingError) {
    return (
      <Animated.View style={[styles.fullScreen, { backgroundColor: colors.BG, opacity: 1 }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.WHITE_DIM }]}>
            حدث خطأ في التحميل
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.fullScreen, { backgroundColor: colors.BG, opacity: screenOpacity }]}>
      {/* الخلفية ثلاثية الأبعاد */}
      <ThreeScene />

      <View style={styles.glow} />
      {showSkip && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>تجاوز</Text>
        </TouchableOpacity>
      )}
      <Animated.View
        style={[
          styles.logoAboveCenter,
          { opacity: logoOpacity, transform: [{ translateY: logoY }] },
        ]}
      >
        <Image
          source={require('@/assets/images/app-logo-transparent.png')}
          style={styles.logoImgLoading}
          contentFit="contain"
          transition={0}
          cacheKey="loading-logo"
        />
        <Text style={[styles.appTitleLoading, { color: colors.TEXT }]}>سوق قلقيلية</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.bottomContent,
          { opacity: contentOpacity, paddingBottom: insets.bottom + 80 },
        ]}
      >
        <Animated.Text
          style={[styles.loadingMsg, { opacity: msgOpacity, color: colors.WHITE_DIM }]}
          accessibilityLabel="رسالة التحميل"
        >
          {LOADING_MESSAGES[msgIndex]}
        </Animated.Text>
        <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Animated.View style={[styles.progressFill, { width: barWidth, backgroundColor: colors.GOLD }]}>
            <Animated.View
              style={[
                styles.progressShimmer,
                { transform: [{ translateX: shimmerX }] },
              ]}
            />
          </Animated.View>
        </View>
        <LoadingDots />
        <Text style={[styles.versionText, { color: colors.WHITE_DIM }]}>
          الإصدار {Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// ─── AuthGate (improved with loading state) ────────────────────────────
function AuthGate() {
  const [target, setTarget] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function check() {
      try {
        const supabase = getSupabaseClient();
        const cachedSession = await AsyncStorage.getItem('cached_session');
        let session = null;
        let profile = null;

        if (cachedSession) {
          try {
            const parsed = JSON.parse(cachedSession);
            if (parsed && parsed.user) {
              session = { user: parsed.user };
              const cachedProfile = await AsyncStorage.getItem('cached_profile');
              if (cachedProfile) {
                profile = JSON.parse(cachedProfile);
              }
            }
          } catch {}
        }

        if (!session) {
          const { data } = await supabase.auth.getSession();
          session = data.session;
          if (session?.user) {
            await AsyncStorage.setItem('cached_session', JSON.stringify(session.user));
          }
        }

        if (!session?.user) {
          if (!cancelled) setTarget('/(tabs)');
          return;
        }

        if (!profile) {
          const { data } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', session.user.id)
            .maybeSingle();
          profile = data;
          if (profile) {
            await AsyncStorage.setItem('cached_profile', JSON.stringify(profile));
          }
        }

        const hasName = profile?.username && profile.username.trim().length > 0;
        if (!hasName) {
          if (!cancelled) setTarget('/complete-profile');
        } else {
          if (!cancelled) setTarget('/(tabs)');
        }
      } catch (error) {
        console.error('AuthGate error:', error);
        if (!cancelled) setTarget('/(tabs)');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    check();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.BG, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.GOLD} />
      </View>
    );
  }

  if (!target) return null;
  return <Redirect href={target as any} />;
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function RootScreen() {
  const [phase, setPhase] = useState<'launch' | 'loading' | 'done'>('launch');
  const trackingDone = useRef(false);

  useEffect(() => {
    if (phase === 'done' && !trackingDone.current) {
      trackingDone.current = true;
      trackVisit().catch(() => {});
    }
  }, [phase]);

  if (phase === 'launch') return <LaunchPhase onDone={() => setPhase('loading')} />;
  if (phase === 'loading') return <LoadingPhase onDone={() => setPhase('done')} />;
  return <AuthGate />;
}

// ─── Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: '40%',
    left: '-10%',
    transform: [{ scale: 1.5 }],
  },
  logoCenter: { alignItems: 'center', justifyContent: 'center' },
  logoImgMain: { width: '46%', aspectRatio: 1 },
  sloganWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 10,
  },
  sloganLine: { width: 48, height: 1.5, opacity: 0.7, borderRadius: 99 },
  sloganText: { fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.4, lineHeight: 26 },
  logoAboveCenter: { alignItems: 'center', marginTop: -50, gap: 14 },
  logoImgLoading: { width: '36%', aspectRatio: 1 },
  appTitleLoading: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center', opacity: 0.95 },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  loadingMsg: { fontSize: 13.5, fontWeight: '500', textAlign: 'center', letterSpacing: 0.2, lineHeight: 20 },
  progressTrack: { width: '68%', height: 4, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, overflow: 'hidden' },
  progressShimmer: { position: 'absolute', top: 0, width: 80, height: '100%', borderRadius: 99 },
  dotsWrap: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
  loadingDot: { width: 7, height: 7, borderRadius: 3.5 },
  skipButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    zIndex: 10,
  },
  skipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  versionText: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  errorContainer: { alignItems: 'center', gap: 20, paddingHorizontal: 40 },
  errorText: { fontSize: 16, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: '#E8C060',
    borderRadius: 25,
  },
  retryButtonText: { color: '#0A6E5C', fontWeight: '700', fontSize: 16 },
});