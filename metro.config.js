const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
module.exports = config;
async function triggerHaptic() {
  if (Platform.OS === 'web') return; // حماية كاملة للمتصفح

  try {
    const Haptics = require('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {
    console.log('Haptics not available on this platform');
  }
}
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-haptics': new Proxy({}, { get: () => ({ impactAsync: () => {} }) }),
  // أضف أي مكتبة نيتيف أخرى تواجهك فيها مشاكل هنا بنفس الطريقة
};

module.exports = config;