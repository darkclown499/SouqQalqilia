// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const os = require('os');

const config = getDefaultConfig(__dirname);

// ── Custom Babel transformer ─────────────────────────────────────────────────
// Wraps Expo's upstream transformer to patch out the platform-guard Babel
// transform for pre-compiled expo-router build files, preventing the
// malformed `react_native_1.(typeof Platform...)` syntax error.
config.transformer = config.transformer || {};
config.transformer.babelTransformerPath = path.resolve(__dirname, 'metro-transformer.js');

// ── Web/SSR shims ────────────────────────────────────────────────────────────
const WEB_SHIMS = {
  'expo-constants': path.resolve(__dirname, 'shims/expo-constants.js'),
  'expo-splash-screen': path.resolve(__dirname, 'shims/expo-splash-screen.js'),
  'expo-web-browser': path.resolve(__dirname, 'shims/expo-web-browser.js'),
  'react-native-gesture-handler': path.resolve(__dirname, 'shims/react-native-gesture-handler.js'),
  'expo-router/node/render': path.resolve(__dirname, 'shims/expo-router-render.js'),
  'expo-router/node/render.js': path.resolve(__dirname, 'shims/expo-router-render.js'),
};

// Sub-path prefixes that must also be shimmed (e.g. expo-splash-screen/build/...)
const WEB_SHIM_PREFIXES = [
  'expo-constants/',
  'expo-splash-screen/',
  'expo-web-browser/',
  'react-native-gesture-handler/',
];

const EMPTY_SHIM_MODULES = new Set([
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint',
]);

const EMPTY_SHIM_PATH = path.resolve(__dirname, 'shims/empty.js');
const RN_SHIM_PATH = path.resolve(__dirname, 'shims/react-native.js');

// Packages whose require('react-native') should use the web shim.
// This covers expo-router's SSR/node bundling paths where the Babel
// platform-guard transform corrupts react_native_1.Platform.OS into
// the invalid `react_native_1.(typeof Platform...)` expression.
const RN_SHIM_ORIGIN_PATTERNS = [
  'expo-router',
  'react-native-safe-area-context',
];

// ── Custom resolver ──────────────────────────────────────────────────────────
const originalResolver = config.resolver?.resolveRequest;

config.resolver = config.resolver || {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // Shim react-native when required from expo-router or safe-area-context
    // during SSR/node bundling. The Babel transform replaces Platform.OS
    // with a typeof guard but corrupts property-access chains like
    // react_native_1.Platform into react_native_1.(typeof Platform...)
    // which is a syntax error. Using our stub avoids this transform entirely.
    if (moduleName === 'react-native') {
      const origin = context.originModulePath || '';
      const needsShim = RN_SHIM_ORIGIN_PATTERNS.some(p => origin.includes(p));
      if (needsShim) {
        return { filePath: RN_SHIM_PATH, type: 'sourceFile' };
      }
    }

    for (const [shimKey, shimPath] of Object.entries(WEB_SHIMS)) {
      if (moduleName === shimKey || moduleName.startsWith(shimKey + '/')) {
        return { filePath: shimPath, type: 'sourceFile' };
      }
    }

    // Catch any sub-path imports of shimmed packages
    for (const prefix of WEB_SHIM_PREFIXES) {
      if (moduleName.startsWith(prefix)) {
        // Route sub-paths of splash-screen/constants to their root shim
        const root = prefix.slice(0, -1); // remove trailing slash
        if (WEB_SHIMS[root]) {
          return { filePath: WEB_SHIMS[root], type: 'sourceFile' };
        }
        return { filePath: EMPTY_SHIM_PATH, type: 'sourceFile' };
      }
    }

    for (const pkg of EMPTY_SHIM_MODULES) {
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        return { filePath: EMPTY_SHIM_PATH, type: 'sourceFile' };
      }
    }
  }

  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;