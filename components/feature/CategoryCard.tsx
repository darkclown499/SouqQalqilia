import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Category, getCategoryName } from '@/services/categoriesService';
import { Radius, FontSize, Spacing, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useResponsive } from '@/hooks/useResponsive';

interface CategoryCardProps {
  category: Category;
  onPress: (category: Category) => void;
}

export const CategoryCard = memo(function CategoryCard({ category, onPress }: CategoryCardProps) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { catIconSize, catIconWrap, isTablet, isDesktop } = useResponsive();
  const displayName = getCategoryName(category, language);

  const bodyPad = isTablet || isDesktop ? Spacing.lg : Spacing.md;
  const minH = isTablet || isDesktop ? 130 : 110;

  return (
    <Pressable
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          flex: 1,
          overflow: 'hidden' as const,
          ...Shadow.sm,
        },
        pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] },
      ]}
      onPress={() => onPress(category)}
    >
      <View style={[styles.stripe, { backgroundColor: category.color }]} />
      <View style={[styles.body, { padding: bodyPad, minHeight: minH }]}>
        <View style={[styles.iconWrap, { backgroundColor: category.color + '1A', width: catIconWrap, height: catIconWrap, borderRadius: Math.round(catIconWrap * 0.28) }]}>
          <MaterialIcons name={category.icon as any} size={catIconSize} color={category.color} />
        </View>
        <Text style={[styles.name, { color: colors.textPrimary, fontSize: isTablet || isDesktop ? FontSize.md : FontSize.sm }]} numberOfLines={2}>
          {displayName}
        </Text>
        <View style={[styles.arrow, { backgroundColor: category.color + '20' }]}>
          <MaterialIcons name="arrow-forward" size={isTablet ? 15 : 13} color={category.color} />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  stripe: { height: 5, width: '100%' },
  body: { alignItems: 'center', gap: Spacing.sm },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  arrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
