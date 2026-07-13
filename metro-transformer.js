/**
 * metro-transformer.js
 *
 * Custom Babel transformer that pre-patches pre-compiled expo-router build
 * files before Babel sees them, preventing the platform-guard transform from
 * generating the invalid syntax:
 *   react_native_1.(typeof Platform !== 'undefined' && Platform ? Platform.OS : 'web')
 *
 * Root cause: babel-preset-expo includes a plugin that wraps `Platform.OS`
 * references with typeof guards. When the source already has the module-level
 * CJS alias pattern `react_native_1.Platform.OS`, Babel incorrectly wraps only
 * the `.Platform.OS` tail, corrupting the member expression into invalid JS.
 *
 * Fix: replace `<alias>.Platform.OS` → `'web'` in the raw source string
 * BEFORE passing it to the upstream Babel transformer. This removes the
 * trigger entirely so the plugin never fires on these files.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ── Locate the upstream Expo/Metro Babel transformer ────────────────────────
// Try multiple resolution paths to handle pnpm/yarn/npm layouts.
function findUpstreamTransformer() {
  const candidates = [
    '@expo/metro-config/babel-transformer',
    'metro-react-native-babel-transformer',
    // Resolve relative to expo/metro-config package if the above fail
    () => {
      try {
        const metroConfigPkg = require.resolve('expo/metro-config');
        const metroConfigDir = path.dirname(metroConfigPkg);
        return require(path.join(metroConfigDir, 'babel-transformer'));
      } catch (_) { return null; }
    },
    () => {
      try {
        // Walk up from @expo/metro-config to find the transformer
        const pkg = require.resolve('@expo/metro-config/package.json');
        const dir = path.dirname(pkg);
        const t = path.join(dir, 'build', 'babel-transformer.js');
        if (fs.existsSync(t)) return require(t);
        return null;
      } catch (_) { return null; }
    },
  ];

  for (const candidate of candidates) {
    try {
      const result = typeof candidate === 'function' ? candidate() : require(candidate);
      if (result && typeof result.transform === 'function') return result;
    } catch (_) { /* try next */ }
  }
  return null;
}

const upstreamTransformer = findUpstreamTransformer();

// ── Files that must be pre-patched before Babel runs ─────────────────────────
// These are pre-compiled CJS bundles inside node_modules that Babel
// incorrectly applies platform transforms to.
const PATCH_FILE_PATTERNS = [
  /[/\\]expo-router[/\\]build[/\\]/,
  /[/\\]expo-router[/\\]node[/\\]/,
];

function shouldPatch(filename) {
  return PATCH_FILE_PATTERNS.some(re => re.test(filename));
}

/**
 * Pre-patch source: replace any `<ident>.Platform.OS` access with the string
 * literal `'web'`. This prevents babel-preset-expo's platform-guard plugin
 * from ever seeing the pattern and generating the invalid member expression.
 */
function patchSource(src) {
  return src
    // Handle: react_native_1.Platform.OS  → 'web'
    // The word boundary \b ensures we don't match inside strings/comments
    .replace(/\b(\w+)\.Platform\.OS\b/g, () => "'web'")
    // Safety net: catch any remaining bare Platform.OS (unlikely but possible)
    .replace(/\bPlatform\.OS\b/g, () => "'web'");
}

module.exports.transform = async function transform({ src, filename, options }) {
  // Always patch expo-router build files, regardless of platform,
  // because the Babel platform-guard transform corrupts them on any platform
  // where babel-preset-expo's inline platform plugin is active.
  const needsPatch = shouldPatch(filename);
  const effectiveSrc = needsPatch ? patchSource(src) : src;

  if (upstreamTransformer) {
    return upstreamTransformer.transform({ src: effectiveSrc, filename, options });
  }

  // Fallback: if no upstream transformer is available, run a minimal Babel
  // transform that just strips Flow types and converts ESM→CJS.
  // This should never happen in a properly installed Expo project.
  const babel = require('@babel/core');
  const result = await babel.transformAsync(effectiveSrc, {
    filename,
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    plugins: [],
    sourceType: 'module',
    configFile: false,
    babelrc: false,
  });

  return {
    code: result?.code ?? effectiveSrc,
    map: result?.map ?? null,
  };
};
