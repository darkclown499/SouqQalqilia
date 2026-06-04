import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  Pressable, ActivityIndicator, Animated, StatusBar, TextInput,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { APP_NAME_AR, APP_NAME } from '@/constants/config';

export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  // Entrance animation
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(24)).current;
  const avatarScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(cardY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true, delay: 150 }),
    ]).start();
  }, []);

  const handleSave = async () => {
    const first = firstName.trim();
    const last = lastName.trim();

    if (!first) {
      return showAlert(
        isAr ? 'الاسم الأول مطلوب' : 'First Name Required',
        isAr ? 'يرجى إدخال اسمك الأول على الأقل' : 'Please enter at least your first name'
      );
    }

    if (!user?.id) {
      return showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'لم يتم التحقق من الهوية' : 'Not authenticated');
    }

    setLoading(true);
    try {
      const fullName = last ? `${first} ${last}` : first;
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('user_profiles')
        .update({ username: fullName })
        .eq('id', user.id);

      if (error) throw new Error(error.message);

      router.replace('/(tabs)');
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? '#0A0F0D' : '#0A6E5C'} />
      <ScrollView
        style={[s.scroll, { backgroundColor: isDark ? '#0A0F0D' : '#0A6E5C' }]}
        contentContainerStyle={[s.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <View style={s.heroSection}>
          <Animated.View style={[s.avatarOuter, { transform: [{ scale: avatarScale }] }]}>
            <View style={[s.avatarRing, { borderColor: 'rgba(255,255,255,0.3)' }]}>
              <View style={[s.avatarInner, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <MaterialIcons name="person" size={52} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
            {/* Glow */}
            <View style={s.avatarGlow} />
          </Animated.View>

          <View style={s.badge}>
            <MaterialIcons name="check-circle" size={14} color="#10B981" />
            <Text style={s.badgeText}>
              {isAr ? 'تم التحقق بنجاح' : 'Verified Successfully'}
            </Text>
          </View>

          <Text style={s.heroTitle}>
            {isAr ? 'أكمل ملفك الشخصي' : 'Complete Your Profile'}
          </Text>
          <Text style={s.heroSub}>
            {isAr
              ? 'أضف اسمك حتى يتعرف عليك الآخرون في السوق'
              : 'Add your name so others can recognize you in the marketplace'}
          </Text>
        </View>

        {/* ── CARD ── */}
        <Animated.View
          style={[
            s.card,
            { backgroundColor: colors.surface },
            { transform: [{ translateY: cardY }], opacity: cardOpacity },
          ]}
        >
          <View style={s.cardContent}>
            {/* Phone info pill */}
            {user?.email && user.email.includes('@sms.') ? (
              <View style={[s.phonePill, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="verified" size={14} color={colors.primary} />
                <Text style={[s.phonePillText, { color: colors.primary }]}>
                  {isAr ? 'تم التحقق برقم الهاتف' : 'Phone number verified'}
                </Text>
              </View>
            ) : null}

            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
              {isAr ? 'بياناتك الشخصية' : 'Your personal details'}
            </Text>

            {/* First Name */}
            <NameInput
              label={isAr ? 'الاسم الأول *' : 'First Name *'}
              placeholder={isAr ? 'مثال: محمد' : 'e.g. John'}
              value={firstName}
              onChangeText={setFirstName}
              iconName="person"
              colors={colors}
              autoFocus
              returnKeyType="next"
            />

            {/* Last Name */}
            <NameInput
              label={isAr ? 'اسم العائلة (اختياري)' : 'Last Name (Optional)'}
              placeholder={isAr ? 'مثال: أحمد' : 'e.g. Smith'}
              value={lastName}
              onChangeText={setLastName}
              iconName="person-outline"
              colors={colors}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            {/* Info note */}
            <View style={[s.infoRow, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="info-outline" size={15} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.primary }]}>
                {isAr
                  ? 'سيظهر اسمك للمشترين والبائعين عند التواصل معهم'
                  : 'Your name will be visible to buyers and sellers when you chat'}
              </Text>
            </View>

            {/* Save Button */}
            <Pressable
              style={({ pressed }) => [
                s.saveBtn,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 },
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>
                    {isAr ? 'حفظ والمتابعة' : 'Save & Continue'}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Skip */}
            <Pressable style={s.skipBtn} onPress={handleSkip} hitSlop={10}>
              <Text style={[s.skipText, { color: colors.textMuted }]}>
                {isAr ? 'تخطي الآن، سأضيف لاحقاً' : 'Skip for now, I will add it later'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* App branding */}
        <View style={s.brandRow}>
          <Image
            source={require('@/assets/images/app-logo-transparent.png')}
            style={s.brandLogo}
            contentFit="contain"
          />
          <Text style={s.brandName}>{isAr ? APP_NAME_AR : APP_NAME}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Name Input ────────────────────────────────────────────────────────────────
function NameInput({ label, placeholder, value, onChangeText, iconName, colors, autoFocus, returnKeyType, onSubmitEditing }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.inputGroup}>
      <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[
        s.inputWrap,
        { borderColor: focused ? colors.primary : colors.border, backgroundColor: colors.background },
        focused && { borderWidth: 1.5, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
      ]}>
        <MaterialIcons name={iconName} size={17} color={focused ? colors.primary : colors.textMuted} style={s.inputIcon} />
        <TextInput
          style={[s.inputField, { color: colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20, alignItems: 'center' },

  // Hero
  heroSection: { alignItems: 'center', marginBottom: 28, width: '100%', maxWidth: 440 },
  avatarOuter: { marginBottom: 16, position: 'relative' },
  avatarRing: {
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 2, padding: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute', inset: -6,
    borderRadius: 66,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.18)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: Radius.full,
    marginBottom: 14,
  },
  badgeText: { color: '#10B981', fontSize: FontSize.xs, fontWeight: '700' },
  heroTitle: {
    fontSize: 24, fontWeight: '800', color: '#fff',
    textAlign: 'center', letterSpacing: -0.4, marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  heroSub: {
    fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },

  // Card
  card: {
    width: '100%', maxWidth: 440,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
    overflow: 'hidden',
  },
  cardContent: { padding: Spacing.lg, gap: Spacing.md },

  // Phone pill
  phonePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, alignSelf: 'center',
  },
  phonePillText: { fontSize: FontSize.xs, fontWeight: '600' },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },

  // Inputs
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '600', marginLeft: 2 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: Radius.md,
    height: 54, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, fontSize: FontSize.md, height: '100%' },

  // Info row
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: Radius.sm,
  },
  infoText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, fontWeight: '500' },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 54, borderRadius: Radius.xl,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', letterSpacing: 0.2 },

  // Skip
  skipBtn: { alignItems: 'center', paddingVertical: 8, marginTop: -4 },
  skipText: { fontSize: FontSize.sm, fontWeight: '500' },

  // Branding
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, opacity: 0.5 },
  brandLogo: { width: 22, height: 22, borderRadius: 5 },
  brandName: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
});
