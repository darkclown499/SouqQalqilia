import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, ActivityIndicator, Modal, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { Button, Input } from '@/components';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { APP_NAME, APP_NAME_AR } from '@/constants/config';
import type { Language } from '@/constants/i18n';

type Mode = 'login' | 'register' | 'otp';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithPassword, sendOTP, verifyOTPAndLogin, operationLoading } = useAuth();

  React.useEffect(() => {
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
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const googleScale = useRef(new Animated.Value(1)).current;

  const onGooglePressIn = useCallback(() => {
    Animated.spring(googleScale, { toValue: 0.96, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
  }, [googleScale]);
  const onGooglePressOut = useCallback(() => {
    Animated.spring(googleScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [googleScale]);

  // Countdown timer for resend button
  React.useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null; }
      return;
    }
    cooldownRef.current = setInterval(() => setResendCooldown(v => v <= 1 ? 0 : v - 1), 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown > 0]);

  const togglePassword = useCallback(() => setShowPassword(v => !v), []);
  const toggleConfirmPassword = useCallback(() => setShowConfirmPassword(v => !v), []);

  // ── Email Login ──
  const handleLogin = async () => {
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
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

  // ── Email Register: Send OTP ──
  const handleSendOTP = async () => {
    if (!email.trim() || !password) return showAlert(t.missingFields, t.fillAllFields);
    if (password !== confirmPassword) return showAlert(t.passwordMismatch, t.passwordsDontMatch);
    if (password.length < 6) return showAlert(t.weakPassword, t.passwordMin6);
    if (operationLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) return showAlert('Error', error);
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
      showAlert(isAr ? 'تم الإرسال' : 'Code Sent', isAr ? 'تم إرسال رمز جديد إلى بريدك الإلكتروني' : 'A new verification code was sent to your email.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Email Register: Verify OTP ──
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

    // ── WEB ──
    if (Platform.OS === 'web') {
      try {
        const redirectTo = typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : '';
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

    // ── MOBILE ──
    // Step 1: Register auth state listener BEFORE opening browser
    // This catches SIGNED_IN even if the deep link redirect isn't captured
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
      const redirectTo = 'onspaceapp://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account', access_type: 'offline' } },
      });

      if (error || !data?.url) {
        subscription.unsubscribe();
        showAlert(
          isAr ? 'خطأ في الاتصال' : 'Connection Error',
          error?.message ?? (isAr ? 'تعذّر الاتصال بـ Google' : 'Could not connect to Google')
        );
        setGoogleLoading(false);
        return;
      }

      // Step 2: Open browser
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo) as { type: string; url?: string };

      // Step 3: Handle direct success (deep link was captured — works on real APK)
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
        // onAuthStateChange will fire SIGNED_IN → handled above
        return;
      }

      // Step 4: Browser closed without deep link (preview env / Android)
      // Poll for session for up to 15 seconds — Supabase may have set it
      // via onAuthStateChange while the browser was open.
      if (!authResolved) {
        let attempts = 0;
        const maxAttempts = 10; // 10 × 1.5s = 15s
        const poll = setInterval(async () => {
          attempts++;
          const { data: { session } } = await supabase.auth.getSession();
          if (session && !authResolved) {
            authResolved = true;
            subscription.unsubscribe();
            clearInterval(poll);
            setGoogleLoading(false);
            router.replace('/(tabs)');
          } else if (attempts >= maxAttempts && !authResolved) {
            authResolved = true;
            subscription.unsubscribe();
            clearInterval(poll);
            setGoogleLoading(false);
            showAlert(
              isAr ? 'لم يكتمل تسجيل الدخول' : 'Sign-in not completed',
              isAr
                ? 'يرجى إكمال تسجيل الدخول في المتصفح والعودة للتطبيق، أو المحاولة مجدداً.'
                : 'Please complete sign-in in the browser and return to the app, or try again.'
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Modal visible={verifying} transparent animationType="none" statusBarTranslucent>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0A6E5C" />
            <Text style={styles.loadingText}>{isAr ? 'جارٍ التحقق...' : 'Verifying...'}</Text>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.primary }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language Selector */}
        <View style={[styles.langRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {(['en', 'ar'] as Language[]).map(lang => (
            <Pressable
              key={lang}
              style={[styles.langPill, language === lang ? { backgroundColor: 'rgba(255,255,255,0.9)' } : { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => setLanguage(lang)}
            >
              <MaterialIcons name="language" size={13} color={language === lang ? colors.primary : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.langPillText, { color: language === lang ? colors.primary : 'rgba(255,255,255,0.85)' }, language === lang && { fontWeight: '700' }]}>
                {lang === 'en' ? 'English' : 'العربية'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoRing}>
            <View style={styles.logo}>
              <MaterialIcons name="storefront" size={36} color="#fff" />
            </View>
          </View>
          <View style={styles.appNameHeroRow}>
            <Text style={styles.appName}>{isAr ? APP_NAME_AR : APP_NAME}</Text>
          </View>
          <Text style={styles.tagline}>{t.tagline}</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.lg }]}>
          {/* Login / Register tabs */}
          {mode !== 'otp' ? (
            <View style={[styles.tabs, { backgroundColor: colors.background }]}>
              {(['login', 'register'] as const).map(tab => (
                <Pressable
                  key={tab}
                  style={[styles.tab, mode === tab && [styles.tabActive, { backgroundColor: colors.primary, ...Shadow.colored }]]}
                  onPress={() => setMode(tab)}
                >
                  <Text style={[styles.tabText, { color: colors.textMuted }, mode === tab && styles.tabTextActive]}>
                    {tab === 'login' ? t.signIn : t.register}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {mode === 'otp' ? (
            <>
              <View style={styles.otpHeader}>
                <View style={[styles.otpIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="mark-email-unread" size={32} color={colors.primary} />
                </View>
                <Text style={[styles.otpTitle, { color: colors.textPrimary }]}>{t.checkEmail}</Text>
                <Text style={[styles.otpSub, { color: colors.textSecondary }]}>{t.codeSentTo}</Text>
                <Text style={[styles.otpEmail, { color: colors.primary }]}>{email}</Text>
              </View>
              <Input label={t.verificationCode} placeholder="0  0  0  0" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4} textAlign="center" returnKeyType="done" onSubmitEditing={handleVerifyOTP} />
              <Button label={t.verifyCreate} onPress={handleVerifyOTP} loading={operationLoading} size="lg" />
              <Pressable
                style={[styles.resendBtn, { opacity: resendCooldown > 0 ? 0.5 : 1 }]}
                onPress={handleResendOTP}
                disabled={resendCooldown > 0}
              >
                <MaterialIcons name="refresh" size={15} color={resendCooldown > 0 ? colors.textMuted : colors.primary} />
                <Text style={[styles.resendText, { color: resendCooldown > 0 ? colors.textMuted : colors.primary }]}>
                  {resendCooldown > 0
                    ? (isAr ? `إعادة الإرسال (${resendCooldown}ث)` : `Resend Code (${resendCooldown}s)`)
                    : (isAr ? 'إعادة إرسال الرمز' : 'Resend Code')}
                </Text>
              </Pressable>
              <Pressable style={styles.link} onPress={() => setMode('register')}>
                <Text style={[styles.linkText, { color: colors.primary }]}>{t.backToRegistration}</Text>
              </Pressable>
            </>
          ) : mode === 'login' ? (
            <>
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t.welcomeBack}</Text>
                <Text style={[styles.formSub, { color: colors.textMuted }]}>{t.signInAccount}</Text>
              </View>
              <Input label={t.emailAddress} placeholder={t.emailPlaceholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Input label={t.password} placeholder={t.passwordPlaceholder} value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
                rightElement={<Pressable onPress={togglePassword} hitSlop={8}><MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} /></Pressable>}
              />
              <Button label={t.signIn} onPress={handleLogin} loading={operationLoading} size="lg" />
            </>
          ) : (
            <>
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t.createAccount}</Text>
                <Text style={[styles.formSub, { color: colors.textMuted }]}>{t.joinToBuySell}</Text>
              </View>
              <Input label={t.emailAddress} placeholder={t.emailPlaceholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Input label={t.password} placeholder={t.minPassword} value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
                rightElement={<Pressable onPress={togglePassword} hitSlop={8}><MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} /></Pressable>}
              />
              <Input label={t.confirmPassword} placeholder={t.repeatPassword} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showConfirmPassword}
                rightElement={<Pressable onPress={toggleConfirmPassword} hitSlop={8}><MaterialIcons name={showConfirmPassword ? 'visibility' : 'visibility-off'} size={20} color={colors.textMuted} /></Pressable>}
              />
              <Button label={t.continueCode} onPress={handleSendOTP} loading={operationLoading} size="lg" />
            </>
          )}

          {mode !== 'otp' ? (
            <Text style={styles.footerHint}>
              {mode === 'login' ? t.noAccount : t.haveAccount}
              <Text style={styles.footerLink} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? t.register : t.signIn}
              </Text>
            </Text>
          ) : null}
        </View>

        {/* Google */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          <Text style={[styles.dividerText, { color: 'rgba(255,255,255,0.55)' }]}>{isAr ? 'أو تابع بـ' : 'or continue with'}</Text>
          <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        </View>

        <Animated.View style={{ transform: [{ scale: googleScale }] }}>
          <Pressable
            style={[styles.googleBtn, googleLoading && styles.googleBtnLoading]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            onPressIn={onGooglePressIn}
            onPressOut={onGooglePressOut}
          >
            {/* Left: icon or spinner */}
            <View style={styles.googleIconBox}>
              {googleLoading
                ? <ActivityIndicator size="small" color="#4285F4" />
                : (
                  <View style={styles.googleIconCircle}>
                    {/* Google G — blue top-left + red bottom-left + yellow bottom-right + green top-right */}
                    <Text style={styles.googleGLetter}>G</Text>
                  </View>
                )}
            </View>

            {/* Center: text */}
            <View style={styles.googleTextCol}>
              <Text style={styles.googleBtnText} numberOfLines={1}>
                {googleLoading
                  ? (isAr ? 'جارٍ تسجيل الدخول...' : 'Signing in...')
                  : (isAr ? 'المتابعة عبر Google' : 'Continue with Google')}
              </Text>
              {googleLoading ? (
                <Text style={styles.googleBtnSub} numberOfLines={1}>
                  {isAr ? 'أكمل في المتصفح ثم عد للتطبيق' : 'Complete in browser, then return'}
                </Text>
              ) : null}
            </View>

            {/* Right: spacer to keep text centered */}
            <View style={{ width: 40 }} />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  langRow: { justifyContent: 'flex-end', gap: Spacing.sm, marginBottom: Spacing.sm },
  langPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  langPillText: { fontSize: FontSize.sm },
  hero: { alignItems: 'center', marginBottom: Spacing.xl, paddingVertical: Spacing.md },
  logoRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  logo: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  appNameHeroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  appName: { fontSize: FontSize.xxxl, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
  heroBetaBadge: { backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 3 },
  heroBetaBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, lineHeight: 13 },
  tagline: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
  card: { borderRadius: Radius.xxl, padding: Spacing.lg },
  tabs: { flexDirection: 'row', borderRadius: Radius.md, padding: 4, marginBottom: Spacing.lg, gap: 4 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: {},
  tabText: { fontSize: FontSize.md, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  formHeader: { marginBottom: Spacing.lg },
  formTitle: { fontSize: FontSize.xl, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
  formSub: { fontSize: FontSize.sm },
  otpHeader: { alignItems: 'center', marginBottom: Spacing.lg, gap: 6 },
  otpIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  otpTitle: { fontSize: FontSize.xl, fontWeight: '800', letterSpacing: -0.3 },
  otpSub: { fontSize: FontSize.sm },
  otpEmail: { fontSize: FontSize.md, fontWeight: '600' },
  resendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md, paddingVertical: 10 },
  resendText: { fontSize: FontSize.sm, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: Spacing.xs },
  linkText: { fontSize: FontSize.sm, fontWeight: '600' },
  footerHint: { textAlign: 'center', fontSize: FontSize.sm, color: 'rgba(255,255,255,0.4)', marginTop: Spacing.md },
  footerLink: { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: FontSize.xs, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: 16,
    marginTop: Spacing.sm,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E8EAED',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 5,
  },
  googleBtnLoading: { borderColor: '#D2E3FC', backgroundColor: '#F8FBFF' },
  googleIconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  googleIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#E8EAED',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4285F4', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  googleGLetter: { fontSize: 19, fontWeight: '900', color: '#4285F4', lineHeight: 22 },
  googleTextCol: { flex: 1, alignItems: 'center' },
  googleBtnText: { color: '#1F1F1F', fontSize: FontSize.md, fontWeight: '700', letterSpacing: 0.1 },
  googleBtnSub: { color: '#5F6368', fontSize: 11, marginTop: 2, textAlign: 'center' },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  loadingBox: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 14, minWidth: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 8 },
  loadingText: { fontSize: FontSize.md, fontWeight: '600', color: '#1a1a1a' },
});
