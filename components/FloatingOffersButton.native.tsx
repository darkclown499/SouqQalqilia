import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_SIZE = 56; 
const SIDE_PADDING = 12; 

// حدود الشاشة الحقيقية والدقيقة لمركز الدائرة (مستحيل تخرج برا هاي الحدود)
const MIN_X = SIDE_PADDING;
const MAX_X = SCREEN_WIDTH - BUTTON_SIZE - SIDE_PADDING;
const MIN_Y = 100; // مسافة أمان ممتازة للهيدر العلوي
const MAX_Y = SCREEN_HEIGHT - 160; // مسافة أمان للتابات السفلية

const OFFERS_MESSAGES = [
  'عروض نار حصرية 🔥',
  'الحق عروض اليوم بسرعة! ⚡',
  'لقطات ما بتتفوت 🛍️',
  'تخفيضات خيالية الحين 📉',
  'حرررق أسعار بالداخل 🌶️',
  'شوف شو مجهزيلك اليوم 😉'
];

export default function FloatingOffersButton() {
  const router = useRouter();
  
  // البداية الافتراضية من اليمين تحت
  const x = useSharedValue(MAX_X);
  const y = useSharedValue(MAX_Y - 50);
  
  const [currentMessage, setCurrentMessage] = useState(OFFERS_MESSAGES[0]);
  const [isSnappedLeft, setIsSnappedLeft] = useState(false);

  const pickRandomMessage = () => {
    const randomIndex = Math.floor(Math.random() * OFFERS_MESSAGES.length);
    setCurrentMessage(OFFERS_MESSAGES[randomIndex]);
  };

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context: any) => { 
      context.startX = x.value; 
      context.startY = y.value; 
    },
    onActive: (event, context) => { 
      let nextX = context.startX + event.translationX; 
      let nextY = context.startY + event.translationY; 
      
      // الجدار الصلب أثناء السحب: نمنع الزر من تجاوز أعلى وأسفل الشاشة
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
      
      // ارتداد ناعم لليمين أو اليسار
      x.value = withSpring(targetX, { damping: 15, stiffness: 120 });
      
      // ارتداد ناعم لمحور الصادات مع تأكيد البقاء ضمن الحدود
      let targetY = y.value;
      if (targetY < MIN_Y) targetY = MIN_Y;
      if (targetY > MAX_Y) targetY = MAX_Y;
      y.value = withSpring(targetY, { damping: 15, stiffness: 120 });
      
      runOnJS(pickRandomMessage)();
    }, 
  });

  const animatedStyle = useAnimatedStyle(() => ({
    // نتحرك بناءً على مكان الدائرة المطلق
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    // العنصر العائم المتحرك هو فقط الدائرة (مساحتها 56x56)، الباقي يتبعها
    <Animated.View style={[styles.absoluteWrapper, animatedStyle]}>
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={styles.panWrapper}>
          <Pressable onPress={() => router.push('/offers')} style={styles.pressableArea}>
            
            {/* الدائرة الرئيسية فقط */}
            <LinearGradient
              colors={['#FF416C', '#FF4B2B']}
              style={styles.circle}
            >
              <MaterialIcons name="local-fire-department" size={28} color="#fff" />
            </LinearGradient>

            {/* سحر الفقاعة: موقعها ثابت بالنسبة للدائرة، تظهر يمين أو يسار بناءً على اللصق */}
            <View style={[
              styles.bubbleMasterContainer,
              isSnappedLeft 
                ? { left: BUTTON_SIZE, flexDirection: 'row' } // إذا لزق يسار، الفقاعة تطلع لليمين
                : { right: BUTTON_SIZE, flexDirection: 'row-reverse' } // إذا لزق يمين، الفقاعة تطلع لليسار
            ]}>
              
              {/* ذيل الرسالة (النقاط) */}
              <View style={[
                styles.tailContainer, 
                isSnappedLeft ? { marginLeft: 4, flexDirection: 'row' } : { marginRight: 4, flexDirection: 'row-reverse' }
              ]}>
                <View style={styles.smallDot} />
                <View style={styles.bigDot} />
              </View>

              {/* النص المنسق */}
              <View style={[styles.textBubble, isSnappedLeft ? { marginLeft: 6 } : { marginRight: 6 }]}>
                <Text style={styles.bubbleText} numberOfLines={1}>{currentMessage}</Text>
              </View>
              
            </View>

          </Pressable>
        </Animated.View>
      </PanGestureHandler>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // الغلاف الأساسي للدائرة المنطلقة من زاوية (0,0) للشاشة
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
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.35, 
    shadowRadius: 5,
    elevation: 8,
  },
  
  // الغلاف العائم للفقاعة، يأخذ ارتفاع الدائرة ليتوسطها عمودياً بشكل تلقائي
  bubbleMasterContainer: {
    position: 'absolute',
    height: BUTTON_SIZE,
    alignItems: 'center',
    width: 200, // مساحة وهمية واسعة لمنع انضغاط النص (لا تظهر ولا تأخذ مساحة فعلية)
  },
  tailContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bigDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4B2B',
  },
  smallDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF416C',
  },
  textBubble: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 4, 
    elevation: 5,
    borderWidth: 1,
    borderColor: '#FFE4E6',
    // حد أقصى للعرض لحماية الشاشات الصغيرة جداً
    maxWidth: SCREEN_WIDTH - BUTTON_SIZE - SIDE_PADDING * 3, 
  },
  bubbleText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '900',
  }
});