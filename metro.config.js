// cache-bust: 2
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── حل مشكلة الوحدات الأصلية ──
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Only shim native-only modules during web bundling.
    // On android/ios these modules must resolve to their real implementations.
    if (platform === 'web') {
      const shimModules = [
        'expo-constants',
        'expo-notifications',
      ];

      if (shimModules.includes(moduleName)) {
        try {
          return {
            filePath: require.resolve(`./shims/${moduleName}.js`),
            type: 'sourceFile',
          };
        } catch (e) {
          return {
            filePath: require.resolve('./shims/empty.js'),
            type: 'sourceFile',
          };
        }
      }
    }

    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;