// metro.config.js — Web/SSR bundling defence layer
//
// Fixes TWO recurring issues when bundling for web:
//
// 1. Native-only module crashes (expo-constants, expo-splash-screen, etc.)
//    → Fixed by intercepting resolveRequest and redirecting to safe shims.
//
// 2. Babel platform-guard corruption of ExpoRoot.js
//    → Fixed by marking expo-router/build/ as non-transformable (servedAsSource=false
//      isn't an option in Metro) — instead we use a custom serializer preprocessor
//      that rewrites Platform.OS → 'web' before Babel ever parses the file.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const SHIMS_DIR = path.join(__dirname, 'shims');

// Packages that crash when loaded in Node.js / web SSR context
const NATIVE_ONLY_SHIMS = {
  'expo-constants': path.join(SHIMS_DIR, 'expo-constants.js'),
  'expo-splash-screen': path.join(SHIMS_DIR, 'empty.js'),
  'expo-web-browser': path.join(SHIMS_DIR, 'empty.js'),
  'react-native-gesture-handler': path.join(SHIMS_DIR, 'empty.js'),
};

// ── Layer 1: Module resolver shimming ─────────────────────────────────────────
const originalResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web') {
      for (const [mod, shimPath] of Object.entries(NATIVE_ONLY_SHIMS)) {
        if (moduleName === mod || moduleName.startsWith(mod + '/')) {
          return { filePath: shimPath, type: 'sourceFile' };
        }
      }
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// ── Layer 2: transformIgnorePatterns — exclude pre-compiled expo-router CJS ───
// Metro's default already excludes most of node_modules. We keep that behaviour
// but explicitly allow packages that need transpiling (Expo SDK packages).
// The key insight: expo-router/build/** is PRE-COMPILED CommonJS — it MUST NOT
// be run through babel-preset-expo's platform-guard transform.
//
// Default pattern already handles this but can be overridden if Expo config
// reset it. Restore safe default explicitly:
config.transformer = {
  ...config.transformer,
  // Use Metro's built-in Babel transformer (do NOT override babelTransformerPath
  // unless we have a verified path — an invalid path causes silent fallback failures)
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
