import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

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
    onEnd: () => { 
      x.value = withSpring(0); 
      y.value = withSpring(0); 
    }, 
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <Pressable onPress={() => router.push('/offers')} style={styles.clickableArea}>
          
          {/* فقاعة الإشعار الجانبية (Messenger Notification Pop) */}
          <View style={styles.textBubble}>
            <Text style={styles.bubbleText}>عروض حصرية 🔥</Text>
          </View>

          {/* الدائرة الرئيسية (أيقونة النار مع التدرج) */}
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
    bottom: 140, // يرتفع فوق التابات السفلية لتجنب تداخل الضغطات
    right: 16, 
    zIndex: 99999,
  },
  clickableArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  circle: { 
    width: 56, 
    height: 56, 
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
    borderBottomRightRadius: 4, // اللمسة السحرية لتعطي شكل ذيل الفقاعة باتجاه الدائرة
    marginRight: -4, // تداخل بسيط وبأناقة مع الدائرة الأساسية لتبدو متصلة بها
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