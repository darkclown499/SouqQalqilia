const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── حل مشكلة الوحدات الأصلية ──
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // إعادة توجيه الوحدات الأصلية إلى shims
    const shimModules = [
      'expo-constants',
      'expo-splash-screen',
      'expo-web-browser',
      'react-native-gesture-handler',
      'expo-modules-core', // ← أضف هذا
    ];

    if (shimModules.includes(moduleName)) {
      try {
        return {
          filePath: require.resolve(`./shims/${moduleName}.js`),
          type: 'sourceFile',
        };
      } catch (e) {
        // إذا لم يكن هناك shim محدد، استخدم shim عام
        return {
          filePath: require.resolve('./shims/empty.js'),
          type: 'sourceFile',
        };
      }
    }

    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
