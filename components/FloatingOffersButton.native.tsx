import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, useWindowDimensions } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = 56;
const SIDE_PADDING = 12;

const MIN_X = SIDE_PADDING;
const MAX_X = SCREEN_WIDTH - BUTTON_SIZE - SIDE_PADDING;

// قائمة الرسائل (نفسها)
const OFFERS_MESSAGES = [
  'عروض نار حصرية 🔥',
  'الحق عروض اليوم ⚡',
  'لقطات ما بتتفوت 🛍️',
  'تخفيضات خيالية 📉',
  'حرررق أسعار بالداخل 🌶️',
  'شوف شو مجهزيلك اليوم 😉',
  'خصومات بتكسر الدنيا 💥',
  'وفّر مصاريك وتسوق صح 💸',
  'عروض بتطير العقل 🤯',
  'يا تلحق يا ما تلحق 🏃‍♂️',
  'أسعارنا ما إلها مثيل 🌟',
  'صيدة اليوم بتستناك 🎣',
  'دلّع حالك بأقل الأسعار 😍',
  'تنزيلات بتفرح القلب ❤️',
  'فرصة ما بتتعوض ⏳',
  'عروض بتشرح الصدر 🎁',
  'اكتشف أرخص الأسعار 🔍',
  'تسوق أكثر وادفع أقل 🛒',
  'ولّعت الأسعار عنا 🔥',
  'عروض خاصة بس لعيونك 😉',
  'أقوى الخصومات بالسوق 🥇'
];

export default function FloatingOffersButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { height: screenHeight } = useWindowDimensions();

  const MIN_Y = 80 + insets.top;
  const MAX_Y = screenHeight - 160 - insets.bottom;

  const x = useSharedValue(MAX_X);
  const y = useSharedValue(MAX_Y - 50);

  const [currentMessage, setCurrentMessage] = useState(OFFERS_MESSAGES[0]);
  const [isSnappedLeft, setIsSnappedLeft] = useState(false);

  const pickRandomMessage = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * OFFERS_MESSAGES.length);
    setCurrentMessage(OFFERS_MESSAGES[randomIndex]);
  }, []);

  useEffect(() => {
    pickRandomMessage();
  }, []);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context: any) => {
      context.startX = x.value;
      context.startY = y.value;
    },
    onActive: (event, context) => {
      let nextX = context.startX + event.translationX;
      let nextY = context.startY + event.translationY;

      if (nextY < MIN_Y) nextY = MIN_Y;
      if (nextY > MAX_Y) nextY = MAX_Y;

      x.value = nextX;
      y.value = nextY;
    },
    onEnd: (event) => {
      const finalX = x.value + event.velocityX * 0.1;
      const midpoint = SCREEN_WIDTH / 2;

      let targetX;
      if (finalX < midpoint) {
        targetX = MIN_X;
        runOnJS(setIsSnappedLeft)(true);
      } else {
        targetX = MAX_X;
        runOnJS(setIsSnappedLeft)(false);
      }

      x.value = withSpring(targetX, { damping: 15, stiffness: 120 });

      let targetY = y.value;
      if (targetY < MIN_Y) targetY = MIN_Y;
      if (targetY > MAX_Y) targetY = MAX_Y;
      y.value = withSpring(targetY, { damping: 15, stiffness: 120 });

      runOnJS(pickRandomMessage)();
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const gradientColors = ['#FF6B6B', '#EE5A24'];
  const bubbleShadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(238,90,36,0.4)';

  return (
    <Animated.View style={[styles.absoluteWrapper, animatedStyle]}>
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={styles.panWrapper}>
          <Pressable onPress={() => router.push('/offers')} style={styles.pressableArea}>
            {/* الدائرة الرئيسية */}
            <View style={[styles.circle, { backgroundColor: colors.surface, borderColor: '#FF6B6B', shadowColor: '#000' }]}>
              <Image
                source={{ uri: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif' }}
                style={{ width: 36, height: 36, backgroundColor: 'transparent' }}
                contentFit="contain"
              />
            </View>

            {/* الفقاعة المحسّنة */}
            <View
              style={[
                styles.bubbleMasterContainer,
                isSnappedLeft
                  ? { left: BUTTON_SIZE - 4, flexDirection: 'row' }
                  : { right: BUTTON_SIZE - 4, flexDirection: 'row-reverse' },
              ]}
              pointerEvents="none"
            >
              {/* ذيل الفقاعة (نقاط) */}
              <View
                style={[
                  styles.tailContainer,
                  isSnappedLeft ? { marginLeft: 2, flexDirection: 'row' } : { marginRight: 2, flexDirection: 'row-reverse' },
                ]}
              >
                <View style={[styles.smallDot, { backgroundColor: '#EE5A24' }]} />
                <View style={[styles.bigDot, { backgroundColor: '#EE5A24' }]} />
              </View>

              {/* الفقاعة مع تدرج لوني */}
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.textBubble,
                  {
                    shadowColor: bubbleShadowColor,
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1,
                  }
                ]}
              >
                <Text style={styles.bubbleText} numberOfLines={1}>
                  {currentMessage}
                </Text>
              </LinearGradient>
            </View>
          </Pressable>
        </Animated.View>
      </PanGestureHandler>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  absoluteWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    zIndex: 99999,
  },
  panWrapper: {
    flex: 1,
  },
  pressableArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
    borderWidth: 2,
  },

  bubbleMasterContainer: {
    position: 'absolute',
    height: BUTTON_SIZE,
    alignItems: 'center',
    // ✅ السماح للفقاعة بالتمدد حسب النص
    maxWidth: SCREEN_WIDTH - BUTTON_SIZE - 12, // مساحة أكبر
    minWidth: 60,
  },
  tailContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
  },
  bigDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smallDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  textBubble: {
    paddingHorizontal: 16,  // ✅ مسافة أكبر لنفس جميل
    paddingVertical: 10,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    flexShrink: 0,          // ✅ يمنع انكماش الفقاعة
    minWidth: 60,
  },
  bubbleText: {
    fontSize: 16,           // ✅ حجم خط مناسب (أكبر من السابق)
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    // ✅ السماح للنص بالتمدد داخل الفقاعة دون تقليص
    flexShrink: 0,
  },
});