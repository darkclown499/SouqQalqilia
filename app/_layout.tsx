import { AlertProvider, AuthProvider } from '@/template';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useEffect } from 'react';
import { Platform, InteractionManager } from 'react-native';

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

export default function RootLayout() {
  useEffect(() => {
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
    // Must NOT be deferred — Google OAuth fires SIGNED_IN before interactions
    // settle and the listener must be ready to catch it.
    import('@/template').then(({ getSupabaseClient }) => {
      const supabase = getSupabaseClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          import('expo-router').then(({ router }) => {
            router.replace('/login');
          });
        }

        // ── Ensure user_profiles exists on every sign-in ─────────────────────
        // The DB trigger (on_auth_user_created) sometimes fails for Google OAuth
        // or SMS-based users. This upsert is idempotent and runs silently.
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          const u = session.user;
          try {
            await supabase.from('user_profiles').upsert({
              id: u.id,
              email: u.email ?? '',
              username:
                u.user_metadata?.full_name ??
                u.user_metadata?.name ??
                u.user_metadata?.username ??
                u.email?.split('@')[0] ??
                '',
            }, { onConflict: 'id', ignoreDuplicates: true });
          } catch (_) {
            // Non-fatal — createAd has its own fallback as well
          }
        }
      });
      // Note: subscription cleanup handled by app lifecycle
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
      if (notifSub) {
        try { notifSub.remove(); } catch (_) {}
      }
    };
  }, []);

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
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
                <Stack.Screen name="favorites" options={{ headerShown: false }} />
                <Stack.Screen name="privacy" options={{ headerShown: false }} />
              </Stack>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
