// cache-reset: 4
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Use extraNodeModules to shim web-incompatible native modules
// instead of a custom resolveRequest which can break the transform pipeline
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    'expo-notifications': path.resolve(__dirname, 'shims/empty.js'),
  },
};

module.exports = config;
