const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── تجاهل تحويل expo-router بواسطة Babel ──
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('metro-react-native-babel-transformer'),
};

config.resolver = {
  ...config.resolver,
  // منع Metro من معالجة ملفات expo-router المترجمة مسبقاً
  blacklistRE: /node_modules\/expo-router\/build\/.*/,
};

module.exports = config;