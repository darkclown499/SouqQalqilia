// shims/expo-modules-core.js
// هذا الملف يحل مشكلة requireOptionalNativeModule

// ✅ تأكد من وجود الكائن في الـ global
if (typeof global === 'undefined') {
  global = {};
}

// ✅ أضف الدالة المطلوبة
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

// ✅ تأكد من أن الدالة موجودة أيضاً كـ export
module.exports = {
  requireOptionalNativeModule: global.requireOptionalNativeModule,
  NativeModulesProxy: {},
  EventEmitter: class EventEmitter {},
  NativeEventEmitter: class NativeEventEmitter {},
  CodedError: class CodedError extends Error {},
  UnavailabilityError: class UnavailabilityError extends Error {},
};

// ✅ أيضاً تأكد من أنها موجودة كـ default export
module.exports.default = module.exports;
