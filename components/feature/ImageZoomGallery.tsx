import React, { useState, useRef, useCallback } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Dimensions,
  StatusBar, Platform, PanResponder, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdImage } from '@/services/adsService';
import {
  GestureDetector, Gesture, GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ImageZoomGalleryProps {
  images: AdImage[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

// ── Single zoomable image item ───────────────────────────────────────────────
interface ZoomItemProps {
  uri: string;
  onSwipeClose: () => void;
  isActive: boolean;
}

function ZoomItem({ uri, onSwipeClose, isActive }: ZoomItemProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const swipeProgress = useSharedValue(0); // 0 = no swipe, 1 = fully closed

  // ── Pinch gesture ────────────────────────────────────────────────────────
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(savedScale.value * e.scale, 6));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        // Snap back to 1× and center
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  // ── Pan gesture — swipe-down/up to close when not zoomed in ─────────────
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1.05) {
        // Zoomed in — pan the image
        translateX.value = savedTranslateX.value + e.translationX / savedScale.value;
        translateY.value = savedTranslateY.value + e.translationY / savedScale.value;
      } else {
        // At 1× — vertical swipe drives a close gesture
        const progress = Math.abs(e.translationY) / (SCREEN_H * 0.35);
        swipeProgress.value = Math.min(progress, 1);
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (savedScale.value > 1.05) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      } else {
        // Decide whether to close or snap back
        const shouldClose =
          Math.abs(e.translationY) > SCREEN_H * 0.18 ||
          Math.abs(e.velocityY) > 700;

        if (shouldClose) {
          runOnJS(onSwipeClose)();
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 250 });
          swipeProgress.value = withTiming(0, { duration: 200 });
        }
      }
    });

  // ── Double-tap to zoom ───────────────────────────────────────────────────
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        // Reset to 1×
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        swipeProgress.value = withTiming(0);
      } else {
        // Zoom to 2.5×
        scale.value = withSpring(2.5, { damping: 16, stiffness: 180 });
        savedScale.value = 2.5;
        swipeProgress.value = withTiming(0);
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

  const animStyle = useAnimatedStyle(() => {
    // Background dims as user swipes to close
    const bgOpacity = interpolate(
      Math.abs(translateY.value),
      [0, SCREEN_H * 0.3],
      [1, 0.3],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { scale: scale.value },
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
      opacity: bgOpacity,
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[zStyles.itemWrap, animStyle]}>
        <Image
          source={{ uri }}
          style={zStyles.itemImg}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
          priority="high"
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

// ── Main gallery component ───────────────────────────────────────────────────
export function ImageZoomGallery({ images, initialIndex = 0, visible, onClose }: ImageZoomGalleryProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Horizontal swipe between pages — using Animated (not Reanimated) for FlatList compat
  const pageX = useRef(new Animated.Value(-(initialIndex * SCREEN_W))).current;
  const pageRef = useRef<{ value: number }>({ value: initialIndex });

  // Background opacity — dims as current image is swiped away
  const bgOpacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (visible) {
      const idx = initialIndex;
      setCurrentIndex(idx);
      pageRef.current.value = idx;
      pageX.setValue(-(idx * SCREEN_W));
      bgOpacity.setValue(1);
    }
  }, [visible, initialIndex]);

  const goTo = useCallback((idx: number, animated = true) => {
    const clamped = Math.max(0, Math.min(idx, images.length - 1));
    if (animated) {
      Animated.spring(pageX, {
        toValue: -(clamped * SCREEN_W),
        damping: 22,
        stiffness: 260,
        useNativeDriver: true,
      }).start();
    } else {
      pageX.setValue(-(clamped * SCREEN_W));
    }
    pageRef.current.value = clamped;
    setCurrentIndex(clamped);
  }, [images.length, pageX]);

  // ── Horizontal page-swipe pan responder ─────────────────────────────────
  const startX = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.6 && Math.abs(gs.dx) > 8,
      onPanResponderGrant: (_, gs) => {
        startX.current = -(pageRef.current.value * SCREEN_W);
      },
      onPanResponderMove: (_, gs) => {
        pageX.setValue(startX.current + gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        const threshold = SCREEN_W * 0.25;
        const cur = pageRef.current.value;
        if (gs.dx < -threshold && cur < images.length - 1) {
          goTo(cur + 1);
        } else if (gs.dx > threshold && cur > 0) {
          goTo(cur - 1);
        } else {
          goTo(cur);
        }
      },
    })
  ).current;

  const handleSwipeClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={zStyles.root}>
          <StatusBar hidden={Platform.OS === 'ios'} backgroundColor="#000" barStyle="light-content" />

          {/* Black background — tappable to close */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          {/* Header */}
          <View style={[zStyles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable style={zStyles.closeBtn} onPress={onClose} hitSlop={14}>
              <MaterialIcons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={zStyles.counter}>{currentIndex + 1} / {images.length}</Text>
            {/* Download hint */}
            <View style={zStyles.hintPill}>
              <MaterialIcons name="pinch" size={14} color="rgba(255,255,255,0.6)" />
              <Text style={zStyles.hintText}>Pinch to zoom</Text>
            </View>
          </View>

          {/* Pages — horizontal strip */}
          <Animated.View
            style={[zStyles.strip, { transform: [{ translateX: pageX }] }]}
            {...panResponder.panHandlers}
          >
            {images.map((img, idx) => (
              <View key={img.id} style={zStyles.page}>
                <ZoomItem
                  uri={img.url}
                  onSwipeClose={handleSwipeClose}
                  isActive={idx === currentIndex}
                />
              </View>
            ))}
          </Animated.View>

          {/* Nav arrows */}
          {images.length > 1 ? (
            <>
              {currentIndex > 0 ? (
                <Pressable
                  style={[zStyles.arrow, zStyles.arrowLeft]}
                  onPress={() => goTo(currentIndex - 1)}
                  hitSlop={10}
                >
                  <MaterialIcons name="chevron-left" size={32} color="#fff" />
                </Pressable>
              ) : null}
              {currentIndex < images.length - 1 ? (
                <Pressable
                  style={[zStyles.arrow, zStyles.arrowRight]}
                  onPress={() => goTo(currentIndex + 1)}
                  hitSlop={10}
                >
                  <MaterialIcons name="chevron-right" size={32} color="#fff" />
                </Pressable>
              ) : null}
            </>
          ) : null}

          {/* Dot indicators */}
          {images.length > 1 ? (
            <View style={[zStyles.dots, { bottom: insets.bottom + 16 }]}>
              {images.map((_, i) => (
                <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
                  <View
                    style={[
                      zStyles.dot,
                      i === currentIndex ? zStyles.dotActive : zStyles.dotInactive,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Thumbnails strip */}
          {images.length > 1 ? (
            <View style={[zStyles.thumbRow, { bottom: insets.bottom + 50 }]}>
              {images.map((img, i) => (
                <Pressable
                  key={img.id}
                  onPress={() => goTo(i)}
                  style={[
                    zStyles.thumb,
                    { borderColor: i === currentIndex ? '#fff' : 'transparent' },
                  ]}
                >
                  <Image
                    source={{ uri: img.url }}
                    style={zStyles.thumbImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Swipe-down hint */}
          <View style={[zStyles.swipeHint, { top: insets.top + 60 }]} pointerEvents="none">
            <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={zStyles.swipeHintText}>Swipe to close</Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const zStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5,
  },
  hintPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  hintText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500' },

  // Horizontal strip of pages
  strip: {
    flexDirection: 'row',
    width: SCREEN_W * 100, // large enough for any image count
    height: SCREEN_H,
    alignItems: 'center',
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Zoom item
  itemWrap: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImg: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
  },

  // Nav arrows
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    zIndex: 15,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },

  // Dots
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    zIndex: 15,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 20, backgroundColor: '#fff' },
  dotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.4)' },

  // Thumbnails
  thumbRow: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    zIndex: 15,
  },
  thumb: {
    width: 52, height: 52, borderRadius: 8,
    borderWidth: 2, overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },

  // Swipe hint
  swipeHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 1,
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },
});
