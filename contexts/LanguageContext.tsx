import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { Language, translations, Translations } from '@/constants/i18n';

const STORAGE_KEY = '@marketplace_language';

interface LanguageContextType {
  language: Language;
  t: Translations;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
}

export const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  t: translations.en,
  isRTL: false,
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ar');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'ar' || val === 'en') {
        setLanguageState(val as Language);
      }
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const isRTL = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, t: translations[language], isRTL, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
