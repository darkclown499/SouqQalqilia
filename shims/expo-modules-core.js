// shims/expo-modules-core.js
// هذا الملف يحل مشكلة requireOptionalNativeModule

// محاكاة الكائن المطلوب من expo-modules-core
if (typeof global === 'undefined') {
  global = {};
}

// تأكد من وجود requireOptionalNativeModule
global.requireOptionalNativeModule = function(moduleName) {
  try {
    // حاول تحميل الوحدة الأصلية
    return require(moduleName);
  } catch (e) {
    // إذا فشلت، أرجع كائن فارغ
    console.warn(`⚠️ Native module ${moduleName} not available, using fallback`);
    return {};
  }
};

// تصدير الكائنات الأساسية
module.exports = {
  requireOptionalNativeModule: global.requireOptionalNativeModule,
  NativeModulesProxy: {},
  EventEmitter: class EventEmitter {},
  NativeEventEmitter: class NativeEventEmitter {},
  CodedError: class CodedError extends Error {},
  UnavailabilityError: class UnavailabilityError extends Error {},
};
