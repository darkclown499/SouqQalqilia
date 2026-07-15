import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AdminSimpleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>🔧 الإدارة (بسيطة)</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.bigText}>✅ شغال تمام!</Text>
        <Text style={styles.subText}>هذه صفحة إدارة جديدة بدون أي تعقيدات.</Text>
        <Pressable style={styles.testBtn} onPress={() => alert('الزر يعمل!')}>
          <Text style={styles.testBtnText}>اضغط للاختبار</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0A6E5C',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bigText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#16a34a',
    marginBottom: 12,
  },
  subText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  testBtn: {
    backgroundColor: '#0A6E5C',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  testBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
