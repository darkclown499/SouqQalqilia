// app/messages/index.tsx
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function MessagesRedirect() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    // تأخير بسيط لضمان اكتمال التنقل وتجنب التعارضات
    const timer = setTimeout(() => {
      // تحقق إضافي لمنع الحلقات اللانهائية (اختياري)
      // يمكن إضافة شرط للتحقق من المسار الحالي
      router.replace('/(tabs)');
      setRedirecting(false);
    }, 100); // تأخير 100 مللي ثانية

    return () => clearTimeout(timer);
  }, [router]);

  // عرض مؤشر تحميل بسيط أثناء التوجيه
  if (redirecting) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0A6E5C" />
        <Text style={styles.text}>جاري التوجيه...</Text>
      </View>
    );
  }

  // بعد التوجيه، يمكن إرجاع null أو عنصر فارغ
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
});