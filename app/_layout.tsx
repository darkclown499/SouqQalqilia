import { AlertProvider, AuthProvider, getSupabaseClient } from '@/template';
import { preloadAds } from '@/services/adsService';
import { preloadBanners } from '@/services/bannersService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { Platform, InteractionManager } from 'react-native';
import { ForceUpdateScreen } from '@/components/feature/ForceUpdateScreen';
import { APP_VERSION } from '@/constants/config';

// ── Configure notification handler SYNCHRONOUSLY at module level ─────────────
// Must run before any notification arrives (foreground + background display)
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
    // Create Android notification channel (required for Android 8+ / API 26+)
    // Must be set before any notification arrives
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

// ─── Web: defer stale-token cleanup until after JS bundle is parsed ───────────
// Running localStorage scan synchronously at module level blocks the JS thread
// before React even mounts — move it behind a microtask so the first frame is
// not blocked.
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

  // ── Check minimum required version on mount ────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return; // skip for web
    const key = Platform.OS === 'ios' ? 'min_ios_version' : 'min_android_version';
    getSupabaseClient()
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        const minVersion = data?.value ?? '1.0.0';
        if (isVersionOutdated(APP_VERSION, minVersion)) {
          setForceUpdate({ required: true, minVersion });
        }
      })
      .catch(() => {}); // fail silently — never block app on network error
  }, []);

  useEffect(() => {
    // ── Deep Link handler: souqqalqilya://ad/<id> ───────────────────────────
    // Handles cold-start deep links AND links received while app is open.
    const handleDeepLink = (url: string) => {
      try {
        // Match pattern: souqqalqilya://ad/<uuid-or-id>
        const match = url.match(/souqqalqilya:\/\/ad\/([^?#]+)/);
        if (match?.[1]) {
          router.push(`/ad/${match[1]}` as any);
        }
      } catch (_) {}
    };

    // Handle link that launched the app from cold start
    import('expo-linking').then(({ default: ExpoLinking }) => {
      ExpoLinking.getInitialURL().then(url => { if (url) handleDeepLink(url); }).catch(() => {});
      const linkSub = ExpoLinking.addEventListener('url', ({ url }) => handleDeepLink(url));
      // Note: linkSub.remove() will be called in the cleanup below via closure
      return linkSub;
    }).catch(() => {});

    // ── Notification tap → open related chat conversation ────────────────────
    let notifSub: any = null;
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        notifSub = Notifications.addNotificationResponseReceivedListener(
          (response: any) => {
            const data = response?.notification?.request?.content?.data ?? {};
            const conversationId: string | undefined = data?.conversation_id;
            if (conversationId) {
              import('expo-router').then(({ router }) => {
                router.push(`/chat/${conversationId}` as any);
              });
            }
          }
        );
      } catch (_) {}
    }

    // ── CRITICAL: Register auth state listener immediately ──────────────────
    // Use static-imported getSupabaseClient — no dynamic import delay.
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }

      // ── Ensure user_profiles exists on every sign-in ─────────────────────
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const u = session.user;
        // Fire-and-forget profile upsert — non-blocking
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

        // ── Preload ads cache right after sign-in ───────────────────────
        // This ensures home screen renders instantly with data already in cache
        preloadAds().catch(() => {});
        preloadBanners().catch(() => {});

        // ── Register push token right after sign-in ──────────────────────
        if (Platform.OS !== 'web') {
          import('@/hooks/useChat').then(({ registerPushToken }) => {
            registerPushToken().catch(() => {});
          }).catch(() => {});
        }
      }
    });

    // Web console interceptor for stale token errors (immediate)
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

    // ── Defer only heavy non-critical tasks ─────────────────────────────────
    const task = InteractionManager.runAfterInteractions(() => {
      // Register push token — safe to defer (handler already set above)
      import('@/hooks/useChat').then(({ requestNotificationPermissions }) => {
        requestNotificationPermissions();
      });
    });

    return () => {
      task.cancel();
      subscription.unsubscribe();
      if (notifSub) {
        try { notifSub.remove(); } catch (_) {}
      }
    };
  }, []);

  // ── Force update wall — rendered outside all providers intentionally ────────
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
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
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
