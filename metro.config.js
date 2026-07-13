// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Custom Babel transformer ─────────────────────────────────────────────────
// Wraps Expo's upstream transformer to pre-patch Platform.OS references in
// pre-compiled expo-router build files before Babel sees them.
config.transformer = config.transformer || {};
config.transformer.babelTransformerPath = path.resolve(__dirname, 'metro-transformer.js');

// ── Shim paths ───────────────────────────────────────────────────────────────
const SHIMS_DIR = path.resolve(__dirname, 'shims');
const RN_SHIM = path.join(SHIMS_DIR, 'react-native.js');
const EMPTY_SHIM = path.join(SHIMS_DIR, 'empty.js');

// Exact-match shims for web/SSR
const WEB_SHIMS = {
  'expo-constants':                  path.join(SHIMS_DIR, 'expo-constants.js'),
  'expo-splash-screen':              path.join(SHIMS_DIR, 'expo-splash-screen.js'),
  'expo-web-browser':                path.join(SHIMS_DIR, 'expo-web-browser.js'),
  'react-native-gesture-handler':    path.join(SHIMS_DIR, 'react-native-gesture-handler.js'),
  'expo-router/node/render':         path.join(SHIMS_DIR, 'expo-router-render.js'),
  'expo-router/node/render.js':      path.join(SHIMS_DIR, 'expo-router-render.js'),
};

// Sub-path prefixes that resolve to the root shim
const WEB_SHIM_PREFIXES = [
  'expo-constants/',
  'expo-splash-screen/',
  'expo-web-browser/',
  'react-native-gesture-handler/',
];

// ESLint / TypeScript node-only packages — empty stub on web
const EMPTY_SHIM_MODULES = new Set([
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint',
  '@expo/metro-config',
]);

// ── expo-router origin pattern — modules that require react-native during SSR
const EXPO_ROUTER_PATTERN = /[/\\]expo-router[/\\]/;
const SAFE_AREA_PATTERN   = /[/\\]react-native-safe-area-context[/\\]/;

// ── Custom resolver ──────────────────────────────────────────────────────────
const originalResolver = config.resolver?.resolveRequest;
config.resolver = config.resolver || {};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const origin = context.originModulePath || '';

    // ── react-native: shim when required from expo-router or safe-area-context
    // This prevents Babel's platform-guard from ever seeing Platform.OS in
    // pre-compiled bundle code that uses the react_native_1 alias.
    if (moduleName === 'react-native') {
      if (EXPO_ROUTER_PATTERN.test(origin) || SAFE_AREA_PATTERN.test(origin)) {
        return { filePath: RN_SHIM, type: 'sourceFile' };
      }
    }

    // ── Exact shims
    for (const [key, shimPath] of Object.entries(WEB_SHIMS)) {
      if (moduleName === key) {
        return { filePath: shimPath, type: 'sourceFile' };
      }
    }

    // ── Sub-path shims (e.g. expo-splash-screen/build/...)
    for (const prefix of WEB_SHIM_PREFIXES) {
      if (moduleName.startsWith(prefix)) {
        const root = prefix.slice(0, -1);
        return { filePath: WEB_SHIMS[root] || EMPTY_SHIM, type: 'sourceFile' };
      }
    }

    // ── ESLint / node-only tools → empty stub
    for (const pkg of EMPTY_SHIM_MODULES) {
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        return { filePath: EMPTY_SHIM, type: 'sourceFile' };
      }
    }
  }

  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
