/**
 * Web fallback for LottiePlayer — lottie-react-native has a broken web peer
 * dependency (@lottiefiles/dotlottie-react) that is not bundled.
 * This stub renders an equivalent pure-Animated shopping-bag bounce so the
 * web Live Preview compiles cleanly.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';

interface Props {
  onAnimationFinish?: () => void;
  size: number;
}

const DURATION = 3000; // match ~90-frame Lottie @ 30fps

export default function LottiePlayer({ onAnimationFinish, size }: Props) {
  const bounce  = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(1)).current;
  const rotate  = useRef(new Animated.Value(0)).current;
  const star1   = useRef(new Animated.Value(0)).current;
  const star2   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Bag bounce
      Animated.sequence([
        Animated.timing(bounce, { toValue: -14, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0,   duration: 400, easing: Easing.bounce,            useNativeDriver: true }),
        Animated.timing(bounce, { toValue: -10, duration: 400, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0,   duration: 350, easing: Easing.bounce,            useNativeDriver: true }),
        Animated.timing(bounce, { toValue: -6,  duration: 300, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0,   duration: 300, easing: Easing.bounce,            useNativeDriver: true }),
      ]),
      // Subtle squash/stretch
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1,  duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.95, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.06, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      // Price-tag swing
      Animated.sequence([
        Animated.timing(rotate, { toValue: 12,  duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rotate, { toValue: -8,  duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 5,   duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0,   duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      // Stars pop
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(star1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(star1, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(300),
        Animated.timing(star1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(star1, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(star2, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(star2, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(star2, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(star2, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => onAnimationFinish?.());
  }, []);

  const rotDeg = rotate.interpolate({ inputRange: [-20, 20], outputRange: ['-20deg', '20deg'] });
  const iconSize = size * 0.44;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Stars */}
      <Animated.Text style={[styles.star, styles.starLeft,  { opacity: star1, fontSize: size * 0.13 }]}>✦</Animated.Text>
      <Animated.Text style={[styles.star, styles.starRight, { opacity: star2, fontSize: size * 0.11 }]}>✦</Animated.Text>

      {/* Shopping cart emoji */}
      <Animated.View style={{ transform: [{ translateY: bounce }, { scaleX: scale }, { scaleY: scale }] }}>
        <Text style={{ fontSize: iconSize, lineHeight: iconSize * 1.2 }}>🛒</Text>
      </Animated.View>

      {/* Sparkle */}
      <Animated.Text style={[styles.tag, { transform: [{ rotate: rotDeg }], fontSize: size * 0.14 }]}>✨</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
    color: '#E8C060',
  },
  starLeft: {
    top: '18%',
    left: '12%',
  },
  starRight: {
    top: '15%',
    right: '14%',
  },
  tag: {
    position: 'absolute',
    bottom: '16%',
    right: '18%',
  },
});
