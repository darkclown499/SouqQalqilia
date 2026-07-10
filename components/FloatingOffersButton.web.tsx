import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const OFFERS_MESSAGES = [
  'عروض نار حصرية 🔥',
  'الحق عروض اليوم بسرعة! ⚡',
  'لقطات ما بتتفوت 🛍️',
  'تخفيضات خيالية الحين 📉',
  'حرررق أسعار بالداخل 🌶️',
  'شوف شو مجهزيلك اليوم 😉',
];

export default function FloatingOffersButton() {
  const router = useRouter();
  const [message] = useState(OFFERS_MESSAGES[0]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.push('/offers')}
        style={({ pressed }) => [styles.clickableArea, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.textBubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
        <LinearGradient colors={['#FF416C', '#FF4B2B']} style={styles.circle}>
          <MaterialIcons name="local-fire-department" size={28} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 160,
    right: 16,
    zIndex: 99999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clickableArea: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
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
    elevation: 8,
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
  },
});
