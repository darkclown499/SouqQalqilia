import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_WIDTH = 56; 
const SIDE_PADDING = 12; 

// حسابات دقيقة لأطراف الشاشة يمين ويسار
const SNAP_RIGHT = 0;
const SNAP_LEFT = -(SCREEN_WIDTH - BUTTON_WIDTH - (SIDE_PADDING * 2));

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
      x.value = context.startX + event.translationX; 
      
      // فتحنا حدود الأمان لفوق ولتحت عشان تتحرك براحتها بالكامل في الشاشة
      const nextY = context.startY + event.translationY;
      const topLimit = -SCREEN_HEIGHT + 350; // مسموح تطلع لفوق لقرب الهيدر بمرونة
      const bottomLimit = 40; // مسموح تنزل لغاية شريط التابات السفلي
      
      if (nextY > topLimit && nextY < bottomLimit) {
        y.value = nextY;
      }
    },
    onEnd: (event) => {
      const finalX = x.value + event.velocityX * 0.1;
      const midpoint = SNAP_LEFT / 2;
      
      if (finalX < midpoint) {
        x.value = withSpring(SNAP_LEFT, { damping: 18, stiffness: 120 });
        runOnJS(setIsSnappedLeft)(true);
      } else {
        x.value = withSpring(SNAP_RIGHT, { damping: 18, stiffness: 120 });
        runOnJS(setIsSnappedLeft)(false);
      }
      
      y.value = withSpring(y.value, { damping: 18, stiffness: 120 });
      runOnJS(pickRandomMessage)();
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
            { 
              flexDirection: isSnappedLeft ? 'row' : 'row-reverse',
              justifyContent: isSnappedLeft ? 'flex-start' : 'flex-end' // تعديل التموضع لمنع الاختفاء بالحافة
            }
          ]}
        >
          
          {/* الدائرة الرئيسية */}
          <LinearGradient
            colors={['#FF416C', '#FF4B2B']}
            style={styles.circle}
          >
            <MaterialIcons name="local-fire-department" size={28} color="#fff" />
          </LinearGradient>

          {/* ذيل الرسالة المحسن (النقطتين) */}
          <View style={[styles.tailContainer, { flexDirection: isSnappedLeft ? 'row' : 'row-reverse' }]}>
            <View style={styles.bigDot} />
            <View style={styles.smallDot} />
          </View>

          {/* فقاعة الإشعار المحمية من الحواف */}
          <View style={styles.textBubble}>
            <Text style={styles.bubbleText} numberOfLines={1}>{currentMessage}</Text>
          </View>

        </Pressable>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'absolute', 
    bottom: 140, // مكان البداية الافتراضي فوق التابات
    right: SIDE_PADDING, 
    zIndex: 99999,
    width: SCREEN_WIDTH - (SIDE_PADDING * 2), // حجز مساحة العرض بالكامل لمنع التفاف العناصر وخروجها
  },
  clickableArea: {
    alignItems: 'center',
    width: '100%',
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
    gap: 4,
    width: 24, // مساحة ثابتة للذيل لمنع اللخبطة وقت القلّب
  },
  bigDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4B2B',
  },
  smallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    maxWidth: SCREEN_WIDTH - 110, // حماية النص من العرض الزائد
  },
  bubbleText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '900',
  }
});