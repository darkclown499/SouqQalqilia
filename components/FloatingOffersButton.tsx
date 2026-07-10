import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function FloatingOffersButton() {
  const router = useRouter();
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context: any) => { context.startX = x.value; context.startY = y.value; },
    onActive: (event, context) => { x.value = context.startX + event.translationX; y.value = context.startY + event.translationY; },
    onEnd: () => { x.value = withSpring(0); y.value = withSpring(0); }, // ترجع لمكانها الأصلي
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={styles.bubble}>
          <Text style={styles.text}>🔥 عروض حصرية</Text>
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 100, right: 20, zIndex: 999 },
  bubble: { 
    backgroundColor: '#EF4444', paddingHorizontal: 15, paddingVertical: 10, 
    borderRadius: 25, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 6 
  },
  text: { color: '#fff', fontWeight: 'bold', marginLeft: 5 }
});
