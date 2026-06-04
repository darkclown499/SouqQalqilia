import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.sm) / 2;
const CONTENT_W = width - Spacing.lg * 2;
const BANNER_H = Math.round(CONTENT_W * (720 / 1280));

interface SkeletonBoxProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
  shimmerColor: string;
  baseColor: string;
}

function SkeletonBox({ width: w = '100%', height, borderRadius = Radius.sm, style, shimmerColor, baseColor }: SkeletonBoxProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.4],
  });

  return (
    <Animated.View
      style={[{ width: w as any, height, borderRadius, backgroundColor: baseColor, opacity }, style]}
    />
  );
}

interface SkeletonCardProps {
  width?: number;
}

export function SkeletonCard({ width: cardWidth = CARD_WIDTH }: SkeletonCardProps) {
  const { colors } = useTheme();
  const baseColor = colors.surfaceTint;
  const shimmerColor = colors.border;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, width: cardWidth }]}>
      <SkeletonBox height={148} borderRadius={0} baseColor={baseColor} shimmerColor={shimmerColor} />
      <View style={styles.info}>
        <SkeletonBox height={13} width="90%" borderRadius={Radius.xs} baseColor={baseColor} shimmerColor={shimmerColor} style={{ marginBottom: 6 }} />
        <SkeletonBox height={11} width="60%" borderRadius={Radius.xs} baseColor={baseColor} shimmerColor={shimmerColor} style={{ marginBottom: 10 }} />
        <View style={styles.row}>
          <SkeletonBox height={18} width={64} borderRadius={Radius.full} baseColor={baseColor} shimmerColor={shimmerColor} />
          <SkeletonBox height={11} width={32} borderRadius={Radius.xs} baseColor={baseColor} shimmerColor={shimmerColor} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const { colors } = useTheme();
  const items = Array.from({ length: count });

  return (
    <View style={[styles.grid, { padding: Spacing.lg }]}>
      {items.map((_, i) => (
        <View key={i} style={[styles.wrapper, i % 2 === 0 ? { marginRight: Spacing.sm / 2 } : { marginLeft: Spacing.sm / 2 }]}>
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}

// ── Full Home Screen Skeleton ─────────────────────────────────────────────────
export function SkeletonHomeFeed() {
  const { colors } = useTheme();
  const baseColor = colors.surfaceTint;
  const shimmerColor = colors.border;

  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing.lg }}>
      {/* Banner skeleton */}
      <View style={{ marginBottom: Spacing.lg + 4, marginTop: Spacing.md }}>
        <SkeletonBox height={BANNER_H} borderRadius={16} baseColor={baseColor} shimmerColor={shimmerColor} />
      </View>

      {/* Section title: Categories */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
        <SkeletonBox height={16} width={90} borderRadius={6} baseColor={baseColor} shimmerColor={shimmerColor} />
        <SkeletonBox height={13} width={52} borderRadius={6} baseColor={baseColor} shimmerColor={shimmerColor} />
      </View>

      {/* Category chips row */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.lg }}>
        {[60, 76, 68, 56, 72].map((w, i) => (
          <SkeletonBox key={i} height={34} width={w} borderRadius={99} baseColor={baseColor} shimmerColor={shimmerColor} />
        ))}
      </View>

      {/* Section title: Latest listings */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm }}>
        <SkeletonBox height={16} width={110} borderRadius={6} baseColor={baseColor} shimmerColor={shimmerColor} />
        <SkeletonBox height={20} width={32} borderRadius={99} baseColor={baseColor} shimmerColor={shimmerColor} />
      </View>

      {/* Ad grid skeleton — 6 cards */}
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.wrapper, i % 2 === 0 ? { marginRight: Spacing.sm / 2 } : { marginLeft: Spacing.sm / 2 }]}>
            <SkeletonCard />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Category Screen Skeleton ──────────────────────────────────────────────────
export function SkeletonCategoryCard() {
  const { colors } = useTheme();
  const baseColor = colors.surfaceTint;
  const shimmerColor = colors.border;

  return (
    <View style={[styles.catCard, { backgroundColor: colors.surface }]}>
      <SkeletonBox height={52} width={52} borderRadius={26} baseColor={baseColor} shimmerColor={shimmerColor} style={{ marginBottom: 12 }} />
      <SkeletonBox height={13} width="72%" borderRadius={6} baseColor={baseColor} shimmerColor={shimmerColor} style={{ marginBottom: 6 }} />
      <SkeletonBox height={11} width="45%" borderRadius={6} baseColor={baseColor} shimmerColor={shimmerColor} />
    </View>
  );
}

export function SkeletonCategoriesGrid({ count = 10 }: { count?: number }) {
  return (
    <View style={[styles.grid, { padding: Spacing.lg, gap: Spacing.md }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.wrapper, i % 2 === 0 ? { marginRight: Spacing.sm / 2 } : { marginLeft: Spacing.sm / 2 }]}>
          <SkeletonCategoryCard />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  info: { padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wrapper: { flex: 1, marginBottom: Spacing.sm },
  catCard: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 130,
    justifyContent: 'center',
  },
});
