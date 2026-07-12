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
