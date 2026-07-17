import 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertProvider, AuthProvider, getSupabaseClient, useAuth } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, router, useSegments, useRouter, usePathname } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, Platform, InteractionManager, Pressable, View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { ForceUpdateScreen } from '@/components/feature/ForceUpdateScreen';
import { APP_VERSION } from '@/constants/config';
import { trackEvent } from '@/services/analyticsService';
import { markMessagesRead } from '@/services/chatService'; // ✅ استيراد ثابت

// ── Lock the splash screen immediately at module evaluation time ──────────────
SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Configure notification handler SYNCHRONOUSLY at module level ─────────────
if (Platform.OS !== 'web') {
  try {
    const Notifications = require('expo-notifications');
    
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('messages', {
        name: 'الرسائل',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0A6E5C',
        sound: 'default',
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      }).catch(() => {});
    }
  } catch (_) {}
}

// ── Web: defer stale-token cleanup ───────────────────────────────────────────
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Promise.resolve().then(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('supabase')) keysToRemove.push(key);
      }
      const sessionKey = keysToRemove.find(k => k.includes('auth-token'));
      if (sessionKey) {
        const raw = localStorage.getItem(sessionKey);
        let shouldClear = !raw;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const hasRefreshToken = !!parsed?.refresh_token;
            const expiresAt: number = parsed?.expires_at ?? 0;
            const isExpired = expiresAt > 0 && expiresAt * 1000 < Date.now();
            const issuedAt: number = parsed?.user?.created_at ? 0 : (parsed?.issued_at ?? 0);
            const isStale = issuedAt > 0 && (Date.now() / 1000 - issuedAt) > 7 * 24 * 3600;
            if (!hasRefreshToken || isExpired || isStale) shouldClear = true;
          } catch { shouldClear = true; }
        }
        if (shouldClear) keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (_) {}
  });
}

// ── Persistent shown-message-ID store (survives app restarts) ───────────────
const SHOWN_IDS_KEY = 'banner_shown_msg_ids_v1';
const SHOWN_IDS_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function loadShownIds(): Promise<Map<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_IDS_KEY);
    if (!raw) return new Map();
    const obj: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const map = new Map<string, number>();
    for (const [id, ts] of Object.entries(obj)) {
      if (now - ts < SHOWN_IDS_TTL_MS) map.set(id, ts);
    }
    return map;
  } catch { return new Map(); }
}

async function persistShownId(id: string, existing: Map<string, number>): Promise<void> {
  try {
    existing.set(id, Date.now());
    const obj: Record<string, number> = {};
    existing.forEach((ts, k) => { obj[k] = ts; });
    await AsyncStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(obj));
  } catch { /* non-critical */ }
}

// ── In-App Chat Banner ───────────────────────────────────────────────────────
interface BannerPayload {
  conversationId: string;
  senderName: string;
  messagePreview: string;
  avatarUrl?: string | null;
  messageId: string;
}

