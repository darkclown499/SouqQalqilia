import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Linking, Platform,
  Animated, Easing, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');

// ── Store links ───────────────────────────────────────────────────────────────
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.plankton.souq-qalqilya';
const APP_STORE_URL  = 'https://apps.apple.com/app/id6748892869';

interface Props {
  currentVersion: string;
  minVersion: string;
}

export function ForceUpdateScreen({ currentVersion, minVersion }: Props) {
  const insets = useSafeAreaInsets();

  // Entrance animations
  const logoScale   = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const cardY       = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const pulse       = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 120, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // Card entrance (slight delay)
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(cardY, { toValue: 0, damping: 14, stiffness: 100, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]).start();
    }, 250);

    // Pulse animation on the update icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleUpdate = () => {
    const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      {/* Background glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoRing}>
          <Image
            source={require('@/assets/images/app-logo-transparent.png')}
            style={styles.logoImg}
            contentFit="contain"
          />
        </View>
        <Text style={styles.appName}>سوق قلقيلية</Text>
      </Animated.View>

      {/* Card */}
      <Animated.View style={[
        styles.card,
        { transform: [{ translateY: cardY }], opacity: cardOpacity },
      ]}>
        {/* Icon */}
        <Animated.View style={[styles.iconOuter, { transform: [{ scale: pulse }] }]}>
          <View style={styles.iconInner}>
            <MaterialIcons name="system-update" size={38} color="#fff" />
          </View>
          {/* Ripple rings */}
          <View style={[styles.ring, styles.ring1]} />
          <View style={[styles.ring, styles.ring2]} />
        </Animated.View>

        {/* Text */}
        <Text style={styles.title}>تحديث مطلوب</Text>
        <Text style={styles.subtitle}>
          يتوفر إصدار جديد من التطبيق يحتوي على تحسينات مهمة وإصلاحات ضرورية
        </Text>

        {/* Version badges */}
        <View style={styles.versionRow}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionLabel}>إصدارك الحالي</Text>
            <Text style={[styles.versionNum, styles.versionOld]}>v{currentVersion}</Text>
          </View>
          <MaterialIcons name="arrow-forward" size={18} color="rgba(255,255,255,0.4)" />
          <View style={styles.versionBadge}>
            <Text style={styles.versionLabel}>الإصدار المطلوب</Text>
            <Text style={[styles.versionNum, styles.versionNew]}>v{minVersion}+</Text>
          </View>
        </View>

        {/* What's new bullets */}
        <View style={styles.bulletList}>
          {[
            'أداء أسرع وتجربة أسلس',
            'إصلاح مشاكل تسجيل الدخول',
            'تحسينات على أمان الحساب',
          ].map((item, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* CTA Button */}
        <Pressable
          style={({ pressed }) => [styles.updateBtn, { opacity: pressed ? 0.88 : 1 }]}
          onPress={handleUpdate}
        >
          <MaterialIcons
            name={Platform.OS === 'ios' ? 'apple' : 'shop'}
            size={20}
            color="#0A6E5C"
          />
          <Text style={styles.updateBtnText}>
            {Platform.OS === 'ios' ? 'تحديث من App Store' : 'تحديث من Google Play'}
          </Text>
          <MaterialIcons name="open-in-new" size={16} color="#0A6E5C" />
        </Pressable>

        <Text style={styles.footerNote}>
          هذا التحديث إلزامي ولا يمكن تخطيه
        </Text>
      </Animated.View>
    </View>
  );
}

const BRAND = '#0A6E5C';
const GOLD  = '#E8C060';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 28,
  },

  // Glows
  glowTop: {
    position: 'absolute', top: -W * 0.3, left: -W * 0.3,
    width: W * 0.8, height: W * 0.8, borderRadius: W * 0.4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  glowBottom: {
    position: 'absolute', bottom: -W * 0.2, right: -W * 0.2,
    width: W * 0.7, height: W * 0.7, borderRadius: W * 0.35,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Logo
  logoWrap: { alignItems: 'center', gap: 10 },
  logoRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    padding: 8,
  },
  logoImg: { width: 66, height: 66 },
  appName: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 16,
  },

  // Icon
  iconOuter: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  iconInner: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 18, elevation: 10,
  },
  ring: {
    position: 'absolute', borderRadius: 999,
    borderWidth: 1.5, borderColor: `${GOLD}40`,
  },
  ring1: { width: 100, height: 100 },
  ring2: { width: 124, height: 124 },

  // Text
  title: {
    fontSize: 26, fontWeight: '800', color: '#fff',
    textAlign: 'center', letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.72)',
    textAlign: 'center', lineHeight: 22,
  },

  // Version row
  versionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 12,
    width: '100%', justifyContent: 'center',
  },
  versionBadge: { alignItems: 'center', gap: 4 },
  versionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.4 },
  versionNum: { fontSize: 16, fontWeight: '800' },
  versionOld: { color: '#FCA5A5' },
  versionNew: { color: GOLD },

  // Bullets
  bulletList: { width: '100%', gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: GOLD,
  },
  bulletText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', flex: 1 },

  // Update button
  updateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#fff', borderRadius: 18,
    paddingVertical: 16, paddingHorizontal: 24,
    width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  updateBtnText: {
    fontSize: 16, fontWeight: '800', color: BRAND, flex: 1, textAlign: 'center',
  },

  footerNote: {
    fontSize: 11, color: 'rgba(255,255,255,0.38)',
    textAlign: 'center', marginTop: -4,
  },
});
