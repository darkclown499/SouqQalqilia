/**
 * shims/expo-router-exporoot.js
 *
 * Web/SSR-safe minimal stub for expo-router/build/ExpoRoot.
 *
 * This shim is a BELT-AND-SUSPENDERS fallback in case the Babel transformer
 * pre-patch (metro-transformer.js) and the babel.config.js overrides both
 * fail to prevent the platform-guard corruption of the real ExpoRoot.js.
 *
 * The real ExpoRoot is imported by expo-router/build/index.js to bootstrap
 * the router. On web/SSR, we just need it to export a passable component
 * so the bundler doesn't choke on the syntax error.
 *
 * Note: For the ACTUAL web app to work correctly, the real ExpoRoot must
 * load. This stub is only reached if the resolver intercepts the import.
 * The metro.config.js only adds this shim as a fallback entry in WEB_SHIMS,
 * and the resolver is configured so it does NOT intercept ExpoRoot during
 * the main app bundle — only during SSR/static-export pre-rendering where
 * the platform-guard transform is active.
 */

'use strict';

// Ensure Platform global exists so any leftover runtime Platform.OS checks
// return 'web' instead of crashing.
if (typeof globalThis !== 'undefined') {
  if (!globalThis.Platform) {
    globalThis.Platform = {
      OS: 'web',
      Version: 0,
      isPad: false,
      isTVOS: false,
      isTV: false,
      select: function(spec) {
        if (spec && 'web' in spec) return spec.web;
        if (spec && 'default' in spec) return spec.default;
        return undefined;
      },
      constants: { reactNativeVersion: { major: 0, minor: 0, patch: 0 } },
    };
  }
}

// Minimal ExpoRoot shim — renders nothing but satisfies the module graph.
const React = (() => { try { return require('react'); } catch(_) { return null; } })();

function ExpoRoot(props) {
  if (React && React.createElement) {
    return React.createElement(
      props && props.wrapper ? props.wrapper : 'div',
      null
    );
  }
  return null;
}

ExpoRoot.displayName = 'ExpoRoot';

module.exports = {
  ExpoRoot,
  default: ExpoRoot,
  __esModule: true,
};
