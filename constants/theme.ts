// Design tokens — supports light and dark modes

export const LightColors = {
  // Brand
  primary: '#0A6E5C',
  primaryDark: '#075247',
  primaryLight: '#0D9176',
  primaryGhost: '#0A6E5C18',

  // Accent — warm amber
  accent: '#F59E0B',
  accentDark: '#D97706',
  accentLight: '#FEF3C7',
  accentGhost: '#F59E0B15',

  // Neutral backgrounds
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceTint: '#F0FAF7',
  surfaceElevated: '#FFFFFF',
  cardSurface: '#FFFFFF',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Borders & dividers
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Semantic
  success: '#10B981',
  successLight: '#D1FAE5',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',

  // UI chrome
  overlay: 'rgba(15,23,42,0.55)',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabBarActive: '#0A6E5C',
  tabBarInactive: '#94A3B8',

  // Gradients
  gradientPrimaryStart: '#0A6E5C',
  gradientPrimaryEnd: '#0D9176',
};

export const DarkColors = {
  // Brand — slightly lightened for dark bg legibility
  primary: '#0DB896',
  primaryDark: '#0A9278',
  primaryLight: '#10D4AE',
  primaryGhost: '#0DB89622',

  // Accent — warm amber unchanged
  accent: '#F59E0B',
  accentDark: '#D97706',
  accentLight: '#3A2E0A',
  accentGhost: '#F59E0B18',

  // Neutral backgrounds
  background: '#0F1117',
  surface: '#1A1D27',
  surfaceTint: '#162320',
  surfaceElevated: '#212435',
  cardSurface: '#1E2130',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#4B5563',
  textInverse: '#0F172A',

  // Borders & dividers
  border: '#2A2D3A',
  borderLight: '#1E2130',

  // Semantic
  success: '#10B981',
  successLight: '#0A2E1F',
  error: '#EF4444',
  errorLight: '#2E0F0F',
  warning: '#F59E0B',
  warningLight: '#3A2E0A',

  // UI chrome
  overlay: 'rgba(0,0,0,0.72)',
  tabBar: '#1A1D27',
  tabBarBorder: '#2A2D3A',
  tabBarActive: '#0DB896',
  tabBarInactive: '#4B5563',

  // Gradients
  gradientPrimaryStart: '#0A6E5C',
  gradientPrimaryEnd: '#0DB896',
};

// Default export for backwards compat (overridden at runtime by ThemeContext)
export const Colors = LightColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  xxxl: 56,
};

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const FontSize = {
  xs: 12,   // was 11 — minimum readable size
  sm: 14,   // was 13 — body secondary text
  md: 16,   // was 15 — standard body (WCAG AA baseline)
  lg: 18,   // was 17 — section headings
  xl: 21,   // was 20 — page titles
  xxl: 26,  // was 24 — hero numbers & prices
  xxxl: 32, // was 30 — large display
  display: 38, // was 36
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadow = {
  xs: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  lg: {
    shadowColor: '#0A6E5C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  colored: {
    shadowColor: '#0A6E5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};

export type ColorScheme = typeof LightColors;