function InAppChatBanner() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [banner, setBanner] = useState<BannerPayload | null>(null);

  // Reanimated shared values
  const slideY = useSharedValue(-120);
  const dragY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value + dragY.value }],
  }));

  const shownMsgIdsRef = useRef<Map<string, number>>(new Map());
  const convCooldownRef = useRef<Map<string, number>>(new Map());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load shown IDs ──
  useEffect(() => {
    loadShownIds().then(map => { shownMsgIdsRef.current = map; });
  }, []);

  // ── Clear banner ──
  const clearBanner = useCallback(() => {
    setBanner(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // ── Dismiss banner with animation ──
  const dismissBanner = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
    slideY.value = withTiming(-140, { duration: 260 }, (finished) => {
      if (finished) runOnJS(clearBanner)();
    });
  }, [slideY, dragY, clearBanner]);

  // ── Show banner ──
  const showBanner = useCallback((payload: BannerPayload) => {
    setBanner(payload);
    dragY.value = 0;
    slideY.value = -140;
    slideY.value = withSpring(0, { damping: 18, stiffness: 280 });
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => dismissBanner(), 5000);
  }, [slideY, dragY, dismissBanner]);

  // ── Pan gesture ──
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      dragY.value = Math.min(e.translationY, 16);
    })
    .onEnd((e) => {
      if (e.translationY < -30) {
        dragY.value = withTiming(0, { duration: 60 });
        slideY.value = withTiming(-160, { duration: 220 }, (finished) => {
          if (finished) runOnJS(clearBanner)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 18, stiffness: 300 });
      }
    });

  // ── Poll for new messages ──
  const poll = useCallback(async () => {
    if (!user) return;

    const activeChatId: string | null = (() => {
      const seg = segments as string[];
      const chatIdx = seg.indexOf('chat');
      if (chatIdx !== -1 && seg[chatIdx + 1]) return seg[chatIdx + 1];
      return null;
    })();

    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('messages')
        .select(`
          id, content, message_type, conversation_id, sender_id, created_at, read_at,
          conversations!inner(buyer_id, seller_id, ad_id),
          user_profiles!messages_sender_id_fkey(username, email, avatar_url)
        `)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`, { referencedTable: 'conversations' })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return;
      if (activeChatId && activeChatId === data.conversation_id) return;
      if ((segments as string[]).includes('messages')) return;
      if (shownMsgIdsRef.current.has(data.id)) return;
      const lastConvBanner = convCooldownRef.current.get(data.conversation_id) ?? 0;
      if (Date.now() - lastConvBanner < 20000) return;

      persistShownId(data.id, shownMsgIdsRef.current);
      convCooldownRef.current.set(data.conversation_id, Date.now());
      const senderProfile = (data as any).user_profiles;
      const senderName: string =
        senderProfile?.username || senderProfile?.email?.split('@')[0] || 'مستخدم';
      const preview: string =
        data.message_type === 'image' ? '📷 صورة' : (data.content?.slice(0, 60) ?? '');

      showBanner({
        conversationId: data.conversation_id,
        senderName,
        messagePreview: preview,
        avatarUrl: senderProfile?.avatar_url ?? null,
        messageId: data.id,
      });
    } catch { /* silent */ }
  }, [user, segments, showBanner]);

  useEffect(() => {
    if (!user) return;
    intervalRef.current = setInterval(poll, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [user, poll]);

  if (!banner) return null;

  const cardBg = isDark ? 'rgba(15,25,35,0.96)' : colors.surface;
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.border;
  const nameColor = isDark ? '#fff' : colors.textPrimary;
  const previewColor = isDark ? 'rgba(255,255,255,0.62)' : colors.textSecondary;
  const nowColor = isDark ? 'rgba(255,255,255,0.4)' : colors.textMuted;
  const closeColor = isDark ? 'rgba(255,255,255,0.45)' : colors.textMuted;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[bannerStyles.container, animatedStyle]}
        pointerEvents="box-none"
      >
        <Pressable
          style={[bannerStyles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
          onPress={async () => {
            const convId = banner.conversationId;
            dismissBanner();
            try {
              if (user?.id) {
                // ✅ استدعاء ثابت بعد الاستيراد
                await markMessagesRead(convId, user.id);
              }
            } catch { /* non-critical */ }
            router.push(`/chat/${convId}` as any);
          }}
        >
          {banner.avatarUrl ? (
            <Image
              source={{ uri: banner.avatarUrl }}
              style={bannerStyles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={bannerStyles.avatarPlaceholder}>
              <Text style={bannerStyles.avatarInitial}>
                {banner.senderName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={bannerStyles.textWrap}>
            <View style={bannerStyles.topRow}>
              <Text style={[bannerStyles.appLabel, { color: colors.primary }]}>سوق قلقيلية</Text>
              <Text style={[bannerStyles.nowLabel, { color: nowColor }]}>now</Text>
            </View>
            <Text style={[bannerStyles.senderName, { color: nameColor }]} numberOfLines={1}>
              {banner.senderName}
            </Text>
            <Text style={[bannerStyles.preview, { color: previewColor }]} numberOfLines={1}>
              {banner.messagePreview}
            </Text>
          </View>

          <View style={bannerStyles.rightCol}>
            <View style={bannerStyles.swipeIndicator}>
              <View style={[bannerStyles.swipePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.13)' }]} />
            </View>
            <Pressable onPress={dismissBanner} hitSlop={10} style={bannerStyles.closeBtn}>
              <Text style={[bannerStyles.closeX, { color: closeColor }]}>×</Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? 36 : 54,
    pointerEvents: 'box-none',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 20,
    borderWidth: 1,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, flexShrink: 0 },
  avatarPlaceholder: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0A6E5C',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: { color: '#fff', fontSize: 17, fontWeight: '800' },
  textWrap: { flex: 1, gap: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appLabel: { fontSize: 11, fontWeight: '700' },
  nowLabel: { fontSize: 10 },
  senderName: { fontSize: 14, fontWeight: '700' },
  preview: { fontSize: 13, lineHeight: 18 },
  rightCol: { alignItems: 'center', gap: 4, flexShrink: 0 },
  swipeIndicator: { alignItems: 'center', paddingBottom: 2 },
  swipePill: { width: 28, height: 3, borderRadius: 2 },
  closeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  closeX: { fontSize: 20, fontWeight: '300', lineHeight: 20 },
});

// ── Semver comparison ──────────────────────────────────────────────────────────
function isVersionOutdated(current: string, minimum: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(current);
  const [mMaj, mMin, mPat] = parse(minimum);
  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPat < mPat;
}

// ── Admin Guard ──────────────────────────────────────────────────────────────
function AdminGuard() {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    if (!isAdminRoute) return;
    if (Platform.OS === 'web') return;
    if (authLoading) return;
    if (!user || !user.is_admin) {
      router.replace('/');
    }
  }, [pathname, user, authLoading]);

  return null;
}

export default function RootLayout() {
  const [forceUpdate, setForceUpdate] = useState<{ required: boolean; minVersion: string } | null>(null);
  const [appIsReady, setAppIsReady] = useState(false);
  const prepareCalled = useRef(false);

  useEffect(() => {
    if (prepareCalled.current) return;
    prepareCalled.current = true;

    let cancelled = false;
    const MAX_INIT_MS = 3_500;

    async function prepare() {
      const deadline = new Promise<void>(resolve => setTimeout(resolve, MAX_INIT_MS));
      const work = (async () => {
        try {
          await Promise.all([preloadAds(), preloadBanners()]);
        } catch { /* never block */ }
      })();
      await Promise.race([work, deadline]);
      if (!cancelled) {
        setAppIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    prepare();
    return () => { cancelled = true; };
  }, []);

  // ── Force update check ──
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    getSupabaseClient()
      .from('app_config')
      .select('value')
      .eq('key', 'min_android_version')
      .maybeSingle()
      .then(({ data }) => {
        const minVersion = data?.value ?? '1.0.0';
        if (isVersionOutdated(APP_VERSION, minVersion)) {
          setForceUpdate({ required: true, minVersion });
        }
      })
      .catch(() => {});
  }, []);

  // ── Deep link & notification handlers ──
  const handleDeepLink = useCallback((url: string) => {
    try {
      const match = url.match(/souqqalqilya:\/\/ad\/([^?#]+)/);
      if (match?.[1]) router.push(`/ad/${match[1]}` as any);
    } catch (_) {}
  }, []);

  const handleNotificationResponse = useCallback((response: any) => {
    const data = response?.notification?.request?.content?.data ?? {};
    const conversationId: string | undefined = data?.conversation_id;
    if (conversationId) {
      router.push(`/chat/${conversationId}` as any);
    }
  }, []);

  useEffect(() => {
    // Deep linking
    import('expo-linking').then(({ default: ExpoLinking }) => {
      ExpoLinking.getInitialURL().then(url => { if (url) handleDeepLink(url); }).catch(() => {});
      ExpoLinking.addEventListener('url', ({ url }) => handleDeepLink(url));
    }).catch(() => {});

    // Notification response
    let notifSub: any = null;
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        notifSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
      } catch (_) {}
    }

    // Auth state
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const u = session.user;
        supabase.from('user_profiles').upsert({
          id: u.id,
          email: u.email ?? '',
          username:
            u.user_metadata?.full_name ??
            u.user_metadata?.name ??
            u.user_metadata?.username ??
            u.email?.split('@')[0] ??
            '',
        }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {}).catch(() => {});

        preloadAds().catch(() => {});
        preloadBanners().catch(() => {});

        if (Platform.OS !== 'web') {
          import('@/hooks/useChat').then(({ registerPushToken }) => {
            registerPushToken().catch(() => {});
          }).catch(() => {});
        }
      }
    });

    // Web console.error override
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const originalConsoleError = console.error.bind(console);
      console.error = (...args: any[]) => {
        const msg = args[0]?.message ?? String(args[0] ?? '');
        if (msg.includes('Refresh Token Not Found') || msg.includes('Invalid Refresh Token')) {
          try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.includes('supabase')) keys.push(k);
            }
            keys.forEach(k => localStorage.removeItem(k));
          } catch (_) {}
          return;
        }
        originalConsoleError(...args);
      };
    }

    // Run after interactions
    const task = InteractionManager.runAfterInteractions(() => {
      if (Platform.OS !== 'web') {
        import('@/hooks/useChat').then(({ requestNotificationPermissions }) => {
          requestNotificationPermissions();
        }).catch(() => {});
      }
    });

    // Foreground notification listener
    let foregroundSub: any = null;
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        foregroundSub = Notifications.addNotificationReceivedListener((notification: any) => {
          const data = notification?.request?.content?.data ?? {};
          const convId: string | undefined = data?.conversation_id;
          if (convId) {
            import('expo-linking').then(async ({ default: ExpoLinking }) => {
              const url = await ExpoLinking.getInitialURL();
              if (url && url.includes(convId)) return;
            }).catch(() => {});
          }
        });
      } catch (_) {}
    }

    // App state listener
    let appStateSub: any = null;
    if (Platform.OS !== 'web') {
      trackEvent('app_open').catch(() => {});
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          trackEvent('app_open').catch(() => {});
          import('@/hooks/useChat').then(({ registerPushToken }) => {
            registerPushToken().catch(() => {});
          }).catch(() => {});
        }
      });
    }

    return () => {
      task.cancel();
      subscription.unsubscribe();
      if (notifSub) { try { notifSub.remove(); } catch (_) {} }
      if (foregroundSub) { try { foregroundSub.remove(); } catch (_) {} }
      if (appStateSub) { try { appStateSub.remove(); } catch (_) {} }
    };
  }, [handleDeepLink, handleNotificationResponse]);

  if (!appIsReady) return null;

  if (forceUpdate?.required) {
    return (
      <SafeAreaProvider>
        <ForceUpdateScreen currentVersion={APP_VERSION} minVersion={forceUpdate.minVersion} />
      </SafeAreaProvider>
    );
  }

  return (
    <AlertProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider>
            <LanguageProvider>
              <AuthProvider>
                <AdminGuard />
                <InAppChatBanner />
                <Stack screenOptions={{
                  headerShown: false,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="login" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  {/* ✅ إضافة مسار messages */}
                  <Stack.Screen name="messages" options={{ headerShown: false }} />
                  <Stack.Screen name="ad/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="search" options={{ headerShown: false }} />
                  <Stack.Screen name="category/[slug]" options={{ headerShown: false }} />
                  <Stack.Screen name="admin/index" options={{ headerShown: false }} />
                  <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
                  <Stack.Screen name="favorites" options={{ headerShown: false }} />
                  <Stack.Screen name="privacy" options={{ headerShown: false }} />
                  <Stack.Screen name="faq" options={{ headerShown: false }} />
                  <Stack.Screen name="support-form" options={{ headerShown: false }} />
                  <Stack.Screen name="edit-ad/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
                  <Stack.Screen name="seller/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="ai-support" options={{ headerShown: false }} />
                  <Stack.Screen name="store/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="register-store" options={{ headerShown: false }} />
                  <Stack.Screen name="store-dashboard" options={{ headerShown: false }} />
                </Stack>
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </AlertProvider>
  );
}