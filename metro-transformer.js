'use strict';

/**
 * metro-transformer.js
 *
 * Wraps the upstream Expo Babel transformer to pre-patch pre-compiled
 * expo-router build files before Babel processes them.
 *
 * Root cause: babel-preset-expo has an inline-platform-constants plugin that
 * replaces `Platform.OS` references with typeof guards. When applied to
 * pre-compiled CJS like ExpoRoot.js that contains:
 *
 *   const INITIAL_METRICS = Platform.OS === 'web' || isTestEnv ? ...
 *
 * Babel transforms `Platform.OS` into:
 *   (typeof Platform !== 'undefined' && Platform ? Platform.OS : 'web')
 *
 * But since `Platform` is accessed as a destructured import from
 * `react_native_1`, Babel ends up generating:
 *   react_native_1.(typeof Platform...)
 *
 * which is syntactically invalid.
 *
 * Fix strategy:
 *   1. In metro-transformer.js: replace ALL Platform.OS occurrences with
 *      the string literal 'web' BEFORE Babel sees the source.
 *   2. In babel.config.js: disable presets/plugins for expo-router build files.
 *   3. In metro.config.js: resolver shim for react-native from expo-router.
 *
 * All three layers work together as belt-and-suspenders.
 */

const path = require('path');
const fs = require('fs');

// ── Locate the upstream Expo/Metro Babel transformer ────────────────────────
function findUpstreamTransformer() {
  const candidates = [
    '@expo/metro-config/babel-transformer',
    'metro-react-native-babel-transformer',
    () => {
      try {
        const pkg = require.resolve('@expo/metro-config/package.json');
        const dir = path.dirname(pkg);
        // Try build/babel-transformer.js
        for (const rel of ['build/babel-transformer.js', 'babel-transformer.js']) {
          const t = path.join(dir, rel);
          if (fs.existsSync(t)) return require(t);
        }
        return null;
      } catch (_) { return null; }
    },
    () => {
      try {
        // pnpm: resolve from the package itself
        const expoMetroDir = path.dirname(require.resolve('expo/package.json'));
        const t = path.join(expoMetroDir, 'node_modules/@expo/metro-config/build/babel-transformer.js');
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

// ── Files that must be pre-patched ──────────────────────────────────────────
const PATCH_PATTERNS = [
  /[/\\]expo-router[/\\]build[/\\]/,
  /[/\\]expo-router[/\\]node[/\\]/,
];

function shouldPatch(filename) {
  return PATCH_PATTERNS.some(re => re.test(filename));
}

/**
 * Pre-patch source string:
 * - Replace `<ident>.Platform.OS`  →  `'web'`   (module-alias pattern)
 * - Replace bare `Platform.OS`     →  `'web'`   (destructured import pattern)
 *
 * This must run BEFORE Babel parses the AST so the platform-guard plugin
 * never sees the `Platform.OS` expression to wrap.
 */
function patchSource(src) {
  return src
    // Module-alias: react_native_1.Platform.OS
    .replace(/\b(\w+)\.Platform\.OS\b/g, "'web'")
    // Destructured bare reference: Platform.OS
    .replace(/\bPlatform\.OS\b/g, "'web'");
}

module.exports.transform = async function transform({ src, filename, options }) {
  const effectiveSrc = shouldPatch(filename) ? patchSource(src) : src;

  if (upstreamTransformer) {
    return upstreamTransformer.transform({ src: effectiveSrc, filename, options });
  }

  // Fallback: minimal Babel transform (should never reach here in a correct Expo install)
  const babel = require('@babel/core');
  const result = await babel.transformAsync(effectiveSrc, {
    filename,
    presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    plugins: [],
    sourceType: 'unambiguous',
    configFile: false,
    babelrc: false,
  });

  return { code: result?.code ?? effectiveSrc, map: result?.map ?? null };
};
