import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, ActivityIndicator, Modal, Animated,
  Dimensions, StatusBar, TextInput,
} from 'react-native';
import { FirebaseRecaptchaVerifierModal, FirebaseRecaptchaBanner } from 'expo-firebase-recaptcha';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
// Apple Authentication — only available on iOS/macOS, safe-imported
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
try {
  if (typeof navigator !== 'undefined' || true) {
    AppleAuthentication = require('expo-apple-authentication');
  }
} catch (_) {}
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Button, Input } from '@/components';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { APP_NAME, APP_NAME_AR } from '@/constants/config';
import type { Language } from '@/constants/i18n';

// ─── Firebase setup ─────────────────────────────────────────────────────
// Firebase web credentials are intentionally public — they identify your project.
// Update these values from Firebase Console → Project Settings → Your apps → Web
import { FIREBASE_CONFIG, isFirebaseConfigured } from '@/constants/firebaseConfig';
const FIREBASE_READY = isFirebaseConfigured();

function getFirebaseApp() {
  try {
    const apps = getApps();
    if (apps.length > 0) return apps[0];
    return initializeApp(FIREBASE_CONFIG);
  } catch (e) {
    console.warn('Firebase init error:', e);
    return null;
  }
}

type Mode = 'login' | 'register' | 'otp' | 'forgot' | 'forgot_sent' | 'phone' | 'phone_otp';

