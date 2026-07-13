/**
 * metro-transformer.js
 *
 * Custom Babel transformer that wraps Expo's default transformer but
 * suppresses the Babel platform-guard transform for pre-compiled
 * expo-router build files.
 *
 * Root cause: The Babel preset-expo includes a transform that converts
 * `Platform.OS` references into `typeof Platform !== 'undefined' && Platform
 * ? Platform.OS : 'web'` guards. When applied to a pre-compiled CJS file
 * like expo-router/build/ExpoRoot.js that uses `react_native_1.Platform.OS`,
 * Babel incorrectly wraps ONLY the trailing `.Platform.OS` portion,
 * producing the invalid syntax:
 *   react_native_1.(typeof Platform !== 'undefined' && Platform ? Platform.OS : 'web')
 *
 * By patching the Babel config for these specific files we avoid the
 * invalid transformation while keeping full transforms on our own source.
 */

// Import the upstream Expo babel transformer as documented at
// https://docs.expo.dev/versions/v56.0.0/config/metro/#extending-the-babel-transformer
let upstreamTransformer;
try {
  upstreamTransformer = require('@expo/metro-config/babel-transformer');
} catch (_) {
  try {
    upstreamTransformer = require('metro-react-native-babel-transformer');
  } catch (_2) {
    upstreamTransformer = null;
  }
}

// Regex that matches pre-compiled expo-router bundle files.
// These are already compiled TS→JS by the expo-router package build step;
// re-applying platform transforms corrupts property-access chains.
const EXPO_ROUTER_BUILD_RE =
  /[/\\]expo-router[/\\]build[/\\]/;

// Babel plugin identifiers associated with the platform-guard transform.
// We strip these when processing expo-router/build/* files.
const PLATFORM_GUARD_PLUGIN_IDS = [
  'transform-inline-environment-variables',
  '@babel/plugin-transform-inline-environment-variables',
  'babel-plugin-transform-inline-environment-variables',
  // The actual culprit: expo's platform-constant-folding plugin
  // that replaces Platform.OS with typeof guards
  'babel-plugin-platform-specific-extensions',
  '@react-native/babel-preset/src/plugins/babelPluginReactNativePlatformOS',
  'babel-preset-expo/build/index',
];

function filterPlugin(plugin) {
  if (!plugin) return true; // keep null/undefined (will be cleaned up)
  const id = Array.isArray(plugin) ? plugin[0] : plugin;
  if (typeof id !== 'string') return true;
  return !PLATFORM_GUARD_PLUGIN_IDS.some(blocked => id.includes(blocked));
}

function patchConfig(babelConfig) {
  if (!babelConfig || typeof babelConfig !== 'object') return babelConfig;
  const patched = { ...babelConfig };
  if (Array.isArray(patched.plugins)) {
    patched.plugins = patched.plugins.filter(filterPlugin);
  }
  if (Array.isArray(patched.presets)) {
    patched.presets = patched.presets.map(preset => {
      if (!Array.isArray(preset)) return preset;
      const [name, opts, ...rest] = preset;
      if (!opts || !Array.isArray(opts.plugins)) return preset;
      return [name, { ...opts, plugins: opts.plugins.filter(filterPlugin) }, ...rest];
    });
  }
  return patched;
}

module.exports.transform = async function transform({ src, filename, options }) {
  const isWeb = options?.platform === 'web';
  const isExpoRouterBuild = EXPO_ROUTER_BUILD_RE.test(filename);

  if (isWeb && isExpoRouterBuild) {
    // Patch the source directly: replace the problematic pattern before Babel
    // even sees it. This is the most reliable fix because it operates on the
    // raw source string, before any AST parsing.
    //
    // Pattern to fix: react_native_1.Platform.OS  →  'web'
    // This prevents Babel from ever seeing `.Platform.OS` in a property-chain
    // context where it incorrectly applies the typeof guard.
    //
    // We look specifically for the CommonJS interop alias pattern:
    //   <identifier>.Platform.OS
    // and replace the entire access with the string 'web'.
    const patchedSrc = src
      // Handle: react_native_1.Platform.OS  (and similar aliased requires)
      .replace(
        /\b(\w+)\.Platform\.OS\b/g,
        (_match, _alias) => "'web'"
      )
      // Handle: react_native_1.Platform.select({...})
      // Leave Platform.select alone since it returns the web key
      ;

    if (upstreamTransformer) {
      return upstreamTransformer.transform({ src: patchedSrc, filename, options });
    }
  }

  if (upstreamTransformer) {
    return upstreamTransformer.transform({ src, filename, options });
  }

  throw new Error(
    '[metro-transformer] No upstream transformer found. ' +
    'Install @expo/metro-config or metro-react-native-babel-transformer.'
  );
};
