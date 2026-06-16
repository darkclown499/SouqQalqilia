/**
 * useResponsive — Central responsive layout hook
 *
 * Listens for Dimensions changes (orientation, fold/unfold, resizing on
 * iPad Split View / Stage Manager) and returns pre-computed layout tokens
 * that every screen / component can consume without duplicating logic.
 */

import { useState, useEffect, useMemo } from 'react';
import { Dimensions } from 'react-native';

// ── Breakpoints ──────────────────────────────────────────────────────────────
const BP_TABLET = 600;   // ≥600 → tablet single-column / 2-col grid
const BP_DESKTOP = 1024; // ≥1024 → 3-col grid, wider content cap

export type ScreenClass = 'phone' | 'tablet' | 'desktop';

export interface ResponsiveLayout {
  /** Live screen width */
  width: number;
  /** Live screen height */
  height: number;
  /** Responsive class */
  screenClass: ScreenClass;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True when width < height */
  isPortrait: boolean;
  /** Horizontal padding used by all content containers */
  hPad: number;
  /** Gap between cards in a grid row */
  cardGap: number;
  /** Width of a single card in a 2-column grid */
  cardWidth: number;
  /** Width of a single card in a 3-column grid (desktop) */
  cardWidthLg: number;
  /** Number of FlatList columns for the main ad feed */
  numColumns: number;
  /** Max content width (centered on large screens) */
  contentMaxWidth: number;
  /** Banner aspect height */
  bannerHeight: number;
  /** Category icon size */
  catIconSize: number;
  /** Category icon wrap size */
  catIconWrap: number;
  /** Login card max width */
  loginCardMaxWidth: number;
}

function compute(width: number, height: number): ResponsiveLayout {
  const screenClass: ScreenClass =
    width >= BP_DESKTOP ? 'desktop' : width >= BP_TABLET ? 'tablet' : 'phone';

  const isPhone = screenClass === 'phone';
  const isTablet = screenClass === 'tablet';
  const isDesktop = screenClass === 'desktop';
  const isPortrait = height > width;

  // Horizontal padding — scales with screen width
  const hPad = width < 375 ? 12 : width >= BP_DESKTOP ? 32 : width >= BP_TABLET ? 24 : 16;

  // Gap between grid cards
  const cardGap = width < 375 ? 8 : width >= BP_TABLET ? 12 : 10;

  // Number of columns: 2 on phone, 3 on tablet+, 4 on desktop
  const numColumns = isDesktop ? 4 : isTablet ? 3 : 2;

  // Card width for 2-col grid
  const cardWidth = Math.max(120, (width - hPad * 2 - cardGap) / 2);

  // Card width for multi-col grid (tablet/desktop)
  const contentMaxWidth = Math.min(width - hPad * 2, isDesktop ? 1200 : isTablet ? 900 : width - hPad * 2);
  const cardWidthLg = Math.max(120, (contentMaxWidth - cardGap * (numColumns - 1)) / numColumns);

  // Banner height: 16:9 ratio of usable content width, capped for large screens
  const usableW = width - hPad * 2;
  const bannerHeight = Math.round(Math.min(usableW, 800) * (9 / 16));

  // Category card icons
  const catIconSize = width < 375 ? 20 : isTablet ? 32 : 26;
  const catIconWrap = width < 375 ? 44 : isTablet ? 64 : 56;

  // Login card
  const loginCardMaxWidth = isTablet ? 480 : isDesktop ? 520 : width - 32;

  return {
    width, height, screenClass,
    isPhone, isTablet, isDesktop, isPortrait,
    hPad, cardGap, cardWidth, cardWidthLg,
    numColumns, contentMaxWidth, bannerHeight,
    catIconSize, catIconWrap,
    loginCardMaxWidth,
  };
}

export function useResponsive(): ResponsiveLayout {
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  return useMemo(() => compute(dims.width, dims.height), [dims.width, dims.height]);
}

/**
 * One-shot snapshot — safe to call at module level for StyleSheet.create().
 * Does NOT react to orientation changes; only use for static fallbacks.
 */
export function getResponsiveSnapshot(): ResponsiveLayout {
  const { width, height } = Dimensions.get('window');
  return compute(width, height);
}
