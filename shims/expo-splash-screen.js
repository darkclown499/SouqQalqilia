// Web/SSR shim for expo-splash-screen
// Prevents "Cannot read properties of null (reading 'requireOptionalNativeModule')" during SSR

// Proxy handler that returns no-op functions for any property access,
// so sub-path requires like expo-splash-screen/build/SplashScreen.js
// are also safely handled without crashing.
const noop = () => Promise.resolve();
const noopSync = () => {};

const safeModule = {
  preventAutoHideAsync: noop,
  hideAsync: noop,
  setOptions: noopSync,
  // Stub out NativeModule-level APIs so internal requires don't crash
  NativeExpoSplashScreen: null,
  requireOptionalNativeModule: () => null,
  default: {
    preventAutoHideAsync: noop,
    hideAsync: noop,
    setOptions: noopSync,
  },
};

module.exports = safeModule;
