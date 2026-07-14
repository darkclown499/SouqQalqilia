const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── فقط للجوال، لا حاجة لشيمات الـ Web ──
config.resolver = {
  ...config.resolver,
  // يمكنك إزالة أي resolveRequest خاص بالـ Web
};

module.exports = config;