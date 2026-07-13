// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Web/SSR shims ────────────────────────────────────────────────────────────
const WEB_SHIMS = {
  'expo-constants': path.resolve(__dirname, 'shims/expo-constants.js'),
  'expo-splash-screen': path.resolve(__dirname, 'shims/expo-splash-screen.js'),
  'expo-web-browser': path.resolve(__dirname, 'shims/expo-web-browser.js'),
  'react-native-gesture-handler': path.resolve(__dirname, 'shims/react-native-gesture-handler.js'),
  'expo-router/node/render': path.resolve(__dirname, 'shims/empty.js'),
};

const EMPTY_SHIM_MODULES = new Set([
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint',
]);

const EMPTY_SHIM_PATH = path.resolve(__dirname, 'shims/empty.js');

// ── Custom resolver ──────────────────────────────────────────────────────────
const originalResolver = config.resolver?.resolveRequest;

config.resolver = config.resolver || {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // الحماية الأساسية: تأكيد تطبيق الاستبدال فقط على الويب (Web) وليس الموبايل
  if (platform === 'web') {
    for (const [shimKey, shimPath] of Object.entries(WEB_SHIMS)) {
      if (moduleName === shimKey || moduleName.startsWith(shimKey + '/')) {
        return { filePath: shimPath, type: 'sourceFile' };
      }
    }

    for (const pkg of EMPTY_SHIM_MODULES) {
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        return { filePath: EMPTY_SHIM_PATH, type: 'sourceFile' };
      }
    }
  }

  // السماح للموبايل بقراءة الملفات الأصلية بدون أي تدخل
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;