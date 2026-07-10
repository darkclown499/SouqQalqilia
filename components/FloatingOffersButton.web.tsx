import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
  const [currentMessage, setCurrentMessage] = useState(OFFERS_MESSAGES[0]);

  // تغيير الرسالة بشكل عشوائي كل 5 ثوانٍ على الويب ليلفت انتباه الزبون
  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * OFFERS_MESSAGES.length);
      setCurrentMessage(OFFERS_MESSAGES[randomIndex]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/offers')} style={styles.clickableArea}>
        
        {/* الدائرة الأساسية للنار مع تأثير حركي عند الحوم بالماوس (Hover) */}
        <View style={styles.circle}>
          <MaterialIcons name="local-fire-department" size={28} color="#fff" />
        </View>

        {/* ذيل الرسالة المحسن للويب (النقطتين) */}
        <View style={styles.tailContainer}>
          <View style={styles.bigDot} />
          <View style={styles.smallDot} />
        </View>

        {/* فقاعة الإشعار الأنيقة */}
        <View style={styles.textBubble}>
          <Text style={styles.bubbleText} numberOfLines={1}>{currentMessage}</Text>
        </View>

      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'absolute', 
    bottom: 140, 
    right: 24, 
    zIndex: 99999,
  },
  clickableArea: {
    flexDirection: 'row-reverse', // المحاذاة لليمين دائماً على الويب
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer', // تحويل الماوس لشكل يد عند الوقوف على الزر
    transition: 'transform 0.2s ease-in-out',
  },
  circle: { 
    width: 56, 
    height: 56, 
    borderRadius: 28,
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#FF4B2B',
    // تأثير الظل المتوافق مع المتصفحات (BoxShadow)
    boxShadow: '0px 4px 12px rgba(255, 75, 43, 0.3)',
  },
  tailContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 24,
    flexDirection: 'row-reverse',
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE4E6',
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.08)',
  },
  bubbleText: {
    color: '#E11D48',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  }
});