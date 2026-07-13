// Safe no-op shim for expo-constants during web/SSR bundling.
// The native module (requireOptionalNativeModule) is not available in Node.js.
'use strict';

const Constants = {
  expoConfig: null,
  expoGoConfig: null,
  easConfig: null,
  manifest: null,
  manifest2: null,
  appOwnership: null,
  executionEnvironment: 'storeClient',
  experienceUrl: '',
  isHeadless: false,
  linkingUri: '',
  nativeAppVersion: null,
  nativeBuildVersion: null,
  platform: { web: {} },
  sessionId: '',
  statusBarHeight: 0,
  systemFonts: [],
  deviceName: undefined,
  deviceYearClass: null,
  getWebViewUserAgentAsync: async () => null,
};

module.exports = Constants;
module.exports.default = Constants;
