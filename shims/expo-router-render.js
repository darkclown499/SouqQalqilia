// shims/expo-router-render.js
// Safe SSR stub for expo-router/node/render.js
// The real render.js crashes on web/Node because it embeds native modules
// (expo-splash-screen, expo-constants) that call requireOptionalNativeModule.
// This stub exposes the full surface that expo-router's SSR pipeline and
// @expo/cli's static export need, including getBuildTimeServerManifestAsync.

const noop = () => {};
const noopAsync = () => Promise.resolve(null);

// @expo/cli calls getBuildTimeServerManifestAsync to discover routes for
// static HTML export, then iterates the result with iterateScreens which
// calls Object.values(node.children) — so every RouteNode must have
// children as a plain object (never null/undefined).
//
// The minimal safe RouteNode shape:
//   { route: string, contextKey: string, children: {}, entryPoints: [],
//     type: 'route', loadRoute: () => ({}), dynamic: null, generated: false }
async function getBuildTimeServerManifestAsync() {
  return {
    // Expo CLI iterates htmlRoutes to pre-render each route to HTML.
    // Return an empty array so no pages are rendered — the SPA shell is enough.
    htmlRoutes: [],

    // These may also be iterated — keep as empty arrays, not null.
    staticRoutes: [],
    apiRoutes: [],

    // Some Expo CLI versions access these fields on the manifest object.
    // Provide safe empty-object/array defaults so Object.values() never
    // receives null or undefined.
    screens: {},
    initialRouteNode: {
      route: '',
      contextKey: './',
      children: {},          // <— must be {} not null/undefined
      entryPoints: [],
      type: 'route',
      loadRoute: () => ({}),
      dynamic: null,
      generated: false,
    },
    // Flat map used by some Expo CLI versions
    routeTree: {
      route: '',
      contextKey: './',
      children: {},
      entryPoints: [],
      type: 'route',
      loadRoute: () => ({}),
      dynamic: null,
      generated: false,
    },
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
