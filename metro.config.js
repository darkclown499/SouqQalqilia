// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Shim directory ────────────────────────────────────────────────────────────
const SHIMS_DIR = path.resolve(__dirname, 'shims');

// Packages that need no-op stubs during web/SSR Node bundling
const NATIVE_ONLY_SHIMS = {
  'expo-constants':              path.join(SHIMS_DIR, 'expo-constants.js'),
  'expo-splash-screen':          path.join(SHIMS_DIR, 'expo-splash-screen.js'),
  'expo-web-browser':            path.join(SHIMS_DIR, 'expo-web-browser.js'),
  'react-native-gesture-handler': path.join(SHIMS_DIR, 'react-native-gesture-handler.js'),
};

// Node-only packages (ESLint, etc.) — proxy to empty object so Metro never
// bundles them into the client or SSR render bundle
const noopModule = { exports: {} };
const NODE_ONLY_PACKAGES = [
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint',
];

config.resolver = config.resolver || {};

// ── extraNodeModules: catch node-only packages ────────────────────────────────
const emptyMod = require.resolve('./shims/expo-constants.js'); // any valid file works
const extraNodeModules = {};
for (const pkg of NODE_ONLY_PACKAGES) {
  extraNodeModules[pkg] = emptyMod;
}
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...extraNodeModules,
};

// ── resolveRequest: intercept native-only modules during web/SSR bundling ────
const _originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only shim when bundling for web / the SSR Node render
  const isWebContext =
    platform === 'web' ||
    context.customTransformOptions?.environment === 'node' ||
    context.customTransformOptions?.environment === 'react-server';

  if (isWebContext) {
    // Direct shim map
    if (NATIVE_ONLY_SHIMS[moduleName]) {
      return { filePath: NATIVE_ONLY_SHIMS[moduleName], type: 'sourceFile' };
    }
    // Prefix matches (e.g. expo-constants/build/…)
    for (const [pkg, shimPath] of Object.entries(NATIVE_ONLY_SHIMS)) {
      if (moduleName.startsWith(pkg + '/')) {
        return { filePath: shimPath, type: 'sourceFile' };
      }
    }
    // Node-only ESLint packages
    for (const pkg of NODE_ONLY_PACKAGES) {
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        return { filePath: emptyMod, type: 'sourceFile' };
      }
    }
  }

  // Fall through to default resolver
  if (_originalResolveRequest) {
    return _originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
