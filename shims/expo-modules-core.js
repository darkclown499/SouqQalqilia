// Safe no-op shim for expo-modules-core during web/SSR bundling.
'use strict';

module.exports = {
  requireOptionalNativeModule: function () { return null; },
  requireNativeModule: function () { return {}; },
  NativeModulesProxy: {},
  EventEmitter: function EventEmitter() {},
  NativeEventEmitter: function NativeEventEmitter() {},
  CodedError: function CodedError(code, message) {
    this.code = code;
    this.message = message;
  },
  UnavailabilityError: function UnavailabilityError(moduleName, propName) {
    this.code = 'ERR_UNAVAILABLE';
    this.message = moduleName + '.' + propName + ' is not available.';
  },
  Platform: { OS: 'web' },
};
module.exports.default = module.exports;
