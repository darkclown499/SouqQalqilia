import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { AdCard, EmptyState, Button } from '@/components';
import { SkeletonGrid } from '@/components/feature/SkeletonCard';
import { useFavoriteAds, useFavoriteIds } from '@/hooks/useFavorites';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useResponsive } from '@/hooks/useResponsive';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { ads, loading, load } = useFavoriteAds();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const { numColumns, hPad, cardGap } = useResponsive();
  const isAr = language === 'ar';

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + Spacing.sm }]}>
          <Text style={styles.headerTitle}>{isAr ? 'المفضلة' : 'Favorites'}</Text>
        </View>
        <View style={styles.center}>
          <EmptyState
            icon="favorite-border"
            title={isAr ? 'سجل الدخول لعرض المفضلة' : 'Sign in to view favorites'}
            subtitle={isAr ? 'احفظ الإعلانات المفضلة لديك' : 'Save listings you love'}
          />
          <Button label={t.signInRegister} onPress={() => router.push('/login')} style={{ marginHorizontal: Spacing.xl }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + Spacing.sm }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color="#fff" />
        </Pressable>
        <View>
          <Text style={styles.headerSub}>{isAr ? 'قائمة' : 'Your'}</Text>
          <Text style={styles.headerTitle}>{isAr ? 'المفضلة' : 'Favorites'}</Text>
        </View>
        {ads.length > 0 ? (
          <View style={[styles.countBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.countText}>{ads.length}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={item => item.id}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={[styles.list, { padding: hPad }]}
          columnWrapperStyle={numColumns > 1 ? { gap: cardGap, marginBottom: cardGap } : undefined}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <View style={styles.adWrapper}>
              <AdCard
                ad={item}
                isFavorited={favIds.has(item.id)}
                onFavoritePress={toggleFav}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <EmptyState
                icon="favorite-border"
                title={isAr ? 'لا توجد مفضلات' : 'No favorites yet'}
                subtitle={isAr ? 'اضغط على القلب في أي إعلان لحفظه هنا' : 'Tap the heart on any listing to save it here'}
              />
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  countBadge: {
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 2, marginLeft: 'auto',
  },
  countText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
  list: { paddingBottom: 36 },
  adWrapper: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing.xl },
});
