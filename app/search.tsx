
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Dimensions,
  ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AdCard, EmptyState } from '@/components';
import { useFavoriteIds } from '@/hooks/useFavorites';
import { useAds } from '@/hooks/useAds';
import { useCategories } from '@/hooks/useCategories';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.sm) / 2;
const HISTORY_KEY = 'search_history_v1';
const MAX_HISTORY = 6;

type Condition = 'new' | 'used' | null;

const QALQILYA_LOCATIONS = [
  'قلقيلية المدينة', 'عزون', 'كفر قدوم', 'جيوس', 'حبلة', 'كفر ثلث',
  'عزون عتمة', 'إماتين', 'كفر لاقف', 'النبي إلياس', 'جيت', 'جينصافوط',
  'حجة', 'باقة الحطب', 'الفندق', 'راس عطية', 'راس الطيرة', 'صير',
  'فلامية', 'مغارة الضبعة', 'عزبة الطبيب', 'عزبة سلمان',
  'عزبة الأشقر', 'واد الرشا', 'المدور',
];

async function loadHistory(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
async function saveToHistory(q: string, prev: string[]): Promise<string[]> {
  const trimmed = q.trim();
  if (!trimmed) return prev;
  const updated = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}
async function clearHistory(): Promise<void> { await AsyncStorage.removeItem(HISTORY_KEY); }

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; categoryId?: string }>();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { categories } = useCategories();
  const { ads, loading, loadingMore, hasMore, load, loadMore } = useAds();
  const { ids: favIds, toggle: toggleFav } = useFavoriteIds();
  const isAr = language === 'ar';

  const [query, setQuery] = useState(params.q ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.categoryId ?? null);
  const [maxPrice, setMaxPrice] = useState('');
  const [condition, setCondition] = useState<Condition>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveFilters = !!(selectedCategory || maxPrice || condition || selectedArea);

  useEffect(() => { loadHistory().then(setHistory); }, []);
  useEffect(() => {
    setShowHistory(!hasSearched && query.length === 0 && history.length > 0);
  }, [query, hasSearched, history]);

  const doSearch = useCallback(async (q?: string) => {
    const searchQ = (q ?? query).trim();
    setHasSearched(true);
    setShowHistory(false);
    if (searchQ) {
      const updated = await saveToHistory(searchQ, history);
      setHistory(updated);
    }
    load({
      search: searchQ || undefined,
      categoryId: selectedCategory ?? undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      condition: condition ?? undefined,
      location: selectedArea ?? undefined,
    });
  }, [query, selectedCategory, maxPrice, condition, selectedArea, history, load]);

  const handleQueryChange = useCallback((v: string) => {
    setQuery(v);
    if (!v) { setHasSearched(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setHasSearched(true);
        setShowHistory(false);
        load({
          search: v.trim(),
          categoryId: selectedCategory ?? undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
          condition: condition ?? undefined,
          location: selectedArea ?? undefined,
        });
      }, 300);
    }
  }, [selectedCategory, maxPrice, condition, selectedArea, load]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadMore({
        search: query.trim() || undefined,
        categoryId: selectedCategory ?? undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        condition: condition ?? undefined,
        location: selectedArea ?? undefined,
      });
    }
  }, [loadingMore, hasMore, query, selectedCategory, maxPrice, condition, selectedArea, loadMore]);

  useEffect(() => { doSearch(); }, []);

  const handleHistoryTap = useCallback((item: string) => {
    setQuery(item);
    doSearch(item);
  }, [doSearch]);

  const handleClearHistory = useCallback(async () => {
    await clearHistory(); setHistory([]); setShowHistory(false);
  }, []);

  const renderAd = useCallback(({ item }: any) => (
    <View style={styles.adWrapper}>
      <AdCard
        ad={item}
        width={CARD_WIDTH}
        isFavorited={favIds.has(item.id)}
        onFavoritePress={user ? toggleFav : undefined}
      />
    </View>
  ), [favIds, user, toggleFav]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
        </Pressable>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <MaterialIcons name="search" size={17} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t.searchListings}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleQueryChange}
            onSubmitEditing={() => doSearch()}
            onFocus={() => { if (!query && history.length > 0) setShowHistory(true); }}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { setQuery(''); setHasSearched(false); }} hitSlop={6}>
              <MaterialIcons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable style={[styles.searchBtn, { backgroundColor: colors.accent }]} onPress={() => doSearch()}>
          <Text style={styles.searchBtnText}>{t.goSearch}</Text>
        </Pressable>
        <Pressable
          style={[styles.filterIconBtn, { backgroundColor: hasActiveFilters ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)' }]}
          onPress={() => setFilterVisible(true)}
          hitSlop={4}
        >
          <MaterialIcons name="tune" size={20} color="#fff" />
          {hasActiveFilters ? <View style={styles.filterActiveDot} /> : null}
        </Pressable>
      </View>

      {/* ── SEARCH HISTORY ── */}
      {showHistory ? (
        <View style={[styles.historyPanel, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.md, zIndex: 50 }]}>
          <View style={[styles.historyHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
            <MaterialIcons name="history" size={15} color={colors.textMuted} />
            <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>{isAr ? 'البحث الأخير' : 'Recent Searches'}</Text>
            <Pressable onPress={handleClearHistory} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <Text style={[styles.clearText, { color: colors.error }]}>{isAr ? 'مسح الكل' : 'Clear all'}</Text>
            </Pressable>
          </View>
          {history.map((item, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.historyItem, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: pressed ? colors.surfaceTint : 'transparent' }]}
              onPress={() => handleHistoryTap(item)}
            >
              <MaterialIcons name="north-west" size={14} color={colors.textMuted} style={{ transform: [{ rotate: isRTL ? '90deg' : '0deg' }] }} />
              <Text style={[styles.historyItemText, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{item}</Text>
              <Pressable onPress={() => { const u = history.filter((_, idx) => idx !== i); setHistory(u); AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(u)); }} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <MaterialIcons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── RESULTS LIST ── */}
      <FlatList
        data={ads}
        keyExtractor={item => item.id}
        numColumns={2}
        renderItem={renderAd}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={styles.columnWrapper}
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={8}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.loadingMoreText, { color: colors.textMuted }]}>{isAr ? 'جاري التحميل...' : 'Loading more...'}</Text>
            </View>
          ) : hasMore ? null : (ads.length > 0 ? (
            <View style={styles.endOfList}>
              <MaterialIcons name="check-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.endOfListText, { color: colors.textMuted }]}>{isAr ? 'تم عرض جميع النتائج' : 'All results shown'}</Text>
            </View>
          ) : null)
        }
        ListHeaderComponent={
          hasSearched ? (
            <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name={loading ? 'sync' : 'format-list-bulleted'} size={14} color={colors.textMuted} />
              <Text style={[styles.resultsText, { color: colors.textMuted }]}>
                {loading ? t.searching : `${ads.length} ${ads.length !== 1 ? t.results : t.result}`}
              </Text>
              {selectedArea ? (
                <View style={[styles.activeFiltersBadge, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="location-on" size={11} color={colors.primary} />
                  <Text style={[styles.activeFiltersText, { color: colors.primary }]} numberOfLines={1}>{selectedArea}</Text>
                </View>
              ) : hasActiveFilters ? (
                <View style={[styles.activeFiltersBadge, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="tune" size={11} color={colors.primary} />
                  <Text style={[styles.activeFiltersText, { color: colors.primary }]}>{isAr ? 'فلاتر نشطة' : 'Filters active'}</Text>
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          hasSearched && !loading ? (
            <EmptyState icon="search-off" title={t.noResults} subtitle={t.noResultsSub} />
          ) : null
        }
      />

      {/* ── FILTER BOTTOM SHEET — rendered AFTER FlatList to appear on top ── */}
      {filterVisible ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]} pointerEvents="box-none">
          <Pressable style={sStyles.overlay} onPress={() => setFilterVisible(false)} />
          <View style={[sStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[sStyles.handle, { backgroundColor: colors.border }]} />

            <View style={[sStyles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="tune" size={20} color={colors.primary} />
              <Text style={[sStyles.sheetTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'فلترة النتائج' : 'Filter Results'}
              </Text>
              <Pressable onPress={() => { setSelectedCategory(null); setMaxPrice(''); setCondition(null); setSelectedArea(null); }} hitSlop={8}>
                <Text style={[sStyles.clearAll, { color: colors.error }]}>{isAr ? 'مسح الكل' : 'Clear all'}</Text>
              </Pressable>
            </View>

            {/* Category */}
            <Text style={[sStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'التصنيف' : 'Category'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[sStyles.chipsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={[sStyles.chip, { backgroundColor: selectedCategory === null ? colors.primary : colors.background, borderColor: selectedCategory === null ? colors.primary : colors.border }]} onPress={() => setSelectedCategory(null)}>
                <Text style={[sStyles.chipText, { color: selectedCategory === null ? '#fff' : colors.textSecondary }]}>{t.all}</Text>
              </Pressable>
              {categories.map(cat => (
                <Pressable key={cat.id} style={[sStyles.chip, { backgroundColor: selectedCategory === cat.id ? colors.primary : colors.background, borderColor: selectedCategory === cat.id ? colors.primary : colors.border }]} onPress={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}>
                  <View style={[sStyles.catDot, { backgroundColor: selectedCategory === cat.id ? '#fff' : cat.color }]} />
                  <Text style={[sStyles.chipText, { color: selectedCategory === cat.id ? '#fff' : colors.textSecondary }]}>{getCategoryName(cat, language)}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Condition */}
            <Text style={[sStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'الحالة' : 'Condition'}
            </Text>
            <View style={[sStyles.condRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {([null, 'new', 'used'] as Condition[]).map(c => {
                const label = c === null ? t.all : c === 'new' ? t.conditionNew : t.conditionUsed;
                const isSel = condition === c;
                return (
                  <Pressable key={c ?? 'all'} style={[sStyles.condChip, { flex: 1, backgroundColor: isSel ? colors.primary : colors.background, borderColor: isSel ? colors.primary : colors.border }]} onPress={() => setCondition(c)}>
                    {c !== null ? <MaterialIcons name={c === 'new' ? 'fiber-new' : 'recycling'} size={14} color={isSel ? '#fff' : colors.textMuted} /> : null}
                    <Text style={[sStyles.condText, { color: isSel ? '#fff' : colors.textSecondary, fontWeight: isSel ? '700' : '500' }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Area */}
            <Text style={[sStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'المنطقة أو القرية' : 'Area / Village'}
            </Text>
            <Pressable
              style={({ pressed }) => [sStyles.areaBtn, { borderColor: selectedArea ? colors.primary : colors.border, backgroundColor: pressed ? colors.primaryGhost : colors.background, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => setAreaPickerVisible(true)}
            >
              <View style={[sStyles.areaIcon, { backgroundColor: selectedArea ? colors.primary : colors.surfaceTint }]}>
                <MaterialIcons name={selectedArea === 'قلقيلية المدينة' ? 'location-city' : 'location-on'} size={14} color={selectedArea ? '#fff' : colors.textMuted} />
              </View>
              <Text style={[sStyles.areaText, { color: selectedArea ? colors.primary : colors.textMuted, flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                {selectedArea ?? (isAr ? 'جميع المناطق' : 'All areas')}
              </Text>
              {selectedArea ? (
                <Pressable onPress={() => setSelectedArea(null)} hitSlop={6}><MaterialIcons name="close" size={16} color={colors.primary} /></Pressable>
              ) : (
                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.textMuted} />
              )}
            </Pressable>

            {/* Max Price */}
            <Text style={[sStyles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'الحد الأقصى للسعر (₪)' : 'Max Price (₪)'}
            </Text>
            <TextInput
              style={[sStyles.priceInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={isAr ? 'أي سعر' : 'Any price'}
              placeholderTextColor={colors.textMuted}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
            />

            <Pressable style={[sStyles.applyBtn, { backgroundColor: colors.primary }]} onPress={() => { setFilterVisible(false); doSearch(); }}>
              <MaterialIcons name="search" size={18} color="#fff" />
              <Text style={sStyles.applyBtnText}>{isAr ? 'تطبيق وبحث' : 'Apply & Search'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── AREA PICKER — rendered last, highest zIndex ── */}
      {areaPickerVisible ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 200 }]} pointerEvents="box-none">
          <Pressable style={sStyles.overlay} onPress={() => setAreaPickerVisible(false)} />
          <View style={[sStyles.areaSheet, { backgroundColor: colors.surface }]}>
            <View style={[sStyles.handle, { backgroundColor: colors.border }]} />
            <View style={[sStyles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="location-on" size={20} color={colors.primary} />
              <Text style={[sStyles.sheetTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{isAr ? 'اختر المنطقة' : 'Select Area'}</Text>
              <Pressable onPress={() => setAreaPickerVisible(false)} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={sStyles.areaList}>
              <Pressable
                style={({ pressed }) => [sStyles.areaItem, { borderColor: selectedArea === null ? colors.primary : colors.borderLight, backgroundColor: selectedArea === null ? colors.primaryGhost : (pressed ? colors.surfaceTint : colors.background) }]}
                onPress={() => { setSelectedArea(null); setAreaPickerVisible(false); }}
              >
                <View style={[sStyles.areaItemIcon, { backgroundColor: selectedArea === null ? colors.primary : colors.surfaceTint }]}>
                  <MaterialIcons name="location-searching" size={16} color={selectedArea === null ? '#fff' : colors.textMuted} />
                </View>
                <Text style={[sStyles.areaItemText, { color: selectedArea === null ? colors.primary : colors.textPrimary, fontWeight: selectedArea === null ? '700' : '500' }]}>{isAr ? 'جميع المناطق' : 'All Areas'}</Text>
                {selectedArea === null ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}
              </Pressable>
              {QALQILYA_LOCATIONS.map(loc => {
                const isSel = selectedArea === loc;
                const isMainCity = loc === 'قلقيلية المدينة';
                return (
                  <Pressable
                    key={loc}
                    style={({ pressed }) => [sStyles.areaItem, { borderColor: isSel ? colors.primary : colors.borderLight, backgroundColor: isSel ? colors.primaryGhost : (pressed ? colors.surfaceTint : colors.background) }]}
                    onPress={() => { setSelectedArea(loc); setAreaPickerVisible(false); }}
                  >
                    <View style={[sStyles.areaItemIcon, { backgroundColor: isSel ? colors.primary : (isMainCity ? colors.primaryGhost : colors.surfaceTint) }]}>
                      <MaterialIcons name={isMainCity ? 'location-city' : 'location-on'} size={16} color={isSel ? '#fff' : (isMainCity ? colors.primary : colors.textMuted)} />
                    </View>
                    <Text style={[sStyles.areaItemText, { color: isSel ? colors.primary : colors.textPrimary, fontWeight: isSel ? '700' : '500', flex: 1 }]}>{loc}</Text>
                    {isMainCity && !isSel ? (
                      <View style={[sStyles.cityBadge, { backgroundColor: colors.primaryGhost }]}>
                        <Text style={[sStyles.cityBadgeText, { color: colors.primary }]}>{isAr ? 'مدينة' : 'City'}</Text>
                      </View>
                    ) : null}
                    {isSel ? <MaterialIcons name="check-circle" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    paddingBottom: Spacing.lg, gap: Spacing.sm,
  },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flex: 1, alignItems: 'center', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 46, gap: Spacing.sm, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: FontSize.md },
  searchBtn: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  filterIconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  filterActiveDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  historyPanel: { position: 'absolute', top: 80, left: 0, right: 0, borderBottomWidth: 1, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl, overflow: 'hidden' },
  historyHeader: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  historyTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  clearText: { fontSize: FontSize.xs, fontWeight: '700' },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 13, borderBottomWidth: 1 },
  historyItemText: { flex: 1, fontSize: FontSize.md },
  listContent: { padding: Spacing.lg },
  adWrapper: { flex: 1 },
  columnWrapper: { gap: Spacing.sm, marginBottom: Spacing.sm },
  loadMoreIndicator: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  loadingMoreText: { fontSize: FontSize.xs, fontWeight: '500' },
  endOfList: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  endOfListText: { fontSize: FontSize.sm, fontWeight: '500' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md, flexWrap: 'wrap' },
  resultsText: { fontSize: FontSize.sm, fontWeight: '500' },
  activeFiltersBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  activeFiltersText: { fontSize: FontSize.xs, fontWeight: '700' },
});

// ── Sheet Styles ──────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 12, gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  titleRow: { alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: 1 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  clearAll: { fontSize: FontSize.xs, fontWeight: '700' },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: -4 },
  chipsRow: { gap: Spacing.sm, paddingBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5 },
  chipText: { fontSize: FontSize.sm, fontWeight: '600' },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  condRow: { flexDirection: 'row', gap: Spacing.sm },
  condChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: Radius.md, borderWidth: 1.5 },
  condText: { fontSize: FontSize.sm },
  areaBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 11, paddingHorizontal: 12 },
  areaIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  areaText: { fontSize: FontSize.md, fontWeight: '600' },
  priceInput: { height: 48, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md },
  applyBtn: { height: 50, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, shadowColor: '#0A6E5C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
  areaSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24 },
  areaList: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  areaItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5 },
  areaItemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  areaItemText: { fontSize: FontSize.md },
  cityBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  cityBadgeText: { fontSize: 10, fontWeight: '700' },
});
