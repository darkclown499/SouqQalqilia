// shims/expo-router-render.js
// Safe SSR stub for expo-router/node/render.js
// The real render.js crashes on web/Node because it embeds native modules
// (expo-splash-screen, expo-constants) that call requireOptionalNativeModule.
// This stub exposes the full surface that expo-router's SSR pipeline and
// @expo/cli's static export need, including getBuildTimeServerManifestAsync.

const noop = () => {};
const noopAsync = () => Promise.resolve(null);

// @expo/cli calls getBuildTimeServerManifestAsync to discover routes for
// static HTML export. Return the minimal shape it expects so the export
// pipeline doesn't crash when it receives our shim instead of the real bundle.
async function getBuildTimeServerManifestAsync() {
  return {
    // Empty route list — no static pages are pre-rendered via SSR
    htmlRoutes: [],
    // Expo CLI may also read these fields
    staticRoutes: [],
    apiRoutes: [],
    // initialRouteNode and other optional fields are omitted safely
  };
}

// renderRootComponent is called per-route during static export to produce HTML.
// Return a minimal HTML shell so the file is written without crashing.
async function renderRootComponent(options) {
  return '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>';
}

module.exports = {
  // ── Static export API (called by @expo/cli) ───────────────────────────────
  getBuildTimeServerManifestAsync,
  renderRootComponent,

  // ── Older / alternate export names ───────────────────────────────────────
  render: noopAsync,
  getManifest: getBuildTimeServerManifestAsync,
  getStaticContent: renderRootComponent,

  // ── Head management shim ─────────────────────────────────────────────────
  Head: null,

  // ── Component / provider stubs ────────────────────────────────────────────
  ExpoRoot: noop,
  SplashScreen: {
    preventAutoHideAsync: noopAsync,
    hideAsync: noopAsync,
    setOptions: noop,
  },
};
