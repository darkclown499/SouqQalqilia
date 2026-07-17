import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
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
  const { categories, loading, error, refetch } = useCategories();
  const { numColumns, hPad } = useResponsive();

  // ✅ حالة البحث
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // منع النقر المتكرر
  const isNavigating = useRef(false);

  // ✅ تصفية التصنيفات بناءً على البحث
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories ?? [];
    const query = searchQuery.trim().toLowerCase();
    return (categories ?? []).filter((cat) => {
      const name = getCategoryName(cat, language);
      return name.toLowerCase().includes(query);
    });
  }, [categories, searchQuery, language]);

  const handlePress = useCallback(
    (cat: any) => {
      if (isNavigating.current) return;
      isNavigating.current = true;

      const localizedName = getCategoryName(cat, language);
      router.push(
        `/category/${cat.slug}?categoryId=${cat.id}&name=${encodeURIComponent(
          localizedName
        )}&type=product`
      );

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

  // ✅ دالة التحديث (Pull-to-Refresh)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // عرض خطأ إذا فشل التحميل مع زر إعادة المحاولة
  if (error) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.headerSub}>{t.browse}</Text>
            <Text style={styles.subtitle}>{t.allCategories}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{categories?.length ?? 0}</Text>
          </View>
        </View>
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '15' }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {t.errorLoadingCategories || 'حدث خطأ أثناء تحميل التصنيفات'}
          </Text>
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
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.headerSub}>{t.browse}</Text>
          <Text style={styles.subtitle}>{t.allCategories}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categories?.length ?? 0}</Text>
        </View>
      </View>

      {/* ✅ شريط البحث */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <MaterialIcons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={t.searchCategories || 'ابحث في التصنيفات...'}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading && categories.length === 0 ? (
        <SkeletonCategoriesGrid count={10} />
      ) : (
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => String(item.id)}
          numColumns={numColumns}
          key={numColumns}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.gridContent,
            {
              paddingHorizontal: hPad,
              paddingVertical: Spacing.md,
              gap: Spacing.md,
              paddingBottom: insets.bottom + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={12}
          initialNumToRender={12}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon={searchQuery.trim() ? 'search-off' : 'category'}
                title={
                  searchQuery.trim()
                    ? t.noSearchResults || 'لا توجد نتائج'
                    : t.noCategories || 'لا توجد تصنيفات'
                }
                subtitle={
                  searchQuery.trim()
                    ? t.noSearchResultsSub ||
                      'جرب كلمة بحث مختلفة'
                    : t.noCategoriesSub || 'سيتم إضافة التصنيفات قريباً'
                }
              />
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
  // ✅ شريط البحث
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '500',
    paddingVertical: 0,
  },
  gridContent: {
    // الخصائص تُمرر في contentContainerStyle مباشرة
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