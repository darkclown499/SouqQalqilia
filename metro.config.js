const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Shim paths ───────────────────────────────────────────────────────────────
const SHIMS = {
  'expo-constants': path.resolve(__dirname, 'shims/expo-constants.js'),
  'expo-splash-screen': path.resolve(__dirname, 'shims/empty.js'),
  'expo-web-browser': path.resolve(__dirname, 'shims/empty.js'),
  'react-native-gesture-handler': path.resolve(__dirname, 'shims/empty.js'),
};

// Sub-path prefixes that should also be shimmed to empty during web/SSR
const SHIM_PREFIXES = [
  'expo-constants/',
  'expo-splash-screen/',
  'react-native-gesture-handler/',
];

const originalResolver = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Only intercept during web/SSR bundling (Node.js runtime)
    if (platform === 'web' || context.customTransformOptions?.environment === 'node') {
      // Exact match shims
      if (SHIMS[moduleName]) {
        return { filePath: SHIMS[moduleName], type: 'sourceFile' };
      }
      // Prefix match shims
      for (const prefix of SHIM_PREFIXES) {
        if (moduleName.startsWith(prefix)) {
          return { filePath: path.resolve(__dirname, 'shims/empty.js'), type: 'sourceFile' };
        }
      }
    }

    if (originalResolver) {
      return originalResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
