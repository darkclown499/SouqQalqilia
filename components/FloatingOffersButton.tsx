import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_WIDTH = 56; // عرض الدائرة
const SIDE_PADDING = 16; // المسافة من الحافة

// نقاط الارتكاز الطبيعية على الأطراف
const SNAP_RIGHT = 0;
const SNAP_LEFT = -(SCREEN_WIDTH - BUTTON_WIDTH - (SIDE_PADDING * 2));

export default function FloatingOffersButton() {
  const router = useRouter();
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context: any) => { 
      context.startX = x.value; 
      context.startY = y.value; 
    },
    onActive: (event, context) => { 
      x.value = context.startX + event.translationX; 
      y.value = context.startY + event.translationY; 
    },
    onEnd: (event) => {
      // حساب النقطة النهائية بناءً على سرعة ومكان السحب
      const finalX = x.value + event.velocityX * 0.1;
      
      // تحديد المنتصف: هل أصبعك أقرب لليمين ولا للشمال؟
      const midpoint = SNAP_LEFT / 2;
      
      if (finalX < midpoint) {
        x.value = withSpring(SNAP_LEFT, { damping: 15 }); // تلصق على الطرف الشمال
      } else {
        x.value = withSpring(SNAP_RIGHT, { damping: 15 }); // ترجع على الطرف اليمين
      }
      
      // هنا جعلنا الـ Y تثبت مكانها اللي تركتها فيه بدلاً من التصفير
      y.value = withSpring(y.value, { damping: 15 });
    }, 
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <Pressable onPress={() => router.push('/offers')} style={styles.clickableArea}>
          
          {/* فقاعة الإشعار الجانبية */}
          <View style={styles.textBubble}>
            <Text style={styles.bubbleText}>عروض حصرية 🔥</Text>
          </View>

          {/* الدائرة الرئيسية (أيقونة النار) */}
          <LinearGradient
            colors={['#FF416C', '#FF4B2B']}
            style={styles.circle}
          >
            <MaterialIcons name="local-fire-department" size={28} color="#fff" />
          </LinearGradient>

        </Pressable>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'absolute', 
    bottom: 140, 
    right: SIDE_PADDING, 
    zIndex: 99999,
  },
  clickableArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
    elevation: 8 
  },
  textBubble: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    marginRight: -4,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 3, 
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  bubbleText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  }
});