module.exports = function (api) {
  api.cache(false);
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // Pre-compiled expo-router build files must NOT have any Babel plugins
        // applied — they are already compiled CJS and the platform-guard plugin
        // in babel-preset-expo corrupts property-access chains like
        // `react_native_1.Platform.OS` into syntactically invalid expressions.
        //
        // Using a function for `test` is more reliable than a regex string
        // because Babel normalises paths differently across OS and pnpm layouts.
        test: (filename) => {
          if (!filename) return false;
          const norm = filename.replace(/\\/g, '/');
          return (
            norm.includes('/expo-router/build/') ||
            norm.includes('/expo-router/node/') ||
            norm.includes('expo-router/build/') ||
            norm.includes('expo-router/node/')
          );
        },
        presets: [],
        plugins: [],
      },
    ],
  };
};
