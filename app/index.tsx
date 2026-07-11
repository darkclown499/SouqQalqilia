import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Animated, Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { getSupabaseClient } from '@/template';

const { width: W, height: H } = Dimensions.get('window');

// ── الألوان الجديدة ──
const BG = '#0A6E5C'; 
const GOLD = '#E8C060'; 
const WHITE_DIM = 'rgba(255,255,255,0.7)';

const LOADING_MESSAGES = [
  'جاري تحميل خيرات قلقيلية...',
  'ثوانٍ وتصبح أسواق المدينة بين يديك...',
  'نجلب لك أفضل العروض...',
  'سوق قلقيلية في انتظارك...',
];

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

// ─── Phase 1: Launch Screen ──────────────────────────────────────────────────
function LaunchPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.7)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY     = useRef(new Animated.Value(20)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 90, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(sloganOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(sloganY, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, 400);

    const t = setTimeout(() => {
      Animated.timing(screenOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => onDone());
    }, 2000);

    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[styles.fullScreen, { backgroundColor: BG, opacity: screenOpacity }]}>
      <View style={styles.glow} />
      
      <Animated.View style={[styles.logoCenter, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoCard}>
          <Image source={require('@/assets/images/app-logo-transparent.png')} style={styles.logoImgMain} contentFit="contain" transition={0} />
        </View>
        <Text style={styles.mainTitle}>سوق قلقيلية</Text>
      </Animated.View>

      <Animated.View style={[styles.sloganWrap, { opacity: sloganOpacity, transform: [{ translateY: sloganY }], bottom: insets.bottom + 64 }]}>
        <View style={styles.sloganLine} />
        <Text style={styles.sloganText}>خيرات بلادنا بين يديك</Text>
        <View style={styles.sloganLine} />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Phase 2: Loading Screen ─────────────────────────────────────────────────
function LoadingPhase({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const logoY         = useRef(new Animated.Value(30)).current;
  const logoOpacity   = useRef(new Animated.Value(0)).current;
  const barWidth      = useRef(new Animated.Value(0)).current;
  const shimmerX      = useRef(new Animated.Value(-W)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [msgIndex, setMsgIndex] = useState(0);
  const msgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(barWidth, { toValue: W * 0.75, duration: 2400, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: false }),
        ]).start();

        Animated.loop(
          Animated.sequence([
            Animated.timing(shimmerX, { toValue: W, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
            Animated.timing(shimmerX, { toValue: -W, duration: 0, useNativeDriver: true }),
            Animated.delay(300),
          ])
        ).start();
      });
    });

    Animated.timing(msgOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    const cycle = setInterval(() => {
      Animated.timing(msgOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
        Animated.timing(msgOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 1800);

    const t = setTimeout(() => {
      clearInterval(cycle);
      Animated.timing(screenOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => onDone());
    }, 3200);

    return () => { clearTimeout(t); clearInterval(cycle); };
  }, []);

  return (
    <Animated.View style={[styles.fullScreen, { backgroundColor: BG, opacity: screenOpacity }]}>
      <View style={styles.glow} />
      
      <Animated.View style={[styles.logoAboveCenter, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
        <View style={[styles.logoCard, { width: W * 0.28, height: W * 0.28, borderRadius: 20 }]}>
          <Image source={require('@/assets/images/app-logo-transparent.png')} style={{ width: '70%', height: '70%' }} contentFit="contain" transition={0} />
        </View>
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

function LoadingDots() {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  
  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 150 + 200),
        ])
      ).start();
    });
  }, []);
  
  return (
    <View style={styles.dotsWrap}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.loadingDot, { opacity: d, backgroundColor: i === 1 ? GOLD : '#FFF' }]} />
      ))}
    </View>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function RootScreen() {
  const [phase, setPhase] = useState<'launch' | 'loading' | 'done'>('launch');

  useEffect(() => {
    // تشغيل العمليات في الخلفية بداخل useEffect لمنع كراش السيرفر
    preloadAds().catch(() => {});
    preloadBanners().catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === 'done') trackVisit();
  }, [phase]);

  if (phase === 'launch') return <LaunchPhase onDone={() => setPhase('loading')} />;
  if (phase === 'loading') return <LoadingPhase onDone={() => setPhase('done')} />;
  return <AuthGate />;
}

// ─── Auth-aware gate ──────────────────────────
function AuthGate() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
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

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: W * 1.5, height: W * 1.5,
    borderRadius: W * 0.75,
    backgroundColor: 'rgba(255,255,255,0.03)',
    top: H * 0.4 - W * 0.75,
    left: -W * 0.25,
  },
  logoCenter: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  logoCard: {
    width: W * 0.35, height: W * 0.35,
    backgroundColor: '#fff',
    borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 12,
  },
  logoImgMain: { width: '65%', height: '65%' },
  mainTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  
  sloganWrap: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  sloganLine: { flex: 1, maxWidth: 40, height: 1, backgroundColor: GOLD, opacity: 0.5 },
  sloganText: { color: GOLD, fontSize: 16, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  
  logoAboveCenter: { alignItems: 'center', marginTop: -H * 0.15, gap: 16 },
  appTitleLoading: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  
  bottomContent: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  loadingMsg: { color: WHITE_DIM, fontSize: 14, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 },
  
  progressTrack: { width: '100%', maxWidth: 300, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  progressFill: { height: '100%', backgroundColor: GOLD, borderRadius: 99, overflow: 'hidden' },
  progressShimmer: { position: 'absolute', top: 0, width: 120, height: '100%', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 99 },
  
  dotsWrap: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  loadingDot: { width: 6, height: 6, borderRadius: 3 },
});