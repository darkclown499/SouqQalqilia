import * as SplashScreen from 'expo-splash-screen';
import { AlertProvider, AuthProvider, getSupabaseClient, useAuth } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, router, useSegments } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, Platform, InteractionManager, Animated, Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ForceUpdateScreen } from '@/components/feature/ForceUpdateScreen';
import { APP_VERSION } from '@/constants/config';

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
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0A6E5C',
        sound: 'default',
        showBadge: true,
      }).catch(() => {});
    }
  } catch (_) {}
}

// ─── Web: defer stale-token cleanup ───────────────────────────────────────────
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

// ── In-App Chat Banner ───────────────────────────────────────────────────────
interface BannerPayload {
  conversationId: string;
  senderName: string;
  messagePreview: string;
  avatarUrl?: string | null;
}

function InAppChatBanner() {
  const { user } = useAuth();
  // useTheme is safe here — InAppChatBanner renders inside ThemeProvider
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const [banner, setBanner] = useState<BannerPayload | null>(null);
  const slideY = useRef(new Animated.Value(-120)).current;
  const lastMsgIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showBanner = useCallback((payload: BannerPayload) => {
    setBanner(payload);
    Animated.spring(slideY, {
      toValue: 0,
      damping: 18,
      stiffness: 280,
      useNativeDriver: true,
    }).start();
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => dismissBanner(), 4500);
  }, [slideY]);

  const dismissBanner = useCallback(() => {
    Animated.timing(slideY, {
      toValue: -120,
      duration: 260,
      useNativeDriver: true,
    }).start(() => setBanner(null));
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, [slideY]);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
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
          .single();

        if (!data) return;
        if (data.id === lastMsgIdRef.current) return;
        if (activeChatId && activeChatId === data.conversation_id) return;

        lastMsgIdRef.current = data.id;
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
        });
      } catch { /* silent */ }
    };

    intervalRef.current = setInterval(poll, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [user?.id, segments, showBanner]);

  if (!banner) return null;

  // ── Theme-aware card colors ────────────────────────────────────────────────
  // Dark mode  → rich near-black with subtle border
  // Light mode → clean white surface with elevation shadow
  const cardBg = isDark ? 'rgba(15,25,35,0.96)' : colors.surface;
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.border;
  const nameColor = isDark ? '#fff' : colors.textPrimary;
  const previewColor = isDark ? 'rgba(255,255,255,0.62)' : colors.textSecondary;
  const nowColor = isDark ? 'rgba(255,255,255,0.4)' : colors.textMuted;
  const closeColor = isDark ? 'rgba(255,255,255,0.45)' : colors.textMuted;

  return (
    <Animated.View
      style={[
        bannerStyles.container,
        { transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[bannerStyles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
        onPress={async () => {
          const convId = banner.conversationId;
          dismissBanner();
          // TASK 3: Mark messages as read immediately so tab badge clears at once
          try {
            if (user?.id) {
              const { markMessagesRead } = await import('@/services/chatService');
              await markMessagesRead(convId, user.id);
            }
          } catch { /* non-critical — navigation proceeds regardless */ }
          router.push(`/chat/${convId}` as any);
        }}
      >
        {/* Avatar */}
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

        {/* Content */}
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

        {/* Dismiss */}
        <Pressable onPress={dismissBanner} hitSlop={10} style={bannerStyles.closeBtn}>
          <Text style={[bannerStyles.closeX, { color: closeColor }]}>×</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
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
  closeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  closeX: { fontSize: 20, fontWeight: '300', lineHeight: 20 },
});

// ── Semver comparison: returns true if `current` < `minimum` ────────────────
function isVersionOutdated(current: string, minimum: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(current);
  const [mMaj, mMin, mPat] = parse(minimum);
  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPat < mPat;
}

export default function RootLayout() {
  const [forceUpdate, setForceUpdate] = useState<{ required: boolean; minVersion: string } | null>(null);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const MAX_INIT_MS = 3_500;

    async function prepare() {
      const deadline = new Promise<void>(resolve => setTimeout(resolve, MAX_INIT_MS));
      const work = (async () => {
        try {
          await Promise.all([preloadAds(), preloadBanners()]);
        } catch { /* never block the user */ }
      })();
      await Promise.race([work, deadline]);
      if (!cancelled) setAppIsReady(true);
    }

    prepare();
    return () => { cancelled = true; };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) await SplashScreen.hideAsync().catch(() => {});
  }, [appIsReady]);

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

  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const match = url.match(/souqqalqilya:\/\/ad\/([^?#]+)/);
        if (match?.[1]) router.push(`/ad/${match[1]}` as any);
      } catch (_) {}
    };

    import('expo-linking').then(({ default: ExpoLinking }) => {
      ExpoLinking.getInitialURL().then(url => { if (url) handleDeepLink(url); }).catch(() => {});
      ExpoLinking.addEventListener('url', ({ url }) => handleDeepLink(url));
    }).catch(() => {});

    let notifSub: any = null;
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        notifSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response?.notification?.request?.content?.data ?? {};
          const conversationId: string | undefined = data?.conversation_id;
          if (conversationId) {
            import('expo-router').then(({ router: r }) => {
              r.push(`/chat/${conversationId}` as any);
            });
          }
        });
      } catch (_) {}
    }

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

        // Always re-register push token on sign-in / token refresh.
        // This is the PRIMARY registration path — catches users who were
        // already logged in when they installed an update.
        if (Platform.OS !== 'web') {
          import('@/hooks/useChat').then(({ registerPushToken }) => {
            registerPushToken().catch(() => {});
          }).catch(() => {});
        }
      }
    });

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

    // Permission + initial token registration (runs after first render)
    const task = InteractionManager.runAfterInteractions(() => {
      if (Platform.OS !== 'web') {
        import('@/hooks/useChat').then(({ requestNotificationPermissions }) => {
          requestNotificationPermissions();
        }).catch(() => {});
      }
    });

    // ── Foreground notification listener ──────────────────────────────────
    // Fires when a push arrives while the app is OPEN (foreground).
    // Without this the OS drops the notification silently on some Android versions.
    let foregroundSub: any = null;
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        foregroundSub = Notifications.addNotificationReceivedListener((notification: any) => {
          const data  = notification?.request?.content?.data  ?? {};
          const convId: string | undefined = data?.conversation_id;
          // Suppress the push banner if the user is already viewing that exact chat
          if (convId) {
            import('expo-router').then(({ useSegments: _unused, router: _r }) => {}).catch(() => {});
            // Read active route via Linking
            import('expo-linking').then(async ({ default: ExpoLinking }) => {
              const url = await ExpoLinking.getInitialURL();
              if (url && url.includes(convId)) {
                // User is in this chat — swallow the notification (already handled)
                console.log('[Notification] Suppressed foreground push — user already in conv:', convId);
                return;
              }
              console.log('[Notification] ✅ Foreground received, showing banner for conv:', convId);
            }).catch(() => {});
          }
        });
      } catch (_) {}
    }

    // ── App-foreground token refresh ──────────────────────────────────────
    // Re-registers the push token every time the app comes back from background.
    // Ensures stale/rotated tokens are always up to date in the DB.
    let appStateSub: any = null;
    if (Platform.OS !== 'web') {
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
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
  }, []);

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
      <SafeAreaProvider onLayout={onLayoutRootView}>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <InAppChatBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
              </Stack>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
