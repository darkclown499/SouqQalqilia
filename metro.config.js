const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Shims for native-only modules during web/SSR bundling ─────────────────────
// These packages call requireOptionalNativeModule() which doesn't exist in Node.js
const SHIMS = {
  'expo-constants':    path.resolve(__dirname, 'shims/expo-constants.js'),
  'expo-modules-core': path.resolve(__dirname, 'shims/expo-modules-core.js'),
};

const _originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // On web, redirect native-only modules to safe no-op shims
    if (platform === 'web' && SHIMS[moduleName]) {
      return { filePath: SHIMS[moduleName], type: 'sourceFile' };
    }
    if (_originalResolveRequest) {
      return _originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// ── Prevent babel-preset-expo from corrupting pre-compiled CJS files ──────────
//
// The platform-guard Babel plugin (part of babel-preset-expo) transforms:
//   react_native_1.Platform.OS
// into:
//   react_native_1.(typeof Platform !== 'undefined' && Platform ? Platform.OS : 'web')
//
// …which is INVALID JS syntax (can't use ( ) as a property accessor on an object).
//
// Root cause: expo-router/build/ ships as pre-compiled CommonJS where `Platform`
// is imported as a namespace object (react_native_1). Babel then wraps the `.OS`
// access with typeof guards but forgets the namespace prefix, producing broken code.
//
// Fix: exclude expo-router's pre-compiled build output from ALL Babel transforms.
// These files are already valid CJS — they don't need transpilation.
//
// Metro's transformIgnorePatterns lists patterns of files that SHOULD NOT be
// transformed. A file is skipped if it matches ANY pattern in the array.
//
// Default pattern (from expo) already excludes most of node_modules but
// INCLUDES expo-router (so its source TypeScript can be compiled). We add a
// second, more specific pattern to exclude only the /build/ subdirectory.
// ─────────────────────────────────────────────────────────────────────────────

const existingIgnorePatterns = config.transformer?.transformIgnorePatterns ?? [];

config.transformer = {
  ...config.transformer,
  transformIgnorePatterns: [
    // Keep existing pattern(s) that allow expo/react-native source to be compiled
    ...existingIgnorePatterns,
    // Also skip expo-router's pre-compiled build output — it's already valid CJS
    /node_modules[/\\][^/\\]*expo-router[^/\\]*[/\\]build[/\\]/,
    /node_modules[/\\][^/\\]*expo-router[^/\\]*[/\\]node[/\\]/,
  ],
};

module.exports = config;
