import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const { showAlert } = useAlert();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ التحقق البسيط: هل الصفحة تعمل؟
  useEffect(() => {
    console.log('✅ AdminScreen mounted successfully');
  }, []);

  // ✅ أزرار اختبارية لفحص الوظائف
  const handleTestPress = () => {
    showAlert(
      isAr ? 'اختبار' : 'Test',
      isAr ? 'صفحة الإدارة تعمل ✅' : 'Admin page is working ✅'
    );
  };

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{isAr ? 'خطأ' : 'Error'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => setError(null)}
          >
            <Text style={styles.retryBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isAr ? 'لوحة الإدارة' : 'Admin Panel'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* المحتوى */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isAr ? 'مرحباً بك في لوحة الإدارة' : 'Welcome to Admin Panel'}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="check-circle" size={32} color="#16a34a" />
          <Text style={[styles.cardText, { color: colors.textPrimary }]}>
            {isAr ? '✅ الصفحة تعمل بشكل صحيح' : '✅ Page is working correctly'}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {isAr ? 'الآن يمكنك إضافة الميزات تدريجياً' : 'Now you can add features gradually'}
          </Text>
        </View>

        {/* أزرار اختبارية */}
        <View style={styles.buttonsRow}>
          <Pressable
            style={[styles.testBtn, { backgroundColor: colors.primary }]}
            onPress={handleTestPress}
          >
            <MaterialIcons name="notifications" size={20} color="#fff" />
            <Text style={styles.testBtnText}>{isAr ? 'اختبار الإشعار' : 'Test Alert'}</Text>
          </Pressable>

          <Pressable
            style={[styles.testBtn, { backgroundColor: '#F59E0B' }]}
            onPress={() => setLoading(true)}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="refresh" size={20} color="#fff" />
                <Text style={styles.testBtnText}>{isAr ? 'محاكاة التحميل' : 'Simulate Loading'}</Text>
              </>
            )}
          </Pressable>
        </View>

        {loading && (
          <View style={[styles.loadingCard, { backgroundColor: colors.surfaceTint }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              {isAr ? 'جاري التحميل...' : 'Loading...'}
            </Text>
            <Pressable onPress={() => setLoading(false)}>
              <Text style={[styles.resetText, { color: colors.primary }]}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            {isAr
              ? '💡 هذه صفحة إدارة مبسطة. أضف ميزاتك تدريجياً للتأكد من أن كل شيء يعمل.'
              : '💡 This is a simplified admin page. Add features gradually to ensure everything works.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
  },
  cardText: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardSub: {
    fontSize: 14,
    textAlign: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  testBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingCard: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoBox: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});