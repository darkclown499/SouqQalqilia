import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, StatusBar, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { APP_NAME_AR, APP_NAME } from '@/constants/config';

export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  // Entrance animation
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(24)).current;
  const avatarScale = useRef(new Animated.Value(0.6)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(cardY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true, delay: 150 }),
      Animated.spring(checkScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true, delay: 350 }),
    ]).start();
  }, []);

  const handleStart = () => {
    router.replace('/(tabs)');
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? '#0A0F0D' : '#0A6E5C'} />
      <ScrollView
        style={[s.scroll, { backgroundColor: isDark ? '#0A0F0D' : '#0A6E5C' }]}
        contentContainerStyle={[s.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 48 }]}
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
            {/* Animated check overlay */}
            <Animated.View style={[s.checkBadge, { transform: [{ scale: checkScale }] }]}>
              <MaterialIcons name="check" size={16} color="#fff" />
            </Animated.View>
          </Animated.View>

          <View style={s.badge}>
            <MaterialIcons name="check-circle" size={14} color="#10B981" />
            <Text style={s.badgeText}>
              {isAr ? 'تم التحقق بنجاح' : 'Verified Successfully'}
            </Text>
          </View>

          <Text style={s.heroTitle}>
            {isAr ? 'مرحباً بك في السوق! 🎉' : 'Welcome to the Marketplace! 🎉'}
          </Text>
          <Text style={s.heroSub}>
            {isAr
              ? 'حسابك جاهز الآن، يمكنك البدء بالتسوق والبيع فوراً'
              : 'Your account is ready. Start browsing and selling right away'}
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

            {/* Info box */}
            <View style={[s.infoBox, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '33' }]}>
              <View style={[s.infoIconWrap, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="person" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoTitle, { color: colors.textPrimary }]}>
                  {isAr ? 'أكمل إعدادات حسابك' : 'Complete Your Account Settings'}
                </Text>
                <Text style={[s.infoDesc, { color: colors.textSecondary }]}>
                  {isAr
                    ? 'يمكنك إضافة اسمك وصورتك الشخصية وبيانات التواصل في أي وقت من خلال ملفك الشخصي'
                    : 'You can add your name, profile photo, and contact details anytime from your profile page'}
                </Text>
              </View>
            </View>

            {/* Feature hints */}
            {[
              {
                icon: 'storefront',
                color: '#0A6E5C',
                bg: colors.primaryGhost,
                label: isAr ? 'تصفح الإعلانات' : 'Browse Listings',
                sub: isAr ? 'آلاف المنتجات بأسعار مناسبة' : 'Thousands of products at great prices',
              },
              {
                icon: 'add-circle-outline',
                color: '#7C3AED',
                bg: '#EDE9FE',
                label: isAr ? 'انشر إعلانك' : 'Post Your Ad',
                sub: isAr ? 'بيع منتجاتك بسهولة وسرعة' : 'Sell your items quickly and easily',
              },
              {
                icon: 'chat-bubble-outline',
                color: '#D97706',
                bg: '#FEF3C7',
                label: isAr ? 'تواصل مع البائعين' : 'Chat with Sellers',
                sub: isAr ? 'تفاوض مباشرة مع أصحاب الإعلانات' : 'Negotiate directly with ad owners',
              },
            ].map((item) => (
              <View key={item.label} style={[s.featureRow, { borderColor: colors.borderLight }]}>
                <View style={[s.featureIcon, { backgroundColor: item.bg }]}>
                  <MaterialIcons name={item.icon as any} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.featureLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[s.featureSub, { color: colors.textMuted }]}>{item.sub}</Text>
                </View>
                <MaterialIcons name={isAr ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textMuted} />
              </View>
            ))}

            {/* Start Button */}
            <Pressable
              style={({ pressed }) => [
                s.startBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={handleStart}
            >
              <MaterialIcons name="rocket-launch" size={20} color="#fff" />
              <Text style={s.startBtnText}>
                {isAr ? 'ابدأ الآن' : 'Get Started'}
              </Text>
              <MaterialIcons name={isAr ? 'arrow-back' : 'arrow-forward'} size={18} color="rgba(255,255,255,0.8)" />
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
    </>
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
  checkBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#0A6E5C',
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
    textAlign: 'center', lineHeight: 20, maxWidth: 300,
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

  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  infoIconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoTitle: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 3 },
  infoDesc: { fontSize: FontSize.xs, lineHeight: 18 },

  // Feature rows
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  featureIcon: {
    width: 42, height: 42, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureLabel: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  featureSub: { fontSize: FontSize.xs, lineHeight: 16 },

  // Start button
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 56, borderRadius: Radius.xl,
    shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32, shadowRadius: 12, elevation: 8,
    marginTop: 4,
  },
  startBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800', letterSpacing: 0.2, flex: 1, textAlign: 'center', marginLeft: -18 },

  // Branding
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, opacity: 0.5 },
  brandLogo: { width: 22, height: 22, borderRadius: 5 },
  brandName: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
});
