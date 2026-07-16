import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { InterstitialAd } from '@/services/interstitialService';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

interface Props {
  ad: InterstitialAd | null;
  visible: boolean;
  onClose: () => void;
}

export function InterstitialAdOverlay({ ad, visible, onClose }: Props) {
  const { colors } = useTheme();
  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef = useRef<Animated.CompositeAnimation | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  // Cleanup function for all timers and animations
  const cleanup = () => {
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
    if (progressRef.current) {
      progressRef.current.stop();
      progressRef.current = null;
    }
    progressAnim.setValue(0);
    setCanSkip(false);
    setCountdown(0);
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    // Reset everything when hidden or ad changes
    if (!visible || !ad) {
      cleanup();
      return;
    }

    const skipAfter = ad.skip_after_seconds * 1000;
    const total = ad.duration_seconds * 1000;

    // Countdown for skip button
    setCountdown(ad.skip_after_seconds);
    countIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countIntervalRef.current) clearInterval(countIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Enable skip button after skip_after_seconds
    skipTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        setCanSkip(true);
      }
    }, skipAfter);

    // Auto close after full duration
    closeTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        onClose();
      }
    }, total);

    // Progress bar animation
    progressAnim.setValue(0);
    progressRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: total,
      useNativeDriver: false,
    });
    progressRef.current.start(() => {
      // Animation finished callback (optional)
    });

    // Cleanup when this effect re-runs or component unmounts
    return () => {
      cleanup();
    };
  }, [visible, ad, onClose, progressAnim]);

  // Handle skip press - close immediately and clean up
  const handleSkip = () => {
    cleanup();
    onClose();
  };

  if (!ad) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Media */}
        <View style={styles.mediaWrap}>
          <Image
            source={{ uri: ad.media_url }}
            style={styles.media}
            contentFit="cover"
            transition={300}
          />
          {/* Dark gradient overlay */}
          <View style={styles.gradient} />

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          {/* Skip / countdown */}
          <View style={styles.topRight}>
            {canSkip ? (
              <Pressable style={styles.skipBtn} onPress={handleSkip}>
                <Text style={styles.skipText}>Skip</Text>
                <MaterialIcons name="close" size={14} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            )}
          </View>

          {/* Ad label */}
          <View style={styles.adLabel}>
            <MaterialIcons name="campaign" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={styles.adLabelText}>Ad</Text>
          </View>

          {/* Title */}
          {ad.title ? (
            <View style={styles.titleWrap}>
              <Text style={styles.adTitle}>{ad.title}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
    width: width, height: height,
  },
  mediaWrap: {
    width: width,
    height: height,
    overflow: 'hidden',
    position: 'relative',
  },
  media: { width: '100%', height: '100%' },
  gradient: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  progressTrack: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressBar: {
    height: '100%', backgroundColor: '#fff',
    borderRadius: 2,
  },
  topRight: {
    position: 'absolute', top: Spacing.md, right: Spacing.md,
  },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  skipText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  countdownPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 42, alignItems: 'center',
  },
  countdownText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  adLabel: {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4,
  },
  adLabelText: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  titleWrap: {
    position: 'absolute', bottom: Spacing.xl, left: Spacing.lg, right: Spacing.lg,
  },
  adTitle: {
    color: '#fff', fontSize: FontSize.xl, fontWeight: '800',
    lineHeight: 28, letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
});