// ─── Responsive helpers ───────────────────────────────────────────────────────
function useDimensions() {
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  return dims;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const dims = useDimensions();
  const W = dims.width;
  const isSmall = W < 360;
  const isTablet = W >= 600;

  const { signInWithPassword, sendOTP, verifyOTPAndLogin, operationLoading } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'web' && typeof WebBrowser.warmUpAsync === 'function') WebBrowser.warmUpAsync();
    return () => { if (Platform.OS !== 'web' && typeof WebBrowser.coolDownAsync === 'function') WebBrowser.coolDownAsync(); };
  }, []);

  const { showAlert } = useAlert();
  const { colors, isDark } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const isAr = language === 'ar';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [eulaModalVisible, setEulaModalVisible] = useState(false);
  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const phoneResendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const googleScale = useRef(new Animated.Value(1)).current;
  const appleScale = useRef(new Animated.Value(1)).current;

  // Card enter animation
  const cardY = useRef(new Animated.Value(24)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(cardY, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
    ]).start();
  }, [mode]);

  const resetCardAnim = useCallback(() => {
    cardOpacity.setValue(0);
    cardY.setValue(20);
  }, []);

  const switchMode = useCallback((newMode: Mode) => {
    resetCardAnim();
    setMode(newMode);
  }, []);

  // ── Apple Sign-In ──
  const handleAppleSignIn = async () => {
    if (appleLoading) return;
    if (!AppleAuthentication) {
      return showAlert(
        isAr ? 'غير متاح' : 'Not Available',
        isAr ? 'تسجيل الدخول عبر Apple غير متاح حالياً.' : 'Apple Sign-In is not available on this device.'
      );
    }
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken ?? '',
      });
      if (error) {
        showAlert(isAr ? 'خطأ في تسجيل الدخول' : 'Sign-in Error', error.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Apple sign-in failed');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const onGooglePressIn = useCallback(() => {
    Animated.spring(googleScale, { toValue: 0.96, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
  }, []);
  const onGooglePressOut = useCallback(() => {
    Animated.spring(googleScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, []);
  const onApplePressIn = useCallback(() => {
    Animated.spring(appleScale, { toValue: 0.96, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
  }, []);
  const onApplePressOut = useCallback(() => {
    Animated.spring(appleScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, []);

  // Phone resend cooldown
  useEffect(() => {
    if (phoneResendCooldown <= 0) {
      if (phoneResendRef.current) { clearInterval(phoneResendRef.current); phoneResendRef.current = null; }
      return;
    }
    phoneResendRef.current = setInterval(() => setPhoneResendCooldown(v => v <= 1 ? 0 : v - 1), 1000);
    return () => { if (phoneResendRef.current) clearInterval(phoneResendRef.current); };
  }, [phoneResendCooldown > 0]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null; }
      return;
    }
    cooldownRef.current = setInterval(() => setResendCooldown(v => v <= 1 ? 0 : v - 1), 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown > 0]);

  // ── Phone: Send verification code ──
  const handleSendPhoneCode = async () => {
    const trimmed = phoneNumber.trim();
    if (!trimmed || trimmed.length < 7) {
      return showAlert(
        isAr ? 'رقم غير صحيح' : 'Invalid Number',
        isAr ? 'يرجى إدخال رقم هاتف صحيح مع رمز الدولة' : 'Please enter a valid phone number with country code'
      );
    }
    if (phoneLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setPhoneLoading(true);
    try {
      const app = getFirebaseApp();
      if (!app) throw new Error('Firebase not available');
      const auth = getAuth(app);
      const result = await signInWithPhoneNumber(auth, trimmed, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      resetCardAnim();
      setMode('phone_otp');
      setPhoneResendCooldown(60);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to send code';
      showAlert(isAr ? 'خطأ' : 'Error', msg);
    } finally {
      setPhoneLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // ── Phone: Verify OTP & sign into Supabase ──
  const handleVerifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length < 6) {
      return showAlert(
        isAr ? 'الرمز مطلوب' : 'Code Required',
        isAr ? 'يرجى إدخال رمز التحقق المكون من 6 أرقام' : 'Please enter the 6-digit verification code'
      );
    }
    if (!confirmationResult) {
      return showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'يرجى إعادة إرسال الرمز' : 'Please resend the code');
    }
    if (phoneLoading) return;
    setPhoneLoading(true);
    try {
      // 1. Verify code with Firebase
      const credential = await confirmationResult.confirm(phoneOtp.trim());
      const firebaseUser = credential.user;

      // 2. Get Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // 3. Exchange for Supabase session via Edge Function
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('sms-auth', {
        body: { action: 'verify_firebase', idToken },
      });

      if (error) {
        let errMsg = error.message;
        try {
          const { FunctionsHttpError } = await import('@supabase/supabase-js');
          if (error instanceof FunctionsHttpError) {
            const text = await error.context?.text();
            errMsg = text || errMsg;
          }
        } catch { }
        throw new Error(errMsg);
      }

      if (data?.session) {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessErr) throw new Error(sessErr.message);
        router.replace('/(tabs)');
      } else {
        throw new Error('No session returned');
      }
    } catch (e: any) {
      showAlert(isAr ? 'فشل التحقق' : 'Verification Failed', e?.message ?? 'Incorrect code');
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Phone: Resend code ──
  const handleResendPhoneCode = async () => {
    if (phoneResendCooldown > 0 || phoneLoading || isSubmittingRef.current) return;
    // Reset back to phone input mode and re-trigger
    setPhoneOtp('');
    setConfirmationResult(null);
    resetCardAnim();
    setMode('phone');
  };

  const togglePassword = useCallback(() => setShowPassword(v => !v), []);
  const toggleConfirmPassword = useCallback(() => setShowConfirmPassword(v => !v), []);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

  // ── Email Login ──
  const handleLogin = async () => {
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
    if (!isValidEmail(email)) return showAlert(
      isAr ? 'بريد غير صحيح' : 'Invalid Email',
      isAr ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email address'
    );
    if (operationLoading || verifying || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error, user: loggedInUser } = await signInWithPassword(email.trim().toLowerCase(), password);
      if (error) { showAlert(t.loginFailed, error); return; }
      if (loggedInUser) router.replace('/(tabs)');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Forgot Password ──
  const handleForgotPassword = async () => {
    if (!email.trim()) return showAlert(
      isAr ? 'البريد الإلكتروني مطلوب' : 'Email Required',
      isAr ? 'يرجى إدخال بريدك الإلكتروني أولاً' : 'Please enter your email address first'
    );
    if (!isValidEmail(email)) return showAlert(
      isAr ? 'بريد غير صحيح' : 'Invalid Email',
      isAr ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email address'
    );
    if (forgotLoading) return;
    setForgotLoading(true);
    try {
      const supabase = getSupabaseClient();
      const redirectTo = Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
        : 'souqqalqilya://auth/callback';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (error) {
        showAlert(isAr ? 'خطأ' : 'Error', error.message);
      } else {
        resetCardAnim();
        setMode('forgot_sent');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Register: Send OTP ──
  const handleSendOTP = async () => {
    if (!eulaAccepted) return showAlert(isAr ? 'الموافقة مطلوبة' : 'Agreement Required', t.eulaMustAgree);
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
    if (!isValidEmail(email)) return showAlert(
      isAr ? 'بريد غير صحيح' : 'Invalid Email',
      isAr ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email address'
    );
    if (password !== confirmPassword) return showAlert(t.passwordMismatch, t.passwordsDontMatch);
    if (password.length < 6) return showAlert(t.weakPassword, t.passwordMin6);
    if (operationLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) return showAlert('Error', error);
      resetCardAnim();
      setMode('otp');
      setResendCooldown(60);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Resend OTP ──
  const handleResendOTP = async () => {
    if (resendCooldown > 0 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) return showAlert('Error', error);
      setResendCooldown(60);
      showAlert(isAr ? 'تم الإرسال' : 'Code Sent', isAr ? 'تم إرسال رمز جديد إلى بريدك الإلكتروني' : 'A new code was sent to your email.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Verify OTP ──
  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 4) return showAlert(t.enterCode, t.enterCodeMsg);
    if (verifying) return;
    setVerifying(true);
    try {
      const { error, user: newUser } = await verifyOTPAndLogin(email.trim(), otp.trim(), { password });
      if (error) {
        showAlert(t.verificationFailed, error);
      } else if (newUser) {
        router.replace('/(tabs)');
      }
    } finally {
      setVerifying(false);
    }
  };

  // ── Google Sign-In ──
  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const supabase = getSupabaseClient();

    if (Platform.OS === 'web') {
      try {
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: false, queryParams: { prompt: 'select_account', access_type: 'offline' } },
        });
        if (error) showAlert(isAr ? 'خطأ' : 'Error', error.message);
      } catch (e: any) {
        showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Google sign-in failed');
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    let authResolved = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (authResolved) return;
      if (event === 'SIGNED_IN' && session) {
        authResolved = true;
        subscription.unsubscribe();
        setGoogleLoading(false);
        router.replace('/(tabs)');
      }
    });

    try {
      const redirectTo = 'souqqalqilya://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account', access_type: 'offline' } },
      });

      if (error || !data?.url) {
        subscription.unsubscribe();
        showAlert(isAr ? 'خطأ في الاتصال' : 'Connection Error', error?.message ?? (isAr ? 'تعذّر الاتصال بـ Google' : 'Could not connect to Google'));
        setGoogleLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo) as { type: string; url?: string };

      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const params = new URLSearchParams(parsed.searchParams);
        if (parsed.hash?.startsWith('#')) {
          new URLSearchParams(parsed.hash.slice(1)).forEach((v, k) => params.set(k, v));
        }
        const code = params.get('code');
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchErr && !authResolved) {
            authResolved = true;
            subscription.unsubscribe();
            setGoogleLoading(false);
            router.replace('/(tabs)');
            return;
          }
          if (exchErr && !authResolved) {
            subscription.unsubscribe();
            authResolved = true;
            showAlert(isAr ? 'خطأ' : 'Error', exchErr.message);
            setGoogleLoading(false);
            return;
          }
        } else {
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken && !authResolved) {
            const { error: sessErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (sessErr && !authResolved) {
              subscription.unsubscribe();
              authResolved = true;
              showAlert(isAr ? 'خطأ' : 'Error', sessErr.message);
              setGoogleLoading(false);
              return;
            }
          }
        }
        return;
      }

      if (!authResolved) {
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const { data: { session } } = await supabase.auth.getSession();
          if (session && !authResolved) {
            authResolved = true;
            subscription.unsubscribe();
            clearInterval(poll);
            setGoogleLoading(false);
            router.replace('/(tabs)');
          } else if (attempts >= 10 && !authResolved) {
            authResolved = true;
            subscription.unsubscribe();
            clearInterval(poll);
            setGoogleLoading(false);
            showAlert(
              isAr ? 'لم يكتمل تسجيل الدخول' : 'Sign-in not completed',
              isAr ? 'يرجى المحاولة مجدداً.' : 'Please try again.'
            );
          }
        }, 1500);
      }
    } catch (e: any) {
      subscription.unsubscribe();
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  // ── Responsive values ──
  const hPad = isTablet ? 48 : Spacing.lg;
  const logoSize = isSmall ? 72 : isTablet ? 120 : 88;
  const maxCardWidth = isTablet ? 480 : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#0A6E5C" />

      {/* Firebase reCAPTCHA verifier — only rendered when Firebase config is filled in */}
      {Platform.OS !== 'web' && FIREBASE_READY ? (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifierRef}
          firebaseConfig={FIREBASE_CONFIG}
          attemptInvisibleVerification
          title={isAr ? 'التحقق من رقم الهاتف' : 'Verify Phone Number'}
          cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
        />
      ) : null}
      {/* ── Verifying overlay ── */}
      <Modal visible={verifying} transparent animationType="none" statusBarTranslucent>
        <View style={s.overlay}>
          <View style={s.overlayBox}>
            <ActivityIndicator size="large" color="#0A6E5C" />
            <Text style={s.overlayText}>{isAr ? 'جارٍ التحقق...' : 'Verifying...'}</Text>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={[s.scroll, { backgroundColor: '#0A6E5C' }]}
        contentContainerStyle={[
          s.scrollContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: hPad,
            alignItems: isTablet ? 'center' : 'stretch',
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar: Language + Back ── */}
        <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {(mode === 'forgot' || mode === 'otp') ? (
            <Pressable
              style={s.backBtn}
              onPress={() => switchMode(mode === 'otp' ? 'register' : 'login')}
              hitSlop={10}
            >
              <MaterialIcons
                name={isAr ? 'arrow-forward' : 'arrow-back'}
                size={20}
                color="rgba(255,255,255,0.9)"
              />
            </Pressable>
          ) : <View style={{ width: 36 }} />}

          <View style={[s.langRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            {(['ar', 'en'] as Language[]).map(lang => (
              <Pressable
                key={lang}
                style={[
                  s.langPill,
                  language === lang
                    ? { backgroundColor: 'rgba(255,255,255,0.95)' }
                    : { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.25)' },
                ]}
                onPress={() => setLanguage(lang)}
              >
                <Text style={[s.langText, { color: language === lang ? '#0A6E5C' : 'rgba(255,255,255,0.88)' }]}>
                  {lang === 'en' ? 'EN' : 'ع'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Hero ── */}
        <View style={[s.hero, { maxWidth: maxCardWidth, width: '100%', alignSelf: 'center' }]}>
          <View style={[s.logoWrap, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.22 }]}>
            <Image
              source={require('@/assets/images/app-logo-bg.png')}
              style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.22 }}
              contentFit="cover"
              transition={200}
            />
          </View>
          <Text style={[s.heroTitle, { fontSize: isSmall ? FontSize.xl : FontSize.xxl + 2 }]}>
            {isAr ? APP_NAME_AR : APP_NAME}
          </Text>
          <Text style={s.heroSub}>{t.tagline}</Text>
        </View>

        {/* ── Main Card ── */}
        <Animated.View
          style={[
            s.card,
            {
              backgroundColor: colors.surface,
              maxWidth: maxCardWidth,
              width: '100%',
              alignSelf: 'center',
              transform: [{ translateY: cardY }],
              opacity: cardOpacity,
              ...Shadow.lg,
            },
          ]}
        >
          {/* ─ Login/Register/Phone Tabs ─ */}
          {(mode === 'login' || mode === 'register' || (mode === 'phone' && FIREBASE_READY)) ? (
            <View style={[s.tabs, { backgroundColor: colors.background }]}>
              {((['login', 'register', ...(FIREBASE_READY ? ['phone'] : [])] as const) as Array<'login'|'register'|'phone'>).map(tab => (
                <Pressable
                  key={tab}
                  style={[
                    s.tab,
                    mode === tab && [s.tabActive, { backgroundColor: colors.primary }],
                  ]}
                  onPress={() => switchMode(tab)}
                >
                  <MaterialIcons
                    name={tab === 'phone' ? 'phone' : tab === 'login' ? 'login' : 'person-add'}
                    size={13}
                    color={mode === tab ? '#fff' : colors.textMuted}
                  />
                  <Text style={[s.tabText, { color: mode === tab ? '#fff' : colors.textMuted }]}>
                    {tab === 'login' ? t.signIn : tab === 'register' ? t.register : (isAr ? 'هاتف' : 'Phone')}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* ─ Mode: Login ─ */}
          {mode === 'login' ? (
            <LoginForm
              email={email} setEmail={setEmail}
              password={password} setPassword={setPassword}
              showPassword={showPassword} togglePassword={togglePassword}
              loading={operationLoading}
              onLogin={handleLogin}
              onForgot={() => switchMode('forgot')}
              colors={colors} t={t} isAr={isAr}
            />
          ) : null}

          {/* ─ Mode: Register ─ */}
          {mode === 'register' ? (
            <RegisterForm
              email={email} setEmail={setEmail}
              password={password} setPassword={setPassword}
              confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
              showPassword={showPassword} togglePassword={togglePassword}
              showConfirmPassword={showConfirmPassword} toggleConfirmPassword={toggleConfirmPassword}
              eulaAccepted={eulaAccepted} setEulaAccepted={setEulaAccepted}
              onOpenEula={() => setEulaModalVisible(true)}
              loading={operationLoading}
              onSend={handleSendOTP}
              colors={colors} t={t} isAr={isAr}
              router={router}
            />
          ) : null}

          {/* ─ Mode: OTP ─ */}
          {mode === 'otp' ? (
            <OtpForm
              email={email}
              otp={otp} setOtp={setOtp}
              resendCooldown={resendCooldown}
              loading={operationLoading}
              onVerify={handleVerifyOTP}
              onResend={handleResendOTP}
              onBack={() => switchMode('register')}
              colors={colors} t={t} isAr={isAr}
            />
          ) : null}

          {/* ─ Mode: Phone Number Entry ─ */}
          {mode === 'phone' && FIREBASE_READY ? (
            <PhoneForm
              phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber}
              loading={phoneLoading}
              onSend={handleSendPhoneCode}
              recaptchaVerifierRef={recaptchaVerifierRef}
              colors={colors} isAr={isAr}
            />
          ) : null}

          {/* ─ Mode: Phone OTP ─ */}
          {mode === 'phone_otp' && FIREBASE_READY ? (
            <PhoneOtpForm
              phoneNumber={phoneNumber}
              otp={phoneOtp} setOtp={setPhoneOtp}
              resendCooldown={phoneResendCooldown}
              loading={phoneLoading}
              onVerify={handleVerifyPhoneOtp}
              onResend={handleResendPhoneCode}
              colors={colors} isAr={isAr}
            />
          ) : null}

          {/* ─ Mode: Forgot Password ─ */}
          {mode === 'forgot' ? (
            <ForgotForm
              email={email} setEmail={setEmail}
              loading={forgotLoading}
              onSend={handleForgotPassword}
              onBack={() => switchMode('login')}
              colors={colors} isAr={isAr}
            />
          ) : null}

          {/* ─ Mode: Forgot Sent ─ */}
          {mode === 'forgot_sent' ? (
            <ForgotSentScreen
              email={email}
              onBack={() => switchMode('login')}
              colors={colors} isAr={isAr}
            />
          ) : null}

          {/* Footer hint */}
          {(mode === 'login' || mode === 'register') ? (
            <Text style={[s.footerHint, { color: colors.textMuted }]}>
              {mode === 'login' ? t.noAccount : t.haveAccount}
              <Text
                style={[s.footerLink, { color: colors.primary }]}
                onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? t.register : t.signIn}
              </Text>
            </Text>
          ) : null}
          {mode === 'phone' && FIREBASE_READY ? (
            <Text style={[s.footerHint, { color: colors.textMuted }]}>
              {isAr ? 'لديك حساب؟ ' : 'Have an account? '}
              <Text style={[s.footerLink, { color: colors.primary }]} onPress={() => switchMode('login')}>
                {t.signIn}
              </Text>
            </Text>
          ) : null}
        </Animated.View>

        {/* ── Social Buttons ── */}
        {(mode === 'login' || mode === 'register' || (mode === 'phone' && FIREBASE_READY)) && Platform.OS !== 'web' ? (
          <View style={[s.socialSection, { maxWidth: maxCardWidth, width: '100%', alignSelf: 'center' }]}>
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>{isAr ? 'أو تابع بـ' : 'or continue with'}</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.socialRow}>
              {/* Google */}
              <Animated.View style={[s.socialBtnWrap, { transform: [{ scale: googleScale }] }]}>
                <Pressable
                  style={[s.socialBtn, s.googleBtn, googleLoading && { opacity: 0.7 }]}
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
                  onPressIn={onGooglePressIn}
                  onPressOut={onGooglePressOut}
                >
                  {googleLoading
                    ? <ActivityIndicator size="small" color="#4285F4" />
                    : <GoogleIcon />}
                  <Text style={s.googleLabel}>Google</Text>
                </Pressable>
              </Animated.View>

              {/* Apple */}
              <Animated.View style={[s.socialBtnWrap, { transform: [{ scale: appleScale }] }]}>
                <Pressable
                  style={[s.socialBtn, s.appleBtn, appleLoading && { opacity: 0.7 }]}
                  onPress={handleAppleSignIn}
                  disabled={appleLoading}
                  onPressIn={onApplePressIn}
                  onPressOut={onApplePressOut}
                >
                  {appleLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <FontAwesome name="apple" size={19} color="#fff" />}
                  <Text style={s.appleLabel}>Apple</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* EULA Modal */}
      <EulaModal
        visible={eulaModalVisible}
        onClose={() => setEulaModalVisible(false)}
        onAccept={() => { setEulaAccepted(true); setEulaModalVisible(false); }}
        colors={colors} t={t} isAr={isAr}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Phone Number Form ─────────────────────────────────────────────
function PhoneForm({ phoneNumber, setPhoneNumber, loading, onSend, recaptchaVerifierRef, colors, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.centeredHeader}>
        <View style={[s.iconCircle, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="phone-android" size={32} color={colors.primary} />
        </View>
        <Text style={[s.formTitle, { color: colors.textPrimary, textAlign: 'center' }]}>
          {isAr ? 'تسجيل برقم الهاتف' : 'Sign in with Phone'}
        </Text>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center' }]}>
          {isAr
            ? 'سيتم إرسال رمز تحقق من 6 أرقام إلى رقمك'
            : 'A 6-digit verification code will be sent to your number'}
        </Text>
      </View>

      {/* Phone input with country code prefix */}
      <View style={[s.phoneInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View style={[s.countryCodeBadge, { backgroundColor: colors.primaryGhost }]}>
          <Text style={[s.countryCodeText, { color: colors.primary }]}>🇵🇸 +970</Text>
        </View>
        <TextInput
          style={[s.phoneInput, { color: colors.textPrimary }]}
          placeholder={isAr ? '59x xxx xxxx' : '59x xxx xxxx'}
          placeholderTextColor={colors.textMuted}
          value={phoneNumber}
          onChangeText={(v) => {
            // Auto-prefix +970 if user types without it
            let cleaned = v.replace(/[^+0-9]/g, '');
            setPhoneNumber(cleaned);
          }}
          keyboardType="phone-pad"
          autoFocus
          returnKeyType="send"
          onSubmitEditing={onSend}
        />
      </View>

      <Text style={[s.phoneHint, { color: colors.textMuted }]}>
        {isAr
          ? 'أدخل الرقم كاملاً مع رمز الدولة مثال: +970591234567'
          : 'Enter full number with country code e.g. +970591234567'}
      </Text>

      <Button
        label={isAr ? 'إرسال رمز التحقق' : 'Send Verification Code'}
        onPress={onSend}
        loading={loading}
        size="lg"
      />
    </View>
  );
}

// ─── Phone OTP Form ─────────────────────────────────────────────
function PhoneOtpForm({ phoneNumber, otp, setOtp, resendCooldown, loading, onVerify, onResend, colors, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.centeredHeader}>
        <View style={[s.iconCircle, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="sms" size={32} color={colors.primary} />
        </View>
        <Text style={[s.formTitle, { color: colors.textPrimary, textAlign: 'center' }]}>
          {isAr ? 'أدخل رمز التحقق' : 'Enter Verification Code'}
        </Text>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center' }]}>
          {isAr ? 'تم إرسال رمز مكون من 6 أرقام إلى' : 'A 6-digit code was sent to'}
        </Text>
        <View style={[s.emailPill, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="phone" size={14} color={colors.primary} />
          <Text style={[s.emailPillText, { color: colors.primary }]} numberOfLines={1}>{phoneNumber}</Text>
        </View>
      </View>

      <TextInput
        style={[s.otpBigInput, { borderColor: colors.primary, backgroundColor: colors.background, color: colors.textPrimary }]}
        placeholder="•  •  •  •  •  •"
        placeholderTextColor={colors.textMuted}
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={onVerify}
        autoFocus
      />

      <Button
        label={isAr ? 'تحقق وتسجيل الدخول' : 'Verify & Sign In'}
        onPress={onVerify}
        loading={loading}
        size="lg"
      />

      <Pressable
        style={[s.resendBtn, { opacity: resendCooldown > 0 ? 0.5 : 1 }]}
        onPress={onResend}
        disabled={resendCooldown > 0}
      >
        <MaterialIcons name="refresh" size={15} color={resendCooldown > 0 ? colors.textMuted : colors.primary} />
        <Text style={[s.resendText, { color: resendCooldown > 0 ? colors.textMuted : colors.primary }]}>
          {resendCooldown > 0
            ? (isAr ? `إعادة الإرسال (${resendCooldown}ث)` : `Resend Code (${resendCooldown}s)`)
            : (isAr ? 'إعادة إرسال الرمز' : 'Resend Code')}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Google Icon (multi-color G) ────────────────────────────────────────────
function GoogleIcon() {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E8EAED',
      }}>
        {/* Colored G segments using a layered text approach */}
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#4285F4', lineHeight: 16, includeFontPadding: false }}>
          G
        </Text>
      </View>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoginForm({ email, setEmail, password, setPassword, showPassword, togglePassword, loading, onLogin, onForgot, colors, t, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { color: colors.textPrimary }]}>{t.welcomeBack}</Text>
        <Text style={[s.formSub, { color: colors.textMuted }]}>{t.signInAccount}</Text>
      </View>
      <Input
        label={t.emailAddress}
        placeholder={t.emailPlaceholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View>
        <Input
          label={t.password}
          placeholder={t.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          rightElement={
            <Pressable onPress={togglePassword} hitSlop={8}>
              <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} />
            </Pressable>
          }
        />
        {/* Forgot password link */}
        <Pressable style={[s.forgotLink, { alignSelf: isAr ? 'flex-start' : 'flex-end' }]} onPress={onForgot} hitSlop={8}>
          <Text style={[s.forgotText, { color: colors.primary }]}>
            {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
          </Text>
        </Pressable>
      </View>
      <Button label={t.signIn} onPress={onLogin} loading={loading} size="lg" />
    </View>
  );
}

function RegisterForm({ email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, showPassword, togglePassword, showConfirmPassword, toggleConfirmPassword, eulaAccepted, setEulaAccepted, onOpenEula, loading, onSend, colors, t, isAr, router }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { color: colors.textPrimary }]}>{t.createAccount}</Text>
        <Text style={[s.formSub, { color: colors.textMuted }]}>{t.joinToBuySell}</Text>
      </View>
      <Input label={t.emailAddress} placeholder={t.emailPlaceholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Input
        label={t.password}
        placeholder={t.minPassword}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        rightElement={<Pressable onPress={togglePassword} hitSlop={8}><MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} /></Pressable>}
      />
      <Input
        label={t.confirmPassword}
        placeholder={t.repeatPassword}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!showConfirmPassword}
        rightElement={<Pressable onPress={toggleConfirmPassword} hitSlop={8}><MaterialIcons name={showConfirmPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} /></Pressable>}
      />
      {/* EULA */}
      <Pressable
        style={[s.eulaRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
        onPress={() => setEulaAccepted((v: boolean) => !v)}
      >
        <View style={[
          s.eulaCheck,
          { borderColor: eulaAccepted ? colors.primary : colors.border, backgroundColor: eulaAccepted ? colors.primary : 'transparent' },
        ]}>
          {eulaAccepted ? <MaterialIcons name="check" size={13} color="#fff" /> : null}
        </View>
        <Text style={[s.eulaText, { color: colors.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
          {t.eulaAgree + ' '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={onOpenEula}>{t.eulaTerms}</Text>
          {' ' + t.eulaAnd + ' '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={() => router.push('/privacy')}>{t.eulaPrivacy}</Text>
        </Text>
      </Pressable>
      <Button label={t.continueCode} onPress={onSend} loading={loading} size="lg" />
    </View>
  );
}

function OtpForm({ email, otp, setOtp, resendCooldown, loading, onVerify, onResend, onBack, colors, t, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.centeredHeader}>
        <View style={[s.iconCircle, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="mark-email-unread" size={32} color={colors.primary} />
        </View>
        <Text style={[s.formTitle, { color: colors.textPrimary, textAlign: 'center' }]}>{t.checkEmail}</Text>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center' }]}>{t.codeSentTo}</Text>
        <View style={[s.emailPill, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="email" size={14} color={colors.primary} />
          <Text style={[s.emailPillText, { color: colors.primary }]} numberOfLines={1}>{email}</Text>
        </View>
      </View>
      <Input
        label={t.verificationCode}
        placeholder="•  •  •  •"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={4}
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={onVerify}
      />
      <Button label={t.verifyCreate} onPress={onVerify} loading={loading} size="lg" />
      <Pressable
        style={[s.resendBtn, { opacity: resendCooldown > 0 ? 0.5 : 1 }]}
        onPress={onResend}
        disabled={resendCooldown > 0}
      >
        <MaterialIcons name="refresh" size={15} color={resendCooldown > 0 ? colors.textMuted : colors.primary} />
        <Text style={[s.resendText, { color: resendCooldown > 0 ? colors.textMuted : colors.primary }]}>
          {resendCooldown > 0
            ? (isAr ? `إعادة الإرسال (${resendCooldown}ث)` : `Resend Code (${resendCooldown}s)`)
            : (isAr ? 'إعادة إرسال الرمز' : 'Resend Code')}
        </Text>
      </Pressable>
    </View>
  );
}

function ForgotForm({ email, setEmail, loading, onSend, onBack, colors, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.centeredHeader}>
        <View style={[s.iconCircle, { backgroundColor: '#FEF3C7' }]}>
          <MaterialIcons name="lock-reset" size={32} color="#D97706" />
        </View>
        <Text style={[s.formTitle, { color: colors.textPrimary, textAlign: 'center' }]}>
          {isAr ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
        </Text>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center' }]}>
          {isAr
            ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط لإعادة تعيين كلمة المرور'
            : 'Enter your email and we will send you a reset link'}
        </Text>
      </View>
      <Input
        label={isAr ? 'البريد الإلكتروني' : 'Email Address'}
        placeholder={isAr ? 'example@email.com' : 'you@example.com'}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={isAr ? 'إرسال رابط الاسترداد' : 'Send Reset Link'}
        onPress={onSend}
        loading={loading}
        size="lg"
      />
      <Pressable style={s.backRow} onPress={onBack} hitSlop={8}>
        <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={16} color={colors.primary} />
        <Text style={[s.backRowText, { color: colors.primary }]}>
          {isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
        </Text>
      </Pressable>
    </View>
  );
}

function ForgotSentScreen({ email, onBack, colors, isAr }: any) {
  return (
    <View style={s.formBody}>
      <View style={s.centeredHeader}>
        <View style={[s.iconCircle, { backgroundColor: '#D1FAE5' }]}>
          <MaterialIcons name="check-circle" size={36} color="#10B981" />
        </View>
        <Text style={[s.formTitle, { color: colors.textPrimary, textAlign: 'center' }]}>
          {isAr ? 'تم الإرسال!' : 'Email Sent!'}
        </Text>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center', lineHeight: 22 }]}>
          {isAr
            ? 'تم إرسال رابط إعادة تعيين كلمة المرور إلى'
            : 'A password reset link was sent to'}
        </Text>
        <View style={[s.emailPill, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="email" size={14} color={colors.primary} />
          <Text style={[s.emailPillText, { color: colors.primary }]} numberOfLines={1}>{email}</Text>
        </View>
        <Text style={[s.formSub, { color: colors.textMuted, textAlign: 'center', marginTop: 8 }]}>
          {isAr
            ? 'تحقق من صندوق الوارد أو مجلد السبام'
            : 'Check your inbox or spam folder'}
        </Text>
      </View>
      <Pressable style={[s.backRow, { justifyContent: 'center', marginTop: 8 }]} onPress={onBack} hitSlop={8}>
        <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={16} color={colors.primary} />
        <Text style={[s.backRowText, { color: colors.primary }]}>
          {isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
        </Text>
      </Pressable>
    </View>
  );
}

function EulaModal({ visible, onClose, onAccept, colors, t, isAr }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.eulaOverlay}>
        <View style={[s.eulaSheet, { backgroundColor: colors.surface }]}>
          <View style={[s.eulaSheetHeader, { borderBottomColor: colors.border }]}>
            <View style={[s.eulaSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[s.eulaSheetTitle, { color: colors.textPrimary }]}>
              {isAr ? 'شروط الاستخدام' : 'Terms of Use'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={[s.eulaCloseBtn, { backgroundColor: colors.background }]}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={s.eulaBody} showsVerticalScrollIndicator={false}>
            <Text style={[s.eulaBodyText, { color: colors.textSecondary }]}>{t.eulaContent}</Text>
          </ScrollView>
          <Pressable style={[s.eulaAcceptBtn, { backgroundColor: colors.primary }]} onPress={onAccept}>
            <MaterialIcons name="check-circle" size={18} color="#fff" />
            <Text style={s.eulaAcceptLabel}>{isAr ? 'أوافق وأقبل الشروط' : 'I Agree & Accept'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // Top bar
  topBar: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  langRow: { flexDirection: 'row', gap: 6 },
  langPill: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 40,
  },
  langText: { fontSize: FontSize.sm, fontWeight: '700' },

  // Hero
  hero: { alignItems: 'center', paddingVertical: Spacing.md, marginBottom: Spacing.xl },
  logoWrap: {
    overflow: 'hidden',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
  },
  heroTitle: {
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },

  // Card
  card: {
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    margin: Spacing.lg,
    marginBottom: 0,
    borderRadius: Radius.md,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    borderRadius: Radius.sm,
  },
  tabActive: {},
  tabText: { fontSize: FontSize.md, fontWeight: '700' },

  // Form
  formBody: { padding: Spacing.lg, gap: Spacing.md },
  formHeader: { marginBottom: 4 },
  formTitle: { fontSize: FontSize.xl + 1, fontWeight: '800', marginBottom: 3, letterSpacing: -0.3 },
  formSub: { fontSize: FontSize.sm, lineHeight: 20 },
  centeredHeader: { alignItems: 'center', gap: 8, marginBottom: 4 },
  iconCircle: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },

  // Forgot link
  forgotLink: { marginTop: -4, paddingVertical: 4 },
  forgotText: { fontSize: FontSize.sm, fontWeight: '600' },

  // Email pill
  emailPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    maxWidth: '90%',
  },
  emailPillText: { fontSize: FontSize.sm, fontWeight: '600', flexShrink: 1 },

  // OTP resend
  resendBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 10,
  },
  resendText: { fontSize: FontSize.sm, fontWeight: '600' },

  // Back row
  backRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, marginTop: -4,
  },
  backRowText: { fontSize: FontSize.sm, fontWeight: '600' },

  // Footer
  footerHint: {
    textAlign: 'center', fontSize: FontSize.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
    marginTop: -4,
  },
  footerLink: { fontWeight: '700' },

  // EULA inline
  eulaRow: { alignItems: 'flex-start', gap: 10, marginTop: -4 },
  eulaCheck: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  eulaText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },
  eulaHighlight: { fontWeight: '700' },

  // EULA Modal
  eulaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  eulaSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%' },
  eulaSheetHandle: { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  eulaSheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  eulaSheetTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', textAlign: 'center' },
  eulaCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  eulaBody: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  eulaBodyText: { fontSize: FontSize.sm, lineHeight: 24 },
  eulaAcceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, margin: Spacing.lg, marginTop: Spacing.md,
    paddingVertical: 15, borderRadius: Radius.xl,
  },
  eulaAcceptLabel: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  // Social section
  socialSection: { marginTop: Spacing.xl },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  dividerText: { fontSize: FontSize.xs, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  socialRow: { flexDirection: 'row', gap: Spacing.sm },
  socialBtnWrap: { flex: 1 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: Radius.xl, paddingVertical: 15, height: 54,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#dadce0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  appleBtn: {
    backgroundColor: '#111',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 4,
  },
  googleIconCircle: {
    width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: 15, fontWeight: '900', color: '#4285F4', lineHeight: 18 },
  googleLabel: { fontSize: FontSize.md, fontWeight: '600', color: '#3c4043', letterSpacing: 0.1 },
  appleLabel: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },

  // Loading overlay
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: {
    backgroundColor: '#fff', borderRadius: 18, padding: 28,
    alignItems: 'center', gap: 14, minWidth: 140,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  overlayText: { fontSize: FontSize.md, fontWeight: '600', color: '#1a1a1a' },

  // Phone auth
  phoneInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: Radius.md,
    overflow: 'hidden', height: 52,
  },
  countryCodeBadge: {
    paddingHorizontal: Spacing.md, height: '100%',
    alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.08)',
  },
  countryCodeText: { fontSize: FontSize.sm, fontWeight: '700' },
  phoneInput: { flex: 1, paddingHorizontal: Spacing.md, fontSize: FontSize.md, height: '100%' },
  phoneHint: { fontSize: FontSize.xs, marginTop: -8, lineHeight: 18 },
  otpBigInput: {
    borderWidth: 2, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, fontSize: 28,
    fontWeight: '800', letterSpacing: 8,
    textAlign: 'center', height: 72,
  },
});
