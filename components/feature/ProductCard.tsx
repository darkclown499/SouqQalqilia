import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    name_ar?: string;
    price: number;
    image_url?: string | null;
    is_available?: boolean;
    currency?: string;
  };
  onPress?: () => void;
  isFavorited?: boolean;
  onFavoritePress?: () => void;
}

export function ProductCard({
  product,
  onPress,
  isFavorited = false,
  onFavoritePress,
}: ProductCardProps) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  // اختيار الاسم حسب اللغة
  const displayName = isAr && product.name_ar ? product.name_ar : product.name;
  const isAvailable = product.is_available !== false; // افتراضي true إذا لم يُحدد

  // تنسيق السعر
  const currencySymbol = product.currency === 'USD' ? '$' : '₪';
  const formattedPrice = `${currencySymbol}${Number(product.price).toFixed(2)}`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
    >
      {/* صورة المنتج */}
      <View style={styles.imageWrapper}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="image" size={32} color={colors.textMuted} />
          </View>
        )}

        {/* شارة التوفر */}
        <View
          style={[
            styles.availabilityBadge,
            {
              backgroundColor: isAvailable ? '#DCFCE7' : '#FEE2E2',
            },
          ]}
        >
          <Text
            style={[
              styles.availabilityText,
              {
                color: isAvailable ? '#16A34A' : '#DC2626',
              },
            ]}
          >
            {isAvailable
              ? (isAr ? 'متوفر' : 'Available')
              : (isAr ? 'غير متوفر' : 'Out of Stock')}
          </Text>
        </View>

        {/* زر المفضلة (اختياري) */}
        {onFavoritePress && (
          <Pressable
            style={[styles.favButton, { backgroundColor: colors.surface }]}
            onPress={onFavoritePress}
            hitSlop={8}
          >
            <MaterialIcons
              name={isFavorited ? 'favorite' : 'favorite-border'}
              size={20}
              color={isFavorited ? colors.error : colors.textMuted}
            />
          </Pressable>
        )}
      </View>

      {/* اسم المنتج */}
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
        {displayName}
      </Text>

      {/* السعر */}
      <Text style={[styles.price, { color: colors.primary }]}>
        {formattedPrice}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    margin: 4,
    ...Shadow.xs,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  availabilityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  favButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.xs,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 2,
  },
  price: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
