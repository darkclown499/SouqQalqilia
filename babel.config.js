module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // إذا كان لديك أي plugin خاص بالـ Web، احذفه
    ],
  };
};