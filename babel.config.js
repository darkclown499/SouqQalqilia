module.exports = function (api) {
  api.cache(false);
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // Pre-compiled expo-router build files must NOT have the platform-guard
        // transform applied — it corrupts property-access chains like
        // `react_native_1.Platform.OS` into invalid syntax.
        // We disable ALL plugins for these files since they are already
        // compiled and only need pass-through transformation.
        test: /node_modules[\\/]expo-router[\\/]build[\\/]/,
        plugins: [],
        presets: [],
      },
    ],
  };
};
