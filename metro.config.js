const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Shim map: module name → local shim file ───────────────────────────────
const WEB_SHIMS = {
  'expo-constants': path.resolve(__dirname, 'shims/expo-constants.js'),
  'expo-splash-screen': path.resolve(__dirname, 'shims/expo-splash-screen.js'),
  'react-native-gesture-handler': path.resolve(__dirname, 'shims/react-native-gesture-handler.js'),
  'expo-web-browser': path.resolve(__dirname, 'shims/expo-web-browser.js'),
};

// Modules that should resolve to an empty no-op object (node-only tools)
const EMPTY_SHIM_MODULES = new Set([
  'expo-haptics',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
]);

// ── Resolver ──────────────────────────────────────────────────────────────
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Strip sub-path for prefix matching (e.g. 'expo-constants/build/...' → 'expo-constants')
  const root = moduleName.split('/')[0];

  // Check exact shim map first (handles both exact + sub-paths)
  for (const [shimMod, shimPath] of Object.entries(WEB_SHIMS)) {
    if (moduleName === shimMod || moduleName.startsWith(shimMod + '/')) {
      return { filePath: shimPath, type: 'sourceFile' };
    }
  }

  // Empty shims for node-only packages
  if (EMPTY_SHIM_MODULES.has(root) || EMPTY_SHIM_MODULES.has(moduleName)) {
    return { filePath: path.resolve(__dirname, 'shims/expo-constants.js'), type: 'sourceFile' };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
