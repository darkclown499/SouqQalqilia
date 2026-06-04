import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CategoryCard, EmptyState } from '@/components';
import { SkeletonCategoriesGrid } from '@/components/feature/SkeletonCard';
import { useCategories } from '@/hooks/useCategories';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { categories, loading } = useCategories();

  const handlePress = useCallback((cat: any) => {
    const localizedName = getCategoryName(cat, language);
    router.push(`/category/${cat.slug}?categoryId=${cat.id}&name=${encodeURIComponent(localizedName)}`);
  }, [language, router]);

  const renderItem = useCallback(({ item }: any) => (
    <View style={styles.cardWrapper}>
      <CategoryCard category={item} onPress={handlePress} />
    </View>
  ), [handlePress]);

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
          data={categories}
          keyExtractor={item => item.id}
          numColumns={2}
          renderItem={renderItem}
          contentContainerStyle={styles.grid}
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
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 2 },
  subtitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6,
  },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
  grid: { padding: Spacing.lg, gap: Spacing.md },
  cardWrapper: { flex: 1, padding: 4 },
});
