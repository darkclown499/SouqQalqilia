// Web/SSR shim for expo-splash-screen
// Prevents "Cannot read properties of null (reading 'requireOptionalNativeModule')" during SSR

module.exports = {
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
  setOptions: () => {},
  default: {
    preventAutoHideAsync: () => Promise.resolve(),
    hideAsync: () => Promise.resolve(),
    setOptions: () => {},
  },
};
