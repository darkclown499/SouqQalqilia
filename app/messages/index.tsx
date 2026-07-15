// app/messages/index.tsx
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function MessagesRedirect() {
  const router = useRouter();

  useEffect(() => {
    // إعادة التوجيه إلى الصفحة الرئيسية (حيث يوجد الجرس)
    router.replace('/(tabs)');
  }, []);

  return null;
}
