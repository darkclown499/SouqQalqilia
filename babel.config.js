module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],

    // ── Critical: prevent platform-guard transform from corrupting
    //    pre-compiled CommonJS files in node_modules (e.g. ExpoRoot.js).
    //
    // The babel-preset-expo platform-guard plugin rewrites Platform.OS into
    // nested typeof guards, which produces invalid syntax when applied to
    // already-compiled CJS like expo-router/build/ExpoRoot.js.
    //
    // Solution: use Babel `overrides` with `test` to surgically disable
    // this transform for the specific files that are pre-compiled.
    overrides: [
      {
        // Match expo-router's pre-compiled build files
        test: /expo-router[\\/](build|node)[\\/]/,
        // Apply NO plugins — let the file pass through as-is
        presets: [],
        plugins: [],
      },
      {
        // Also protect react-navigation pre-compiled files
        test: /react-navigation[\\/]/,
        presets: [],
        plugins: [],
      },
    ],
  };
};
