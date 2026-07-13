// Web/SSR shim for expo-constants
// Prevents "Cannot read properties of null (reading 'requireOptionalNativeModule')" during SSR

const Constants = {
  expoConfig: {},
  manifest: {},
  manifest2: null,
  platform: 'web',
  sessionId: 'web-session',
  statusBarHeight: 0,
  systemFonts: [],
  isHeadless: false,
  executionEnvironment: 'bare',
  appOwnership: null,
  deviceName: undefined,
  // Stub NativeModule-level APIs so sub-path requires don't crash
  requireOptionalNativeModule: () => null,
};

const ExecutionEnvironment = {
  Bare: 'bare',
  StoreClient: 'storeClient',
  Standalone: 'standalone',
};

module.exports = {
  default: Constants,
  ExecutionEnvironment,
  ...Constants,
};
