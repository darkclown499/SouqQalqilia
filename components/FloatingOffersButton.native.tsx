import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
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

// قائمة الرسائل
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
  'أقوى الخصومات بالسوق 🥇',
];

export default function FloatingOffersButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { height: screenHeight } = useWindowDimensions();

  const MIN_Y = 80 + insets.top;
  const MAX_Y = screenHeight - 160 - insets.bottom;

  const x = useSharedValue(MIN_X); // سيتم تحديثه بعد قياس العرض
  const y = useSharedValue(MAX_Y - 50);
  const hasDraggedRef = useRef(false);

  const [currentMessage, setCurrentMessage] = useState(OFFERS_MESSAGES[0]);
  const [isSnappedLeft, setIsSnappedLeft] = useState(true); // افتراضياً يسار
  const [contentWidth, setContentWidth] = useState(0);
  const [isLayoutReady, setIsLayoutReady] = useState(false);

  // ✅ تصحيح الموضع الرأسي بعد ما تتوفر أبعاد الشاشة الحقيقية —
  // useWindowDimensions ممكن يرجع قيمة غير نهائية بأول رندر، وuseSharedValue
  // ما بيتحدث تلقائياً بعدها، فلازم نزامنه يدوياً طالما المستخدم ما سحب الزر بعد
  useEffect(() => {
    if (!hasDraggedRef.current) {
      y.value = MAX_Y - 50;
    }
  }, [MAX_Y]);

  const markDragged = useCallback(() => {
    hasDraggedRef.current = true;
  }, []);

  const pickRandomMessage = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * OFFERS_MESSAGES.length);
    setCurrentMessage(OFFERS_MESSAGES[randomIndex]);
  }, []);

  useEffect(() => {
    pickRandomMessage();
  }, []);

  // تحديث موقع الزر عند تغير العرض أو الرسالة
  useEffect(() => {
    if (contentWidth > 0 && isLayoutReady) {
      // إذا كان الزر في الجهة اليمنى، نضبط x بحيث يكون الطرف الأيمن للزر عند حافة الشاشة
      if (!isSnappedLeft) {
        const targetX = SCREEN_WIDTH - SIDE_PADDING - contentWidth;
        x.value = targetX;
      } else {
        x.value = MIN_X;
      }
    }
  }, [contentWidth, isLayoutReady, isSnappedLeft]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && !isLayoutReady) {
      setContentWidth(width);
      setIsLayoutReady(true);
      // تعيين الموضع الأولي: زر على اليمين
      const targetX = SCREEN_WIDTH - SIDE_PADDING - width;
      x.value = targetX;
      setIsSnappedLeft(false);
    }
  }, [isLayoutReady]);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(markDragged)();
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      let nextX = startX.value + event.translationX;
      let nextY = startY.value + event.translationY;

      if (nextY < MIN_Y) nextY = MIN_Y;
      if (nextY > MAX_Y) nextY = MAX_Y;

      x.value = nextX;
      y.value = nextY;
    })
    .onEnd((event) => {
      const finalX = x.value + event.velocityX * 0.1;
      const midpoint = SCREEN_WIDTH / 2;

      // نحتاج إلى عرض المحتوى لتحديد الموضع الصحيح عند الالتصاق باليمين
      const currentWidth = contentWidth;

      let targetX;
      let snappedLeft;
      if (finalX < midpoint) {
        targetX = MIN_X;
        snappedLeft = true;
      } else {
        // عند التصاق باليمين، نضع الطرف الأيمن للزر عند حافة الشاشة
        targetX = SCREEN_WIDTH - SIDE_PADDING - currentWidth;
        snappedLeft = false;
      }

      // منع الخروج عن الحدود
      targetX = Math.max(MIN_X, Math.min(targetX, SCREEN_WIDTH - currentWidth - SIDE_PADDING));

      x.value = withSpring(targetX, { damping: 15, stiffness: 120 });
      runOnJS(setIsSnappedLeft)(snappedLeft);

      let targetY = y.value;
      if (targetY < MIN_Y) targetY = MIN_Y;
      if (targetY > MAX_Y) targetY = MAX_Y;
      y.value = withSpring(targetY, { damping: 15, stiffness: 120 });

      runOnJS(pickRandomMessage)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const gradientColors = ['#FF6B6B', '#EE5A24'];
  const bubbleShadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(238,90,36,0.4)';

  return (
    <Animated.View style={[styles.absoluteWrapper, animatedStyle]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={styles.panWrapper}>
          <Pressable
            onPress={() => router.push('/offers')}
            style={styles.pressableArea}
            onLayout={onLayout}
          >
            {isSnappedLeft ? (
              // الزر على اليسار: الدائرة على اليسار، ثم الفقاعة
              <>
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: colors.surface,
                      borderColor: '#FF6B6B',
                      shadowColor: '#000',
                    },
                  ]}
                >
                  <Image
                    source={{
                      uri: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif',
                    }}
                    style={{ width: 36, height: 36, backgroundColor: 'transparent' }}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.bubbleMasterContainer}>
                  <View style={styles.tailContainer}>
                    <View style={[styles.smallDot, { backgroundColor: '#EE5A24' }]} />
                    <View style={[styles.bigDot, { backgroundColor: '#EE5A24' }]} />
                  </View>
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
                      },
                    ]}
                  >
                    <Text style={styles.bubbleText} numberOfLines={1}>
                      {currentMessage}
                    </Text>
                  </LinearGradient>
                </View>
              </>
            ) : (
              // الزر على اليمين: الفقاعة ثم الدائرة
              <>
                <View style={styles.bubbleMasterContainer}>
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
                      },
                    ]}
                  >
                    <Text style={styles.bubbleText} numberOfLines={1}>
                      {currentMessage}
                    </Text>
                  </LinearGradient>
                  <View style={styles.tailContainer}>
                    <View style={[styles.bigDot, { backgroundColor: '#EE5A24' }]} />
                    <View style={[styles.smallDot, { backgroundColor: '#EE5A24' }]} />
                  </View>
                </View>
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: colors.surface,
                      borderColor: '#FF6B6B',
                      shadowColor: '#000',
                    },
                  ]}
                >
                  <Image
                    source={{
                      uri: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif',
                    }}
                    style={{ width: 36, height: 36, backgroundColor: 'transparent' }}
                    contentFit="contain"
                  />
                </View>
              </>
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  absoluteWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 'auto', // ✅ يصبح العرض تلقائياً حسب المحتوى
    height: BUTTON_SIZE,
    zIndex: 99999,
  },
  panWrapper: {
    flex: 1,
  },
  pressableArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    // لا نضع عرض ثابت، سيتحدد حسب المحتوى
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
    flexShrink: 0,
  },
  bubbleMasterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BUTTON_SIZE,
    paddingHorizontal: 4,
    flexShrink: 1, // يسمح بالانكماش إذا ضاقت المساحة
  },
  tailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 60,
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flexShrink: 1,
  },
});