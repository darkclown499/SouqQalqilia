// shims/expo-router-render.js
// Safe SSR stub for expo-router/node/render.js
// The real render.js crashes on web/Node because it embeds native modules
// (expo-splash-screen, expo-constants) that call requireOptionalNativeModule.
// This stub exposes the minimal surface that expo-router's SSR pipeline needs.

const noop = () => {};
const noopAsync = () => Promise.resolve(null);

module.exports = {
  // Called by the expo-router SSR entry to render a route to HTML
  renderRootComponent: noopAsync,
  // Older export name
  render: noopAsync,
  // Head management shim
  Head: null,
  // No-op exports that expo-router/server may import
  ExpoRoot: noop,
  SplashScreen: {
    preventAutoHideAsync: noopAsync,
    hideAsync: noopAsync,
    setOptions: noop,
  },
};
