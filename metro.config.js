const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Resolver: redirect native-only and node-only modules on web/SSR ──────────
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Shim expo-constants on web to avoid requireOptionalNativeModule crash
  if (moduleName === 'expo-constants' || moduleName.startsWith('expo-constants/')) {
    return {
      filePath: path.resolve(__dirname, 'shims/expo-constants.js'),
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-haptics': new Proxy({}, { get: () => ({ impactAsync: () => {} }) }),
  'eslint-plugin-react': new Proxy({}, { get: () => ({}) }),
  'eslint-plugin-react-hooks': new Proxy({}, { get: () => ({}) }),
  '@typescript-eslint/parser': new Proxy({}, { get: () => ({}) }),
  '@typescript-eslint/eslint-plugin': new Proxy({}, { get: () => ({}) }),
};

module.exports = config;
