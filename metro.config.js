// cache-reset: 3
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web') {
      const shimModules = ['expo-constants', 'expo-notifications'];
      if (shimModules.includes(moduleName)) {
        try {
          return {
            filePath: require.resolve('./shims/' + moduleName + '.js'),
            type: 'sourceFile',
          };
        } catch {
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
