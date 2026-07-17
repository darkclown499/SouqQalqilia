import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CategoryCard, EmptyState } from '@/components';
import { SkeletonCategoriesGrid } from '@/components/feature/SkeletonCard';
import { useCategories } from '@/hooks/useCategories';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // ✅ إضافة refetch من الـ Hook (افترض أن الـ Hook يوفرها)
  const { categories, loading, error, refetch } = useCategories();
  const { numColumns, hPad } = useResponsive();

  // منع النقر المتكرر
  const isNavigating = useRef(false);

  const handlePress = useCallback(
    (cat: any) => {
      // ✅ منع النقر إذا كان القفل مفعّلاً
      if (isNavigating.current) return;
      isNavigating.current = true;

      const localizedName = getCategoryName(cat, language);
      
      // ✅ التنقل (router.push لا يعيد Promise في الإصدارات الحديثة)
      router.push(
        `/category/${cat.slug}?categoryId=${cat.id}&name=${encodeURIComponent(localizedName)}&type=product`
      );

      // ✅ فتح القفل بعد 300 مللي لمنع النقر المزدوج بشكل فعال
      setTimeout(() => {
        isNavigating.current = false;
      }, 300);
    },
    [language, router]
  );

  const renderItem = useCallback(
    ({ item }: any) => (
      <View style={styles.cardWrapper}>
        <CategoryCard category={item} onPress={handlePress} />
      </View>
    ),
    [handlePress]
  );

  // عرض خطأ إذا فشل التحميل مع زر إعادة المحاولة
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.headerSub}>{t.browse}</Text>
            <Text style={styles.subtitle}>{t.allCategories}</Text>
          </View>
        </View>
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '15' }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {t.errorLoadingCategories || 'حدث خطأ أثناء تحميل التصنيفات'}
          </Text>
          {/* ✅ إضافة زر إعادة المحاولة */}
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: colors.primary }]} 
            onPress={refetch}
          >
            <Text style={styles.retryText}>{t.retry || 'إعادة المحاولة'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.headerSub}>{t.browse}</Text>
          <Text style={styles.subtitle}>{t.allCategories}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categories.length}</Text>
        </View>
      </View>

      {loading && categories.length === 0 ? (
        <SkeletonCategoriesGrid count={10} />
      ) : (
        <FlatList
          // ✅ إضافة ?? [] لمنع التعطل إذا كانت البيانات null
          data={categories ?? []}
          // ✅ تحويل الـ ID إلى String لضمان التفرد
          keyExtractor={(item) => String(item.id)}
          numColumns={numColumns}
          key={numColumns}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.gridContent,
            { paddingHorizontal: hPad, paddingVertical: Spacing.md, gap: Spacing.md },
          ]}
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={12}
          initialNumToRender={12}
          removeClippedSubviews={true}
          ListEmptyComponent={
            !loading ? (
              <EmptyState icon="category" title={t.noCategories} subtitle={t.noCategoriesSub} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.lg,
  },
  // ✅ تم تغيير الاسم من 'grid' إلى 'gridContent' لتجنب الـ Style الفارغ
  gridContent: {
    // جميع الخصائص موجودة في contentContainerStyle مباشرة
  },
  cardWrapper: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    margin: Spacing.lg,
    borderRadius: Radius.lg,
  },
  errorText: {
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  // ✅ إضافة ستايلات زر إعادة المحاولة
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});