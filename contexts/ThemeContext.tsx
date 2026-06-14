import React, { createContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors, ColorScheme, BASE_FONT_SIZE, applyFontScale } from '@/constants/theme';

const STORAGE_KEY_DARK = '@marketplace_dark_mode';
const STORAGE_KEY_FONT = '@marketplace_font_scale';

// Font scale levels: 0.85 / 1.0 / 1.15 / 1.30
export type FontScaleLevel = 0 | 1 | 2 | 3;
const SCALE_VALUES: Record<FontScaleLevel, number> = { 0: 0.85, 1: 1.0, 2: 1.15, 3: 1.30 };

/** Returns a scaled version of the FontSize token map */
function buildScaledFontSize(level: FontScaleLevel) {
  const mult = SCALE_VALUES[level];
  return {
    xs:      Math.round(BASE_FONT_SIZE.xs      * mult),
    sm:      Math.round(BASE_FONT_SIZE.sm      * mult),
    md:      Math.round(BASE_FONT_SIZE.md      * mult),
    lg:      Math.round(BASE_FONT_SIZE.lg      * mult),
    xl:      Math.round(BASE_FONT_SIZE.xl      * mult),
    xxl:     Math.round(BASE_FONT_SIZE.xxl     * mult),
    xxxl:    Math.round(BASE_FONT_SIZE.xxxl    * mult),
    display: Math.round(BASE_FONT_SIZE.display * mult),
  };
}

export type ScaledFontSize = ReturnType<typeof buildScaledFontSize>;

interface ThemeContextType {
  isDark: boolean;
  colors: ColorScheme;
  toggleTheme: () => void;
  fontScaleLevel: FontScaleLevel;
  setFontScaleLevel: (level: FontScaleLevel) => void;
  fontSize: ScaledFontSize;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: LightColors,
  toggleTheme: () => {},
  fontScaleLevel: 1,
  setFontScaleLevel: () => {},
  fontSize: buildScaledFontSize(1),
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [fontScaleLevel, setFontScaleLevelState] = useState<FontScaleLevel>(1);

  // Load persisted prefs
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_DARK),
      AsyncStorage.getItem(STORAGE_KEY_FONT),
    ]).then(([darkVal, fontVal]) => {
      if (darkVal === 'true') setIsDark(true);
      if (fontVal !== null) {
        const level = parseInt(fontVal, 10);
        if (level >= 0 && level <= 3) {
          setFontScaleLevelState(level as FontScaleLevel);
          applyFontScale(SCALE_VALUES[level as FontScaleLevel]); // apply persisted scale on startup
        }
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY_DARK, String(next));
      return next;
    });
  }, []);

  const setFontScaleLevel = useCallback((level: FontScaleLevel) => {
    setFontScaleLevelState(level);
    applyFontScale(SCALE_VALUES[level]); // mutate FontSize globally for all StyleSheet users
    AsyncStorage.setItem(STORAGE_KEY_FONT, String(level));
  }, []);

  const fontSize = useMemo(() => buildScaledFontSize(fontScaleLevel), [fontScaleLevel]);

  const value = useMemo<ThemeContextType>(() => ({
    isDark,
    colors: isDark ? DarkColors : LightColors,
    toggleTheme,
    fontScaleLevel,
    setFontScaleLevel,
    fontSize,
  }), [isDark, toggleTheme, fontScaleLevel, setFontScaleLevel, fontSize]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
