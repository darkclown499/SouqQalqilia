const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-haptics': new Proxy({}, { get: () => ({ impactAsync: () => {} }) }),
  'eslint-plugin-react': new Proxy({}, { get: () => ({}) }),
  'eslint-plugin-react-hooks': new Proxy({}, { get: () => ({}) }),
  '@typescript-eslint/parser': new Proxy({}, { get: () => ({}) }),
  '@typescript-eslint/eslint-plugin': new Proxy({}, { get: () => ({}) }),
};

module.exports = config;
