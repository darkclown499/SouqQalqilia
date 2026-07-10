import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_WIDTH = 56; 
const SIDE_PADDING = 16; 

const SNAP_RIGHT = 0;
const SNAP_LEFT = -(SCREEN_WIDTH - BUTTON_WIDTH - (SIDE_PADDING * 2));

// الرسائل الستة العشوائية المميزة والمناسبة للسوق
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
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  
  // حالات التحكم بالرسالة العشوائية والاتجاه (يمين أو شمال)
  const [currentMessage, setCurrentMessage] = useState(OFFERS_MESSAGES[0]);
  const [isSnappedLeft, setIsSnappedLeft] = useState(false);

  // دالة لتغيير الرسالة بشكل عشوائي عند الارتداد
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
      x.value = context.startX + event.translationX; 
      
      // منع خروج الفقاعة من الشاشة علوياً وسفلياً (حدود الأمان)
      const nextY = context.startY + event.translationY;
      const topLimit = -100; // منع الاختفاء تحت الهيدر العلوي
      const bottomLimit = SCREEN_HEIGHT - 320; // منع الاختفاء تحت شريط التنقل السفلي
      
      if (nextY > topLimit && nextY < bottomLimit) {
        y.value = nextY;
      }
    },
    onEnd: (event) => {
      const finalX = x.value + event.velocityX * 0.1;
      const midpoint = SNAP_LEFT / 2;
      
      if (finalX < midpoint) {
        x.value = withSpring(SNAP_LEFT, { damping: 15 });
        runOnJS(setIsSnappedLeft)(true); // قلب الاتجاه للشمال
      } else {
        x.value = withSpring(SNAP_RIGHT, { damping: 15 });
        runOnJS(setIsSnappedLeft)(false); // قلب الاتجاه لليمين
      }
      
      y.value = withSpring(y.value, { damping: 15 });
      runOnJS(pickRandomMessage)(); // تغيير الرسالة فوراً عند ترك الزر
    }, 
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <Pressable 
          onPress={() => router.push('/offers')} 
          style={[
            styles.clickableArea, 
            { flexDirection: isSnappedLeft ? 'row' : 'row-reverse' } // السحر هنا: قلب العناصر حسب مكان اللصق
          ]}
        >
          
          {/* الدائرة الرئيسية (أيقونة النار) */}
          <LinearGradient
            colors={['#FF416C', '#FF4B2B']}
            style={styles.circle}
          >
            <MaterialIcons name="local-fire-department" size={28} color="#fff" />
          </LinearGradient>

          {/* ذيل الرسالة المميز (نقطة كبيرة ونقطة صغيرة) */}
          <View style={[styles.tailContainer, { flexDirection: isSnappedLeft ? 'row' : 'row-reverse' }]}>
            <View style={styles.bigDot} />
            <View style={styles.smallDot} />
          </View>

          {/* فقاعة الإشعار الجانبية بالرسالة العشوائية المحدثة */}
          <View style={[
            styles.textBubble,
            isSnappedLeft ? { marginLeft: -2, marginRight: 0 } : { marginRight: -2, marginLeft: 0 }
          ]}>
            <Text style={styles.bubbleText}>{currentMessage}</Text>
          </View>

        </Pressable>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'absolute', 
    bottom: 160, 
    right: SIDE_PADDING, 
    zIndex: 99999,
  },
  clickableArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: { 
    width: BUTTON_WIDTH, 
    height: BUTTON_WIDTH, 
    borderRadius: 28,
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 4,
    elevation: 8,
  },
  tailContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  bigDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4B2B',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  smallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF416C',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 1,
  },
  textBubble: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: 0.18, 
    shadowRadius: 4, 
    elevation: 5,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  bubbleText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  }
});