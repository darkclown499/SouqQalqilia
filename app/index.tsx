import { AuthRouter } from '@/template';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, Dimensions, Animated, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_SEEN_KEY } from './onboarding';

const { width: W, height: H } = Dimensions.get('window');

function SplashScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();

  // Animation values
  const logoScale   = useRef(new Animated.Value(0.55)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(18)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const barWidth    = useRef(new Animated.Value(0)).current;
  const shimmerX    = useRef(new Animated.Value(-W * 0.5)).current;
  const dotScale1   = useRef(new Animated.Value(0.6)).current;
  const dotScale2   = useRef(new Animated.Value(0.6)).current;
  const dotScale3   = useRef(new Animated.Value(0.6)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: Logo appears with spring bounce
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1, damping: 12, stiffness: 120, useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 420, useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: Text slides up + progress bar starts
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 340, useNativeDriver: true }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 400, delay: 120, useNativeDriver: true }),
        Animated.timing(barWidth, {
          toValue: W * 0.62, duration: 1400, delay: 200, useNativeDriver: false,
        }),
      ]).start();

      // Shimmer on progress bar
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerX, { toValue: W * 0.65, duration: 900, useNativeDriver: true }),
          Animated.timing(shimmerX, { toValue: -W * 0.5, duration: 0, useNativeDriver: true }),
        ])
      ).start();

      // Dot bounce loop
      const dotAnim = (val: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.spring(val, { toValue: 1.4, damping: 5, stiffness: 300, useNativeDriver: true }),
            Animated.spring(val, { toValue: 0.6, damping: 8, stiffness: 200, useNativeDriver: true }),
            Animated.delay(600),
          ])
        );
      dotAnim(dotScale1, 0).start();
      dotAnim(dotScale2, 180).start();
      dotAnim(dotScale3, 360).start();
    });

    // Fade out after 2.3s
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0, duration: 380, useNativeDriver: true,
      }).start(() => onDone());
    }, 2300);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.splashOuter, { opacity: screenOpacity }]}>
      {/* Background gradient-like layers */}
      <View style={styles.bgTop} />
      <View style={styles.bgBottom} />

      {/* Decorative circles */}
      <View style={[styles.deco, styles.deco1]} />
      <View style={[styles.deco, styles.deco2]} />
      <View style={[styles.deco, styles.deco3]} />

      {/* Logo */}
      <View style={styles.logoWrap}>
        <Animated.View style={{
          transform: [{ scale: logoScale }],
          opacity: logoOpacity,
        }}>
          <Image
            source={require('@/assets/images/souq-logo.png')}
            style={styles.logoImg}
            contentFit="contain"
            transition={0}
          />
        </Animated.View>
      </View>

      {/* App name */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }], alignItems: 'center' }}>
        <Text style={styles.splashTitle}>سوق قلقيلية</Text>
        <Animated.Text style={[styles.splashTagline, { opacity: tagOpacity }]}>
          اشتري وبيع أي شيء في قلقيلية
        </Animated.Text>
      </Animated.View>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]}>
          {/* Shimmer sweep */}
          <Animated.View
            style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]}
          />
        </Animated.View>
      </View>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {[dotScale1, dotScale2, dotScale3].map((s, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { transform: [{ scale: s }], backgroundColor: i === 1 ? '#E8A020' : '#0A6E5C' },
            ]}
          />
        ))}
      </View>

      {/* Footer */}
      <View style={[styles.splashFooter, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.footerBrand}>Powered by Plankton</Text>
      </View>
    </Animated.View>
  );
}

export default function RootScreen() {
  const [splashDone, setSplashDone] = useState(false);
  const [route, setRoute] = useState<{ showOnboarding: boolean } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((val) => {
      setRoute({ showOnboarding: !val });
    });
  }, []);

  if (!splashDone) {
    return <SplashScreen onDone={() => setSplashDone(true)} />;
  }

  if (!route) return null;

  if (route.showOnboarding) return <Redirect href="/onboarding" />;

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splashOuter: {
    flex: 1,
    backgroundColor: '#F7FBF9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Background layers for depth
  bgTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A6E5C',
    height: H * 0.42,
    top: 0,
    borderBottomLeftRadius: W * 0.5,
    borderBottomRightRadius: W * 0.5,
    transform: [{ scaleX: 1.6 }],
  },
  bgBottom: {
    ...StyleSheet.absoluteFillObject,
    top: H * 0.38,
    backgroundColor: '#F7FBF9',
  },

  // Decorative soft circles
  deco: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.1,
  },
  deco1: {
    width: W * 0.7, height: W * 0.7,
    top: -W * 0.18, left: -W * 0.18,
    backgroundColor: '#fff',
  },
  deco2: {
    width: W * 0.5, height: W * 0.5,
    top: -W * 0.08, right: -W * 0.14,
    backgroundColor: '#E8A020',
    opacity: 0.15,
  },
  deco3: {
    width: W * 0.36, height: W * 0.36,
    bottom: H * 0.12, right: -W * 0.1,
    backgroundColor: '#0A6E5C',
    opacity: 0.08,
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    // Card behind logo
    width: W * 0.52,
    height: W * 0.52,
    borderRadius: W * 0.26,
    backgroundColor: '#fff',
    shadowColor: '#0A6E5C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  logoImg: {
    width: W * 0.42,
    height: W * 0.42,
  },

  // Text
  splashTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0A4A3C',
    letterSpacing: 0.5,
    marginTop: 28,
    textAlign: 'center',
  },
  splashTagline: {
    fontSize: 14,
    color: '#4A8A7C',
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Progress bar
  barTrack: {
    width: W * 0.62,
    height: 5,
    backgroundColor: '#D1E8E2',
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 36,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#0A6E5C',
    borderRadius: 99,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    width: W * 0.25,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 99,
    transform: [{ skewX: '-20deg' }],
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 20,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Footer
  splashFooter: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 12,
    color: '#A0B8B2',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
