const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Shim native-only modules during web/SSR bundling ──────────────────────────
const SHIMS = {
  'expo-constants': path.resolve(__dirname, 'shims/expo-constants.js'),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Only shim during SSR/web bundling, not native
    if (platform === 'web' || !platform) {
      for (const [pkg, shimPath] of Object.entries(SHIMS)) {
        if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
          return { type: 'sourceFile', filePath: shimPath };
        }
      }
    }

    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
