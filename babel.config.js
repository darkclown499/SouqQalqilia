module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', {
        // منع تطبيق platform-guard على node_modules
        lazyImports: true,
      }],
    ],
    plugins: [
      // حذف أي إشارة إلى './platform-guard.js' هنا
    ],
    // ── فقط طبّق التحويلات على كود المصدر، وليس node_modules ──
    overrides: [
      {
        test: /\.(js|ts|tsx)$/,
        exclude: /node_modules/,
        // إذا أردت استمرار استخدام platform-guard للكود الخاص بك، ضعه هنا
        // plugins: ['./platform-guard.js'],
      },
    ],
  };
};