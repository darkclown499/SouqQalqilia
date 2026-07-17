import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, ActivityIndicator, Modal, Animated,
  StatusBar, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useResponsive } from '@/hooks/useResponsive';
import { APP_NAME, APP_NAME_AR } from '@/constants/config';
import type { Language } from '@/constants/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────
type MainTab = 'phone' | 'email';
type EmailMode = 'login' | 'register' | 'otp' | 'forgot' | 'forgot_sent';

// ─────────────────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginCardMaxWidth: cardMaxW, isTablet } = useResponsive();
  const isTabletDevice = isTablet;

  const { signInWithPassword, sendOTP, verifyOTPAndLogin, operationLoading } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const isAr = language === 'ar';
  const router = useRouter();

  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authResolvedRef = useRef(false); // لمنع التنظيف المتكرر

  // ── Pre-warm browser for OAuth ──
  useEffect(() => {
    if (Platform.OS !== 'web') {
      WebBrowser.warmUpAsync?.().catch(() => {});
      return () => { WebBrowser.coolDownAsync?.().catch(() => {}); };
    }
  }, []);

  // ── Platform logic ─────────────────────────────────────────────────────────
  const showPhoneTab = true;
  const defaultTab: MainTab = Platform.OS === 'ios' ? 'phone' : 'email';

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MainTab>(defaultTab);
  const tabIndicator = useRef(new Animated.Value(defaultTab === 'phone' ? 0 : 1)).current;

  const switchTab = useCallback((tab: MainTab) => {
    setActiveTab(tab);
    isSubmittingRef.current = false;
    Animated.spring(tabIndicator, {
      toValue: tab === 'phone' ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [tabIndicator]);

  // ── Email/Password state ───────────────────────────────────────────────────
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [eulaModalVisible, setEulaModalVisible] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Phone Auth state ───────────────────────────────────────────────────────
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState<'+970' | '+972'>('+970');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneResend, setPhoneResend] = useState(0);
  const [fullPhoneForOtp, setFullPhoneForOtp] = useState('');
  const [phoneEulaAccepted, setPhoneEulaAccepted] = useState(false);
  const phoneResendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Social ─────────────────────────────────────────────────────────────────
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const loginCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLoginCooldown = useCallback((seconds = 30) => {
    setLoginCooldown(seconds);
    if (loginCooldownRef.current) clearInterval(loginCooldownRef.current);
    loginCooldownRef.current = setInterval(() => {
      setLoginCooldown(v => {
        if (v <= 1) {
          if (loginCooldownRef.current) clearInterval(loginCooldownRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }, []);

  // Cleanup loginCooldownRef on unmount
  useEffect(() => {
    return () => {
      if (loginCooldownRef.current) {
        clearInterval(loginCooldownRef.current);
        loginCooldownRef.current = null;
      }
    };
  }, []);

  // ── Pulsing badge animation (Android Google button badge) ─────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.spring(pulseAnim, {
            toValue: 1.08,
            useNativeDriver: true,
            speed: 4,
            bounciness: 10,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.82,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.spring(pulseAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 4,
            bounciness: 6,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, pulseOpacity]);

  const isSubmittingRef = useRef(false);

  // ── Cleanup Google Auth resources ──────────────────────────────────────────
  const cleanupGoogleAuth = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    authResolvedRef.current = false;
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupGoogleAuth();
    };
  }, [cleanupGoogleAuth]);

  // Card fade animation
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(cardY, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  // Phone resend cooldown – ✅ fixed dependency
  useEffect(() => {
    if (phoneResend <= 0) {
      if (phoneResendRef.current) { clearInterval(phoneResendRef.current); phoneResendRef.current = null; }
      return;
    }
    phoneResendRef.current = setInterval(() => setPhoneResend(v => v <= 1 ? 0 : v - 1), 1000);
    return () => { if (phoneResendRef.current) clearInterval(phoneResendRef.current); };
  }, [phoneResend]);

  // Email OTP resend cooldown – ✅ fixed dependency
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null; }
      return;
    }
    cooldownRef.current = setInterval(() => setResendCooldown(v => v <= 1 ? 0 : v - 1), 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  // Friendly error mapper for SMS (now from server)
  const mapSmsError = useCallback((error: string): string => {
    if (error.includes('RequestRateLimitReached') || error.includes('rate limit') || error.includes('429')) {
      return isAr
        ? 'تم تجاوز عدد المحاولات. يرجى الانتظار دقيقة ثم المحاولة مجدداً.'
        : 'Too many attempts. Please wait a moment and try again.';
    }
    if (error.includes('invalid phone number') || error.includes('غير صالح')) {
      return isAr ? 'رقم الهاتف غير صحيح.' : 'Invalid phone number.';
    }
    if (error.includes('expired') || error.includes('انتهت')) {
      return isAr ? 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.' : 'Code expired. Please request a new one.';
    }
    if (error.includes('incorrect') || error.includes('غير صحيح')) {
      return isAr ? 'الرمز غير صحيح.' : 'Incorrect code.';
    }
    // Generic fallback
    return error || (isAr ? 'حدث خطأ، حاول مجدداً.' : 'An error occurred, please try again.');
  }, [isAr]);

  // ── Phone: Send code via Supabase Edge Function ──────────────────────────
  const handleSendPhoneCode = async () => {
    if (!phoneEulaAccepted) {
      return showAlert(
        isAr ? 'الموافقة مطلوبة' : 'Agreement Required',
        isAr ? 'يجب الموافقة على شروط الاستخدام وسياسة الخصوصية للمتابعة' : 'You must agree to the Terms of Use and Privacy Policy to continue'
      );
    }
    const digits = phoneNumber.trim().replace(/[\s\-()]/g, '');
    const stripped = digits.replace(/^0+/, '');
    if (!stripped || stripped.length < 7 || stripped.length > 12)
      return showAlert(
        isAr ? 'رقم غير صحيح' : 'Invalid Number',
        isAr ? 'أدخل رقم الهاتف بدون رمز الدولة — مثال: 591234567' : 'Enter your number without country code — e.g. 591234567'
      );

    const fullPhone = digits.startsWith('+') ? digits : (countryCode + stripped);

    if (phoneLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setPhoneLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('sms-auth', {
        body: { action: 'send_otp', phone: fullPhone },
      });
      if (error) {
        let msg = error.message;
        try {
          const { FunctionsHttpError } = await import('@supabase/supabase-js');
          if (error instanceof FunctionsHttpError) msg = await error.context?.text() || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || (isAr ? 'فشل إرسال الرمز' : 'Failed to send code'));

      setFullPhoneForOtp(fullPhone);
      setPhoneStep('otp');
      setPhoneResend(60);
    } catch (e: any) {
      const friendly = mapSmsError(e?.message || '');
      showAlert(isAr ? 'خطأ' : 'Error', friendly);
    } finally {
      setPhoneLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // ── Phone: Verify OTP via Supabase Edge Function ──────────────────────────
  const handleVerifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length < 6)
      return showAlert(isAr ? 'الرمز مطلوب' : 'Code Required', isAr ? 'أدخل رمز التحقق المكون من 6 أرقام' : 'Enter the 6-digit code');
    if (!fullPhoneForOtp)
      return showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'أعد إرسال الرمز' : 'Please resend the code');
    if (phoneLoading) return;
    setPhoneLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('sms-auth', {
        body: { action: 'verify_otp', phone: fullPhoneForOtp, otp: phoneOtp.trim() },
      });
      if (error) {
        let msg = error.message;
        try {
          const { FunctionsHttpError } = await import('@supabase/supabase-js');
          if (error instanceof FunctionsHttpError) msg = await error.context?.text() || msg;
        } catch {}
        throw new Error(msg);
      }
      if (data?.session) {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessErr) throw new Error(sessErr.message);

        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', data.session.user?.id || data.user?.id || '')
            .maybeSingle();
          const hasName = profile?.username && profile.username.trim().length > 0;
          if (hasName) router.replace('/(tabs)');
          else router.replace('/complete-profile');
        } catch {
          router.replace('/(tabs)');
        }
      } else {
        throw new Error(data?.error || 'No session returned');
      }
    } catch (e: any) {
      const friendly = mapSmsError(e?.message || (isAr ? 'فشل التحقق' : 'Verification failed'));
      showAlert(isAr ? 'فشل التحقق' : 'Verification Failed', friendly);
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Friendly error message mapper (email) ──────────────────────────────────
  const mapAuthError = useCallback((error: string): string => {
    if (error.includes('RequestRateLimitReached') || error.includes('rate limit') || error.includes('429')) {
      return isAr
        ? 'تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار دقيقة ثم المحاولة مجدداً.'
        : 'Too many attempts. Please wait a moment and try again.';
    }
    if (error.includes('Invalid login credentials') || error.includes('invalid_credentials')) {
      return isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Incorrect email or password.';
    }
    if (error.includes('Email not confirmed')) {
      return isAr ? 'يرجى تأكيد بريدك الإلكتروني أولاً.' : 'Please confirm your email first.';
    }
    if (error.includes('Failed to load user profile')) {
      return '';
    }
    return error;
  }, [isAr]);

  // ── Email: Login ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
    if (!isValidEmail(email)) return showAlert(isAr ? 'بريد غير صحيح' : 'Invalid Email', isAr ? 'أدخل بريداً إلكترونياً صحيحاً' : 'Enter a valid email address');
    if (operationLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error, user: u } = await signInWithPassword(email.trim().toLowerCase(), password);
      if (error) {
        if (error.includes('Failed to load user profile')) {
          router.replace('/(tabs)');
          return;
        }
        const friendlyError = mapAuthError(error);
        if (friendlyError) {
          showAlert(t.loginFailed, friendlyError);
          if (error.includes('RequestRateLimitReached') || error.includes('rate limit')) {
          }
        }
        return;
      }
      if (u) router.replace('/(tabs)');
    } finally { isSubmittingRef.current = false; }
  };

  // ── Email: Forgot password ────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) return showAlert(isAr ? 'البريد مطلوب' : 'Email Required', isAr ? 'أدخل بريدك الإلكتروني أولاً' : 'Enter your email first');
    if (!isValidEmail(email)) return showAlert(isAr ? 'بريد غير صحيح' : 'Invalid Email', isAr ? 'أدخل بريداً صحيحاً' : 'Enter a valid email');
    if (forgotLoading) return;
    setForgotLoading(true);
    try {
      const supabase = getSupabaseClient();
      const redirectTo = Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
        : 'souqqalqilya://auth/callback';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (error) showAlert(isAr ? 'خطأ' : 'Error', error.message);
      else setEmailMode('forgot_sent');
    } finally { setForgotLoading(false); }
  };

  // ── Email: Register (send OTP) ─────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!eulaAccepted) return showAlert(isAr ? 'الموافقة مطلوبة' : 'Agreement Required', t.eulaMustAgree);
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
    if (!isValidEmail(email)) return showAlert(isAr ? 'بريد غير صحيح' : 'Invalid Email', isAr ? 'أدخل بريداً صحيحاً' : 'Enter a valid email');
    if (password !== confirmPassword) return showAlert(t.passwordMismatch, t.passwordsDontMatch);
    if (password.length < 6) return showAlert(t.weakPassword, t.passwordMin6);
    if (operationLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) {
        const friendlyError = mapAuthError(error);
        return showAlert(isAr ? 'خطأ' : 'Error', friendlyError || error);
      }
      setEmailMode('otp');
      setResendCooldown(60);
    } finally { isSubmittingRef.current = false; }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) return showAlert('Error', error);
      setResendCooldown(60);
      showAlert(isAr ? 'تم الإرسال' : 'Code Sent', isAr ? 'تم إرسال رمز جديد' : 'A new code was sent to your email.');
    } finally { isSubmittingRef.current = false; }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 4) return showAlert(t.enterCode, t.enterCodeMsg);
    if (verifying) return;
    setVerifying(true);
    try {
      const { error, user: newUser } = await verifyOTPAndLogin(email.trim(), otp.trim(), { password });
      if (error) {
        if (error.includes('Failed to load user profile')) {
          router.replace('/(tabs)');
          return;
        }
        const friendlyError = mapAuthError(error);
        showAlert(t.verificationFailed, friendlyError || error);
      } else if (newUser) {
        router.replace('/(tabs)');
      }
    } finally { setVerifying(false); }
  };

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  const handleGoogleSignIn = useCallback(async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    // تنظيف أي موارد سابقة
    cleanupGoogleAuth();
    authResolvedRef.current = false;

    const supabase = getSupabaseClient();

    if (Platform.OS === 'web') {
      try {
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: false, queryParams: { prompt: 'select_account', access_type: 'offline' } } });
        if (error) showAlert(isAr ? 'خطأ' : 'Error', error.message);
      } catch (e: any) {
        showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Google sign-in failed');
      } finally { setGoogleLoading(false); }
      return;
    }

    // ── Native: setup auth listener ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (authResolvedRef.current) return;
      if (event === 'SIGNED_IN' && session) {
        authResolvedRef.current = true;
        cleanupGoogleAuth();
        setGoogleLoading(false);
        router.replace('/(tabs)');
      }
    });
    subscriptionRef.current = subscription;

    try {
      const redirectTo = 'souqqalqilya://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account', access_type: 'offline' } } });
      if (error || !data?.url) {
        cleanupGoogleAuth();
        showAlert(isAr ? 'خطأ' : 'Error', error?.message ?? (isAr ? 'تعذّر الاتصال بـ Google' : 'Could not connect to Google'));
        setGoogleLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo) as { type: string; url?: string };

      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const params = new URLSearchParams(parsed.searchParams);
        if (parsed.hash?.startsWith('#')) new URLSearchParams(parsed.hash.slice(1)).forEach((v, k) => params.set(k, v));
        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');

        if (errorParam) {
          cleanupGoogleAuth();
          showAlert(isAr ? 'خطأ Google' : 'Google Error', `${errorParam}: ${errorDesc ?? ''}`);
          setGoogleLoading(false);
          return;
        }

        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchErr && !authResolvedRef.current) {
            authResolvedRef.current = true;
            cleanupGoogleAuth();
            setGoogleLoading(false);
            router.replace('/(tabs)');
            return;
          }
          if (exchErr && !authResolvedRef.current) {
            cleanupGoogleAuth();
            showAlert(isAr ? 'خطأ' : 'Error', exchErr.message);
            setGoogleLoading(false);
            return;
          }
        } else {
          const at = params.get('access_token'), rt = params.get('refresh_token');
          if (at && rt && !authResolvedRef.current) {
            const { error: sessErr } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
            if (sessErr && !authResolvedRef.current) {
              cleanupGoogleAuth();
              showAlert(isAr ? 'خطأ' : 'Error', sessErr.message);
              setGoogleLoading(false);
              return;
            }
          }
        }
        // إذا لم يتم الحل، نبدأ الـ poll
        if (!authResolvedRef.current) {
          let attempts = 0;
          pollRef.current = setInterval(async () => {
            attempts++;
            const { data: { session } } = await supabase.auth.getSession();
            if (session && !authResolvedRef.current) {
              authResolvedRef.current = true;
              cleanupGoogleAuth();
              setGoogleLoading(false);
              router.replace('/(tabs)');
            } else if (attempts >= 10 && !authResolvedRef.current) {
              cleanupGoogleAuth();
              setGoogleLoading(false);
              showAlert(isAr ? 'لم يكتمل' : 'Not completed', isAr ? 'يرجى المحاولة مجدداً' : 'Please try again.');
            }
          }, 1500);
        }
        return;
      }

      // إذا لم يكن success، نحاول الـ poll
      if (!authResolvedRef.current) {
        let attempts = 0;
        pollRef.current = setInterval(async () => {
          attempts++;
          const { data: { session } } = await supabase.auth.getSession();
          if (session && !authResolvedRef.current) {
            authResolvedRef.current = true;
            cleanupGoogleAuth();
            setGoogleLoading(false);
            router.replace('/(tabs)');
          } else if (attempts >= 10 && !authResolvedRef.current) {
            cleanupGoogleAuth();
            setGoogleLoading(false);
            showAlert(isAr ? 'لم يكتمل' : 'Not completed', isAr ? 'يرجى المحاولة مجدداً' : 'Please try again.');
          }
        }, 1500);
      }
    } catch (e: any) {
      cleanupGoogleAuth();
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Google sign-in failed');
      setGoogleLoading(false);
    }
  }, [cleanupGoogleAuth, googleLoading, isAr, router, showAlert]);

  // ── Segment tab widths for iOS only ──────────────────────────────────────
  const segW = (cardMaxW - 32) / 2;

  // ── Handler for phone resend ──────────────────────────────────────────────
  const handleResendPhone = useCallback(() => {
    setPhoneOtp('');
    setFullPhoneForOtp('');
    setPhoneStep('input');
    isSubmittingRef.current = false;
  }, []);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? '#0A0F0D' : '#0A6E5C'} />

      <Modal visible={verifying} transparent animationType="none" statusBarTranslucent>
        <View style={s.overlay}>
          <View style={[s.overlayBox, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.overlayText, { color: colors.textPrimary }]}>{isAr ? 'جارٍ التحقق...' : 'Verifying...'}</Text>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={[s.scroll, { backgroundColor: isDark ? '#0A0F0D' : '#0A6E5C' }]}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Language switcher ── */}
        <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.langRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            {(['ar', 'en'] as Language[]).map(lang => (
              <Pressable
                key={lang}
                style={[s.langPill, language === lang ? s.langPillActive : s.langPillInactive]}
                onPress={() => setLanguage(lang)}
              >
                <Text style={[s.langText, { color: language === lang ? '#0A6E5C' : 'rgba(255,255,255,0.8)' }]}>
                  {lang === 'en' ? 'EN' : 'ع'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Hero / Logo ── */}
        <View style={[s.hero, { alignSelf: 'center', maxWidth: cardMaxW, width: '100%' }]}>
          <View style={s.logoOuter}>
            <Image source={require('@/assets/images/app-logo-bg.png')} style={s.logoImg} contentFit="cover" transition={200} />
            <View style={s.logoGlow} />
          </View>
          <Text style={[s.heroTitle, isAr && { fontFamily: undefined }]}>{isAr ? APP_NAME_AR : APP_NAME}</Text>
          <Text style={s.heroSub}>{isAr ? 'اشتري وبيع في قلقيلية' : 'Buy & Sell in Qalqilya'}</Text>
        </View>

        {/* ── Main Card ── */}
        <Animated.View
          style={[
            s.card,
            { backgroundColor: colors.surface, alignSelf: 'center', maxWidth: cardMaxW, width: '100%' },
            { transform: [{ translateY: cardY }], opacity: cardOpacity },
          ]}
        >

          {/* ══════════════════════════════════════════════════════
              Segmented control — Phone / Email (visible on all platforms)
          ══════════════════════════════════════════════════════ */}
          {showPhoneTab ? (
            <View style={[s.segmentWrap, { backgroundColor: isDark ? colors.background : '#F1F5F9' }]}>
              {/* Sliding pill indicator */}
              <Animated.View
                style={[
                  s.segmentPill,
                  { backgroundColor: colors.primary, width: segW },
                  {
                    transform: [{
                      translateX: tabIndicator.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, segW],
                      }),
                    }],
                  },
                ]}
              />
              {/* Phone button */}
              <Pressable
                style={[s.segmentBtn, { width: segW }]}
                onPress={() => { switchTab('phone'); setPhoneStep('input'); }}
              >
                <MaterialIcons
                  name="smartphone"
                  size={15}
                  color={activeTab === 'phone' ? '#fff' : colors.textMuted}
                />
                <Text style={[s.segmentBtnText, { color: activeTab === 'phone' ? '#fff' : colors.textMuted }]}>
                  {isAr ? 'رقم الهاتف' : 'Phone'}
                </Text>
              </Pressable>
              {/* Email button */}
              <Pressable
                style={[s.segmentBtn, { width: segW }]}
                onPress={() => { switchTab('email'); setEmailMode('login'); }}
              >
                <MaterialIcons
                  name="email"
                  size={15}
                  color={activeTab === 'email' ? '#fff' : colors.textMuted}
                />
                <Text style={[s.segmentBtnText, { color: activeTab === 'email' ? '#fff' : colors.textMuted }]}>
                  {isAr ? 'البريد الإلكتروني' : 'Email'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════
              Phone panel
          ══════════════════════════════════════════════════════ */}
          {showPhoneTab && activeTab === 'phone' ? (
            phoneStep === 'input' ? (
              <PhoneInputPanel
                phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber}
                countryCode={countryCode} setCountryCode={setCountryCode}
                loading={phoneLoading} onSend={handleSendPhoneCode}
                eulaAccepted={phoneEulaAccepted} setEulaAccepted={setPhoneEulaAccepted}
                onOpenEula={() => setEulaModalVisible(true)}
                colors={colors} isAr={isAr} router={router}
              />
            ) : (
              <PhoneOtpPanel
                phoneNumber={fullPhoneForOtp || (countryCode + phoneNumber)}
                otp={phoneOtp} setOtp={setPhoneOtp}
                resendCooldown={phoneResend} loading={phoneLoading}
                onVerify={handleVerifyPhoneOtp}
                onResend={handleResendPhone}
                onBack={() => { setPhoneStep('input'); }}
                colors={colors} isAr={isAr}
              />
            )
          ) : null}

          {/* ══════════════════════════════════════════════════════
              Email panel
          ══════════════════════════════════════════════════════ */}
          {activeTab === 'email' ? (
            <>
              {emailMode === 'login' ? (
                <LoginPanel
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                  showPassword={showPassword} togglePassword={() => setShowPassword(v => !v)}
                  loading={operationLoading} onLogin={handleLogin}
                  onForgot={() => setEmailMode('forgot')}
                  cooldown={loginCooldown}
                  colors={colors} t={t} isAr={isAr}
                />
              ) : emailMode === 'register' ? (
                <RegisterPanel
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                  confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
                  showPassword={showPassword} togglePassword={() => setShowPassword(v => !v)}
                  showConfirmPassword={showConfirmPassword} toggleConfirmPassword={() => setShowConfirmPassword(v => !v)}
                  eulaAccepted={eulaAccepted} setEulaAccepted={setEulaAccepted}
                  onOpenEula={() => setEulaModalVisible(true)}
                  loading={operationLoading} onSend={handleSendOTP}
                  colors={colors} t={t} isAr={isAr} router={router}
                />
              ) : emailMode === 'otp' ? (
                <OtpPanel
                  email={email} otp={otp} setOtp={setOtp}
                  resendCooldown={resendCooldown} loading={operationLoading}
                  verifying={verifying}
                  onVerify={handleVerifyOTP} onResend={handleResendOTP}
                  onBack={() => setEmailMode('register')}
                  colors={colors} t={t} isAr={isAr}
                />
              ) : emailMode === 'forgot' ? (
                <ForgotPanel
                  email={email} setEmail={setEmail}
                  loading={forgotLoading} onSend={handleForgotPassword}
                  onBack={() => setEmailMode('login')}
                  colors={colors} isAr={isAr}
                />
              ) : emailMode === 'forgot_sent' ? (
                <ForgotSentPanel email={email} onBack={() => setEmailMode('login')} colors={colors} isAr={isAr} />
              ) : null}

              {(emailMode === 'login' || emailMode === 'register') ? (
                <View style={[s.switcherRow, { borderTopColor: colors.border }]}>
                  <Text style={[s.switcherText, { color: colors.textMuted }]}>
                    {emailMode === 'login'
                      ? (isAr ? 'ليس لديك حساب؟ ' : "Don't have an account? ")
                      : (isAr ? 'لديك حساب؟ ' : 'Already have an account? ')}
                  </Text>
                  <Pressable onPress={() => setEmailMode(emailMode === 'login' ? 'register' : 'login')} hitSlop={8}>
                    <Text style={[s.switcherLink, { color: colors.primary }]}>
                      {emailMode === 'login' ? (isAr ? 'إنشاء حساب' : 'Register') : (isAr ? 'تسجيل الدخول' : 'Sign In')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* ── Android-only Google button ── */}
              {Platform.OS === 'android' && (emailMode === 'login' || emailMode === 'register') ? (
                <View style={[s.inCardGoogle, { borderTopColor: colors.borderLight }]}>
                  <View style={s.inCardDividerRow}>
                    <View style={[s.inCardDivLine, { backgroundColor: colors.borderLight }]} />
                    <Text style={[s.inCardDivText, { color: colors.textMuted }]}>{isAr ? 'أو تابع بـ' : 'or continue with'}</Text>
                    <View style={[s.inCardDivLine, { backgroundColor: colors.borderLight }]} />
                  </View>

                  <View style={s.googleBadgeWrap} pointerEvents="none">
                    <Animated.View style={[s.googleBadge, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity }]}>
                      <Text style={s.googleBadgeText}>{isAr ? 'سجل الدخول من هنا أسرع ⚡' : 'Fastest sign-in option ⚡'}</Text>
                      <View style={s.badgeArrow} />
                    </Animated.View>
                  </View>

                  <View style={s.googleGradientBorder}>
                    <LinearGradient
                      colors={['#4285F4', '#EA4335', '#FBBC05', '#34A853']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <SocialButton
                      icon={<GoogleG />}
                      label={isAr ? 'متابعة بـ Google' : 'Continue with Google'}
                      loading={googleLoading}
                      onPress={handleGoogleSignIn}
                      style={[s.googleBtnInCard, { borderWidth: 0, margin: 2 }]}
                      labelStyle={{ color: colors.textPrimary, fontWeight: '700' as const, fontSize: FontSize.md }}
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </Animated.View>

        {/* ── iOS-only hidden buttons (kept for compatibility) ── */}
        {Platform.OS === 'ios' ? (
          <View style={{ display: 'none' }}>
            <SocialButton
              icon={<GoogleG />}
              label={isAr ? 'متابعة بـ Google' : 'Continue with Google'}
              loading={googleLoading}
              onPress={handleGoogleSignIn}
            />
          </View>
        ) : null}

      </ScrollView>

      <EulaModal
        visible={eulaModalVisible}
        onClose={() => setEulaModalVisible(false)}
        onAccept={() => { setEulaAccepted(true); setPhoneEulaAccepted(true); setEulaModalVisible(false); }}
        colors={colors} t={t} isAr={isAr}
      />
    </KeyboardAvoidingView>
  );
}

// ── Country code options ──────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+970' as const, flag: '🇵🇸', label: 'فلسطين / Palestine' },
  { code: '+972' as const, flag: '🇮🇱', label: 'إسرائيل / Israel' },
];

// ─── Phone Input Panel ────────────────────────────────────────────────────────
const PhoneInputPanel = React.memo(function PhoneInputPanel({
  phoneNumber, setPhoneNumber, countryCode, setCountryCode,
  loading, eulaAccepted, setEulaAccepted, onOpenEula, onSend,
  colors, isAr, router
}: any) {
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) ?? COUNTRY_CODES[0];

  const handleToggleEula = useCallback(() => {
    setEulaAccepted(!eulaAccepted);
  }, [eulaAccepted, setEulaAccepted]);

  const handleOpenPicker = useCallback(() => {
    setShowCountryPicker(true);
  }, []);

  const handleClosePicker = useCallback(() => {
    setShowCountryPicker(false);
  }, []);

  const handleSelectCountry = useCallback((code: '+970' | '+972') => {
    setCountryCode(code);
    setShowCountryPicker(false);
  }, [setCountryCode]);

  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <View style={[s.panelIconWrap, { backgroundColor: '#E8F0FE' }]}>
          <MaterialIcons name="phone-iphone" size={28} color="#1A73E8" />
        </View>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{isAr ? 'الدخول عبر رقم الهاتف' : 'Sign in via Phone'}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{isAr ? 'سيصلك رمز تحقق مكون من 6 أرقام عبر SMS' : 'You will receive a 6-digit code via SMS'}</Text>
      </View>

      <View style={[s.phoneRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable style={[s.countryTag, { borderRightColor: colors.border }]} onPress={handleOpenPicker}>
          <Text style={s.flagEmoji}>{selectedCountry.flag}</Text>
          <Text style={[s.countryCode, { color: colors.primary }]}>{selectedCountry.code}</Text>
          <MaterialIcons name="arrow-drop-down" size={16} color={colors.textMuted} />
        </Pressable>
        <TextInput
          style={[s.phoneInput, { color: colors.textPrimary }]}
          placeholder="591234567"
          placeholderTextColor={colors.textMuted}
          value={phoneNumber}
          onChangeText={v => setPhoneNumber(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          autoFocus
          returnKeyType="send"
          onSubmitEditing={onSend}
          maxLength={12}
        />
      </View>

      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={handleClosePicker}>
        <Pressable style={s.pickerOverlay} onPress={handleClosePicker}>
          <View style={[s.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[s.pickerHeader, { borderBottomColor: colors.border }]}>
              <View style={[s.eulaSheetHandle, { backgroundColor: colors.border }]} />
              <Text style={[s.panelTitle, { color: colors.textPrimary, fontSize: 16 }]}>{isAr ? 'اختر رمز الدولة' : 'Select Country Code'}</Text>
            </View>
            {COUNTRY_CODES.map(c => (
              <Pressable
                key={c.code}
                style={[s.pickerOption, { borderBottomColor: colors.borderLight }, c.code === countryCode && { backgroundColor: colors.primaryGhost }]}
                onPress={() => handleSelectCountry(c.code)}
              >
                <Text style={s.pickerFlag}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.pickerLabel, { color: colors.textPrimary }]}>{c.label}</Text>
                </View>
                <Text style={[s.pickerCode, { color: colors.primary }]}>{c.code}</Text>
                {c.code === countryCode ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Text style={[s.phoneHint, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
        {isAr ? 'أدخل الرقم بدون صفر أو رمز الدولة — مثال: 591234567' : 'Enter number without 0 or country code — e.g. 591234567'}
      </Text>

      <View style={[s.waBanner, { backgroundColor: '#E8F0FE', borderColor: '#1A73E8' }]}>
        <MaterialIcons name="sms" size={16} color="#1A73E8" />
        <Text style={[s.waBannerText, { color: '#1558B0' }]}>{isAr ? 'سيصلك رمز التحقق عبر رسالة نصية SMS' : 'You will receive a verification code via SMS'}</Text>
      </View>

      <Pressable style={[s.eulaRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleToggleEula}>
        <View style={[s.eulaCheck, { borderColor: eulaAccepted ? colors.primary : colors.border, backgroundColor: eulaAccepted ? colors.primary : 'transparent' }]}>
          {eulaAccepted ? <MaterialIcons name="check" size={11} color="#fff" /> : null}
        </View>
        <Text style={[s.eulaText, { color: colors.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
          {isAr ? 'أوافق على ' : 'I agree to the '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={onOpenEula}>{isAr ? 'شروط الاستخدام' : 'Terms of Use'}</Text>
          {isAr ? ' و' : ' and '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={() => router.push('/privacy')}>{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</Text>
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [s.primaryBtn, { backgroundColor: (loading || !eulaAccepted) ? colors.textMuted : colors.primary, opacity: pressed ? 0.85 : 1 }]}
        onPress={onSend}
        disabled={loading || !eulaAccepted}
      >
        {loading ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name="send" size={16} color="#fff" /><Text style={s.primaryBtnText}>{isAr ? 'إرسال رمز SMS' : 'Send SMS Code'}</Text></>
        )}
      </Pressable>
    </View>
  );
});

// ─── Phone OTP Panel ──────────────────────────────────────────────────────────
const PhoneOtpPanel = React.memo(function PhoneOtpPanel({
  phoneNumber, otp, setOtp, resendCooldown, loading,
  onVerify, onResend, onBack, colors, isAr
}: any) {
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleDigitChange = (idx: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    if (cleaned.length > 1) {
      const full = cleaned.slice(0, 6);
      setOtp(full);
      inputRefs.current[Math.min(full.length - 1, 5)]?.focus();
      return;
    }
    const arr = (otp + '      ').slice(0, 6).split('');
    arr[idx] = cleaned || ' ';
    const newOtp = arr.join('').trimEnd();
    setOtp(newOtp);
    if (cleaned && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace') {
      const arr = (otp + '      ').slice(0, 6).split('');
      if (!arr[idx]?.trim() && idx > 0) {
        arr[idx - 1] = ' ';
        setOtp(arr.join('').trimEnd());
        inputRefs.current[idx - 1]?.focus();
      } else {
        arr[idx] = ' ';
        setOtp(arr.join('').trimEnd());
      }
    }
  };

  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <View style={[s.panelIconWrap, { backgroundColor: '#E8F0FE' }]}>
          <MaterialIcons name="sms" size={28} color="#1A73E8" />
        </View>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{isAr ? 'رمز SMS' : 'SMS Code'}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{isAr ? 'تم إرسال رمز التحقق عبر SMS إلى' : 'SMS verification code sent to'}</Text>
        <View style={[s.phonePill, { backgroundColor: '#E8F0FE' }]}>
          <MaterialIcons name="phone" size={13} color="#1A73E8" />
          <Text style={[s.phonePillText, { color: '#1A73E8' }]}>{phoneNumber}</Text>
        </View>
      </View>

      <View style={s.otpBoxRow}>
        {Array.from({ length: 6 }).map((_, idx) => {
          const digit = otp[idx] ?? '';
          const isFilled = !!digit;
          return (
            <TextInput
              key={idx}
              ref={r => { inputRefs.current[idx] = r; }}
              style={[s.otpBox, { borderColor: isFilled ? colors.primary : colors.border, backgroundColor: isFilled ? colors.primaryGhost : colors.background, color: colors.textPrimary }]}
              value={digit}
              onChangeText={v => handleDigitChange(idx, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(idx, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              selectTextOnFocus
              autoFocus={idx === 0}
            />
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 }]}
        onPress={onVerify}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name="verified-user" size={16} color="#fff" /><Text style={s.primaryBtnText}>{isAr ? 'تحقق وتسجيل الدخول' : 'Verify & Sign In'}</Text></>
        )}
      </Pressable>

      <View style={s.resendRow}>
        <Pressable style={s.resendBtn} onPress={onResend} disabled={resendCooldown > 0} hitSlop={8}>
          <MaterialIcons name="refresh" size={14} color={resendCooldown > 0 ? colors.textMuted : colors.primary} />
          <Text style={[s.resendText, { color: resendCooldown > 0 ? colors.textMuted : colors.primary }]}>
            {resendCooldown > 0 ? (isAr ? `إعادة الإرسال (${resendCooldown}ث)` : `Resend (${resendCooldown}s)`) : (isAr ? 'إعادة الإرسال' : 'Resend Code')}
          </Text>
        </Pressable>
        <Pressable style={s.resendBtn} onPress={onBack} hitSlop={8}>
          <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={14} color={colors.textMuted} />
          <Text style={[s.resendText, { color: colors.textMuted }]}>{isAr ? 'تغيير الرقم' : 'Change Number'}</Text>
        </Pressable>
      </View>
    </View>
  );
});

// ─── Login Panel ──────────────────────────────────────────────────────────────
const LoginPanel = React.memo(function LoginPanel({
  email, setEmail, password, setPassword, showPassword, togglePassword,
  loading, onLogin, onForgot, cooldown, colors, t, isAr
}: any) {
  const isDisabled = loading || (cooldown ?? 0) > 0;

  const passwordRightElement = useMemo(() => (
    <Pressable onPress={togglePassword} hitSlop={8}>
      <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={18} color={colors.textMuted} />
    </Pressable>
  ), [showPassword, togglePassword, colors.textMuted]);

  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{t.welcomeBack}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{t.signInAccount}</Text>
      </View>
      <PremiumInput
        label={t.emailAddress + ' *'}
        placeholder={t.emailPlaceholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        iconName="email"
        colors={colors}
      />
      <PremiumInput
        label={t.password + ' *'}
        placeholder={t.passwordPlaceholder}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        iconName="lock"
        rightElement={passwordRightElement}
        colors={colors}
      />
      <Pressable style={[s.forgotLink, { alignSelf: isAr ? 'flex-start' : 'flex-end', marginTop: -6 }]} onPress={onForgot} hitSlop={8}>
        <Text style={[s.forgotText, { color: colors.primary }]}>{isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</Text>
      </Pressable>
      {(cooldown ?? 0) > 0 ? (
        <View style={[s.rateLimitBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <MaterialIcons name="timer" size={15} color="#D97706" />
          <Text style={s.rateLimitText}>
            {isAr
              ? `تم تجاوز عدد المحاولات. انتظر ${cooldown}ث ثم حاول مجدداً.`
              : `Too many attempts. Wait ${cooldown}s before trying again.`}
          </Text>
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [s.primaryBtn, { backgroundColor: isDisabled ? colors.textMuted : colors.primary, opacity: pressed ? 0.85 : 1 }]}
        onPress={onLogin}
        disabled={isDisabled}
      >
        {loading ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name={isDisabled && !loading ? 'timer' : 'login'} size={16} color="#fff" />
          <Text style={s.primaryBtnText}>
            {(cooldown ?? 0) > 0 ? (isAr ? `انتظر (${cooldown}ث)` : `Wait (${cooldown}s)`) : t.signIn}
          </Text></>
        )}
      </Pressable>
    </View>
  );
});

// ─── Register Panel ───────────────────────────────────────────────────────────
const RegisterPanel = React.memo(function RegisterPanel({
  email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
  showPassword, togglePassword, showConfirmPassword, toggleConfirmPassword,
  eulaAccepted, setEulaAccepted, onOpenEula, loading, onSend,
  colors, t, isAr, router
}: any) {
  const passwordRightElement = useMemo(() => (
    <Pressable onPress={togglePassword} hitSlop={8}>
      <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={18} color={colors.textMuted} />
    </Pressable>
  ), [showPassword, togglePassword, colors.textMuted]);

  const confirmPasswordRightElement = useMemo(() => (
    <Pressable onPress={toggleConfirmPassword} hitSlop={8}>
      <MaterialIcons name={showConfirmPassword ? 'visibility' : 'visibility-off'} size={18} color={colors.textMuted} />
    </Pressable>
  ), [showConfirmPassword, toggleConfirmPassword, colors.textMuted]);

  const handleToggleEula = useCallback(() => {
    setEulaAccepted((v: boolean) => !v);
  }, [setEulaAccepted]);

  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{t.createAccount}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{t.joinToBuySell}</Text>
      </View>
      {Platform.OS === 'android' ? (
        <View style={[s.spamWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <MaterialIcons name="warning" size={14} color="#D97706" />
          <Text style={s.spamWarningText}>
            {isAr
              ? 'قد يصل رمز التحقق لمجلد السبام. يُنصح باستخدام Google بدلاً.'
              : 'OTP may go to Spam. Using Google Sign-In is recommended.'}
          </Text>
        </View>
      ) : null}
      <PremiumInput
        label={t.emailAddress + ' *'}
        placeholder={t.emailPlaceholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        iconName="email"
        colors={colors}
      />
      <PremiumInput
        label={t.password + ' *'}
        placeholder={t.minPassword}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        iconName="lock"
        rightElement={passwordRightElement}
        colors={colors}
      />
      <PremiumInput
        label={t.confirmPassword + ' *'}
        placeholder={t.repeatPassword}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!showConfirmPassword}
        iconName="lock-outline"
        rightElement={confirmPasswordRightElement}
        colors={colors}
      />
      <Pressable style={[s.eulaRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleToggleEula}>
        <View style={[s.eulaCheck, { borderColor: eulaAccepted ? colors.primary : colors.border, backgroundColor: eulaAccepted ? colors.primary : 'transparent' }]}>
          {eulaAccepted ? <MaterialIcons name="check" size={11} color="#fff" /> : null}
        </View>
        <Text style={[s.eulaText, { color: colors.textSecondary, textAlign: isAr ? 'right' : 'left' }]}>
          {t.eulaAgree + ' '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={onOpenEula}>{t.eulaTerms}</Text>
          {' ' + t.eulaAnd + ' '}
          <Text style={[s.eulaHighlight, { color: colors.primary }]} onPress={() => router.push('/privacy')}>{t.eulaPrivacy}</Text>
        </Text>
      </Pressable>
      <Pressable style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 }]} onPress={onSend} disabled={loading}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name="person-add" size={16} color="#fff" /><Text style={s.primaryBtnText}>{t.continueCode}</Text></>
        )}
      </Pressable>
    </View>
  );
});

// ─── OTP Panel ────────────────────────────────────────────────────────────────
const OtpPanel = React.memo(function OtpPanel({
  email, otp, setOtp, resendCooldown, loading, verifying,
  onVerify, onResend, onBack, colors, t, isAr
}: any) {
  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <View style={[s.panelIconWrap, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="mark-email-unread" size={28} color={colors.primary} />
        </View>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{t.checkEmail}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{t.codeSentTo}</Text>
        <View style={[s.phonePill, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="email" size={13} color={colors.primary} />
          <Text style={[s.phonePillText, { color: colors.primary }]} numberOfLines={1}>{email}</Text>
        </View>
      </View>
      <PremiumInput
        label={t.verificationCode + ' *'}
        placeholder="•  •  •  •"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={4}
        iconName="pin"
        colors={colors}
        inputStyle={{ textAlign: 'center', letterSpacing: 12, fontSize: FontSize.xl, fontWeight: '800' }}
      />
      <Pressable
        style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 }]}
        onPress={onVerify}
        disabled={loading || verifying}
      >
        {loading || verifying ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name="verified" size={16} color="#fff" /><Text style={s.primaryBtnText}>{t.verifyCreate}</Text></>
        )}
      </Pressable>
      <View style={s.resendRow}>
        <Pressable style={s.resendBtn} onPress={onResend} disabled={resendCooldown > 0} hitSlop={8}>
          <MaterialIcons name="refresh" size={14} color={resendCooldown > 0 ? colors.textMuted : colors.primary} />
          <Text style={[s.resendText, { color: resendCooldown > 0 ? colors.textMuted : colors.primary }]}>
            {resendCooldown > 0 ? (isAr ? `إعادة الإرسال (${resendCooldown}ث)` : `Resend (${resendCooldown}s)`) : (isAr ? 'إعادة الإرسال' : 'Resend Code')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// ─── Forgot Panel ─────────────────────────────────────────────────────────────
const ForgotPanel = React.memo(function ForgotPanel({
  email, setEmail, loading, onSend, onBack, colors, isAr
}: any) {
  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <View style={[s.panelIconWrap, { backgroundColor: '#FEF3C7' }]}>
          <MaterialIcons name="lock-reset" size={28} color="#D97706" />
        </View>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{isAr ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{isAr ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط استرداد' : 'Enter your email and we will send a reset link'}</Text>
      </View>
      <PremiumInput
        label={isAr ? 'البريد الإلكتروني *' : 'Email Address *'}
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        iconName="email"
        colors={colors}
      />
      <Pressable style={({ pressed }) => [s.primaryBtn, { backgroundColor: '#D97706', opacity: pressed || loading ? 0.85 : 1 }]} onPress={onSend} disabled={loading}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : (
          <><MaterialIcons name="send" size={16} color="#fff" /><Text style={s.primaryBtnText}>{isAr ? 'إرسال رابط الاسترداد' : 'Send Reset Link'}</Text></>
        )}
      </Pressable>
      <Pressable style={[s.resendBtn, { justifyContent: 'center', paddingVertical: 8 }]} onPress={onBack} hitSlop={8}>
        <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={14} color={colors.primary} />
        <Text style={[s.resendText, { color: colors.primary }]}>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</Text>
      </Pressable>
    </View>
  );
});

// ─── Forgot Sent Panel ────────────────────────────────────────────────────────
const ForgotSentPanel = React.memo(function ForgotSentPanel({
  email, onBack, colors, isAr
}: any) {
  return (
    <View style={s.panelBody}>
      <View style={s.panelHeader}>
        <View style={[s.panelIconWrap, { backgroundColor: '#D1FAE5' }]}>
          <MaterialIcons name="check-circle" size={32} color="#10B981" />
        </View>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>{isAr ? 'تم الإرسال!' : 'Email Sent!'}</Text>
        <Text style={[s.panelSub, { color: colors.textMuted }]}>{isAr ? 'تم إرسال رابط استرداد كلمة المرور إلى' : 'A password reset link was sent to'}</Text>
        <View style={[s.phonePill, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="email" size={13} color={colors.primary} />
          <Text style={[s.phonePillText, { color: colors.primary }]} numberOfLines={1}>{email}</Text>
        </View>
        <Text style={[s.panelSub, { color: colors.textMuted, marginTop: 4 }]}>{isAr ? 'تحقق من صندوق الوارد أو مجلد السبام' : 'Check your inbox or spam folder'}</Text>
      </View>
      <Pressable style={[s.resendBtn, { justifyContent: 'center', paddingVertical: 8 }]} onPress={onBack} hitSlop={8}>
        <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={14} color={colors.primary} />
        <Text style={[s.resendText, { color: colors.primary }]}>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</Text>
      </Pressable>
    </View>
  );
});

// ─── Premium Input ────────────────────────────────────────────────────────────
const PremiumInput = React.memo(function PremiumInput({
  label, placeholder, value, onChangeText, keyboardType,
  autoCapitalize, autoCorrect, secureTextEntry, iconName,
  rightElement, colors, maxLength, inputStyle, onSubmitEditing
}: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.inputGroup}>
      <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[s.inputWrap, { borderColor: focused ? colors.primary : colors.border, backgroundColor: colors.background }, focused && { borderWidth: 1.5 }]}>
        <MaterialIcons name={iconName} size={16} color={focused ? colors.primary : colors.textMuted} style={s.inputIcon} />
        <TextInput
          style={[s.inputField, { color: colors.textPrimary }, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
        />
        {rightElement ? <View style={s.inputRight}>{rightElement}</View> : null}
      </View>
    </View>
  );
});

// ─── Social Button ─────────────────────────────────────────────────────────────
const SocialButton = React.memo(function SocialButton({
  icon, label, loading, onPress, style, labelStyle
}: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[s.socialBtnWrap, { transform: [{ scale }] }]}>
      <Pressable
        style={[s.socialBtn, style, loading && { opacity: 0.7 }]}
        onPress={onPress}
        disabled={loading}
        onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
      >
        {loading ? <ActivityIndicator size="small" color={labelStyle?.color ?? '#fff'} /> : icon}
        {!loading ? <Text style={[s.socialLabel, labelStyle]}>{label}</Text> : null}
      </Pressable>
    </Animated.View>
  );
});

// ─── Google G Icon (memoized) ─────────────────────────────────────────────────
const GoogleG = React.memo(function GoogleG() {
  return (
    <View style={googleGStyles.container}>
      <View style={googleGStyles.ring}>
        <View style={[googleGStyles.quadrant, googleGStyles.topLeft]} />
        <View style={[googleGStyles.quadrant, googleGStyles.topRight]} />
        <View style={[googleGStyles.quadrant, googleGStyles.bottomLeft]} />
        <View style={[googleGStyles.quadrant, googleGStyles.bottomRight]} />
      </View>
      <View style={googleGStyles.inner}>
        <Text style={googleGStyles.letter}>G</Text>
      </View>
    </View>
  );
});

const googleGStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  ring: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quadrant: {
    position: 'absolute',
    width: 12,
    height: 12,
  },
  topLeft: { top: 0, left: 0, backgroundColor: '#4285F4' },
  topRight: { top: 0, right: 0, backgroundColor: '#EA4335' },
  bottomLeft: { bottom: 0, left: 0, backgroundColor: '#34A853' },
  bottomRight: { bottom: 0, right: 0, backgroundColor: '#FBBC05' },
  inner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  letter: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4285F4',
    lineHeight: 14,
    includeFontPadding: false,
  },
});

// ─── EULA Modal ───────────────────────────────────────────────────────────────
function EulaModal({ visible, onClose, onAccept, colors, t, isAr }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.eulaOverlay}>
        <View style={[s.eulaSheet, { backgroundColor: colors.surface }]}>
          <View style={[s.eulaSheetHeader, { borderBottomColor: colors.border }]}>
            <View style={[s.eulaSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[s.eulaSheetTitle, { color: colors.textPrimary }]}>{isAr ? 'شروط الاستخدام' : 'Terms of Use'}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[s.eulaCloseBtn, { backgroundColor: colors.background }]}>
              <MaterialIcons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={s.eulaBody} showsVerticalScrollIndicator={false}>
            <Text style={[s.eulaBodyText, { color: colors.textSecondary }]}>{t.eulaContent}</Text>
          </ScrollView>
          <Pressable style={[s.eulaAcceptBtn, { backgroundColor: colors.primary }]} onPress={onAccept}>
            <MaterialIcons name="check-circle" size={16} color="#fff" />
            <Text style={s.eulaAcceptLabel}>{isAr ? 'أوافق وأقبل الشروط' : 'I Agree & Accept'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16 },
  topBar: { justifyContent: 'flex-end', marginBottom: Spacing.md, paddingTop: 4 },
  langRow: { gap: 6 },
  langPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 42 },
  langPillActive: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' },
  langPillInactive: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)' },
  langText: { fontSize: FontSize.sm, fontWeight: '700' },
  hero: { alignItems: 'center', paddingVertical: Spacing.lg, marginBottom: Spacing.lg },
  logoOuter: { width: 88, height: 88, borderRadius: 24, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 12, position: 'relative' },
  logoImg: { width: 88, height: 88, borderRadius: 24 },
  logoGlow: { position: 'absolute', top: -4, bottom: -4, left: -4, right: -4, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  card: { borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 16 },

  segmentWrap: {
    margin: 16,
    marginBottom: 0,
    borderRadius: Radius.lg,
    height: 50,
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 4,
  },
  segmentPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: Radius.md,
    shadowColor: '#0A6E5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  segmentBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  panelBody: { padding: Spacing.lg, gap: Spacing.md },
  panelHeader: { alignItems: 'center', gap: 6, marginBottom: 4 },
  panelIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  panelTitle: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  panelSub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, overflow: 'hidden', height: 54 },
  countryTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: '100%', borderRightWidth: 1, gap: 3 },
  flagEmoji: { fontSize: 18 },
  countryCode: { fontSize: FontSize.sm, fontWeight: '700' },
  phoneInput: { flex: 1, paddingHorizontal: 14, fontSize: FontSize.md, height: '100%' },
  phoneHint: { fontSize: FontSize.xs, marginTop: -6 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  pickerHeader: { alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, marginBottom: 8 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12, borderBottomWidth: 1 },
  pickerFlag: { fontSize: 28 },
  pickerLabel: { fontSize: FontSize.md, fontWeight: '600' },
  pickerCode: { fontSize: FontSize.md, fontWeight: '800' },
  otpBoxRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: { width: 44, height: 54, borderWidth: 1.5, borderRadius: Radius.md, fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center' },
  phonePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, maxWidth: '88%' },
  phonePillText: { fontSize: FontSize.sm, fontWeight: '600', flexShrink: 1 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: Radius.xl, shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 6 },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', letterSpacing: 0.2 },
  waBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: Radius.md, borderWidth: 1, marginTop: -4 },
  waBannerText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18, fontWeight: '500' },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  resendText: { fontSize: FontSize.sm, fontWeight: '600' },
  forgotLink: { paddingVertical: 4 },
  forgotText: { fontSize: FontSize.sm, fontWeight: '600' },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '600', marginLeft: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, height: 52, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, fontSize: FontSize.md, height: '100%' },
  inputRight: { paddingLeft: 8 },
  eulaRow: { alignItems: 'flex-start', gap: 10, marginTop: -4 },
  eulaCheck: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  eulaText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },
  eulaHighlight: { fontWeight: '700' },
  switcherRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, marginTop: -4 },
  switcherText: { fontSize: FontSize.sm },
  switcherLink: { fontSize: FontSize.sm, fontWeight: '700' },

  inCardGoogle: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm },
  inCardDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inCardDivLine: { flex: 1, height: 1 },
  inCardDivText: { fontSize: FontSize.xs, fontWeight: '600' },
  googleGradientBorder: {
    borderRadius: Radius.xl + 2,
    overflow: 'hidden',
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  googleBtnInCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 54, borderRadius: Radius.xl,
    backgroundColor: '#fff',
  },
  googleBadgeWrap: {
    alignItems: 'center',
    marginBottom: 6,
  },
  googleBadge: {
    backgroundColor: '#0A6E5C',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    shadowColor: '#0A6E5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
    marginBottom: 8,
  },
  googleBadgeText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  badgeArrow: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0A6E5C',
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 12, minWidth: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 8 },
  overlayText: { fontSize: FontSize.md, fontWeight: '600' },
  eulaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  eulaSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%' },
  eulaSheetHandle: { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  eulaSheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  eulaSheetTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', textAlign: 'center' },
  eulaCloseBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eulaBody: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  eulaBodyText: { fontSize: FontSize.sm, lineHeight: 24 },
  eulaAcceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: Spacing.lg, marginTop: Spacing.sm, paddingVertical: 14, borderRadius: Radius.xl },
  eulaAcceptLabel: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  spamWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: Radius.md, borderWidth: 1, marginTop: -4, marginBottom: -4 },
  spamWarningText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, fontWeight: '500', color: '#92400E' },
  rateLimitBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: Radius.md, borderWidth: 1 },
  rateLimitText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, fontWeight: '600', color: '#92400E' },
  socialBtnWrap: { flex: 1 },
  socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: Radius.xl },
  socialLabel: { fontSize: FontSize.sm, fontWeight: '700' },
});