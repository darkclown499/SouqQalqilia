module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // لا تضع أي plugin خاص بـ expo-modules-core هنا
    ],
    // ── استثناء node_modules من التحويلات ──
    overrides: [
      {
        test: /\.(js|ts|tsx)$/,
        exclude: /node_modules/,
        // إذا كان لديك أي plugin مخصص، ضعه هنا
      },
    ],
  };
};
